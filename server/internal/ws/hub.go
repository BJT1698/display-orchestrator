package ws

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"math/big"
	"sync"
	"time"

	"display-orchestrator/server/internal/models"
	"display-orchestrator/server/internal/storage"
)

type Hub struct {
	Store            *storage.DB
	clients          map[*Client]bool
	displayClients   map[string]*Client // UUID -> client
	dashboardClients map[*Client]bool
	Register         chan *Client
	Unregister       chan *Client
	mu               sync.RWMutex
}

func NewHub(store *storage.DB) *Hub {
	return &Hub{
		Store:            store,
		clients:          make(map[*Client]bool),
		displayClients:   make(map[string]*Client),
		dashboardClients: make(map[*Client]bool),
		Register:         make(chan *Client),
		Unregister:       make(chan *Client),
	}
}

func (h *Hub) Run() {
	sweepTicker := time.NewTicker(15 * time.Second)
	defer sweepTicker.Stop()

	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.clients[client] = true
			if client.ClientType == "dashboard" {
				h.dashboardClients[client] = true
				go h.sendInitialDashboardState(client)
			}
			h.mu.Unlock()

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)

				if client.ClientType == "dashboard" {
					delete(h.dashboardClients, client)
				} else if client.DisplayUUID != "" {
					delete(h.displayClients, client.DisplayUUID)
					_ = h.Store.MarkOffline(client.DisplayUUID)

					go h.BroadcastToDashboards(models.WSMessage{
						Type: "DISPLAY_STATUS_CHANGE",
						Data: map[string]string{
							"uuid":   client.DisplayUUID,
							"status": "offline",
						},
					})
					h.Store.Log("info", "server", client.DisplayUUID, "Display disconnected", "")
				}
			}
			h.mu.Unlock()

		case <-sweepTicker.C:
			// Sweep displays
		}
	}
}

func (h *Hub) sendInitialDashboardState(client *Client) {
	displays, _ := h.Store.GetDisplays()
	pairings, _ := h.Store.GetPendingPairings()

	msg := models.WSMessage{
		Type: "INIT_STATE",
		Data: map[string]interface{}{
			"displays":        displays,
			"pendingPairings": pairings,
			"serverTime":      time.Now().Format(time.RFC3339),
		},
	}
	bytes, _ := json.Marshal(msg)
	select {
	case client.Send <- bytes:
	default:
	}
}

func (h *Hub) HandleMessage(client *Client, msg *models.WSMessage) {
	switch msg.Type {
	case "HANDSHAKE":
		h.handleHandshake(client, msg)

	case "REQUEST_PAIRING":
		h.initiatePairing(client, msg.UUID, msg.ClientName)

	case "HEARTBEAT":
		h.handleHeartbeat(client, msg)

	case "SYNC_ACK":
		h.Store.Log("info", "display", msg.UUID, "Playlist synchronized successfully", "")

	case "LOG_EVENT":
		h.Store.Log(msg.Status, "display", msg.UUID, msg.Message, "")
	}
}

func (h *Hub) handleHandshake(client *Client, msg *models.WSMessage) {
	if msg.UUID == "" {
		return
	}

	client.DisplayUUID = msg.UUID
	h.mu.Lock()
	h.displayClients[msg.UUID] = client
	h.mu.Unlock()

	disp, err := h.Store.GetDisplayByUUID(msg.UUID)
	if err == nil && disp != nil && disp.Token != "" && (disp.Token == msg.Token || msg.Token == "") {
		disp.IPAddress = client.IPAddress
		disp.Status = "online"
		if msg.Orientation != "" {
			disp.Orientation = msg.Orientation
		}
		if msg.Resolution != "" {
			disp.Resolution = msg.Resolution
		}
		_ = h.Store.SaveDisplay(disp)

		ack := models.WSMessage{
			Type:        "HANDSHAKE_ACK",
			Status:      "AUTHENTICATED",
			DisplayID:   disp.ID,
			DisplayName: disp.Name,
			Orientation: disp.Orientation,
			ServerTime:  time.Now().Format(time.RFC3339),
		}
		bytes, _ := json.Marshal(ack)
		client.Send <- bytes

		// Sync current active playlist
		h.SyncDisplay(disp.UUID)

		h.BroadcastToDashboards(models.WSMessage{
			Type: "DISPLAY_STATUS_CHANGE",
			Data: map[string]string{
				"uuid":   disp.UUID,
				"status": "online",
				"name":   disp.Name,
				"ip":     client.IPAddress,
			},
		})
		h.Store.Log("info", "display", disp.UUID, "Display authenticated and connected: "+disp.Name, "")
		return
	}

	// Device unpaired -> Initiate pairing flow
	h.initiatePairing(client, msg.UUID, msg.Name)
}

