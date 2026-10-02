package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"display-orchestrator/server/internal/models"
	_ "modernc.org/sqlite"
)

type DB struct {
	db *sql.DB
	mu sync.RWMutex
}

func InitDB(dbPath string) (*DB, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create db directory: %w", err)
	}

	dsn := fmt.Sprintf("%s?_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)&_pragma=busy_timeout(5000)", dbPath)
	database, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	database.SetMaxOpenConns(1) // SQLite works best with 1 writer connection in WAL mode

	store := &DB{db: database}
	if err := store.migrate(); err != nil {
		return nil, fmt.Errorf("migration failed: %w", err)
	}
	if err := store.seed(); err != nil {
		return nil, fmt.Errorf("seeding failed: %w", err)
	}

	return store, nil
}

func (d *DB) Close() error {
	return d.db.Close()
}

func (d *DB) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS display_groups (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE NOT NULL,
		description TEXT,
		default_playlist_id INTEGER,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS displays (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		uuid TEXT UNIQUE NOT NULL,
		name TEXT NOT NULL,
		token TEXT,
		group_id INTEGER REFERENCES display_groups(id) ON DELETE SET NULL,
		ip_address TEXT,
		status TEXT DEFAULT 'offline',
		last_heartbeat DATETIME,
		current_playlist_id INTEGER,
		orientation TEXT DEFAULT 'landscape',
		resolution TEXT DEFAULT '1920x1080',
		metrics TEXT DEFAULT '{}',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS media (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		filename TEXT NOT NULL,
		original_name TEXT NOT NULL,
		file_path TEXT NOT NULL,
		media_type TEXT NOT NULL, -- 'image', 'video', 'webpage', 'html_snippet'
		mime_type TEXT,
		size_bytes INTEGER DEFAULT 0,
		duration_seconds INTEGER DEFAULT 10,
		url TEXT,
		content TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS playlists (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		description TEXT,
		loop_enabled INTEGER DEFAULT 1,
		transition_effect TEXT DEFAULT 'fade',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS playlist_items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
		media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
		custom_url TEXT,
		duration_seconds INTEGER DEFAULT 10,
		display_order INTEGER NOT NULL DEFAULT 0,
		transition TEXT DEFAULT 'fade',
		active_from TEXT,
		active_to TEXT,
		days_of_week TEXT DEFAULT '[1,2,3,4,5,6,7]',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS schedules (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		target_type TEXT NOT NULL, -- 'display' or 'group'
		target_id INTEGER NOT NULL,
		playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
		start_time TEXT NOT NULL,
		end_time TEXT NOT NULL,
		days_of_week TEXT DEFAULT '[1,2,3,4,5,6,7]',
		priority INTEGER DEFAULT 1,
		is_active INTEGER DEFAULT 1,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS pairing_requests (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		pairing_code TEXT UNIQUE NOT NULL,
		uuid TEXT UNIQUE NOT NULL,
		client_name TEXT,
		ip_address TEXT,
		token TEXT NOT NULL,
		status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
		expires_at DATETIME NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS audit_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		level TEXT DEFAULT 'info',
		source TEXT NOT NULL,
		display_uuid TEXT,
		message TEXT NOT NULL,
		payload TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_displays_uuid ON displays(uuid);
	CREATE INDEX IF NOT EXISTS idx_displays_status ON displays(status);
	CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id);
	`
	_, err := d.db.Exec(schema)
	return err
}

func (d *DB) seed() error {
	var count int
	err := d.db.QueryRow("SELECT COUNT(*) FROM display_groups").Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	// 1. Create Default Display Group
	res, err := d.db.Exec("INSERT INTO display_groups (name, description) VALUES (?, ?)", "Default Displays", "Default node group")
	if err != nil {
		return err
	}
	groupID, _ := res.LastInsertId()

	// 2. Create Welcome Demo Playlist
	plRes, err := d.db.Exec("INSERT INTO playlists (name, description, loop_enabled, transition_effect) VALUES (?, ?, 1, ?)",
		"Welcome Demo Loop", "Out-of-the-box welcome playlist", "fade")
	if err != nil {
		return err
	}
	playlistID, _ := plRes.LastInsertId()

	// 3. Create Sample Media (HTML Card & Live Clock)
	welcomeHTML := `<div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;background:radial-gradient(ellipse at center, #1e293b 0%, #0f172a 100%);color:#f8fafc;font-family:system-ui,sans-serif;text-align:center;padding:40px;box-sizing:border-box;">
		<div style="display:inline-flex;padding:12px 24px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);border-radius:9999px;color:#4ade80;font-weight:600;font-size:1.1rem;margin-bottom:24px;letter-spacing:0.05em;text-transform:uppercase;">
			✓ Display Orchestrator Active
		</div>
		<h1 style="font-size:3.5rem;font-weight:800;margin:0 0 16px 0;letter-spacing:-0.03em;background:linear-gradient(135deg, #ffffff 0%, #94a3b8 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">
			Welcome to Digital Signage
		</h1>
		<p style="font-size:1.4rem;color:#94a3b8;max-width:800px;line-height:1.6;margin:0 0 32px 0;">
			This screen is remotely managed in real-time. Change playlists, broadcast emergency messages, and monitor status from the Web Orchestrator.
		</p>
	</div>`

	m1Res, err := d.db.Exec(`INSERT INTO media (filename, original_name, file_path, media_type, mime_type, duration_seconds, content)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"welcome_card.html", "Welcome Screen", "", "html_snippet", "text/html", 10, welcomeHTML)
	if err != nil {
		return err
	}
	m1ID, _ := m1Res.LastInsertId()

	m2Res, err := d.db.Exec(`INSERT INTO media (filename, original_name, file_path, media_type, mime_type, duration_seconds, url)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"world_events.url", "World Events Dashboard", "", "webpage", "text/html", 15, "https://en.wikipedia.org/wiki/Portal:Current_events")
	if err != nil {
		return err
	}
	m2ID, _ := m2Res.LastInsertId()

	// 4. Add items to playlist
	_, err = d.db.Exec(`INSERT INTO playlist_items (playlist_id, media_id, duration_seconds, display_order, transition) VALUES (?, ?, 10, 1, 'fade')`, playlistID, m1ID)
	if err != nil {
		return err
	}
	_, err = d.db.Exec(`INSERT INTO playlist_items (playlist_id, media_id, duration_seconds, display_order, transition) VALUES (?, ?, 15, 2, 'slide-left')`, playlistID, m2ID)
	if err != nil {
		return err
	}

	// 5. Link default playlist to group
	_, err = d.db.Exec("UPDATE display_groups SET default_playlist_id = ? WHERE id = ?", playlistID, groupID)
	if err != nil {
		return err
	}

	d.Log("info", "server", "", "Database initialized with Welcome Demo Playlist", "")
	return nil
}

// Log writes an audit log entry.
func (d *DB) Log(level, source, displayUUID, message, payload string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	_, _ = d.db.Exec("INSERT INTO audit_logs (level, source, display_uuid, message, payload) VALUES (?, ?, ?, ?, ?)",
		level, source, displayUUID, message, payload)
}

// GetDisplays retrieves all displays.
func (d *DB) GetDisplays() ([]models.Display, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	query := `
	SELECT 
		d.id, d.uuid, d.name, d.token, d.group_id, COALESCE(g.name, '') as group_name,
		COALESCE(d.ip_address, ''), d.status, d.last_heartbeat, d.current_playlist_id,
		COALESCE(p.name, '') as current_playlist_name, d.orientation, d.resolution,
		d.metrics, d.created_at, d.updated_at
	FROM displays d
	LEFT JOIN display_groups g ON d.group_id = g.id
	LEFT JOIN playlists p ON d.current_playlist_id = p.id
	ORDER BY d.name ASC
	`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.Display
	for rows.Next() {
		var item models.Display
		var token sql.NullString
		var ip sql.NullString
		var hb sql.NullString
		err := rows.Scan(
			&item.ID, &item.UUID, &item.Name, &token, &item.GroupID, &item.GroupName,
			&ip, &item.Status, &hb, &item.CurrentPlaylistID,
			&item.CurrentPlaylist, &item.Orientation, &item.Resolution,
			&item.Metrics, &item.CreatedAt, &item.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		if token.Valid {
			item.Token = token.String
		}
		if ip.Valid {
			item.IPAddress = ip.String
		}
		if hb.Valid {
			val := hb.String
			item.LastHeartbeat = &val
		}
		list = append(list, item)
	}
	return list, nil
}

// GetDisplayByUUID retrieves a single display by UUID.
func (d *DB) GetDisplayByUUID(uuid string) (*models.Display, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	query := `
	SELECT 
		d.id, d.uuid, d.name, d.token, d.group_id, COALESCE(g.name, '') as group_name,
		COALESCE(d.ip_address, ''), d.status, d.last_heartbeat, d.current_playlist_id,
		COALESCE(p.name, '') as current_playlist_name, d.orientation, d.resolution,
		d.metrics, d.created_at, d.updated_at
	FROM displays d
	LEFT JOIN display_groups g ON d.group_id = g.id
	LEFT JOIN playlists p ON d.current_playlist_id = p.id
	WHERE d.uuid = ?
	`
	var item models.Display
	var token sql.NullString
	var ip sql.NullString
	var hb sql.NullString
	err := d.db.QueryRow(query, uuid).Scan(
		&item.ID, &item.UUID, &item.Name, &token, &item.GroupID, &item.GroupName,
		&ip, &item.Status, &hb, &item.CurrentPlaylistID,
		&item.CurrentPlaylist, &item.Orientation, &item.Resolution,
		&item.Metrics, &item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if token.Valid {
		item.Token = token.String
	}
	if ip.Valid {
		item.IPAddress = ip.String
	}
	if hb.Valid {
		val := hb.String
		item.LastHeartbeat = &val
	}
	return &item, nil
}

// SaveDisplay inserts or updates a display.
func (d *DB) SaveDisplay(disp *models.Display) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	var count int
	_ = d.db.QueryRow("SELECT COUNT(*) FROM displays WHERE uuid = ?", disp.UUID).Scan(&count)
	if count > 0 {
		_, err := d.db.Exec(`
			UPDATE displays SET name = ?, token = ?, group_id = ?, ip_address = ?,
				status = ?, orientation = ?, resolution = ?, current_playlist_id = ?, updated_at = CURRENT_TIMESTAMP
			WHERE uuid = ?`,
			disp.Name, disp.Token, disp.GroupID, disp.IPAddress, disp.Status, disp.Orientation, disp.Resolution, disp.CurrentPlaylistID, disp.UUID)
		return err
	}

	res, err := d.db.Exec(`
		INSERT INTO displays (uuid, name, token, group_id, ip_address, status, orientation, resolution)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		disp.UUID, disp.Name, disp.Token, disp.GroupID, disp.IPAddress, disp.Status, disp.Orientation, disp.Resolution)
	if err != nil {
		return err
	}
	disp.ID, _ = res.LastInsertId()
	return nil
}

// UpdateHeartbeat updates last_heartbeat and metrics.
func (d *DB) UpdateHeartbeat(uuid string, metricsJSON string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	_, err := d.db.Exec("UPDATE displays SET status = 'online', last_heartbeat = CURRENT_TIMESTAMP, metrics = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?", metricsJSON, uuid)
	return err
}

// MarkOffline updates display status to offline.
func (d *DB) MarkOffline(uuid string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	_, err := d.db.Exec("UPDATE displays SET status = 'offline', updated_at = CURRENT_TIMESTAMP WHERE uuid = ?", uuid)
	return err
}

// GetPendingPairings gets all pending pairing requests.
func (d *DB) GetPendingPairings() ([]models.PairingRequest, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	rows, err := d.db.Query("SELECT id, pairing_code, uuid, client_name, ip_address, token, status, expires_at, created_at FROM pairing_requests WHERE status = 'pending' ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.PairingRequest
	for rows.Next() {
		var item models.PairingRequest
		if err := rows.Scan(&item.ID, &item.PairingCode, &item.UUID, &item.ClientName, &item.IPAddress, &item.Token, &item.Status, &item.ExpiresAt, &item.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, item)
	}
	return list, nil
}

// CreatePairingRequest inserts a new pairing code.
func (d *DB) CreatePairingRequest(req *models.PairingRequest) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	res, err := d.db.Exec("INSERT INTO pairing_requests (pairing_code, uuid, client_name, ip_address, token, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
		req.PairingCode, req.UUID, req.ClientName, req.IPAddress, req.Token, req.ExpiresAt)
	if err != nil {
		return err
	}
	req.ID, _ = res.LastInsertId()
	return nil
}

// ApprovePairing marks code as approved.
func (d *DB) ApprovePairing(code, customName string, groupID *int64) (*models.PairingRequest, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	var req models.PairingRequest
	err := d.db.QueryRow("SELECT id, pairing_code, uuid, client_name, ip_address, token, status, expires_at, created_at FROM pairing_requests WHERE pairing_code = ? AND status = 'pending'", code).
		Scan(&req.ID, &req.PairingCode, &req.UUID, &req.ClientName, &req.IPAddress, &req.Token, &req.Status, &req.ExpiresAt, &req.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("pairing code not found: %w", err)
	}

	_, err = d.db.Exec("UPDATE pairing_requests SET status = 'approved' WHERE id = ?", req.ID)
	if err != nil {
		return nil, err
	}

	displayName := customName
	if displayName == "" {
		displayName = req.ClientName
	}
	if displayName == "" {
		displayName = "Display Screen"
	}

	// Upsert display
	var count int
	_ = d.db.QueryRow("SELECT COUNT(*) FROM displays WHERE uuid = ?", req.UUID).Scan(&count)
	if count > 0 {
		_, err = d.db.Exec("UPDATE displays SET name = ?, token = ?, group_id = ?, status = 'online', updated_at = CURRENT_TIMESTAMP WHERE uuid = ?", displayName, req.Token, groupID, req.UUID)
	} else {
		_, err = d.db.Exec("INSERT INTO displays (uuid, name, token, group_id, ip_address, status) VALUES (?, ?, ?, ?, ?, 'online')", req.UUID, displayName, req.Token, groupID, req.IPAddress)
	}

	return &req, err
}

// ResolvePlaylist returns the active playlist for a display.
func (d *DB) ResolvePlaylist(displayUUID string) (*models.Playlist, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var disp models.Display
	var groupID sql.NullInt64
	var currentPlaylistID sql.NullInt64

	err := d.db.QueryRow("SELECT id, group_id, current_playlist_id FROM displays WHERE uuid = ?", displayUUID).
		Scan(&disp.ID, &groupID, &currentPlaylistID)
	if err != nil {
		return nil, err
	}

	var targetPlaylistID int64

	// 1. Direct assignment
	if currentPlaylistID.Valid && currentPlaylistID.Int64 > 0 {
		targetPlaylistID = currentPlaylistID.Int64
	}

	// 2. Group default
	if targetPlaylistID == 0 && groupID.Valid && groupID.Int64 > 0 {
		var gDefault sql.NullInt64
		_ = d.db.QueryRow("SELECT default_playlist_id FROM display_groups WHERE id = ?", groupID.Int64).Scan(&gDefault)
		if gDefault.Valid && gDefault.Int64 > 0 {
			targetPlaylistID = gDefault.Int64
		}
	}

	// 3. Global fallback
	if targetPlaylistID == 0 {
		_ = d.db.QueryRow("SELECT id FROM playlists ORDER BY id ASC LIMIT 1").Scan(&targetPlaylistID)
	}

	if targetPlaylistID == 0 {
		return nil, nil
	}

	return d.GetPlaylistWithItems(targetPlaylistID)
}

// GetPlaylistWithItems fetches a playlist and all its hydrated items.
func (d *DB) GetPlaylistWithItems(id int64) (*models.Playlist, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var pl models.Playlist
	err := d.db.QueryRow("SELECT id, name, description, loop_enabled, transition_effect, created_at, updated_at FROM playlists WHERE id = ?", id).
		Scan(&pl.ID, &pl.Name, &pl.Description, &pl.LoopEnabled, &pl.TransitionEffect, &pl.CreatedAt, &pl.UpdatedAt)
	if err != nil {
		return nil, err
	}

	rows, err := d.db.Query(`
		SELECT 
			pi.id, pi.playlist_id, pi.media_id, COALESCE(pi.custom_url, ''),
			pi.duration_seconds, pi.display_order, pi.transition,
			COALESCE(m.original_name, 'Webpage'), COALESCE(m.filename, ''),
			COALESCE(m.media_type, 'webpage'), COALESCE(m.mime_type, 'text/html'),
			COALESCE(m.url, ''), COALESCE(m.content, '')
		FROM playlist_items pi
		LEFT JOIN media m ON pi.media_id = m.id
		WHERE pi.playlist_id = ?
		ORDER BY pi.display_order ASC, pi.id ASC
	`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var item models.PlaylistItem
		var mediaURL string
		err := rows.Scan(
			&item.ID, &item.PlaylistID, &item.MediaID, &item.CustomURL,
			&item.DurationSeconds, &item.DisplayOrder, &item.Transition,
			&item.OriginalName, &item.Filename, &item.MediaType, &item.MimeType,
			&mediaURL, &item.HTMLContent,
		)
		if err != nil {
			return nil, err
		}

		if item.CustomURL != "" {
			item.MediaType = "webpage"
			item.URL = item.CustomURL
		} else if item.MediaID != nil {
			if item.MediaType == "webpage" {
				item.URL = mediaURL
			} else if item.MediaType == "image" || item.MediaType == "video" {
				item.URL = fmt.Sprintf("/api/media/%s", item.Filename)
			}
		}

		pl.Items = append(pl.Items, item)
	}

	pl.ItemCount = len(pl.Items)
	for _, it := range pl.Items {
		pl.TotalDurationSeconds += it.DurationSeconds
	}

	return &pl, nil
}

// GetAllPlaylists retrieves all playlists.
func (d *DB) GetAllPlaylists() ([]models.Playlist, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	rows, err := d.db.Query(`
		SELECT p.id, p.name, p.description, p.loop_enabled, p.transition_effect,
		       COUNT(pi.id) as item_count, COALESCE(SUM(pi.duration_seconds), 0) as total_duration,
		       p.created_at, p.updated_at
		FROM playlists p
		LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
		GROUP BY p.id
		ORDER BY p.name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.Playlist
	for rows.Next() {
		var p models.Playlist
		err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.LoopEnabled, &p.TransitionEffect, &p.ItemCount, &p.TotalDurationSeconds, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, nil
}

// CreatePlaylist inserts a new playlist.
func (d *DB) CreatePlaylist(p *models.Playlist) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	res, err := d.db.Exec("INSERT INTO playlists (name, description, loop_enabled, transition_effect) VALUES (?, ?, ?, ?)",
		p.Name, p.Description, p.LoopEnabled, p.TransitionEffect)
	if err != nil {
		return err
	}
	p.ID, _ = res.LastInsertId()
	return nil
}

// AddPlaylistItem adds a slide to a playlist.
func (d *DB) AddPlaylistItem(item *models.PlaylistItem) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	var maxOrder int
	_ = d.db.QueryRow("SELECT COALESCE(MAX(display_order), 0) FROM playlist_items WHERE playlist_id = ?", item.PlaylistID).Scan(&maxOrder)
	item.DisplayOrder = maxOrder + 1

	res, err := d.db.Exec(`
		INSERT INTO playlist_items (playlist_id, media_id, custom_url, duration_seconds, display_order, transition)
		VALUES (?, ?, ?, ?, ?, ?)`,
		item.PlaylistID, item.MediaID, item.CustomURL, item.DurationSeconds, item.DisplayOrder, item.Transition)
	if err != nil {
		return err
	}
	item.ID, _ = res.LastInsertId()
	return nil
}

// GetAllMedia lists all media records.
func (d *DB) GetAllMedia() ([]models.Media, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	rows, err := d.db.Query("SELECT id, filename, original_name, file_path, media_type, mime_type, size_bytes, duration_seconds, COALESCE(url, ''), COALESCE(content, ''), created_at, updated_at FROM media ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.Media
	for rows.Next() {
		var m models.Media
		err := rows.Scan(&m.ID, &m.Filename, &m.OriginalName, &m.FilePath, &m.MediaType, &m.MimeType, &m.SizeBytes, &m.DurationSeconds, &m.URL, &m.Content, &m.CreatedAt, &m.UpdatedAt)
		if err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, nil
}

// SaveMedia inserts a media asset.
func (d *DB) SaveMedia(m *models.Media) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	res, err := d.db.Exec(`
		INSERT INTO media (filename, original_name, file_path, media_type, mime_type, size_bytes, duration_seconds, url, content)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.Filename, m.OriginalName, m.FilePath, m.MediaType, m.MimeType, m.SizeBytes, m.DurationSeconds, m.URL, m.Content)
	if err != nil {
		return err
	}
	m.ID, _ = res.LastInsertId()
	return nil
}

// DeleteMedia deletes a media record.
func (d *DB) DeleteMedia(id int64) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	_, err := d.db.Exec("DELETE FROM media WHERE id = ?", id)
	return err
}

// GetLogs gets recent audit logs.
func (d *DB) GetLogs(limit int) ([]models.AuditLog, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	rows, err := d.db.Query("SELECT id, level, source, COALESCE(display_uuid, ''), message, COALESCE(payload, ''), created_at FROM audit_logs ORDER BY created_at DESC LIMIT ?", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.AuditLog
	for rows.Next() {
		var l models.AuditLog
		if err := rows.Scan(&l.ID, &l.Level, &l.Source, &l.DisplayUUID, &l.Message, &l.Payload, &l.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, l)
	}
	return list, nil
}
