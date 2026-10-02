export const schemaSql = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS display_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  default_playlist_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS displays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  token TEXT,
  group_id INTEGER REFERENCES display_groups(id) ON DELETE SET NULL,
  ip_address TEXT,
  status TEXT DEFAULT 'offline',
  last_heartbeat TEXT,
  current_playlist_id INTEGER,
  orientation TEXT DEFAULT 'landscape',
  resolution TEXT DEFAULT '1920x1080',
  metrics TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  media_type TEXT NOT NULL, -- 'image', 'video', 'webpage', 'html_snippet'
  mime_type TEXT,
  size_bytes INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 10,
  url TEXT,
  content TEXT,
  thumbnail_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  loop_enabled INTEGER DEFAULT 1,
  transition_effect TEXT DEFAULT 'fade',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
  custom_url TEXT,
  duration_seconds INTEGER DEFAULT 10,
  display_order INTEGER NOT NULL DEFAULT 0,
  transition TEXT DEFAULT 'fade',
  active_from TEXT,
  active_to TEXT,
  days_of_week TEXT DEFAULT '[1,2,3,4,5,6,7]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL, -- 'display' or 'group'
  target_id INTEGER NOT NULL,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  days_of_week TEXT DEFAULT '[1,2,3,4,5,6,7]',
  priority INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pairing_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pairing_code TEXT UNIQUE NOT NULL,
  uuid TEXT UNIQUE NOT NULL,
  client_name TEXT,
  ip_address TEXT,
  token TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT DEFAULT 'info',
  source TEXT NOT NULL,
  display_uuid TEXT,
  message TEXT NOT NULL,
  payload TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_displays_uuid ON displays(uuid);
CREATE INDEX IF NOT EXISTS idx_displays_status ON displays(status);
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);
`;
