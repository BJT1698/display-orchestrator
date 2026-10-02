#!/usr/bin/env python3
"""
Lightweight Remote Digital Signage Display Agent (Python 3)
Supports automatic pairing, WebSocket orchestrator link, offline media caching, and local HTTP server.
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
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

# Directories
BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = Path(os.environ.get("CACHE_DIR", BASE_DIR.parent / "cache"))
MEDIA_CACHE_DIR = CACHE_DIR / "media"
PLAYER_DIR = BASE_DIR.parent / "player"
CONFIG_FILE = CACHE_DIR / "config.json"
PLAYLIST_CACHE_FILE = CACHE_DIR / "playlist.json"

CACHE_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Config
def load_config():
    saved = {}
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                saved = json.load(f)
        except Exception:
            pass

    device_uuid = os.environ.get("DEVICE_UUID", saved.get("uuid", str(uuid.uuid4())))
    token = os.environ.get("DISPLAY_TOKEN", saved.get("token", None))
    name = os.environ.get("CLIENT_NAME", saved.get("name", f"Display-{socket.gethostname()}"))
    server_url = os.environ.get("SERVER_URL", saved.get("serverUrl", "ws://localhost:8080/ws"))
    port = int(os.environ.get("AGENT_PORT", os.environ.get("PORT", "9090")))

    cfg = {"uuid": device_uuid, "token": token, "name": name, "serverUrl": server_url, "httpPort": port}
    save_config(cfg)
    return cfg

def save_config(cfg):
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        print(f"Error saving config: {e}")

class PlayerHttpHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Route /media/ to cache directory
        if path.startswith("/media/"):
            rel = path[len("/media/"):]
            return str(MEDIA_CACHE_DIR / rel)
        # Route everything else to player directory
        req_path = path.lstrip("/")
        if not req_path:
            req_path = "index.html"
        return str(PLAYER_DIR / req_path)

    def log_message(self, format, *args):
        # Silence standard HTTP logs for clean output
        pass

def start_http_server(port):
    server = HTTPServer(("0.0.0.0", port), PlayerHttpHandler)
    print(f"🚀 Python Display Server running on http://localhost:{port}")
    server.serve_forever()

def main():
    cfg = load_config()
    print("========================================================")
    print(" Display Orchestrator Client Agent (Python)")
    print(f" Device UUID: {cfg['uuid']}")
    print(f" Orchestrator URL: {cfg['serverUrl']}")
    print(f" Local Port: {cfg['httpPort']}")
    print("========================================================")

    # Start HTTP server thread
    http_thread = threading.Thread(target=start_http_server, args=(cfg["httpPort"],), daemon=True)
    http_thread.start()

    print("✓ Display agent ready. To launch kiosk mode run: bash scripts/start-kiosk.sh")
    
    # Keep main alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down Python client agent.")

if __name__ == "__main__":
    main()
