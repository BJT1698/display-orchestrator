import express from 'express';
import { wikiService } from '../services/wikiService.js';
import { wsHub } from '../ws/websocketServer.js';
import { actor } from '../auth/auth.js';

// Signed-in users connect the wiki with a read-only account; the password never comes back out
export const wikiRouter = express.Router();

wikiRouter.get('/', (req, res) => {
  res.json({ success: true, data: wikiService.info() });
});

wikiRouter.put('/', async (req, res) => {
  try {
    const info = await wikiService.configure(req.body);
    wsHub.log('info', actor(req), null, `Wiki ${info.url} connected as ${info.email}`);
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

wikiRouter.delete('/', (req, res) => {
  wikiService.remove();
  wsHub.log('info', actor(req), null, 'Wiki disconnected');
  res.json({ success: true });
});

// For screens: the numbers by the random feed id. Read-only, no session; open to any origin
// because widgets run in sandboxed frames and on the displays' own origin.
export const wikiFeed = express.Router();

wikiFeed.get('/:id.json', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-store');
  if (!/^[a-f0-9]{24}$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const data = await wikiService.stats(req.params.id);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});
