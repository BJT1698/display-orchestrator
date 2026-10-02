package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"display-orchestrator/server/internal/models"
	"display-orchestrator/server/internal/storage"
	"display-orchestrator/server/internal/ws"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for dev/dashboard access
	},
}

type API struct {
	Store    *storage.DB
	Hub      *ws.Hub
	MediaDir string
	WebDir   string
}

func NewAPI(store *storage.DB, hub *ws.Hub, mediaDir, webDir string) *API {
	_ = os.MkdirAll(mediaDir, 0755)
	return &API{
		Store:    store,
		Hub:      hub,
		MediaDir: mediaDir,
		WebDir:   webDir,
	}
}

func (a *API) JSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": status >= 200 && status < 300,
		"data":    data,
	})
}

func (a *API) Error(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"error":   message,
	})
}

// Health Check
func (a *API) HandleHealth(w http.ResponseWriter, r *http.Request) {
	a.JSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"timestamp": time.Now().Format(time.RFC3339),
		"uptime":    time.Since(startTime).Seconds(),
	})
}

var startTime = time.Now()

// WebSocket Endpoint
func (a *API) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	q := r.URL.Query()
	clientType := q.Get("type")
	if clientType == "" {
		if strings.Contains(r.URL.Path, "dashboard") {
			clientType = "dashboard"
		} else {
			clientType = "display"
		}
	}

	client := &ws.Client{
		Hub:         a.Hub,
		Conn:        conn,
		Send:        make(chan []byte, 256),
		ClientType:  clientType,
		DisplayUUID: q.Get("uuid"),
		IPAddress:   r.RemoteAddr,
	}

	a.Hub.Register <- client

	go client.WritePump()
	go client.ReadPump()
}

