import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/database.js';
import { config } from '../config.js';

export const ROLES = ['admin', 'operator'];
export const SESSION_COOKIE = 'sc_session';
export const MIN_PASSWORD_LENGTH = 10;
const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000; // signed out after a week without use
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

// --- Passwords -------------------------------------------------------------

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const key = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  return crypto.timingSafeEqual(key, expected);
}

// A hash to compare against when the username does not exist, so timing does not reveal it
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

// --- Users -----------------------------------------------------------------

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    disabled: Boolean(user.disabled),
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  };
}

export function userCount() {
  return db.getOne('SELECT COUNT(*) AS n FROM users').n;
}

export function activeAdminCount(excludeId = null) {
  return db.getOne(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0 AND id != ?",
    excludeId ?? -1
  ).n;
}

export function authenticate(username, password) {
  const user = db.getOne('SELECT * FROM users WHERE username = ? COLLATE NOCASE', String(username || '').trim());
  const ok = verifyPassword(String(password || ''), user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok || user.disabled) return null;
  db.run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", user.id);
  return user;
}

// --- Sessions --------------------------------------------------------------
// The browser holds a random token; only its SHA-256 is stored, so a leaked database cannot be replayed.

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.run(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    tokenHash(token), userId, new Date(Date.now() + SESSION_IDLE_MS).toISOString()
  );
  return token;
}

export function destroySession(token) {
  if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash(token));
}

export function destroyUserSessions(userId) {
  db.run('DELETE FROM sessions WHERE user_id = ?', userId);
}

export function userForToken(token) {
  if (!token) return null;
  const row = db.getOne(
    `SELECT s.token_hash, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    tokenHash(token)
  );
  if (!row) return null;
  if (row.disabled || new Date(row.expires_at).getTime() < Date.now()) {
    db.run('DELETE FROM sessions WHERE token_hash = ?', row.token_hash);
    return null;
  }
  // Sliding expiry, written at most once an hour per session
  const renewed = Date.now() + SESSION_IDLE_MS;
  if (renewed - new Date(row.expires_at).getTime() > 60 * 60 * 1000) {
    db.run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', new Date(renewed).toISOString(), row.token_hash);
  }
  return row;
}

export function purgeExpiredSessions() {
  db.run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString());
}

// --- Cookies ---------------------------------------------------------------

export function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// Secure only over HTTPS (caddy sets X-Forwarded-Proto); the dashboard is also reachable on plain HTTP in the LAN
function isHttps(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

export function setSessionCookie(req, res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(req),
    path: '/',
    maxAge: SESSION_IDLE_MS,
  });
}

export function clearSessionCookie(req, res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: isHttps(req), path: '/' });
}

// --- First-run setup ---------------------------------------------------------
// With no users yet, creating the first admin needs a one-time code that only someone with
// access to the server (log or data folder) can read, so nobody else on the LAN can claim it.

let setupCode = null;
const setupCodeFile = () => path.join(config.dataDir, 'setup-code.txt');

export function needsSetup() {
  return userCount() === 0;
}

export function ensureSetupCode() {
  if (!needsSetup()) {
    setupCode = null;
    fs.rmSync(setupCodeFile(), { force: true });
    return;
  }
  setupCode = crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g).join('-');
  fs.writeFileSync(setupCodeFile(), `${setupCode}\n`, { mode: 0o600 });
  console.log('========================================================');
  console.log(`🔑 No users yet. Setup code for the first administrator: ${setupCode}`);
  console.log(`   (also in ${setupCodeFile()})`);
  console.log('========================================================');
}

export function checkSetupCode(code) {
  if (!setupCode) return false;
  const given = Buffer.from(String(code || '').trim().toUpperCase());
  const expected = Buffer.from(setupCode);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function finishSetup() {
  setupCode = null;
  fs.rmSync(setupCodeFile(), { force: true });
}

// --- Login throttling -------------------------------------------------------

const failures = new Map(); // key -> { count, until }
const MAX_FAILURES = 5;
const LOCK_MS = 60 * 1000;

export function loginLockedFor(key) {
  const entry = failures.get(key);
  if (!entry || entry.count < MAX_FAILURES) return 0;
  const left = entry.until - Date.now();
  if (left <= 0) {
    failures.delete(key);
    return 0;
  }
  return left;
}

export function recordLoginFailure(key) {
  const entry = failures.get(key) || { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) entry.until = Date.now() + LOCK_MS;
  failures.set(key, entry);
}

export function clearLoginFailures(key) {
  failures.delete(key);
}

// --- Middleware ---------------------------------------------------------------

export function attachUser(req, res, next) {
  req.sessionToken = readCookie(req.headers.cookie, SESSION_COOKIE);
  req.user = userForToken(req.sessionToken);
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Sign in to continue.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Sign in to continue.' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Only an administrator can do this.' });
  }
  next();
}

// Name shown in the event log for actions taken from the dashboard
export const actor = (req) => req.user?.username || 'dashboard';
