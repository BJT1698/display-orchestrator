import React from 'react';
import { Tv, PlaySquare, HardDrive, Wifi, WifiOff, Plus, RefreshCw, KeyRound, AlertTriangle, Activity } from 'lucide-react';

export function DashboardView({
  systemStats,
  displays,
  pendingPairings,
  playlists,
  logs,
  onOpenPairing,
  onOpenEmergency,
  onSelectDisplay,
  onNavigate
}) {
  const onlineDisplays = displays.filter(d => d.status === 'online');
  const offlineDisplays = displays.filter(d => d.status !== 'online');

  return (
    <div className="space-y-8">
      {/* Top Banner for Pending Pairings if any */}
      {pendingPairings && pendingPairings.length > 0 && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
              <KeyRound className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="font-bold text-white text-sm">
                {pendingPairings.length} Display{pendingPairings.length > 1 ? 's' : ''} Ready for Pairing
              </div>
              <div className="text-xs text-slate-400">
                New hardware node waiting for orchestrator authorization
              </div>
            </div>
          </div>
          <button
            onClick={onOpenPairing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-950"
          >
            Review & Authorize
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Connected Displays</span>
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
              <Tv className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">{onlineDisplays.length}</span>
            <span className="text-sm font-medium text-slate-400">/ {displays.length} total</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 glow-online"></span>
            {onlineDisplays.length} active broadcasting
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Playlists</span>
            <div className="p-2 bg-sky-500/10 rounded-xl text-sky-400">
              <PlaySquare className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">{playlists.length}</span>
            <span className="text-sm font-medium text-slate-400">loops configured</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Automated rotation & scheduling
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Media Storage</span>
            <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400">
              <HardDrive className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {systemStats?.storage?.totalFormatted || '0 B'}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {systemStats?.storage?.mediaCount || 0} media assets in library
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Server Health</span>
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-400">99.9%</span>
            <span className="text-sm font-medium text-slate-400">RAM: {systemStats?.memory?.percent || 0}%</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 font-mono">
            Uptime: {Math.floor((systemStats?.uptimeSeconds || 0) / 60)} mins
          </div>
        </div>
      </div>

      {/* Displays Live Overview */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Live Display Status</h2>
            <p className="text-xs text-slate-400">Real-time telemetry and active playback</p>
          </div>
          <button
            onClick={() => onNavigate('displays')}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
          >
            Manage All Displays &rarr;
          </button>
        </div>

        {displays.length === 0 ? (
          <div className="glass-panel p-10 rounded-2xl text-center">
            <Tv className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white">No Displays Connected</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-5">
              Launch a client display node container or script to automatically discover and pair screens.
            </p>
            <button
              onClick={onOpenPairing}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Pair a Display
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {displays.slice(0, 6).map((display) => (
              <div
                key={display.id}
                onClick={() => onSelectDisplay(display)}
                className="glass-card p-5 rounded-2xl cursor-pointer transition hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        display.status === 'online' ? 'bg-emerald-400 glow-online' : 'bg-slate-600'
                      }`}
                    />
                    <span className="font-bold text-white text-sm truncate max-w-[160px]">
                      {display.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    {display.resolution || '1080p'}
                  </span>
                </div>

                {/* Simulated Screen Thumbnail Preview */}
                <div className="w-full h-32 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center relative overflow-hidden mb-3">
                  <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/80 to-transparent flex flex-col justify-end p-3">
                    <div className="text-[11px] font-medium text-emerald-400 truncate">
                      {display.current_playlist_name || 'Welcome Demo Loop'}
                    </div>
                    <div className="text-[9px] text-slate-400 font-mono">
                      IP: {display.ip_address || '127.0.0.1'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 border-t border-slate-800/80 pt-2.5">
                  <div>Group: <strong className="text-slate-300">{display.group_name || 'Default'}</strong></div>
                  <div className="text-right font-mono">
                    {display.status === 'online' ? '🟢 Online' : '⚪ Offline'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Real-time System Event Feed */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">Recent Activity & Audit Stream</h2>
          <button
            onClick={() => onNavigate('system')}
            className="text-xs text-slate-400 hover:text-white"
          >
            View Full Logs
          </button>
        </div>

        <div className="glass-panel rounded-2xl divide-y divide-slate-800/60 overflow-hidden">
          {logs && logs.slice(0, 5).map((log) => (
            <div key={log.id} className="p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${
                  log.level === 'warn' ? 'bg-amber-400' : log.level === 'error' ? 'bg-red-400' : 'bg-emerald-400'
                }`} />
                <span className="font-semibold text-slate-300 font-mono">[{log.source.toUpperCase()}]</span>
                <span className="text-slate-200">{log.message}</span>
              </div>
              <span className="text-slate-500 font-mono text-[10px]">
                {new Date(log.created_at).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
