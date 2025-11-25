// Constants

var CanvasPadding = 24;

// Piece

function Piece(position, size, stride) {
    this.position = position;
    this.size = size;
    this.stride = stride;
    this.fixed = size === 1;
}

Piece.prototype.move = function(steps) {
    this.position += this.stride * steps;
};

Piece.prototype.draw = function(p5, boardSize, offset) {
    offset = offset || 0;
    var i0 = this.position;
    var i1 = i0 + this.stride * (this.size - 1);
    var x0 = Math.floor(i0 % boardSize);
    var y0 = Math.floor(i0 / boardSize);
    var x1 = Math.floor(i1 % boardSize);
    var y1 = Math.floor(i1 / boardSize);
    var p = 0.1;
    var x = x0 + p;
    var y = y0 + p;
    var w = x1 - x0 + 1 - p * 2;
    var h = y1 - y0 + 1 - p * 2;
    if (this.stride === 1) {
        x += offset;
    } else {
        y += offset;
    }
    p5.rect(x, y, w, h, 0.1);
};

Piece.prototype.pickAxis = function(point) {
    if (this.stride === 1) {
        return point.x;
    } else {
        return point.y;
    }
};

// Move

function Move(piece, steps) {
    this.piece = piece;
    this.steps = steps;
}

// Board

function Board(desc) {
    this.pieces = [];

    // determine board size
    this.size = Math.floor(Math.sqrt(desc.length));
    if (this.size === 0) {
        throw "board cannot be empty";
    }

    this.size2 = this.size * this.size;
    if (this.size2 !== desc.length) {
        throw "boards must be square";
    }

    // parse string
    var positions = new Map();
    for (var i = 0; i < desc.length; i++) {
        var label = desc.charAt(i);
        if (!positions.has(label)) {
            positions.set(label, []);
        }
        positions.get(label).push(i);
    }

    // sort piece labels
    var labels = Array.from(positions.keys());
    labels.sort();

    // add pieces
    for (var label of labels) {
        if (label === '.' || label === 'o') {
            continue;
        }
        if (label === 'x') {
            continue;
        }
        var ps = positions.get(label);
        if (ps.length < 2) {
            throw "piece size must be >= 2";
        }
        var stride = ps[1] - ps[0];
        if (stride !== 1 && stride !== this.size) {
            throw "invalid piece shape";
        }
        for (var j = 2; j < ps.length; j++) {
            if (ps[j] - ps[j - 1] !== stride) {
                throw "invalid piece shape";
            }
        }
        var piece = new Piece(ps[0], ps.length, stride);
        this.addPiece(piece);
    }

    // add walls
    if (positions.has('x')) {
        var walls = positions.get('x');
        for (var p of walls) {
            var wall = new Piece(p, 1, 1);
            this.addPiece(wall);
        }
    }

    // compute some stuff
    this.primaryRow = 0;
    if (this.pieces.length !== 0) {
        this.primaryRow = Math.floor(this.pieces[0].position / this.size);
    }
}

Board.prototype.addPiece = function(piece) {
    this.pieces.push(piece);
};

Board.prototype.doMove = function(move) {
    this.pieces[move.piece].move(move.steps);
};

Board.prototype.undoMove = function(move) {
    this.pieces[move.piece].move(-move.steps);
};

Board.prototype.isSolved = function() {
    if (this.pieces.length === 0) {
        return false;
    }
    var piece = this.pieces[0];
    var x = Math.floor(piece.position % this.size);
    return x + piece.size === this.size;
};

Board.prototype.pieceAt = function(index) {
    for (var i = 0; i < this.pieces.length; i++) {
        var piece = this.pieces[i];
        var p = piece.position;
        for (var j = 0; j < piece.size; j++) {
            if (p === index) {
                return i;
            }
            p += piece.stride;
        }
    }
    return -1;
};

Board.prototype.isOccupied = function(index) {
    return this.pieceAt(index) >= 0;
};

