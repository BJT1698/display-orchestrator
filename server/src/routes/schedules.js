import express from 'express';
import { db } from '../db/database.js';
import { wsHub } from '../ws/websocketServer.js';

export const schedulesRouter = express.Router();

// List all schedules
schedulesRouter.get('/', (req, res) => {
  const schedules = db.all(`
    SELECT 
      s.*,
      p.name AS playlist_name,
      CASE 
        WHEN s.target_type = 'display' THEN (SELECT name FROM displays WHERE id = s.target_id)
        WHEN s.target_type = 'group' THEN (SELECT name FROM display_groups WHERE id = s.target_id)
        ELSE 'All'
      END AS target_name
    FROM schedules s
    LEFT JOIN playlists p ON s.playlist_id = p.id
    ORDER BY s.priority DESC, s.start_time ASC
  `);

  const formatted = schedules.map(s => {
    let days = [1, 2, 3, 4, 5, 6, 7];
    try {
      if (s.days_of_week) days = JSON.parse(s.days_of_week);
    } catch (e) {}
    return { ...s, days_of_week: days };
  });

  res.json({ success: true, data: formatted });
});

// Create schedule
schedulesRouter.post('/', (req, res) => {
  const { targetType, targetId, playlistId, startTime, endTime, daysOfWeek, priority, isActive } = req.body;
  if (!targetType || !targetId || !playlistId || !startTime || !endTime) {
    return res.status(400).json({ success: false, error: 'Missing required schedule fields' });
  }

  const result = db.run(
    `INSERT INTO schedules 
      (target_type, target_id, playlist_id, start_time, end_time, days_of_week, priority, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    targetType,
    targetId,
    playlistId,
    startTime,
    endTime,
    daysOfWeek ? JSON.stringify(daysOfWeek) : '[1,2,3,4,5,6,7]',
    priority || 1,
    isActive !== undefined ? (isActive ? 1 : 0) : 1
  );

  wsHub.syncAllDisplays();
  res.json({ success: true, scheduleId: result.lastInsertRowid });
});

// Update schedule
schedulesRouter.put('/:id', (req, res) => {
  const { targetType, targetId, playlistId, startTime, endTime, daysOfWeek, priority, isActive } = req.body;
  const schedule = db.getOne('SELECT * FROM schedules WHERE id = ?', req.params.id);
  if (!schedule) {
    return res.status(404).json({ success: false, error: 'Schedule not found' });
  }

  db.run(`
    UPDATE schedules 
    SET target_type = ?, target_id = ?, playlist_id = ?, start_time = ?, end_time = ?,
        days_of_week = ?, priority = ?, is_active = ?
    WHERE id = ?
  `,
    targetType !== undefined ? targetType : schedule.target_type,
    targetId !== undefined ? targetId : schedule.target_id,
    playlistId !== undefined ? playlistId : schedule.playlist_id,
    startTime !== undefined ? startTime : schedule.start_time,
    endTime !== undefined ? endTime : schedule.end_time,
    daysOfWeek !== undefined ? (typeof daysOfWeek === 'string' ? daysOfWeek : JSON.stringify(daysOfWeek)) : schedule.days_of_week,
    priority !== undefined ? priority : schedule.priority,
    isActive !== undefined ? (isActive ? 1 : 0) : schedule.is_active,
    schedule.id
  );

  wsHub.syncAllDisplays();
  res.json({ success: true, message: 'Schedule updated' });
});

// Delete schedule
schedulesRouter.delete('/:id', (req, res) => {
  db.run('DELETE FROM schedules WHERE id = ?', req.params.id);
  wsHub.syncAllDisplays();
  res.json({ success: true, message: 'Schedule deleted' });
});
