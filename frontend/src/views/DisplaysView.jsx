import React, { useState } from 'react';
import { RefreshCw, MoonStar, Sun, Globe, Trash2, RotateCw, Plus, MousePointerClick } from 'lucide-react';
import { api } from '../services/api';
import { PageHeader, EmptyState, Tally, formatDuration } from '../components/ui';

export function DisplaysView({
  displays,
  groups,
  playlists,
  onRefresh,
  onOpenPairing,
  onPushUrl,
  onRemoteControl
}) {
  const [selectedGroup, setSelectedGroup] = useState('all');
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
      alert('Could not assign the playlist: ' + err.message);
    }
  };

  const handleToggleOrientation = async (display) => {
    const nextOrientation = display.orientation === 'portrait' ? 'landscape' : 'portrait';
    try {
      await api.updateDisplay(display.id, { orientation: nextOrientation });
      onRefresh && onRefresh();
    } catch (err) {
      alert('Could not change the orientation: ' + err.message);
    }
  };

  const handleDeleteDisplay = async (display) => {
    if (!confirm(`Remove '${display.name}'? The screen will need to be paired again.`)) return;
    try {
      await api.deleteDisplay(display.id);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Could not remove the display: ' + err.message);
    }
  };

  return (
    <div>
      <PageHeader title="Displays" description="Every paired screen, what it plays, and quick controls.">
        <select
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="control w-auto min-w-44"
          aria-label="Filter by group"
        >
          <option value="all">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button onClick={onOpenPairing} className="btn btn-primary">
          <Plus className="w-4 h-4" /> Pair a display
        </button>
      </PageHeader>

      {filteredDisplays.length === 0 ? (
        <EmptyState
          title={displays.length === 0 ? 'No screens yet' : 'No screens in this group'}
          action={displays.length === 0 && (
            <button onClick={onOpenPairing} className="btn btn-primary">Pair a display</button>
          )}
        >
          {displays.length === 0
            ? 'Start a signage player pointed to this server, then approve the code it shows.'
            : 'Assign screens to this group while pairing them, or pick another group.'}
        </EmptyState>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="data-table min-w-[960px]">
            <thead>
              <tr>
                <th>Screen</th>
                <th>Group</th>
                <th className="w-64">Playlist</th>
                <th>Orientation</th>
                <th>Player</th>
                <th className="text-right">Controls</th>
              </tr>
            </thead>
            <tbody>
              {filteredDisplays.map((display) => {
                const isOnline = display.status === 'online';
                const metrics = display.metrics || {};
                const busy = (a) => loadingAction === `${display.id}-${a}`;

                return (
                  <tr key={display.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Tally status={isOnline ? 'online' : 'offline'} />
                        <div className="min-w-0">
                          <div className="font-medium text-ink truncate">{display.name}</div>
                          <div className="text-xs text-faint">
                            {isOnline ? 'Online' : 'Offline'}{display.ip_address ? `, ${display.ip_address}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-muted">{display.group_name || 'None'}</td>
                    <td>
                      <select
                        value={display.current_playlist_id || ''}
                        onChange={(e) => handleAssignPlaylist(display.id, e.target.value)}
                        className="control h-8"
                        aria-label={`Playlist for ${display.name}`}
                      >
                        <option value="">Group default</option>
                        {playlists.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="text-muted capitalize">{display.orientation || 'landscape'}</td>
                    <td className="text-xs text-muted whitespace-nowrap">
                      {isOnline && metrics.uptimeSeconds ? (
                        <>
                          <div>Up {formatDuration(metrics.uptimeSeconds)}</div>
                          {metrics.memUsedMb && <div className="text-faint">{metrics.memUsedMb} of {metrics.memTotalMb} MB</div>}
                        </>
                      ) : (
                        <span className="text-faint">No data</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => onRemoteControl(display)}
                          disabled={!isOnline}
                          className="btn-icon"
                          title="Control the browser"
                          aria-label={`Control the browser on ${display.name}`}
                        >
                          <MousePointerClick className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onPushUrl(display)}
                          disabled={!isOnline}
                          className="btn-icon"
                          title="Show a web page for a while"
                          aria-label={`Show a web page on ${display.name}`}
                        >
                          <Globe className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleCommand(display.id, 'reload')}
                          disabled={!isOnline || busy('reload')}
                          className="btn-icon"
                          title="Reload the player"
                          aria-label={`Reload ${display.name}`}
                        >
                          <RefreshCw className={`w-4 h-4 ${busy('reload') ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleToggleOrientation(display)}
                          className="btn-icon"
                          title="Switch orientation"
                          aria-label={`Switch orientation of ${display.name}`}
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleCommand(display.id, 'blank', { state: true })}
                          disabled={!isOnline || busy('blank')}
                          className="btn-icon"
                          title="Blank the screen"
                          aria-label={`Blank ${display.name}`}
                        >
                          <MoonStar className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleCommand(display.id, 'blank', { state: false })}
                          disabled={!isOnline || busy('blank')}
                          className="btn-icon"
                          title="Turn the screen back on"
                          aria-label={`Turn ${display.name} back on`}
                        >
                          <Sun className="w-4 h-4" />
                        </button>
                        <span className="w-px h-5 bg-line mx-1.5" aria-hidden="true" />
                        <button
                          onClick={() => handleDeleteDisplay(display)}
                          className="btn-icon is-danger"
                          title="Remove display"
                          aria-label={`Remove ${display.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
