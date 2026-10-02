package models

import "time"

// Display represents a digital signage hardware node.
type Display struct {
	ID                int64     `json:"id"`
	UUID              string    `json:"uuid"`
	Name              string    `json:"name"`
	Token             string    `json:"token,omitempty"`
	GroupID           *int64    `json:"group_id"`
	GroupName         string    `json:"group_name,omitempty"`
	IPAddress         string    `json:"ip_address"`
	Status            string    `json:"status"` // "online", "offline"
	LastHeartbeat     *string   `json:"last_heartbeat"`
	CurrentPlaylistID *int64    `json:"current_playlist_id"`
	CurrentPlaylist   string    `json:"current_playlist_name,omitempty"`
	Orientation       string    `json:"orientation"` // "landscape", "portrait"
	Resolution        string    `json:"resolution"`
	Metrics           string    `json:"metrics"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// DisplayGroup represents a logical collection of displays.
type DisplayGroup struct {
	ID                int64     `json:"id"`
	Name              string    `json:"name"`
	Description       string    `json:"description"`
	DefaultPlaylistID *int64    `json:"default_playlist_id"`
	DisplayCount      int       `json:"display_count,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
}

// Media represents an uploaded image, video, webpage or HTML snippet asset.
type Media struct {
	ID              int64     `json:"id"`
	Filename        string    `json:"filename"`
	OriginalName    string    `json:"original_name"`
	FilePath        string    `json:"file_path,omitempty"`
	MediaType       string    `json:"media_type"` // "image", "video", "webpage", "html_snippet"
	MimeType        string    `json:"mime_type"`
	SizeBytes       int64     `json:"size_bytes"`
	DurationSeconds int       `json:"duration_seconds"`
	URL             string    `json:"url,omitempty"`
	Content         string    `json:"content,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// Playlist represents an ordered sequence of media items.
type Playlist struct {
	ID                   int64          `json:"id"`
	Name                 string         `json:"name"`
	Description          string         `json:"description"`
	LoopEnabled          bool           `json:"loop_enabled"`
	TransitionEffect     string         `json:"transition_effect"` // "fade", "slide-left", "zoom", "none"
	ItemCount            int            `json:"item_count,omitempty"`
	TotalDurationSeconds int            `json:"total_duration_seconds,omitempty"`
	Items                []PlaylistItem `json:"items,omitempty"`
	CreatedAt            time.Time      `json:"created_at"`
	UpdatedAt            time.Time      `json:"updated_at"`
}

// PlaylistItem represents a single slide inside a playlist.
type PlaylistItem struct {
	ID              int64   `json:"id"`
	PlaylistID      int64   `json:"playlist_id"`
	MediaID         *int64  `json:"media_id"`
	CustomURL       string  `json:"custom_url,omitempty"`
	DurationSeconds int     `json:"duration_seconds"`
	DisplayOrder    int     `json:"display_order"`
	Transition      string  `json:"transition"`
	ActiveFrom      *string `json:"active_from,omitempty"`
	ActiveTo        *string `json:"active_to,omitempty"`
	DaysOfWeek      string  `json:"days_of_week,omitempty"`
	// Hydrated media metadata
	OriginalName string `json:"original_name,omitempty"`
	Filename     string `json:"filename,omitempty"`
	MediaType    string `json:"media_type,omitempty"`
	MimeType     string `json:"mime_type,omitempty"`
	URL          string `json:"url,omitempty"`
	HTMLContent  string `json:"html_content,omitempty"`
}

// Schedule represents time-of-day / day-of-week rules.
type Schedule struct {
	ID           int64     `json:"id"`
	TargetType   string    `json:"target_type"` // "display", "group"
	TargetID     int64     `json:"target_id"`
	TargetName   string    `json:"target_name,omitempty"`
	PlaylistID   int64     `json:"playlist_id"`
	PlaylistName string    `json:"playlist_name,omitempty"`
	StartTime    string    `json:"start_time"` // "08:00"
	EndTime      string    `json:"end_time"`   // "18:00"
	DaysOfWeek   string    `json:"days_of_week"`
	Priority     int       `json:"priority"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
}

// PairingRequest represents an unpaired display waiting for approval.
type PairingRequest struct {
	ID          int64     `json:"id"`
	PairingCode string    `json:"pairing_code"`
	UUID        string    `json:"uuid"`
	ClientName  string    `json:"client_name"`
	IPAddress   string    `json:"ip_address"`
	Token       string    `json:"token"`
	Status      string    `json:"status"` // "pending", "approved", "rejected"
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
}

// AuditLog represents operational events.
type AuditLog struct {
	ID          int64     `json:"id"`
	Level       string    `json:"level"` // "info", "warn", "error", "command"
	Source      string    `json:"source"`
	DisplayUUID string    `json:"display_uuid,omitempty"`
	Message     string    `json:"message"`
	Payload     string    `json:"payload,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// WSMessage represents a generic WebSocket payload frame.
type WSMessage struct {
	Type            string      `json:"type"`
	Status          string      `json:"status,omitempty"`
	UUID            string      `json:"uuid,omitempty"`
	Token           string      `json:"token,omitempty"`
	Name            string      `json:"name,omitempty"`
	ClientName      string      `json:"clientName,omitempty"`
	ClientVersion   string      `json:"clientVersion,omitempty"`
	PairingCode     string      `json:"pairingCode,omitempty"`
	DisplayID       int64       `json:"displayId,omitempty"`
	DisplayName     string      `json:"displayName,omitempty"`
	Orientation     string      `json:"orientation,omitempty"`
	Resolution      string      `json:"resolution,omitempty"`
	URL             string      `json:"url,omitempty"`
	DurationSeconds int         `json:"durationSeconds,omitempty"`
	State           bool        `json:"state,omitempty"`
	Title           string      `json:"title,omitempty"`
	Message         string      `json:"message,omitempty"`
	Playlist        *Playlist   `json:"playlist,omitempty"`
	Metrics         interface{} `json:"metrics,omitempty"`
	CurrentPlaying  interface{} `json:"currentPlaying,omitempty"`
	UptimeSeconds   int64       `json:"uptimeSeconds,omitempty"`
	ServerTime      string      `json:"serverTime,omitempty"`
	Data            interface{} `json:"data,omitempty"`
}

// CommandRequest represents incoming JSON to /api/displays/:id/command.
type CommandRequest struct {
	Action  string                 `json:"action"` // "push_url", "reload", "blank", "reboot", "screenshot", "assign_playlist"
	Payload map[string]interface{} `json:"payload,omitempty"`
	URL     string                 `json:"url,omitempty"`
	State   bool                   `json:"state,omitempty"`
	DurSec  int                    `json:"durationSeconds,omitempty"`
}
