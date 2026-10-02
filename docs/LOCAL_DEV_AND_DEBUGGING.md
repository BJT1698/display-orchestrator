# Local Testing & Debugging Guide (Single-Host Development)

This guide explains how to run, inspect, and test both the **Server Orchestrator** and one or more **Client Display Nodes** on the same Linux development PC without requiring extra hardware or dedicated screens.

---

## 1. Quick Start

### Start Full Development Stack
Run the automated startup script:
```bash
./dev-up.sh
```

This will:
1. Automatically configure X11 host permissions (`xhost +local:root`).
2. Build and launch:
   - **`server`**: Backend API & WebSocket Hub on port `8080` (with live code reload).
   - **`client-dev`**: Primary Display Client in a **floating window (1280x720)** with Chrome DevTools enabled on port `9222`.
   - **`client-simulated`**: Secondary Headless Node (Xvfb) on port `9091` for multi-display testing.
3. Keep logs active in your terminal. Press `Ctrl+C` to stop all containers and safely restore X11 permissions.

### Alternative Startup Modes
```bash
# Start server & web dashboard only
./dev-up.sh --server-only

# Start server + single windowed display client
./dev-up.sh --single-client

# Start all clients in headless mode (no window popups)
./dev-up.sh --headless
```

---

## 2. Port Map & Access Endpoints

| Service | Port | Endpoint | Purpose |
| :--- | :--- | :--- | :--- |
| **Web Control Dashboard** | `8080` | `http://localhost:8080` | Admin dashboard, playlist builder & live monitoring |
| **Server WebSocket** | `8080` | `ws://localhost:8080/ws` | Real-time signaling hub |
| **Primary Client Player** | `9090` | `http://localhost:9090` | Local Kiosk HTML5 player endpoint |
| **Chrome DevTools** | `9222` | `http://localhost:9222` | Remote Chromium inspector (`chrome://inspect`) |
| **Simulated Client 2** | `9091` | `http://localhost:9091` | Secondary simulated display node |

---

## 3. Chrome Remote Debugging (`chrome://inspect`)

The primary dev client runs Chromium with `--remote-debugging-port=9222`.

To inspect DOM elements, watch network calls, debug CSS transition animations, or view JavaScript console logs:
1. Open Google Chrome, Brave, or Chromium on your host PC.
2. In the URL bar, go to:
   ```
   chrome://inspect
   ```
3. Under **Devices &rarr; Discover network targets**, verify that `localhost:9222` is listed. (If not, click *Configure...* and add `localhost:9222`).
4. Click **Inspect** under **Target (Display Kiosk Player)**.
5. A full Chrome DevTools window will open, allowing breakpoint debugging and live DOM editing of the kiosk screen.

---

## 4. Developer Test Harness CLI (`scripts/dev-tools.sh`)

Use the included helper CLI to test events and API calls without manual curl writing:

```bash
# Check server telemetry, displays, and pending pairing PINs
./scripts/dev-tools.sh status

# Approve a new pending display pairing PIN
./scripts/dev-tools.sh pair

# Push a live URL to Display #1 for 20 seconds
./scripts/dev-tools.sh push-url https://en.wikipedia.org/wiki/Portal:Current_events 20

# Force reload the display player
./scripts/dev-tools.sh reload

# Blank the display screen (blackout)
./scripts/dev-tools.sh blank on

# Broadcast emergency evacuation alert across all screens
./scripts/dev-tools.sh emergency "Building Maintenance Drill in progress."

# View DevTools target list
./scripts/dev-tools.sh inspect
```

---

## 5. Testing Offline Cache & Failover in Real-Time

To verify that the display player continues running without interruption when the network cable is unplugged:

1. **Disconnect client from docker network**:
   ```bash
   ./scripts/dev-tools.sh sim-disconnect
   ```
   *Notice*: The player window continues smoothly looping all images and videos from `/cache/media/`. The status badge changes to amber *(Offline Mode)* with zero stutter.

2. **Reconnect client to network**:
   ```bash
   ./scripts/dev-tools.sh sim-reconnect
   ```
   *Notice*: The client automatically re-authenticates over WebSocket, syncs any playlist changes, and updates its telemetry without requiring a browser reload.

---

## 6. Live Code Editing & Hot Reloading

- **Backend (`server/src/`)**: Mounted as a live volume into the server container. Modifying backend JavaScript files automatically restarts the server (`node --watch`).
- **Client Player (`client/player/`)**: Mounted live into the client container. Edits to `player.js`, `player.css`, or `index.html` take effect immediately upon next slide or reload (`./scripts/dev-tools.sh reload`).
- **Client Agent (`client/agent/`)**: Mounted live into the client container.
