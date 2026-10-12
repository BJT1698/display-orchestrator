import express from 'express';
import { db } from '../db/database.js';
import { wsHub } from '../ws/websocketServer.js';
import {
  ROLES, hashPassword, passwordProblem, publicUser, activeAdminCount, destroyUserSessions,
} from '../auth/auth.js';

// Mounted behind requireAdmin
export const usersRouter = express.Router();

const findUser = (id) => db.getOne('SELECT * FROM users WHERE id = ?', id);

usersRouter.get('/', (req, res) => {
  const users = db.all('SELECT * FROM users ORDER BY username COLLATE NOCASE');
  res.json({ success: true, data: users.map(publicUser) });
});

usersRouter.post('/', (req, res) => {
  const { username, password, role } = req.body || {};
  const name = String(username || '').trim();
  if (!name) return res.status(400).json({ success: false, error: 'Choose a username.' });
  if (!ROLES.includes(role)) return res.status(400).json({ success: false, error: 'Choose a role.' });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ success: false, error: problem });
  if (db.getOne('SELECT id FROM users WHERE username = ? COLLATE NOCASE', name)) {
    return res.status(409).json({ success: false, error: `The username '${name}' is already taken.` });
  }

  const result = db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', name, hashPassword(password), role);
  wsHub.log('info', req.user.username, null, `Created user '${name}' (${role})`);
  res.json({ success: true, data: publicUser(findUser(result.lastInsertRowid)) });
});

usersRouter.put('/:id', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
  const { role, disabled, password } = req.body || {};

  const losesAdmin =
    (role !== undefined && role !== 'admin' && user.role === 'admin') ||
    (disabled === true && user.role === 'admin');
  if (losesAdmin && activeAdminCount(user.id) === 0) {
    return res.status(409).json({ success: false, error: 'Keep at least one active administrator.' });
  }
  if (role !== undefined && !ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: 'Choose a role.' });
  }
  if (password !== undefined) {
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ success: false, error: problem });
  }

  db.run(
    'UPDATE users SET role = ?, disabled = ?, password_hash = ? WHERE id = ?',
    role ?? user.role,
    disabled === undefined ? user.disabled : (disabled ? 1 : 0),
    password !== undefined ? hashPassword(password) : user.password_hash,
    user.id
  );

  // A disabled account or a reset password signs that person out everywhere
  if (disabled === true || password !== undefined) {
    destroyUserSessions(user.id);
    wsHub.closeDashboardsOfUser(user.id);
  }

  const changes = [
    role !== undefined && role !== user.role ? `role ${role}` : null,
    disabled !== undefined && Boolean(disabled) !== Boolean(user.disabled) ? (disabled ? 'disabled' : 'enabled') : null,
    password !== undefined ? 'password reset' : null,
  ].filter(Boolean);
  if (changes.length) wsHub.log('info', req.user.username, null, `Updated user '${user.username}': ${changes.join(', ')}`);

  res.json({ success: true, data: publicUser(findUser(user.id)) });
});

usersRouter.delete('/:id', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
  if (user.id === req.user.id) {
    return res.status(409).json({ success: false, error: 'You cannot delete your own account.' });
  }
  if (user.role === 'admin' && !user.disabled && activeAdminCount(user.id) === 0) {
    return res.status(409).json({ success: false, error: 'Keep at least one active administrator.' });
  }
  db.run('DELETE FROM users WHERE id = ?', user.id);
  wsHub.closeDashboardsOfUser(user.id);
  wsHub.log('info', req.user.username, null, `Deleted user '${user.username}'`);
  res.json({ success: true });
});
