# Display Orchestrator

Self-hosted digital signage: a Node server with a web dashboard, and NixOS kiosk appliances
(PCs or laptops) that play playlists and can be controlled live. Deployment-specific notes
(hosts, IPs, access) live in `CLAUDE.local.md`, which is not committed: this repo is public.

## What actually runs

The README is partly outdated: it describes a Go backend. **The live server is Node**.

| Part | Path | Notes |
|---|---|---|
| Server | `server/src/` | Express + `ws` + `node:sqlite` (Node >= 22.13). Entry `server.js`, WS hub `ws/websocketServer.js`, schedules `services/schedulerService.js`, seed data `db/database.js` |
| Dashboard | `frontend/` | React 19 + Vite + Tailwind 3. `npm run build` writes to `server/public/`, **which is committed** |
| Display agent | `client/agent/main.py` | Python 3 + `websockets`. WS link to the server, media cache, local HTTP on :9090 serving the viewer and `/api/agent/state` |
| Display viewer | `client/viewer/` | Plain HTML/JS shown full screen by kiosk Chromium; polls the agent every second |
| Appliance image | `nixos/` | Flake on `nixos-26.05`: installer ISO + installed system (`target-system`) |
| Content | `content/` | Reusable HTML snippets for the media library (e.g. `orologio-notturno.html`) |

Dead code, do not build on it: `server/cmd`, `server/internal`, `server/go.mod` (Go, no `go.sum`,
does not compile), `server/web`, `client/player`, `server/Dockerfile*`, root `docker-compose.yml`.
The working container path is `deploy/Dockerfile.server`.

**`nixos/client/` is a copy of `client/`** used by the image. After changing the agent or the
viewer, sync it: `rsync -a --delete client/viewer/ nixos/client/viewer/ && cp client/agent/main.py nixos/client/agent/main.py`.

## Authentication

- Local accounts, roles `admin` and `operator` (`server/src/auth/auth.js`, routes `auth.js` and
  `users.js`). scrypt hashes; session cookie `sc_session` (HttpOnly, SameSite=Lax, Secure over
  HTTPS), only its SHA-256 in the `sessions` table, one-week sliding expiry.
- Everything under `/api` needs a session except `/api/health` and `/api/auth/*`; `/media` and the
  display WebSocket stay open for screens. The dashboard WebSocket is closed with code 4401
  without a session; the dashboard then shows the sign-in screen.
- Admin only: users, pairing approve/reject, removing displays, clearing the log. At least one
  active administrator is enforced.
- First run (no users): the server prints a setup code in its log and writes
  `DATA_DIR/setup-code.txt`; the dashboard asks for it to create the first administrator.
- Lost all admin passwords: stop the server, delete the rows in `users` (sessions cascade),
  restart, and use the new setup code.

## How the pieces talk

- Display ↔ server: WebSocket `/ws?type=display&uuid=…`. Handshake → `AUTHENTICATED` or `UNPAIRED`
  with a pairing code (`ABC-DEF`, approval accepts it without dash or lower case).
- Dashboard ↔ server: WebSocket `/ws?type=dashboard`; REST under `/api`.
- Server → display commands (`PUSH_URL`, `BLANK_SCREEN`, `FORCE_RELOAD`, `EMERGENCY_ALERT`) become
  **overrides with expiry** in the agent, exposed in `/api/agent/state`; the viewer applies them.
  Stacking: playback < standby < pushed page < shared screen < pairing < blank < emergency.
- **Remote control**: agent drives the kiosk Chromium over DevTools on `localhost:9222` (screencast
  + `Input.dispatch*`); server relays `REMOTE_START/STOP/INPUT/REFRESH` and `REMOTE_FRAME/STATUS`.
  Runs only while a dashboard watches; input only from a dashboard in the session.
- **Screen sharing**: WebRTC peer to peer on the LAN. Server relays `CAST_OFFER/ANSWER/STATUS/STOP`;
  the viewer answers through a localhost-only `POST /api/agent/cast-answer`. One complete SDP each
  way, no trickle. Needs the dashboard on **HTTPS** (`getDisplayMedia`), and on the display the
  Chromium policy + firewall range UDP 50000-50100 from `nixos/modules/client-appliance.nix`.
- **Orientation** is owned by the server (`landscape`, `portrait`, `landscape-flipped`,
  `portrait-flipped`). The agent applies it as a compositor transform with `wlr-randr` (Cage
  supports wlr-output-management) and re-checks every 5 s; the handshake must not overwrite it.
- Playlist choice (`schedulerService.resolvePlaylistChoice`): **night and weekend mode** (setting
  `after_hours` in the `settings` table, `GET/PUT /api/system/after-hours`: outside the working days
  and hours every screen plays one playlist) > schedules > assigned playlist > group default >
  first playlist. Overrides on the agent (pushed page, cast, blank, emergency) still go on top.
- Schedules are evaluated in the server's local time zone; overnight ranges (19:00-08:00) work,
  but days are checked against the current day. The WS hub re-checks every display every 30 s
  (`startScheduleTick`) and syncs only those whose answer changed; dashboards get
  `DISPLAY_NOW_PLAYING` (`now_playing_name`, `now_playing_reason`).

## NixOS image

- `hosts/target-system`: SSH key-only (`nixos/ssh/authorized_keys`), root password locked,
  `users.mutableUsers = false`, `time.timeZone = "Europe/Rome"`, vendor firmware on.
