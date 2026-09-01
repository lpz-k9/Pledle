// connecziuns.js
//
// A Connections-style game: 16 tiles, 4 hidden categories of 4, find them
// all within 4 mistakes. Self-contained — doesn't share any state or code
// with script.js (the Pledle/Wordle game). Puzzle data (CATEGORIES) lives
// in wordscon.js, loaded before this file.

const MAX_MISTAKES = 4;
const SHAKE_MS = 300;       // must match @keyframes conn-shake's duration
const FLY_MS = 1100;        // total time a flying clone spends in transit
const CROSSFADE_MS = 450;   // duration of the fade AT THE END of the flight —
                             // the clone fading out and the solved row fading
                             // in happen together, not one after the other.
                             // Must match .conn-flying-tile's opacity
                             // transition duration AND .conn-solved-row's
                             // own opacity transition duration.

// --- DOM references ---------------------------------------------------

const messageEl = document.getElementById("message");
const solvedEl = document.getElementById("conn-solved");
const gridEl = document.getElementById("conn-grid");
const mistakeDotsEl = document.getElementById("conn-mistake-dots");
const shuffleBtn = document.getElementById("conn-shuffle");
const deselectBtn = document.getElementById("conn-deselect");
const submitBtn = document.getElementById("conn-submit");
const bottomBarEl = document.querySelector(".conn-bottom-bar");
const helpOpenBtn = document.getElementById("help-open");
const helpOverlay = document.getElementById("help-overlay");
const helpCloseBtn = document.getElementById("help-close");

const connFinishOverlay = document.getElementById("conn-finish-overlay");
const connFinishTitleEl = document.getElementById("conn-finish-title");
const connFinishSubtitleEl = document.getElementById("conn-finish-subtitle");
const connStatPlayedEl = document.getElementById("conn-stat-played");
const connStatWinPctEl = document.getElementById("conn-stat-winpct");
const connStatStreakEl = document.getElementById("conn-stat-streak");
const connStatMaxStreakEl = document.getElementById("conn-stat-maxstreak");
const connGuessSummaryEl = document.getElementById("conn-guess-summary");
const connFinishViewBtn = document.getElementById("conn-finish-view");

// --- Game state -------------------------------------------------------

let tiles = [];             // [{ word, categoryIndex }] — the still-unsolved tiles
let selected = [];           // words currently selected (max 4)
let mistakes = 0;
let solvedCategories = [];   // category indices already solved
let guessHistory = [];       // one entry per guess: [categoryIndex, x4], in
                              // the original left-to-right selection order
let mistakeDotEls = [];      // the 4 dot elements, created once and reused
                              // (so their CSS transitions can actually animate)
let gameOver = false;
let animating = false;       // true while a shake/fly sequence is playing
let helpOpen = false;

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Falls back to a timer if requestAnimationFrame isn't available for some
// reason, so the animation sequence can't silently break.
const raf = (typeof requestAnimationFrame === "function")
  ? requestAnimationFrame
  : (cb) => setTimeout(cb, 16);

function setMessage(text, kind) {
  messageEl.textContent = text;
  messageEl.className = "message" + (kind ? " " + kind : "");
}

// Scales a tile's font size down for longer words, so text stays inside
// the fixed square instead of wrapping to enough lines to force the row
// taller than a true square — which is exactly what broke the height-match
// between solved rows and tile rows once real (longer) words replaced the
// short placeholders. Not uniform on purpose — most words stay full-size.
function fitTileFontSize(word) {
  const len = word.length;
  if (len <= 6) return "0.8rem";
  if (len <= 9) return "0.7rem";
  if (len <= 12) return "0.6rem";
  if (len <= 16) return "0.5rem";
  return "0.42rem";
}

// Same idea for a solved row's category name / word list, which can also
// run long — keeps them fitting inside the row's fixed height.
function fitSolvedFontSize(text, baseRem) {
  const len = text.length;
  let scale = 1;
  if (len > 45) scale = 0.6;
  else if (len > 30) scale = 0.7;
  else if (len > 20) scale = 0.85;
  return Math.round(baseRem * scale * 1000) / 1000 + "rem";
}

// --- Setup --------------------------------------------------------------

