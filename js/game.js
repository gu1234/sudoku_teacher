/* The game itself: state, rendering, input, rewards.
 *
 * The player cannot read yet, so nearly everything is said with numerals,
 * colour, motion and sound. The few words on screen are for the grown-up.
 */

const STORE_KEY = 'sudoku-steps-v1';

// How long a rejected digit stays on screen before it hops back out. Longer
// when there is a clashing square lit up, because there is something to look at.
const WRONG_PAUSE = 550;
const WRONG_PAUSE_WITH_HINT = 1600;

// The same, for the levels that hold their verdict until the grid is full.
const VERDICT_PAUSE = 1100;
const VERDICT_PAUSE_WITH_HINT = 2400;

// How long a hint stays on the board before it fades.
const HINT_LINGER = 6000;



const state = {
  levelId: 1,
  streaks: {},              // levelId -> flawless solves in a row, right now
  mastered: {},             // levelId -> true, once earned it is kept for good
  muted: false,
  puzzle: null,             // the cells as the child sees them (0 = blank)
  solution: null,
  entries: null,            // what the child has typed, 0 = still blank
  locked: null,             // cells confirmed correct, no longer editable
  mistakes: 0,              // mistakes in the current attempt
  selected: -1,
  activeDigit: 0,           // the number last tapped, highlighted across the board
  theme: 'sky',             // which look is on
  stats: {},                // levelId -> { attempts, perfect, mistakes }
  busy: false,              // true while a celebration is playing
  // Bumped on every new puzzle. The delayed callbacks below capture it and
  // bail if it has moved on, so a level picked from the menu mid-animation
  // cannot be scribbled over by a timer belonging to the previous puzzle.
  token: 0,
};

const el = {
  board: document.getElementById('board'),
  pad: document.getElementById('pad'),
  levelNumber: document.getElementById('level-number'),
  stars: document.getElementById('stars'),
  menu: document.getElementById('menu'),
  menuBtn: document.getElementById('menu-btn'),
  menuClose: document.getElementById('menu-close'),
  levelList: document.getElementById('level-list'),
  muteBtn: document.getElementById('mute-btn'),
  resetBtn: document.getElementById('reset-btn'),
  themes: document.getElementById('themes'),
  statsBtn: document.getElementById('stats-btn'),
  stats: document.getElementById('stats'),
  statsBody: document.getElementById('stats-body'),
  statsClose: document.getElementById('stats-close'),
  confetti: document.getElementById('confetti'),
  cheer: document.getElementById('cheer'),
  cheerFace: document.getElementById('cheer-face'),
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- storage */

/* What carries across sessions is where the child got to, not what they were
 * in the middle of: a refresh deals a fresh puzzle on the same level rather
 * than dropping them back into a half-filled grid. */
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      levelId: state.levelId,
      streaks: state.streaks,
      mastered: state.mastered,
      muted: state.muted,
      theme: state.theme,
      stats: state.stats,
    }));
  } catch (e) { /* private browsing, nothing we can do */ }
}

function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* ignore */ }
  if (!saved) return;

  state.levelId = getLevel(saved.levelId || 1).id;   // ignore a level that no longer exists
  state.streaks = saved.streaks || {};
  state.mastered = saved.mastered || {};
  state.muted = !!saved.muted;
  if (THEMES.indexOf(saved.theme) !== -1) state.theme = saved.theme;
  state.stats = saved.stats || {};
}

function streakOf(levelId) { return state.streaks[levelId] || 0; }

/* ------------------------------------------------------------------ looks */

const THEMES = ['sky', 'crayon', 'chalk'];

/* A theme is nothing but a set of custom properties hung off the root element,
 * so switching one is a single attribute write and no re-render. */
function setTheme(name) {
  state.theme = THEMES.indexOf(name) !== -1 ? name : 'sky';
  document.documentElement.dataset.theme = state.theme;

  const picks = el.themes.querySelectorAll('.theme-pick');
  for (let i = 0; i < picks.length; i++) {
    picks[i].setAttribute('aria-pressed',
      String(picks[i].dataset.themeName === state.theme));
  }
  save();
}

