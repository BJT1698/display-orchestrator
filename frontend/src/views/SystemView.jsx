import React, { useState } from 'react';
import { Activity, Server, Users, Trash2, Plus, Terminal, RefreshCw, Cpu, HardDrive } from 'lucide-react';
import { api } from '../services/api';

export function SystemView({
  systemStats,
  logs,
  groups,
  playlists,
  onRefresh
}) {
  const [logFilter, setLogFilter] = useState('all');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupDefaultPlaylist, setGroupDefaultPlaylist] = useState('');

  const filteredLogs = logs ? logs.filter((l) => {
    if (logFilter === 'all') return true;
    return l.level === logFilter;
  }) : [];

  const handleClearLogs = async () => {
    if (!confirm('Clear all audit logs?')) return;
    try {
      await api.clearLogs();
      onRefresh && onRefresh();
    } catch (err) {
      alert('Failed to clear logs: ' + err.message);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    try {
      await api.createGroup({
        name: groupName,
        description: groupDesc,
        defaultPlaylistId: groupDefaultPlaylist ? parseInt(groupDefaultPlaylist, 10) : null
      });
      setIsCreatingGroup(false);
      setGroupName('');
      setGroupDesc('');
      onRefresh && onRefresh();
    } catch (err) {
      alert('Failed to create group: ' + err.message);
    }
  };

  const handleDeleteGroup = async (id, name) => {
    if (!confirm(`Delete display group '${name}'? Displays in this group will not be deleted.`)) return;
    try {
      await api.deleteGroup(id);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Failed to delete group: ' + err.message);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white">System, Logs & Groups</h1>
        <p className="text-xs text-slate-400">Server diagnostics, audit trails, and device grouping</p>
      </div>

      {/* Diagnostics / Hardware KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-panel p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Node / Host Engine</span>
            <Server className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-white font-mono">{systemStats?.nodeVersion || 'Node.js'}</div>
          <div className="text-xs text-slate-400 mt-1">Platform: {systemStats?.platform} ({systemStats?.arch})</div>
        </div>

        <div className="glass-panel p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Memory Allocation</span>
            <Cpu className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-lg font-bold text-sky-400 font-mono">
            {systemStats?.memory ? `${(systemStats.memory.used / (1024 * 1024)).toFixed(0)} MB / ${(systemStats.memory.total / (1024 * 1024)).toFixed(0)} MB` : 'N/A'}
          </div>
          <div className="text-xs text-slate-400 mt-1">{systemStats?.memory?.percent || 0}% host RAM in use</div>
        </div>

        <div className="glass-panel p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">WebSocket Connections</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-lg font-bold text-purple-400 font-mono">
            {systemStats?.activeWsConnections || 0} active nodes
          </div>
          <div className="text-xs text-slate-400 mt-1">Real-time bidirectional control</div>
        </div>
      </div>

      {/* Display Groups Manager */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Display Groups ({groups.length})</h3>
            <p className="text-xs text-slate-400">Group screens (e.g. by building, floor, or store branch) to assign default playlists</p>
          </div>
          <button
            onClick={() => setIsCreatingGroup(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> New Group
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {groups.map((g) => (
            <div
              key={g.id}
              className="glass-card p-4 rounded-xl border border-slate-800 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-bold text-white text-sm">{g.name}</h4>
                  <button
                    onClick={() => handleDeleteGroup(g.id, g.name)}
                    className="text-slate-500 hover:text-red-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-slate-400">{g.description || 'No description'}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Default: <strong className="text-emerald-400">{g.default_playlist_name || 'None'}</strong></span>
                <span className="font-mono">{g.display_count || 0} screen(s)</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Logs Stream */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white">Audit & Event Log Trail</h3>
            <p className="text-xs text-slate-400">Live operational events recorded in SQLite</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setLogFilter('all')}
                className={`px-2.5 py-1 rounded-lg ${logFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
              >
                All
              </button>
              <button
                onClick={() => setLogFilter('command')}
                className={`px-2.5 py-1 rounded-lg ${logFilter === 'command' ? 'bg-slate-800 text-purple-400' : 'text-slate-400'}`}
              >
                Commands
              </button>
              <button
                onClick={() => setLogFilter('warn')}
                className={`px-2.5 py-1 rounded-lg ${logFilter === 'warn' ? 'bg-slate-800 text-amber-400' : 'text-slate-400'}`}
              >
                Warnings
              </button>
            </div>

            <button
              onClick={handleClearLogs}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-400 rounded-xl transition"
              title="Clear Logs"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-slate-950 rounded-xl p-3 max-h-96 overflow-y-auto font-mono text-xs space-y-1.5 border border-slate-800/80">
          {filteredLogs.length === 0 ? (
            <div className="text-slate-500 text-center py-6">No logs to display</div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2.5 py-1 border-b border-slate-900/60">
                <span className="text-slate-500 whitespace-nowrap text-[10px]">
                  {new Date(log.created_at).toLocaleTimeString()}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold whitespace-nowrap ${
                  log.level === 'warn' ? 'bg-amber-500/20 text-amber-400' :
                  log.level === 'error' ? 'bg-red-500/20 text-red-400' :
                  log.level === 'command' ? 'bg-purple-500/20 text-purple-400' :
                  'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {log.level}
                </span>
                <span className="text-slate-400 text-[10px] whitespace-nowrap">[{log.source}]</span>
                <span className="text-slate-200">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal: Create Group */}
      {isCreatingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Create Display Group</h3>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Headquarters Reception"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ground floor lobby display network"
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Default Playlist
                </label>
                <select
                  value={groupDefaultPlaylist}
                  onChange={(e) => setGroupDefaultPlaylist(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                >
                  <option value="">-- None --</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreatingGroup(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm transition"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
