import React, { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { api } from '../services/api';
import { PageHeader, EmptyState, Modal, Tally, formatBytes, formatTime } from '../components/ui';

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
    if (!confirm('Clear the whole event log? This cannot be undone.')) return;
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
    if (!confirm(`Delete display group '${name}'? The screens in it stay paired.`)) return;
    try {
      await api.deleteGroup(id);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Failed to delete group: ' + err.message);
    }
  };

  const mem = systemStats?.memory;

  return (
    <div>
      <PageHeader title="Groups and logs" description="Group screens by place to give them a shared default playlist, and review what happened on the server." />

      <dl className="mb-10 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line border-y border-line">
        <div className="py-4 sm:pr-5">
          <dt className="text-sm text-muted">Server</dt>
          <dd className="mt-1 text-lg font-medium text-ink">Node {String(systemStats?.nodeVersion || '').replace(/^v/, '') || 'unknown'}</dd>
          <dd className="text-xs text-faint">{systemStats?.platform} {systemStats?.arch}</dd>
        </div>
        <div className="py-4 sm:px-5">
          <dt className="text-sm text-muted">Memory</dt>
          <dd className="mt-1 text-lg font-medium text-ink">
            {mem ? `${formatBytes(mem.used)} of ${formatBytes(mem.total)}` : 'No data'}
          </dd>
          {mem && (
            <dd className="mt-2 h-1 rounded-full bg-raised overflow-hidden">
              <div className={`h-full ${mem.percent > 85 ? 'bg-caution' : 'bg-ink'}`} style={{ width: `${Math.min(100, mem.percent || 0)}%` }} />
            </dd>
          )}
        </div>
        <div className="py-4 sm:pl-5">
          <dt className="text-sm text-muted">Live connections</dt>
          <dd className="mt-1 text-lg font-medium text-ink">{systemStats?.activeWsConnections || 0}</dd>
          <dd className="text-xs text-faint">Screens and dashboards connected now</dd>
        </div>
      </dl>

      <section aria-labelledby="groups-heading" className="mb-12">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 id="groups-heading" className="text-xl font-semibold text-ink">Groups</h2>
          <button onClick={() => setIsCreatingGroup(true)} className="btn">
            <Plus className="w-4 h-4" /> New group
          </button>
        </div>

        {groups.length === 0 ? (
          <EmptyState title="No groups yet">
            Groups let you give several screens, such as every screen on one floor, the same default playlist.
          </EmptyState>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Default playlist</th>
                  <th className="text-right">Screens</th>
                  <th className="w-12"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <div className="font-medium text-ink">{g.name}</div>
                      {g.description && <div className="text-xs text-faint">{g.description}</div>}
                    </td>
                    <td className={g.default_playlist_name ? 'text-ink' : 'text-faint'}>{g.default_playlist_name || 'None'}</td>
                    <td className="text-right text-ink">{g.display_count || 0}</td>
                    <td className="text-right">
                      <button onClick={() => handleDeleteGroup(g.id, g.name)} className="btn-icon is-danger" title="Delete group" aria-label={`Delete ${g.name}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="log-heading">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <h2 id="log-heading" className="text-xl font-semibold text-ink">Event log</h2>
          <div className="flex items-center gap-2">
            <div className="segmented" role="group" aria-label="Filter log">
              <button aria-pressed={logFilter === 'all'} onClick={() => setLogFilter('all')}>All</button>
              <button aria-pressed={logFilter === 'command'} onClick={() => setLogFilter('command')}>Commands</button>
              <button aria-pressed={logFilter === 'warn'} onClick={() => setLogFilter('warn')}>Warnings</button>
              <button aria-pressed={logFilter === 'error'} onClick={() => setLogFilter('error')}>Errors</button>
            </div>
            <button onClick={handleClearLogs} className="btn btn-sm">Clear log</button>
          </div>
        </div>

        <div className="panel max-h-[32rem] overflow-auto">
          {filteredLogs.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-faint">No events match this filter.</div>
          ) : (
            <table className="data-table min-w-[640px]">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  <th className="w-28">Time</th>
                  <th className="w-28">Level</th>
                  <th className="w-32">Source</th>
                  <th>Event</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-faint whitespace-nowrap">{formatTime(log.created_at)}</td>
                    <td>
                      <span className="inline-flex items-center gap-2 text-muted capitalize">
                        <Tally status={log.level === 'warn' ? 'warn' : log.level === 'error' ? 'error' : log.level === 'command' ? 'offline' : 'online'} />
                        {log.level === 'warn' ? 'Warning' : log.level}
                      </span>
                    </td>
                    <td className="text-muted">{log.source}</td>
                    <td className="text-ink">{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {isCreatingGroup && (
        <Modal
          title="New group"
          onClose={() => setIsCreatingGroup(false)}
          width="max-w-md"
          footer={
            <>
              <button type="button" onClick={() => setIsCreatingGroup(false)} className="btn btn-quiet">Cancel</button>
              <button type="submit" form="create-group" className="btn btn-primary">Create group</button>
            </>
          }
        >
          <form id="create-group" onSubmit={handleCreateGroup} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="g-name">Name</label>
              <input id="g-name" type="text" placeholder="Ground floor" value={groupName} onChange={(e) => setGroupName(e.target.value)} required autoFocus className="control" />
            </div>
            <div>
              <label className="field-label" htmlFor="g-desc">Description <span className="text-faint font-normal">(optional)</span></label>
              <input id="g-desc" type="text" placeholder="Screens in the entrance hall" value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)} className="control" />
            </div>
            <div>
              <label className="field-label" htmlFor="g-playlist">Default playlist</label>
              <select id="g-playlist" value={groupDefaultPlaylist} onChange={(e) => setGroupDefaultPlaylist(e.target.value)} className="control">
                <option value="">None</option>
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="field-hint">Screens in this group play it unless they have their own playlist or a schedule applies.</p>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
