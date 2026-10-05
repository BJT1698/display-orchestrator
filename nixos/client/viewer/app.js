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

  let activeLayer = layerA;
  let inactiveLayer = layerB;
  let currentPlaylist = null;
  let currentSlideIndex = -1;
  let slideTimer = null;
  let pushTimer = null;
  let alertTimer = null;

  function init() {
    startClock();
    pollAgentState();
    setInterval(pollAgentState, 3000);
  }

  function startClock() {
    function update() {
      const now = new Date();
      hudClock.innerText = now.toLocaleTimeString('en-GB');
    }
    setInterval(update, 1000);
    update();
  }

  async function pollAgentState() {
    try {
      const res = await fetch('/api/agent/state').then(r => r.json());
      const isOnline = res.isOnline;
      statusIndicator.className = isOnline ? 'status-dot' : 'status-dot offline';

      if (res.pairingPIN) {
        showPairingScreen(res.pairingPIN, res.config);
        return;
      } else {
        hidePairingScreen();
      }

      if (res.currentPlaylist) {
        if (!currentPlaylist || currentPlaylist.id !== res.currentPlaylist.id || currentPlaylist.updated_at !== res.currentPlaylist.updated_at) {
          currentPlaylist = res.currentPlaylist;
          currentSlideIndex = 0;
          playCurrentSlide();
        }
      }
    } catch (e) {
      statusIndicator.className = 'status-dot offline';
    }
  }

  function showPairingScreen(pin, cfg) {
    pairingCodeDisplay.innerText = pin;
    if (cfg) {
      pairingDeviceName.innerText = cfg.name || 'Signage Display';
      pairingDeviceUuid.innerText = (cfg.uuid || '').substring(0, 8) + '...';
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
      activeLayer.innerHTML = '<div style="color:#64748b;font-size:1.5rem;font-weight:700;">No Playlist Assigned</div>';
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
      const div = document.createElement('div');
      div.className = 'html-container';
      div.innerHTML = item.html_content || item.content || '';
      layer.appendChild(div);
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
