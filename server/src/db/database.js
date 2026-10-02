import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';
import { schemaSql } from './schema.js';

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(config.dbPath);
    initDb(dbInstance);
  }
  return dbInstance;
}

function initDb(db) {
  // Execute multi-statement schema creation
  db.exec(schemaSql);
  seedInitialData(db);
}

function seedInitialData(db) {
  // Check if initial group exists
  const groupCount = db.prepare('SELECT COUNT(*) as cnt FROM display_groups').get();
  if (groupCount.cnt === 0) {
    const insertGroup = db.prepare(
      'INSERT INTO display_groups (name, description) VALUES (?, ?)'
    );
    const mainGroup = insertGroup.run('Default Displays', 'All registered display nodes');

    // Create a Welcome / Demo Playlist
    const insertPlaylist = db.prepare(
      'INSERT INTO playlists (name, description, loop_enabled, transition_effect) VALUES (?, ?, 1, ?)'
    );
    const welcomePlaylist = insertPlaylist.run(
      'Welcome Demo Loop',
      'Default out-of-the-box demo playlist with rich widgets and dashboards',
      'fade'
    );

    // Seed default media items (HTML snippets / widgets & web dashboards)
    const insertMedia = db.prepare(`
      INSERT INTO media (filename, original_name, file_path, media_type, mime_type, duration_seconds, url, content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 1. Welcome Card
    const welcomeHtml = `
      <div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;background:radial-gradient(ellipse at center, #1e293b 0%, #0f172a 100%);color:#f8fafc;font-family:system-ui,sans-serif;text-align:center;padding:40px;box-sizing:border-box;">
        <div style="display:inline-flex;padding:12px 24px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);border-radius:9999px;color:#4ade80;font-weight:600;font-size:1.1rem;margin-bottom:24px;letter-spacing:0.05em;text-transform:uppercase;">
          ✓ Display Orchestrator Active
        </div>
        <h1 style="font-size:3.5rem;font-weight:800;margin:0 0 16px 0;letter-spacing:-0.03em;background:linear-gradient(135deg, #ffffff 0%, #94a3b8 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">
          Welcome to Digital Signage
        </h1>
        <p style="font-size:1.4rem;color:#94a3b8;max-width:800px;line-height:1.6;margin:0 0 32px 0;">
          This screen is remotely managed in real-time. Change playlists, broadcast emergency messages, and monitor status from the Web Orchestrator.
        </p>
        <div style="display:flex;gap:16px;">
          <div style="background:rgba(255,255,255,0.05);padding:16px 28px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);">
            <div style="font-size:0.85rem;color:#64748b;text-transform:uppercase;font-weight:600;">Status</div>
            <div style="font-size:1.25rem;font-weight:700;color:#22c55e;">Ready & Connected</div>
          </div>
          <div style="background:rgba(255,255,255,0.05);padding:16px 28px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);">
            <div style="font-size:0.85rem;color:#64748b;text-transform:uppercase;font-weight:600;">Engine</div>
            <div style="font-size:1.25rem;font-weight:700;color:#38bdf8;">GPU Accelerated</div>
          </div>
        </div>
      </div>
    `;

    const m1 = insertMedia.run(
      'welcome_card.html',
      'Welcome Screen',
      '',
      'html_snippet',
      'text/html',
      12,
      null,
      welcomeHtml
    );

    // 2. Live World Clock & Metric Dashboard Widget
    const clockHtml = `
      <div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(135deg, #090d16 0%, #111827 50%, #0c1524 100%);color:#f8fafc;font-family:system-ui,sans-serif;padding:60px;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:24px;">
          <div style="display:flex;align-items:center;gap:16px;">
            <div style="width:14px;height:14px;border-radius:50%;background:#22c55e;box-shadow:0 0 16px #22c55e;"></div>
            <span style="font-size:1.5rem;font-weight:700;letter-spacing:-0.02em;">GLOBAL TIME & OPERATIONS</span>
          </div>
          <div style="font-size:1.1rem;color:#64748b;font-family:monospace;" id="live-date">OCTOBER 2026</div>
        </div>
        <div style="text-align:center;margin:auto;">
          <div style="font-size:7rem;font-weight:800;font-family:monospace;letter-spacing:-0.04em;color:#ffffff;text-shadow:0 0 30px rgba(56,189,248,0.3);" id="live-clock">--:--:--</div>
          <div style="font-size:1.4rem;color:#38bdf8;font-weight:500;margin-top:8px;">Live Synchronized Timezone</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:24px;border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;">
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);padding:20px;border-radius:16px;text-align:center;">
            <div style="color:#94a3b8;font-size:0.9rem;text-transform:uppercase;">London</div>
            <div style="font-size:1.8rem;font-weight:700;margin-top:4px;" id="london-time">--:--</div>
          </div>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);padding:20px;border-radius:16px;text-align:center;">
            <div style="color:#94a3b8;font-size:0.9rem;text-transform:uppercase;">New York</div>
            <div style="font-size:1.8rem;font-weight:700;margin-top:4px;" id="ny-time">--:--</div>
          </div>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);padding:20px;border-radius:16px;text-align:center;">
            <div style="color:#94a3b8;font-size:0.9rem;text-transform:uppercase;">Tokyo</div>
            <div style="font-size:1.8rem;font-weight:700;margin-top:4px;" id="tokyo-time">--:--</div>
          </div>
        </div>
        <script>
          function updateClocks() {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const clockEl = document.getElementById('live-clock');
            const dateEl = document.getElementById('live-date');
            if (clockEl) clockEl.innerText = now.toLocaleTimeString('en-GB');
            if (dateEl) dateEl.innerText = dateStr.toUpperCase();
            
            const london = document.getElementById('london-time');
            const ny = document.getElementById('ny-time');
            const tokyo = document.getElementById('tokyo-time');
            if (london) london.innerText = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeStyle: 'short' }).format(now);
            if (ny) ny.innerText = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeStyle: 'short' }).format(now);
            if (tokyo) tokyo.innerText = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', timeStyle: 'short' }).format(now);
          }
          setInterval(updateClocks, 1000);
          updateClocks();
        </script>
      </div>
    `;

    const m2 = insertMedia.run(
      'world_clock.html',
      'World Operations Clock',
      '',
      'html_snippet',
      'text/html',
      12,
      null,
      clockHtml
    );

    // 3. Web Dashboard / Wikipedia Featured Page URL
    const m3 = insertMedia.run(
      'earth_view.url',
      'Earth Live Status Webpage',
      '',
      'webpage',
      'text/html',
      15,
      'https://en.wikipedia.org/wiki/Portal:Current_events',
      null
    );

    // Insert items into welcome playlist
    const insertItem = db.prepare(`
      INSERT INTO playlist_items (playlist_id, media_id, custom_url, duration_seconds, display_order, transition)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertItem.run(welcomePlaylist.lastInsertRowid, m1.lastInsertRowid, null, 12, 1, 'fade');
    insertItem.run(welcomePlaylist.lastInsertRowid, m2.lastInsertRowid, null, 12, 2, 'slide-left');
    insertItem.run(welcomePlaylist.lastInsertRowid, m3.lastInsertRowid, null, 15, 3, 'fade');

    // Update group default playlist
    db.prepare('UPDATE display_groups SET default_playlist_id = ? WHERE id = ?').run(
      welcomePlaylist.lastInsertRowid,
      mainGroup.lastInsertRowid
    );

    // Log seed event
    db.prepare(
      'INSERT INTO audit_logs (level, source, message) VALUES (?, ?, ?)'
    ).run('info', 'server', 'Database initialized and seeded with Welcome Demo Playlist');
  }
}

export const db = {
  get: () => getDb(),
  all: (sql, ...params) => getDb().prepare(sql).all(...params),
  getOne: (sql, ...params) => getDb().prepare(sql).get(...params),
  run: (sql, ...params) => getDb().prepare(sql).run(...params),
  exec: (sql) => getDb().exec(sql),
  transaction: (fn) => {
    const database = getDb();
    database.exec('BEGIN TRANSACTION');
    try {
      const result = fn(database);
      database.exec('COMMIT');
      return result;
    } catch (err) {
      database.exec('ROLLBACK');
      throw err;
    }
  }
};
