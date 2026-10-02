import express from 'express';
import { db } from '../db/database.js';
import { wsHub } from '../ws/websocketServer.js';

export const displaysRouter = express.Router();

// List all displays
displaysRouter.get('/', (req, res) => {
  const displays = db.all(`
    SELECT 
      d.*,
      g.name AS group_name,
      p.name AS current_playlist_name
    FROM displays d
    LEFT JOIN display_groups g ON d.group_id = g.id
    LEFT JOIN playlists p ON d.current_playlist_id = p.id
    ORDER BY d.name ASC
  `);

  // Parse metrics JSON safely
  const formatted = displays.map(d => {
    let metrics = {};
    try {
      metrics = d.metrics ? JSON.parse(d.metrics) : {};
    } catch (e) {
      metrics = {};
    }
    return {
      ...d,
      metrics
    };
  });

  res.json({ success: true, data: formatted });
});

// Get pending pairing requests
displaysRouter.get('/pairing/pending', (req, res) => {
  const pending = db.all("SELECT * FROM pairing_requests WHERE status = 'pending' ORDER BY created_at DESC");
  res.json({ success: true, data: pending });
});

// Approve pairing request
displaysRouter.post('/pairing/approve', (req, res) => {
  const { pairingCode, name, groupId } = req.body;
  if (!pairingCode) {
    return res.status(400).json({ success: false, error: 'Pairing code is required' });
  }

  const result = wsHub.approvePairing(pairingCode.trim().toUpperCase(), name, groupId);
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json({ success: true, data: result });
});

// Reject / dismiss pairing request
displaysRouter.post('/pairing/reject', (req, res) => {
  const { pairingCode } = req.body;
  if (!pairingCode) return res.status(400).json({ success: false, error: 'Pairing code required' });

  db.run("UPDATE pairing_requests SET status = 'rejected' WHERE pairing_code = ?", pairingCode.trim().toUpperCase());
  res.json({ success: true, message: 'Pairing request rejected' });
});

// Get single display
displaysRouter.get('/:id', (req, res) => {
  const display = db.getOne(`
    SELECT 
      d.*,
      g.name AS group_name,
      p.name AS current_playlist_name
    FROM displays d
    LEFT JOIN display_groups g ON d.group_id = g.id
    LEFT JOIN playlists p ON d.current_playlist_id = p.id
    WHERE d.id = ? OR d.uuid = ?
  `, req.params.id, req.params.id);

  if (!display) {
    return res.status(404).json({ success: false, error: 'Display not found' });
  }

  let metrics = {};
  try {
    metrics = display.metrics ? JSON.parse(display.metrics) : {};
  } catch (e) {
    metrics = {};
  }

  res.json({ success: true, data: { ...display, metrics } });
});

// Update display details
displaysRouter.put('/:id', (req, res) => {
  const { name, groupId, currentPlaylistId, orientation } = req.body;
  const display = db.getOne('SELECT * FROM displays WHERE id = ? OR uuid = ?', req.params.id, req.params.id);

  if (!display) {
    return res.status(404).json({ success: false, error: 'Display not found' });
  }

  const newName = name !== undefined ? name : display.name;
  const newGroupId = groupId !== undefined ? (groupId || null) : display.group_id;
  const newPlaylistId = currentPlaylistId !== undefined ? (currentPlaylistId || null) : display.current_playlist_id;
  const newOrientation = orientation !== undefined ? orientation : display.orientation;

  db.run(`
    UPDATE displays 
    SET name = ?, group_id = ?, current_playlist_id = ?, orientation = ?, updated_at = datetime('now')
    WHERE id = ?
  `, newName, newGroupId, newPlaylistId, newOrientation, display.id);

  // If playlist or orientation changed, notify the client
  if (currentPlaylistId !== undefined && currentPlaylistId !== display.current_playlist_id) {
    wsHub.syncDisplayPlaylist(display.uuid);
  }
  if (orientation !== undefined && orientation !== display.orientation) {
    wsHub.setOrientation(display.uuid, orientation);
  }

  const updated = db.getOne('SELECT * FROM displays WHERE id = ?', display.id);
  res.json({ success: true, data: updated });
});

// Delete display
displaysRouter.delete('/:id', (req, res) => {
  const display = db.getOne('SELECT * FROM displays WHERE id = ? OR uuid = ?', req.params.id, req.params.id);
  if (!display) {
    return res.status(404).json({ success: false, error: 'Display not found' });
  }

  db.run('DELETE FROM displays WHERE id = ?', display.id);
  db.run('DELETE FROM pairing_requests WHERE uuid = ?', display.uuid);

  wsHub.broadcastToDashboards({
    type: 'DISPLAY_DELETED',
    data: { id: display.id, uuid: display.uuid }
  });

  res.json({ success: true, message: 'Display deleted successfully' });
});

// Dispatch real-time command to display
displaysRouter.post('/:id/command', (req, res) => {
  const { action, payload } = req.body;
  const display = db.getOne('SELECT * FROM displays WHERE id = ? OR uuid = ?', req.params.id, req.params.id);

  if (!display) {
    return res.status(404).json({ success: false, error: 'Display not found' });
  }

  let sent = false;
  switch (action) {
    case 'push_url':
      sent = wsHub.pushUrl(display.uuid, payload.url, payload.durationSeconds || 30);
      break;

    case 'reload':
      sent = wsHub.forceReload(display.uuid);
      break;

    case 'blank':
      sent = wsHub.setBlankScreen(display.uuid, payload.state);
      break;

    case 'reboot':
      sent = wsHub.rebootDevice(display.uuid);
      break;

    case 'screenshot':
      sent = wsHub.requestScreenshot(display.uuid);
      break;

    case 'sync':
      wsHub.syncDisplayPlaylist(display.uuid);
      sent = true;
      break;

    case 'assign_playlist':
      db.run('UPDATE displays SET current_playlist_id = ? WHERE id = ?', payload.playlistId, display.id);
      wsHub.syncDisplayPlaylist(display.uuid);
      sent = true;
      break;

    default:
      return res.status(400).json({ success: false, error: `Unknown command action: ${action}` });
  }

  wsHub.log('command', 'dashboard', display.uuid, `Sent command '${action}' to display '${display.name}'`, payload);

  res.json({
    success: true,
    sent,
    message: sent ? `Command ${action} sent to display` : `Display appears offline; command queued or ignored`
  });
});

// Direct push URL shortcut endpoint
displaysRouter.post('/:id/push', (req, res) => {
  const { url, durationSeconds } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

  const display = db.getOne('SELECT * FROM displays WHERE id = ? OR uuid = ?', req.params.id, req.params.id);
  if (!display) return res.status(404).json({ success: false, error: 'Display not found' });

  const sent = wsHub.pushUrl(display.uuid, url, durationSeconds || 30);
  wsHub.log('command', 'dashboard', display.uuid, `Pushed URL '${url}' (${durationSeconds || 30}s) to '${display.name}'`);

  res.json({
    success: true,
    sent,
    message: sent ? `URL pushed to display` : `Display offline; command queued or ignored`
  });
});

// Emergency Alert Broadcast
displaysRouter.post('/broadcast/emergency', (req, res) => {
  const { message, title, durationSeconds } = req.body;
  if (!message) return res.status(400).json({ success: false, error: 'Alert message is required' });

  const sentCount = wsHub.broadcastEmergencyAlert(message, title, durationSeconds || 60);
  wsHub.log('warn', 'dashboard', null, `Broadcasted emergency alert: "${message}" to ${sentCount} displays`);

  res.json({ success: true, message: `Emergency alert broadcast to ${sentCount} connected display(s)` });
});
