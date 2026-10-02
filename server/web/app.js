// Digital Signage Orchestrator Web Dashboard Client
(function() {
  'use strict';

  let currentDisplays = [];
  let currentPlaylists = [];
  let currentMedia = [];
  let currentLogs = [];
  let ws = null;
  let selectedDisplayForPush = null;

  function init() {
    setupNavigation();
    setupModals();
    connectWebSocket();
    loadAllData();
  }

  // Navigation tabs
  function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        navItems.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        const targetPane = document.getElementById(`pane-${tab}`);
        if (targetPane) targetPane.classList.add('active');
        document.getElementById('current-view-title').innerText = btn.innerText.replace(/[^\w\s]/gi, '').trim();
      });
    });

    document.getElementById('btn-refresh').addEventListener('click', loadAllData);
  }

  // Data Loading
  async function loadAllData() {
    try {
      const [displaysRes, playlistsRes, mediaRes, statusRes, logsRes] = await Promise.all([
        fetch('/api/displays').then(r => r.json()),
        fetch('/api/playlists').then(r => r.json()),
        fetch('/api/media').then(r => r.json()),
        fetch('/api/system/status').then(r => r.json()),
        fetch('/api/system/logs').then(r => r.json())
      ]);

      if (displaysRes.success) {
        currentDisplays = displaysRes.data || [];
        renderDisplays(currentDisplays);
      }
      if (playlistsRes.success) {
        currentPlaylists = playlistsRes.data || [];
        renderPlaylists(currentPlaylists);
      }
      if (mediaRes.success) {
        currentMedia = mediaRes.data || [];
        renderMedia(currentMedia);
      }
      if (statusRes.success) {
        renderKPIs(statusRes.data);
      }
      if (logsRes.success) {
        currentLogs = logsRes.data || [];
        renderLogs(currentLogs);
      }
    } catch (e) {
      console.error('Data load error:', e);
    }
  }

  // Render KPIs
  function renderKPIs(status) {
    const onlineCount = currentDisplays.filter(d => d.status === 'online').length;
    document.getElementById('kpi-online').innerText = onlineCount;
    document.getElementById('kpi-total').innerText = currentDisplays.length;
    document.getElementById('kpi-playlists').innerText = currentPlaylists.length;
    document.getElementById('kpi-media').innerText = currentMedia.length;
    document.getElementById('badge-displays').innerText = currentDisplays.length;
    document.getElementById('badge-playlists').innerText = currentPlaylists.length;
    if (status && status.uptime) {
      document.getElementById('kpi-uptime').innerText = `Uptime: ${Math.floor(status.uptime / 60)} min`;
    }
  }

  // Render Displays
  function renderDisplays(displays) {
    const overviewGrid = document.getElementById('overview-displays-grid');
    const fullGrid = document.getElementById('full-displays-grid');

    const html = displays.length === 0
      ? `<div class="empty-state">No displays connected yet. Click "Pair New Display" to register one.</div>`
      : displays.map(d => {
        const isOnline = d.status === 'online';
        return `
          <div class="display-card">
            <div>
              <div class="display-card-header">
                <div>
                  <div class="display-name">${d.name}</div>
                  <div class="display-ip">${d.ip_address || '127.0.0.1'}</div>
                </div>
                <span class="status-dot ${isOnline ? 'online' : 'offline'}" title="${d.status}"></span>
              </div>
              <div class="display-meta">
                <div>Playlist: <strong>${d.current_playlist_name || 'Default Loop'}</strong></div>
                <div>Orientation: <strong>${d.orientation || 'landscape'}</strong></div>
              </div>
            </div>
            <div class="display-actions">
              <button class="btn btn-outline" onclick="window.openPushModal('${d.id}', '${d.name}')">🌐 Push URL</button>
              <button class="btn btn-outline" onclick="window.sendCommand('${d.id}', 'reload')">🔄 Reload</button>
              <button class="btn btn-outline" onclick="window.sendCommand('${d.id}', 'blank', {state: true})">🌙 Blank</button>
            </div>
          </div>
        `;
      }).join('');

    if (overviewGrid) overviewGrid.innerHTML = html;
    if (fullGrid) fullGrid.innerHTML = html;
    renderKPIs();
  }

  // Render Playlists
  function renderPlaylists(playlists) {
    const container = document.getElementById('playlists-list-container');
    if (!container) return;

    container.innerHTML = playlists.map(p => `
      <div class="playlist-card" onclick="window.selectPlaylist(${p.id})">
        <div style="font-weight: 700; font-size: 0.95rem;">${p.name}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
          ${p.item_count || 0} items &bull; ${p.total_duration_seconds || 0}s loop &bull; ${p.transition_effect || 'fade'}
        </div>
      </div>
    `).join('');
  }

  window.selectPlaylist = async function(id) {
    try {
      const res = await fetch(`/api/playlists/${id}`).then(r => r.json());
      if (!res.success) return;
      const pl = res.data;
      const editor = document.getElementById('playlist-editor-container');
      editor.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div>
            <h3 style="font-size: 1.2rem; font-weight: 800;">${pl.name}</h3>
            <p style="font-size: 0.8rem; color: var(--text-muted);">${pl.description || 'Loop sequence'}</p>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(pl.items || []).map((item, idx) => `
            <div style="background: #090d16; padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; gap: 12px; align-items: center;">
                <span style="font-family: monospace; color: var(--text-muted);">${idx + 1}</span>
                <div>
                  <div style="font-weight: 700; font-size: 0.85rem;">${item.original_name || 'Slide'}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">${item.media_type} &bull; ${item.transition}</div>
                </div>
              </div>
              <span class="badge">${item.duration_seconds}s</span>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      console.error(e);
    }
  };

  // Render Media
  function renderMedia(media) {
    const container = document.getElementById('media-grid-container');
    if (!container) return;

    container.innerHTML = media.map(m => `
      <div class="media-card">
        <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 4px;" class="truncate">${m.original_name}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">${m.media_type} &bull; ${m.duration_seconds}s</div>
      </div>
    `).join('');
  }

  // Render Logs
  function renderLogs(logs) {
    const container = document.getElementById('logs-container');
    if (!container) return;
    container.innerHTML = logs.map(l => `
      <div class="log-row">
        <span style="color: var(--text-muted);">${new Date(l.created_at).toLocaleTimeString()}</span>
        <span class="badge">[${l.source.toUpperCase()}]</span>
        <span>${l.message}</span>
      </div>
    `).join('');
  }

  // Global Commands
  window.sendCommand = async function(id, action, payload = {}) {
    try {
      await fetch(`/api/displays/${id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });
      loadAllData();
    } catch (e) {
      alert('Command failed: ' + e.message);
    }
  };

  // WebSocket Live Hub
  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws?type=dashboard`);

    ws.onopen = () => {
      document.getElementById('ws-indicator').className = 'status-dot online';
      document.getElementById('ws-text').innerText = 'WebSocket Active';
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'DISPLAY_STATUS_CHANGE' || msg.type === 'DISPLAY_HEARTBEAT' || msg.type === 'PAIRING_REQUEST_NEW') {
          loadAllData();
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      document.getElementById('ws-indicator').className = 'status-dot offline';
      document.getElementById('ws-text').innerText = 'Reconnecting...';
      setTimeout(connectWebSocket, 3000);
    };
  }

  // Modals
  function setupModals() {
    document.getElementById('btn-open-pairing').onclick = () => openModal('modal-pairing');
    document.getElementById('btn-pair-screen').onclick = () => openModal('modal-pairing');

    document.getElementById('btn-submit-pairing').onclick = async () => {
      const code = document.getElementById('input-pairing-code').value.trim();
      const name = document.getElementById('input-pairing-name').value.trim();
      if (!code) return;

      const res = await fetch('/api/displays/pairing/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode: code, name: name || 'Display Screen' })
      }).then(r => r.json());

      if (res.success) {
        closeModal('modal-pairing');
        loadAllData();
      } else {
        alert(res.error || 'Failed to approve pairing');
      }
    };

    window.openPushModal = function(id, name) {
      selectedDisplayForPush = id;
      openModal('modal-push');
    };

    document.getElementById('btn-submit-push').onclick = async () => {
      const url = document.getElementById('input-push-url').value.trim();
      const dur = parseInt(document.getElementById('input-push-dur').value, 10);
      if (!url || !selectedDisplayForPush) return;

      await fetch(`/api/displays/${selectedDisplayForPush}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, durationSeconds: dur || 30 })
      });
      closeModal('modal-push');
    };

    document.getElementById('btn-emergency').onclick = async () => {
      const msg = prompt('Enter Emergency Evacuation Announcement message:');
      if (msg) {
        await fetch('/api/displays/broadcast/emergency', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '🚨 EMERGENCY ALERT', message: msg, durationSeconds: 60 })
        });
      }
    };
  }

  window.openModal = function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  };

  window.closeModal = function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  };

  window.addEventListener('DOMContentLoaded', init);
})();
