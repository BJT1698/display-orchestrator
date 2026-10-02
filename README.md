# 🚀 Lightweight Digital Signage Orchestrator & Custom NixOS Appliance

[![CI: Build NixOS ISO](https://github.com/org/display-orchestrator/actions/workflows/build-iso.yml/badge.svg)](.github/workflows/build-iso.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Platform: Linux / NixOS / Docker](https://img.shields.io/badge/Platform-Linux%20|%20NixOS%20|%20Docker-blue.svg)](nixos/)
[![Backend: Go](https://img.shields.io/badge/Backend-Go%201.22%20|%20SQLite%20WAL-purple.svg)](server/)

A high-performance, low-footprint client-server digital signage platform with a custom NixOS Kiosk appliance, automatic TUI installer, and real-time WebSocket orchestration.

---

## 🏗️ Repository Architecture

```
├── .github/
│   └── workflows/
│       └── build-iso.yml          # GitHub Actions CI/CD to build & release NixOS Installer ISO
├── client/
│   ├── Dockerfile.dev             # Development client (Windowed 1280x720 + DevTools 9222)
│   ├── Dockerfile.prod            # Production kiosk appliance container (fullscreen)
│   ├── agent/                     # Local daemon: WebSocket link, caching & offline loop
│   │   ├── main.py                # Python 3 client daemon
│   │   └── requirements.txt       # websockets>=12.0
│   └── viewer/                    # Fullscreen HTML5/CSS3 presentation engine
│       ├── index.html
│       ├── app.js
│       └── style.css
├── server/
│   ├── Dockerfile                 # Multi-stage static Go binary build
│   ├── Dockerfile.dev             # Live development server
│   ├── go.mod                     # Go module definition
│   ├── cmd/server/main.go         # Server entrypoint
│   ├── internal/
│   │   ├── api/                   # REST API handlers
│   │   ├── ws/                    # WebSocket Hub & Ping/Pong manager
│   │   ├── storage/               # SQLite WAL database & migration engine
│   │   └── models/                # Data structures & schemas
│   └── web/                       # Web Control Dashboard UI
│       ├── index.html
│       ├── app.js
│       └── style.css
├── nixos/                         # NixOS Flake & Appliance Modules
│   ├── flake.nix                  # Flake with installer-iso and target-system outputs
│   ├── flake.lock
│   ├── modules/
│   │   ├── client-appliance.nix   # Cage Wayland compositor & kiosk service
│   │   ├── first-boot-wizard.nix  # First-boot TUI setup wizard for server IP association
│   │   └── installer-script.nix   # Live ISO automated TUI disk partitioner & installer
│   └── hosts/
│       ├── installer-iso/default.nix
│       └── target-system/default.nix
├── scripts/
│   ├── dev-up.sh                  # Single-host local development launcher (with X11 trap)
│   └── run-tests.sh               # Automated E2E verification test suite
├── docker-compose.yml             # Production multi-container compose
├── docker-compose.dev.yml         # Single-host development compose
└── README.md
```

---

## ⚡ 1. Server Orchestrator (Go & SQLite WAL)

- **Static Binary Footprint**: Blazing fast startup with minimal RAM consumption (~30MB).
- **SQLite in WAL Mode**: High concurrency embedded database located in `/data/signage.db`.
- **REST Endpoints**:
  - `GET /api/health`: Health status.
  - `GET /api/displays`: List displays, online status, telemetry, assigned playlists.
  - `POST /api/displays/register`: Client registration handshake.
  - `POST /api/displays/:id/command` / `POST /api/displays/:id/push`: Real-time commands (`NAVIGATE`, `FORCE_RELOAD`, `BLANK`, `SET_PLAYLIST`).
  - `POST /api/displays/pairing/approve`: Approve 6-character pairing PIN.
  - `POST /api/media` & `GET /api/media/:filename`: File upload (JPG, PNG, WebP, MP4) with static streaming.
  - `GET /api/playlists` & `POST /api/playlists`: Sequence builder with per-slide duration and transitions.
- **WebSocket Protocol (`/ws`)**:
  - Heartbeat & ping-pong every 15 seconds.
  - Automatic display provisioning and instant command dispatch.

---

## 🖥️ 2. Client Signage & Runtime

- **Viewer Engine (`client/viewer/`)**: GPU-accelerated double-buffered HTML5 presentation layer with smooth transitions (`fade`, `slide-left`, `zoom`).
- **Agent Daemon (`client/agent/main.py`)**:
  - Connects to Orchestrator over WebSocket.
  - **Local Media Cache**: Downloads and verifies all assets to `/cache/media/` before playback.
  - **Offline Resilience**: If the network drops, continues cycling the local cached playlist from disk (`/cache/playlist.json`) without blank screens or errors.
  - Serves local viewer on `http://127.0.0.1:9090`.

---

## 🛠️ 3. Single-Host Local Development & Testing

Run both the server and a windowed display client on your current Linux desktop:

```bash
# Start development environment
./scripts/dev-up.sh
```

- **Web Dashboard**: `http://localhost:8080`
- **Windowed Display Screen**: `http://localhost:9090` (Opens floating 1280x720 window on desktop)
- **Chrome Remote DevTools**: `chrome://inspect` on `localhost:9222`
- **Run Automated E2E Test Suite**:
  ```bash
  ./scripts/run-tests.sh
  ```

---

## 💿 4. Custom NixOS Client Appliance (ISO & Flake)

### A. Live Installer ISO
1. Build the ISO locally:
   ```bash
   cd nixos
   nix build .#nixosConfigurations.installer-iso.config.system.build.isoImage -L
   ```
2. Flash to a USB drive:
   ```bash
   sudo dd if=result/iso/signage-nixos-installer.iso of=/dev/sdX bs=4M status=progress
   ```
3. Boot target hardware &bull; The automated TUI installer launches on TTY1:
   - Scans and lists available disks (`whiptail`).
   - Prompts operator to select target disk.
   - Formats GPT, 512MB EFI (`vfat`), Root (`ext4`).
   - Deploys the NixOS client appliance image and reboots.

### B. First-Boot Provisioning Wizard
Upon initial boot, `signage-first-boot.service` starts a TUI prompt:
- Asks for Server Orchestrator IP/Hostname (e.g. `192.168.1.100:8080`).
- Validates connectivity against `http://$IP/api/health`.
- Writes `/etc/signage/client.env`.
- Launches the **Cage Wayland** compositor running Chromium in fullscreen kiosk mode.

### C. GitHub Actions CI/CD Workflow (`.github/workflows/build-iso.yml`)
- Automated ISO compilation on GitHub Actions runners using `cachix/install-nix-action`.
- Validates Flake with `nix flake check`.
- Publishes `.iso` and `.sha256` checksums automatically as GitHub Release assets upon tag push (`git tag v1.0.0 && git push origin v1.0.0`).

---

## 📄 License
MIT © 2026 Digital Signage Orchestrator Team