/* ------------------------------------------------------------------ setup */

function newAttempt() {
  const spec = getLevel(state.levelId);

  // A fresh puzzle every single attempt, so nothing can be memorised. The
  // warm-up levels only have 96 possible puzzles, so also insist on a change
  // from the one just solved -- an identical repeat looks like a bug to a child.
  const previous = state.puzzle ? state.puzzle.join(',') : null;
  let made = makePuzzle(spec);
  for (let tries = 0; tries < 20 && made.puzzle.join(',') === previous; tries++) {
    made = makePuzzle(spec);
  }

  state.puzzle = made.puzzle;
  state.solution = made.solution;
  state.entries = made.puzzle.slice();
  state.locked = made.puzzle.map(function (c) { return c !== 0; });
  state.mistakes = 0;
  state.activeDigit = 0;
  state.token++;
  state.busy = false;
  // Nothing is picked out to begin with. Choosing which square to work on is
  // half of playing sudoku, so the game does not choose for them.
  state.selected = -1;
  save();
}

function goToLevel(id) {
  state.levelId = id;
  newAttempt();
  render();
}

/* -------------------------------------------------------------- rendering */

/* The board is laid out as `cols` x `rows` of cells. Warm-up levels are a
 * single group of four; real levels are the full square. */
function shapeOf(spec) {
  if (spec.kind === 'row') return { cols: 4, rows: 1 };
  if (spec.kind === 'col') return { cols: 1, rows: 4 };
  if (spec.kind === 'box') return { cols: 2, rows: 2 };
  return { cols: spec.size, rows: spec.size };
}

function render() {
  renderBoard();
  renderPad();
  renderHeader();
}

function renderHeader() {
  el.levelNumber.textContent = state.levelId;

  const streak = streakOf(state.levelId);
  el.stars.innerHTML = '';
  for (let i = 0; i < MASTERY_TARGET; i++) {
    const s = document.createElement('span');
    s.className = 'star' + (i < streak ? ' on' : '');
    s.textContent = '★';
    el.stars.appendChild(s);
  }
  el.stars.setAttribute('aria-label', streak + ' of ' + MASTERY_TARGET + ' perfect rounds');
}

/* The board is built as a grid of boxes, each box a grid of cells, and every
 * rule line is a gap with the backing colour showing through -- a wide gap
 * between boxes, a hairline within one. Drawing the lines as borders on the
 * cells instead meant two cells each contributing an edge, so every inner line
 * came out double-width and every box seam was heavier on one side than the
 * other. Gaps cannot do that: there is exactly one line, of exactly one width.
 *
 * cellEls maps a flat puzzle index to its element, because document order now
 * runs box by box rather than row by row. */
let cellEls = [];

function renderBoard() {
  const spec = getLevel(state.levelId);
  const shape = shapeOf(spec);

  // Real levels divide into the puzzle's boxes; the warm-ups are one group.
  const inCols = spec.kind === 'grid' ? spec.boxW : shape.cols;
  const inRows = spec.kind === 'grid' ? spec.boxH : shape.rows;
  const boxCols = shape.cols / inCols;
  const boxRows = shape.rows / inRows;

  el.board.innerHTML = '';
  cellEls = new Array(state.entries.length);
  el.board.style.setProperty('--cols', shape.cols);
  el.board.style.setProperty('--rows', shape.rows);
  el.board.style.setProperty('--box-cols', boxCols);
  el.board.style.setProperty('--box-rows', boxRows);
  el.board.style.setProperty('--in-cols', inCols);
  el.board.style.setProperty('--in-rows', inRows);

  for (let br = 0; br < boxRows; br++) {
    for (let bc = 0; bc < boxCols; bc++) {
      const box = document.createElement('div');
      box.className = 'box';
      box.style.setProperty('--wave', br + bc);   // deals diagonally

      for (let r = 0; r < inRows; r++) {
        for (let c = 0; c < inCols; c++) {
          const row = br * inRows + r;
          const col = bc * inCols + c;
          const i = row * shape.cols + col;

          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'cell';
          cell.dataset.index = i;

          // The four cells that have to follow the board's rounded corners.
          if (row === 0 && col === 0) cell.classList.add('corner-tl');
          if (row === 0 && col === shape.cols - 1) cell.classList.add('corner-tr');
          if (row === shape.rows - 1 && col === 0) cell.classList.add('corner-bl');
          if (row === shape.rows - 1 && col === shape.cols - 1) cell.classList.add('corner-br');

          cellEls[i] = cell;
          paintCell(cell, i);
          box.appendChild(cell);
        }
      }

      el.board.appendChild(box);
    }
  }
}

