#!/usr/bin/env python3
"""
Lightweight Digital Signage Client Agent (Python 3)
Handles WebSocket orchestrator communication, local media caching, offline failover, and local viewer hosting.
"""

import os
import sys
import json
import time
import uuid
import socket
import urllib.request
import urllib.parse
import threading
import subprocess
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler

try:
    import websockets
    import asyncio
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False

# Paths & Directories
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
# Overridable so a main.py dropped into /etc/signage still finds the viewer shipped with the image
VIEWER_DIR = Path(os.environ.get("VIEWER_DIR", ROOT_DIR / "viewer"))
CACHE_DIR = Path(os.environ.get("CACHE_DIR", ROOT_DIR / "cache"))
MEDIA_CACHE_DIR = CACHE_DIR / "media"
CONFIG_FILE = CACHE_DIR / "config.json"
PLAYLIST_FILE = CACHE_DIR / "playlist.json"

CACHE_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_CACHE_DIR.mkdir(parents=True, exist_ok=True)
VIEWER_DIR.mkdir(parents=True, exist_ok=True)

# Configuration Management
def load_config():
    saved = {}
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                saved = json.load(f)
        except Exception:
            pass

    device_uuid = os.environ.get("DEVICE_UUID", saved.get("uuid", str(uuid.uuid4())))
    token = os.environ.get("DISPLAY_TOKEN", saved.get("token", ""))
    name = os.environ.get("CLIENT_NAME", saved.get("name", f"Signage-{socket.gethostname()}"))
    server_url = os.environ.get("SERVER_URL", saved.get("serverUrl", "ws://server:8080/ws"))
    port = int(os.environ.get("AGENT_PORT", os.environ.get("PORT", "9090")))
    orientation = os.environ.get("ORIENTATION", saved.get("orientation", "landscape"))

    cfg = {
        "uuid": device_uuid,
        "token": token,
        "name": name,
        "serverUrl": server_url,
        "httpPort": port,
        "orientation": orientation
    }
    save_config(cfg)
    return cfg

def save_config(cfg):
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        print(f"Error saving config: {e}", file=sys.stderr)

class ViewerHTTPHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Route /media/ to cache directory
        if path.startswith("/media/"):
            rel = path[len("/media/"):]
            return str(MEDIA_CACHE_DIR / rel)
        # Route /api/status to agent status
        req_path = path.lstrip("/")
        if not req_path:
            req_path = "index.html"
        return str(VIEWER_DIR / req_path)

    def end_headers(self):
        # Viewer files must be revalidated, or Chromium keeps running an old app.js after an update
        if not self.path.startswith("/media/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_POST(self):
        # Only the local viewer may post here (the port is firewalled, but be explicit)
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            self.send_error(403)
            return
        if self.path not in ("/api/agent/cast-answer", "/api/agent/cast-status"):
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            self.send_error(400)
            return
        cast = overrides.get("cast")
        if cast and body.get("castId") == cast["id"]:
            if self.path.endswith("cast-answer"):
                send_to_server({"type": "CAST_ANSWER", "castId": cast["id"], "sdp": body.get("sdp", "")})
            else:
                send_to_server({"type": "CAST_STATUS", "castId": cast["id"], "status": body.get("status", "")})
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/agent/state":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            state = {
                "config": config,
                "isOnline": is_online,
                "currentPlaylist": current_playlist,
                "pairingPIN": active_pairing_code,
                "overrides": current_overrides()
            }
            self.wfile.write(json.dumps(state).encode("utf-8"))
            return
        super().do_GET()

    def log_message(self, format, *args):
        pass # Silence verbose HTTP logs

