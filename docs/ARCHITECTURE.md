# System Architecture: Lightweight Remote Digital Signage & Display Orchestrator

## 1. Overview
The system provides an enterprise-grade, low-overhead containerized client-server digital signage platform designed for Linux devices (x86_64 and ARM64, including Raspberry Pi 4/5, Intel NUC, and custom signage appliances).

```
+-------------------------------------------------------------------------+
|                         Web Control Dashboard                           |
|      (React 19 + Tailwind CSS + Lucide Icons + Live WebSocket Hub)      |
+------------------------------------+------------------------------------+
                                     | REST API & WS
                                     v
+-------------------------------------------------------------------------+
|                  Server Orchestrator (Port: 8080)                       |
|  - Node.js Express REST API                                             |
|  - Bidirectional WebSocket Engine (ws)                                  |
|  - SQLite 3 (WAL Mode + node:sqlite engine)                             |
|  - Scheduler Service (Time-of-day & Day-of-week Rules)                   |
|  - Static Media & HLS/MP4 Range Streaming Server                        |
+------------------+-----------------------------------+------------------+
                   |                                   |
                   | WebSocket & HTTP                  | WebSocket & HTTP
                   v                                   v
+----------------------------------+ +----------------------------------+
|   Display Node 1 (Raspberry Pi)  | |      Display Node 2 (Kiosk)      |
|  +----------------------------+  | |  +----------------------------+  |
|  | Agent Daemon (Node/Python) |  | |  | Agent Daemon (Node/Python) |  |
|  | - Local Cache Sync Engine  |  | |  | - Local Cache Sync Engine  |  |
|  | - Offline Failover Loop    |  | |  | - Offline Failover Loop    |  |
|  | - Local HTTP/WS (Port 9090)|  | |  | - Local HTTP/WS (Port 9090)|  |
|  +--------------+-------------+  | |  +--------------+-------------+  |
|                 |                | |                 |                |
|  +--------------v-------------+  | |  +--------------v-------------+  |
|  | HTML5 / GPU Kiosk Player   |  | |  | HTML5 / GPU Kiosk Player   |  |
|  | (Chromium / Cage / X11)    |  | |  | (Chromium / Cage / X11)    |  |
|  +----------------------------+  | |  +----------------------------+  |
+----------------------------------+ +----------------------------------+
```

---

## 2. Core Server Components
1. **Express & WebSocket Hub (`src/server.js`, `src/ws/websocketServer.js`)**:
   - Manages client display connections with heartbeat monitoring.
   - Dispatches real-time broadcast and targeted commands (*Force Reload*, *Blank Screen*, *Live URL Push*, *Emergency Alert*).
   - Manages automatic device provisioning with 6-character alphanumeric pairing PINs.
2. **Database Layer (`src/db/database.js`)**:
   - Uses Node.js native `node:sqlite` in WAL (Write-Ahead Logging) mode.
   - Zero compilation overhead (`node-gyp` not needed).
   - High concurrency and low memory footprint (~35MB RAM).
3. **Scheduler Engine (`src/services/schedulerService.js`)**:
   - Resolves active playlists using a 4-tier hierarchy:
     1. High-priority time-of-day / day-of-week active schedules.
     2. Display direct playlist assignment.
     3. Display group default playlist.
     4. System default demo loop.

---

## 3. Client Display Architecture
1. **Agent Daemon (`client/agent/agent.js` / `agent.py`)**:
   - Main persistent link to the Orchestrator over WebSocket.
   - Syncs active playlist: downloads images/videos to `/cache/media/`, checks file integrity, and prunes stale assets.
   - Serves the local player and cached assets on `http://127.0.0.1:9090`.
   - Sends telemetry heartbeats every 10s (CPU load, RAM used, uptime, current slide).
2. **Kiosk Player (`client/player/`)**:
   - Hardware-accelerated HTML5 double-buffered animation engine.
   - Supports Images (JPEG, PNG, WebP, GIF), HTML5 Video (MP4, WebM with autoplay & seamless loop), Sandboxed Web Dashboards (Grafana, live URLs), and Custom HTML/CSS snippets.
   - Smooth CSS transitions (`fade`, `slide-left`, `zoom`, `instant`).
   - Built-in Emergency Alert and Live URL Push overlays.
3. **Display Server Wrapper (`client/scripts/`)**:
   - Works on X11 (`start-kiosk.sh`, `x11-entrypoint.sh`) and Wayland/Cage (`cage-entrypoint.sh`).
   - Hides mouse cursor (`unclutter`), disables DPMS screen blanking, and launches Chromium in fullscreen kiosk mode.