function paintCell(cell, i) {
  const value = state.entries[i];
  const isGiven = state.puzzle[i] !== 0;

  cell.textContent = value ? value : '';
  cell.classList.toggle('given', isGiven);
  cell.classList.toggle('filled', value !== 0);
  cell.classList.toggle('empty', value === 0);
  cell.classList.toggle('same', value !== 0 && value === state.activeDigit);
  cell.classList.toggle('locked', !!state.locked[i]);
  cell.classList.toggle('selected', state.selected === i);
  cell.disabled = false;
  cell.setAttribute('aria-label', value ? String(value) : 'empty');
}

function repaint() {
  for (let i = 0; i < cellEls.length; i++) paintCell(cellEls[i], i);
  paintPad();
}

/* Keeps the tapped key looking pressed while its number is the highlighted one. */
function paintPad() {
  const keys = el.pad.children;
  for (let k = 0; k < keys.length; k++) {
    const d = Number(keys[k].dataset.digit);
    keys[k].classList.toggle('active', d !== 0 && d === state.activeDigit);
  }
}

function renderPad() {
  const spec = getLevel(state.levelId);
  el.pad.innerHTML = '';
  // 4 digits sit as a 2x2 block, 6 and 9 as three across -- a shape that stays
  // the same whichever way the device is held. Fewer digits means fewer rows,
  // so the early levels can afford much bigger keys (see data-digits in the CSS).
  el.pad.style.setProperty('--pad-cols', spec.size === 4 ? 2 : 3);
  el.pad.dataset.digits = spec.size;

  for (let d = 1; d <= spec.size; d++) {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'key';
    key.dataset.digit = d;
    key.textContent = d;
    key.setAttribute('aria-label', 'Place ' + d);
    el.pad.appendChild(key);
  }

  // Nothing to erase when wrong answers bounce straight back out.
  if (spec.feedback !== 'immediate') {
    const erase = document.createElement('button');
    erase.type = 'button';
    erase.className = 'key erase';
    erase.dataset.digit = '0';
    erase.textContent = '⌫';
    erase.setAttribute('aria-label', 'Clear this square');
    el.pad.appendChild(erase);
  }

  // Somewhere to turn when stuck. Not on the warm-ups, where a single missing
  // number leaves nothing to be stuck about.
  if (spec.blanks > 2) {
    const hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'key hint-key' + (spec.feedback === 'immediate' ? ' wide' : '');
    hint.id = 'hint-btn';
    hint.textContent = '💡';
    hint.setAttribute('aria-label', 'Show me a square I can work out');
    el.pad.appendChild(hint);
  }
}

/* ------------------------------------------------------------------ input */

/* Where the arrow keys start from when nothing has been picked yet. */
function firstBlank(from) {
  const n = state.entries.length;
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n;
    if (!state.locked[i] && state.entries[i] === 0) return i;
  }
  return -1;
}

function selectCell(i) {
  if (state.busy) return;
  clearMarks();

  const value = state.entries[i];

  // Tapping a square that already shows a number asks "where are the others
  // like this one?" -- every square holding it lights up. Tap it again to put
  // the highlight away.
  if (value !== 0) {
    state.activeDigit = state.activeDigit === value ? 0 : value;
  }

  // The numbers the puzzle gave, and answers already confirmed, cannot be
  // typed over. Those squares are only ever somewhere to look.
  if (!state.locked[i]) state.selected = i;

  Sound.select();
  repaint();
}

