import express from 'express';
import os from 'node:os';
import { db } from '../db/database.js';
import { config } from '../config.js';
import { wsHub } from '../ws/websocketServer.js';
import { mediaService } from '../services/mediaService.js';

export const systemRouter = express.Router();

// System Status & Stats Overview
systemRouter.get('/status', (req, res) => {
  const displaysCount = db.getOne('SELECT COUNT(*) AS total FROM displays');
  const onlineCount = db.getOne("SELECT COUNT(*) AS online FROM displays WHERE status = 'online'");
  const pendingPairings = db.getOne("SELECT COUNT(*) AS count FROM pairing_requests WHERE status = 'pending'");
  const playlistsCount = db.getOne('SELECT COUNT(*) AS count FROM playlists');
  const storageStats = mediaService.getStorageStats();

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  res.json({
    success: true,
    data: {
      serverVersion: config.appVersion,
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      uptimeSeconds: Math.floor(process.uptime()),
      systemUptimeSeconds: Math.floor(os.uptime()),
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percent: Math.round((usedMem / totalMem) * 100)
      },
      cpus: os.cpus().length,
      displays: {
        total: displaysCount?.total || 0,
        online: onlineCount?.online || 0,
        offline: (displaysCount?.total || 0) - (onlineCount?.online || 0),
        pendingPairings: pendingPairings?.count || 0
      },
      storage: storageStats,
      playlistsCount: playlistsCount?.count || 0,
      activeWsConnections: wsHub.displaySockets.size
    }
  });
});

// Audit Logs
systemRouter.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit || '100', 10);
  const level = req.query.level;

  let query = 'SELECT * FROM audit_logs';
  const params = [];

  if (level) {
    query += ' WHERE level = ?';
    params.push(level);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const logs = db.all(query, ...params);
  res.json({ success: true, data: logs });
});

// Clear Logs
systemRouter.delete('/logs', (req, res) => {
  db.run('DELETE FROM audit_logs');
  res.json({ success: true, message: 'Audit logs cleared' });
});

// Display Groups CRUD
systemRouter.get('/groups', (req, res) => {
  const groups = db.all(`
    SELECT 
      g.*,
      COUNT(d.id) AS display_count,
      p.name AS default_playlist_name
    FROM display_groups g
    LEFT JOIN displays d ON d.group_id = g.id
    LEFT JOIN playlists p ON g.default_playlist_id = p.id
    GROUP BY g.id
    ORDER BY g.name ASC
  `);
  res.json({ success: true, data: groups });
});

systemRouter.post('/groups', (req, res) => {
  const { name, description, defaultPlaylistId } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Group name is required' });

  try {
    const result = db.run(
      'INSERT INTO display_groups (name, description, default_playlist_id) VALUES (?, ?, ?)',
      name,
      description || '',
      defaultPlaylistId || null
    );
    const created = db.getOne('SELECT * FROM display_groups WHERE id = ?', result.lastInsertRowid);
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

systemRouter.put('/groups/:id', (req, res) => {
  const { name, description, defaultPlaylistId } = req.body;
  const group = db.getOne('SELECT * FROM display_groups WHERE id = ?', req.params.id);
  if (!group) return res.status(404).json({ success: false, error: 'Group not found' });

  db.run(
    'UPDATE display_groups SET name = ?, description = ?, default_playlist_id = ? WHERE id = ?',
    name !== undefined ? name : group.name,
    description !== undefined ? description : group.description,
    defaultPlaylistId !== undefined ? defaultPlaylistId : group.default_playlist_id,
    group.id
  );

  wsHub.syncAllDisplays();
  const updated = db.getOne('SELECT * FROM display_groups WHERE id = ?', group.id);
  res.json({ success: true, data: updated });
});

systemRouter.delete('/groups/:id', (req, res) => {
  db.run('DELETE FROM display_groups WHERE id = ?', req.params.id);
  res.json({ success: true, message: 'Group deleted' });
});
