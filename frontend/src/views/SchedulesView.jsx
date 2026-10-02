import React, { useState } from 'react';
import { Calendar, Plus, Trash2, Clock, CheckCircle2, X } from 'lucide-react';
import { api } from '../services/api';

export function SchedulesView({
  schedules,
  playlists,
  displays,
  groups,
  onRefresh
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [targetType, setTargetType] = useState('group'); // 'group' or 'display'
  const [targetId, setTargetId] = useState('');
  const [playlistId, setPlaylistId] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('18:00');
  const [priority, setPriority] = useState(1);
  const [daysOfWeek, setDaysOfWeek] = useState([1, 2, 3, 4, 5]); // Mon-Fri default

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const toggleDay = (dayNum) => {
    if (daysOfWeek.includes(dayNum)) {
      setDaysOfWeek(daysOfWeek.filter((d) => d !== dayNum));
    } else {
      setDaysOfWeek([...daysOfWeek, dayNum].sort());
    }
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    if (!targetId || !playlistId) return;

    try {
      await api.createSchedule({
        targetType,
        targetId: parseInt(targetId, 10),
        playlistId: parseInt(playlistId, 10),
        startTime,
        endTime,
        daysOfWeek,
        priority: parseInt(priority, 10),
        isActive: 1
      });

      setIsCreating(false);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Failed to create schedule: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this scheduling rule?')) return;
    try {
      await api.deleteSchedule(id);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Content Scheduling</h1>
          <p className="text-xs text-slate-400">Automate playlist switching based on time of day and week days</p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-950 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Schedule Rule
        </button>
      </div>

      {/* Rules List */}
      {schedules.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl text-center">
          <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">No schedules configured</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            Screens currently play their directly assigned or group default playlist.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition"
          >
            Create Rule
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((rule) => (
            <div
              key={rule.id}
              className="glass-card p-4 rounded-xl border border-slate-800 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">
                      {rule.playlist_name || `Playlist #${rule.playlist_id}`}
                    </span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400">
                      Target: {rule.target_name} ({rule.target_type})
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                    <span>🕒 {rule.start_time} - {rule.end_time}</span>
                    <span>&bull;</span>
                    <span>Days: {rule.days_of_week ? rule.days_of_week.map((d) => dayNames[d - 1]).join(', ') : 'All'}</span>
                    <span>&bull;</span>
                    <span>Priority: {rule.priority}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDelete(rule.id)}
                className="p-2 text-slate-500 hover:text-red-400 transition"
                title="Delete rule"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create Schedule */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button onClick={() => setIsCreating(false)} className="absolute top-5 right-5 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-4">New Time Schedule Rule</h3>

            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Target Type
                  </label>
                  <select
                    value={targetType}
                    onChange={(e) => {
                      setTargetType(e.target.value);
                      setTargetId('');
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="group">Display Group</option>
                    <option value="display">Single Display</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Target Destination
                  </label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">-- Choose Target --</option>
                    {targetType === 'group'
                      ? groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)
                      : displays.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Playlist to Play
                </label>
                <select
                  value={playlistId}
                  onChange={(e) => setPlaylistId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="">-- Choose Playlist --</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.item_count || 0} items)</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Active Days
                </label>
                <div className="flex gap-1.5">
                  {dayNames.map((name, idx) => {
                    const dayNum = idx + 1;
                    const isSelected = daysOfWeek.includes(dayNum);
                    return (
                      <button
                        key={dayNum}
                        type="button"
                        onClick={() => toggleDay(dayNum)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
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
                  disabled={!targetId || !playlistId}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm transition"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
