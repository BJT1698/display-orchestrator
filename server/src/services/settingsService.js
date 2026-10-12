import { db } from '../db/database.js';

// Night and weekend mode: outside working hours every screen plays one playlist (e.g. a clock)
const AFTER_HOURS_DEFAULTS = {
  enabled: false,
  playlistId: null,
  days: [1, 2, 3, 4, 5], // 1 = Monday ... 7 = Sunday
  start: '08:00',
  end: '19:00',
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function read(key, fallback) {
  const row = db.getOne('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return { ...fallback, ...JSON.parse(row.value) };
  } catch {
    return fallback;
  }
}

function write(key, value) {
  db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key, JSON.stringify(value)
  );
}

export const settingsService = {
  getAfterHours() {
    return read('after_hours', AFTER_HOURS_DEFAULTS);
  },

  // Returns [value, null] or [null, error message]
  validateAfterHours(input) {
    const value = { ...this.getAfterHours(), ...input };
    value.enabled = Boolean(value.enabled);
    value.playlistId = value.playlistId ? Number(value.playlistId) : null;
    value.days = [...new Set((value.days || []).map(Number))].filter((d) => d >= 1 && d <= 7).sort();
    if (!TIME.test(value.start) || !TIME.test(value.end)) return [null, 'Use times like 08:00.'];
    if (value.start >= value.end) return [null, 'Working hours must end after they start.'];
    if (value.enabled && !value.playlistId) return [null, 'Choose the playlist to show after hours.'];
    if (value.playlistId && !db.getOne('SELECT id FROM playlists WHERE id = ?', value.playlistId)) {
      return [null, 'That playlist no longer exists.'];
    }
    return [value, null];
  },

  setAfterHours(value) {
    write('after_hours', value);
  },
};
