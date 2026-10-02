import React, { useState, useEffect } from 'react';
import { PlaySquare, Plus, Trash2, Copy, Eye, ArrowUp, ArrowDown, Clock, Image as ImageIcon, Video, Globe, Code, Sparkles } from 'lucide-react';
import { api } from '../services/api';

export function PlaylistsView({
  playlists,
  mediaList,
  onRefresh,
  onPreviewPlaylist
}) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistTransition, setNewPlaylistTransition] = useState('fade');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState('');
  const [itemDuration, setItemDuration] = useState(10);
  const [itemTransition, setItemTransition] = useState('fade');

  // Load details of selected playlist
  useEffect(() => {
    if (playlists.length > 0 && !selectedPlaylistId) {
      setSelectedPlaylistId(playlists[0].id);
    }
  }, [playlists, selectedPlaylistId]);

  useEffect(() => {
    if (selectedPlaylistId) {
      loadPlaylistDetails(selectedPlaylistId);
    }
  }, [selectedPlaylistId]);

  const loadPlaylistDetails = async (id) => {
    try {
      const data = await api.getPlaylist(id);
      setSelectedPlaylist(data);
    } catch (err) {
      console.error('Failed to load playlist:', err);
    }
  };

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      const res = await api.createPlaylist({
        name: newPlaylistName,
        transitionEffect: newPlaylistTransition,
        loopEnabled: true
      });
      setIsCreating(false);
      setNewPlaylistName('');
      onRefresh && onRefresh();
      if (res.data && res.data.id) {
        setSelectedPlaylistId(res.data.id);
      }
    } catch (err) {
      alert('Failed to create playlist: ' + err.message);
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!selectedMediaId || !selectedPlaylistId) return;

    try {
      await api.addPlaylistItem(selectedPlaylistId, {
        mediaId: parseInt(selectedMediaId, 10),
        durationSeconds: parseInt(itemDuration, 10),
        transition: itemTransition
      });
      setIsAddingItem(false);
      setSelectedMediaId('');
      loadPlaylistDetails(selectedPlaylistId);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Failed to add item: ' + err.message);
    }
  };

  const handleRemoveItem = async (itemId) => {
    try {
      await api.deletePlaylistItem(selectedPlaylistId, itemId);
      loadPlaylistDetails(selectedPlaylistId);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Failed to remove item: ' + err.message);
    }
  };

  const handleMoveItem = async (index, direction) => {
    if (!selectedPlaylist || !selectedPlaylist.items) return;
    const items = [...selectedPlaylist.items];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const temp = items[index];
    items[index] = items[targetIndex];
    items[targetIndex] = temp;

    const itemIds = items.map((i) => i.id);
    try {
      await api.reorderPlaylistItems(selectedPlaylistId, itemIds);
      loadPlaylistDetails(selectedPlaylistId);
    } catch (err) {
      console.error('Reorder error:', err);
    }
  };

  const handleUpdateDuration = async (itemId, durationSeconds) => {
    try {
      await api.updatePlaylistItem(selectedPlaylistId, itemId, { durationSeconds: parseInt(durationSeconds, 10) });
      loadPlaylistDetails(selectedPlaylistId);
      onRefresh && onRefresh();
    } catch (err) {
      console.error('Update duration error:', err);
    }
  };

  const handleDeletePlaylist = async (id, name) => {
    if (!confirm(`Delete playlist '${name}'?`)) return;
    try {
      await api.deletePlaylist(id);
      setSelectedPlaylistId(null);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleDuplicatePlaylist = async (id) => {
    try {
      const res = await api.duplicatePlaylist(id);
      onRefresh && onRefresh();
      if (res.data) setSelectedPlaylistId(res.data.id);
    } catch (err) {
      alert('Duplicate failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Playlist Builder & Sequencer</h1>
          <p className="text-xs text-slate-400">Assemble content timelines with smooth GPU transitions</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-950 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Create Playlist
        </button>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Playlists Sidebar */}
        <div className="lg:col-span-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
            Playlists ({playlists.length})
          </div>

          <div className="space-y-2">
            {playlists.map((p) => {
              const isSelected = selectedPlaylistId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlaylistId(p.id)}
                  className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-slate-800/90 border-emerald-500/50 shadow-lg'
                      : 'glass-card hover:bg-slate-800/40 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className={`p-2 rounded-xl ${isSelected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                      <PlaySquare className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <h4 className="font-bold text-white text-sm truncate">{p.name}</h4>
                      <div className="text-[11px] text-slate-400">
                        {p.item_count || 0} items &bull; {p.total_duration_seconds || 0}s loop
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicatePlaylist(p.id);
                      }}
                      className="p-1.5 text-slate-400 hover:text-white"
                      title="Duplicate"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePlaylist(p.id, p.name);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Playlist Timeline Editor */}
        <div className="lg:col-span-8">
          {selectedPlaylist ? (
            <div className="glass-panel p-6 rounded-2xl space-y-6">
              {/* Header inside editor */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
                <div>
                  <h2 className="text-xl font-black text-white">{selectedPlaylist.name}</h2>
                  <p className="text-xs text-slate-400">
                    Default transition: <strong className="text-emerald-400">{selectedPlaylist.transition_effect || 'fade'}</strong> &bull; Loop enabled
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onPreviewPlaylist(selectedPlaylist)}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-sky-950"
                  >
                    <Eye className="w-4 h-4" /> Live Preview
                  </button>

                  <button
                    onClick={() => setIsAddingItem(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add Slide
                  </button>
                </div>
              </div>

              {/* Items Sequencer List */}
              {selectedPlaylist.items && selectedPlaylist.items.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <PlaySquare className="w-12 h-12 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium text-slate-400">Playlist is empty</p>
                  <p className="text-xs text-slate-500 mt-1">Add media slides to build the sequence.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedPlaylist.items.map((item, index) => (
                    <div
                      key={item.id}
                      className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between gap-4 hover:border-slate-700 transition"
                    >
                      {/* Order & Icon */}
                      <div className="flex items-center gap-3">
                        <div className="font-mono text-xs font-bold text-slate-500 w-5 text-center">
                          {index + 1}
                        </div>

                        <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 overflow-hidden">
                          {item.media_type === 'image' && <ImageIcon className="w-5 h-5 text-emerald-400" />}
                          {item.media_type === 'video' && <Video className="w-5 h-5 text-sky-400" />}
                          {item.media_type === 'webpage' && <Globe className="w-5 h-5 text-amber-400" />}
                          {item.media_type === 'html_snippet' && <Code className="w-5 h-5 text-purple-400" />}
                        </div>

                        <div>
                          <div className="font-bold text-white text-sm">{item.original_name || 'Webpage Slide'}</div>
                          <div className="text-[11px] text-slate-400">
                            Type: <strong className="text-slate-300 uppercase">{item.media_type}</strong> &bull; Transition: {item.transition || 'fade'}
                          </div>
                        </div>
                      </div>

                      {/* Duration & Actions */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="number"
                            min="2"
                            max="3600"
                            value={item.duration_seconds}
                            onChange={(e) => handleUpdateDuration(item.id, e.target.value)}
                            className="w-12 bg-transparent text-xs font-mono text-white text-center focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-500">sec</span>
                        </div>

                        {/* Reorder Up/Down */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleMoveItem(index, -1)}
                            disabled={index === 0}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleMoveItem(index, 1)}
                            disabled={index === selectedPlaylist.items.length - 1}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>

                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel p-12 rounded-2xl text-center text-slate-500">
              Select or create a playlist to configure its timeline.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Playlist */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Create New Playlist</h3>
            <form onSubmit={handleCreatePlaylist} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Playlist Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lobby Morning Loop"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Default Transition Animation
                </label>
                <select
                  value={newPlaylistTransition}
                  onChange={(e) => setNewPlaylistTransition(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="fade">Cross Fade (Default)</option>
                  <option value="slide-left">Slide Left</option>
                  <option value="zoom">Zoom Scale</option>
                  <option value="none">Instant Cut</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm transition"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Item to Playlist */}
      {isAddingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Add Media Slide to Playlist</h3>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Select Media Asset
                </label>
                <select
                  value={selectedMediaId}
                  onChange={(e) => setSelectedMediaId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Choose from Media Library ({mediaList.length} items) --</option>
                  {mediaList.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.media_type.toUpperCase()}] {m.original_name} ({m.duration_seconds}s)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Duration (Seconds)
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="600"
                    value={itemDuration}
                    onChange={(e) => setItemDuration(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Transition Effect
                  </label>
                  <select
                    value={itemTransition}
                    onChange={(e) => setItemTransition(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                  >
                    <option value="fade">Cross Fade</option>
                    <option value="slide-left">Slide Left</option>
                    <option value="zoom">Zoom Scale</option>
                    <option value="none">Instant</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddingItem(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedMediaId}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm transition disabled:opacity-50"
                >
                  Add Slide
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
