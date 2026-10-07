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
VIEWER_DIR = ROOT_DIR / "viewer"
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
                "pairingPIN": active_pairing_code
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
start_time = time.time()
active_ws_connection = None

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
    global is_online, active_pairing_code, active_ws_connection
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

        except Exception as e:
            is_online = False
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

    elif mtype == "FORCE_RELOAD":
        print("🔄 Force Reload Command received")

    elif mtype == "BLANK_SCREEN":
        state = msg.get("state", False)
        print(f"🖥️ Blank Screen: {state}")

    elif mtype == "EMERGENCY_ALERT":
        print(f"🚨 EMERGENCY ALERT: {msg.get('title')} - {msg.get('message')}")

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