Board.prototype.moves = function() {
    var moves = [];
    var size = this.size;
    for (var i = 0; i < this.pieces.length; i++) {
        var piece = this.pieces[i];
        if (piece.fixed) {
            continue;
        }
        var reverseSteps;
        var forwardSteps;
        if (piece.stride === 1) {
            var x = Math.floor(piece.position % size);
            reverseSteps = -x;
            forwardSteps = size - piece.size - x;
        } else {
            var y = Math.floor(piece.position / size);
            reverseSteps = -y;
            forwardSteps = size - piece.size - y;
        }
        var idx = piece.position - piece.stride;
        for (var steps = -1; steps >= reverseSteps; steps--) {
            if (this.isOccupied(idx)) {
                break;
            }
            moves.push(new Move(i, steps));
            idx -= piece.stride;
        }
        idx = piece.position + piece.size * piece.stride;
        for (var f = 1; f <= forwardSteps; f++) {
            if (this.isOccupied(idx)) {
                break;
            }
            moves.push(new Move(i, f));
            idx += piece.stride;
        }
    }
    return moves;
};

// View

function View() {
    this.board = new Board("IBBxooIooLDDJAALooJoKEEMFFKooMGGHHHM");
    this.movesRequired = 60;
    this.dragPiece = -1;
    this.dragAnchor = null;
    this.dragDelta = null;
    this.dragMin = 0;
    this.dragMax = 0;
    this.undoStack = [];
    this.solved = false;

    this.onSolved = null;
    this.onChange = null;

    this.backgroundColor = "#FFFFFF";
    this.boardColor = "#F2EACD";
    this.gridLineColor = "#222222";
    this.primaryPieceColor = "#CC3333";
    this.pieceColor = "#338899";
    this.pieceOutlineColor = "#222222";
    this.wallColor = "#222222";
    this.wallBoltColor = "#AAAAAA";
}

View.prototype.bind = function(p5) {
    this.p5 = p5;
};

View.prototype.setBoard = function(board, movesRequired) {
    this.board = board;
    this.movesRequired = movesRequired || -1;
    this.undoStack = [];
    this.solved = false;
    this.changed();
};

View.prototype.parseHash = function() {
    try {
        var hash = location.hash.substring(1);
        var i = hash.indexOf('/');
        if (i < 0) {
            var desc = hash;
            this.setBoard(new Board(desc));
        } else {
            var descHash = hash.substring(0, i);
            var movesRequired = parseInt(hash.substring(i + 1));
            this.setBoard(new Board(descHash), movesRequired);
        }
    }
    catch (e) {
        this.setBoard(new Board("IBBxooIooLDDJAALooJoKEEMFFKooMGGHHHM"), 60);
    }
};

View.prototype.computeScale = function() {
    var p5 = this.p5;
    var board = this.board;
    var xscale = (p5.width / board.size) * 0.9;
    var yscale = (p5.height / board.size) * 0.99;
    return Math.min(xscale, yscale);
};

View.prototype.canvasHeight = function() {
    var header = document.getElementById('hud');
    var footer = document.querySelector('.footer');
    var height = this.p5 ? this.p5.windowHeight : window.innerHeight;
    if (header) {
        height -= header.offsetHeight;
    }
    if (footer) {
        height -= footer.offsetHeight;
    }
    return Math.max(240, height - CanvasPadding);
};

View.prototype.mouseVector = function() {
    var p5 = this.p5;
    var board = this.board;
    var mx = p5.mouseX || p5.touchX;
    var my = p5.mouseY || p5.touchY;
    var scale = this.computeScale();
    var x = (mx - p5.width / 2) / scale + board.size / 2;
    var y = (my - p5.height / 2) / scale + board.size / 2;
    return p5.createVector(x, y);
};

View.prototype.mouseIndex = function() {
    var board = this.board;
    var p = this.mouseVector();
    var x = Math.floor(p.x);
    var y = Math.floor(p.y);
    return y * board.size + x;
};

View.prototype.mousePressed = function() {
    var board = this.board;
    this.dragAnchor = this.mouseVector();
    this.dragDelta = this.p5.createVector(0, 0);
    this.dragPiece = board.pieceAt(this.mouseIndex());
    if (this.dragPiece < 0) {
        return;
    }
    var piece = board.pieces[this.dragPiece];
    // can't move walls
    if (piece.fixed) {
        this.dragPiece = -1;
        return;
    }
    // determine max range
    this.dragMin = 0;
    this.dragMax = 0;
    var availableMoves = board.moves();
    for (var i = 0; i < availableMoves.length; i++) {
        var move = availableMoves[i];
        if (move.piece === this.dragPiece) {
            this.dragMin = Math.min(this.dragMin, move.steps);
            this.dragMax = Math.max(this.dragMax, move.steps);
        }
    }
};

