# Offline Resilience & Local Caching Strategy

## 1. The Offline Problem
Digital signage screens must never show black screens, browser 404 errors, or broken image icons when Wi-Fi drops, cables are unplugged, or the orchestrator server restarts.

## 2. Our 3-Layer Resilience Architecture

```
+-------------------------------------------------------------+
|                 Server Online                               |
|                 - Pushes Playlist Sync                      |
|                 - Streams Files to /cache/media/            |
|                 - Writes /cache/playlist.json metadata      |
+------------------------------+------------------------------+
                               |
                   [ Network Disconnection ]
                               |
+------------------------------v------------------------------+
|                 Layer 1: Offline Loop                       |
|  - Agent detects WebSocket drop                             |
|  - Player continues looping local assets from /cache/       |
|  - Zero stutter or visual interruption                      |
+------------------------------+------------------------------+
                               |
+------------------------------v------------------------------+
|                 Layer 2: Reboot in Offline State            |
|  - If device loses power and boots with NO network:         |
|  - Agent loads /cache/playlist.json from disk               |
|  - Local HTTP server serves cached images/videos            |
|  - Playback starts immediately                              |
+------------------------------+------------------------------+
                               |
+------------------------------v------------------------------+
|                 Layer 3: Seamless Re-Sync                   |
|  - Agent attempts reconnection with exponential backoff     |
|  - Upon reconnect: reports cached state to server           |
|  - Receives new updates seamlessly without flickering       |
+-------------------------------------------------------------+
```

## 3. Storage Optimization
- Whenever a new playlist is synced, the client agent downloads new media files.
- Files already present with matching filename and size are reused instantly.
- Stale files not referenced in any active playlist are garbage-collected to prevent disk exhaustion on SD cards.
