# REST API & WebSocket Protocol Reference

## 1. REST API Endpoints

### Displays & Pairing
- `GET /api/displays`: List all displays with group and playlist info.
- `GET /api/displays/:id`: Get single display details and hardware telemetry.
- `PUT /api/displays/:id`: Update display name, group, orientation (`landscape` / `portrait`), or assigned playlist.
- `DELETE /api/displays/:id`: Delete a display node.
- `POST /api/displays/:id/command`: Send an immediate command to a display:
  ```json
  {
    "action": "push_url",
    "payload": { "url": "https://grafana.internal/d/123", "durationSeconds": 30 }
  }
  ```
  Supported actions: `push_url`, `reload`, `blank`, `reboot`, `screenshot`, `sync`, `assign_playlist`.
- `GET /api/displays/pairing/pending`: List displays currently showing pairing PINs.
- `POST /api/displays/pairing/approve`: Approve a pairing code:
  ```json
  { "pairingCode": "K9F-2A7", "name": "Main Entrance", "groupId": 1 }
  ```
- `POST /api/displays/broadcast/emergency`: Fullscreen emergency alert to all screens:
  ```json
  { "title": "FIRE ALARM", "message": "Evacuate building immediately", "durationSeconds": 120 }
  ```

### Media Library
- `GET /api/media`: List all uploaded and created media assets.
- `POST /api/media/upload`: Multipart upload for images/videos (`file`, `durationSeconds`).
- `POST /api/media/url`: Add external web page asset (`name`, `url`, `durationSeconds`).
- `POST /api/media/html`: Add custom HTML snippet (`name`, `content`, `durationSeconds`).
- `DELETE /api/media/:id`: Delete asset and clean up disk storage.
- `GET /api/media/stats/storage`: Total files count and formatted byte size.

### Playlists
- `GET /api/playlists`: List all playlists with item count and total loop duration.
- `GET /api/playlists/:id`: Get playlist with fully hydrated items and media URLs.
- `POST /api/playlists`: Create new playlist (`name`, `description`, `loopEnabled`, `transitionEffect`).
- `PUT /api/playlists/:id`: Update playlist metadata.
- `DELETE /api/playlists/:id`: Delete playlist.
- `POST /api/playlists/:id/items`: Append media or URL to playlist.
- `PUT /api/playlists/:id/items/:itemId`: Update item duration, transition, or scheduling filter.
- `DELETE /api/playlists/:id/items/:itemId`: Delete item from playlist.
- `PUT /api/playlists/:id/reorder`: Reorder items array (`{ "itemIds": [3, 1, 2] }`).
- `POST /api/playlists/:id/duplicate`: Duplicate playlist.

### Schedules
- `GET /api/schedules`: List all time/day schedule rules.
- `POST /api/schedules`: Create new rule (`targetType`, `targetId`, `playlistId`, `startTime`, `endTime`, `daysOfWeek`, `priority`).
- `DELETE /api/schedules/:id`: Delete rule.

---

## 2. WebSocket Protocol (`/ws`)

### A. Display Node Handshake & Pairing Flow
```
Display Client                              Server Orchestrator
      |                                              |
      | ------ HANDSHAKE (uuid, token, name) ------> |
      |                                              |
   [Unpaired]                                     [Check Token]
      | <----- HANDSHAKE_ACK (UNPAIRED, PIN) ------- |
      |                                              |
[Shows PIN on Screen]                                |
      |                                        [Admin Approves PIN]
      | <----- PAIRING_APPROVED (token) ------------ |
      |                                              |
[Saves Token to Disk]                                |
      | <----- SYNC_PLAYLIST (items, urls) --------- |
      |                                              |
[Downloads Media Assets]                             |
      | ------ SYNC_ACK (cachedCount) -------------> |
      |                                              |
[Loops Playlist]                                     |
      | ------ HEARTBEAT (cpu, ram, uptime) -------> | (Every 10s)
```

### B. Real-time Commands
- **`PUSH_URL`**: `{ "type": "PUSH_URL", "url": "...", "durationSeconds": 30 }`
- **`BLANK_SCREEN`**: `{ "type": "BLANK_SCREEN", "state": true }`
- **`FORCE_RELOAD`**: `{ "type": "FORCE_RELOAD" }`
- **`EMERGENCY_ALERT`**: `{ "type": "EMERGENCY_ALERT", "title": "...", "message": "...", "durationSeconds": 60 }`
- **`SET_ORIENTATION`**: `{ "type": "SET_ORIENTATION", "orientation": "portrait" }`
