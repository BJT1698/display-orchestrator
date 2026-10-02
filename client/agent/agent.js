import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directories
const CACHE_DIR = process.env.CACHE_DIR || path.resolve(__dirname, '../cache');
const MEDIA_CACHE_DIR = path.join(CACHE_DIR, 'media');
const PLAYER_DIR = path.resolve(__dirname, '../player');
const CONFIG_FILE = path.join(CACHE_DIR, 'config.json');
const PLAYLIST_CACHE_FILE = path.join(CACHE_DIR, 'playlist.json');

// Ensure directories exist
fs.mkdirSync(MEDIA_CACHE_DIR, { recursive: true });
fs.mkdirSync(PLAYER_DIR, { recursive: true });

// Load or initialize persistent config
function loadConfig() {
  let saved = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
      console.warn('Could not read config file, using defaults');
    }
  }

  const uuid = process.env.DEVICE_UUID || saved.uuid || crypto.randomUUID();
  const token = process.env.DISPLAY_TOKEN || saved.token || null;
  const name = process.env.CLIENT_NAME || saved.name || `Display-${os.hostname()}`;
  const serverUrl = process.env.SERVER_URL || saved.serverUrl || 'ws://localhost:8080/ws';
  const httpPort = parseInt(process.env.AGENT_PORT || process.env.PORT || '9090', 10);
  const orientation = process.env.ORIENTATION || saved.orientation || 'landscape';

  const cfg = { uuid, token, name, serverUrl, httpPort, orientation };
  saveConfig(cfg);
  return cfg;
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save config:', err.message);
  }
}

const state = {
  config: loadConfig(),
  orchestratorWs: null,
  playerWs: null,
  currentPlaylist: null,
  currentPlayingSlide: null,
  isAuthenticated: false,
  isOnline: false,
  reconnectAttempts: 0,
  heartbeatInterval: null,
  startTime: Date.now()
};