function place(digit) {
  if (state.busy || state.selected < 0) return;
  const spec = getLevel(state.levelId);
  const i = state.selected;
  if (state.locked[i]) return;

  clearMarks();                            // a new try clears the last verdict

  // Putting a number in is answering, not looking around. The "every square
  // with this number" highlight is for reasoning about the board, so it goes
  // as soon as an answer is committed -- the only thing worth marking now is
  // a clash, if the answer turns out to collide with something.
  state.activeDigit = 0;

  if (digit === 0) {                       // eraser
    state.entries[i] = 0;
    Sound.select();
    repaint();
    save();
    return;
  }

  if (spec.feedback === 'immediate') {
    if (digit === state.solution[i]) {
      state.entries[i] = digit;
      state.locked[i] = true;
      Sound.correct();
      state.selected = -1;                 // they pick the next square themselves
      repaint();
      flash(i, 'pop');
    } else {
      state.mistakes++;
      state.entries[i] = digit;
      Sound.wrong();
      repaint();
      flash(i, 'shake');
      cellEls[i].classList.add('bad');

      // On the early levels, light up the squares that already hold this
      // number in the same line or box. That is the whole reason the answer
      // did not fit, and it is something a child can see rather than be told.
      let pause = WRONG_PAUSE;
      if (spec.showConflicts) {
        const clashes = conflictsFor(state.entries, spec, i, digit);
        clashes.forEach(function (c) { cellEls[c].classList.add('conflict'); });
        if (clashes.length) pause = WRONG_PAUSE_WITH_HINT;   // time to look across
      }

      // Show it for a moment, then take it back so the child can retry.
      const at = i;
      const token = state.token;
      setTimeout(function () {
        if (state.token !== token) return;   // moved on to another puzzle
        state.entries[at] = 0;
        clearMarks();
        repaint();
        save();
      }, pause);
      // No completion check here: the board momentarily has no blanks left,
      // but a wrong digit filling the last one is not a finished puzzle.
      save();
      return;
    }
  } else {
    state.entries[i] = digit;
    Sound.place();
    state.selected = -1;                   // they pick the next square themselves
    repaint();
    flash(i, 'pop');
  }

  save();
  checkComplete(i);
}

/* Wipes the red "wrong" and the highlighted clashes. These are added directly
 * to the elements rather than driven from state, so repaint() leaves them be
 * and they have to be taken off deliberately. */
function clearMarks() {
  for (let i = 0; i < cellEls.length; i++) {
    cellEls[i].classList.remove('bad', 'conflict', 'hint-target', 'hint-proof');
  }
}

function flash(i, className) {
  const cell = cellEls[i];
  if (!cell) return;
  cell.classList.remove(className);
  void cell.offsetWidth;                   // restart the animation
  cell.classList.add(className);
}

/* ------------------------------------------------------------------- help */

/* Points at one square that can be worked out right now, and lights up the
 * numbers that prove it. Never fills anything in: being shown where to look is
 * help, being given the answer is not.
 *
 * The reasoning runs over the given numbers plus answers already confirmed --
 * never over a guess that has not been checked, or the advice would be built
 * on a wrong number. Squares already holding an unchecked guess are passed
 * over too, so a hint cannot quietly reveal that one of them is wrong. */
function showHint() {
  if (state.busy || !state.entries) return;
  const spec = getLevel(state.levelId);

  const trusted = state.entries.map(function (v, i) { return state.locked[i] ? v : 0; });
  const guessed = state.entries.map(function (v, i) { return v !== 0 && !state.locked[i]; });

  let step = nextStep(trusted, spec, guessed);
  // If every findable square already holds a guess, help anyway rather than
  // leaving them stuck with nothing.
  if (!step) step = nextStep(trusted, spec);
  if (!step) return;

  clearMarks();
  state.activeDigit = 0;
  state.selected = state.locked[step.index] ? -1 : step.index;
  repaint();

  cellEls[step.index].classList.add('hint-target');
  step.proof.forEach(function (i) {
    if (i !== step.index) cellEls[i].classList.add('hint-proof');
  });

  Sound.select();

  const token = state.token;
  setTimeout(function () {
    if (state.token !== token || state.busy) return;
    clearMarks();
  }, HINT_LINGER);
}

