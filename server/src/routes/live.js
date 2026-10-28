import express from 'express';
import { liveService } from '../services/liveService.js';
import { wsHub } from '../ws/websocketServer.js';
import { db } from '../db/database.js';
import { actor } from '../auth/auth.js';

// PCs in a PXE deploy talk to /live with the shared key (LIVE_TOKEN in server.env); displays and
// dashboards watch at /live/v/<random token>. Signed-in users drive it from /api/live.

export const liveFeed = express.Router();

const keyed = (req, res, next) => {
  if (!liveService.checkToken(req.get('X-Live-Token'))) return res.status(403).json({ error: 'Forbidden' });
  next();
};
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().replace(/^::ffff:/, '');

liveFeed.post('/hello', express.json({ limit: '16kb' }), keyed, (req, res) => {
  res.json(liveService.hello(req.body || {}, clientIp(req)));
});

liveFeed.get('/:id/state', keyed, (req, res) => {
  const state = liveService.state(req.params.id);
  if (!state) return res.status(404).json({ error: 'Say hello first' });
  res.json(state);
});

liveFeed.post('/:id/frame', keyed, express.raw({ type: 'image/jpeg', limit: '3mb' }), (req, res) => {
  const state = liveService.frame(req.params.id, req.body, req.query.kind === 'preview' ? 'preview' : 'live');
  if (!state) return res.status(404).json({ error: 'Say hello first' });
  res.json(state);
});

// The page a display shows: the PC's screen, letterboxed on black, with its name
liveFeed.get('/v/:token', (req, res) => {
  const s = liveService.byViewToken(req.params.token);
  res.set('Cache-Control', 'no-store');
  if (!s) return res.status(404).type('html').send(endedPage());
  const label = `${s.profile} · ${s.name}${s.serial ? ' · ' + s.serial : ''}`.replace(/[<>&"]/g, '');
  res.type('html').send(`<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>${label}</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:system-ui,sans-serif}
img{position:fixed;inset:0;width:100%;height:100%;object-fit:contain}
.tag{position:fixed;left:2vmin;bottom:2vmin;padding:.8vmin 1.6vmin;background:rgba(0,0,0,.65);color:#E6E8EB;font-size:2vmin;border-radius:.6vmin}
.tag i{display:inline-block;width:1.2vmin;height:1.2vmin;border-radius:50%;background:#3FB37F;margin-right:1vmin}</style></head>
<body><img id="s" src="stream.mjpg" alt=""><div class="tag"><i></i>${label}</div>
<script>
// The stream ends when the PC goes away: say so instead of freezing on the last picture
var img = document.getElementById('s');
img.onerror = function(){ setTimeout(function(){ location.reload(); }, 5000); };
</script></body></html>`.replace('src="stream.mjpg"', `src="/live/v/${req.params.token}/stream.mjpg"`));
});

liveFeed.get('/v/:token/stream.mjpg', (req, res) => {
  const s = liveService.byViewToken(req.params.token);
  if (!s) return res.status(404).end();
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-store',
    Connection: 'close',
  });
  liveService.watch(s, res);
});

function endedPage() {
  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#16181C;color:#9AA1AB;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;font-size:3vmin}</style></head><body>Il deploy non è più collegato.</body></html>`;
}

// Dashboard
export const liveRouter = express.Router();

liveRouter.get('/', (req, res) => res.json({ success: true, data: liveService.list(), enabled: liveService.enabled() }));

liveRouter.get('/:id/preview.jpg', (req, res) => {
  const jpeg = liveService.preview(req.params.id);
  if (!jpeg) return res.status(404).end();
  res.set('Cache-Control', 'no-store').type('image/jpeg').send(jpeg);
});

liveRouter.post('/:id/show', express.json(), (req, res) => {
  const s = liveService.get(req.params.id);
  const display = db.getOne('SELECT * FROM displays WHERE id = ?', req.body?.displayId);
  if (!s) return res.status(404).json({ success: false, error: 'That PC is no longer connected.' });
  if (!display) return res.status(404).json({ success: false, error: 'Display not found' });
  const minutes = Math.min(Math.max(Number(req.body?.minutes) || 15, 1), 240);
  const base = wsHub.displayServerBase(display.uuid);
  if (!base) return res.status(409).json({ success: false, error: `${display.name} is offline.` });
  const sent = wsHub.pushUrl(display.uuid, base + `/live/v/${s.viewToken}`, minutes * 60);
  if (!sent) return res.status(409).json({ success: false, error: `${display.name} is offline.` });
  liveService.markShown(s.id, display.uuid, Date.now() + minutes * 60 * 1000);
  wsHub.log('command', actor(req), display.uuid, `Showing the ${s.profile} deploy of ${s.name}${s.serial ? ' (' + s.serial + ')' : ''} on '${display.name}' for ${minutes} min`);
  res.json({ success: true });
});

liveRouter.post('/:id/hide', express.json(), (req, res) => {
  const display = db.getOne('SELECT * FROM displays WHERE id = ?', req.body?.displayId);
  if (!display) return res.status(404).json({ success: false, error: 'Display not found' });
  wsHub.clearPush(display.uuid);
  liveService.markShown(req.params.id, display.uuid, null);
  wsHub.log('command', actor(req), display.uuid, `Stopped showing a deploy on '${display.name}'`);
  res.json({ success: true });
});