// -------------------------------------------------------------
// Internal Local HTTP & WebSocket Server (Serves Player & Cache)
// -------------------------------------------------------------
const localServer = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${state.config.httpPort}`);
  let pathname = parsedUrl.pathname;

  // Serve media cache: /media/...
  if (pathname.startsWith('/media/')) {
    const filename = pathname.replace('/media/', '');
    const safePath = path.join(MEDIA_CACHE_DIR, path.basename(filename));

    if (fs.existsSync(safePath)) {
      const ext = path.extname(safePath).toLowerCase();
      const contentTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm'
      };
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
      return fs.createReadStream(safePath).pipe(res);
    } else {
      res.writeHead(404);
      return res.end('Media not in cache');
    }
  }

  // Serve Player assets
  if (pathname === '/' || pathname === '/index.html') {
    pathname = '/index.html';
  }

  const filePath = path.join(PLAYER_DIR, pathname);
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    return fs.createReadStream(filePath).pipe(res);
  }

  res.writeHead(404);
  res.end('Not Found');
});

// WebSocket Server for local kiosk player
const localWss = new WebSocketServer({ server: localServer, path: '/ws-player' });

localWss.on('connection', (ws) => {
  state.playerWs = ws;
  console.log('🖥️ Local Kiosk Player connected to Agent');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'PLAYER_READY') {
        onPlayerReady();
      } else if (msg.type === 'SLIDE_CHANGE') {
        state.currentPlayingSlide = msg.item;
      }
    } catch (e) {
      console.error('Error handling local player message:', e);
    }
  });

  ws.on('close', () => {
    if (state.playerWs === ws) state.playerWs = null;
    console.log('Local Kiosk Player disconnected');
  });
});

function sendToPlayer(msg) {
  if (state.playerWs && state.playerWs.readyState === WebSocket.OPEN) {
    state.playerWs.send(JSON.stringify(msg));
  }
}

function onPlayerReady() {
  if (state.currentPlaylist) {
    sendToPlayer({
      type: 'SYNC_PLAYLIST',
      playlist: state.currentPlaylist,
      offline: !state.isOnline
    });
  } else {
    // Try loading offline cached playlist from disk
    loadCachedPlaylistOffline();
  }
}

function loadCachedPlaylistOffline() {
  if (fs.existsSync(PLAYLIST_CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(PLAYLIST_CACHE_FILE, 'utf8'));
      state.currentPlaylist = cached;
      console.log('📂 Loaded offline cached playlist from disk:', cached.name);
      sendToPlayer({
        type: 'SYNC_PLAYLIST',
        playlist: cached,
        offline: true
      });
      return;
    } catch (e) {
      console.error('Failed to read cached playlist:', e);
    }
  }

  if (!state.isAuthenticated) {
    sendToPlayer({
      type: 'SHOW_PAIRING',
      clientName: state.config.name,
      uuid: state.config.uuid,
      serverUrl: state.config.serverUrl,
      pairingCode: 'CONNECTING...'
    });
  }
}

// -------------------------------------------------------------
// Orchestrator WebSocket Connection & Protocol Handler
// -------------------------------------------------------------
function connectToOrchestrator() {
  const { serverUrl, uuid, token, name } = state.config;
  const wsUrl = new URL(serverUrl);
  wsUrl.searchParams.set('uuid', uuid);
  if (token) wsUrl.searchParams.set('token', token);
  wsUrl.searchParams.set('name', name);

  console.log(`📡 Connecting to Orchestrator: ${serverUrl} (UUID: ${uuid.substring(0, 8)}...)`);

  try {
    const ws = new WebSocket(wsUrl.toString());
    state.orchestratorWs = ws;

    ws.on('open', () => {
      console.log('✓ Connected to Orchestrator server');
      state.isOnline = true;
      state.reconnectAttempts = 0;

      // Send Handshake
      const handshakeMsg = {
        type: 'HANDSHAKE',
        uuid: state.config.uuid,
        token: state.config.token,
        name: state.config.name,
        clientVersion: '1.0.0',
        orientation: state.config.orientation,
        resolution: '1920x1080'
      };
      ws.send(JSON.stringify(handshakeMsg));

      startHeartbeatTimer();
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleOrchestratorMessage(msg);
      } catch (err) {
        console.error('Malformed message from orchestrator:', err.message);
      }
    });

    ws.on('close', () => {
      console.warn('⚠️ Disconnected from Orchestrator. Entering offline mode...');
      state.isOnline = false;
      stopHeartbeatTimer();
      scheduleReconnect();
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });

  } catch (err) {
    console.error('Connection attempt failed:', err.message);
    scheduleReconnect();
  }
}

function handleOrchestratorMessage(msg) {
  switch (msg.type) {
    case 'HANDSHAKE_ACK':
      if (msg.status === 'AUTHENTICATED') {
        state.isAuthenticated = true;
        console.log(`✓ Authenticated with Orchestrator (Display ID: ${msg.displayId})`);
        sendToPlayer({ type: 'AUTHENTICATED', displayName: msg.displayName });
      } else if (msg.status === 'UNPAIRED') {
        state.isAuthenticated = false;
        console.log(`🔒 Device unpaired. Pairing Code: ${msg.pairingCode}`);
        sendToPlayer({
          type: 'SHOW_PAIRING',
          pairingCode: msg.pairingCode,
          clientName: state.config.name,
          uuid: state.config.uuid,
          serverUrl: state.config.serverUrl
        });
      }
      break;

    case 'PAIRING_APPROVED':
      state.isAuthenticated = true;
      state.config.token = msg.token;
      saveConfig(state.config);
      console.log('🎉 Pairing approved! Token saved.');
      sendToPlayer({
        type: 'PAIRING_APPROVED',
        displayName: msg.displayName
      });
      break;

    case 'SYNC_PLAYLIST':
      handlePlaylistSync(msg.playlist);
      break;

    case 'PUSH_URL':
      console.log(`🌐 Pushing URL: ${msg.url} (${msg.durationSeconds}s)`);
      sendToPlayer({
        type: 'PUSH_URL',
        url: msg.url,
        durationSeconds: msg.durationSeconds
      });
      break;

    case 'BLANK_SCREEN':
      console.log(`🖥️ Blank Screen command: ${msg.state}`);
      sendToPlayer({ type: 'BLANK_SCREEN', state: msg.state });
      break;

    case 'EMERGENCY_ALERT':
      console.log(`🚨 Emergency Alert received: "${msg.title}" - ${msg.message}`);
      sendToPlayer({
        type: 'EMERGENCY_ALERT',
        title: msg.title,
        message: msg.message,
        durationSeconds: msg.durationSeconds
      });
      break;

    case 'FORCE_RELOAD':
      console.log('🔄 Force Reload received');
      sendToPlayer({ type: 'FORCE_RELOAD' });
      break;

    case 'SET_ORIENTATION':
      state.config.orientation = msg.orientation;
      saveConfig(state.config);
      sendToPlayer({ type: 'SET_ORIENTATION', orientation: msg.orientation });
      break;

    case 'REBOOT_DEVICE':
      console.log('⚡ Reboot command received');
      // In production / Linux appliance: exec('reboot') or restart container
      break;
  }
}

async function handlePlaylistSync(remotePlaylist) {
  if (!remotePlaylist) return;
  console.log(`📥 Syncing playlist: "${remotePlaylist.name}" (${remotePlaylist.items ? remotePlaylist.items.length : 0} items)`);

  const serverHttpBase = getServerHttpBase();
  const processedItems = [];

  for (const item of (remotePlaylist.items || [])) {
    const cloned = { ...item };

    // If item is a media file, download and cache locally
    if ((item.media_type === 'image' || item.media_type === 'video') && item.url && item.filename) {
      const fullRemoteUrl = item.url.startsWith('http') ? item.url : `${serverHttpBase}${item.url}`;
      const localFilePath = path.join(MEDIA_CACHE_DIR, item.filename);

      try {
        await downloadFileIfNotExists(fullRemoteUrl, localFilePath);
        // Point item to local agent media endpoint
        cloned.local_cached_url = `http://localhost:${state.config.httpPort}/media/${item.filename}`;
      } catch (err) {
        console.warn(`Failed to cache ${item.filename}, falling back to remote URL:`, err.message);
        cloned.local_cached_url = fullRemoteUrl;
      }
    }

    processedItems.push(cloned);
  }

  const localPlaylist = {
    ...remotePlaylist,
    items: processedItems
  };

  state.currentPlaylist = localPlaylist;

  // Save to offline cache file
  try {
    fs.writeFileSync(PLAYLIST_CACHE_FILE, JSON.stringify(localPlaylist, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write playlist cache file:', err);
  }

  // Notify player
  sendToPlayer({
    type: 'SYNC_PLAYLIST',
    playlist: localPlaylist,
    offline: false
  });

  // Acknowledge sync to orchestrator
  if (state.orchestratorWs && state.orchestratorWs.readyState === WebSocket.OPEN) {
    state.orchestratorWs.send(JSON.stringify({
      type: 'SYNC_ACK',
      uuid: state.config.uuid,
      playlistId: localPlaylist.id,
      cachedCount: processedItems.length
    }));
  }
}

function getServerHttpBase() {
  const wsUrl = new URL(state.config.serverUrl);
  const protocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:';
  return `${protocol}//${wsUrl.host}`;
}

async function downloadFileIfNotExists(remoteUrl, localPath) {
  if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
    return; // Already cached
  }

  return new Promise((resolve, reject) => {
    const urlObj = new URL(remoteUrl);
    const client = http; // Can support https if needed

    const req = client.get(remoteUrl, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(localPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', (err) => {
        fs.unlink(localPath, () => {});
        reject(err);
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

function startHeartbeatTimer() {
  stopHeartbeatTimer();
  state.heartbeatInterval = setInterval(() => {
    if (state.orchestratorWs && state.orchestratorWs.readyState === WebSocket.OPEN && state.isAuthenticated) {
      const freeMem = os.freemem();
      const totalMem = os.totalmem();
      const uptimeSec = Math.floor((Date.now() - state.startTime) / 1000);

      const heartbeatPayload = {
        type: 'HEARTBEAT',
        uuid: state.config.uuid,
        metrics: {
          cpuLoad: os.loadavg()[0],
          memUsedMb: Math.round((totalMem - freeMem) / (1024 * 1024)),
          memTotalMb: Math.round(totalMem / (1024 * 1024)),
          uptimeSeconds: uptimeSec,
          platform: os.platform()
        },
        currentPlaying: state.currentPlayingSlide,
        uptimeSeconds: uptimeSec
      };

      state.orchestratorWs.send(JSON.stringify(heartbeatPayload));
    }
  }, 10000); // 10s heartbeat
}

function stopHeartbeatTimer() {
  if (state.heartbeatInterval) {
    clearInterval(state.heartbeatInterval);
    state.heartbeatInterval = null;
  }
}

function scheduleReconnect() {
  state.reconnectAttempts++;
  // Exponential backoff with max 30s
  const delayMs = Math.min(2000 * Math.pow(1.5, state.reconnectAttempts - 1), 30000);
  console.log(`🔄 Reconnecting to orchestrator in ${(delayMs / 1000).toFixed(1)}s (attempt ${state.reconnectAttempts})...`);
  setTimeout(connectToOrchestrator, delayMs);
}

// -------------------------------------------------------------
// Start Agent
// -------------------------------------------------------------
localServer.listen(state.config.httpPort, '0.0.0.0', () => {
  console.log(`========================================================`);
  console.log(`🚀 Display Client Agent running on http://localhost:${state.config.httpPort}`);
  console.log(`💻 Device UUID: ${state.config.uuid}`);
  console.log(`💾 Cache directory: ${CACHE_DIR}`);
  console.log(`========================================================`);

  // Start orchestrator connection
  connectToOrchestrator();
});
