import crypto from 'node:crypto';
import { config } from '../config.js';

// PCs in a Dell or Lenovo PXE deploy (WinPE) that can show their screen on a display. The PC's
// SignageLive.ps1 registers, sends a small preview every 30 s, and full frames only while someone
// watches. Everything lives in memory: a PC that stops talking for 30 s disappears.

const GONE_AFTER_MS = 30 * 1000;
const STREAM_LINGER_MS = 10 * 1000; // keep streaming briefly after the last viewer leaves
const MAX_FRAME_BYTES = 3 * 1024 * 1024;

const sources = new Map(); // id -> source
let onChange = () => {};
let onGone = () => {};

function publicSource(s) {
  return {
    id: s.id,
    name: s.name,
    model: s.model,
    serial: s.serial,
    ip: s.ip,
    profile: s.profile,
    viewPath: `/live/v/${s.viewToken}`,
    watching: s.watchers.size,
    shownOn: Object.keys(s.shownOn),
    previewAt: s.previewAt,
    since: s.since,
  };
}

function streaming(s) {
  return s.watchers.size > 0 || Date.now() - s.lastWatcherAt < STREAM_LINGER_MS;
}

export const liveService = {
  enabled: () => Boolean(config.liveToken),

  // The dashboard hub plugs in here to hear about changes and departures
  hooks({ changed, gone }) {
    onChange = changed;
    onGone = gone;
  },

  checkToken(token) {
    if (!config.liveToken || typeof token !== 'string') return false;
    const a = Buffer.from(token);
    const b = Buffer.from(config.liveToken);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  // Same PC (serial + MAC) keeps its id across script restarts
  hello(info, ip) {
    const clean = (v, n = 80) => String(v || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
    const serial = clean(info.serial, 40);
    const mac = clean(info.mac, 40);
    const id = crypto.createHash('sha256').update(`${serial}|${mac}|${ip}`).digest('hex').slice(0, 16);
    let s = sources.get(id);
    if (!s) {
      s = {
        id,
        viewToken: crypto.randomBytes(16).toString('hex'),
        since: new Date().toISOString(),
        watchers: new Set(),
        lastWatcherAt: 0,
        shownOn: {}, // display uuid -> expiresAt
        frame: null,
        preview: null,
        previewAt: null,
      };
      sources.set(id, s);
    }
    Object.assign(s, {
      name: clean(info.name) || clean(info.model) || 'PC',
      model: clean(info.model),
      serial,
      ip,
      profile: clean(info.profile, 20) || 'Deploy',
      lastSeen: Date.now(),
    });
    onChange();
    return { id, stream: streaming(s) };
  },

  // Heartbeat and control in one: the PC asks whether to stream
  state(id) {
    const s = sources.get(id);
    if (!s) return null;
    s.lastSeen = Date.now();
    return { stream: streaming(s) };
  },

  frame(id, buffer, kind) {
    const s = sources.get(id);
    if (!s) return null;
    if (!buffer?.length || buffer.length > MAX_FRAME_BYTES) return { stream: streaming(s) };
    s.lastSeen = Date.now();
    if (kind === 'preview') {
      s.preview = buffer;
      s.previewAt = new Date().toISOString();
      onChange();
    } else {
      s.frame = buffer;
      for (const res of s.watchers) writePart(res, buffer);
    }
    return { stream: streaming(s) };
  },

  byViewToken(token) {
    for (const s of sources.values()) if (s.viewToken === token) return s;
    return null;
  },

  // An MJPEG viewer (display page or dashboard); the PC starts streaming at its next check
  watch(s, res) {
    s.watchers.add(res);
    onChange();
    if (s.frame) writePart(res, s.frame);
    else if (s.preview) writePart(res, s.preview);
    res.on('close', () => {
      s.watchers.delete(res);
      s.lastWatcherAt = Date.now();
      onChange();
    });
  },

  get: (id) => sources.get(id) || null,
  list: () => [...sources.values()].map(publicSource),
  preview: (id) => sources.get(id)?.preview || null,

  markShown(id, uuid, expiresAt) {
    const s = sources.get(id);
    if (!s) return;
    if (expiresAt) s.shownOn[uuid] = expiresAt;
    else delete s.shownOn[uuid];
    onChange();
  },

  // Drop PCs that went quiet (deploy finished, rebooted, unplugged) and expired display slots
  sweep() {
    const now = Date.now();
    let changed = false;
    for (const s of [...sources.values()]) {
      for (const [uuid, until] of Object.entries(s.shownOn)) {
        if (until <= now) { delete s.shownOn[uuid]; changed = true; }
      }
      if (now - s.lastSeen > GONE_AFTER_MS) {
        sources.delete(s.id);
        for (const res of s.watchers) res.end();
        onGone(s, Object.keys(s.shownOn));
        changed = true;
      }
    }
    if (changed) onChange();
  },
};

function writePart(res, jpeg) {
  if (res.writableEnded) return;
  res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
  res.write(jpeg);
  res.write('\r\n');
}
