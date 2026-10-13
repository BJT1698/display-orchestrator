import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MonitorUp } from 'lucide-react';
import { useScreenCast } from '../components/ScreenCast';
import '../index.css';

// Public page: anyone on the network asks to share their screen to a display; an operator
// approves it in the dashboard, then the stream works exactly like sharing from the dashboard.

const ENDED_TEXT = {
  rejected: 'The request was declined.',
  expired: 'The time granted for sharing is over.',
  stopped: 'An operator stopped the sharing.',
  lapsed: 'Nobody answered the request in 10 minutes.',
  busy: 'Too many requests right now. Try again in a few minutes.',
  lost: 'The connection to the server dropped.',
};

const CAST_TEXT = {
  choosing: 'Choose what to share in the browser window.',
  connecting: 'Connecting to the screen…',
  connected: 'You are on screen.',
  disconnected: 'Connection unstable, trying to recover…',
  failed: 'The screen could not receive the stream. Try again.',
  offline: 'The screen is offline.',
  replaced: 'Someone else took over this screen.',
  timeout: 'The screen did not answer. Try again.',
  insecure: 'Screen sharing needs this page to be opened over HTTPS.',
  denied: 'Sharing was cancelled.',
};

function useGuestSocket() {
  const socketRef = useRef(null);
  const listeners = useRef(new Set());
  const [connected, setConnected] = useState(false);
  const [displays, setDisplays] = useState([]);
  const [request, setRequest] = useState({ status: 'idle' });

  useEffect(() => {
    let socket;
    let retry;
    let closed = false;
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/ws?type=guest`);
      socketRef.current = socket;
      socket.onopen = () => setConnected(true);
      socket.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'GUEST_DISPLAYS') setDisplays(msg.data || []);
        else if (msg.type === 'GUEST_STATUS') setRequest((r) => ({ ...r, ...msg }));
        else listeners.current.forEach((fn) => fn(msg));
      };
      socket.onclose = () => {
        setConnected(false);
        // The server forgets the request with the connection, so start over
        setRequest((r) => (r.status === 'idle' ? r : { status: 'lost' }));
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    // Leaving the page must end the request at once, even if the browser keeps the page cached
    const leave = () => socketRef.current?.close();
    window.addEventListener('pagehide', leave);
    return () => {
      closed = true;
      clearTimeout(retry);
      window.removeEventListener('pagehide', leave);
      socket?.close();
    };
  }, []);

  const send = useCallback((msg) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(msg));
    return true;
  }, []);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  return { connected, displays, request, setRequest, send, subscribe };
}

const formatClock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function GuestCastPage() {
  const guest = useGuestSocket();
  const cast = useScreenCast({ sendWs: guest.send, subscribe: guest.subscribe, wsConnected: guest.connected, iceServers: guest.request.iceServers });
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('guest-cast-name') || '';
    } catch {
      return '';
    }
  });
  const [uuid, setUuid] = useState('');
  const { request } = guest;
  const insecure = !window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia;

  const ask = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem('guest-cast-name', name.trim());
    } catch {
      // private window: nothing to remember
    }
    if (guest.send({ type: 'GUEST_REQUEST', name: name.trim(), uuid: uuid || null })) {
      guest.setRequest({ status: 'sending' });
    }
  };

  // The approval ended (time over, stopped, declined): drop any stream still running
  const ended = Boolean(ENDED_TEXT[request.status]);
  const { stop: stopCast, session } = cast;
  useEffect(() => {
    if (ended && session) stopCast();
  }, [ended, session, stopCast]);

  const live = cast.session && ['choosing', 'connecting', 'connected', 'disconnected'].includes(cast.session.status);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 text-sm text-muted mb-6">
          <MonitorUp className="w-4 h-4" /> Signage Control
        </div>
        <h1 className="display text-3xl font-semibold text-ink">Share your screen</h1>

        {insecure && (
          <div className="mt-6 px-3 py-2.5 rounded border border-alert/50 bg-alert/10 text-sm text-ink">
            This browser cannot share the screen from this address. Open the page over HTTPS, at {`https://${window.location.host}/cast`}.
          </div>
        )}

        {(request.status === 'idle' || request.status === 'sending' || ended) && (
          <>
            {ended && (
              <div className="mt-6 px-3 py-2.5 rounded border border-line bg-raised text-sm text-ink">
                {ENDED_TEXT[request.status] || 'The request ended.'}
              </div>
            )}
            <p className="mt-3 text-sm text-muted">
              Ask to show your screen on one of the office displays. Someone at the signage console approves the request, then you choose what to share.
            </p>
            <form onSubmit={ask} className="mt-6 space-y-4">
              <div>
                <label className="field-label" htmlFor="g-name">Your name</label>
                <input id="g-name" className="control" value={name} maxLength={40} required autoComplete="name"
                  onChange={(e) => setName(e.target.value)} placeholder="Mario Rossi" />
              </div>
              <div>
                <label className="field-label" htmlFor="g-display">Screen</label>
                <select id="g-display" className="control" value={uuid} onChange={(e) => setUuid(e.target.value)}>
                  <option value="">Let the operator choose</option>
                  {guest.displays.map((d) => (
                    <option key={d.uuid} value={d.uuid} disabled={d.status !== 'online'}>
                      {d.name}{d.status !== 'online' ? ' (offline)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-primary w-full justify-center"
                disabled={!guest.connected || !name.trim() || request.status === 'sending' || insecure}>
                {guest.connected ? 'Ask to share' : 'Connecting to the server…'}
              </button>
            </form>
          </>
        )}

        {request.status === 'pending' && (
          <div className="mt-8">
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className="tally tally-caution" aria-hidden="true" /> Waiting for approval
            </div>
            <div className="display mt-4 text-6xl font-semibold text-ink tracking-wide">{request.code}</div>
            <p className="mt-4 text-sm text-muted">
              Tell this code to the person approving the request, so they know it is you. Keep this page open.
            </p>
          </div>
        )}

        {request.status === 'approved' && (
          <div className="mt-8">
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className={`tally ${cast.session?.status === 'connected' ? 'tally-live' : ''}`} aria-hidden="true" />
              <span>Approved for <span className="text-ink font-medium">{request.displayName}</span> until {formatClock(request.expiresAt)}</span>
            </div>
            {cast.session && <p className="mt-4 text-sm text-ink">{CAST_TEXT[cast.session.status] || cast.session.status}</p>}
            <div className="mt-6 flex gap-2">
              {live ? (
                <button className="btn btn-primary" onClick={cast.stop}>Stop sharing</button>
              ) : (
                // Browsers only open the screen picker from a click, so this is a button and not automatic
                <button className="btn btn-primary" onClick={() => cast.start({ uuid: request.uuid, name: request.displayName })}>
                  {cast.session ? 'Share again' : 'Choose what to share'}
                </button>
              )}
            </div>
            <p className="mt-6 text-xs text-faint">Closing this page ends the sharing.</p>
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GuestCastPage />
  </React.StrictMode>
);