View.prototype.mouseReleased = function() {
    var board = this.board;
    if (this.dragPiece < 0) {
        return;
    }
    this.dragDelta = this.p5.Vector.sub(this.mouseVector(), this.dragAnchor);
    var piece = board.pieces[this.dragPiece];
    var steps = Math.round(piece.pickAxis(this.dragDelta));
    steps = Math.min(steps, this.dragMax);
    steps = Math.max(steps, this.dragMin);
    var availableMoves = board.moves();
    for (var i = 0; i < availableMoves.length; i++) {
        var move = availableMoves[i];
        if (move.piece === this.dragPiece && move.steps === steps) {
            board.doMove(move);
            this.undoStack.push(move);
            this.changed();
            break;
        }
    }
    this.dragPiece = -1;
};

View.prototype.mouseDragged = function() {
    if (this.dragPiece < 0) {
        return;
    }
    this.dragDelta = this.p5.Vector.sub(this.mouseVector(), this.dragAnchor);
};

View.prototype.touchStarted = function() {
    this.mousePressed();
    return false;
};

View.prototype.touchEnded = function() {
    this.mouseReleased();
    return false;
};

View.prototype.touchMoved = function() {
    this.mouseDragged();
    return false;
};

View.prototype.keyPressed = function() {
    var p5 = this.p5;
    if (p5.key === 'U') {
        this.undo();
    } else if (p5.key === 'R') {
        this.reset();
    }
};

View.prototype.reset = function() {
    var board = this.board;
    while (this.undoStack.length > 0) {
        var move = this.undoStack.pop();
        board.undoMove(move);
    }
    this.changed();
};

View.prototype.undo = function() {
    var board = this.board;
    if (this.undoStack.length > 0) {
        var move = this.undoStack.pop();
        board.undoMove(move);
    }
    this.changed();
};

View.prototype.changed = function() {
    $('#numMoves').text(this.undoStack.length);
    if (this.movesRequired > 0) {
        $('#movesRequired').text('/ ' + this.movesRequired + ' max');
    } else {
        $('#movesRequired').text('');
    }
    if (this.onChange) {
        this.onChange(this.undoStack.length);
    }
    var solvedNow = this.board.isSolved();
    if (solvedNow && !this.solved && this.onSolved) {
        this.solved = true;
        this.onSolved();
    } else if (!solvedNow) {
        this.solved = false;
    }
};

View.prototype.setup = function() {
    var p5 = this.p5;
    p5.createCanvas(p5.windowWidth, this.canvasHeight());
};

View.prototype.windowResized = function() {
    var p5 = this.p5;
    p5.resizeCanvas(p5.windowWidth, this.canvasHeight());
};

View.prototype.draw = function() {
    var p5 = this.p5;
    var board = this.board;
    var size = board.size;

    p5.background(this.backgroundColor);
    p5.strokeJoin(p5.ROUND);

    var scale = this.computeScale();
    p5.resetMatrix();
    p5.translate(p5.width / 2, p5.height / 2);
    p5.scale(scale);
    p5.translate(-size / 2, -size / 2);

    // exit
    var ex = size;
    var ey = board.primaryRow + 0.5;
    var es = 0.1;
    p5.fill(this.gridLineColor);
    p5.noStroke();
    p5.beginShape();
    p5.vertex(ex, ey + es);
    p5.vertex(ex, ey - es);
    p5.vertex(ex + es, ey);
    p5.endShape(p5.CLOSE);

    // board
    p5.fill(this.boardColor);
    if (board.isSolved()) {
        if (Date.now() % 500 < 250) {
            p5.fill("#FFFFFF");
        }
    }
    p5.stroke(this.gridLineColor);
    p5.strokeWeight(0.03);
    p5.rect(0, 0, size, size, 0.03);

    // walls
    p5.noStroke();
    p5.ellipseMode(p5.RADIUS);
    for (var w = 0; w < board.pieces.length; w++) {
        var wallPiece = board.pieces[w];
        if (!wallPiece.fixed) {
            continue;
        }
        var wx = Math.floor(wallPiece.position % size);
        var wy = Math.floor(wallPiece.position / size);
        p5.fill(this.wallColor);
        p5.rect(wx, wy, 1, 1);
        var p = 0.15;
        var r = 0.04;
        p5.fill(this.wallBoltColor);
        p5.ellipse(wx + p, wy + p, r);
        p5.ellipse(wx + 1 - p, wy + p, r);
        p5.ellipse(wx + p, wy + 1 - p, r);
        p5.ellipse(wx + 1 - p, wy + 1 - p, r);
    }

    // grid lines
    p5.stroke(this.gridLineColor);
    p5.strokeWeight(0.015);
    for (var i = 1; i < size; i++) {
        p5.line(i, 0, i, size);
        p5.line(0, i, size, i);
    }

    // pieces
    p5.stroke(this.pieceOutlineColor);
    p5.strokeWeight(0.03);
    for (var j = 0; j < board.pieces.length; j++) {
        if (j === this.dragPiece) {
            continue;
        }
        var piece = board.pieces[j];
        if (piece.fixed) {
            continue;
        }
        if (j === 0) {
            p5.fill(this.primaryPieceColor);
        } else {
            p5.fill(this.pieceColor);
        }
        piece.draw(p5, size);
    }

    // dragging
    if (this.dragPiece >= 0) {
        var draggingPiece = board.pieces[this.dragPiece];
        var offset = draggingPiece.pickAxis(this.dragDelta);
        offset = Math.min(offset, this.dragMax);
        offset = Math.max(offset, this.dragMin);
        if (this.dragPiece === 0) {
            p5.fill(this.primaryPieceColor);
        } else {
            p5.fill(this.pieceColor);
        }
        p5.stroke(this.pieceOutlineColor);
        draggingPiece.draw(p5, size, offset);
    }
};

