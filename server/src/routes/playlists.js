import express from 'express';
import { db } from '../db/database.js';
import { schedulerService } from '../services/schedulerService.js';
import { wsHub } from '../ws/websocketServer.js';

export const playlistsRouter = express.Router();

// List all playlists with item count and total duration
playlistsRouter.get('/', (req, res) => {
  const playlists = db.all(`
    SELECT 
      p.*,
      COUNT(pi.id) AS item_count,
      COALESCE(SUM(pi.duration_seconds), 0) AS total_duration_seconds
    FROM playlists p
    LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
    GROUP BY p.id
    ORDER BY p.name ASC
  `);

  res.json({ success: true, data: playlists });
});

// Get single playlist with hydrated items
playlistsRouter.get('/:id', (req, res) => {
  const playlist = schedulerService.getPlaylistWithItems(req.params.id);
  if (!playlist) {
    return res.status(404).json({ success: false, error: 'Playlist not found' });
  }
  res.json({ success: true, data: playlist });
});

// Create new playlist
playlistsRouter.post('/', (req, res) => {
  const { name, description, loopEnabled, transitionEffect } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'Playlist name is required' });
  }

  const result = db.run(
    `INSERT INTO playlists (name, description, loop_enabled, transition_effect)
     VALUES (?, ?, ?, ?)`,
    name,
    description || '',
    loopEnabled !== undefined ? (loopEnabled ? 1 : 0) : 1,
    transitionEffect || 'fade'
  );

  const created = schedulerService.getPlaylistWithItems(result.lastInsertRowid);
  res.json({ success: true, data: created });
});

// Update playlist metadata
playlistsRouter.put('/:id', (req, res) => {
  const { name, description, loopEnabled, transitionEffect } = req.body;
  const playlist = db.getOne('SELECT * FROM playlists WHERE id = ?', req.params.id);
  if (!playlist) {
    return res.status(404).json({ success: false, error: 'Playlist not found' });
  }

  const newName = name !== undefined ? name : playlist.name;
  const newDesc = description !== undefined ? description : playlist.description;
  const newLoop = loopEnabled !== undefined ? (loopEnabled ? 1 : 0) : playlist.loop_enabled;
  const newTrans = transitionEffect !== undefined ? transitionEffect : playlist.transition_effect;

  db.run(
    `UPDATE playlists 
     SET name = ?, description = ?, loop_enabled = ?, transition_effect = ?, updated_at = datetime('now')
     WHERE id = ?`,
    newName,
    newDesc,
    newLoop,
    newTrans,
    playlist.id
  );

  // Sync any display currently using this playlist
  notifyDisplaysUsingPlaylist(playlist.id);

  const updated = schedulerService.getPlaylistWithItems(playlist.id);
  res.json({ success: true, data: updated });
});

// Delete playlist
playlistsRouter.delete('/:id', (req, res) => {
  const playlist = db.getOne('SELECT * FROM playlists WHERE id = ?', req.params.id);
  if (!playlist) {
    return res.status(404).json({ success: false, error: 'Playlist not found' });
  }

  db.run('DELETE FROM playlists WHERE id = ?', playlist.id);
  res.json({ success: true, message: 'Playlist deleted' });
});

