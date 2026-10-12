import React, { useState } from 'react';
import { MonitorUp } from 'lucide-react';

const DURATIONS = [[15, '15 min'], [30, '30 min'], [60, '1 hour'], [120, '2 hours'], [480, 'Until the end of the day']];

const formatClock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function PendingRequest({ request, displays, sendWs }) {
  const online = displays.filter((d) => d.status === 'online');
  const [uuid, setUuid] = useState(request.uuid || online[0]?.uuid || '');
  const [minutes, setMinutes] = useState(60);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-8 py-2.5">
      <div className="flex items-center gap-3 min-w-0 text-sm flex-1">
        <span className="tally tally-caution" aria-hidden="true" />
        <span className="text-ink truncate">
          <strong className="font-medium">{request.name}</strong> wants to share their screen
          <span className="text-muted"> from {request.ip}</span>
        </span>
        <span className="display text-base font-semibold text-ink tracking-wide shrink-0" title="The code shown on their page">{request.code}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="control h-8 py-0 text-sm w-auto" value={uuid} onChange={(e) => setUuid(e.target.value)} aria-label="Screen">
          {!uuid && <option value="">Choose a screen</option>}
          {displays.map((d) => (
            <option key={d.uuid} value={d.uuid} disabled={d.status !== 'online'}>
              {d.name}{d.status !== 'online' ? ' (offline)' : ''}
            </option>
          ))}
        </select>
        <select className="control h-8 py-0 text-sm w-auto" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="For how long">
          {DURATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="btn btn-sm btn-quiet" onClick={() => sendWs({ type: 'GUEST_REJECT', id: request.id })}>Decline</button>
        <button className="btn btn-sm btn-primary" disabled={!uuid} onClick={() => sendWs({ type: 'GUEST_APPROVE', id: request.id, uuid, minutes })}>
          Approve
        </button>
      </div>
    </li>
  );
}

// Guests asking to share their screen from the public /cast page, and the ones sharing now
export function GuestRequests({ requests, displays, sendWs }) {
  if (!requests?.length) return null;
  return (
    <div className="border-b border-line bg-raised" role="region" aria-label="Guest screen sharing">
      <ul className="max-w-[1400px] mx-auto divide-y divide-line">
        {requests.map((r) => r.status === 'pending' ? (
          <PendingRequest key={r.id} request={r} displays={displays} sendWs={sendWs} />
        ) : (
          <li key={r.id} className="flex items-center justify-between gap-4 px-4 sm:px-8 py-2.5 text-sm">
            <div className="flex items-center gap-3 min-w-0">
              <MonitorUp className="w-4 h-4 text-muted shrink-0" />
              <span className={`tally ${r.live ? 'tally-live' : ''}`} aria-hidden="true" />
              <span className="text-ink truncate">
                <strong className="font-medium">{r.name}</strong> {r.live ? 'is sharing to' : 'may share to'} <strong className="font-medium">{r.displayName}</strong>
                <span className="text-muted"> until {formatClock(r.expiresAt)}, approved by {r.approvedBy}</span>
              </span>
            </div>
            <button className="btn btn-sm" onClick={() => sendWs({ type: 'GUEST_STOP', id: r.id })}>Stop</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