// Helpers

function formatTimer(ms) {
    var totalSeconds = Math.floor(ms / 1000);
    var minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    var seconds = String(totalSeconds % 60).padStart(2, '0');
    return minutes + ':' + seconds;
}

function shuffle(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = array[i];
        array[i] = array[j];
        array[j] = tmp;
    }
    return array;
}

function isValidEmail(value) {
    if (!value) {
        return false;
    }
    if (value.indexOf('@') === -1 || value.indexOf('.') === -1) {
        return false;
    }
    if (/\s/.test(value)) {
        return false;
    }
    return true;
}

// Survey controller

function SurveyController(view) {
    this.view = view;
    this.puzzles = [];
    this.order = [];
    this.currentIndex = 0;
    this.currentPuzzle = null;
    this.currentMaxMoves = 0;
    this.participantEmail = '';
    this.timerStart = null;
    this.timePromptShown = false;
    this.timeLimitMs = 3 * 60 * 1000; // 3 minutes
    this.timerId = null;
    this.active = false;
    this.available = false;
    this.waitingForNext = false;

    var self = this;
    this.view.onChange = function(moveCount) {
        self.handleMoveChange(moveCount);
    };
    this.view.onSolved = function() {
        self.handleSolved();
    };
}

SurveyController.prototype.setStatus = function(message) {
    $('#startStatus').text(message);
};

SurveyController.prototype.setGameStatus = function(message) {
    $('#gameStatus').text(message || '');
};

SurveyController.prototype.restartCurrentLevel = function(message) {
    if (!this.currentPuzzle) {
        this.view.reset();
        return;
    }
    this.waitingForNext = false;
    this.stopTimer();
    this.view.reset();
    this.timePromptShown = false;
    this.startTimer();
    this.setGameStatus(message || '');
    this.updateHUD();
};

SurveyController.prototype.init = function() {
    var self = this;
    this.setStatus('Loading puzzles…');
    return this.fetchPuzzles().then(function(success) {
        if (success) {
            self.setStatus('Loaded ' + self.puzzles.length + ' puzzles. One puzzle per level (2-20) will be assigned when you start.');
            $('#startButton').prop('disabled', false);
        } else {
            self.enableClassic('No survey puzzles available. Classic mode enabled.');
        }
    }).catch(function(err) {
        console.error(err);
        self.enableClassic('Could not load survey puzzles. Classic mode enabled.');
    });
};

SurveyController.prototype.fetchPuzzles = function() {
    var self = this;
    return fetch('/api/puzzles')
        .then(function(response) {
            if (!response.ok) {
                throw new Error('failed to load puzzles');
            }
            return response.json();
        })
        .then(function(data) {
            self.puzzles = Array.isArray(data) ? data : [];
            self.available = self.puzzles.length > 0;
            return self.available;
        });
};

