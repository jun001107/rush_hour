package main

import (
	"fmt"
	"log"

	"github.com/fogleman/rush"
)

func process(number int, desc []string) {
	board, err := rush.NewBoard(desc)
	if err != nil {
		log.Fatal(err)
	}
	solution := board.Solve()
	fmt.Println(solution)
}

func main() {
	for i, desc := range rush.FortyLevels {
		process(i+1, desc)
	}
}
