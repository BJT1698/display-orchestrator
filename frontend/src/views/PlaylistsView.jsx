import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Play, ArrowUp, ArrowDown, X } from 'lucide-react';
import { api } from '../services/api';
import { PageHeader, EmptyState, Modal, MediaTypeIcon, mediaTypeLabel, formatDuration } from '../components/ui';

const TRANSITIONS = {
  fade: 'Cross fade',
  'slide-left': 'Slide left',
  zoom: 'Zoom',
  none: 'Cut',
};

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
    if (!confirm(`Delete the playlist '${name}'? Screens using it will fall back to their group default.`)) return;
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

  const items = selectedPlaylist?.items || [];
  const totalSeconds = items.reduce((sum, i) => sum + (Number(i.duration_seconds) || 0), 0);

  return (
    <div>
      <PageHeader title="Playlists" description="Build the sequence each screen loops through.">
        <button onClick={() => setIsCreating(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" /> New playlist
        </button>
      </PageHeader>

      {playlists.length === 0 ? (
        <EmptyState
          title="No playlists yet"
          action={<button onClick={() => setIsCreating(true)} className="btn btn-primary">New playlist</button>}
        >
          A playlist is an ordered list of media that plays on a loop. Create one, then assign it to screens or groups.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6 items-start">
          <nav className="panel overflow-hidden" aria-label="Playlists">
            <ul className="divide-y divide-line">
              {playlists.map((p) => {
                const isSelected = selectedPlaylistId === p.id;
                return (
                  <li key={p.id} className={`group relative flex items-center ${isSelected ? 'bg-raised' : 'hover:bg-[#22252A]'}`}>
                    {isSelected && <span className="absolute left-0 inset-y-0 w-0.5 bg-ink" aria-hidden="true" />}
                    <button
                      onClick={() => setSelectedPlaylistId(p.id)}
                      aria-current={isSelected ? 'true' : undefined}
                      className="flex-1 min-w-0 text-left px-4 py-3"
                    >
                      <div className={`text-sm truncate ${isSelected ? 'font-medium text-ink' : 'text-ink'}`}>{p.name}</div>
                      <div className="text-xs text-faint mt-0.5">
                        {p.item_count || 0} {p.item_count === 1 ? 'item' : 'items'}, {formatDuration(p.total_duration_seconds)} loop
                      </div>
                    </button>
                    <div className="flex items-center pr-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                      <button onClick={() => handleDuplicatePlaylist(p.id)} className="btn-icon" title="Duplicate" aria-label={`Duplicate ${p.name}`}>
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeletePlaylist(p.id, p.name)} className="btn-icon is-danger" title="Delete" aria-label={`Delete ${p.name}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </nav>

          {selectedPlaylist ? (
            <section className="panel min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 border-b border-line">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-ink truncate">{selectedPlaylist.name}</h2>
                  <p className="text-sm text-muted mt-0.5">
                    {items.length} {items.length === 1 ? 'item' : 'items'}, loops every {formatDuration(totalSeconds)}. Default transition: {TRANSITIONS[selectedPlaylist.transition_effect] || 'Cross fade'}.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => onPreviewPlaylist(selectedPlaylist)} disabled={items.length === 0} className="btn">
                    <Play className="w-4 h-4" /> Preview
                  </button>
                  <button onClick={() => setIsAddingItem(true)} className="btn btn-primary">
                    <Plus className="w-4 h-4" /> Add item
                  </button>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <p className="text-sm text-ink">This playlist is empty.</p>
                  <p className="text-sm text-muted mt-1">Add items from the media library to start the sequence.</p>
                </div>
              ) : (
                <>
                  {/* Timeline: each segment is as wide as its share of the loop */}
                  <div className="px-5 pt-5 pb-4">
                    <div className="flex h-10 rounded-sm overflow-hidden bg-ground border border-line" role="img" aria-label="Loop timeline">
                      {items.map((item, index) => (
                        <div
                          key={item.id}
                          className="relative flex items-center px-2 min-w-[1.75rem] border-r border-line last:border-r-0 bg-raised text-xs text-muted overflow-hidden"
                          style={{ flexGrow: Number(item.duration_seconds) || 1, flexBasis: 0 }}
                          title={`${index + 1}. ${item.original_name || 'Item'}, ${item.duration_seconds}s`}
                        >
                          <span className="font-semibold text-ink mr-1.5">{index + 1}</span>
                          <span className="truncate">{item.original_name}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-1.5 text-xs text-faint">
                      <span>0s</span>
                      <span>{formatDuration(totalSeconds)}</span>
                    </div>
                  </div>

                  <ol className="border-t border-line divide-y divide-line">
                    {items.map((item, index) => (
                      <li key={item.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-5 py-2.5">
                        <span className="display text-lg font-semibold text-faint text-right">{index + 1}</span>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-14 aspect-video shrink-0 rounded-sm bg-black border border-line overflow-hidden flex items-center justify-center text-faint">
                            {item.media_type === 'image' && item.url ? (
                              <img src={item.url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <MediaTypeIcon type={item.media_type} className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm text-ink truncate">{item.original_name || 'Web page'}</div>
                            <div className="text-xs text-faint">
                              {mediaTypeLabel(item.media_type)}, {TRANSITIONS[item.transition] || 'Cross fade'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <label className="flex items-center gap-1.5 mr-2">
                            <input
                              key={`${item.id}-${item.duration_seconds}`}
                              type="number"
                              min="2"
                              max="3600"
                              defaultValue={item.duration_seconds}
                              onBlur={(e) => {
                                if (String(e.target.value) !== String(item.duration_seconds)) handleUpdateDuration(item.id, e.target.value);
                              }}
                              className="control h-8 w-20 text-right"
                              aria-label={`Duration of item ${index + 1} in seconds`}
                            />
                            <span className="text-xs text-faint">s</span>
                          </label>
                          <button onClick={() => handleMoveItem(index, -1)} disabled={index === 0} className="btn-icon" aria-label="Move up">
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleMoveItem(index, 1)} disabled={index === items.length - 1} className="btn-icon" aria-label="Move down">
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleRemoveItem(item.id)} className="btn-icon is-danger" aria-label="Remove from playlist" title="Remove from playlist">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>
          ) : (
            <div className="panel px-6 py-14 text-center text-sm text-muted">Select a playlist to edit it.</div>
          )}
        </div>
      )}

      {isCreating && (
        <Modal
          title="New playlist"
          onClose={() => setIsCreating(false)}
          width="max-w-md"
          footer={
            <>
              <button type="button" onClick={() => setIsCreating(false)} className="btn btn-quiet">Cancel</button>
              <button type="submit" form="create-playlist" className="btn btn-primary">Create playlist</button>
            </>
          }
        >
          <form id="create-playlist" onSubmit={handleCreatePlaylist} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="pl-name">Name</label>
              <input
                id="pl-name"
                type="text"
                placeholder="Reception, morning"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                required
                autoFocus
                className="control"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="pl-transition">Default transition</label>
              <select id="pl-transition" value={newPlaylistTransition} onChange={(e) => setNewPlaylistTransition(e.target.value)} className="control">
                {Object.entries(TRANSITIONS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </form>
        </Modal>
      )}

      {isAddingItem && (
        <Modal
          title="Add to playlist"
          description={selectedPlaylist?.name}
          onClose={() => setIsAddingItem(false)}
          footer={
            <>
              <button type="button" onClick={() => setIsAddingItem(false)} className="btn btn-quiet">Cancel</button>
              <button type="submit" form="add-item" disabled={!selectedMediaId} className="btn btn-primary">Add item</button>
            </>
          }
        >
          <form id="add-item" onSubmit={handleAddItem} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="item-media">Media</label>
              <select id="item-media" value={selectedMediaId} onChange={(e) => setSelectedMediaId(e.target.value)} required className="control">
                <option value="">Choose from the library</option>
                {mediaList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.original_name} ({mediaTypeLabel(m.media_type)})
                  </option>
                ))}
              </select>
              {mediaList.length === 0 && <p className="field-hint">The media library is empty. Add media first.</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label" htmlFor="item-duration">Duration in seconds</label>
                <input id="item-duration" type="number" min="2" max="600" value={itemDuration} onChange={(e) => setItemDuration(e.target.value)} className="control" />
              </div>
              <div>
                <label className="field-label" htmlFor="item-transition">Transition</label>
                <select id="item-transition" value={itemTransition} onChange={(e) => setItemTransition(e.target.value)} className="control">
                  {Object.entries(TRANSITIONS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
