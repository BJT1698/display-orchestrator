import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { PageHeader, EmptyState, Modal } from '../components/ui';

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
      alert('Could not save the rule: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this rule?')) return;
    try {
      await api.deleteSchedule(id);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Schedules"
        description="Switch playlists automatically by time of day and day of the week. When rules overlap, the higher priority wins."
      >
        <button onClick={() => setIsCreating(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" /> New rule
        </button>
      </PageHeader>

      {schedules.length === 0 ? (
        <EmptyState
          title="No rules yet"
          action={<button onClick={() => setIsCreating(true)} className="btn btn-primary">New rule</button>}
        >
          Without rules, each screen plays the playlist assigned to it, or its group default.
        </EmptyState>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="data-table min-w-[820px]">
            <thead>
              <tr>
                <th>Playlist</th>
                <th>Plays on</th>
                <th>Time</th>
                <th>Days</th>
                <th className="text-right">Priority</th>
                <th className="w-12"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((rule) => {
                const days = rule.days_of_week && rule.days_of_week.length ? rule.days_of_week : [1, 2, 3, 4, 5, 6, 7];
                return (
                  <tr key={rule.id}>
                    <td className="font-medium text-ink">{rule.playlist_name || `Playlist ${rule.playlist_id}`}</td>
                    <td>
                      <div className={rule.target_name ? 'text-ink' : 'text-faint'}>{rule.target_name || (rule.target_type === 'group' ? 'Deleted group' : 'Removed screen')}</div>
                      <div className="text-xs text-faint">{rule.target_type === 'group' ? 'Group' : 'Single screen'}</div>
                    </td>
                    <td className="whitespace-nowrap text-ink">{rule.start_time} to {rule.end_time}</td>
                    <td>
                      <div className="flex gap-0.5" aria-label={days.map((d) => dayNames[d - 1]).join(', ')}>
                        {dayNames.map((name, idx) => {
                          const on = days.includes(idx + 1);
                          return (
                            <span
                              key={name}
                              className={`w-7 h-6 inline-flex items-center justify-center rounded-sm text-xs ${
                                on ? 'bg-ink text-ground font-semibold' : 'bg-ground text-faint border border-line'
                              }`}
                            >
                              {name.charAt(0)}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="text-right text-ink">{rule.priority}</td>
                    <td className="text-right">
                      <button onClick={() => handleDelete(rule.id)} className="btn-icon is-danger" title="Delete rule" aria-label="Delete rule">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isCreating && (
        <Modal
          title="New schedule rule"
          onClose={() => setIsCreating(false)}
          footer={
            <>
              <button type="button" onClick={() => setIsCreating(false)} className="btn btn-quiet">Cancel</button>
              <button type="submit" form="create-schedule" disabled={!targetId || !playlistId || daysOfWeek.length === 0} className="btn btn-primary">
                Save rule
              </button>
            </>
          }
        >
          <form id="create-schedule" onSubmit={handleCreateSchedule} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="sc-playlist">Playlist</label>
              <select id="sc-playlist" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)} required className="control">
                <option value="">Choose a playlist</option>
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <span className="field-label">Plays on</span>
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <div className="segmented" role="group" aria-label="Target type">
                  <button type="button" aria-pressed={targetType === 'group'} onClick={() => { setTargetType('group'); setTargetId(''); }}>
                    Group
                  </button>
                  <button type="button" aria-pressed={targetType === 'display'} onClick={() => { setTargetType('display'); setTargetId(''); }}>
                    Screen
                  </button>
                </div>
                <select value={targetId} onChange={(e) => setTargetId(e.target.value)} required className="control" aria-label={targetType === 'group' ? 'Group' : 'Screen'}>
                  <option value="">{targetType === 'group' ? 'Choose a group' : 'Choose a screen'}</option>
                  {targetType === 'group'
                    ? groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)
                    : displays.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="field-label" htmlFor="sc-start">From</label>
                <input id="sc-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className="control" />
              </div>
              <div>
                <label className="field-label" htmlFor="sc-end">To</label>
                <input id="sc-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required className="control" />
              </div>
              <div>
                <label className="field-label" htmlFor="sc-priority">Priority</label>
                <input id="sc-priority" type="number" min="1" max="100" value={priority} onChange={(e) => setPriority(e.target.value)} className="control" />
              </div>
            </div>

            <div>
              <span className="field-label">Days</span>
              <div className="grid grid-cols-7 gap-1" role="group" aria-label="Days">
                {dayNames.map((name, idx) => {
                  const dayNum = idx + 1;
                  const isSelected = daysOfWeek.includes(dayNum);
                  return (
                    <button
                      key={dayNum}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleDay(dayNum)}
                      className={`h-9 rounded text-sm border transition-colors ${
                        isSelected ? 'bg-ink border-ink text-ground font-semibold' : 'bg-ground border-line text-muted hover:text-ink hover:border-line-strong'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
