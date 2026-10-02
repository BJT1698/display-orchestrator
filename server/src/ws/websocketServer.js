import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { config } from '../config.js';
import { schedulerService } from '../services/schedulerService.js';

class DisplayWebSocketHub {
  constructor() {
    this.wss = null;
    this.displaySockets = new Map(); // uuid -> ws
    this.dashboardSockets = new Set(); // Set of ws
    this.heartbeatTimer = null;
  }

  init(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const clientType = url.searchParams.get('type') || (url.pathname.includes('dashboard') ? 'dashboard' : 'display');
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

      ws.isAlive = true;
      ws.clientIp = clientIp;
      ws.clientType = clientType;
      ws.displayUuid = null;

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      if (clientType === 'dashboard') {
        this.handleDashboardConnection(ws);
      } else {
        this.handleDisplayConnection(ws, url.searchParams);
      }

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (err) {
          console.error('Malformed WebSocket message received:', err.message);
        }
      });

      ws.on('close', () => {
        this.handleClose(ws);
      });

      ws.on('error', (err) => {
        console.error('WebSocket connection error:', err.message);
      });
    });

    // Start background sweep for dead displays
    this.startHeartbeatSweep();
    console.log('✓ WebSocket Hub initialized on /ws');
  }

  handleDashboardConnection(ws) {
    this.dashboardSockets.add(ws);
    // Send initial snapshot
    const displays = db.all('SELECT * FROM displays ORDER BY name ASC');
    const pairings = db.all("SELECT * FROM pairing_requests WHERE status = 'pending' ORDER BY created_at DESC");
    
    ws.send(JSON.stringify({
      type: 'INIT_STATE',
      data: {
        displays,
        pendingPairings: pairings,
        serverTime: new Date().toISOString()
      }
    }));
  }

  handleDisplayConnection(ws, searchParams) {
    const uuid = searchParams.get('uuid');
    const token = searchParams.get('token');
    const name = searchParams.get('name');

    if (uuid) {
      ws.displayUuid = uuid;
      this.displaySockets.set(uuid, ws);

      // If token provided, try immediate handshake
      if (token) {
        this.handleHandshake(ws, { uuid, token, name: name || 'Display' });
      }
    }
  }

  handleMessage(ws, msg) {
    switch (msg.type) {
      case 'HANDSHAKE':
        this.handleHandshake(ws, msg);
        break;

      case 'REQUEST_PAIRING':
        this.handlePairingRequest(ws, msg);
        break;

      case 'HEARTBEAT':
        this.handleHeartbeat(ws, msg);
        break;

      case 'SYNC_ACK':
        this.handleSyncAck(ws, msg);
        break;

      case 'SCREENSHOT_DATA':
        this.handleScreenshotData(ws, msg);
        break;

      case 'LOG_EVENT':
        this.handleLogEvent(ws, msg);
        break;

      default:
        console.log(`Unknown message type: ${msg.type}`);
    }
  }

  handleHandshake(ws, msg) {
    const { uuid, token, name, resolution, orientation, clientVersion } = msg;
    if (!uuid) return;

    ws.displayUuid = uuid;
    this.displaySockets.set(uuid, ws);

    let display = db.getOne('SELECT * FROM displays WHERE uuid = ?', uuid);

    // If display exists and token matches
    if (display && display.token && display.token === token) {
      db.run(
        `UPDATE displays 
         SET status = 'online', ip_address = ?, last_heartbeat = datetime('now'),
             resolution = COALESCE(?, resolution), orientation = COALESCE(?, orientation),
             updated_at = datetime('now')
         WHERE uuid = ?`,
        ws.clientIp,
        resolution || null,
        orientation || null,
        uuid
      );

      ws.send(JSON.stringify({
        type: 'HANDSHAKE_ACK',
        status: 'AUTHENTICATED',
        displayId: display.id,
        displayName: display.name,
        orientation: display.orientation,
        serverTime: new Date().toISOString()
      }));

      // Immediately sync active playlist
      this.syncDisplayPlaylist(uuid);

      this.broadcastToDashboards({
        type: 'DISPLAY_STATUS_CHANGE',
        data: { uuid, status: 'online', name: display.name, ip: ws.clientIp }
      });

      this.log('info', 'display', uuid, `Display '${display.name}' authenticated and connected`);
      return;
    }

    // If display does not exist or token is invalid, issue pairing process
    this.initiatePairingForDisplay(ws, uuid, name || 'Display Node');
  }

  initiatePairingForDisplay(ws, uuid, clientName) {
    // Check if pending pairing already exists
    let pairing = db.getOne(
      "SELECT * FROM pairing_requests WHERE uuid = ? AND status = 'pending'",
      uuid
    );

    if (!pairing) {
      const pairingCode = this.generatePairingCode();
      const deviceToken = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      db.run(
        `INSERT INTO pairing_requests (pairing_code, uuid, client_name, ip_address, token, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        pairingCode,
        uuid,
        clientName,
        ws.clientIp,
        deviceToken,
        expiresAt
      );

      pairing = { pairing_code: pairingCode, token: deviceToken };
    }

    ws.send(JSON.stringify({
      type: 'HANDSHAKE_ACK',
      status: 'UNPAIRED',
      pairingCode: pairing.pairing_code,
      message: 'Device requires approval from the web orchestrator'
    }));

    this.broadcastToDashboards({
      type: 'PAIRING_REQUEST_NEW',
      data: {
        uuid,
        clientName,
        pairingCode: pairing.pairing_code,
        ip: ws.clientIp,
        createdAt: new Date().toISOString()
      }
    });

    this.log('info', 'server', uuid, `New display pairing request with code: ${pairing.pairing_code}`);
  }

  handlePairingRequest(ws, msg) {
    this.initiatePairingForDisplay(ws, msg.uuid, msg.clientName);
  }

  handleHeartbeat(ws, msg) {
    const { uuid, metrics, currentPlaying, uptimeSeconds } = msg;
    if (!uuid) return;

    const metricsJson = JSON.stringify(metrics || {});
    db.run(
      `UPDATE displays 
       SET status = 'online', last_heartbeat = datetime('now'), metrics = ?, updated_at = datetime('now')
       WHERE uuid = ?`,
      metricsJson,
      uuid
    );

    this.broadcastToDashboards({
      type: 'DISPLAY_HEARTBEAT',
      data: {
        uuid,
        metrics,
        currentPlaying,
        uptimeSeconds,
        timestamp: new Date().toISOString()
      }
    });
  }

  handleSyncAck(ws, msg) {
    const { uuid, playlistId, cachedCount, error } = msg;
    if (error) {
      this.log('warn', 'display', uuid, `Sync issue for playlist ${playlistId}: ${error}`);
    } else {
      this.log('info', 'display', uuid, `Successfully cached playlist ${playlistId} (${cachedCount} items)`);
    }
  }

  handleScreenshotData(ws, msg) {
    const { uuid, imageBase64 } = msg;
    this.broadcastToDashboards({
      type: 'DISPLAY_SCREENSHOT',
      data: { uuid, imageBase64, timestamp: new Date().toISOString() }
    });
  }

  handleLogEvent(ws, msg) {
    const { uuid, level, message, payload } = msg;
    this.log(level || 'info', 'display', uuid, message, payload);
  }

  handleClose(ws) {
    if (ws.clientType === 'dashboard') {
      this.dashboardSockets.delete(ws);
    } else if (ws.displayUuid) {
      this.displaySockets.delete(ws.displayUuid);
      db.run(
        `UPDATE displays SET status = 'offline', updated_at = datetime('now') WHERE uuid = ?`,
        ws.displayUuid
      );
      this.broadcastToDashboards({
        type: 'DISPLAY_STATUS_CHANGE',
        data: { uuid: ws.displayUuid, status: 'offline' }
      });
      this.log('info', 'server', ws.displayUuid, `Display ${ws.displayUuid} disconnected`);
    }
  }

  // --- Public Control APIs ---

  syncDisplayPlaylist(uuid) {
    const ws = this.displaySockets.get(uuid);
    const playlist = schedulerService.resolveDisplayPlaylist(uuid);

    const payload = {
      type: 'SYNC_PLAYLIST',
      playlist: playlist || { id: 0, name: 'Empty', loop_enabled: 1, items: [] },
      serverTime: new Date().toISOString()
    };

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  syncAllDisplays() {
    for (const [uuid] of this.displaySockets) {
      this.syncDisplayPlaylist(uuid);
    }
  }

  sendToDisplay(uuid, commandPayload) {
    const ws = this.displaySockets.get(uuid);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(commandPayload));
      return true;
    }
    return false;
  }

  sendToAllDisplays(commandPayload) {
    let sent = 0;
    for (const [, ws] of this.displaySockets) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(commandPayload));
        sent++;
      }
    }
    return sent;
  }

  pushUrl(uuid, url, durationSeconds = 30) {
    return this.sendToDisplay(uuid, {
      type: 'PUSH_URL',
      url,
      durationSeconds: parseInt(durationSeconds, 10)
    });
  }

  forceReload(uuid) {
    return this.sendToDisplay(uuid, { type: 'FORCE_RELOAD' });
  }

  setBlankScreen(uuid, state = true) {
    return this.sendToDisplay(uuid, { type: 'BLANK_SCREEN', state: Boolean(state) });
  }

  rebootDevice(uuid) {
    return this.sendToDisplay(uuid, { type: 'REBOOT_DEVICE' });
  }

  requestScreenshot(uuid) {
    return this.sendToDisplay(uuid, { type: 'TAKE_SCREENSHOT' });
  }

  setOrientation(uuid, orientation) {
    db.run('UPDATE displays SET orientation = ? WHERE uuid = ?', orientation, uuid);
    return this.sendToDisplay(uuid, { type: 'SET_ORIENTATION', orientation });
  }

  broadcastEmergencyAlert(message, title = 'EMERGENCY ALERT', durationSeconds = 60) {
    return this.sendToAllDisplays({
      type: 'EMERGENCY_ALERT',
      title,
      message,
      durationSeconds
    });
  }

  broadcastToDashboards(data) {
    const payload = JSON.stringify(data);
    for (const ws of this.dashboardSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  approvePairing(pairingCode, customName, groupId) {
    const pairing = db.getOne(
      "SELECT * FROM pairing_requests WHERE pairing_code = ? AND status = 'pending'",
      pairingCode
    );
    if (!pairing) return { success: false, error: 'Pairing code not found or expired' };

    const displayName = customName || pairing.client_name || 'Display Screen';

    // Insert or update display
    const existing = db.getOne('SELECT * FROM displays WHERE uuid = ?', pairing.uuid);
    let displayId = null;

    if (existing) {
      db.run(
        `UPDATE displays 
         SET name = ?, token = ?, group_id = ?, status = 'online', updated_at = datetime('now')
         WHERE uuid = ?`,
        displayName,
        pairing.token,
        groupId || null,
        pairing.uuid
      );
      displayId = existing.id;
    } else {
      const res = db.run(
        `INSERT INTO displays (uuid, name, token, group_id, ip_address, status)
         VALUES (?, ?, ?, ?, ?, 'online')`,
        pairing.uuid,
        displayName,
        pairing.token,
        groupId || null,
        pairing.ip_address
      );
      displayId = res.lastInsertRowid;
    }

    // Mark pairing as approved
    db.run("UPDATE pairing_requests SET status = 'approved' WHERE id = ?", pairing.id);

    // Send token and confirmation to display client if connected
    const ws = this.displaySockets.get(pairing.uuid);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'PAIRING_APPROVED',
        token: pairing.token,
        displayId,
        displayName,
        message: 'Pairing approved successfully!'
      }));

      // Immediately sync active playlist
      setTimeout(() => this.syncDisplayPlaylist(pairing.uuid), 200);
    }

    this.broadcastToDashboards({
      type: 'PAIRING_RESOLVED',
      data: { uuid: pairing.uuid, displayId, displayName }
    });

    this.log('info', 'server', pairing.uuid, `Pairing code ${pairingCode} approved for '${displayName}'`);

    return { success: true, displayId, token: pairing.token };
  }

  log(level, source, displayUuid, message, payload = null) {
    const payloadStr = payload ? (typeof payload === 'object' ? JSON.stringify(payload) : String(payload)) : null;
    db.run(
      'INSERT INTO audit_logs (level, source, display_uuid, message, payload) VALUES (?, ?, ?, ?, ?)',
      level,
      source,
      displayUuid || null,
      message,
      payloadStr
    );

    this.broadcastToDashboards({
      type: 'LOG_ENTRY',
      data: {
        level,
        source,
        displayUuid,
        message,
        createdAt: new Date().toISOString()
      }
    });
  }

  startHeartbeatSweep() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      // 1. Ping ping-pong to keep connections alive
      for (const [, ws] of this.displaySockets) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }

      // 2. Mark displays offline if last heartbeat > 35s ago
      const timeoutThreshold = new Date(Date.now() - config.heartbeatTimeoutMs).toISOString();
      const deadDisplays = db.all(
        "SELECT uuid, name FROM displays WHERE status = 'online' AND (last_heartbeat IS NULL OR last_heartbeat < ?)",
        timeoutThreshold
      );

      for (const d of deadDisplays) {
        db.run("UPDATE displays SET status = 'offline' WHERE uuid = ?", d.uuid);
        this.broadcastToDashboards({
          type: 'DISPLAY_STATUS_CHANGE',
          data: { uuid: d.uuid, status: 'offline', name: d.name }
        });
      }
    }, 15000);
  }

  generatePairingCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      if (i === 3) code += '-';
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

export const wsHub = new DisplayWebSocketHub();
