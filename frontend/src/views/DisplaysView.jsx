import React, { useState } from 'react';
import { RefreshCw, Power, Globe, Trash2, Plus, MousePointerClick, MonitorUp } from 'lucide-react';
import { api, updatesApi } from '../services/api';
import { PageHeader, EmptyState, Tally, formatDuration, ORIENTATIONS, compareVersions } from '../components/ui';

// Version on the screen, update progress, and the update button for administrators
function SoftwareCell({ display, latestRelease, isAdmin, isOnline }) {
  const [busy, setBusy] = useState(false);
  const metrics = display.metrics || {};
  const version = metrics.version;
  const update = metrics.update;
  const latest = latestRelease?.tag;

  const running = update?.state === 'running';
  const failed = update?.state === 'failed' && update?.target === latest && compareVersions(version, latest) < 0;
  const behind = latest && (!version || compareVersions(version, latest) < 0);

  const start = async () => {
    if (!confirm(`Update ${display.name} to ${latest}?\n\nThe screen downloads the new version and restarts its player; this can take several minutes.`)) return;
    setBusy(true);
    try {
      await updatesApi.updateDisplay(display.id, latest);
    } catch (err) {
      alert('Could not start the update: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1">
      <div className="text-faint">{version ? `Version ${version}` : 'Version unknown'}</div>
      {running && <div className="text-caution">Updating to {update.target}</div>}
      {failed && <div className="text-alert" title={update.error}>Update to {update.target} failed</div>}
      {isAdmin && isOnline && behind && !running && (
        metrics.updatesSupported ? (
          <button onClick={start} disabled={busy} className="btn btn-sm mt-1">
            {failed ? 'Retry update' : `Update to ${latest}`}
          </button>
        ) : (
          <div className="text-faint" title="Installed before remote updates existed: update it once over SSH or reinstall">Needs a manual update once</div>
        )
      )}
    </div>
  );
}

export function DisplaysView({
  displays,
  groups,
  playlists,
  onRefresh,
  onOpenPairing,
  isAdmin,
  onPushUrl,
  onRemoteControl,
  onShareScreen,
  onSetBlank,
  latestRelease
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

  const handleOrientation = async (display, orientation) => {
    try {
      await api.updateDisplay(display.id, { orientation });
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
        {isAdmin && (
          <button onClick={onOpenPairing} className="btn btn-primary">
            <Plus className="w-4 h-4" /> Pair a display
          </button>
        )}
      </PageHeader>

      {filteredDisplays.length === 0 ? (
        <EmptyState
          title={displays.length === 0 ? 'No screens yet' : 'No screens in this group'}
          action={isAdmin && displays.length === 0 && (
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
                    <td>
                      <select
                        value={display.orientation || 'landscape'}
                        onChange={(e) => handleOrientation(display, e.target.value)}
                        className="control h-8 w-auto"
                        aria-label={`Orientation of ${display.name}`}
                      >
                        {Object.entries(ORIENTATIONS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="text-xs text-muted whitespace-nowrap">
                      {isOnline && metrics.uptimeSeconds ? (
                        <>
                          <div>Up {formatDuration(metrics.uptimeSeconds)}</div>
                          {metrics.memUsedMb && <div className="text-faint">{metrics.memUsedMb} of {metrics.memTotalMb} MB</div>}
                        </>
                      ) : (
                        <span className="text-faint">No data</span>
                      )}
                      <SoftwareCell display={display} latestRelease={latestRelease} isAdmin={isAdmin} isOnline={isOnline} />
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
                          onClick={() => onShareScreen(display)}
                          disabled={!isOnline}
                          className="btn-icon"
                          title="Share your screen"
                          aria-label={`Share your screen to ${display.name}`}
                        >
                          <MonitorUp className="w-4 h-4" />
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
                          onClick={() => onSetBlank(display, !display.metrics?.blank)}
                          disabled={!isOnline}
                          className="btn-icon"
                          aria-pressed={!display.metrics?.blank}
                          title={display.metrics?.blank ? 'Turn the screen back on' : 'Turn the screen off (black)'}
                          aria-label={`${display.metrics?.blank ? 'Turn on' : 'Turn off'} ${display.name}`}
                        >
                          <Power className={`w-4 h-4 ${!isOnline ? '' : display.metrics?.blank ? 'text-caution' : 'text-live'}`} />
                        </button>
                        {isAdmin && (
                          <>
                            <span className="w-px h-5 bg-line mx-1.5" aria-hidden="true" />
                            <button
                              onClick={() => handleDeleteDisplay(display)}
                              className="btn-icon is-danger"
                              title="Remove display"
                              aria-label={`Remove ${display.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
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
