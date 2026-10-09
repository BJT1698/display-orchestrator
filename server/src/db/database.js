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
      <style>
        @font-face{font-family:'Archivo Player';font-weight:100 900;font-stretch:62% 125%;src:url(fonts/archivo-latin-standard-normal.woff2) format('woff2-variations');}
      </style>
      <div style="position:relative;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;background:#16181C;color:#E6E8EB;font-family:'Archivo Player','Archivo Variable',system-ui,sans-serif;padding:8vmin;box-sizing:border-box;">
        <div style="position:absolute;inset:0 0 auto 0;height:0.8vmin;background:#3FB37F;"></div>
        <h1 style="margin:0;font-size:9vmin;font-stretch:80%;font-weight:650;line-height:1;letter-spacing:-0.01em;">This screen is ready</h1>
        <p style="margin:3vmin 0 0;max-width:36ch;font-size:3.2vmin;line-height:1.35;color:#9AA1AB;">
          Its content is managed in Signage Control. Replace this demo playlist with your own to get started.
        </p>
      </div>
    `;

    const m1 = insertMedia.run(
      'welcome_card.html',
      'Welcome screen',
      '',
      'html_snippet',
      'text/html',
      12,
      null,
      welcomeHtml
    );

    // 2. Live World Clock & Metric Dashboard Widget
    const clockHtml = `
      <style>
        @font-face{font-family:'Archivo Player';font-weight:100 900;font-stretch:62% 125%;src:url(fonts/archivo-latin-standard-normal.woff2) format('woff2-variations');}
      </style>
      <div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;background:#16181C;color:#E6E8EB;font-family:'Archivo Player','Archivo Variable',system-ui,sans-serif;font-variant-numeric:tabular-nums;padding:8vmin;box-sizing:border-box;">
        <div id="live-date" style="font-size:3.2vmin;color:#9AA1AB;"></div>
        <div id="live-clock" style="font-size:24vmin;font-stretch:80%;font-weight:650;line-height:1;letter-spacing:-0.01em;">--:--</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #33383F;padding-top:3vmin;">
          <div><div style="font-size:2.4vmin;color:#6B727C;">London</div><div id="london-time" style="font-size:5vmin;font-weight:600;margin-top:0.6vmin;">--:--</div></div>
          <div><div style="font-size:2.4vmin;color:#6B727C;">New York</div><div id="ny-time" style="font-size:5vmin;font-weight:600;margin-top:0.6vmin;">--:--</div></div>
          <div><div style="font-size:2.4vmin;color:#6B727C;">Tokyo</div><div id="tokyo-time" style="font-size:5vmin;font-weight:600;margin-top:0.6vmin;">--:--</div></div>
        </div>
        <script>
          function updateClocks() {
            const now = new Date();
            const fmt = (tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(now);
            document.getElementById('live-clock').textContent = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(now);
            document.getElementById('live-date').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            document.getElementById('london-time').textContent = fmt('Europe/London');
            document.getElementById('ny-time').textContent = fmt('America/New_York');
            document.getElementById('tokyo-time').textContent = fmt('Asia/Tokyo');
          }
          setInterval(updateClocks, 1000);
          updateClocks();
        </script>
      </div>
    `;

    const m2 = insertMedia.run(
      'world_clock.html',
      'World clock',
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
