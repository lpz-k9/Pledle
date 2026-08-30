// script.js
//
// Vallader Wordle — core game logic.
// No on-screen keyboard: input comes straight from the physical keyboard,
// including accented characters (ü ö à è é ì ò û) and "-", each of which
// counts as exactly one tile/letter.

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

// Characters accepted as a single tile. Extend this if your real word list
// ends up using other diacritics.
const ALLOWED_CHAR = /^[a-zàèéìòöüû-]$/i;

// --- Game state -------------------------------------------------------

let solution = "";
let currentGuess = [];      // array of single characters, e.g. ["s","-","c","h","i"]
let submittedGuesses = [];  // array of { letters: [...], statuses: [...] }
let gameOver = false;

// --- DOM references -----------------------------------------------------

const boardEl = document.getElementById("board");
const messageEl = document.getElementById("message");
const newGameBtn = document.getElementById("new-game");
const helpOpenBtn = document.getElementById("help-open");
const helpOverlay = document.getElementById("help-overlay");
const helpCloseBtn = document.getElementById("help-close");
const welcomeScreen = document.getElementById("welcome-screen");
const startGameBtn = document.getElementById("start-game");

let helpOpen = false;
let welcomeOpen = true;

// --- Setup ---------------------------------------------------------------

function normalize(word) {
  // Lower-case only — deliberately does NOT strip diacritics, since
  // ü/ö/à/etc. must stay distinct from their plain-letter counterparts.
  return word.toLowerCase();
}

function pickSolution() {
  const pool = SOLUTIONS.map(normalize).filter(w => [...w].length === WORD_LENGTH);
  if (pool.length === 0) {
    throw new Error("No solutions of the correct length in SOLUTIONS.");
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function isValidGuess(word) {
  const normalized = normalize(word);
  return VALID_GUESSES.map(normalize).includes(normalized);
}

function startNewGame() {
  solution = pickSolution();
  currentGuess = [];
  submittedGuesses = [];
  gameOver = false;
  setMessage("", null);
  renderBoard();
  // Uncomment while testing to see the answer in the console:
  // console.log("Solution:", solution);
}

// --- Rendering -------------------------------------------------------------

function renderBoard() {
  boardEl.innerHTML = "";

  for (let r = 0; r < MAX_GUESSES; r++) {
    const rowEl = document.createElement("div");
    rowEl.classList.add("row");

    const isSubmittedRow = r < submittedGuesses.length;
    const isCurrentRow = r === submittedGuesses.length;

    for (let c = 0; c < WORD_LENGTH; c++) {
      const tileEl = document.createElement("div");
      tileEl.classList.add("tile");

      if (isSubmittedRow) {
        const { letters, statuses, revealed } = submittedGuesses[r];
        tileEl.textContent = letters[c];
        tileEl.classList.add("filled");
        // Only show the correct/present/absent colour once this row's flip
        // animation has actually revealed it — see flipLastRow(). Until
        // then it should look like a freshly-typed, uncoloured tile.
        if (revealed) {
          tileEl.classList.add(statuses[c]);
        }
      } else if (isCurrentRow && currentGuess[c] !== undefined) {
        tileEl.textContent = currentGuess[c];
        tileEl.classList.add("filled");
      }

      rowEl.appendChild(tileEl);
    }

    boardEl.appendChild(rowEl);
  }
}

function shakeCurrentRow() {
  const rowEl = boardEl.children[submittedGuesses.length];
  if (!rowEl) return;
  [...rowEl.children].forEach(tile => {
    tile.classList.add("shake");
    tile.addEventListener("animationend", () => tile.classList.remove("shake"), { once: true });
  });
}

function setMessage(text, kind) {
  messageEl.textContent = text;
  messageEl.className = "message" + (kind ? " " + kind : "");
}

// --- Guess evaluation --------------------------------------------------

// Returns an array of "correct" | "present" | "absent", one per letter,
// using the standard two-pass Wordle algorithm so repeated letters are
// scored correctly.
function evaluateGuess(guessLetters, solutionWord) {
  const solutionLetters = [...solutionWord];
  const statuses = new Array(WORD_LENGTH).fill("absent");
  const remaining = [...solutionLetters];

  // Pass 1: exact matches
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessLetters[i] === solutionLetters[i]) {
      statuses[i] = "correct";
      remaining[i] = null; // consume
    }
  }

  // Pass 2: present-but-wrong-position matches
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (statuses[i] === "correct") continue;
    const idx = remaining.indexOf(guessLetters[i]);
    if (idx !== -1) {
      statuses[i] = "present";
      remaining[idx] = null; // consume
    }
  }

  return statuses;
}

// --- Input handling ------------------------------------------------------