/* The box a square belongs to. */
function boxCellsFor(spec, i) {
  if (spec.kind !== 'grid') return null;
  const n = spec.size;
  const r0 = Math.floor(Math.floor(i / n) / spec.boxH) * spec.boxH;
  const c0 = Math.floor((i % n) / spec.boxW) * spec.boxW;
  const out = [];
  for (let r = r0; r < r0 + spec.boxH; r++) {
    for (let c = c0; c < c0 + spec.boxW; c++) out.push(r * n + c);
  }
  return out;
}

/* ------------------------------------------------------- finishing a level */

function checkComplete(justPlaced) {
  const spec = getLevel(state.levelId);

  if (spec.feedback === 'immediate') {
    // Here a square only counts once it has been confirmed correct. Going by
    // "no blanks left" would call it a win while a rejected digit is still
    // sitting on the board waiting to be taken back.
    if (state.locked.indexOf(false) !== -1) return;
    win();
    return;
  }

  // Box by box: the moment the box just added to is full, it gets checked.
  // On a 9x9 with fifty blanks this turns one verdict at the very end into a
  // small result every few moves, without giving any reasoning away.
  if (spec.feedback === 'onBox' && typeof justPlaced === 'number') {
    const box = boxCellsFor(spec, justPlaced);
    const full = box && box.every(function (i) { return state.entries[i] !== 0; });
    if (full) judge(box);
    return;
  }

  if (state.entries.indexOf(0) !== -1) return;   // still blanks

  const all = [];
  for (let i = 0; i < state.entries.length; i++) all.push(i);
  judge(all);
}

/* Rules on a filled set of squares: the whole grid, or one box. Right answers
 * lock, wrong ones are marked, shown, and taken back for another go. */
function judge(indices) {
  const spec = getLevel(state.levelId);
  const wrong = [];

  indices.forEach(function (i) {
    if (state.entries[i] !== state.solution[i]) wrong.push(i);
    else state.locked[i] = true;
  });

  if (wrong.length === 0) {
    if (state.locked.indexOf(false) === -1) { win(); return; }
    // A box came good but the puzzle is not finished: a small win, and the
    // squares are locked from here so the ground under them is firm.
    Sound.boxDone();
    repaint();
    indices.forEach(function (i) { flash(i, 'pop'); });
    save();
    return;
  }

  state.mistakes += wrong.length;
  state.busy = true;
  Sound.wrong();

  wrong.forEach(function (i) {
    cellEls[i].classList.add('bad');
    flash(i, 'shake');
  });

  // Same lesson as on the immediate levels, just held back: show which squares
  // already hold each number that did not fit. Squares that are themselves
  // wrong stay red -- they are not evidence of anything.
  let pause = VERDICT_PAUSE;
  if (spec.showConflicts) {
    const lit = {};
    wrong.forEach(function (i) {
      conflictsFor(state.entries, spec, i, state.entries[i]).forEach(function (c) {
        if (wrong.indexOf(c) === -1) lit[c] = true;
      });
    });
    const marks = Object.keys(lit);
    marks.forEach(function (c) { cellEls[c].classList.add('conflict'); });
    if (marks.length) pause = VERDICT_PAUSE_WITH_HINT;
  }

  const token = state.token;
  setTimeout(function () {
    if (state.token !== token) return;
    wrong.forEach(function (i) { state.entries[i] = 0; });
    clearMarks();
    state.selected = -1;
    state.busy = false;
    repaint();
    save();
  }, pause);
}

