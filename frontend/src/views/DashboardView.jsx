import React from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { EmptyState, Tally, formatDuration, formatTime } from '../components/ui';

function ScreenTile({ display, onSelect }) {
  const isOnline = display.status === 'online';
  const portrait = display.orientation === 'portrait';
  const playlist = display.current_playlist_name;

  return (
    <button
      type="button"
      onClick={() => onSelect(display)}
      className="group text-left rounded-md focus-visible:outline-offset-4"
      title={isOnline ? `Send a web page to ${display.name}` : `${display.name} is offline`}
    >
      {/* Monitor bezel: the tally strip on top carries the on-air state */}
      <div className="relative aspect-video rounded-sm bg-raised border border-line group-hover:border-line-strong transition-colors overflow-hidden">
        <div className={`absolute inset-x-0 top-0 h-1 z-10 ${isOnline ? 'bg-live' : 'bg-line-strong'}`} />
        <div className={`absolute bg-black ${portrait ? 'inset-y-3 left-1/2 -translate-x-1/2 aspect-[9/16]' : 'inset-[6px] top-[10px]'}`}>
          {isOnline ? (
            <div className="absolute inset-0 flex flex-col justify-end p-3">
              <div className={`display font-semibold text-ink leading-tight ${portrait ? 'text-sm' : 'text-lg'} line-clamp-2`}>
                {playlist || 'Standby'}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {playlist ? 'Playing' : 'No playlist assigned'}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-faint">No signal</div>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink truncate">{display.name}</div>
          <div className="text-xs text-faint truncate">
            {display.group_name || 'No group'}
          </div>
        </div>
        <div className="text-xs text-faint shrink-0 pt-0.5">{display.ip_address || ''}</div>
      </div>
    </button>
  );
}

function Figure({ value, unit, label }) {
  return (
    <div className="py-4 pr-5 lg:pl-5 lg:first:pl-0">
      <div className="flex items-baseline gap-1.5">
        <span className="display text-3xl font-semibold text-ink">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}

export function DashboardView({
  systemStats,
  displays,
  pendingPairings,
  playlists,
  logs,
  onOpenPairing,
  onSelectDisplay,
  onNavigate
}) {
  const onlineDisplays = displays.filter((d) => d.status === 'online');
  const sortedDisplays = [...displays].sort((a, b) => {
    if ((a.status === 'online') !== (b.status === 'online')) return a.status === 'online' ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <div>
      {pendingPairings && pendingPairings.length > 0 && (
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-md border border-caution/50 bg-caution/10">
          <div className="flex items-center gap-3">
            <KeyRound className="w-4 h-4 text-caution shrink-0" />
            <div className="text-sm">
              <span className="font-medium text-ink">
                {pendingPairings.length === 1 ? 'A new screen is' : `${pendingPairings.length} new screens are`} waiting to be paired.
              </span>{' '}
              <span className="text-muted">Check the code shown on the screen, then approve it.</span>
            </div>
          </div>
          <button onClick={onOpenPairing} className="btn btn-primary btn-sm">Review pairing</button>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold text-ink">Overview</h1>
      </div>

      <div className="mt-4 mb-10 grid grid-cols-2 lg:grid-cols-4 lg:divide-x divide-line border-y border-line">
        <Figure value={onlineDisplays.length} unit={`of ${displays.length}`} label="Screens on air" />
        <Figure value={playlists.length} label={playlists.length === 1 ? 'Playlist' : 'Playlists'} />
        <Figure
          value={systemStats?.storage?.totalFormatted || '0 B'}
          label={`Media library, ${systemStats?.storage?.mediaCount || 0} files`}
        />
        <Figure
          value={formatDuration(systemStats?.uptimeSeconds)}
          label={`Server uptime, ${systemStats?.memory?.percent || 0}% memory in use`}
        />
      </div>

      <section aria-labelledby="wall-heading">
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <h2 id="wall-heading" className="text-xl font-semibold text-ink">Display wall</h2>
          {displays.length > 0 && (
            <button onClick={() => onNavigate('displays')} className="text-sm text-muted hover:text-ink underline-offset-4 hover:underline">
              Manage displays
            </button>
          )}
        </div>

        {displays.length === 0 ? (
          <EmptyState
            title="No screens yet"
            action={
              <button onClick={onOpenPairing} className="btn btn-primary">
                <Plus className="w-4 h-4" /> Pair a display
              </button>
            }
          >
            Turn on a signage player and point it to this server. It will show a pairing code to approve here.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-8">
            {sortedDisplays.map((display) => (
              <ScreenTile key={display.id} display={display} onSelect={onSelectDisplay} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="activity-heading" className="mt-12">
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <h2 id="activity-heading" className="text-xl font-semibold text-ink">Recent activity</h2>
          <button onClick={() => onNavigate('system')} className="text-sm text-muted hover:text-ink underline-offset-4 hover:underline">
            Full log
          </button>
        </div>

        <div className="panel overflow-hidden">
          {!logs || logs.length === 0 ? (
            <div className="px-5 py-8 text-sm text-faint text-center">Nothing has happened yet.</div>
          ) : (
            <ul className="divide-y divide-line">
              {logs.slice(0, 6).map((log) => (
                <li key={log.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 px-5 py-3 text-sm">
                  <Tally status={log.level === 'warn' ? 'warn' : log.level === 'error' ? 'error' : 'online'} />
                  <div className="min-w-0">
                    <span className="text-ink">{log.message}</span>
                    <span className="ml-2 text-faint">{log.source}</span>
                  </div>
                  <time className="text-xs text-faint">{formatTime(log.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