SurveyController.prototype.samplePuzzlesOnePerLevel = function() {
    var byLevel = {};
    for (var i = 0; i < this.puzzles.length; i++) {
        var p = this.puzzles[i];
        var level = p.minimalMoves;
        if (!byLevel[level]) {
            byLevel[level] = [];
        }
        byLevel[level].push(p);
    }
    var selected = [];
    for (var level = 2; level <= 20; level++) {
        if (byLevel[level] && byLevel[level].length > 0) {
            var pool = byLevel[level];
            var choice = pool[Math.floor(Math.random() * pool.length)];
            selected.push(choice);
        }
    }
    selected.sort(function(a, b) {
        return a.minimalMoves - b.minimalMoves;
    });
    return selected;
};

SurveyController.prototype.enableClassic = function(message) {
    this.active = false;
    this.available = false;
    this.stopTimer();
    $('#startScreen').addClass('hidden');
    $('#completeScreen').addClass('hidden');
    $('#gameScreen').removeClass('hidden');
    $('#randomButton').prop('disabled', false).removeClass('secondary');
    if (message) {
        this.setStatus(message);
    }
    this.view.parseHash();
};

SurveyController.prototype.start = function(participantEmail) {
    $('#startError').addClass('hidden').text('');
    if (!this.available) {
        this.enableClassic('Survey puzzles unavailable. Classic mode enabled.');
        return;
    }
    if (!isValidEmail(participantEmail)) {
        $('#startError').removeClass('hidden').text('Please enter a valid email address.');
        return;
    }
    this.participantEmail = participantEmail || '';
    this.order = this.samplePuzzlesOnePerLevel();
    if (this.order.length === 0) {
        this.setStatus('No puzzles available for levels 2-20.');
        $('#startButton').prop('disabled', true);
        return;
    }
    this.setStatus('Assigned ' + this.order.length + ' level(s) for this session.');
    this.currentIndex = 0;
    this.active = true;
    this.waitingForNext = false;
    $('#startScreen').addClass('hidden');
    $('#completeScreen').addClass('hidden');
    $('#gameScreen').removeClass('hidden');
    $('#randomButton').prop('disabled', true);
    this.loadCurrentPuzzle();
};

SurveyController.prototype.resetSession = function() {
    this.stopTimer();
    this.active = false;
    this.waitingForNext = false;
    this.currentPuzzle = null;
    this.order = [];
    this.currentIndex = 0;
    this.participantEmail = '';
    this.currentMaxMoves = 0;
    $('#participantEmail').val('');
    $('#startError').addClass('hidden').text('');
    this.setGameStatus('');
    $('#startButton').prop('disabled', false);
    this.updateHUD();
};

SurveyController.prototype.loadCurrentPuzzle = function() {
    if (this.currentIndex >= this.order.length) {
        this.finish();
        return;
    }
    this.currentPuzzle = this.order[this.currentIndex];
    this.currentMaxMoves = this.currentPuzzle.minimalMoves;
    this.view.setBoard(new Board(this.currentPuzzle.desc), this.currentMaxMoves);
    this.startTimer();
    this.setGameStatus('Level ' + this.currentMaxMoves + ' in progress. Max moves: ' + this.currentMaxMoves + '.');
    this.updateHUD();
};

SurveyController.prototype.startTimer = function() {
    var self = this;
    this.stopTimer();
    this.timePromptShown = false;
    this.timerStart = Date.now();
    this.updateTimerDisplay(0);
    this.timerId = setInterval(function() {
        self.updateTimerDisplay(Date.now() - self.timerStart);
    }, 200);
};

SurveyController.prototype.stopTimer = function() {
    if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
    }
};

SurveyController.prototype.updateTimerDisplay = function(elapsed) {
    $('#timerDisplay').text(formatTimer(elapsed));
    this.checkTimeLimit(elapsed);
};

SurveyController.prototype.updateHUD = function() {
    $('#participantEmailDisplay').text(this.participantEmail || '—');
    if (this.currentPuzzle) {
        $('#levelLabel').text('Level ' + this.currentPuzzle.minimalMoves);
    } else {
        $('#levelLabel').text('—');
    }
    if (this.active && this.order.length > 0) {
        $('#puzzleProgress').text('Puzzle ' + (this.currentIndex + 1) + ' of ' + this.order.length);
    } else if (this.available) {
        $('#puzzleProgress').text('Ready to start');
    } else {
        $('#puzzleProgress').text('Classic mode');
    }
};

SurveyController.prototype.handleMoveChange = function(moveCount) {
    this.updateHUD();
    // No auto-reset when exceeding max moves; player can continue.
};

