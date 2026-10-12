import express from 'express';
import { db } from '../db/database.js';
import { wsHub } from '../ws/websocketServer.js';
import {
  authenticate, createSession, destroySession, destroyUserSessions, setSessionCookie, clearSessionCookie,
  publicUser, needsSetup, checkSetupCode, finishSetup, hashPassword, verifyPassword, passwordProblem,
  loginLockedFor, recordLoginFailure, clearLoginFailures, requireUser,
} from '../auth/auth.js';

export const authRouter = express.Router();

// Who is signed in, and whether the first administrator still has to be created
authRouter.get('/me', (req, res) => {
  res.json({ success: true, data: { user: publicUser(req.user), needsSetup: needsSetup() } });
});

authRouter.post('/setup', (req, res) => {
  const { code, username, password } = req.body || {};
  if (!needsSetup()) {
    return res.status(409).json({ success: false, error: 'An administrator already exists. Sign in instead.' });
  }
  if (!checkSetupCode(code)) {
    return res.status(403).json({ success: false, error: 'This setup code is not valid. Copy it again from the server log.' });
  }
  const name = String(username || '').trim();
  if (!name) return res.status(400).json({ success: false, error: 'Choose a username.' });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ success: false, error: problem });

  const result = db.run(
    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')",
    name, hashPassword(password)
  );
  finishSetup();
  const token = createSession(result.lastInsertRowid);
  setSessionCookie(req, res, token);
  wsHub.log('info', name, null, `First administrator '${name}' created`);
  const user = db.getOne('SELECT * FROM users WHERE id = ?', result.lastInsertRowid);
  res.json({ success: true, data: { user: publicUser(user) } });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const key = `${req.ip}|${String(username || '').trim().toLowerCase()}`;
  const locked = loginLockedFor(key);
  if (locked) {
    return res.status(429).json({
      success: false,
      error: `Too many attempts. Try again in ${Math.ceil(locked / 1000)} seconds.`,
    });
  }

  const user = authenticate(username, password);
  if (!user) {
    recordLoginFailure(key);
    return res.status(401).json({ success: false, error: 'Wrong username or password.' });
  }

  clearLoginFailures(key);
  setSessionCookie(req, res, createSession(user.id));
  res.json({ success: true, data: { user: publicUser(user) } });
});

authRouter.post('/logout', (req, res) => {
  wsHub.closeDashboardsOfSession(req.sessionToken);
  destroySession(req.sessionToken);
  clearSessionCookie(req, res);
  res.json({ success: true });
});

authRouter.post('/password', requireUser, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!verifyPassword(String(currentPassword || ''), req.user.password_hash)) {
    return res.status(400).json({ success: false, error: 'Your current password is not correct.' });
  }
  const problem = passwordProblem(newPassword);
  if (problem) return res.status(400).json({ success: false, error: problem });

  db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(newPassword), req.user.id);
  // Sign out every other device of this user, keep this one
  destroyUserSessions(req.user.id);
  setSessionCookie(req, res, createSession(req.user.id));
  wsHub.log('info', req.user.username, null, 'Changed own password');
  res.json({ success: true });
});
