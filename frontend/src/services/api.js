const API_BASE = '/api';

// Every API call goes through here: a 401 means the session is gone (the app shows the sign-in
// screen), a 403 means the role does not allow it and surfaces the server's explanation
async function apiFetch(url, options) {
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  if (res.status === 401 && !url.startsWith(`${API_BASE}/auth/`)) {
    window.dispatchEvent(new Event('auth:required'));
  }
  if (res.status === 403) {
    const body = await res.clone().json().catch(() => ({}));
    throw new Error(body.error || 'You do not have permission to do this.');
  }
  return res;
}

async function jsonCall(url, method = 'GET', payload) {
  const res = await apiFetch(url, {
    method,
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body.data;
}

export const auth = {
  me: () => jsonCall(`${API_BASE}/auth/me`),
  login: (username, password) => jsonCall(`${API_BASE}/auth/login`, 'POST', { username, password }),
  setup: (code, username, password) => jsonCall(`${API_BASE}/auth/setup`, 'POST', { code, username, password }),
  logout: () => jsonCall(`${API_BASE}/auth/logout`, 'POST', {}),
  changePassword: (currentPassword, newPassword) =>
    jsonCall(`${API_BASE}/auth/password`, 'POST', { currentPassword, newPassword }),
};

export const usersApi = {
  list: () => jsonCall(`${API_BASE}/users`),
  create: (payload) => jsonCall(`${API_BASE}/users`, 'POST', payload),
  update: (id, payload) => jsonCall(`${API_BASE}/users/${id}`, 'PUT', payload),
  remove: (id) => jsonCall(`${API_BASE}/users/${id}`, 'DELETE'),
};

export const updatesApi = {
  latestRelease: () => jsonCall(`${API_BASE}/system/release`),
  updateDisplay: (id, version) => jsonCall(`${API_BASE}/displays/${id}/update`, 'POST', { version }),
};

export const api = {
  // Displays
  async getDisplays() {
    const res = await apiFetch(`${API_BASE}/displays`);
    return (await res.json()).data;
  },

  async getDisplay(id) {
    const res = await apiFetch(`${API_BASE}/displays/${id}`);
    return (await res.json()).data;
  },

  async updateDisplay(id, payload) {
    const res = await apiFetch(`${API_BASE}/displays/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async deleteDisplay(id) {
    const res = await apiFetch(`${API_BASE}/displays/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  async sendCommand(id, action, payload = {}) {
    const res = await apiFetch(`${API_BASE}/displays/${id}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    return await res.json();
  },

  // Pairing
  async getPendingPairings() {
    const res = await apiFetch(`${API_BASE}/displays/pairing/pending`);
    return (await res.json()).data;
  },

  async approvePairing(pairingCode, name, groupId) {
    const res = await apiFetch(`${API_BASE}/displays/pairing/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode, name, groupId })
    });
    return await res.json();
  },

  async rejectPairing(pairingCode) {
    const res = await apiFetch(`${API_BASE}/displays/pairing/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode })
    });
    return await res.json();
  },

  async broadcastEmergency(message, title, durationSeconds) {
    const res = await apiFetch(`${API_BASE}/displays/broadcast/emergency`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, title, durationSeconds })
    });
    return await res.json();
  },

  // Media
  async getMedia() {
    const res = await apiFetch(`${API_BASE}/media`);
    return (await res.json()).data;
  },

  async uploadMediaFile(file, durationSeconds = 10) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('durationSeconds', durationSeconds);

    const res = await apiFetch(`${API_BASE}/media/upload`, {
      method: 'POST',
      body: formData
    });
    return await res.json();
  },

  async createUrlMedia(name, url, durationSeconds = 15) {
    const res = await apiFetch(`${API_BASE}/media/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, durationSeconds })
    });
    return await res.json();
  },

  async createHtmlMedia(name, content, durationSeconds = 10) {
    const res = await apiFetch(`${API_BASE}/media/html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content, durationSeconds })
    });
    return await res.json();
  },

  async deleteMedia(id) {
    const res = await apiFetch(`${API_BASE}/media/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  async getStorageStats() {
    const res = await apiFetch(`${API_BASE}/media/stats/storage`);
    return (await res.json()).data;
  },

  // Playlists
  async getPlaylists() {
    const res = await apiFetch(`${API_BASE}/playlists`);
    return (await res.json()).data;
  },

  async getPlaylist(id) {
    const res = await apiFetch(`${API_BASE}/playlists/${id}`);
    return (await res.json()).data;
  },

  async createPlaylist(payload) {
    const res = await apiFetch(`${API_BASE}/playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async updatePlaylist(id, payload) {
    const res = await apiFetch(`${API_BASE}/playlists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async deletePlaylist(id) {
    const res = await apiFetch(`${API_BASE}/playlists/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  async addPlaylistItem(playlistId, payload) {
    const res = await apiFetch(`${API_BASE}/playlists/${playlistId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async updatePlaylistItem(playlistId, itemId, payload) {
    const res = await apiFetch(`${API_BASE}/playlists/${playlistId}/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async deletePlaylistItem(playlistId, itemId) {
    const res = await apiFetch(`${API_BASE}/playlists/${playlistId}/items/${itemId}`, {
      method: 'DELETE'
    });
    return await res.json();
  },

  async reorderPlaylistItems(playlistId, itemIds) {
    const res = await apiFetch(`${API_BASE}/playlists/${playlistId}/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds })
    });
    return await res.json();
  },

  async duplicatePlaylist(id) {
    const res = await apiFetch(`${API_BASE}/playlists/${id}/duplicate`, { method: 'POST' });
    return await res.json();
  },

  // Schedules
  async getSchedules() {
    const res = await apiFetch(`${API_BASE}/schedules`);
    return (await res.json()).data;
  },

  async createSchedule(payload) {
    const res = await apiFetch(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async updateSchedule(id, payload) {
    const res = await apiFetch(`${API_BASE}/schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async deleteSchedule(id) {
    const res = await apiFetch(`${API_BASE}/schedules/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  // Groups
  async getGroups() {
    const res = await apiFetch(`${API_BASE}/system/groups`);
    return (await res.json()).data;
  },

  async createGroup(payload) {
    const res = await apiFetch(`${API_BASE}/system/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async updateGroup(id, payload) {
    const res = await apiFetch(`${API_BASE}/system/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async deleteGroup(id) {
    const res = await apiFetch(`${API_BASE}/system/groups/${id}`, { method: 'DELETE' });
    return await res.json();
  },

  // System & Logs
  async getSystemStatus() {
    const res = await apiFetch(`${API_BASE}/system/status`);
    return (await res.json()).data;
  },

  async getLogs(limit = 100, level = null) {
    let url = `${API_BASE}/system/logs?limit=${limit}`;
    if (level) url += `&level=${level}`;
    const res = await apiFetch(url);
    return (await res.json()).data;
  },

  async clearLogs() {
    const res = await apiFetch(`${API_BASE}/system/logs`, { method: 'DELETE' });
    return await res.json();
  }
};