// A tile row's height, computed from the grid's current rendered width —
// each of the 4 columns is (width - 3 gaps) / 4 wide, and every tile is
// exactly that tall too (aspect-ratio: 1). Solved rows are given this same
// height directly (see buildSolvedRow), so a solved row takes up EXACTLY
// the space a row of tiles would have — nothing to reserve or compensate
// for, since the total content height simply never changes.
function getTileRowHeight() {
  const gridWidth = gridEl.getBoundingClientRect().width;
  const gap = 8; // must match .conn-grid's own gap
  return (gridWidth - 3 * gap) / 4;
}

// Keeps every solved row's height in sync with the grid's ACTUAL current
// width, whenever that changes for any reason — not just a window resize,
// but also e.g. a vertical scrollbar appearing/disappearing as the page's
// total height changes (which changes available horizontal width too).
// Without this, a solved row's height — set once, as a fixed pixel value,
// at the moment it's created — could go stale relative to the tiles next
// to it, which stay continuously responsive via CSS aspect-ratio. That
// mismatch only shows up on whichever transition happens to cross the
// "needs a scrollbar or not" threshold — typically the very first solve,
// since the page is at its tallest right at the start.
function syncSolvedRowHeights() {
  const height = getTileRowHeight() + "px";
  solvedEl.querySelectorAll(".conn-solved-row").forEach(row => {
    row.style.height = height;
  });
}

if (typeof ResizeObserver === "function") {
  new ResizeObserver(syncSolvedRowHeights).observe(gridEl);
}

function startNewPuzzle() {
  tiles = CATEGORIES.flatMap((cat, categoryIndex) =>
    cat.words.map(word => ({ word, categoryIndex }))
  );
  tiles = shuffleArray(tiles);
  selected = [];
  mistakes = 0;
  solvedCategories = [];
  guessHistory = [];
  gameOver = false;
  animating = false;
  setMessage("", null);
  bottomBarEl.classList.remove("hidden");
  initMistakeDots();
  renderSolved();
  renderGrid();
  renderMistakes();
  renderSubmitState();
}

// --- Rendering ----------------------------------------------------------

function buildSolvedRow(categoryIndex) {
  const cat = CATEGORIES[categoryIndex];
  const row = document.createElement("div");
  row.className = "conn-solved-row";
  row.style.background = `var(--conn-${cat.difficulty})`;
  row.style.height = getTileRowHeight() + "px";

  const name = document.createElement("div");
  name.className = "conn-solved-name";
  name.textContent = cat.name;
  name.style.fontSize = fitSolvedFontSize(cat.name, 0.85);

  const wordsText = cat.words.join(", ");
  const words = document.createElement("div");
  words.className = "conn-solved-words";
  words.textContent = wordsText;
  words.style.fontSize = fitSolvedFontSize(wordsText, 0.8);

  row.appendChild(name);
  row.appendChild(words);
  return row;
}

function renderSolved() {
  solvedEl.innerHTML = "";
  solvedCategories.forEach(categoryIndex => {
    solvedEl.appendChild(buildSolvedRow(categoryIndex));
  });
  updateBoardSpacing();
}

// The gap between #conn-solved and #conn-grid should only exist when BOTH
// areas actually have content — see the comment in stylecon.css for why.
function updateBoardSpacing() {
  const hasSolved = solvedCategories.length > 0;
  const hasRemaining = tiles.length > 0;
  solvedEl.style.marginBottom = (hasSolved && hasRemaining) ? "8px" : "0px";
}

function renderGrid() {
  gridEl.innerHTML = "";
  tiles.forEach(tile => {
    const btn = document.createElement("button");
    btn.className = "conn-tile" + (selected.includes(tile.word) ? " selected" : "");
    btn.textContent = tile.word;
    btn.style.fontSize = fitTileFontSize(tile.word);
    btn.disabled = gameOver || animating;
    btn.addEventListener("click", () => toggleTile(tile.word));
    gridEl.appendChild(btn);
  });
  updateBoardSpacing();
}

// Created once (in startNewPuzzle) rather than rebuilt every render, so the
// CSS transition on background-color/transform can actually animate between
// an existing element's old and new state.
function initMistakeDots() {
  mistakeDotsEl.innerHTML = "";
  mistakeDotEls = [];
  for (let i = 0; i < MAX_MISTAKES; i++) {
    const dot = document.createElement("span");
    dot.className = "conn-mistake-dot";
    mistakeDotsEl.appendChild(dot);
    mistakeDotEls.push(dot);
  }
}

