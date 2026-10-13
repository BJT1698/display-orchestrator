import crypto from 'node:crypto';
import ical from 'node-ical';
import { db } from '../db/database.js';

// Calendars published as ICS links (e.g. Outlook "Publish a calendar"). The links stay on the
// server: dashboards see only the name, screens ask for events by a random id. Each calendar is
// downloaded at most every 5 minutes, and the last good copy is kept if Outlook is unreachable.

const KEY = 'calendars';
const REFRESH_MS = 5 * 60 * 1000;
const cache = new Map(); // id -> { at, events, error }

function list() {
  const row = db.getOne('SELECT value FROM settings WHERE key = ?', KEY);
  try {
    return row ? JSON.parse(row.value) : [];
  } catch {
    return [];
  }
}

function save(calendars) {
  db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    KEY, JSON.stringify(calendars)
  );
}

const text = (v) => (v && typeof v === 'object' ? v.val : v) || '';

async function download(url) {
  const res = await fetch(url, { headers: { Accept: 'text/calendar' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`The calendar answered ${res.status}`);
  const body = await res.text();
  if (!body.includes('BEGIN:VCALENDAR')) throw new Error('That link does not return a calendar (ICS).');
  return body;
}

// Every event touching [from, to], recurring meetings expanded, sorted by start
function eventsBetween(ics, from, to) {
  const parsed = ical.sync.parseICS(ics);
  const out = [];
  for (const item of Object.values(parsed)) {
    if (item.type !== 'VEVENT' || item.recurrenceid) continue; // overrides come through their base event
    if (text(item.status).toUpperCase() === 'CANCELLED') continue;
    let instances;
    try {
      instances = ical.expandRecurringEvent(item, { from, to, expandOngoing: true });
    } catch {
      continue; // one broken event must not hide the others
    }
    for (const inst of instances) {
      const ev = inst.event || item;
      if (text(ev.status).toUpperCase() === 'CANCELLED') continue;
      const start = new Date(inst.start);
      const end = new Date(inst.end || inst.start);
      if (end < from || start > to) continue;
      out.push({
        title: text(ev.summary).trim() || 'Occupato',
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: Boolean(inst.isFullDay),
        location: text(ev.location).trim(),
        // Outlook marks private appointments: show them as busy, without the details
        private: ['PRIVATE', 'CONFIDENTIAL'].includes(text(ev.class).toUpperCase()),
      });
    }
  }
  return out
    .map((e) => (e.private ? { ...e, title: 'Privato', location: '' } : e))
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

export const calendarService = {
  // Names and ids only: the links never leave the server
  publicList() {
    return list().map(({ id, name }) => ({ id, name }));
  },

  async add(name, url) {
    const cleanName = String(name || '').trim().slice(0, 60);
    const cleanUrl = String(url || '').trim().replace(/^webcal:\/\//i, 'https://');
    if (!cleanName) throw new Error('Give the calendar a name.');
    let parsed;
    try {
      parsed = new URL(cleanUrl);
    } catch {
      throw new Error('That is not a valid link.');
    }
    if (parsed.protocol !== 'https:') throw new Error('Use the https link of the published calendar.');
    // Check it really is a calendar before saving it
    const ics = await download(cleanUrl);
    const calendar = { id: crypto.randomBytes(12).toString('hex'), name: cleanName, url: cleanUrl };
    save([...list(), calendar]);
    cache.set(calendar.id, { at: Date.now(), ics, error: null });
    return { id: calendar.id, name: calendar.name };
  },

  remove(id) {
    const before = list();
    const after = before.filter((c) => c.id !== id);
    if (after.length === before.length) return false;
    save(after);
    cache.delete(id);
    return true;
  },

  name(id) {
    return list().find((c) => c.id === id)?.name || null;
  },

  /** Upcoming events for a screen: today from midnight, the next `days` days */
  async events(id, days = 7) {
    const calendar = list().find((c) => c.id === id);
    if (!calendar) return null;
    let entry = cache.get(id);
    if (!entry || Date.now() - entry.at > REFRESH_MS) {
      try {
        entry = { at: Date.now(), ics: await download(calendar.url), error: null };
      } catch (err) {
        // Keep showing the last copy; try again at the next refresh
        entry = { ...(entry || { ics: null }), at: Date.now(), error: err.message };
      }
      cache.set(id, entry);
    }
    if (!entry.ics) return { name: calendar.name, events: [], updatedAt: null, error: entry.error };
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + Math.min(Math.max(days, 1), 31) * 24 * 3600 * 1000);
    return {
      name: calendar.name,
      events: eventsBetween(entry.ics, from, to),
      updatedAt: new Date(entry.at).toISOString(),
      error: entry.error,
    };
  },
};
