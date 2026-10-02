import React, { useState } from 'react';
import { Tv, RefreshCw, Moon, Sun, Globe, Trash2, Smartphone, Monitor, Shield, Settings, PlaySquare } from 'lucide-react';
import { api } from '../services/api';

export function DisplaysView({
  displays,
  groups,
  playlists,
  onRefresh,
  onOpenPairing,
  onPushUrl
}) {
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [editingDisplay, setEditingDisplay] = useState(null);
  const [loadingAction, setLoadingAction] = useState(null);

  const filteredDisplays = displays.filter((d) => {
    if (selectedGroup === 'all') return true;
    return String(d.group_id) === String(selectedGroup);
  });

  const handleCommand = async (displayId, action, payload = {}) => {
    setLoadingAction(`${displayId}-${action}`);
    try {
      await api.sendCommand(displayId, action, payload);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Command failed: ' + err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleAssignPlaylist = async (displayId, playlistId) => {
    try {
      await api.updateDisplay(displayId, { currentPlaylistId: playlistId ? parseInt(playlistId, 10) : null });
      onRefresh && onRefresh();
    } catch (err) {
      alert('Failed to assign playlist: ' + err.message);
    }
  };

  const handleToggleOrientation = async (display) => {
    const nextOrientation = display.orientation === 'portrait' ? 'landscape' : 'portrait';
    try {
      await api.updateDisplay(display.id, { orientation: nextOrientation });
      onRefresh && onRefresh();
    } catch (err) {
      alert('Failed to update orientation: ' + err.message);
    }
  };

  const handleDeleteDisplay = async (display) => {
    if (!confirm(`Are you sure you want to delete '${display.name}'?`)) return;
    try {
      await api.deleteDisplay(display.id);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Display Nodes</h1>
          <p className="text-xs text-slate-400">Manage real-time digital signage screens and appliances</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Groups ({displays.length})</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>Group: {g.name}</option>
            ))}
          </select>

          <button
            onClick={onOpenPairing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-950"
          >
            + Pair Screen
          </button>
        </div>
      </div>

      {/* Grid of Displays */}
      {filteredDisplays.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl text-center">
          <Tv className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">No displays found in this view</h3>
          <p className="text-xs text-slate-400 mt-1">Connect or pair a display node to control it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredDisplays.map((display) => {
            const isOnline = display.status === 'online';
            const metrics = display.metrics || {};

            return (
              <div
                key={display.id}
                className="glass-card rounded-2xl overflow-hidden border border-slate-800 transition hover:border-slate-700 shadow-xl flex flex-col"
              >
                {/* Display Header */}
                <div className="p-5 bg-slate-900/50 border-b border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="p-2.5 bg-slate-800 rounded-xl text-slate-300">
                        {display.orientation === 'portrait' ? (
                          <Smartphone className="w-5 h-5 text-sky-400" />
                        ) : (
                          <Monitor className="w-5 h-5 text-emerald-400" />
                        )}
                      </div>
                      <span
                        className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${
                          isOnline ? 'bg-emerald-400 glow-online' : 'bg-slate-600'
                        }`}
                      />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm">{display.name}</h3>
                      <div className="text-[11px] text-slate-400 font-mono">
                        IP: {display.ip_address || '127.0.0.1'} &bull; {display.orientation || 'landscape'}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteDisplay(display)}
                    className="text-slate-500 hover:text-red-400 p-1.5 transition"
                    title="Delete display"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Body Details */}
                <div className="p-5 flex-1 space-y-4">
                  {/* Playlist selector */}
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Active Playlist Assignment
                    </label>
                    <select
                      value={display.current_playlist_id || ''}
                      onChange={(e) => handleAssignPlaylist(display.id, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">-- Inherit Group Default Playlist --</option>
                      {playlists.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.item_count || 0} items)</option>
                      ))}
                    </select>
                  </div>

                  {/* Hardware / Telemetry Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">Memory Load</span>
                      <span className="font-mono text-slate-200">
                        {metrics.memUsedMb ? `${metrics.memUsedMb} MB / ${metrics.memTotalMb} MB` : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">Client Uptime</span>
                      <span className="font-mono text-slate-200">
                        {metrics.uptimeSeconds ? `${Math.floor(metrics.uptimeSeconds / 60)} min` : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between gap-1.5">
                  <button
                    onClick={() => onPushUrl(display)}
                    disabled={!isOnline}
                    className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-40"
                    title="Push temporary live URL"
                  >
                    <Globe className="w-3.5 h-3.5 text-sky-400" /> Push URL
                  </button>

                  <button
                    onClick={() => handleCommand(display.id, 'reload')}
                    disabled={!isOnline}
                    className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-40"
                    title="Force reload player"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400" /> Reload
                  </button>

                  <button
                    onClick={() => handleToggleOrientation(display)}
                    className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition"
                    title="Toggle Orientation"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-purple-400" /> Rotate
                  </button>

                  <button
                    onClick={() => handleCommand(display.id, 'blank', { state: true })}
                    disabled={!isOnline}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-[11px] transition disabled:opacity-40"
                    title="Blank Screen"
                  >
                    <Moon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
