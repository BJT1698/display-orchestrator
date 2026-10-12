import React, { useState } from 'react';
import { auth } from '../services/api';
import { Modal, ErrorNote } from './ui';

export function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) {
      setError('The two new passwords are different.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await auth.changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal title="Password changed" onClose={onClose} width="max-w-md"
        footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
        <p className="text-sm text-muted">Other devices where you were signed in have been signed out.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Change password"
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-quiet">Cancel</button>
          <button type="submit" form="change-password" disabled={busy} className="btn btn-primary">
            {busy ? 'Saving' : 'Change password'}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <form id="change-password" onSubmit={submit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="pw-current">Current password</label>
          <input id="pw-current" type="password" className="control" autoComplete="current-password" required autoFocus
            value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="pw-new">New password</label>
          <input id="pw-new" type="password" className="control" autoComplete="new-password" required minLength={10}
            value={next} onChange={(e) => setNext(e.target.value)} />
          <p className="field-hint">At least 10 characters.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="pw-confirm">Repeat new password</label>
          <input id="pw-confirm" type="password" className="control" autoComplete="new-password" required minLength={10}
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
