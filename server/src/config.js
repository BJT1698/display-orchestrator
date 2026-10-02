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
  authSecret: process.env.AUTH_SECRET || 'display-orchestrator-secret-key-2026',
  appVersion: '1.0.0'
};
