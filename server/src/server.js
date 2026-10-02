import express from 'express';
import http from 'node:http';
import cors from 'cors';
import path from 'node:path';
import { config } from './config.js';
import { getDb } from './db/database.js';
import { wsHub } from './ws/websocketServer.js';
import { displaysRouter } from './routes/displays.js';
import { mediaRouter } from './routes/media.js';
import { playlistsRouter } from './routes/playlists.js';
import { schedulesRouter } from './routes/schedules.js';
import { systemRouter } from './routes/system.js';

// Initialize Database on startup
getDb();

const app = express();

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static Media Serving (supports video streaming range headers)
app.use('/media', express.static(config.mediaDir, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// API Routes
app.use('/api/displays', displaysRouter);
app.use('/api/media', mediaRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/system', systemRouter);

// Health check endpoints
app.get(['/health', '/api/health'], (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), time: new Date().toISOString() });
});

// Serve frontend SPA
app.use(express.static(config.publicDir));

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
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
