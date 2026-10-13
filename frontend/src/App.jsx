import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LayoutGrid, Tv, ListVideo, Image as ImageIcon, CalendarClock, ScrollText, Siren, KeyRound, RefreshCw, Users, LogOut } from 'lucide-react';
import { api, auth, updatesApi } from './services/api';
import { DashboardView } from './views/DashboardView';
import { DisplaysView } from './views/DisplaysView';
import { PlaylistsView } from './views/PlaylistsView';
import { MediaView } from './views/MediaView';
import { SchedulesView } from './views/SchedulesView';
import { SystemView } from './views/SystemView';
import { UsersView } from './views/UsersView';

import { PairingModal } from './components/PairingModal';
import { PushUrlModal } from './components/PushUrlModal';
import { EmergencyAlertModal } from './components/EmergencyAlertModal';
import { PlaylistPreviewModal } from './components/PlaylistPreviewModal';
import { MediaUploadModal } from './components/MediaUploadModal';
import { RemoteControlModal } from './components/RemoteControlModal';
import { useScreenCast, CastBar } from './components/ScreenCast';
import { GuestRequests } from './components/GuestRequests';
import { SignInScreen, SetupScreen } from './components/AuthScreens';
import { ChangePasswordModal } from './components/ChangePasswordModal';

// Decides between the sign-in/setup screens and the console, and drops back to sign-in
// whenever the server says the session is gone
export function App() {
  const [state, setState] = useState({ loading: true, user: null, needsSetup: false });

  const refresh = useCallback(async () => {
    try {
      const data = await auth.me();
      setState({ loading: false, user: data.user, needsSetup: data.needsSetup });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const onRequired = () => setState((s) => ({ ...s, user: null }));
    window.addEventListener('auth:required', onRequired);
    return () => window.removeEventListener('auth:required', onRequired);
  }, [refresh]);

  const signedIn = (user) => setState({ loading: false, user, needsSetup: false });

  if (state.loading) return <div className="min-h-screen bg-ground" />;
  if (!state.user) {
    return state.needsSetup ? <SetupScreen onSignedIn={signedIn} /> : <SignInScreen onSignedIn={signedIn} />;
  }
  return (
    <Console
      key={state.user.id}
      user={state.user}
      onSignOut={async () => {
        await auth.logout().catch(() => {});
        setState({ loading: false, user: null, needsSetup: false });
      }}
    />
  );
}

function Console({ user, onSignOut }) {
  const isAdmin = user.role === 'admin';
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [displays, setDisplays] = useState([]);
  const [pendingPairings, setPendingPairings] = useState([]);
  const [guestRequests, setGuestRequests] = useState([]);
  const [iceServers, setIceServers] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [mediaList, setMediaList] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [groups, setGroups] = useState([]);
  const [systemStats, setSystemStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [thumbnails, setThumbnails] = useState({}); // display uuid -> latest screen picture
  const [latestRelease, setLatestRelease] = useState(null);

  useEffect(() => {
    updatesApi.latestRelease().then(setLatestRelease).catch(() => {});
  }, []);

  // Modals state
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [pushUrlDisplay, setPushUrlDisplay] = useState(null);
  const [previewPlaylist, setPreviewPlaylist] = useState(null);
  const [remoteDisplay, setRemoteDisplay] = useState(null);

  // The live dashboard socket, shared with the remote control view
  const socketRef = useRef(null);
  const remoteListenersRef = useRef(new Set());

  const sendWs = useCallback((msg) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const subscribeRemote = useCallback((listener) => {
    remoteListenersRef.current.add(listener);
    return () => remoteListenersRef.current.delete(listener);
  }, []);

  // Fetch all initial data
  const loadData = useCallback(async () => {
    try {
      const [d, p, pl, m, s, g, sys, l] = await Promise.all([
        api.getDisplays(),
        api.getPendingPairings(),
        api.getPlaylists(),
        api.getMedia(),
        api.getSchedules(),
        api.getGroups(),
        api.getSystemStatus(),
        api.getLogs(50)
      ]);

      setDisplays(d || []);
      setPendingPairings(p || []);
      setPlaylists(pl || []);
      setMediaList(m || []);
      setSchedules(s || []);
      setGroups(g || []);
      setSystemStats(sys || null);
      setLogs(l || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time Dashboard WebSocket Listener
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host || 'localhost:8080';
    const wsUrl = `${wsProtocol}//${wsHost}/ws?type=dashboard`;

    let socket = null;
    let reconnectTimeout = null;

    const connect = () => {
      try {
        socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          setWsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            handleWsMessage(msg);
          } catch (e) {
            console.error('Failed to parse WS message:', e);
          }
        };

        socket.onclose = (event) => {
          setWsConnected(false);
          remoteListenersRef.current.forEach((listener) => listener({ type: 'REMOTE_STATUS', status: 'disconnected' }));
          // 4401: the session expired or was revoked; reconnecting would only fail again
          if (event.code === 4401) {
            window.dispatchEvent(new Event('auth:required'));
            return;
          }
          reconnectTimeout = setTimeout(connect, 3000);
        };

        socket.onerror = () => {
          setWsConnected(false);
        };
      } catch (e) {
        reconnectTimeout = setTimeout(connect, 5000);
      }
    };

    const handleWsMessage = (msg) => {
      if (msg.type.startsWith('REMOTE_') || msg.type.startsWith('CAST_')) {
        remoteListenersRef.current.forEach((listener) => listener(msg));
        return;
      }

      switch (msg.type) {
        case 'INIT_STATE':
          if (msg.data.displays) setDisplays(msg.data.displays);
          if (msg.data.pendingPairings) setPendingPairings(msg.data.pendingPairings);
          setGuestRequests(msg.data.guestRequests || []);
          setIceServers(msg.data.iceServers || []);
          break;

        case 'GUEST_REQUESTS':
          setGuestRequests(msg.data || []);
          break;

        case 'DISPLAY_STATUS_CHANGE':
          setDisplays((prev) =>
            prev.map((d) => (d.uuid === msg.data.uuid ? { ...d, status: msg.data.status } : d))
          );
          break;

        case 'DISPLAY_HEARTBEAT':
          setDisplays((prev) =>
            prev.map((d) =>
              d.uuid === msg.data.uuid
                ? { ...d, status: 'online', metrics: msg.data.metrics, last_heartbeat: msg.data.timestamp }
                : d
            )
          );
          break;

        case 'PAIRING_REQUEST_NEW':
          setPendingPairings((prev) => [msg.data, ...prev.filter((p) => p.uuid !== msg.data.uuid)]);
          break;

        case 'PAIRING_RESOLVED':
          setPendingPairings((prev) => prev.filter((p) => p.uuid !== msg.data.uuid));
          loadData();
          break;

        case 'DISPLAY_NOW_PLAYING':
          setDisplays((prev) =>
            prev.map((d) => (d.uuid === msg.data.uuid ? { ...d, ...msg.data } : d))
          );
          break;

        case 'DISPLAY_SCREENSHOT':
          setThumbnails((prev) => ({ ...prev, [msg.data.uuid]: msg.data }));
          break;

        case 'LOG_ENTRY':
          setLogs((prev) => [msg.data, ...prev.slice(0, 49)]);
          break;

        default:
          break;
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [loadData]);

  const cast = useScreenCast({ sendWs, subscribe: subscribeRemote, wsConnected, iceServers });

  // Screen on/off from the display wall: show the new state at once, the screen confirms it
  // in its next heartbeat; put it back if the command fails
  const setBlank = useCallback(async (display, blank) => {
    const apply = (value) => setDisplays((prev) => prev.map((d) =>
      d.id === display.id ? { ...d, metrics: { ...(d.metrics || {}), blank: value } } : d));
    apply(blank);
    try {
      await api.sendCommand(display.id, 'blank', { state: blank });
    } catch (err) {
      apply(!blank);
      alert('Could not change the screen: ' + err.message);
    }
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Overview', Icon: LayoutGrid },
    { id: 'displays', label: 'Displays', Icon: Tv, count: displays.length },
    { id: 'playlists', label: 'Playlists', Icon: ListVideo, count: playlists.length },
    { id: 'media', label: 'Media', Icon: ImageIcon, count: mediaList.length },
    { id: 'schedules', label: 'Schedules', Icon: CalendarClock, count: schedules.length },
    { id: 'system', label: 'Groups and logs', Icon: ScrollText },
    ...(isAdmin ? [{ id: 'users', label: 'Users', Icon: Users }] : []),
  ];
  const onlineCount = displays.filter((d) => d.status === 'online').length;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-60 md:h-screen md:sticky md:top-0 shrink-0 bg-surface border-b md:border-b-0 md:border-r border-line flex flex-col">
        <div className="px-5 pt-5 pb-4 md:pb-6">
          <div className="display text-xl font-semibold leading-none text-ink">Signage Control</div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <span className={`tally ${wsConnected ? 'tally-live' : 'tally-caution'}`} aria-hidden="true" />
            {wsConnected ? `${onlineCount} of ${displays.length} screens on air` : 'Reconnecting to server'}
          </div>
        </div>

        <nav className="flex md:flex-col gap-0.5 px-3 pb-3 md:pb-0 overflow-x-auto" aria-label="Sections">
          {navItems.map(({ id, label, Icon, count }) => {
            const active = currentTab === id;
            return (
              <button
                key={id}
                onClick={() => setCurrentTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-3 h-9 px-3 rounded text-sm whitespace-nowrap transition-colors ${
                  active ? 'bg-raised text-ink font-medium' : 'text-muted hover:text-ink hover:bg-raised/60'
                }`}
              >
                {active && <span className="hidden md:block absolute -left-3 top-1.5 bottom-1.5 w-0.5 bg-ink rounded-r" />}
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {count !== undefined && <span className="text-xs text-faint">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="hidden md:flex flex-col gap-2 mt-auto p-4 border-t border-line">
          {isAdmin && (
            <button onClick={() => setIsPairingOpen(true)} className="btn w-full">
              <KeyRound className="w-4 h-4" />
              Pair a display
              {pendingPairings.length > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-sm bg-caution text-ground text-xs font-semibold">
                  {pendingPairings.length}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => setIsEmergencyOpen(true)}
            className="btn w-full border-alert/60 text-alert hover:!border-alert hover:!bg-alert/10"
          >
            <Siren className="w-4 h-4" />
            Emergency alert
          </button>
          <button onClick={loadData} className="btn btn-quiet btn-sm w-full justify-start text-faint">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh data
          </button>
        </div>

        <AccountBlock user={user} onChangePassword={() => setIsPasswordOpen(true)} onSignOut={onSignOut} className="hidden md:block" />
      </aside>

      <main className="flex-1 min-w-0">
        <CastBar session={cast.session} onStop={cast.stop} onDismiss={cast.dismiss} />
        <GuestRequests requests={guestRequests} displays={displays} sendWs={sendWs} />
        <div className="md:hidden flex gap-2 px-4 pt-4">
          {isAdmin && (
            <button onClick={() => setIsPairingOpen(true)} className="btn btn-sm flex-1">
              <KeyRound className="w-4 h-4" /> Pair a display
            </button>
          )}
          <button onClick={() => setIsEmergencyOpen(true)} className="btn btn-sm flex-1 border-alert/60 text-alert">
            <Siren className="w-4 h-4" /> Emergency alert
          </button>
        </div>

        <div className="px-4 sm:px-8 py-8 max-w-[1400px] mx-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              systemStats={systemStats}
              displays={displays}
              pendingPairings={isAdmin ? pendingPairings : []}
              playlists={playlists}
              logs={logs}
              isAdmin={isAdmin}
              thumbnails={thumbnails}
              onOpenPairing={() => setIsPairingOpen(true)}
              onOpenEmergency={() => setIsEmergencyOpen(true)}
              actions={{
                onRemoteControl: (d) => setRemoteDisplay(d),
                onShareScreen: (d) => cast.start(d),
                onPushUrl: (d) => setPushUrlDisplay(d),
                onSetBlank: setBlank,
              }}
              onNavigate={(tab) => setCurrentTab(tab)}
            />
          )}

          {currentTab === 'displays' && (
            <DisplaysView
              displays={displays}
              groups={groups}
              playlists={playlists}
              onRefresh={loadData}
              isAdmin={isAdmin}
              onOpenPairing={() => setIsPairingOpen(true)}
              onPushUrl={(d) => setPushUrlDisplay(d)}
              onRemoteControl={(d) => setRemoteDisplay(d)}
              onShareScreen={(d) => cast.start(d)}
              onSetBlank={setBlank}
              latestRelease={latestRelease}
            />
          )}

          {currentTab === 'playlists' && (
            <PlaylistsView
              playlists={playlists}
              mediaList={mediaList}
              onRefresh={loadData}
              onPreviewPlaylist={(p) => setPreviewPlaylist(p)}
            />
          )}

          {currentTab === 'media' && (
            <MediaView
              mediaList={mediaList}
              storageStats={systemStats?.storage}
              onRefresh={loadData}
              onOpenUpload={() => setIsUploadOpen(true)}
            />
          )}

          {currentTab === 'schedules' && (
            <SchedulesView
              schedules={schedules}
              playlists={playlists}
              displays={displays}
              groups={groups}
              onRefresh={loadData}
            />
          )}

          {currentTab === 'system' && (
            <SystemView
              systemStats={systemStats}
              logs={logs}
              groups={groups}
              playlists={playlists}
              onRefresh={loadData}
              isAdmin={isAdmin}
            />
          )}

          {currentTab === 'users' && isAdmin && <UsersView currentUser={user} />}
        </div>

        <div className="md:hidden px-4 pb-8">
          <AccountBlock user={user} onChangePassword={() => setIsPasswordOpen(true)} onSignOut={onSignOut} className="panel" />
        </div>
      </main>

      {/* Global Modals */}
      {isPasswordOpen && <ChangePasswordModal onClose={() => setIsPasswordOpen(false)} />}

      <PairingModal
        isOpen={isAdmin && isPairingOpen}
        onClose={() => setIsPairingOpen(false)}
        pendingList={pendingPairings}
        groups={groups}
        onSuccess={loadData}
      />

      <PushUrlModal
        isOpen={Boolean(pushUrlDisplay)}
        onClose={() => setPushUrlDisplay(null)}
        display={pushUrlDisplay}
        onSuccess={loadData}
      />

      <EmergencyAlertModal
        isOpen={isEmergencyOpen}
        onClose={() => setIsEmergencyOpen(false)}
        onSuccess={loadData}
      />

      <PlaylistPreviewModal
        isOpen={Boolean(previewPlaylist)}
        onClose={() => setPreviewPlaylist(null)}
        playlist={previewPlaylist}
      />

      {remoteDisplay && (
        <RemoteControlModal
          display={remoteDisplay}
          wsConnected={wsConnected}
          sendWs={sendWs}
          subscribe={subscribeRemote}
          onClose={() => setRemoteDisplay(null)}
        />
      )}

      <MediaUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
}

function AccountBlock({ user, onChangePassword, onSignOut, className = '' }) {
  return (
    <div className={`px-4 py-3 border-t border-line ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink truncate">{user.username}</span>
        <span className="text-xs text-faint shrink-0">{user.role === 'admin' ? 'Administrator' : 'Operator'}</span>
      </div>
      <div className="mt-2 flex gap-1 -ml-2">
        <button onClick={onChangePassword} className="btn btn-quiet btn-sm">Change password</button>
        <button onClick={onSignOut} className="btn btn-quiet btn-sm">
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
}