function handleKey(key) {
  if (gameOver) return;

  if (key === "Enter") {
    submitGuess();
    return;
  }

  if (key === "Backspace") {
    currentGuess.pop();
    renderBoard();
    return;
  }

  if (ALLOWED_CHAR.test(key) && key.length === 1) {
    if (currentGuess.length < WORD_LENGTH) {
      currentGuess.push(key.toLowerCase());
      renderBoard();
      popLastTile();
    }
  }
}

function popLastTile() {
  const rowEl = boardEl.children[submittedGuesses.length];
  const tileEl = rowEl?.children[currentGuess.length - 1];
  if (!tileEl) return;
  tileEl.classList.add("pop");
  tileEl.addEventListener("animationend", () => tileEl.classList.remove("pop"), { once: true });
}

function submitGuess() {
  if (currentGuess.length < WORD_LENGTH) {
    setMessage("Memma pac custabs", "error");
    shakeCurrentRow();
    return;
  }

  const guessWord = currentGuess.join("");

  if (!isValidGuess(guessWord)) {
    setMessage("Pled nun inclet", "error");
    shakeCurrentRow();
    return;
  }

  const statuses = evaluateGuess(currentGuess, solution);
  // `revealed` starts false so renderBoard() draws this row uncoloured;
  // flipLastRow() flips it to true, tile by tile, mid-animation.
  submittedGuesses.push({ letters: [...currentGuess], statuses, revealed: false });

  const won = statuses.every(s => s === "correct");
  currentGuess = [];
  renderBoard();

  // Show the win/lose message only once the tiles have actually finished
  // revealing their colours, instead of popping up mid-flip.
  flipLastRow(() => {
    if (won) {
      gameOver = true;
      setMessage("Bain fat!", "success");
    } else if (submittedGuesses.length === MAX_GUESSES) {
      gameOver = true;
      setMessage(`Il pled d'eira "${solution.toUpperCase()}"`, "error");
    } else {
      setMessage("", null);
    }
  });
}

// Must match the animation-duration of .tile.flip in style.css.
const FLIP_DURATION_MS = 500;
const FLIP_STAGGER_MS = 80;

function flipLastRow(onDone) {
  const rowIndex = submittedGuesses.length - 1;
  const rowEl = boardEl.children[rowIndex];
  const { statuses } = submittedGuesses[rowIndex];
  if (!rowEl) return;

  const tiles = [...rowEl.children];
  tiles.forEach((tile, i) => {
    const startDelay = i * FLIP_STAGGER_MS;

    // Start this tile's own flip.
    setTimeout(() => tile.classList.add("flip"), startDelay);

    // Reveal the colour at the halfway point of ITS flip, i.e. the moment
    // the tile is edge-on and effectively invisible — matching real Wordle,
    // where you never see the colour change while the face is visible.
    setTimeout(() => {
      tile.classList.add(statuses[i]);
    }, startDelay + FLIP_DURATION_MS / 2);
  });

  // Whole row is done once the last (most-delayed) tile finishes flipping.
  const totalTime = (tiles.length - 1) * FLIP_STAGGER_MS + FLIP_DURATION_MS;
  setTimeout(() => {
    submittedGuesses[rowIndex].revealed = true;
    if (onDone) onDone();
  }, totalTime);
}

// --- How-to-play modal ---------------------------------------------------

function openHelp() {
  helpOpen = true;
  helpOverlay.classList.remove("hidden");
}

function closeHelp() {
  helpOpen = false;
  helpOverlay.classList.add("hidden");
}

helpOpenBtn.addEventListener("click", openHelp);
helpCloseBtn.addEventListener("click", closeHelp);

// Clicking the dimmed backdrop (but not the modal box itself) also closes it.
helpOverlay.addEventListener("click", (e) => {
  if (e.target === helpOverlay) closeHelp();
});

// --- Welcome screen -----------------------------------------------------

function closeWelcome() {
  welcomeOpen = false;
  welcomeScreen.classList.add("hidden");
}

startGameBtn.addEventListener("click", closeWelcome);

// --- Event wiring ----------------------------------------------------------

document.addEventListener("keydown", (e) => {
  if (welcomeOpen) {
    // Let Enter (or Space, since the start button may be focused) dismiss
    // the welcome screen; ignore everything else so no keystrokes leak
    // into the game underneath.
    if (e.key === "Enter" || e.key === " ") closeWelcome();
    return;
  }
  if (helpOpen) {
    // While the how-to-play modal is open, keystrokes shouldn't leak
    // through to the game board — only let Escape close the modal.
    if (e.key === "Escape") closeHelp();
    return;
  }
  // Ignore modifier combos (Ctrl/Cmd+...) so browser shortcuts still work.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  handleKey(e.key);
});

newGameBtn.addEventListener("click", startNewGame);

// --- Go ----------------------------------------------------------------

startNewGame();