# Global State
config = load_config()
is_online = False
current_playlist = None
active_pairing_code = ""
# Temporary commands from the server that the viewer applies on top of the playlist.
# Expiry times are epoch milliseconds so the viewer (same machine) can compare with Date.now().
overrides = {
    "push": None,        # {"url", "expiresAt"}
    "blank": False,
    "emergency": None,   # {"title", "message", "expiresAt"}
    "reloadToken": 0,    # bumped on FORCE_RELOAD; the viewer reloads when it changes
    "cast": None,        # {"id", "sdp"}: WebRTC offer from a dashboard sharing its screen
}
start_time = time.time()
active_ws_connection = None
event_loop = None  # the asyncio loop running ws_loop, so HTTP threads can send through it

def send_to_server(payload):
    """Send a message to the server from any thread."""
    ws, loop = active_ws_connection, event_loop
    if ws is None or loop is None:
        return
    asyncio.run_coroutine_threadsafe(ws.send(json.dumps(payload)), loop)

def expires_at(duration_seconds, default):
    try:
        seconds = max(1, int(duration_seconds))
    except (TypeError, ValueError):
        seconds = default
    return int((time.time() + seconds) * 1000)

def current_overrides():
    now_ms = int(time.time() * 1000)
    for key in ("push", "emergency"):
        entry = overrides.get(key)
        if entry and entry["expiresAt"] <= now_ms:
            overrides[key] = None
    return overrides

# --- Remote browser control -------------------------------------------------
# The kiosk Chromium exposes DevTools on localhost only. While someone watches
# from the dashboard, we stream its screen and replay their clicks and keys.

DEVTOOLS_PORT = int(os.environ.get("DEVTOOLS_PORT", "9222"))

# key -> (code, windowsVirtualKeyCode, text sent on keyDown)
SPECIAL_KEYS = {
    "Enter": ("Enter", 13, "\r"),
    "Backspace": ("Backspace", 8, ""),
    "Tab": ("Tab", 9, ""),
    "Escape": ("Escape", 27, ""),
    "Delete": ("Delete", 46, ""),
    "ArrowLeft": ("ArrowLeft", 37, ""),
    "ArrowUp": ("ArrowUp", 38, ""),
    "ArrowRight": ("ArrowRight", 39, ""),
    "ArrowDown": ("ArrowDown", 40, ""),
    "PageUp": ("PageUp", 33, ""),
    "PageDown": ("PageDown", 34, ""),
    "Home": ("Home", 36, ""),
    "End": ("End", 35, ""),
}

