import React, { useState } from 'react';
import { MonitorPlay, Eye, X } from 'lucide-react';
import { liveApi } from '../services/api';
import { Modal } from './ui';

const DURATIONS = [[5, '5 min'], [15, '15 min'], [30, '30 min'], [60, '1 hour'], [120, '2 hours']];

// One PC in a Dell or Lenovo PXE deploy: preview, watch here, show on a display
function SourceCard({ source, displays, onWatch }) {
  const online = displays.filter((d) => d.status === 'online');
  const [displayId, setDisplayId] = useState(online[0]?.id || '');
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shownOn = displays.filter((d) => source.shownOn.includes(d.uuid));

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="min-w-0">
      <button type="button" onClick={() => onWatch(source)} className="group block w-full text-left rounded-md" title={`Watch the screen of ${source.name}`}>
        <div className="relative aspect-video rounded-sm bg-black border border-line group-hover:border-line-strong overflow-hidden">
          <div className={`absolute inset-x-0 top-0 h-1 z-10 ${shownOn.length ? 'bg-live' : 'bg-caution'}`} />
          {source.previewAt ? (
            <img src={`/api/live/${source.id}/preview.jpg?t=${encodeURIComponent(source.previewAt)}`} alt={`Screen of ${source.name}`} className="absolute inset-0 w-full h-full object-contain" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-faint">Waiting for the first picture</div>
          )}
        </div>
      </button>
      <div className="mt-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink truncate">{source.name}</div>
          <div className="text-xs text-faint truncate">{source.profile} deploy · {source.serial || 'no serial'} · {source.ip}</div>
        </div>
        <button type="button" className="btn-icon shrink-0" onClick={() => onWatch(source)} title="Watch here" aria-label={`Watch ${source.name} here`}>
          <Eye className="w-4 h-4" />
        </button>
      </div>
      {shownOn.map((d) => (
        <div key={d.uuid} className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2 text-muted min-w-0"><span className="tally tally-live" aria-hidden="true" /><span className="truncate">On {d.name}</span></span>
          <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => run(() => liveApi.hide(source.id, d.id))}>Stop</button>
        </div>
      ))}
      <div className="mt-2 flex gap-1.5">
        <select className="control h-8 py-0 text-sm min-w-0 flex-1" value={displayId} onChange={(e) => setDisplayId(e.target.value)} aria-label="Display">
          {!online.length && <option value="">No display online</option>}
          {online.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="control h-8 py-0 text-sm w-auto" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="For how long">
          {DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || !displayId}
          onClick={() => run(() => liveApi.show(source.id, Number(displayId), minutes))}>
          Show
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-alert">{error}</p>}
    </li>
  );
}

// PCs in a PXE deploy appear here on their own and disappear when they stop answering
export function LiveSources({ sources, displays }) {
  const [watching, setWatching] = useState(null);
  if (!sources?.length) return null;
  const current = watching && sources.find((s) => s.id === watching.id);

  return (
    <section aria-labelledby="live-heading" className="mb-12">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 id="live-heading" className="text-xl font-semibold text-ink flex items-center gap-2">
          <MonitorPlay className="w-5 h-5 text-muted" /> PCs in deploy
        </h2>
        <span className="text-sm text-muted">{sources.length} connected</span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-8">
        {sources.map((s) => <SourceCard key={s.id} source={s} displays={displays} onWatch={setWatching} />)}
      </ul>

      {current && (
        <Modal title={current.name} description={`${current.profile} deploy · ${current.serial || 'no serial'} · ${current.ip}`} onClose={() => setWatching(null)} width="max-w-5xl">
          <div className="relative aspect-video bg-black rounded-sm overflow-hidden">
            <img src={`${current.viewPath}/stream.mjpg`} alt={`Live screen of ${current.name}`} className="absolute inset-0 w-full h-full object-contain" />
          </div>
          <p className="mt-3 text-xs text-faint">About three pictures a second. The PC sends them only while someone is watching.</p>
        </Modal>
      )}
      {watching && !current && (
        <Modal title="Deploy ended" onClose={() => setWatching(null)} footer={<button className="btn" onClick={() => setWatching(null)}><X className="w-4 h-4" /> Close</button>}>
          <p className="text-sm text-muted">{watching.name} is no longer connected.</p>
        </Modal>
      )}
    </section>
  );
}