function renderMistakes() {
  mistakeDotEls.forEach((dot, i) => {
    const isUsed = i < mistakes;
    dot.classList.toggle("used", isUsed);
    // Only the most-recently-used dot gets the "pop" trigger, so older
    // dots don't replay it every time a new mistake is made.
    dot.classList.toggle("just-used", isUsed && i === mistakes - 1);
  });
}

function renderSubmitState() {
  submitBtn.disabled = selected.length !== 4 || gameOver || animating;
  shuffleBtn.disabled = gameOver || animating;
  deselectBtn.disabled = gameOver || animating;
}

// --- Interaction ----------------------------------------------------------

function toggleTile(word) {
  if (gameOver || animating) return;
  if (selected.includes(word)) {
    selected = selected.filter(w => w !== word);
  } else {
    if (selected.length >= 4) return; // already at the max
    selected.push(word);
  }
  renderGrid();
  renderSubmitState();
}

function deselectAll() {
  if (gameOver || animating) return;
  selected = [];
  renderGrid();
  renderSubmitState();
}

function shuffleTiles() {
  if (gameOver || animating) return;
  tiles = shuffleArray(tiles);
  renderGrid();
}

// --- Shake (wrong guess, and the initial reaction on a correct one) -------

function animateShake(tileEls) {
  return new Promise(resolve => {
    tileEls.forEach(el => el.classList.add("shake"));
    setTimeout(() => {
      tileEls.forEach(el => el.classList.remove("shake"));
      resolve();
    }, SHAKE_MS);
  });
}

// --- Correct-guess fly animation -------------------------------------------
//
// FLIP technique: capture each tile's on-screen position before anything
// moves, let the underlying state/DOM update happen (grid reflows, solved
// row appears), measure where the new solved row actually landed, then fly
// a floating clone of each tile from its old spot to that shared target so
// all four arrive together — finally cross-fading into the real row.

async function animateCorrectGuess(tileEls, categoryIndex) {
  const startRects = tileEls.map(el => el.getBoundingClientRect());

  solvedCategories.push(categoryIndex);
  tiles = tiles.filter(t => t.categoryIndex !== categoryIndex);

  const row = buildSolvedRow(categoryIndex);
  row.classList.add("appearing"); // starts invisible (opacity: 0 via CSS)
  solvedEl.appendChild(row);
  renderGrid(); // reflows the remaining tiles now that 4 are gone

  const targetRect = row.getBoundingClientRect();

  const clones = tileEls.map((el, i) => {
    const rect = startRects[i];
    const clone = document.createElement("div");
    clone.className = "conn-flying-tile";
    clone.textContent = el.textContent;
    clone.style.fontSize = el.style.fontSize; // match the tile's own scaled size
    clone.style.top = rect.top + "px";
    clone.style.left = rect.left + "px";
    clone.style.width = rect.width + "px";
    clone.style.height = rect.height + "px";
    document.body.appendChild(clone);
    return clone;
  });

  // Force layout so the browser registers the starting position before the
  // target position is applied below — otherwise the transition can get
  // silently skipped.
  clones.forEach(c => c.getBoundingClientRect());
  await new Promise(resolve => raf(resolve));

  clones.forEach(clone => {
    clone.style.top = targetRect.top + "px";
    clone.style.left = targetRect.left + "px";
    clone.style.width = targetRect.width + "px";
    clone.style.height = targetRect.height + "px";
    clone.style.opacity = "0"; // fades out near the END of the flight (see
                                // the transition-delay set in stylecon.css)
  });

  // Let the solved row start fading in at the exact moment the clones begin
  // their own fade-out, so the two crossfade together instead of leaving a
  // dead gap between "clone gone" and "row appears".
  setTimeout(() => row.classList.remove("appearing"), FLY_MS - CROSSFADE_MS);

  await wait(FLY_MS);
  clones.forEach(c => c.remove());
}

// --- Game flow ------------------------------------------------------------

function endGame(won) {
  gameOver = true;
  bottomBarEl.classList.add("hidden");
  if (!won) {
    // Reveal whatever's left, in category order, so the player sees the
    // full solution.
    CATEGORIES.forEach((cat, categoryIndex) => {
      if (!solvedCategories.includes(categoryIndex)) {
        solvedCategories.push(categoryIndex);
      }
    });
    tiles = [];
    renderSolved();
    renderGrid();
  }
  setMessage("", null); // the finish modal covers win/loss messaging now, so nothing shown here
  renderSubmitState();
  openConnFinishModal(won);
}