class RemoteSession:
    def __init__(self):
        self.task = None
        self.cdp = None
        self.server_ws = None
        self.msg_id = 0
        self.size = (1920, 1080)  # CSS pixels of the page, updated from each frame

    def start(self, server_ws):
        self.server_ws = server_ws
        if self.task and not self.task.done():
            self.refresh()
            return
        self.task = asyncio.create_task(self.run())

    def stop(self):
        if self.task and not self.task.done():
            self.task.cancel()
        self.task = None

    def refresh(self):
        # Screencast only emits on change; restarting it yields a frame right away
        if self.cdp:
            asyncio.create_task(self.restart_screencast())

    async def send_cdp(self, method, params=None):
        self.msg_id += 1
        await self.cdp.send(json.dumps({"id": self.msg_id, "method": method, "params": params or {}}))

    async def send_server(self, payload):
        try:
            await self.server_ws.send(json.dumps(payload))
        except Exception:
            pass

    async def start_screencast(self):
        await self.send_cdp("Page.startScreencast", {
            "format": "jpeg", "quality": 60, "maxWidth": 1280, "maxHeight": 1280, "everyNthFrame": 1,
        })

    async def restart_screencast(self):
        try:
            await self.send_cdp("Page.stopScreencast")
            await self.start_screencast()
        except Exception:
            pass

    def find_page_target(self):
        with urllib.request.urlopen(f"http://127.0.0.1:{DEVTOOLS_PORT}/json/list", timeout=3) as resp:
            targets = json.load(resp)
        pages = [t for t in targets if t.get("type") == "page"]
        # Prefer the viewer page; pushed pages and web slides are iframes inside it
        for t in pages:
            if t.get("url", "").startswith(f"http://localhost:{config['httpPort']}"):
                return t
        return pages[0] if pages else None

    async def run(self):
        try:
            target = await asyncio.get_running_loop().run_in_executor(None, self.find_page_target)
            if not target:
                raise RuntimeError("no browser page found")
            async with websockets.connect(target["webSocketDebuggerUrl"], max_size=None) as cdp:
                self.cdp = cdp
                await self.send_cdp("Page.enable")
                await self.start_screencast()
                await self.send_server({"type": "REMOTE_STATUS", "status": "live"})
                print("🖱️ Remote control session started")
                async for raw in cdp:
                    msg = json.loads(raw)
                    if msg.get("method") == "Page.screencastFrame":
                        params = msg["params"]
                        meta = params.get("metadata", {})
                        self.size = (meta.get("deviceWidth") or self.size[0], meta.get("deviceHeight") or self.size[1])
                        await self.send_server({
                            "type": "REMOTE_FRAME",
                            "data": params["data"],
                            "width": self.size[0],
                            "height": self.size[1],
                        })
                        # Ack after the frame went out, so a slow link throttles the stream instead of queueing
                        await self.send_cdp("Page.screencastFrameAck", {"sessionId": params["sessionId"]})
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"Remote control unavailable: {e}", file=sys.stderr)
            await self.send_server({"type": "REMOTE_STATUS", "status": "unavailable", "detail": str(e)})
        finally:
            self.cdp = None
            print("🖱️ Remote control session ended")

    async def handle_input(self, data):
        if not self.cdp:
            return
        kind = data.get("kind")
        try:
            x = float(data.get("x", 0)) * self.size[0]
            y = float(data.get("y", 0)) * self.size[1]
            if kind == "move":
                # Hover: menus and tooltips need the pointer to sit over them before a click
                await self.send_cdp("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
            elif kind == "click":
                base = {"x": x, "y": y, "button": "left", "clickCount": 1}
                await self.send_cdp("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
                await self.send_cdp("Input.dispatchMouseEvent", {**base, "type": "mousePressed", "buttons": 1})
                await self.send_cdp("Input.dispatchMouseEvent", {**base, "type": "mouseReleased", "buttons": 0})
            elif kind == "wheel":
                await self.send_cdp("Input.dispatchMouseEvent", {
                    "type": "mouseWheel", "x": x, "y": y, "deltaX": 0, "deltaY": float(data.get("dy", 0)),
                })
            elif kind == "text":
                text = str(data.get("text", ""))[:500]
                if text:
                    await self.send_cdp("Input.insertText", {"text": text})
            elif kind == "key":
                key = data.get("key")
                if key in SPECIAL_KEYS:
                    code, vk, text = SPECIAL_KEYS[key]
                    down = {"type": "keyDown", "key": key, "code": code, "windowsVirtualKeyCode": vk}
                    if text:
                        down["text"] = text
                    await self.send_cdp("Input.dispatchKeyEvent", down)
                    await self.send_cdp("Input.dispatchKeyEvent", {"type": "keyUp", "key": key, "code": code, "windowsVirtualKeyCode": vk})
        except Exception as e:
            print(f"Remote input failed: {e}", file=sys.stderr)

remote = RemoteSession()

def start_http_server(port):
    server = HTTPServer(("0.0.0.0", port), ViewerHTTPHandler)
    print(f"✓ Local Viewer HTTP server listening on http://0.0.0.0:{port}")
    server.serve_forever()

def download_file(remote_url, dest_path):
    if dest_path.exists() and dest_path.stat().st_size > 0:
        return True # Already cached
    try:
        req = urllib.request.Request(remote_url, headers={"User-Agent": "SignageAgent/2.0"})
        with urllib.request.urlopen(req, timeout=15) as resp, open(dest_path, "wb") as f:
            while True:
                chunk = resp.read(64 * 1024)
                if not chunk:
                    break
                f.write(chunk)
        return True
    except Exception as e:
        print(f"Failed to download {remote_url}: {e}", file=sys.stderr)
        return False

def sync_playlist_media(playlist):
    global current_playlist
    if not playlist:
        return

    items = playlist.get("items", [])
    server_http_base = get_server_http_base(config["serverUrl"])
    processed_items = []

    print(f"📥 Syncing playlist '{playlist.get('name')}' with {len(items)} items...")

    for item in items:
        cloned = dict(item)
        media_type = item.get("media_type", "webpage")
        filename = item.get("filename", "")
        url = item.get("url", "")

        if media_type in ["image", "video"] and filename:
            dest_file = MEDIA_CACHE_DIR / filename
            full_url = url if url.startswith("http") else f"{server_http_base}{url}"
            if download_file(full_url, dest_file):
                cloned["local_url"] = f"/media/{filename}"
            else:
                cloned["local_url"] = full_url

        processed_items.append(cloned)

    local_playlist = dict(playlist)
    local_playlist["items"] = processed_items
    current_playlist = local_playlist

    # Save to offline cache
    try:
        with open(PLAYLIST_FILE, "w") as f:
            json.dump(local_playlist, f, indent=2)
    except Exception as e:
        print(f"Error saving cached playlist.json: {e}", file=sys.stderr)

def load_offline_cached_playlist():
    global current_playlist
    if PLAYLIST_FILE.exists():
        try:
            with open(PLAYLIST_FILE, "r") as f:
                current_playlist = json.load(f)
                print(f"📂 Loaded offline cached playlist '{current_playlist.get('name')}' ({len(current_playlist.get('items', []))} items)")
        except Exception as e:
            print(f"Failed to read offline cache: {e}", file=sys.stderr)

def get_server_http_base(ws_url):
    parsed = urllib.parse.urlparse(ws_url)
    scheme = "https" if parsed.scheme == "wss" else "http"
    return f"{scheme}://{parsed.netloc}"

async def ws_loop():
    global is_online, active_pairing_code, active_ws_connection, event_loop
    event_loop = asyncio.get_running_loop()
    backoff = 2

    while True:
        target_url = f"{config['serverUrl']}?uuid={config['uuid']}&name={urllib.parse.quote(config['name'])}&type=display"
        if config.get("token"):
            target_url += f"&token={config['token']}"

        print(f"📡 Connecting to Orchestrator: {config['serverUrl']} (UUID: {config['uuid'][:8]}...)...")

        try:
            async with websockets.connect(target_url, ping_interval=15, ping_timeout=20) as ws:
                is_online = True
                active_ws_connection = ws
                backoff = 2
                print("✓ Connected to Server Orchestrator!")

                # Send Handshake
                handshake = {
                    "type": "HANDSHAKE",
                    "uuid": config["uuid"],
                    "token": config.get("token", ""),
                    "name": config["name"],
                    "clientVersion": "2.0.0",
                    "orientation": config.get("orientation", "landscape"),
                    "resolution": "1920x1080"
                }
                await ws.send(json.dumps(handshake))

                # Background heartbeat task
                heartbeat_task = asyncio.create_task(send_heartbeats(ws))

                # Receive messages
                async for message in ws:
                    try:
                        msg = json.loads(message)
                        await handle_ws_message(ws, msg)
                    except Exception as err:
                        print(f"Error handling message: {err}", file=sys.stderr)

                heartbeat_task.cancel()
                remote.stop()
                overrides["cast"] = None  # the stream cannot outlive the signaling link

        except Exception as e:
            is_online = False
            remote.stop()
            overrides["cast"] = None
            print(f"⚠️ Connection lost ({e}). Running in Offline Cache mode...")
            await asyncio.sleep(min(backoff, 30))
            backoff = int(backoff * 1.5)

async def send_heartbeats(ws):
    while True:
        try:
            await asyncio.sleep(15)
            uptime_sec = int(time.time() - start_time)
            hb = {
                "type": "HEARTBEAT",
                "uuid": config["uuid"],
                "uptimeSeconds": uptime_sec,
                "metrics": {
                    "uptimeSeconds": uptime_sec,
                    "platform": sys.platform
                }
            }
            await ws.send(json.dumps(hb))
        except asyncio.CancelledError:
            break
        except Exception:
            break

async def handle_ws_message(ws, msg):
    global active_pairing_code, current_playlist
    mtype = msg.get("type")

    if mtype == "HANDSHAKE_ACK":
        status = msg.get("status")
        if status == "AUTHENTICATED":
            print(f"✓ Authenticated with server. (Display #{msg.get('displayId')})")
            active_pairing_code = ""
        elif status == "UNPAIRED":
            active_pairing_code = msg.get("pairingCode", "---")
            print(f"🔒 Screen Unpaired. PIN: {active_pairing_code}")

    elif mtype == "PAIRING_APPROVED":
        config["token"] = msg.get("token", "")
        save_config(config)
        active_pairing_code = ""
        print("🎉 Pairing Approved! Token saved to disk.")

    elif mtype == "SYNC_PLAYLIST":
        pl = msg.get("playlist")
        if pl:
            sync_playlist_media(pl)
            ack = {"type": "SYNC_ACK", "uuid": config["uuid"], "playlistId": pl.get("id")}
            await ws.send(json.dumps(ack))

    elif mtype == "PUSH_URL":
        url = msg.get("url")
        dur = msg.get("durationSeconds", 30)
        print(f"🌐 Live URL Push: {url} ({dur}s)")
        if url:
            overrides["push"] = {"url": url, "expiresAt": expires_at(dur, 30)}

    elif mtype == "FORCE_RELOAD":
        print("🔄 Force Reload Command received")
        overrides["reloadToken"] += 1

    elif mtype == "BLANK_SCREEN":
        state = bool(msg.get("state", False))
        print(f"🖥️ Blank Screen: {state}")
        overrides["blank"] = state

    elif mtype == "CAST_OFFER":
        print("📺 Screen sharing offer received")
        overrides["cast"] = {"id": msg.get("castId"), "sdp": msg.get("sdp", "")}

    elif mtype == "CAST_STOP":
        print("📺 Screen sharing stopped")
        overrides["cast"] = None

    elif mtype == "REMOTE_START":
        remote.start(ws)

    elif mtype == "REMOTE_REFRESH":
        remote.refresh()

    elif mtype == "REMOTE_STOP":
        remote.stop()

    elif mtype == "REMOTE_INPUT":
        await remote.handle_input(msg.get("input") or {})

    elif mtype == "EMERGENCY_ALERT":
        print(f"🚨 EMERGENCY ALERT: {msg.get('title')} - {msg.get('message')}")
        overrides["emergency"] = {
            "title": msg.get("title") or "Emergency",
            "message": msg.get("message") or "",
            "expiresAt": expires_at(msg.get("durationSeconds"), 60),
        }

def main():
    print("==========================================================")
    print(" 🚀 Digital Signage Client Node Agent v2.0")
    print(f" Device UUID:  {config['uuid']}")
    print(f" Server URL:   {config['serverUrl']}")
    print(f" Local Port:   {config['httpPort']}")
    print("==========================================================")

    # 1. Load cached playlist from disk for instant startup
    load_offline_cached_playlist()

    # 2. Start local HTTP server thread
    http_thread = threading.Thread(target=start_http_server, args=(config["httpPort"],), daemon=True)
    http_thread.start()

    # 3. Start async WebSocket loop
    if HAS_WEBSOCKETS:
        try:
            asyncio.run(ws_loop())
        except KeyboardInterrupt:
            print("\nShutting down Client Agent.")
    else:
        print("⚠️ websockets module not installed, running in HTTP-only offline mode.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

if __name__ == "__main__":
    main()