function win() {
  const spec = getLevel(state.levelId);
  const perfect = state.mistakes === 0;
  const before = streakOf(state.levelId);
  const after = perfect
    ? before + 1
    : (RESET_ON_MISTAKE ? 0 : Math.max(0, before - 1));

  const seen = state.stats[state.levelId] || { attempts: 0, perfect: 0, mistakes: 0 };
  seen.attempts++;
  if (perfect) seen.perfect++;
  seen.mistakes += state.mistakes;
  state.stats[state.levelId] = seen;

  state.streaks[state.levelId] = after;
  state.selected = -1;
  state.busy = true;
  repaint();
  renderHeader();

  const mastered = after >= MASTERY_TARGET;
  const hasNext = getLevel(state.levelId + 1).id === state.levelId + 1;

  if (mastered) {
    state.mastered[state.levelId] = true;   // kept for good, so the menu
    Sound.fanfare();                        // always shows what they have done
    celebrate(140, spec.sticker || '🏆');
  } else {
    Sound.win();
    celebrate(70, perfect ? '🎉' : '👍');
  }

  save();

  const token = state.token;
  const finished = state.levelId;
  setTimeout(function () {
    if (state.token !== token) return;   // they picked another level meanwhile
    state.busy = false;
    if (mastered) {
      state.streaks[finished] = 0;      // fresh slate if they come back to it
    }
    if (mastered && hasNext) {
      goToLevel(finished + 1);
    } else {
      newAttempt();
      render();
    }
    save();
  }, mastered ? 2600 : 1700);
}

/* ------------------------------------------------------------- the reward */

function celebrate(count, face) {
  el.cheerFace.textContent = face;
  el.cheer.classList.add('show');
  setTimeout(function () { el.cheer.classList.remove('show'); }, 1500);
  if (!reduceMotion) confetti(count);
}

let confettiPieces = [];
let confettiRunning = false;

function confetti(count) {
  const canvas = el.confetti;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = canvas.clientWidth;
  const colors = ['#ff5d8f', '#ffb703', '#38b000', '#4cc9f0', '#9b5de5', '#ff7b00'];

  for (let i = 0; i < count; i++) {
    confettiPieces.push({
      x: w / 2 + (Math.random() - 0.5) * w * 0.5,
      y: canvas.clientHeight * 0.42,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 13 - 4,
      size: 6 + Math.random() * 8,
      spin: (Math.random() - 0.5) * 0.35,
      angle: Math.random() * Math.PI,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
    });
  }

  if (confettiRunning) return;
  confettiRunning = true;

  (function frame() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    confettiPieces = confettiPieces.filter(function (p) {
      p.vy += 0.42;                        // gravity
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      p.life -= 0.008;
      return p.life > 0 && p.y < canvas.clientHeight + 40;
    });

    confettiPieces.forEach(function (p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });

    if (confettiPieces.length) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      confettiRunning = false;
    }
  })();
}

/* ------------------------------------------------------------------- menu */

function renderMenu() {
  el.levelList.innerHTML = '';

  LEVELS.forEach(function (spec) {
    const isMastered = !!state.mastered[spec.id];

    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile'
      + (spec.id === state.levelId ? ' current' : '')
      + (isMastered ? ' mastered' : '');
    tile.dataset.level = spec.id;

    const num = document.createElement('span');
    num.className = 'tile-num';
    num.textContent = spec.id;

    const shape = document.createElement('span');
    shape.className = 'tile-shape';
    shape.textContent = spec.kind === 'grid'
      ? spec.size + '×' + spec.size
      : (spec.kind === 'row' ? '1×4' : spec.kind === 'col' ? '4×1' : '2×2');

    const dots = document.createElement('span');
    if (isMastered) {
      // A sticker earned and kept, rather than five dots that are always full.
      dots.className = 'tile-sticker';
      dots.textContent = spec.sticker || '⭐';
    } else {
      dots.className = 'tile-stars';
      const done = streakOf(spec.id);
      for (let i = 0; i < MASTERY_TARGET; i++) {
        const s = document.createElement('i');
        if (i < done) s.className = 'on';
        dots.appendChild(s);
      }
    }

    tile.appendChild(num);
    tile.appendChild(shape);
    tile.appendChild(dots);
    tile.setAttribute('aria-label',
      'Level ' + spec.id + (isMastered ? ', finished' : ', ' + streakOf(spec.id) + ' of ' + MASTERY_TARGET));
    el.levelList.appendChild(tile);
  });
}