SurveyController.prototype.handleSolved = function() {
    if (!this.active || this.waitingForNext || !this.currentPuzzle) {
        return;
    }
    this.waitingForNext = true;
    this.stopTimer();
    var movesUsed = this.view.undoStack.length;
    var elapsed = this.timerStart ? (Date.now() - this.timerStart) : 0;
    this.updateTimerDisplay(elapsed);
    var payload = {
        participantEmail: this.participantEmail,
        puzzleId: this.currentPuzzle.id,
        maxMoves: this.currentMaxMoves,
        playerMoves: movesUsed,
        timeTakenSeconds: Math.max(0, Math.round(elapsed / 1000)),
    };
    this.sendResult(payload);
    this.setGameStatus('Level ' + this.currentMaxMoves + ' completed in ' + payload.timeTakenSeconds + 's and ' + movesUsed + ' moves.');
    var self = this;
    setTimeout(function() {
        self.currentIndex++;
        self.waitingForNext = false;
        self.loadCurrentPuzzle();
    }, 800);
};

SurveyController.prototype.sendResult = function(payload) {
    fetch('/api/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(function(response) {
        if (!response.ok) {
            throw new Error('Bad response from server');
        }
    }).catch(function(err) {
        console.warn('Failed to send result', err);
    });
};

SurveyController.prototype.finish = function() {
    this.stopTimer();
    this.active = false;
    this.setGameStatus('');
    $('#puzzleProgress').text('Completed');
    $('#levelLabel').text('—');
    $('#gameScreen').addClass('hidden');
    $('#completeScreen').removeClass('hidden');
};

SurveyController.prototype.randomBoard = function() {
    if (this.puzzles.length > 0) {
        var idx = Math.floor(Math.random() * this.puzzles.length);
        var puzzle = this.puzzles[idx];
        this.view.setBoard(new Board(puzzle.desc), puzzle.minimalMoves);
    } else {
        this.view.parseHash();
    }
};

SurveyController.prototype.handleManualReset = function() {
    if (this.active && this.currentPuzzle) {
        this.restartCurrentLevel('Level reset. Timer restarted.');
    } else {
        this.view.reset();
    }
};

SurveyController.prototype.checkTimeLimit = function(elapsed) {
    if (!this.active || this.waitingForNext || this.timePromptShown) {
        return;
    }
    if (elapsed >= this.timeLimitMs) {
        this.timePromptShown = true;
        var proceed = confirm('You have been on this level for 3 minutes. Continue playing? Click Cancel to skip to the next level.');
        if (!proceed) {
            this.skipCurrentPuzzle('Skipped after 3 minutes.');
        } else {
            this.setGameStatus('Continuing this level after 3 minutes.');
        }
    }
};

SurveyController.prototype.skipCurrentPuzzle = function(message) {
    this.stopTimer();
    this.waitingForNext = false;
    this.setGameStatus(message || 'Skipped current level.');
    this.currentIndex++;
    if (this.currentIndex >= this.order.length) {
        this.finish();
        return;
    }
    this.loadCurrentPuzzle();
};

// Global objects

var view = new View();
var surveyController = new SurveyController(view);

var sketch = function(p) {
    p.Vector = p5.Vector;
    view.bind(p);
    p.draw = function() { view.draw(); };
    p.keyPressed = function() { view.keyPressed(); };
    p.mouseDragged = function() { view.mouseDragged(); };
    p.mousePressed = function() { view.mousePressed(); };
    p.mouseReleased = function() { view.mouseReleased(); };
    p.setup = function() { view.setup(); };
    p.touchEnded = function() { view.touchEnded(); };
    p.touchMoved = function() { view.touchMoved(); };
    p.touchStarted = function() { view.touchStarted(); };
    p.windowResized = function() { view.windowResized(); };
};

new p5(sketch, 'view');

$(function() {
    $('#startButton').prop('disabled', true);

    document.ontouchmove = function(event) {
        event.preventDefault();
    };

    window.onhashchange = function() {
        if (!surveyController.active) {
            view.parseHash();
        }
    };

    $('#resetButton').click(function() {
        surveyController.handleManualReset();
    });

    $('#undoButton').click(function() {
        view.undo();
    });

    $('#randomButton').click(function() {
        surveyController.randomBoard();
    });

    $('#startButton').click(function() {
        surveyController.start($('#participantEmail').val().trim());
    });

    $('#restartButton').click(function() {
        $('#completeScreen').addClass('hidden');
        $('#startScreen').removeClass('hidden');
        surveyController.resetSession();
    });

    surveyController.init();
});
