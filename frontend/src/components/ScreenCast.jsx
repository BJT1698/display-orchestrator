import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MonitorUp, X } from 'lucide-react';

const STATUS_TEXT = {
  choosing: 'Choose what to share',
  connecting: 'Connecting to the screen',
  connected: 'Live',
  disconnected: 'Connection unstable, trying to recover',
  failed: 'The screen could not receive the stream',
  offline: 'The screen is offline',
  replaced: 'Someone else started sharing to this screen',
  timeout: 'The screen did not answer. It may need the latest version of the player.',
  insecure: 'Screen sharing needs the dashboard to be opened over HTTPS.',
  denied: 'Sharing was cancelled',
};

const ENDED = new Set(['failed', 'offline', 'replaced', 'timeout', 'insecure', 'denied']);

function newCastId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// One screen-share session at a time, kept at app level so it survives navigation
export function useScreenCast({ sendWs, subscribe, wsConnected }) {
  const [session, setSession] = useState(null); // { uuid, name, status }
  const ref = useRef(null); // { castId, uuid, pc, stream, timer }

  const cleanup = useCallback(() => {
    const cur = ref.current;
    if (!cur) return;
    clearTimeout(cur.timer);
    cur.pc?.close();
    cur.stream?.getTracks().forEach((t) => t.stop());
    ref.current = null;
  }, []);

  const setStatus = useCallback((status) => {
    setSession((s) => (s ? { ...s, status } : s));
  }, []);

  const stop = useCallback(() => {
    const cur = ref.current;
    if (cur) sendWs({ type: 'CAST_STOP', uuid: cur.uuid });
    cleanup();
    setSession(null);
  }, [cleanup, sendWs]);

  const end = useCallback((status) => {
    const cur = ref.current;
    if (cur) sendWs({ type: 'CAST_STOP', uuid: cur.uuid });
    cleanup();
    setStatus(status);
  }, [cleanup, sendWs, setStatus]);

  const start = useCallback(async (display) => {
    if (ref.current) stop();
    setSession({ uuid: display.uuid, name: display.name, status: 'choosing' });

    if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) {
      setStatus('insecure');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 }, width: { max: 1920 }, height: { max: 1080 } },
        audio: true,
      });
    } catch {
      setStatus('denied');
      return;
    }

    const castId = newCastId();
    const pc = new RTCPeerConnection({ iceServers: [] });
    ref.current = { castId, uuid: display.uuid, pc, stream, timer: null };

    stream.getTracks().forEach((track) => {
      // Keep text on slides and documents sharp rather than smooth
      if (track.kind === 'video') track.contentHint = 'detail';
      pc.addTrack(track, stream);
      // Stopping from the browser's own "Stop sharing" bar ends the session too
      track.addEventListener('ended', () => {
        if (ref.current?.castId === castId) stop();
      });
    });

    pc.onconnectionstatechange = () => {
      if (ref.current?.castId !== castId) return;
      const state = pc.connectionState;
      if (state === 'connected') {
        clearTimeout(ref.current.timer);
        setStatus('connected');
      } else if (state === 'failed') {
        end('failed');
      } else if (state === 'disconnected') {
        setStatus('disconnected');
      }
    };

    setStatus('connecting');
    await pc.setLocalDescription(await pc.createOffer());
    // Send one complete offer; the screen answers through its agent, which polls
    await new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      pc.addEventListener('icegatheringstatechange', () => pc.iceGatheringState === 'complete' && resolve());
      setTimeout(resolve, 3000);
    });
    if (ref.current?.castId !== castId) return;

    if (!sendWs({ type: 'CAST_OFFER', uuid: display.uuid, castId, sdp: pc.localDescription.sdp })) {
      end('offline');
      return;
    }
    ref.current.timer = setTimeout(() => {
      if (ref.current?.castId === castId && pc.connectionState !== 'connected') end('timeout');
    }, 15000);
  }, [end, sendWs, setStatus, stop]);

  // Answers and status from the screen
  useEffect(() => subscribe(async (msg) => {
    const cur = ref.current;
    if (!cur || msg.uuid !== cur.uuid) return;
    if (msg.type === 'CAST_ANSWER' && msg.castId === cur.castId && cur.pc.signalingState === 'have-local-offer') {
      try {
        await cur.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      } catch {
        end('failed');
      }
    } else if (msg.type === 'CAST_STATUS' && ['offline', 'replaced'].includes(msg.status)) {
      end(msg.status);
    }
  }), [subscribe, end]);

  // The server drops the cast when this dashboard's socket closes
  useEffect(() => {
    if (!wsConnected && ref.current) end('offline');
  }, [wsConnected, end]);

  useEffect(() => cleanup, [cleanup]);

  return { session, start, stop, dismiss: () => setSession(null) };
}

export function CastBar({ session, onStop, onDismiss }) {
  if (!session) return null;
  const ended = ENDED.has(session.status);
  const tally = session.status === 'connected' ? 'tally-live' : ended ? 'tally-alert' : 'tally-caution';

  return (
    <div className="sticky top-0 z-40 border-b border-line bg-raised" role="status" aria-live="polite">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-12 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 text-sm">
          <MonitorUp className="w-4 h-4 text-muted shrink-0" />
          <span className={`tally ${tally}`} aria-hidden="true" />
          <span className="text-ink truncate">
            {ended ? 'Screen sharing ended' : 'Sharing your screen'} to <strong className="font-medium">{session.name}</strong>
          </span>
          <span className="text-muted truncate hidden sm:inline">{STATUS_TEXT[session.status] || session.status}</span>
        </div>
        {ended ? (
          <button onClick={onDismiss} className="btn btn-sm btn-quiet" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={onStop} className="btn btn-sm btn-primary">Stop sharing</button>
        )}
      </div>
      {ended && (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 pb-3 -mt-1 text-sm text-muted sm:hidden">
          {STATUS_TEXT[session.status] || session.status}
        </div>
      )}
    </div>
  );
}