function openMenu() {
  renderMenu();
  disarmReset();
  el.menu.hidden = false;
  el.menuClose.focus();
}

function closeMenu() {
  el.menu.hidden = true;
  disarmReset();
  el.menuBtn.focus();
}

/* Wiping every star is worth a second press. This menu is open on a device a
 * five-year-old is holding, and one stray tap should not undo weeks of it. */
let resetArmed = false;
let resetTimer = null;

function disarmReset() {
  resetArmed = false;
  clearTimeout(resetTimer);
  el.resetBtn.classList.remove('armed');
  el.resetBtn.textContent = 'Start over';
}

function armReset() {
  resetArmed = true;
  el.resetBtn.classList.add('armed');
  el.resetBtn.textContent = 'Tap again to erase all stars';
  clearTimeout(resetTimer);
  resetTimer = setTimeout(disarmReset, 4000);
}

function resetProgress() {
  state.streaks = {};
  state.mastered = {};
  state.stats = {};
  state.levelId = 1;
  state.puzzle = null;              // so the new attempt cannot repeat the old one
  goToLevel(1);
  save();                           // sound stays as it was: a setting, not progress
  renderMenu();
  disarmReset();
}

/* What the grown-up wants to know: where the rounds are going. Levels never
 * played are left out -- an empty row says nothing. */
function renderStats() {
  const rows = LEVELS.filter(function (spec) { return state.stats[spec.id]; });
  el.statsBody.innerHTML = '';

  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'menu-note';
    empty.textContent = 'Nothing played yet.';
    el.statsBody.appendChild(empty);
    return;
  }

  const table = document.createElement('table');
  table.className = 'stats-table';
  table.innerHTML =
    '<thead><tr><th>Level</th><th>Rounds</th><th>Clean</th><th>Mistakes</th></tr></thead>';
  const body = document.createElement('tbody');

  let totalRounds = 0;
  let totalClean = 0;
  let totalMistakes = 0;

  rows.forEach(function (spec) {
    const st = state.stats[spec.id];
    totalRounds += st.attempts;
    totalClean += st.perfect;
    totalMistakes += st.mistakes;

    const tr = document.createElement('tr');
    if (state.mastered[spec.id]) tr.className = 'done';
    tr.innerHTML =
      '<td>' + spec.id + (state.mastered[spec.id] ? ' ' + (spec.sticker || '') : '') + '</td>' +
      '<td>' + st.attempts + '</td>' +
      '<td>' + Math.round(100 * st.perfect / st.attempts) + '%</td>' +
      '<td>' + st.mistakes + '</td>';
    body.appendChild(tr);
  });

  const foot = document.createElement('tr');
  foot.className = 'total';
  foot.innerHTML = '<td>All</td><td>' + totalRounds + '</td><td>' +
    Math.round(100 * totalClean / totalRounds) + '%</td><td>' + totalMistakes + '</td>';
  body.appendChild(foot);

  table.appendChild(body);
  el.statsBody.appendChild(table);
}

function setMuted(muted) {
  state.muted = muted;
  Sound.setMuted(muted);
  el.muteBtn.querySelector('.mute-glyph').textContent = muted ? '🔇' : '🔊';
  el.muteBtn.setAttribute('aria-pressed', String(muted));
  el.muteBtn.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
  save();
}

/* ------------------------------------------------------------------ wiring */

// iOS will not play a sound from a context created at load time, so the first
// touch or click anywhere is what brings the audio to life.
//
// These listeners stay put rather than firing once. Safari can drop the audio
// context back out of 'running' at any point -- after a call, a route change,
// or time spent in another tab -- and only a gesture may wake it again, so
// every gesture has to be allowed another go. unlock() returns immediately
// when the context is already running, so the cost of this is nothing.
['pointerdown', 'keydown'].forEach(function (evt) {
  window.addEventListener(evt, function () { Sound.unlock(); }, true);
});