// Add item to playlist
playlistsRouter.post('/:id/items', (req, res) => {
  const { mediaId, customUrl, durationSeconds, transition, activeFrom, activeTo, daysOfWeek } = req.body;
  const playlist = db.getOne('SELECT * FROM playlists WHERE id = ?', req.params.id);
  if (!playlist) {
    return res.status(404).json({ success: false, error: 'Playlist not found' });
  }

  // Get max display order
  const maxOrderRow = db.getOne(
    'SELECT COALESCE(MAX(display_order), 0) AS max_order FROM playlist_items WHERE playlist_id = ?',
    playlist.id
  );
  const nextOrder = (maxOrderRow?.max_order || 0) + 1;

  let duration = durationSeconds ? parseInt(durationSeconds, 10) : 10;
  if (mediaId && !durationSeconds) {
    const media = db.getOne('SELECT duration_seconds FROM media WHERE id = ?', mediaId);
    if (media && media.duration_seconds) {
      duration = media.duration_seconds;
    }
  }

  const result = db.run(
    `INSERT INTO playlist_items 
      (playlist_id, media_id, custom_url, duration_seconds, display_order, transition, active_from, active_to, days_of_week)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    playlist.id,
    mediaId || null,
    customUrl || null,
    duration,
    nextOrder,
    transition || playlist.transition_effect || 'fade',
    activeFrom || null,
    activeTo || null,
    daysOfWeek ? JSON.stringify(daysOfWeek) : '[1,2,3,4,5,6,7]'
  );

  notifyDisplaysUsingPlaylist(playlist.id);

  const updatedPlaylist = schedulerService.getPlaylistWithItems(playlist.id);
  res.json({ success: true, data: updatedPlaylist, addedItemId: result.lastInsertRowid });
});

// Update item in playlist
playlistsRouter.put('/:id/items/:itemId', (req, res) => {
  const { durationSeconds, transition, activeFrom, activeTo, daysOfWeek, displayOrder } = req.body;
  const item = db.getOne(
    'SELECT * FROM playlist_items WHERE id = ? AND playlist_id = ?',
    req.params.itemId,
    req.params.id
  );

  if (!item) {
    return res.status(404).json({ success: false, error: 'Playlist item not found' });
  }

  const newDuration = durationSeconds !== undefined ? parseInt(durationSeconds, 10) : item.duration_seconds;
  const newTransition = transition !== undefined ? transition : item.transition;
  const newActiveFrom = activeFrom !== undefined ? activeFrom : item.active_from;
  const newActiveTo = activeTo !== undefined ? activeTo : item.active_to;
  const newDays = daysOfWeek !== undefined ? (typeof daysOfWeek === 'string' ? daysOfWeek : JSON.stringify(daysOfWeek)) : item.days_of_week;
  const newOrder = displayOrder !== undefined ? parseInt(displayOrder, 10) : item.display_order;

  db.run(
    `UPDATE playlist_items 
     SET duration_seconds = ?, transition = ?, active_from = ?, active_to = ?, days_of_week = ?, display_order = ?
     WHERE id = ?`,
    newDuration,
    newTransition,
    newActiveFrom,
    newActiveTo,
    newDays,
    newOrder,
    item.id
  );

  notifyDisplaysUsingPlaylist(req.params.id);

  const updatedPlaylist = schedulerService.getPlaylistWithItems(req.params.id);
  res.json({ success: true, data: updatedPlaylist });
});

// Delete item from playlist
playlistsRouter.delete('/:id/items/:itemId', (req, res) => {
  const item = db.getOne(
    'SELECT * FROM playlist_items WHERE id = ? AND playlist_id = ?',
    req.params.itemId,
    req.params.id
  );

  if (!item) {
    return res.status(404).json({ success: false, error: 'Playlist item not found' });
  }

  db.run('DELETE FROM playlist_items WHERE id = ?', item.id);
  notifyDisplaysUsingPlaylist(req.params.id);

  const updatedPlaylist = schedulerService.getPlaylistWithItems(req.params.id);
  res.json({ success: true, data: updatedPlaylist });
});

// Reorder playlist items
playlistsRouter.put('/:id/reorder', (req, res) => {
  const { itemIds } = req.body; // Array of item IDs in desired order
  if (!Array.isArray(itemIds)) {
    return res.status(400).json({ success: false, error: 'itemIds array is required' });
  }

  db.transaction((database) => {
    itemIds.forEach((id, index) => {
      database.prepare('UPDATE playlist_items SET display_order = ? WHERE id = ? AND playlist_id = ?').run(
        index + 1,
        id,
        req.params.id
      );
    });
  });

  notifyDisplaysUsingPlaylist(req.params.id);

  const updatedPlaylist = schedulerService.getPlaylistWithItems(req.params.id);
  res.json({ success: true, data: updatedPlaylist });
});

// Duplicate playlist
playlistsRouter.post('/:id/duplicate', (req, res) => {
  const original = schedulerService.getPlaylistWithItems(req.params.id);
  if (!original) {
    return res.status(404).json({ success: false, error: 'Original playlist not found' });
  }

  const resNew = db.run(
    'INSERT INTO playlists (name, description, loop_enabled, transition_effect) VALUES (?, ?, ?, ?)',
    `${original.name} (Copy)`,
    original.description || '',
    original.loop_enabled,
    original.transition_effect
  );

  const newPlaylistId = resNew.lastInsertRowid;

  const insertItem = db.prepare(`
    INSERT INTO playlist_items 
      (playlist_id, media_id, custom_url, duration_seconds, display_order, transition, active_from, active_to, days_of_week)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of original.items) {
    insertItem.run(
      newPlaylistId,
      item.media_id,
      item.custom_url,
      item.duration_seconds,
      item.display_order,
      item.transition,
      item.active_from,
      item.active_to,
      item.days_of_week
    );
  }

  const duplicated = schedulerService.getPlaylistWithItems(newPlaylistId);
  res.json({ success: true, data: duplicated });
});

function notifyDisplaysUsingPlaylist(playlistId) {
  const displays = db.all(`
    SELECT DISTINCT d.uuid FROM displays d
    WHERE d.current_playlist_id = ? 
       OR d.group_id IN (SELECT id FROM display_groups WHERE default_playlist_id = ?)
  `, playlistId, playlistId);

  for (const d of displays) {
    wsHub.syncDisplayPlaylist(d.uuid);
  }
}
