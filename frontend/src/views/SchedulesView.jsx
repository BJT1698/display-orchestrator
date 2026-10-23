import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Moon, TimerReset } from 'lucide-react';
import { api, afterHoursApi, dailyRebootApi } from '../services/api';
import { PageHeader, EmptyState, Modal, ErrorNote, Tally } from '../components/ui';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// "Mon–Fri", "Mon, Wed, Fri", "every day"
function describeDays(days) {
  if (days.length === 7) return 'every day';
  if (days.length === 0) return 'no day';
  const sorted = [...days].sort();
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) return `${DAY_NAMES[sorted[0] - 1]}–${DAY_NAMES[sorted[sorted.length - 1] - 1]}`;
  return sorted.map((d) => DAY_NAMES[d - 1]).join(', ');
}

// Same rule as the server: working days, from start (included) to end (excluded)
function isAfterHoursNow(cfg, now = new Date()) {
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const hhmm = now.toTimeString().substring(0, 5);
  return !cfg.days.includes(day) || hhmm < cfg.start || hhmm >= cfg.end;
}

function DayPicker({ value, onChange, disabled }) {
  const toggle = (day) => onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort());
  return (
    <div className="grid grid-cols-7 gap-1" role="group" aria-label="Days">
      {DAY_NAMES.map((name, idx) => {
        const dayNum = idx + 1;
        const isSelected = value.includes(dayNum);
        return (
          <button
            key={dayNum}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            onClick={() => toggle(dayNum)}
            className={`h-9 rounded text-sm border transition-colors disabled:opacity-50 ${
              isSelected ? 'bg-ink border-ink text-ground font-semibold' : 'bg-ground border-line text-muted enabled:hover:text-ink enabled:hover:border-line-strong'
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

// Scheduled restart: every display reboots at a set time, a fresh start against slow drifts
function DailyRebootPanel() {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dailyRebootApi.get().then((cfg) => { setSaved(cfg); setDraft(cfg); }).catch((err) => setError(err.message));
  }, []);

  if (!draft) return error ? <div className="mb-8"><ErrorNote>{error}</ErrorNote></div> : null;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async (next = draft) => {
    setBusy(true);
    setError('');
    try {
      const cfg = await dailyRebootApi.save(next);
      setSaved(cfg);
      setDraft(cfg);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setEnabled = (enabled) => {
    const next = { ...draft, enabled };
    setDraft(next);
    save(next);
  };

  return (
    <section className="panel mb-8" aria-labelledby="daily-reboot-heading">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4 pb-4 border-b border-line">
        <div className="flex items-start gap-3 min-w-0">
          <TimerReset className="w-4 h-4 mt-1 text-muted shrink-0" />
          <div className="min-w-0">
            <h2 id="daily-reboot-heading" className="text-base font-semibold text-ink">Scheduled restart</h2>
            <p className="mt-0.5 text-sm text-muted">
              {saved.enabled
                ? <>Every display reboots at <span className="text-ink">{saved.time}</span> on {describeDays(saved.days)}. It takes about a minute; pick a time nobody is looking.</>
                : 'Reboot every display at a set time, a fresh start each day. Frozen screens are restarted on their own anyway.'}
            </p>
          </div>
        </div>
        <div className="segmented shrink-0" role="group" aria-label="Scheduled restart">
          <button type="button" aria-pressed={!draft.enabled} disabled={busy} onClick={() => setEnabled(false)}>Off</button>
          <button type="button" aria-pressed={draft.enabled} disabled={busy} onClick={() => setEnabled(true)}>On</button>
        </div>
      </div>
      <form
        className="px-5 py-4 grid gap-5 lg:grid-cols-[auto_minmax(12rem,16rem)] lg:items-end"
        onSubmit={(e) => { e.preventDefault(); save(); }}
      >
        <div>
          <span className="field-label">Days</span>
          <DayPicker value={draft.days} onChange={(days) => set({ days })} />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <label className="field-label" htmlFor="dr-time">At</label>
            <input id="dr-time" type="time" className="control" value={draft.time} onChange={(e) => set({ time: e.target.value })} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={!dirty || busy}>{busy ? 'Saving' : 'Save'}</button>
        </div>
        {error && <div className="lg:col-span-2"><ErrorNote>{error}</ErrorNote></div>}
      </form>
    </section>
  );
}

// Night and weekend mode: outside working hours every screen plays one playlist, above all rules
function AfterHoursPanel({ playlists }) {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setClock] = useState(0);

  useEffect(() => {
    afterHoursApi.get().then((cfg) => { setSaved(cfg); setDraft(cfg); }).catch((err) => setError(err.message));
    const timer = setInterval(() => setClock((n) => n + 1), 30000); // keeps "active now" honest
    return () => clearInterval(timer);
  }, []);

  if (!draft) {
    return error ? <div className="mb-8"><ErrorNote>{error}</ErrorNote></div> : null;
  }

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const playlistName = playlists.find((p) => p.id === Number(saved.playlistId))?.name;
  const activeNow = saved.enabled && playlistName && isAfterHoursNow(saved);

  const save = async (next = draft) => {
    setBusy(true);
    setError('');
    try {
      const cfg = await afterHoursApi.save({ ...next, playlistId: next.playlistId ? Number(next.playlistId) : null });
      setSaved(cfg);
      setDraft(cfg);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Switching on with everything filled in saves at once; otherwise the form asks for the rest
  const setEnabled = (enabled) => {
    const next = { ...draft, enabled };
    setDraft(next);
    if (!enabled || next.playlistId) save(next);
  };

  return (
    <section className="panel mb-8" aria-labelledby="after-hours-heading">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4 pb-4 border-b border-line">
        <div className="flex items-start gap-3 min-w-0">
          <Moon className="w-4 h-4 mt-1 text-muted shrink-0" />
          <div className="min-w-0">
            <h2 id="after-hours-heading" className="text-base font-semibold text-ink">Night and weekend mode</h2>
            <p className="mt-0.5 text-sm text-muted">
              {saved.enabled && playlistName
                ? <>Outside {describeDays(saved.days)} {saved.start}–{saved.end}, every screen plays <span className="text-ink">{playlistName}</span>. It wins over the rules below; a pushed page, a shared screen or an emergency message still go on top.</>
                : 'Show one playlist on every screen outside working hours, for example the night clock.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {saved.enabled && playlistName && (
            <span className="flex items-center gap-2 text-sm text-muted">
              <Tally status={activeNow ? 'online' : 'offline'} />
              {activeNow ? 'Active now' : 'Waiting for closing time'}
            </span>
          )}
          <div className="segmented" role="group" aria-label="Night and weekend mode">
            <button type="button" aria-pressed={!draft.enabled} disabled={busy} onClick={() => setEnabled(false)}>Off</button>
            <button type="button" aria-pressed={draft.enabled} disabled={busy} onClick={() => setEnabled(true)}>On</button>
          </div>
        </div>
      </div>

      <form
        className="px-5 py-4 grid gap-5 lg:grid-cols-[minmax(12rem,16rem)_auto_minmax(14rem,20rem)] lg:items-end"
        onSubmit={(e) => { e.preventDefault(); save(); }}
      >
        <div>
          <label className="field-label" htmlFor="ah-playlist">Playlist after hours</label>
          <select id="ah-playlist" className="control" value={draft.playlistId || ''} onChange={(e) => set({ playlistId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Choose a playlist</option>
            {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <span className="field-label">Working days</span>
          <DayPicker value={draft.days} onChange={(days) => set({ days })} />
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div>
            <label className="field-label" htmlFor="ah-start">Opens</label>
            <input id="ah-start" type="time" className="control" value={draft.start} onChange={(e) => set({ start: e.target.value })} required />
          </div>
          <div>
            <label className="field-label" htmlFor="ah-end">Closes</label>
            <input id="ah-end" type="time" className="control" value={draft.end} onChange={(e) => set({ end: e.target.value })} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={!dirty || busy || (draft.enabled && !draft.playlistId)}>
            {busy ? 'Saving' : 'Save'}
          </button>
        </div>
        {error && <div className="lg:col-span-3"><ErrorNote>{error}</ErrorNote></div>}
      </form>
    </section>
  );
}

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

  const dayNames = DAY_NAMES;

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

      <AfterHoursPanel playlists={playlists} />
      <DailyRebootPanel />

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
              <DayPicker value={daysOfWeek} onChange={setDaysOfWeek} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