func (h *Hub) initiatePairing(client *Client, uuid, clientName string) {
	code := generatePairingPIN()
	token := generateToken()
	expiresAt := time.Now().Add(24 * time.Hour)

	name := clientName
	if name == "" {
		name = "Display Node"
	}

	req := &models.PairingRequest{
		PairingCode: code,
		UUID:        uuid,
		ClientName:  name,
		IPAddress:   client.IPAddress,
		Token:       token,
		Status:      "pending",
		ExpiresAt:   expiresAt,
	}
	_ = h.Store.CreatePairingRequest(req)

	ack := models.WSMessage{
		Type:        "HANDSHAKE_ACK",
		Status:      "UNPAIRED",
		PairingCode: code,
		Message:     "Device requires approval from the web orchestrator",
	}
	bytes, _ := json.Marshal(ack)
	client.Send <- bytes

	h.BroadcastToDashboards(models.WSMessage{
		Type: "PAIRING_REQUEST_NEW",
		Data: map[string]interface{}{
			"uuid":        uuid,
			"clientName":  name,
			"pairingCode": code,
			"ip":          client.IPAddress,
			"createdAt":   time.Now().Format(time.RFC3339),
		},
	})
	h.Store.Log("info", "server", uuid, "New display pairing request generated with PIN: "+code, "")
}

func (h *Hub) handleHeartbeat(client *Client, msg *models.WSMessage) {
	if client.DisplayUUID == "" {
		return
	}

	metricsBytes, _ := json.Marshal(msg.Metrics)
	_ = h.Store.UpdateHeartbeat(client.DisplayUUID, string(metricsBytes))

	h.BroadcastToDashboards(models.WSMessage{
		Type: "DISPLAY_HEARTBEAT",
		Data: map[string]interface{}{
			"uuid":           client.DisplayUUID,
			"metrics":        msg.Metrics,
			"currentPlaying": msg.CurrentPlaying,
			"uptimeSeconds":  msg.UptimeSeconds,
			"timestamp":      time.Now().Format(time.RFC3339),
		},
	})
}

func (h *Hub) BroadcastToDashboards(msg models.WSMessage) {
	bytes, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.dashboardClients {
		select {
		case client.Send <- bytes:
		default:
		}
	}
}

func (h *Hub) SendToDisplay(uuid string, msg models.WSMessage) bool {
	h.mu.RLock()
	client, exists := h.displayClients[uuid]
	h.mu.RUnlock()

	if !exists {
		return false
	}

	bytes, err := json.Marshal(msg)
	if err != nil {
		return false
	}

	select {
	case client.Send <- bytes:
		return true
	default:
		return false
	}
}

func (h *Hub) SyncDisplay(uuid string) {
	pl, err := h.Store.ResolvePlaylist(uuid)
	if err != nil || pl == nil {
		pl = &models.Playlist{ID: 0, Name: "Empty Loop", LoopEnabled: true}
	}

	h.SendToDisplay(uuid, models.WSMessage{
		Type:       "SYNC_PLAYLIST",
		Playlist:   pl,
		ServerTime: time.Now().Format(time.RFC3339),
	})
}

func (h *Hub) SyncAll() {
	h.mu.RLock()
	uuids := make([]string, 0, len(h.displayClients))
	for uuid := range h.displayClients {
		uuids = append(uuids, uuid)
	}
	h.mu.RUnlock()

	for _, u := range uuids {
		h.SyncDisplay(u)
	}
}

func (h *Hub) PushURL(uuid, url string, durSec int) bool {
	return h.SendToDisplay(uuid, models.WSMessage{
		Type:            "PUSH_URL",
		URL:             url,
		DurationSeconds: durSec,
	})
}

func (h *Hub) ForceReload(uuid string) bool {
	return h.SendToDisplay(uuid, models.WSMessage{Type: "FORCE_RELOAD"})
}

func (h *Hub) Blank(uuid string, state bool) bool {
	return h.SendToDisplay(uuid, models.WSMessage{Type: "BLANK_SCREEN", State: state})
}

func (h *Hub) BroadcastEmergency(title, message string, durSec int) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	msg := models.WSMessage{
		Type:            "EMERGENCY_ALERT",
		Title:           title,
		Message:         message,
		DurationSeconds: durSec,
	}
	bytes, _ := json.Marshal(msg)

	count := 0
	for _, client := range h.displayClients {
		select {
		case client.Send <- bytes:
			count++
		default:
		}
	}
	return count
}

func generatePairingPIN() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	result := make([]byte, 7)
	for i := 0; i < 7; i++ {
		if i == 3 {
			result[i] = '-'
			continue
		}
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		result[i] = chars[n.Int64()]
	}
	return string(result)
}

func generateToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
