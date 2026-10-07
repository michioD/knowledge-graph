package main

import (
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"

	_ "github.com/mattn/go-sqlite3"
)

type GraphState struct {
	Nodes json.RawMessage `json:"nodes"`
	Edges json.RawMessage `json:"edges"`
}

var db *sql.DB

func main() {
	var err error
	db, err = sql.Open("sqlite3", "./graph.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Create table
	createTableSQL := `
	CREATE TABLE IF NOT EXISTS graph_state (
		id INTEGER PRIMARY KEY,
		nodes TEXT,
		edges TEXT
	);`
	_, err = db.Exec(createTableSQL)
	if err != nil {
		log.Fatal(err)
	}

	// Insert default row if not exists
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM graph_state WHERE id = 1").Scan(&count)
	if err == nil && count == 0 {
		_, _ = db.Exec("INSERT INTO graph_state (id, nodes, edges) VALUES (1, '[]', '[]')")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/graph", handleGraph)

	// Apply CORS
	handler := corsMiddleware(mux)

	log.Println("Backend server running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", handler))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*") // Allow any origin for development
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func handleGraph(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		var nodes, edges string
		err := db.QueryRow("SELECT nodes, edges FROM graph_state WHERE id = 1").Scan(&nodes, &edges)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"nodes":` + nodes + `,"edges":` + edges + `}`))
		return
	}

	if r.Method == http.MethodPost {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Failed to read body", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		var state GraphState
		if err := json.Unmarshal(body, &state); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		_, err = db.Exec("UPDATE graph_state SET nodes = ?, edges = ? WHERE id = 1", string(state.Nodes), string(state.Edges))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}
