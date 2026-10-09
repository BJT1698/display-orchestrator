// Digital Signage Fullscreen Kiosk Viewer Client
(function() {
  'use strict';

  const layerA = document.getElementById('layer-a');
  const layerB = document.getElementById('layer-b');
  const hudClock = document.getElementById('hud-clock');
  const statusIndicator = document.getElementById('status-indicator');
  const pushContainer = document.getElementById('push-frame-container');
  const pushIframe = document.getElementById('push-iframe');
  const blankOverlay = document.getElementById('blank-overlay');
  const emergencyOverlay = document.getElementById('emergency-overlay');
  const alertTitle = document.getElementById('alert-title');
  const alertMessage = document.getElementById('alert-message');
  const pairingOverlay = document.getElementById('pairing-overlay');
  const pairingCodeDisplay = document.getElementById('pairing-code-display');
  const pairingDeviceName = document.getElementById('pairing-device-name');
  const pairingDeviceUuid = document.getElementById('pairing-device-uuid');
  const standbyOverlay = document.getElementById('standby-overlay');
  const standbyStatusBadge = document.getElementById('standby-status-badge');
  const standbyTitle = document.getElementById('standby-title');
  const standbySub = document.getElementById('standby-sub');
  const standbyServerUrl = document.getElementById('standby-server-url');
  const standbyDeviceName = document.getElementById('standby-device-name');
  const standbyDeviceUuid = document.getElementById('standby-device-uuid');

  let activeLayer = layerA;
  let inactiveLayer = layerB;
  let currentPlaylist = null;
  let currentSlideIndex = -1;
  let slideTimer = null;
  let reloadToken = null;
  let pushedUrl = null;

  function init() {
    startClock();
    pollAgentState();
    // Local poll; kept short so emergency alerts and pushed pages appear within a second
    setInterval(pollAgentState, 1000);
  }

  function startClock() {
    function update() {
      const now = new Date();
      if (hudClock) hudClock.innerText = now.toLocaleTimeString('en-GB');
    }
    if (hudClock) {
      setInterval(update, 1000);
      update();
    }
  }

  async function pollAgentState() {
    try {
      const res = await fetch('/api/agent/state', { cache: 'no-store' }).then(r => r.json());
      const isOnline = res.isOnline;
      applyOverrides(res.overrides);
      if (statusIndicator) statusIndicator.className = isOnline ? 'status-dot' : 'status-dot offline';

      if (res.pairingPIN) {
        hideStandbyScreen();
        showPairingScreen(res.pairingPIN, res.config);
        return;
      } else {
        hidePairingScreen();
      }

      if (res.currentPlaylist && res.currentPlaylist.items && res.currentPlaylist.items.length > 0) {
        hideStandbyScreen();
        if (!currentPlaylist || currentPlaylist.id !== res.currentPlaylist.id || currentPlaylist.updated_at !== res.currentPlaylist.updated_at) {
          currentPlaylist = res.currentPlaylist;
          currentSlideIndex = 0;
          playCurrentSlide();
        }
      } else {
        stopPlayback();
        showStandbyScreen(res.config, isOnline);
      }
    } catch (e) {
      if (statusIndicator) statusIndicator.className = 'status-dot offline';
      showStandbyScreen(null, false);
    }
  }

  // Commands from the server that sit on top of normal playback, each with its own expiry
  function applyOverrides(o) {
    if (!o) return;
    const now = Date.now();

    if (reloadToken === null) {
      reloadToken = o.reloadToken;
    } else if (o.reloadToken !== reloadToken) {
      window.location.reload();
      return;
    }

    blankOverlay.classList.toggle('visible', Boolean(o.blank));

    const emergency = o.emergency && o.emergency.expiresAt > now ? o.emergency : null;
    if (emergency) {
      alertTitle.textContent = emergency.title || 'Emergency';
      alertMessage.textContent = emergency.message || '';
    }
    emergencyOverlay.classList.toggle('visible', Boolean(emergency));

    const push = o.push && o.push.expiresAt > now ? o.push : null;
    if (push) {
      if (pushedUrl !== push.url) {
        pushedUrl = push.url;
        pushIframe.src = push.url;
      }
      pushContainer.classList.add('visible');
    } else if (pushedUrl !== null) {
      pushedUrl = null;
      pushContainer.classList.remove('visible');
      pushIframe.src = 'about:blank';
    }
  }

  function shortId(uuid) {
    return (uuid || '').substring(0, 8) || '--------';
  }

  function showStandbyScreen(cfg, isOnline) {
    if (!standbyOverlay) return;
    if (cfg) {
      standbyDeviceName.textContent = cfg.name || 'Signage player';
      standbyDeviceUuid.textContent = shortId(cfg.uuid);
      standbyServerUrl.textContent = cfg.serverUrl || 'ws://server:8080/ws';
    }
    if (isOnline) {
      standbyOverlay.dataset.tally = 'live';
      standbyStatusBadge.textContent = 'Connected';
      standbyTitle.textContent = 'Ready for content';
      standbySub.textContent = 'This screen is connected. Assign a playlist to it in Signage Control to start playback.';
    } else {
      standbyOverlay.dataset.tally = 'caution';
      standbyStatusBadge.textContent = 'Connecting';
      standbyTitle.textContent = 'Connecting to the server';
      standbySub.textContent = 'Trying to reach the server. Check the network cable and the server address below.';
    }
    standbyOverlay.classList.add('visible');
  }

  function hideStandbyScreen() {
    if (standbyOverlay) {
      standbyOverlay.classList.remove('visible');
    }
  }

  function showPairingScreen(pin, cfg) {
    // Split six-character codes into two groups of three for easier reading from a distance
    const code = String(pin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    pairingCodeDisplay.textContent = '';
    if (code.length === 6) {
      pairingCodeDisplay.append(code.slice(0, 3));
      const gap = document.createElement('span');
      gap.className = 'gap';
      pairingCodeDisplay.append(gap, code.slice(3));
    } else {
      pairingCodeDisplay.textContent = code;
    }
    pairingCodeDisplay.setAttribute('aria-label', 'Pairing code ' + code.split('').join(' '));
    if (cfg) {
      pairingDeviceName.textContent = cfg.name || 'Signage player';
      pairingDeviceUuid.textContent = shortId(cfg.uuid);
    }
    pairingOverlay.classList.add('visible');
    stopPlayback();
  }

  function hidePairingScreen() {
    pairingOverlay.classList.remove('visible');
  }

  function stopPlayback() {
    if (slideTimer) {
      clearTimeout(slideTimer);
      slideTimer = null;
    }
  }

  function playCurrentSlide() {
    if (!currentPlaylist || !currentPlaylist.items || currentPlaylist.items.length === 0) {
      activeLayer.innerHTML = '';
      return;
    }

    if (currentSlideIndex >= currentPlaylist.items.length) {
      if (currentPlaylist.loop_enabled !== false) {
        currentSlideIndex = 0;
      } else {
        return;
      }
    }

    const item = currentPlaylist.items[currentSlideIndex];
    renderSlide(inactiveLayer, item);

    const transition = item.transition || currentPlaylist.transition_effect || 'fade';
    inactiveLayer.className = `layer transition-${transition} active`;
    activeLayer.className = `layer transition-${transition} previous`;

    const temp = activeLayer;
    activeLayer = inactiveLayer;
    inactiveLayer = temp;

    scheduleNext(item.duration_seconds || 10);
  }

  function renderSlide(layer, item) {
    layer.innerHTML = '';
    const mtype = item.media_type;
    const src = item.local_url || item.url;

    if (mtype === 'image') {
      const img = document.createElement('img');
      img.src = src;
      layer.appendChild(img);
    } else if (mtype === 'video') {
      const video = document.createElement('video');
      video.src = src;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.onended = () => {
        clearTimeout(slideTimer);
        nextSlide();
      };
      layer.appendChild(video);
      video.play().catch(() => {});
    } else if (mtype === 'html_snippet') {
      // srcdoc iframe: scripts in the snippet run (innerHTML would skip them) and its CSS stays contained
      const frame = document.createElement('iframe');
      frame.className = 'html-frame';
      frame.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style>' +
        '</head><body>' + (item.html_content || item.content || '') + '</body></html>';
      layer.appendChild(frame);
    } else if (mtype === 'webpage') {
      const iframe = document.createElement('iframe');
      iframe.src = src;
      layer.appendChild(iframe);
    }
  }

  function scheduleNext(durSec) {
    if (slideTimer) clearTimeout(slideTimer);
    slideTimer = setTimeout(() => {
      nextSlide();
    }, durSec * 1000);
  }

  function nextSlide() {
    if (!currentPlaylist || !currentPlaylist.items || currentPlaylist.items.length <= 1) return;
    currentSlideIndex++;
    playCurrentSlide();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
