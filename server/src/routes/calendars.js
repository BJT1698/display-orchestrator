import express from 'express';
import { calendarService } from '../services/calendarService.js';
import { wsHub } from '../ws/websocketServer.js';
import { actor } from '../auth/auth.js';

// Signed-in users manage the published calendars; the links never come back out
export const calendarsRouter = express.Router();

calendarsRouter.get('/', (req, res) => {
  res.json({ success: true, data: calendarService.publicList() });
});

calendarsRouter.post('/', async (req, res) => {
  try {
    const calendar = await calendarService.add(req.body?.name, req.body?.url);
    wsHub.log('info', actor(req), null, `Calendar '${calendar.name}' added`);
    res.json({ success: true, data: calendar });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

calendarsRouter.delete('/:id', (req, res) => {
  const name = calendarService.name(req.params.id);
  if (!calendarService.remove(req.params.id)) return res.status(404).json({ success: false, error: 'Calendar not found' });
  wsHub.log('info', actor(req), null, `Calendar '${name}' removed`);
  res.json({ success: true });
});

// For screens: upcoming events by the calendar's random id. Read-only, no link, no session;
// open to any origin because widgets run in sandboxed frames and on the displays' own origin.
export const calendarFeed = express.Router();

calendarFeed.get('/:id.json', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-store');
  if (!/^[a-f0-9]{24}$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const data = await calendarService.events(req.params.id, Number(req.query.days) || 7);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});
