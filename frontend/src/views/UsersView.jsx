import React, { useCallback, useEffect, useState } from 'react';
import { Plus, KeyRound, Trash2 } from 'lucide-react';
import { usersApi } from '../services/api';
import { PageHeader, Modal, ErrorNote, Tally, parseServerDate } from '../components/ui';

const ROLE_LABELS = {
  admin: 'Administrator',
  operator: 'Operator',
};

const ROLE_HINTS = {
  admin: 'Everything, including users, pairing and removing screens.',
  operator: 'Content, playlists, schedules, display controls, remote control and screen sharing.',
};

function formatLogin(value) {
  if (!value) return 'Never';
  return parseServerDate(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function UsersView({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(null);

  const load = useCallback(async () => {
    try {
      setUsers(await usersApi.list());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (user, payload) => {
    setError(null);
    try {
      await usersApi.update(user.id, payload);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (user) => {
    if (!confirm(`Delete the account '${user.username}'? This cannot be undone.`)) return;
    setError(null);
    try {
      await usersApi.remove(user.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader title="Users" description="Who can sign in to Signage Control, and what they can change.">
        <button onClick={() => setCreating(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" /> New user
        </button>
      </PageHeader>

      <ErrorNote>{error}</ErrorNote>

      <div className="panel overflow-x-auto">
        <table className="data-table min-w-[760px]">
          <thead>
            <tr>
              <th>User</th>
              <th className="w-56">Role</th>
              <th>Last sign-in</th>
              <th className="text-right">Controls</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isMe = user.id === currentUser.id;
              return (
                <tr key={user.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Tally status={user.disabled ? 'offline' : 'online'} />
                      <div>
                        <div className="font-medium text-ink">
                          {user.username}
                          {isMe && <span className="ml-2 text-xs font-normal text-faint">you</span>}
                        </div>
                        <div className="text-xs text-faint">{user.disabled ? 'Disabled, cannot sign in' : 'Active'}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      value={user.role}
                      onChange={(e) => update(user, { role: e.target.value })}
                      className="control h-8"
                      aria-label={`Role of ${user.username}`}
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="text-muted whitespace-nowrap">{formatLogin(user.lastLoginAt)}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setResetting(user)} className="btn btn-sm btn-quiet" title="Set a new password">
                        <KeyRound className="w-4 h-4" /> Reset password
                      </button>
                      {!isMe && (
                        <button onClick={() => update(user, { disabled: !user.disabled })} className="btn btn-sm btn-quiet">
                          {user.disabled ? 'Enable' : 'Disable'}
                        </button>
                      )}
                      {!isMe && (
                        <button onClick={() => remove(user)} className="btn-icon is-danger" title="Delete account" aria-label={`Delete ${user.username}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm max-w-3xl">
        {Object.entries(ROLE_LABELS).map(([role, label]) => (
          <div key={role}>
            <dt className="text-ink">{label}</dt>
            <dd className="text-muted">{ROLE_HINTS[role]}</dd>
          </div>
        ))}
      </dl>

      {creating && <CreateUserModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} onDone={() => { setResetting(null); load(); }} />}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await usersApi.create({ username, password, role });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New user"
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-quiet">Cancel</button>
          <button type="submit" form="create-user" disabled={busy} className="btn btn-primary">Create user</button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <form id="create-user" onSubmit={submit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="u-name">Username</label>
          <input id="u-name" className="control" autoComplete="off" required autoFocus
            value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="u-pass">Initial password</label>
          <input id="u-pass" type="text" className="control" autoComplete="off" spellCheck="false" required minLength={10}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="field-hint">At least 10 characters. Share it privately; they can change it after signing in.</p>
        </div>
        <fieldset>
          <legend className="field-label">Role</legend>
          <div className="space-y-2">
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <label key={value} className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${role === value ? 'border-ink bg-raised' : 'border-line hover:border-line-strong'}`}>
                <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="mt-1 accent-[#E6E8EB]" />
                <span>
                  <span className="block text-sm text-ink">{label}</span>
                  <span className="block text-xs text-muted">{ROLE_HINTS[value]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await usersApi.update(user.id, { password });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Reset password for ${user.username}`}
      description="They will be signed out everywhere and need the new password to sign in again."
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-quiet">Cancel</button>
          <button type="submit" form="reset-password" disabled={busy} className="btn btn-primary">Set password</button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <form id="reset-password" onSubmit={submit}>
        <label className="field-label" htmlFor="reset-pass">New password</label>
        <input id="reset-pass" type="text" className="control" autoComplete="off" spellCheck="false" required minLength={10} autoFocus
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="field-hint">At least 10 characters.</p>
      </form>
    </Modal>
  );
}
