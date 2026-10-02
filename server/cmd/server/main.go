package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"display-orchestrator/server/internal/api"
	"display-orchestrator/server/internal/storage"
	"display-orchestrator/server/internal/ws"
)

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func main() {
	port := getEnv("PORT", "8080")
	host := getEnv("HOST", "0.0.0.0")
	dataDir := getEnv("DATA_DIR", "./data")
	mediaDir := getEnv("MEDIA_DIR", "./media")
	webDir := getEnv("WEB_DIR", "./web")

	dbPath := filepath.Join(dataDir, "signage.db")

	log.Printf("========================================================")
	log.Printf("🚀 Starting Digital Signage Orchestrator Server (Go)")
	log.Printf("📁 Database path: %s", dbPath)
	log.Printf("📁 Media storage: %s", mediaDir)
	log.Printf("🌐 Port: %s", port)
	log.Printf("========================================================")

	// 1. Initialize SQLite Database
	store, err := storage.InitDB(dbPath)
	if err != nil {
		log.Fatalf("Fatal: Database init failed: %v", err)
	}
	defer store.Close()

	// 2. Initialize WebSocket Hub
	hub := ws.NewHub(store)
	go hub.Run()

	// 3. Initialize API Handlers
	apiHandler := api.NewAPI(store, hub, mediaDir, webDir)

	mux := http.NewServeMux()

	// API Routes
	mux.HandleFunc("/api/health", apiHandler.HandleHealth)
	mux.HandleFunc("/api/displays", apiHandler.HandleDisplays)
	mux.HandleFunc("/api/displays/register", apiHandler.HandleRegister)
	mux.HandleFunc("/api/displays/pairing/", apiHandler.HandlePairing)
	mux.HandleFunc("/api/displays/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/displays" || r.URL.Path == "/api/displays/" {
			apiHandler.HandleDisplays(w, r)
			return
		}
		apiHandler.HandleDisplayCommand(w, r)
	})
	mux.HandleFunc("/api/media", apiHandler.HandleMedia)
	mux.HandleFunc("/api/media/", apiHandler.HandleMedia)
	mux.HandleFunc("/api/playlists", apiHandler.HandlePlaylists)
	mux.HandleFunc("/api/playlists/", apiHandler.HandlePlaylists)
	mux.HandleFunc("/api/system/", apiHandler.HandleSystem)
	mux.HandleFunc("/ws", apiHandler.HandleWebSocket)

	// Static Dashboard & Media file serving
	mux.Handle("/media/", http.StripPrefix("/media/", http.FileServer(http.Dir(mediaDir))))

	// Web Dashboard Handler
	fileServer := http.FileServer(http.Dir(webDir))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && !fileExists(filepath.Join(webDir, r.URL.Path)) {
			// SPA fallback to index.html
			http.ServeFile(w, r, filepath.Join(webDir, "index.html"))
			return
		}
		fileServer.ServeHTTP(w, r)
	})

	// Global CORS and Header Middleware
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		mux.ServeHTTP(w, r)
	})

	srv := &http.Server{
		Addr:         fmt.Sprintf("%s:%s", host, port),
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Server runner
	go func() {
		log.Printf("✓ Server listening on http://%s:%s", host, port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Graceful shutdown on SIGTERM / SIGINT
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Println("Server exited cleanly.")
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