// Coming back to the tab is the other moment Safari needs waking up.
document.addEventListener('visibilitychange', function () {
  if (!document.hidden) Sound.unlock();
});

el.board.addEventListener('click', function (e) {
  const cell = e.target.closest('.cell');
  if (cell) selectCell(Number(cell.dataset.index));
});

// Tapping away from the puzzle puts the highlight away again. The grid and the
// number pad are exempt: lighting up every 3 and then choosing the square a 3
// belongs in is one thought, and cancelling the highlight halfway through it
// would take the answer away just as the child went to use it. Squares clear
// themselves on their own timer once an answer has landed.
document.addEventListener('click', function (e) {
  if (state.busy || !el.menu.hidden || state.activeDigit === 0) return;
  if (e.target.closest('.board, .pad')) return;

  state.activeDigit = 0;
  repaint();
});

el.pad.addEventListener('click', function (e) {
  const key = e.target.closest('.key');
  if (!key) return;
  if (key.classList.contains('hint-key')) { showHint(); return; }
  place(Number(key.dataset.digit));
});

el.menuBtn.addEventListener('click', openMenu);
el.menuClose.addEventListener('click', closeMenu);

el.themes.addEventListener('click', function (e) {
  const pick = e.target.closest('.theme-pick');
  if (!pick) return;
  setTheme(pick.dataset.themeName);
  Sound.select();
});

el.statsBtn.addEventListener('click', function () {
  renderStats();
  el.stats.hidden = false;
  el.statsClose.focus();
});

el.statsClose.addEventListener('click', function () {
  el.stats.hidden = true;
  el.statsBtn.focus();
});

el.stats.addEventListener('click', function (e) {
  if (e.target === el.stats) el.stats.hidden = true;
});

el.resetBtn.addEventListener('click', function () {
  if (resetArmed) {
    Sound.select();
    resetProgress();
  } else {
    armReset();
  }
});

el.menu.addEventListener('click', function (e) {
  const tile = e.target.closest('.tile');
  if (tile) {
    Sound.select();
    goToLevel(Number(tile.dataset.level));
    closeMenu();
    return;
  }
  if (e.target === el.menu) closeMenu();
});

el.muteBtn.addEventListener('click', function () {
  setMuted(!state.muted);
  if (!state.muted) Sound.select();
});

document.addEventListener('keydown', function (e) {
  // This handler runs before the window-level unlock listener below (events
  // reach document first), so the very first keypress would otherwise be mute.
  Sound.unlock();

  if (!el.stats.hidden) {
    if (e.key === 'Escape') el.stats.hidden = true;
    return;
  }

  if (!el.menu.hidden) {
    if (e.key === 'Escape') closeMenu();
    return;
  }

  const spec = getLevel(state.levelId);
  const shape = shapeOf(spec);

  if (e.key >= '1' && e.key <= '9') {
    const d = Number(e.key);
    if (d <= spec.size) { place(d); e.preventDefault(); }
    return;
  }
  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    if (spec.feedback !== 'immediate') place(0);
    e.preventDefault();
    return;
  }

  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: shape.cols, ArrowUp: -shape.cols }[e.key];
  if (step !== undefined) {
    e.preventDefault();
    const n = state.entries.length;
    let i = state.selected < 0 ? firstBlank(0) : state.selected;
    for (let k = 0; k < n; k++) {
      i = (i + step + n) % n;
      if (!state.locked[i]) break;
    }
    selectCell(i);
  }
});

window.addEventListener('resize', function () {
  const canvas = el.confetti;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
});

/* ------------------------------------------------------------------- start */

// Added to the home screen it becomes an app that needs no signal. Registered
// after everything else is running, so a failure here can never stop the game.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function () {
      /* offline support is a bonus, not a requirement */
    });
  });
}

load();
setTheme(state.theme);
setMuted(state.muted);
newAttempt();          // always a clean puzzle, on the level they got to
render();