- `modules/client-appliance.nix`: Cage + Chromium kiosk (`--no-sandbox` kept on purpose), DevTools
  on localhost only, WebRTC policy/firewall, `getty@tty1` disabled, `cage-tty1` auto-restart.
- `modules/laptop.nix`: lid ignored, sleep targets disabled, Cage `-m last`, udev rule that forces
  the built-in panel off while an external display is connected.
- `modules/first-boot-wizard.nix` + `wifi-setup-script.nix`: whiptail wizard (Wi-Fi if offline,
  server address, name) writing `/etc/signage/client.env`. Installer offers Wi-Fi too and copies
  the NetworkManager profiles into the installed system.
- The agent can be overridden by `/etc/signage/main.py`; `VIEWER_DIR` points to the viewer.
- `modules/updates.nix`: remote updates. The agent (kiosk user) writes a release tag to
  `/var/lib/signage-update/inbox/request`; a root path unit runs `nixos-rebuild switch --flake
  github:BJT1698/display-orchestrator/<tag>?dir=nixos#target-system` and writes `status.json`
  next to it (root-owned dir). The server only allows the latest GitHub release.

## Widgets

`frontend/src/widgets/`: announcement, weather (Open-Meteo, fetched by the screen every 15 min,
last answer kept in localStorage), clock, countdown, QR (SVG drawn at authoring time). Each widget
renders a self-contained HTML snippet saved as an ordinary `html_snippet` media; its settings ride
in a leading `<!-- signage-widget:<base64 JSON> -->` comment so the dashboard can reopen it.
Announcement pictures are embedded once (data URL in the page, a placeholder in the settings).
Screen text is Italian; sizes in vmin. Editing a media re-syncs all displays, and the agent's
playlist `revision` hash makes the viewer restart playback when any item changed.

## Design (dashboard and screens)

Broadcast control room: graphite ground, **color only for state** (tally: on air `#3FB37F`,
waiting `#D9A441`, emergency `#E5484D`), monochrome primary buttons, no blur, glow or shadows.
Typeface Archivo (variable, self-hosted: `@fontsource-variable/archivo` in the dashboard,
`client/viewer/fonts` on screens), condensed cut for headings and figures, tabular numbers.
Tokens in `frontend/tailwind.config.js`; shared pieces in `frontend/src/components/ui.jsx`;
component classes (`btn`, `control`, `panel`, `data-table`, `segmented`, `tally`) in
`frontend/src/index.css`. UI copy is English, sentence case, plain verbs.

## Workflow

- Branch → PR to `main` → CI (`.github/workflows/build-iso.yml`) must be green → merge → tag
  `vX.Y.Z` → the tag build publishes the ISO as a GitHub Release. **`nixos/VERSION` must say
  `X.Y.Z` before tagging** (bump it in the PR); the tag build fails otherwise. Download with
  `gh release download vX.Y.Z -D dist/vX.Y.Z` and check the `.sha256`. `dist/` is ignored.
- `nixos/flake.lock` pins nixpkgs for CI, the ISO and remote updates; bump it on purpose only.
- CI builds both `target-system` (what the installer builds on the device) and the ISO; Nix is
  not installed locally, so CI is the only build check for `nixos/`.
- PRs only get CI when based on `main`; for stacked branches use `gh workflow run build-iso.yml --ref <branch>`.
  Deleting a merged base branch closes PRs stacked on it.
- Rebuild the dashboard (`cd frontend && npm run build`) before committing frontend changes.
- Commits end with the Co-Authored-By line; PR bodies with the Claude Code line.

## Testing without hardware

A full stack runs locally: server (`PORT=8092 DATA_DIR=… MEDIA_DIR=… node src/server.js`), agent
(`CACHE_DIR=… SERVER_URL=ws://127.0.0.1:8092/ws AGENT_PORT=9192 DEVTOOLS_PORT=9555 python3 -u main.py`)
and a headless kiosk (`chromium --headless=new --autoplay-policy=no-user-gesture-required
--remote-debugging-port=9555 http://localhost:9192/`). Drive the dashboard and read results through
the Chrome DevTools Protocol. For screen sharing in headless tests, replace
`navigator.mediaDevices.getDisplayMedia` with a canvas `captureStream()`.
`server/test-e2e.js` writes into the repo's `data/`; do not run it against real data.

## Known pitfalls (all hit for real)

- `python3 -I` ignores `PYTHONUNBUFFERED`; use `-u` to see agent logs.
- Chromium kept a stale `app.js` until the agent sent `Cache-Control: no-cache`.
- HTML snippets inserted with `innerHTML` do not run scripts; the viewer uses `srcdoc` iframes.
- When the only display output disappears, Chromium crashes; the kiosk restarts itself now.
- After `nixos-rebuild switch` on a running laptop, firmware for an already-probed device needs a
  driver reload (`modprobe -r iwlmvm iwlwifi && modprobe iwlwifi`).
- SiteGround-hosted sites answer 403 to old Chrome versions: keep nixpkgs current.
- `pkill -f <pattern>` over SSH can match and kill the SSH command itself.

## Open items

- Verify on real hardware: HDMI unplug/replug and lid-closed boot (`modules/laptop.nix`), Wi-Fi-only
  install. Booting with HDMI attached already shows only the external screen.
- Wi-Fi can only be changed after first boot over SSH (`nmcli`).
- README still documents the Go backend.
