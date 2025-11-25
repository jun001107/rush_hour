package main

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	rush "github.com/fogleman/rush"
)

type server struct {
	puzzles     []rush.SurveyPuzzle
	resultsPath string
	mu          sync.Mutex
}

type resultPayload struct {
	ParticipantEmail string `json:"participantEmail"`
	PuzzleID         string `json:"puzzleId"`
	MaxMoves         int    `json:"maxMoves"`
	PlayerMoves      int    `json:"playerMoves"`
	TimeTakenSeconds int    `json:"timeTakenSeconds"`
}

func main() {
	puzzles := rush.SurveyPuzzleSet()
	if len(puzzles) == 0 {
		log.Fatal("no survey puzzles available after filtering")
	}
	s := &server{
		puzzles:     puzzles,
		resultsPath: filepath.Join("data", "results.csv"),
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.Dir("web")))
	mux.HandleFunc("/api/puzzles", s.handlePuzzles)
	mux.HandleFunc("/api/result", s.handleResult)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := fmt.Sprintf("0.0.0.0:%s", port)
	log.Printf("survey server listening on %s", addr)
	log.Printf("serving %d survey puzzles", len(puzzles))
	log.Fatal(http.ListenAndServe(addr, mux))
}

func (s *server) handlePuzzles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(s.puzzles); err != nil {
		http.Error(w, "failed to encode puzzles", http.StatusInternalServerError)
	}
}

func (s *server) handleResult(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	defer r.Body.Close()

	var payload resultPayload
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&payload); err != nil {
		http.Error(w, "invalid JSON payload", http.StatusBadRequest)
		return
	}

	if err := s.validatePayload(payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := s.appendResult(payload); err != nil {
		log.Printf("failed to write result: %v", err)
		http.Error(w, "failed to save result", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

func (s *server) validatePayload(p resultPayload) error {
	if p.ParticipantEmail == "" {
		return errors.New("participantEmail is required")
	}
	if !strings.Contains(p.ParticipantEmail, "@") || !strings.Contains(p.ParticipantEmail, ".") {
		return errors.New("participantEmail appears invalid")
	}
	if p.PuzzleID == "" {
		return errors.New("puzzleId is required")
	}
	puzzle, ok := rush.SurveyPuzzleByID(p.PuzzleID)
	if !ok {
		return fmt.Errorf("unknown puzzleId %q", p.PuzzleID)
	}
	if p.MaxMoves <= 0 {
		return errors.New("maxMoves must be > 0")
	}
	if p.MaxMoves != puzzle.MinimalMoves {
		return fmt.Errorf("maxMoves must equal puzzle minimal moves (%d)", puzzle.MinimalMoves)
	}
	if p.PlayerMoves <= 0 {
		return errors.New("playerMoves must be > 0")
	}
	if p.TimeTakenSeconds < 0 {
		return errors.New("timeTakenSeconds must be >= 0")
	}
	return nil
}

func (s *server) appendResult(p resultPayload) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	puzzle, _ := rush.SurveyPuzzleByID(p.PuzzleID)

	if err := os.MkdirAll(filepath.Dir(s.resultsPath), 0755); err != nil {
		return err
	}

	needHeader := true
	if info, err := os.Stat(s.resultsPath); err == nil && info.Size() > 0 {
		if f, err := os.Open(s.resultsPath); err == nil {
			reader := bufio.NewReader(f)
			line, err := reader.ReadString('\n')
			if err == nil || err == io.EOF {
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "participant_email,") {
					needHeader = false
				}
			}
			f.Close()
		}
	}

	f, err := os.OpenFile(s.resultsPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	writer := csv.NewWriter(f)
	if needHeader {
		writer.Write([]string{
			"participant_email",
			"puzzle_id",
			"max_moves",
			"player_moves",
			"time_taken_seconds",
		})
	}

	writer.Write([]string{
		p.ParticipantEmail,
		p.PuzzleID,
		strconv.Itoa(puzzle.MinimalMoves),
		strconv.Itoa(p.PlayerMoves),
		strconv.Itoa(p.TimeTakenSeconds),
	})
	writer.Flush()
	return writer.Error()
}
