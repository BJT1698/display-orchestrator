import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Storage directories (allow override via env or fallback to project root)
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const MEDIA_DIR = process.env.MEDIA_DIR || path.resolve(__dirname, '../../media');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.resolve(__dirname, '../public');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

export const config = {
  port: PORT,
  host: HOST,
  dataDir: DATA_DIR,
  mediaDir: MEDIA_DIR,
  publicDir: PUBLIC_DIR,
  dbPath: path.join(DATA_DIR, 'orchestrator.sqlite'),
  heartbeatTimeoutMs: parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '30000', 10), // 30s before display is flagged offline
  // Optional TURN relay for screen sharing across networks that are not routed to the displays.
  // TURN_URLS: comma list, e.g. "turn:192.168.55.10:3478,turn:172.17.11.10:3478"; TURN_SECRET: coturn static-auth-secret
  turnUrls: (process.env.TURN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean),
  turnSecret: process.env.TURN_SECRET || '',
  // Shared key for PCs in a PXE deploy that show their screen (SignageLive.ps1 on the PXE share)
  liveToken: process.env.LIVE_TOKEN || '',
  authSecret: process.env.AUTH_SECRET || 'display-orchestrator-secret-key-2026',
  appVersion: '1.0.0'
};
