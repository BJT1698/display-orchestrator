import React, { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, Tv, PlaySquare, Image as ImageIcon, Calendar, Terminal, ShieldAlert, KeyRound, RefreshCw, Radio } from 'lucide-react';
import { api } from './services/api';
import { DashboardView } from './views/DashboardView';
import { DisplaysView } from './views/DisplaysView';
import { PlaylistsView } from './views/PlaylistsView';
import { MediaView } from './views/MediaView';
import { SchedulesView } from './views/SchedulesView';
import { SystemView } from './views/SystemView';

import { PairingModal } from './components/PairingModal';
import { PushUrlModal } from './components/PushUrlModal';
import { EmergencyAlertModal } from './components/EmergencyAlertModal';
import { PlaylistPreviewModal } from './components/PlaylistPreviewModal';
import { MediaUploadModal } from './components/MediaUploadModal';

export function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [displays, setDisplays] = useState([]);
  const [pendingPairings, setPendingPairings] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [mediaList, setMediaList] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [groups, setGroups] = useState([]);
  const [systemStats, setSystemStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);

  // Modals state
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [pushUrlDisplay, setPushUrlDisplay] = useState(null);
  const [previewPlaylist, setPreviewPlaylist] = useState(null);

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

        socket.onclose = () => {
          setWsConnected(false);
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
      switch (msg.type) {
        case 'INIT_STATE':
          if (msg.data.displays) setDisplays(msg.data.displays);
          if (msg.data.pendingPairings) setPendingPairings(msg.data.pendingPairings);
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
      if (socket) socket.close();
    };
  }, [loadData]);

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-950/80 border-r border-slate-800/80 flex flex-col justify-between shrink-0 p-4">
        <div>
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 px-3 py-4 mb-6 border-b border-slate-800/80">
            <div className="p-2.5 bg-gradient-to-tr from-emerald-600 to-teal-400 rounded-xl text-white shadow-lg shadow-emerald-950">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                Display<span className="text-emerald-400">Hub</span>
              </div>
              <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                Orchestrator 1.0
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              onClick={() => setCurrentTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                currentTab === 'dashboard'
                  ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" /> Overview
            </button>

            <button
              onClick={() => setCurrentTab('displays')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                currentTab === 'displays'
                  ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Tv className="w-4 h-4" /> Displays
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {displays.length}
              </span>
            </button>

            <button
              onClick={() => setCurrentTab('playlists')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                currentTab === 'playlists'
                  ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <PlaySquare className="w-4 h-4" /> Playlists
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {playlists.length}
              </span>
            </button>

            <button
              onClick={() => setCurrentTab('media')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                currentTab === 'media'
                  ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <ImageIcon className="w-4 h-4" /> Media Library
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {mediaList.length}
              </span>
            </button>

            <button
              onClick={() => setCurrentTab('schedules')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                currentTab === 'schedules'
                  ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4" /> Schedules
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {schedules.length}
              </span>
            </button>

            <button
              onClick={() => setCurrentTab('system')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                currentTab === 'system'
                  ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Terminal className="w-4 h-4" /> Logs & Groups
            </button>
          </nav>
        </div>

        {/* Live WS Status Indicator & Pairing Quick Action */}
        <div className="pt-4 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between px-3 text-[11px] text-slate-400 font-mono">
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 glow-online' : 'bg-red-500'}`} />
              {wsConnected ? 'WS Connected' : 'WS Reconnecting'}
            </span>
            <button onClick={loadData} className="hover:text-white" title="Refresh state">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => setIsPairingOpen(true)}
            className="w-full py-2.5 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            Pair Display {pendingPairings.length > 0 && `(${pendingPairings.length})`}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-800/80 bg-slate-950/40 backdrop-blur-md px-6 flex items-center justify-between">
          <div className="text-xs font-medium text-slate-400">
            Digital Signage Management &bull; <strong className="text-slate-200 font-mono">SQLite WAL Engine</strong>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsEmergencyOpen(true)}
              className="px-4 py-2 bg-red-600/20 hover:bg-red-600 border border-red-500/50 hover:border-red-500 text-red-400 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-red-950/40"
            >
              <ShieldAlert className="w-4 h-4" /> Emergency Broadcast
            </button>
          </div>
        </header>

        {/* Dynamic Page Views */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              systemStats={systemStats}
              displays={displays}
              pendingPairings={pendingPairings}
              playlists={playlists}
              logs={logs}
              onOpenPairing={() => setIsPairingOpen(true)}
              onOpenEmergency={() => setIsEmergencyOpen(true)}
              onSelectDisplay={(d) => {
                setPushUrlDisplay(d);
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
              onOpenPairing={() => setIsPairingOpen(true)}
              onPushUrl={(d) => setPushUrlDisplay(d)}
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
            />
          )}
        </div>
      </main>

      {/* Global Modals */}
      <PairingModal
        isOpen={isPairingOpen}
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

      <MediaUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
}
