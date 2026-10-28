import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { getDb } from './db/database.js';
import { wsHub } from './ws/websocketServer.js';
import { displaysRouter } from './routes/displays.js';
import { mediaRouter } from './routes/media.js';
import { playlistsRouter } from './routes/playlists.js';
import { schedulesRouter } from './routes/schedules.js';
import { systemRouter } from './routes/system.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { calendarsRouter, calendarFeed } from './routes/calendars.js';
import { wikiRouter, wikiFeed } from './routes/wiki.js';
import { liveRouter, liveFeed } from './routes/live.js';
import { attachUser, requireUser, requireAdmin, ensureSetupCode, purgeExpiredSessions } from './auth/auth.js';

// Initialize Database on startup
getDb();
ensureSetupCode();
purgeExpiredSessions();
setInterval(purgeExpiredSessions, 60 * 60 * 1000).unref();

const app = express();

// Middlewares (no CORS: the dashboard is same-origin, and the API now needs a session cookie)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static Media Serving (supports video streaming range headers)
app.use('/media', express.static(config.mediaDir, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// Health stays public: displays and the first-boot wizard probe it
app.get(['/health', '/api/health'], (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), time: new Date().toISOString() });
});

// Everything else under /api needs a signed-in user; user management needs an administrator
app.use('/api', attachUser);
app.use('/api/auth', authRouter);
app.use('/api/users', requireAdmin, usersRouter);
app.use('/api', requireUser);

// API Routes
app.use('/api/displays', displaysRouter);
app.use('/api/media', mediaRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/system', systemRouter);
app.use('/api/calendars', calendarsRouter);
app.use('/api/wiki', wikiRouter);
app.use('/api/live', liveRouter);

// Widget previews run in sandboxed iframes (opaque origin) and load these fonts cross-origin
app.use('/fonts', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// Serve frontend SPA
app.use(express.static(config.publicDir));

// Screens of PCs in a PXE deploy: PCs post with the shared key, displays watch by random token
app.use('/live', liveFeed);

// Calendar events for screens (by random id, no session)
app.use('/calendar', calendarFeed);

// Wiki numbers for screens (by random id, no session)
app.use('/wiki', wikiFeed);

// Public page for guests who ask to share their screen (approval happens in the dashboard)
app.get('/cast', (req, res) => res.sendFile(path.join(config.publicDir, 'cast.html')));

// The Android sharing app, when one has been placed in the data directory (it is not in the repo)
app.get('/cast/android.apk', (req, res) => {
  const apk = path.join(config.dataDir, 'signage-cast.apk');
  if (!fs.existsSync(apk)) return res.status(404).send('The Android app is not available on this server.');
  res.type('application/vnd.android.package-archive');
  res.download(apk, 'signage-cast.apk');
});
app.get('/cast/android', (req, res) => {
  res.json({ available: fs.existsSync(path.join(config.dataDir, 'signage-cast.apk')) });
});

// Fallback to index.html for client-side routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/media/') || req.path.startsWith('/ws')) {
    return next();
  }
  const indexPath = path.join(config.publicDir, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      // If frontend has not been built yet, show a clean onboarding status page
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Display Orchestrator Server</title>
          <style>
            body { background: #0b0f17; color: #f1f5f9; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .box { background: #111827; border: 1px solid #1f2937; padding: 40px; border-radius: 16px; max-width: 500px; text-align: center; }
            h1 { color: #22c55e; margin-top: 0; }
            code { background: #1f2937; padding: 4px 8px; border-radius: 6px; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>Display Orchestrator API Online</h1>
            <p>The backend server is running on port <code>${config.port}</code>.</p>
            <p>Build the frontend (<code>npm run build</code> in <code>frontend/</code>) to load the Web Control Dashboard here.</p>
            <p style="color:#94a3b8; font-size:0.9rem;">WebSocket endpoint: <code>ws://localhost:${config.port}/ws</code></p>
          </div>
        </body>
        </html>
      `);
    }
  });
});

// Create HTTP and WebSocket server
const server = http.createServer(app);
wsHub.init(server);

// Start server
server.listen(config.port, config.host, () => {
  console.log(`========================================================`);
  console.log(`🚀 Display Orchestrator Server running on http://${config.host}:${config.port}`);
  console.log(`📡 WebSocket endpoint at ws://${config.host}:${config.port}/ws`);
  console.log(`📁 Media directory: ${config.mediaDir}`);
  console.log(`💾 Database file: ${config.dbPath}`);
  console.log(`========================================================`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down server gracefully...');
  // Displays keep their sockets open forever, so close them or server.close() never returns
  if (wsHub.heartbeatTimer) clearInterval(wsHub.heartbeatTimer);
  if (wsHub.scheduleTimer) clearInterval(wsHub.scheduleTimer);
  if (wsHub.liveTimer) clearInterval(wsHub.liveTimer);
  if (wsHub.wss) {
    for (const client of wsHub.wss.clients) client.terminate();
    wsHub.wss.close();
  }
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 5000).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
