import { db } from '../db/database.js';
import { settingsService } from './settingsService.js';

// Working hours: listed days, from start (included) to end (excluded). Everything else is after hours.
function isOutsideWorkingHours(cfg, day, hhmm) {
  if (!cfg.days.includes(day)) return true;
  return !(hhmm >= cfg.start && hhmm < cfg.end);
}

export const schedulerService = {
  /**
   * Resolves the active playlist object and its full list of items for a given display
   */
  /**
   * Which playlist a display should play right now, and why:
   * after-hours mode > time schedules > direct assignment > group default > first playlist
   */
  resolvePlaylistChoice(display, now = new Date()) {
    const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // 1 = Monday, 7 = Sunday
    const currentHourMin = now.toTimeString().substring(0, 5); // "HH:MM"
    const exists = (id) => id && db.getOne('SELECT id FROM playlists WHERE id = ?', id);

    // 0. Night and weekend mode covers every screen outside working hours
    const afterHours = settingsService.getAfterHours();
    if (afterHours.enabled && exists(afterHours.playlistId) && isOutsideWorkingHours(afterHours, currentDay, currentHourMin)) {
      return { playlistId: afterHours.playlistId, reason: 'after-hours' };
    }

    // 1. Time-based / day-of-week schedules
    const schedules = db.all(`
      SELECT s.* FROM schedules s
      WHERE s.is_active = 1
        AND (
          (s.target_type = 'display' AND s.target_id = ?)
          OR
          (s.target_type = 'group' AND s.target_id = ?)
        )
      ORDER BY s.priority DESC, s.id DESC
    `, display.id, display.group_id || -1);

    for (const schedule of schedules) {
      let days = [1, 2, 3, 4, 5, 6, 7];
      try {
        if (schedule.days_of_week) days = JSON.parse(schedule.days_of_week);
      } catch (e) {
        // ignore malformed json
      }
      if (!days.includes(currentDay)) continue;
      const inRange = schedule.start_time <= schedule.end_time
        ? currentHourMin >= schedule.start_time && currentHourMin <= schedule.end_time // e.g. 08:00 to 18:00
        : currentHourMin >= schedule.start_time || currentHourMin <= schedule.end_time; // overnight, e.g. 22:00 to 06:00
      if (inRange && exists(schedule.playlist_id)) {
        return { playlistId: schedule.playlist_id, reason: 'schedule' };
      }
    }

    // 2. Direct display assignment
    if (exists(display.current_playlist_id)) {
      return { playlistId: display.current_playlist_id, reason: 'assigned' };
    }

    // 3. Group default playlist
    if (display.group_id) {
      const group = db.getOne('SELECT default_playlist_id FROM display_groups WHERE id = ?', display.group_id);
      if (group && exists(group.default_playlist_id)) {
        return { playlistId: group.default_playlist_id, reason: 'group' };
      }
    }

    // 4. First available playlist
    const first = db.getOne('SELECT id FROM playlists ORDER BY id ASC LIMIT 1');
    return first ? { playlistId: first.id, reason: 'fallback' } : { playlistId: null, reason: 'none' };
  },

  resolveDisplayPlaylist(displayUuid) {
    const display = db.getOne('SELECT * FROM displays WHERE uuid = ?', displayUuid);
    if (!display) return null;
    const { playlistId } = this.resolvePlaylistChoice(display);
    return playlistId ? this.getPlaylistWithItems(playlistId) : null;
  },

  // Adds what each display is playing now, for the dashboard
  withNowPlaying(displays) {
    return displays.map((d) => {
      const { playlistId, reason } = this.resolvePlaylistChoice(d);
      const playlist = playlistId ? db.getOne('SELECT name FROM playlists WHERE id = ?', playlistId) : null;
      return { ...d, now_playing_id: playlistId, now_playing_name: playlist?.name || null, now_playing_reason: reason };
    });
  },

  /**
   * Retrieves a playlist and its fully hydrated items with media properties
   */
  getPlaylistWithItems(playlistId) {
    const playlist = db.getOne('SELECT * FROM playlists WHERE id = ?', playlistId);
    if (!playlist) return null;

    const items = db.all(`
      SELECT 
        pi.id,
        pi.playlist_id,
        pi.media_id,
        pi.custom_url,
        pi.duration_seconds,
        pi.display_order,
        pi.transition,
        pi.active_from,
        pi.active_to,
        pi.days_of_week,
        m.filename,
        m.original_name,
        m.media_type,
        m.mime_type,
        m.size_bytes,
        m.url AS media_url,
        m.content AS html_content
      FROM playlist_items pi
      LEFT JOIN media m ON pi.media_id = m.id
      WHERE pi.playlist_id = ?
      ORDER BY pi.display_order ASC, pi.id ASC
    `, playlistId);

    // Format item payloads
    const formattedItems = items.map(item => {
      let resolvedType = item.media_type || 'webpage';
      let resolvedUrl = null;
      let resolvedDuration = item.duration_seconds || 10;

      if (item.custom_url) {
        resolvedType = 'webpage';
        resolvedUrl = item.custom_url;
      } else if (item.media_id) {
        if (item.media_type === 'webpage') {
          resolvedUrl = item.media_url;
        } else if (item.media_type === 'html_snippet') {
          resolvedUrl = null; // will use html_content
        } else {
          // File path relative to server media endpoint
          resolvedUrl = `/media/${item.filename}`;
        }
      }

      return {
        id: item.id,
        playlist_id: item.playlist_id,
        media_id: item.media_id,
        media_type: resolvedType,
        original_name: item.original_name || 'Webpage',
        filename: item.filename,
        url: resolvedUrl,
        html_content: item.html_content,
        duration_seconds: resolvedDuration,
        transition: item.transition || playlist.transition_effect || 'fade',
        display_order: item.display_order,
        active_from: item.active_from,
        active_to: item.active_to,
        days_of_week: item.days_of_week
      };
    });

    return {
      ...playlist,
      items: formattedItems
    };
  }
};