// Displays Endpoints
func (a *API) HandleDisplays(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		displays, err := a.Store.GetDisplays()
		if err != nil {
			a.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		a.JSON(w, http.StatusOK, displays)

	default:
		a.Error(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// Register display via POST
func (a *API) HandleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		a.Error(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		UUID string `json:"uuid"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		a.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.UUID == "" {
		a.Error(w, http.StatusBadRequest, "UUID is required")
		return
	}

	disp, _ := a.Store.GetDisplayByUUID(req.UUID)
	if disp == nil {
		disp = &models.Display{
			UUID:      req.UUID,
			Name:      req.Name,
			Status:    "online",
			IPAddress: r.RemoteAddr,
		}
		_ = a.Store.SaveDisplay(disp)
	}

	a.JSON(w, http.StatusOK, disp)
}

// Display Command Dispatcher
func (a *API) HandleDisplayCommand(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		a.Error(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Extract display ID from URL: /api/displays/{id}/command or /api/displays/{id}/push
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		a.Error(w, http.StatusBadRequest, "Missing display ID")
		return
	}
	idStr := parts[2]

	var disp *models.Display
	var err error
	if id, parseErr := strconv.ParseInt(idStr, 10, 64); parseErr == nil {
		list, _ := a.Store.GetDisplays()
		for _, d := range list {
			if d.ID == id {
				disp = &d
				break
			}
		}
	} else {
		disp, err = a.Store.GetDisplayByUUID(idStr)
	}

	if disp == nil || err != nil {
		a.Error(w, http.StatusNotFound, "Display not found")
		return
	}

	var cmd models.CommandRequest
	_ = json.NewDecoder(r.Body).Decode(&cmd)

	isPush := strings.HasSuffix(r.URL.Path, "/push")
	if isPush || cmd.Action == "push_url" || cmd.Action == "NAVIGATE" {
		targetURL := cmd.URL
		if targetURL == "" && cmd.Payload != nil {
			if u, ok := cmd.Payload["url"].(string); ok {
				targetURL = u
			}
		}
		dur := cmd.DurSec
		if dur == 0 && cmd.Payload != nil {
			if d, ok := cmd.Payload["durationSeconds"].(float64); ok {
				dur = int(d)
			}
		}
		if dur == 0 {
			dur = 30
		}

		sent := a.Hub.PushURL(disp.UUID, targetURL, dur)
		a.Store.Log("command", "dashboard", disp.UUID, fmt.Sprintf("Pushed URL: %s", targetURL), "")
		a.JSON(w, http.StatusOK, map[string]interface{}{"sent": sent, "url": targetURL})
		return
	}

	switch cmd.Action {
	case "reload", "FORCE_RELOAD":
		sent := a.Hub.ForceReload(disp.UUID)
		a.JSON(w, http.StatusOK, map[string]interface{}{"sent": sent, "action": "reload"})

	case "blank", "BLANK":
		state := cmd.State
		if cmd.Payload != nil {
			if s, ok := cmd.Payload["state"].(bool); ok {
				state = s
			}
		}
		sent := a.Hub.Blank(disp.UUID, state)
		a.JSON(w, http.StatusOK, map[string]interface{}{"sent": sent, "state": state})

	case "SET_PLAYLIST", "assign_playlist":
		a.Hub.SyncDisplay(disp.UUID)
		a.JSON(w, http.StatusOK, map[string]interface{}{"sent": true, "action": "sync"})

	default:
		a.Error(w, http.StatusBadRequest, fmt.Sprintf("Unknown command: %s", cmd.Action))
	}
}

// Pairing Approval
func (a *API) HandlePairing(w http.ResponseWriter, r *http.Request) {
	if strings.HasSuffix(r.URL.Path, "/pending") {
		list, err := a.Store.GetPendingPairings()
		if err != nil {
			a.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		a.JSON(w, http.StatusOK, list)
		return
	}

	if strings.HasSuffix(r.URL.Path, "/approve") && r.Method == http.MethodPost {
		var req struct {
			PairingCode string `json:"pairingCode"`
			Name        string `json:"name"`
			GroupID     *int64 `json:"groupId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			a.Error(w, http.StatusBadRequest, "Invalid request")
			return
		}

		res, err := a.Store.ApprovePairing(strings.ToUpper(strings.TrimSpace(req.PairingCode)), req.Name, req.GroupID)
		if err != nil {
			a.Error(w, http.StatusBadRequest, err.Error())
			return
		}

		// Notify connected client over WS
		a.Hub.SendToDisplay(res.UUID, models.WSMessage{
			Type:        "PAIRING_APPROVED",
			Token:       res.Token,
			DisplayName: req.Name,
		})
		a.Hub.SyncDisplay(res.UUID)

		a.JSON(w, http.StatusOK, map[string]interface{}{"success": true, "token": res.Token, "uuid": res.UUID})
		return
	}

	a.Error(w, http.StatusNotFound, "Not found")
}

// Media Endpoints
func (a *API) HandleMedia(w http.ResponseWriter, r *http.Request) {
	// Serve static media file: /api/media/{filename}
	if r.Method == http.MethodGet && strings.Count(r.URL.Path, "/") >= 3 {
		filename := filepath.Base(r.URL.Path)
		filePath := filepath.Join(a.MediaDir, filename)
		if _, err := os.Stat(filePath); err == nil {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			http.ServeFile(w, r, filePath)
			return
		}
	}

	switch r.Method {
	case http.MethodGet:
		list, err := a.Store.GetAllMedia()
		if err != nil {
			a.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		a.JSON(w, http.StatusOK, list)

	case http.MethodPost:
		// Multipart file upload or JSON payload
		contentType := r.Header.Get("Content-Type")
		if strings.HasPrefix(contentType, "multipart/form-data") {
			_ = r.ParseMultipartForm(500 * 1024 * 1024)
			file, header, err := r.FormFile("file")
			if err != nil {
				a.Error(w, http.StatusBadRequest, "File upload missing")
				return
			}
			defer file.Close()

			durStr := r.FormValue("durationSeconds")
			dur, _ := strconv.Atoi(durStr)
			if dur <= 0 {
				dur = 10
			}

			uniqueFilename := fmt.Sprintf("%d-%s", time.Now().UnixNano(), filepath.Base(header.Filename))
			destPath := filepath.Join(a.MediaDir, uniqueFilename)
			dst, err := os.Create(destPath)
			if err != nil {
				a.Error(w, http.StatusInternalServerError, "Failed to save file")
				return
			}
			defer dst.Close()
			size, _ := io.Copy(dst, file)

			mediaType := "image"
			if strings.HasPrefix(header.Header.Get("Content-Type"), "video/") || strings.HasSuffix(uniqueFilename, ".mp4") {
				mediaType = "video"
			}

			m := &models.Media{
				Filename:        uniqueFilename,
				OriginalName:    header.Filename,
				FilePath:        destPath,
				MediaType:       mediaType,
				MimeType:        header.Header.Get("Content-Type"),
				SizeBytes:       size,
				DurationSeconds: dur,
			}
			_ = a.Store.SaveMedia(m)
			a.JSON(w, http.StatusCreated, m)
			return
		}

		// JSON media creation (URL or HTML)
		var m models.Media
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			a.Error(w, http.StatusBadRequest, "Invalid JSON")
			return
		}
		if m.DurationSeconds <= 0 {
			m.DurationSeconds = 10
		}
		if m.Filename == "" {
			m.Filename = fmt.Sprintf("asset-%d.url", time.Now().Unix())
		}
		_ = a.Store.SaveMedia(&m)
		a.JSON(w, http.StatusCreated, m)

	default:
		a.Error(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// Playlists Endpoints
func (a *API) HandlePlaylists(w http.ResponseWriter, r *http.Request) {
	// Sub-routes: /api/playlists/{id}/items
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

	if len(parts) >= 3 {
		plID, _ := strconv.ParseInt(parts[2], 10, 64)

		if len(parts) >= 4 && parts[3] == "items" && r.Method == http.MethodPost {
			var item models.PlaylistItem
			_ = json.NewDecoder(r.Body).Decode(&item)
			item.PlaylistID = plID
			if item.DurationSeconds <= 0 {
				item.DurationSeconds = 10
			}
			if item.Transition == "" {
				item.Transition = "fade"
			}
			_ = a.Store.AddPlaylistItem(&item)
			a.Hub.SyncAll()
			a.JSON(w, http.StatusCreated, item)
			return
		}

		// Get single playlist
		pl, err := a.Store.GetPlaylistWithItems(plID)
		if err != nil || pl == nil {
			a.Error(w, http.StatusNotFound, "Playlist not found")
			return
		}
		a.JSON(w, http.StatusOK, pl)
		return
	}

	switch r.Method {
	case http.MethodGet:
		list, err := a.Store.GetAllPlaylists()
		if err != nil {
			a.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		a.JSON(w, http.StatusOK, list)

	case http.MethodPost:
		var p models.Playlist
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			a.Error(w, http.StatusBadRequest, "Invalid JSON")
			return
		}
		if p.TransitionEffect == "" {
			p.TransitionEffect = "fade"
		}
		p.LoopEnabled = true
		_ = a.Store.CreatePlaylist(&p)
		a.JSON(w, http.StatusCreated, p)

	default:
		a.Error(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// System Status & Logs
func (a *API) HandleSystem(w http.ResponseWriter, r *http.Request) {
	if strings.HasSuffix(r.URL.Path, "/logs") {
		logs, _ := a.Store.GetLogs(50)
		a.JSON(w, http.StatusOK, logs)
		return
	}

	displays, _ := a.Store.GetDisplays()
	online := 0
	for _, d := range displays {
		if d.Status == "online" {
			online++
		}
	}

	a.JSON(w, http.StatusOK, map[string]interface{}{
		"serverTime": time.Now().Format(time.RFC3339),
		"uptime":     time.Since(startTime).Seconds(),
		"displays": map[string]int{
			"total":  len(displays),
			"online": online,
		},
	})
}
