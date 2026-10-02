import { db } from '../db/database.js';

export const schedulerService = {
  /**
   * Resolves the active playlist object and its full list of items for a given display
   */
  resolveDisplayPlaylist(displayUuid) {
    const display = db.getOne('SELECT * FROM displays WHERE uuid = ?', displayUuid);
    if (!display) return null;

    let targetPlaylistId = null;

    // 1. Check time-based / day-of-week active schedules
    const now = new Date();
    const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // 1 = Monday, 7 = Sunday
    const currentHourMin = now.toTimeString().substring(0, 5); // "HH:MM"

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
        if (schedule.days_of_week) {
          days = JSON.parse(schedule.days_of_week);
        }
      } catch (e) {
        // ignore malformed json
      }

      if (days.includes(currentDay)) {
        if (schedule.start_time <= schedule.end_time) {
          // Normal range (e.g. 08:00 to 18:00)
          if (currentHourMin >= schedule.start_time && currentHourMin <= schedule.end_time) {
            targetPlaylistId = schedule.playlist_id;
            break;
          }
        } else {
          // Overnight range (e.g. 22:00 to 06:00)
          if (currentHourMin >= schedule.start_time || currentHourMin <= schedule.end_time) {
            targetPlaylistId = schedule.playlist_id;
            break;
          }
        }
      }
    }

    // 2. Fallback to direct display assignment
    if (!targetPlaylistId && display.current_playlist_id) {
      targetPlaylistId = display.current_playlist_id;
    }

    // 3. Fallback to group default playlist
    if (!targetPlaylistId && display.group_id) {
      const group = db.getOne('SELECT default_playlist_id FROM display_groups WHERE id = ?', display.group_id);
      if (group && group.default_playlist_id) {
        targetPlaylistId = group.default_playlist_id;
      }
    }

    // 4. Fallback to first available playlist in database
    if (!targetPlaylistId) {
      const first = db.getOne('SELECT id FROM playlists ORDER BY id ASC LIMIT 1');
      if (first) {
        targetPlaylistId = first.id;
      }
    }

    if (!targetPlaylistId) return null;

    return this.getPlaylistWithItems(targetPlaylistId);
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
