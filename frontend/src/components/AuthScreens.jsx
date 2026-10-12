import React, { useState } from 'react';
import { auth } from '../services/api';
import { ErrorNote } from './ui';

function AuthLayout({ title, intro, children }) {
  return (
    <div className="min-h-screen bg-ground flex">
      {/* A thin tally strip, as on the screens: amber = waiting for someone to sign in */}
      <div className="fixed inset-x-0 top-0 h-1 bg-caution" aria-hidden="true" />
      <main className="w-full max-w-md mx-auto sm:mx-0 sm:ml-[12vw] px-6 py-16 flex flex-col justify-center">
        <div className="display text-xl font-semibold text-ink">Signage Control</div>
        <h1 className="mt-10 text-3xl font-semibold text-ink">{title}</h1>
        {intro && <p className="mt-2 text-sm text-muted max-w-[46ch]">{intro}</p>}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

export function SignInScreen({ onSignedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await auth.login(username, password);
      onSignedIn(data.user);
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Sign in">
      <ErrorNote>{error}</ErrorNote>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="login-user">Username</label>
          <input id="login-user" className="control h-10" autoComplete="username" autoFocus required
            value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="login-pass">Password</label>
          <input id="login-pass" type="password" className="control h-10" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary w-full h-10" disabled={busy}>
          {busy ? 'Signing in' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-xs text-faint">Forgot your password? Ask an administrator to reset it.</p>
    </AuthLayout>
  );
}

export function SetupScreen({ onSignedIn }) {
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords are different.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await auth.setup(code, username, password);
      onSignedIn(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create the first administrator"
      intro="Nobody can sign in yet. To prove you manage the server, enter the setup code it printed in its log when it started."
    >
      <ErrorNote>{error}</ErrorNote>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="setup-code">Setup code</label>
          <input id="setup-code" className="control h-10 display text-lg tracking-[0.15em] uppercase" autoComplete="off"
            spellCheck="false" placeholder="XXXXX-XXXXX" required autoFocus
            value={code} onChange={(e) => setCode(e.target.value)} />
          <p className="field-hint">On the server: <code className="text-muted">journalctl -u display-orchestrator-server | grep "Setup code"</code></p>
        </div>
        <div>
          <label className="field-label" htmlFor="setup-user">Username</label>
          <input id="setup-user" className="control h-10" autoComplete="username" required
            value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label" htmlFor="setup-pass">Password</label>
            <input id="setup-pass" type="password" className="control h-10" autoComplete="new-password" required minLength={10}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="setup-pass2">Repeat password</label>
            <input id="setup-pass2" type="password" className="control h-10" autoComplete="new-password" required minLength={10}
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <p className="field-hint -mt-2">At least 10 characters.</p>
        <button type="submit" className="btn btn-primary w-full h-10" disabled={busy}>
          {busy ? 'Creating account' : 'Create administrator'}
        </button>
      </form>
    </AuthLayout>
  );
}