async function submitGuess() {
  if (gameOver || animating || selected.length !== 4) return;

  const tileEls = selected.map(word =>
    [...gridEl.children].find(el => el.textContent === word)
  );
  const categoryIndexes = selected.map(
    word => tiles.find(t => t.word === word).categoryIndex
  );
  guessHistory.push([...categoryIndexes]);

  const allSameCategory = categoryIndexes.every(ci => ci === categoryIndexes[0]);

  animating = true;
  renderSubmitState();

  if (allSameCategory) {
    await animateCorrectGuess(tileEls, categoryIndexes[0]);
    selected = [];
    animating = false;
    renderGrid(); // re-render so the remaining tiles' disabled state clears
    renderMistakes();
    renderSubmitState();

    if (solvedCategories.length === CATEGORIES.length) {
      endGame(true);
    } else {
      setMessage("", null);
    }
    return;
  }

  // Wrong guess — check for "one away" (3 of the 4 share a category).
  const counts = {};
  categoryIndexes.forEach(ci => { counts[ci] = (counts[ci] || 0) + 1; });
  const oneAway = Object.values(counts).some(c => c === 3);

  await animateShake(tileEls);
  mistakes++;
  renderMistakes();
  selected = [];
  animating = false;
  renderGrid();
  renderSubmitState();

  if (mistakes >= MAX_MISTAKES) {
    endGame(false);
  } else {
    // PLACEHOLDER — English placeholder, translate whenever ready.
    setMessage(oneAway ? "One away..." : "", oneAway ? "info" : null);
  }
}

// --- Stats (localStorage) -------------------------------------------------

const CONN_STATS_KEY = "connecziuns-stats";

function loadConnStats() {
  const empty = { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, maxStreak: 0 };
  try {
    const raw = localStorage.getItem(CONN_STATS_KEY);
    if (!raw) return empty;
    return { ...empty, ...JSON.parse(raw) };
  } catch (e) {
    return empty;
  }
}

function saveConnStats(stats) {
  try {
    localStorage.setItem(CONN_STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    // Nothing we can do if storage is unavailable.
  }
}

function recordConnResult(won) {
  const stats = loadConnStats();
  stats.gamesPlayed++;
  if (won) {
    stats.gamesWon++;
    stats.currentStreak++;
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
  }
  saveConnStats(stats);
  return stats;
}

// --- Finish modal -----------------------------------------------------

function renderGuessSummary() {
  connGuessSummaryEl.innerHTML = "";
  guessHistory.forEach(guess => {
    const row = document.createElement("div");
    row.className = "conn-guess-row";
    guess.forEach(categoryIndex => {
      const square = document.createElement("span");
      square.className = "conn-guess-square";
      square.style.background = `var(--conn-${CATEGORIES[categoryIndex].difficulty})`;
      row.appendChild(square);
    });
    connGuessSummaryEl.appendChild(row);
  });
}

function openConnFinishModal(won) {
  const stats = recordConnResult(won);

  connFinishTitleEl.textContent = won ? "Bain fat!" : "Puchà! Forsa prosma jada";
  // PLACEHOLDER — English, translate whenever ready.
  connFinishSubtitleEl.textContent = won
    ? `Tü hast guadagnà cun ${mistakes} sbagl${mistakes === 1 ? "" : "s"}.`
    : `Tü hast fat ${MAX_MISTAKES} sbagls.`;

  connStatPlayedEl.textContent = String(stats.gamesPlayed);
  const winPct = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
  connStatWinPctEl.textContent = `${winPct}%`;
  connStatStreakEl.textContent = String(stats.currentStreak);
  connStatMaxStreakEl.textContent = String(stats.maxStreak);

  renderGuessSummary();

  connFinishOverlay.classList.remove("hidden");
}

// Deliberately the ONLY way to close this modal — no backdrop click, no
// Escape, no close (×) button — per spec.
connFinishViewBtn.addEventListener("click", () => {
  connFinishOverlay.classList.add("hidden");
});

// --- How-to-play modal ----------------------------------------------------

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
helpOverlay.addEventListener("click", (e) => {
  if (e.target === helpOverlay) closeHelp();
});

document.addEventListener("keydown", (e) => {
  if (helpOpen && e.key === "Escape") closeHelp();
});

// --- Event wiring ----------------------------------------------------------

shuffleBtn.addEventListener("click", shuffleTiles);
deselectBtn.addEventListener("click", deselectAll);
submitBtn.addEventListener("click", submitGuess);

// --- Go ----------------------------------------------------------------

startNewPuzzle();