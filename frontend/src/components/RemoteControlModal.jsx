import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, CornerDownLeft } from 'lucide-react';

const SPECIAL_KEYS = new Set([
  'Enter', 'Backspace', 'Tab', 'Escape', 'Delete',
  'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End',
]);

const STATUS_TEXT = {
  connecting: 'Connecting to the screen',
  live: 'Live',
  offline: 'The screen is offline',
  unavailable: 'The browser on this screen cannot be controlled',
  disconnected: 'Lost connection to the server, retrying',
  timeout: 'The screen did not answer. It may need the latest version of the player.',
};

export function RemoteControlModal({ display, wsConnected, sendWs, subscribe, onClose }) {
  const [frame, setFrame] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [detail, setDetail] = useState('');
  const [ripples, setRipples] = useState([]);
  const [text, setText] = useState('');
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const wheelRef = useRef({ dy: 0, x: 0.5, y: 0.5, timer: null });
  const moveRef = useRef({ x: -1, y: -1, timer: null, pending: null });
  const uuid = display.uuid;

  const sendInput = useCallback((input) => sendWs({ type: 'REMOTE_INPUT', uuid, input }), [sendWs, uuid]);

  // Frames and status for this screen only
  useEffect(() => subscribe((msg) => {
    if (msg.uuid && msg.uuid !== uuid) return;
    if (msg.type === 'REMOTE_FRAME') {
      setFrame(`data:image/jpeg;base64,${msg.data}`);
      setStatus('live');
    } else if (msg.type === 'REMOTE_STATUS') {
      setStatus(msg.status);
      setDetail(msg.detail || '');
    }
  }), [subscribe, uuid]);

  // (Re)start the session whenever the dashboard socket is up, stop it on close
  useEffect(() => {
    if (!wsConnected) return undefined;
    setStatus((s) => (s === 'live' ? s : 'connecting'));
    sendWs({ type: 'REMOTE_START', uuid });
    const timeout = setTimeout(() => setStatus((s) => (s === 'connecting' ? 'timeout' : s)), 8000);
    return () => {
      clearTimeout(timeout);
      sendWs({ type: 'REMOTE_STOP', uuid });
    };
  }, [wsConnected, sendWs, uuid]);

  useEffect(() => {
    stageRef.current?.focus();
  }, []);

  // Position inside the frame as a 0..1 fraction; the agent maps it to the page size
  const toFraction = (clientX, clientY) => {
    const rect = imgRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
      px: clientX - rect.left,
      py: clientY - rect.top,
    };
  };

  // Pointer position for hover effects; send at most every 50 ms and only when it changed
  const handleMouseMove = (e) => {
    if (!imgRef.current || status !== 'live') return;
    const { x, y } = toFraction(e.clientX, e.clientY);
    const m = moveRef.current;
    m.pending = { x, y };
    if (m.timer) return;
    m.timer = setTimeout(() => {
      const p = m.pending;
      m.timer = null;
      if (p && (Math.abs(p.x - m.x) > 0.001 || Math.abs(p.y - m.y) > 0.001)) {
        m.x = p.x;
        m.y = p.y;
        sendInput({ kind: 'move', x: p.x, y: p.y });
      }
    }, 50);
  };

  useEffect(() => () => clearTimeout(moveRef.current.timer), []);

  const handleClick = (e) => {
    if (!imgRef.current || status !== 'live') return;
    const { x, y, px, py } = toFraction(e.clientX, e.clientY);
    sendInput({ kind: 'click', x, y });
    const id = Date.now() + Math.random();
    setRipples((r) => [...r, { id, px, py }]);
    setTimeout(() => setRipples((r) => r.filter((item) => item.id !== id)), 600);
    stageRef.current?.focus();
  };

  // Wheel needs a non-passive listener to keep the dashboard from scrolling; batch deltas to limit traffic
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const w = wheelRef.current;
      const { x, y } = toFraction(e.clientX, e.clientY);
      w.dy += e.deltaY;
      w.x = x;
      w.y = y;
      if (!w.timer) {
        w.timer = setTimeout(() => {
          sendInput({ kind: 'wheel', x: w.x, y: w.y, dy: w.dy });
          w.dy = 0;
          w.timer = null;
        }, 60);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [frame !== null, sendInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && e.shiftKey) {
      onClose();
      return;
    }
    if (status !== 'live' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1) {
      e.preventDefault();
      sendInput({ kind: 'text', text: e.key });
    } else if (SPECIAL_KEYS.has(e.key)) {
      e.preventDefault();
      sendInput({ kind: 'key', key: e.key });
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted && status === 'live') {
      e.preventDefault();
      sendInput({ kind: 'text', text: pasted });
    }
  };

  const sendText = (e) => {
    e.preventDefault();
    if (!text) return;
    sendInput({ kind: 'text', text });
    sendInput({ kind: 'key', key: 'Enter' });
    setText('');
  };

  const tally = status === 'live' ? 'tally-live' : ['connecting', 'disconnected'].includes(status) ? 'tally-caution' : 'tally-alert';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ground" role="dialog" aria-modal="true" aria-label={`Control the browser on ${display.name}`}>
      <div className="flex items-center justify-between gap-4 px-5 h-14 border-b border-line bg-surface shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`tally ${tally}`} aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink truncate">{display.name}</div>
            <div className="text-xs text-muted truncate" aria-live="polite">
              {STATUS_TEXT[status] || status}{detail && status !== 'live' ? ` (${detail})` : ''}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="btn btn-sm">
          <X className="w-4 h-4" /> End control
        </button>
      </div>

      <div
        ref={stageRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="flex-1 min-h-0 flex items-center justify-center p-4 sm:p-6 outline-none"
      >
        {frame ? (
          <div className="relative max-w-full max-h-full">
            <img
              ref={imgRef}
              src={frame}
              alt={`Live view of ${display.name}`}
              onClick={handleClick}
              onMouseMove={handleMouseMove}
              draggable={false}
              className={`block max-w-full max-h-[calc(100vh-11rem)] border border-line select-none ${status === 'live' ? 'cursor-pointer' : 'opacity-50'}`}
            />
            {ripples.map((r) => (
              <span key={r.id} className="click-ripple" style={{ left: r.px, top: r.py }} aria-hidden="true" />
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted text-center max-w-[44ch]">{STATUS_TEXT[status] || status}</div>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-surface px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <p className="text-xs text-faint max-w-[70ch]">
          Move, click and scroll on the image to use the page. While the view is focused, typing goes to the page; press Shift+Esc to leave.
        </p>
        <form onSubmit={sendText} className="flex gap-2 sm:w-96 shrink-0">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Type text, then send"
            aria-label="Text to type on the page"
            className="control h-8"
            disabled={status !== 'live'}
          />
          <button type="submit" className="btn btn-sm" disabled={status !== 'live' || !text}>
            <CornerDownLeft className="w-4 h-4" /> Send
          </button>
        </form>
      </div>
    </div>
  );
}
