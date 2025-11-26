package rush

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// SurveyPuzzle represents a puzzle that can be served to the frontend along
// with the minimal number of moves needed to solve it.
type SurveyPuzzle struct {
	ID           string `json:"id"`
	Desc         string `json:"desc"`
	MinimalMoves int    `json:"minimalMoves"`
}

var (
	surveyPuzzlesOnce sync.Once
	surveyPuzzles     []SurveyPuzzle
	surveyPuzzleMap   map[string]SurveyPuzzle
)

// SurveyPuzzleSet returns the filtered list of puzzles for the survey
// experiment. The list is computed once at startup.
func SurveyPuzzleSet() []SurveyPuzzle {
	surveyPuzzlesOnce.Do(func() {
		surveyPuzzles = computeSurveyPuzzles()
		surveyPuzzleMap = make(map[string]SurveyPuzzle, len(surveyPuzzles))
		for _, p := range surveyPuzzles {
			surveyPuzzleMap[p.ID] = p
		}
	})
	return surveyPuzzles
}

// SurveyPuzzleByID looks up a survey puzzle by its identifier.
func SurveyPuzzleByID(id string) (SurveyPuzzle, bool) {
	SurveyPuzzleSet()
	p, ok := surveyPuzzleMap[id]
	return p, ok
}

func computeSurveyPuzzles() []SurveyPuzzle {
	// Attempt to load from dataset file if present.
	if puzzles, err := loadDatasetPuzzles(); err == nil && len(puzzles) > 0 {
		return puzzles
	}

	var puzzles []SurveyPuzzle
	for i, rows := range FortyLevels {
		board, err := NewBoard(rows)
		if err != nil {
			continue
		}
		// skip puzzles with walls or other blocking pieces
		if len(board.Walls) > 0 {
			continue
		}
		solution := board.Solve()
		if !solution.Solvable {
			continue
		}
		// minimal solution length between 2 and 20 moves (inclusive)
		if solution.NumMoves < 2 || solution.NumMoves > 20 {
			continue
		}
		id := fmt.Sprintf("forty-%02d", i+1)
		puzzles = append(puzzles, SurveyPuzzle{
			ID:           id,
			Desc:         rowsToDesc(rows),
			MinimalMoves: solution.NumMoves,
		})
	}
	// augment with a few easy puzzles to ensure coverage for low levels
	manual := []struct {
		id    string
		level int
		rows  []string
	}{
		{
			id:    "manual-02",
			level: 2,
			rows: []string{
				"..B...",
				"..B...",
				"AAB..C",
				".....C",
				"......",
				"......",
			},
		},
		{
			id:    "manual-03",
			level: 3,
			rows: []string{
				"..B...",
				"..B..C",
				"AAB..C",
				"......",
				"......",
				"......",
			},
		},
		{
			id:    "manual-04",
			level: 4,
			rows: []string{
				"..B...",
				"..B..C",
				"AAB..C",
				"..D...",
				"..D...",
				"..D...",
			},
		},
		{
			id:    "manual-05",
			level: 5,
			rows: []string{
				"..B...",
				"..B..C",
				"AAB..C",
				".DD...",
				"......",
				"......",
			},
		},
		{
			id:    "manual-06",
			level: 6,
			rows: []string{
				"..B...",
				"..B..C",
				"AAB..C",
				"DD....",
				"......",
				"......",
			},
		},
		{
			id:    "manual-07",
			level: 7,
			rows: []string{
				"..B...",
				"..B..C",
				"AAB..C",
				"DD.E..",
				"...E..",
				"...E..",
			},
		},
		{
			id:    "manual-08",
			level: 8,
			rows: []string{
				"..B...",
				"..B..C",
				"AAB..C",
				"DDE...",
				"...E..",
				"...E..",
			},
		},
	}
	for _, m := range manual {
		board, err := NewBoard(m.rows)
		if err != nil {
			continue
		}
		if len(board.Walls) > 0 {
			continue
		}
		sol := board.Solve()
		if !sol.Solvable {
			continue
		}
		if sol.NumMoves < 2 || sol.NumMoves > 20 {
			continue
		}
		puzzles = append(puzzles, SurveyPuzzle{
			ID:           m.id,
			Desc:         rowsToDesc(m.rows),
			MinimalMoves: m.level,
		})
	}
	return puzzles
}

func rowsToDesc(rows []string) string {
	var b strings.Builder
	for _, row := range rows {
		b.WriteString(row)
	}
	return b.String()
}

// dataset support

type datasetPuzzle struct {
	Name        json.RawMessage `json:"name"`
	Exit        []int           `json:"exit"`
	MinNumMoves int             `json:"min_num_moves"`
	Board       [][]*string     `json:"board"`
}

func (dp datasetPuzzle) nameString() string {
	var s string
	if err := json.Unmarshal(dp.Name, &s); err == nil {
		return s
	}
	var i int
	if err := json.Unmarshal(dp.Name, &i); err == nil {
		return fmt.Sprintf("%d", i)
	}
	return string(dp.Name)
}

func loadDatasetPuzzles() ([]SurveyPuzzle, error) {
	path := filepath.Join("dataset", "rush_no_wall_1000_balanced.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var raw []datasetPuzzle
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	rand.Seed(time.Now().UnixNano())

	byLevel := make(map[int][]SurveyPuzzle)
	for _, dp := range raw {
		if dp.MinNumMoves < 2 || dp.MinNumMoves > 20 {
			continue
		}
		desc, ok := datasetBoardToDesc(dp.Board)
		if !ok {
			continue
		}
		sp := SurveyPuzzle{
			ID:           fmt.Sprintf("dataset-%s", dp.nameString()),
			Desc:         desc,
			MinimalMoves: dp.MinNumMoves,
		}
		byLevel[dp.MinNumMoves] = append(byLevel[dp.MinNumMoves], sp)
	}

	var selected []SurveyPuzzle
	for level := 2; level <= 20; level++ {
		pool := byLevel[level]
		if len(pool) == 0 {
			continue
		}
		sp := pool[rand.Intn(len(pool))]
		selected = append(selected, sp)
	}
	return selected, nil
}

func datasetBoardToDesc(board [][]*string) (string, bool) {
	if len(board) == 0 {
		return "", false
	}
	h := len(board)
	w := len(board[0])
	// Remap piece identifiers so the primary piece ("R") becomes "A"
	// and other pieces are sequential letters starting at "B".
	idMap := make(map[string]byte)
	next := byte('B')
	getID := func(src string) byte {
		if src == "" {
			return '.'
		}
		if c, ok := idMap[src]; ok {
			return c
		}
		if src == "R" || src == "r" {
			idMap[src] = 'A'
			return 'A'
		}
		if next > 'Z' {
			// out of letters
			return '.'
		}
		idMap[src] = next
		next++
		return idMap[src]
	}

	var sb strings.Builder
	for y := 0; y < h; y++ {
		if len(board[y]) != w {
			return "", false
		}
		for x := 0; x < w; x++ {
			cell := board[y][x]
			if cell == nil {
				sb.WriteByte('.')
			} else if len(*cell) > 0 {
				sb.WriteByte(getID((*cell)))
			} else {
				sb.WriteByte('.')
			}
		}
	}
	return sb.String(), true
}
