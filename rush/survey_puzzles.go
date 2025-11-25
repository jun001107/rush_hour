package rush

import (
	"fmt"
	"strings"
	"sync"
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
	return puzzles
}

func rowsToDesc(rows []string) string {
	var b strings.Builder
	for _, row := range rows {
		b.WriteString(row)
	}
	return b.String()
}
