(function() {
  'use strict';

  // DOM Elements
  const stage = document.getElementById('stage');
  const layerA = document.getElementById('layer-a');
  const layerB = document.getElementById('layer-b');
  const hudOverlay = document.getElementById('hud-overlay');
  const hudTime = document.getElementById('hud-time');
  const statusIndicator = document.getElementById('status-indicator');
  const blankOverlay = document.getElementById('blank-overlay');
  const pushContainer = document.getElementById('push-frame-container');
  const pushIframe = document.getElementById('push-iframe');
  const emergencyOverlay = document.getElementById('emergency-overlay');
  const alertTitle = document.getElementById('alert-title');
  const alertMessage = document.getElementById('alert-message');
  const pairingOverlay = document.getElementById('pairing-overlay');
  const pairingCodeDisplay = document.getElementById('pairing-code-display');
  const pairingDeviceName = document.getElementById('pairing-device-name');
  const pairingDeviceUuid = document.getElementById('pairing-device-uuid');
  const pairingServerUrl = document.getElementById('pairing-server-url');

  // Player State
  let ws = null;
  let activeLayer = layerA;
  let inactiveLayer = layerB;
  let playlist = null;
  let currentItemIndex = -1;
  let slideTimer = null;
  let pushTimer = null;
  let alertTimer = null;
  let isPlaying = false;
  let currentPlayingItem = null;

  // Determine WebSocket URL
  const urlParams = new URLSearchParams(window.location.search);
  const explicitWs = urlParams.get('ws');
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const defaultWsHost = window.location.host || 'localhost:9090';
  const targetWsUrl = explicitWs || `${wsProtocol}//${defaultWsHost}/ws-player`;

  // Initialize
  function init() {
    startClock();
    connectWebSocket();
  }

  // Live HUD Clock
  function startClock() {
    function update() {
      const now = new Date();
      hudTime.textContent = now.toLocaleTimeString('en-GB');
    }
    setInterval(update, 1000);
    update();
  }

  // WebSocket Connection
  function connectWebSocket() {
    try {
      ws = new WebSocket(targetWsUrl);

      ws.onopen = () => {
        statusIndicator.className = 'status-dot';
        statusIndicator.title = 'Connected to Agent';
        sendMessage({ type: 'PLAYER_READY' });
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleMessage(msg);
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      };

      ws.onclose = () => {
        statusIndicator.className = 'status-dot disconnected';
        statusIndicator.title = 'Disconnected (Offline Mode)';
        // Reconnect backoff
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (err) => {
        statusIndicator.className = 'status-dot offline';
      };
    } catch (e) {
      console.warn('WebSocket init exception:', e);
      setTimeout(connectWebSocket, 5000);
    }
  }

  function sendMessage(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // Message Dispatcher
  function handleMessage(msg) {
    switch (msg.type) {
      case 'INIT_STATE':
      case 'SYNC_PLAYLIST':
        onSyncPlaylist(msg.playlist, msg.offline);
        break;

      case 'SHOW_PAIRING':
      case 'UNPAIRED':
        showPairingScreen(msg);
        break;

      case 'AUTHENTICATED':
      case 'PAIRING_APPROVED':
        hidePairingScreen();
        if (msg.playlist) {
          onSyncPlaylist(msg.playlist);
        }
        break;

      case 'PUSH_URL':
        handlePushUrl(msg.url, msg.durationSeconds);
        break;

      case 'BLANK_SCREEN':
        handleBlankScreen(msg.state);
        break;

      case 'EMERGENCY_ALERT':
        handleEmergencyAlert(msg.title, msg.message, msg.durationSeconds);
        break;

      case 'FORCE_RELOAD':
        window.location.reload();
        break;

      case 'SET_ORIENTATION':
        handleOrientation(msg.orientation);
        break;

      case 'PLAY_ITEM':
        playSpecificItem(msg.item);
        break;
    }
  }

  function showPairingScreen(data) {
    pairingCodeDisplay.textContent = data.pairingCode || '--- ---';
    if (data.clientName) pairingDeviceName.textContent = data.clientName;
    if (data.uuid) pairingDeviceUuid.textContent = data.uuid.substring(0, 8) + '...';
    if (data.serverUrl) pairingServerUrl.textContent = data.serverUrl;
    pairingOverlay.classList.add('visible');
    stopPlayback();
  }

  function hidePairingScreen() {
    pairingOverlay.classList.remove('visible');
  }

  function onSyncPlaylist(newPlaylist, isOffline) {
    hidePairingScreen();
    playlist = newPlaylist;

    if (isOffline) {
      statusIndicator.className = 'status-dot offline';
      statusIndicator.title = 'Offline Cache Mode';
    }

    if (!playlist || !playlist.items || playlist.items.length === 0) {
      renderEmptyState();
      return;
    }

    // Start or restart playback loop
    currentItemIndex = 0;
    playCurrentItem();
  }

  function renderEmptyState() {
    stopPlayback();
    activeLayer.innerHTML = `
      <div style="text-align:center;color:#64748b;font-family:system-ui,sans-serif;">
        <h2 style="font-size:2rem;margin-bottom:8px;color:#94a3b8;">No Playlist Assigned</h2>
        <p>Assign a playlist from the Web Orchestrator to begin playback.</p>
      </div>
    `;
    activeLayer.className = 'layer active';
  }

  function stopPlayback() {
    if (slideTimer) {
      clearTimeout(slideTimer);
      slideTimer = null;
    }
    isPlaying = false;
  }

  function playCurrentItem() {
    if (!playlist || !playlist.items || playlist.items.length === 0) return;

    if (currentItemIndex >= playlist.items.length) {
      if (playlist.loop_enabled !== false) {
        currentItemIndex = 0;
      } else {
        return; // loop disabled, stay on last slide
      }
    }

    const item = playlist.items[currentItemIndex];
    currentPlayingItem = item;
    renderItemInLayer(inactiveLayer, item);

    // Swap layers with transition animation
    const transition = item.transition || playlist.transition_effect || 'fade';
    inactiveLayer.className = `layer transition-${transition} active`;
    activeLayer.className = `layer transition-${transition} previous`;

    // Swap pointers
    const temp = activeLayer;
    activeLayer = inactiveLayer;
    inactiveLayer = temp;

    // Report playing item to agent
    sendMessage({
      type: 'SLIDE_CHANGE',
      item: {
        id: item.id,
        media_id: item.media_id,
        name: item.original_name,
        type: item.media_type,
        index: currentItemIndex
      }
    });

    // Schedule next slide
    scheduleNextSlide(item);
  }

  function renderItemInLayer(layer, item) {
    layer.innerHTML = '';

    const mediaType = item.media_type;
    const mediaUrl = item.local_cached_url || item.url;

    if (mediaType === 'image') {
      const img = document.createElement('img');
      img.src = mediaUrl;
      img.alt = item.original_name || 'Slide';
      layer.appendChild(img);
    } else if (mediaType === 'video') {
      const video = document.createElement('video');
      video.src = mediaUrl;
      video.autoplay = true;
      video.muted = true; // allow autoplay without user gesture block
      video.playsInline = true;
      video.setAttribute('webkit-playsinline', 'true');
      
      // If video finishes before duration timer, advance immediately
      video.onended = () => {
        clearTimeout(slideTimer);
        nextSlide();
      };
      layer.appendChild(video);
      video.play().catch(err => console.warn('Video autoplay failed:', err));
    } else if (mediaType === 'html_snippet') {
      const div = document.createElement('div');
      div.className = 'html-container';
      div.innerHTML = item.html_content || '<div style="color:white;padding:20px;">Empty HTML Snippet</div>';
      
      // Execute inline scripts inside snippet if any
      const scripts = div.querySelectorAll('script');
      scripts.forEach(s => {
        try {
          const newScript = document.createElement('script');
          newScript.textContent = s.textContent;
          document.body.appendChild(newScript);
        } catch (e) {
          console.error('Error executing script snippet:', e);
        }
      });

      layer.appendChild(div);
    } else if (mediaType === 'webpage') {
      const iframe = document.createElement('iframe');
      iframe.src = mediaUrl;
      iframe.setAttribute('allow', 'autoplay; fullscreen');
      layer.appendChild(iframe);
    }
  }

  function scheduleNextSlide(item) {
    if (slideTimer) clearTimeout(slideTimer);

    const durationSeconds = item.duration_seconds || 10;
    slideTimer = setTimeout(() => {
      nextSlide();
    }, durationSeconds * 1000);
  }

  function nextSlide() {
    if (!playlist || !playlist.items || playlist.items.length <= 1) return;
    currentItemIndex++;
    playCurrentItem();
  }

  function playSpecificItem(item) {
    renderItemInLayer(activeLayer, item);
  }

  // Live Push URL
  function handlePushUrl(url, durationSeconds) {
    if (pushTimer) clearTimeout(pushTimer);
    pushIframe.src = url;
    pushContainer.classList.add('visible');

    const dur = (durationSeconds || 30) * 1000;
    pushTimer = setTimeout(() => {
      pushContainer.classList.remove('visible');
      pushIframe.src = 'about:blank';
    }, dur);
  }

  // Blank Screen
  function handleBlankScreen(state) {
    if (state) {
      blankOverlay.classList.add('visible');
    } else {
      blankOverlay.classList.remove('visible');
    }
  }

  // Emergency Alert
  function handleEmergencyAlert(title, message, durationSeconds) {
    if (alertTimer) clearTimeout(alertTimer);
    alertTitle.textContent = title || '⚠️ EMERGENCY ALERT';
    alertMessage.textContent = message || 'Important announcement.';
    emergencyOverlay.classList.add('visible');

    const dur = (durationSeconds || 60) * 1000;
    alertTimer = setTimeout(() => {
      emergencyOverlay.classList.remove('visible');
    }, dur);
  }

  // Orientation
  function handleOrientation(orientation) {
    if (orientation === 'portrait') {
      document.body.style.transform = 'rotate(90deg)';
      document.body.style.transformOrigin = 'center center';
    } else {
      document.body.style.transform = 'none';
    }
  }

  // Run
  window.addEventListener('DOMContentLoaded', init);
})();
