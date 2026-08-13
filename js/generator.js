/* Puzzle generation.
 *
 * A puzzle is a flat array of cells, 0 meaning "blank". For 'grid' levels the
 * array is size*size and the usual row/column/box rules apply. For the warm-up
 * levels it is just `size` cells with a single rule: no repeats.
 *
 * The important part of this file is that a cell is never blanked out unless
 * the puzzle still has exactly ONE solution afterwards. Two blanks in a 4x4 can
 * easily form a swappable pair with two valid answers, and a child who types a
 * genuinely correct digit must never be told they are wrong.
 */

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function digitsFor(spec) {
  const out = [];
  for (let d = 1; d <= spec.size; d++) out.push(d);
  return out;
}

/* Can `value` go at flat index `idx` without breaking a rule? */
function isLegal(cells, spec, idx, value) {
  if (spec.kind !== 'grid') {
    // A single group of cells: the only rule is that no digit repeats.
    for (let i = 0; i < cells.length; i++) {
      if (i !== idx && cells[i] === value) return false;
    }
    return true;
  }

  const n = spec.size;
  const row = Math.floor(idx / n);
  const col = idx % n;

  for (let c = 0; c < n; c++) {
    if (c !== col && cells[row * n + c] === value) return false;
  }
  for (let r = 0; r < n; r++) {
    if (r !== row && cells[r * n + col] === value) return false;
  }

  const r0 = Math.floor(row / spec.boxH) * spec.boxH;
  const c0 = Math.floor(col / spec.boxW) * spec.boxW;
  for (let r = r0; r < r0 + spec.boxH; r++) {
    for (let c = c0; c < c0 + spec.boxW; c++) {
      const i = r * n + c;
      if (i !== idx && cells[i] === value) return false;
    }
  }
  return true;
}

/* Every cell that shares a row, a column or a box with `idx` -- the cells that
 * are not allowed to repeat a digit. isLegal above answers the same question in
 * the generator's hot loop and deliberately does not build a list; this one is
 * for the screen, where allocating an array a few times a minute costs nothing. */
function peersOf(spec, idx) {
  const peers = [];

  if (spec.kind !== 'grid') {
    for (let i = 0; i < cellCount(spec); i++) {
      if (i !== idx) peers.push(i);
    }
    return peers;
  }

  const n = spec.size;
  const row = Math.floor(idx / n);
  const col = idx % n;
  const seen = {};

  const add = function (i) {
    if (i !== idx && !seen[i]) { seen[i] = true; peers.push(i); }
  };

  for (let c = 0; c < n; c++) add(row * n + c);
  for (let r = 0; r < n; r++) add(r * n + col);

  const r0 = Math.floor(row / spec.boxH) * spec.boxH;
  const c0 = Math.floor(col / spec.boxW) * spec.boxW;
  for (let r = r0; r < r0 + spec.boxH; r++) {
    for (let c = c0; c < c0 + spec.boxW; c++) add(r * n + c);
  }

  return peers;
}

/* Where `value` already sits in this cell's row, column or box -- i.e. the
 * squares that make it the wrong answer here. */
function conflictsFor(cells, spec, idx, value) {
  return peersOf(spec, idx).filter(function (i) { return cells[i] === value; });
}

function cellCount(spec) {
  return spec.kind === 'grid' ? spec.size * spec.size : spec.size;
}

/* A complete, valid, randomly chosen grid. */
function generateFull(spec) {
  const total = cellCount(spec);
  const cells = new Array(total).fill(0);

  function fill(idx) {
    if (idx === total) return true;
    const candidates = shuffled(digitsFor(spec));
    for (let k = 0; k < candidates.length; k++) {
      const v = candidates[k];
      if (!isLegal(cells, spec, idx, v)) continue;
      cells[idx] = v;
      if (fill(idx + 1)) return true;
      cells[idx] = 0;
    }
    return false;
  }

  fill(0);
  return cells;
}

/* How many ways can this puzzle be completed? Stops counting at `cap`. */
function countSolutions(cells, spec, cap) {
  cap = cap || 2;
  const work = cells.slice();
  const total = work.length;
  let found = 0;

  function search() {
    // Pick the blank with the fewest candidates -- keeps the 9x9 case fast.
    let best = -1;
    let bestOptions = null;
    for (let i = 0; i < total; i++) {
      if (work[i] !== 0) continue;
      const options = [];
      for (let d = 1; d <= spec.size; d++) {
        if (isLegal(work, spec, i, d)) options.push(d);
      }
      if (options.length === 0) return;      // dead end
      if (bestOptions === null || options.length < bestOptions.length) {
        best = i;
        bestOptions = options;
        if (options.length === 1) break;     // can't do better
      }
    }

    if (best === -1) {                       // nothing blank left
      found++;
      return;
    }

    for (let k = 0; k < bestOptions.length; k++) {
      work[best] = bestOptions[k];
      search();
      work[best] = 0;
      if (found >= cap) return;
    }
  }

  search();
  return found;
}

/* Every row, column and box -- the groups a digit may not repeat within. The
 * warm-up levels have exactly one such group. */
const unitCache = {};

function unitsOf(spec) {
  const key = spec.kind + spec.size + 'x' + spec.boxW + 'x' + spec.boxH;
  if (unitCache[key]) return unitCache[key];

  const units = [];

  if (spec.kind !== 'grid') {
    const all = [];
    for (let i = 0; i < cellCount(spec); i++) all.push(i);
    units.push(all);
    unitCache[key] = units;
    return units;
  }

  const n = spec.size;
  for (let r = 0; r < n; r++) {
    const u = [];
    for (let c = 0; c < n; c++) u.push(r * n + c);
    units.push(u);
  }
  for (let c = 0; c < n; c++) {
    const u = [];
    for (let r = 0; r < n; r++) u.push(r * n + c);
    units.push(u);
  }
  for (let r0 = 0; r0 < n; r0 += spec.boxH) {
    for (let c0 = 0; c0 < n; c0 += spec.boxW) {
      const u = [];
      for (let r = r0; r < r0 + spec.boxH; r++) {
        for (let c = c0; c < c0 + spec.boxW; c++) u.push(r * n + c);
      }
      units.push(u);
    }
  }

  unitCache[key] = units;
  return units;
}

/* Solves the way a person does, using only the techniques a level expects, and
 * never guessing. This is what decides how hard a puzzle really is -- the
 * number of blanks on its own does not, since a puzzle with fewer numbers
 * showing can be the easier one if it leaves a clean path through.
 *
 *   'naked'  a square where every digit but one is already spoken for
 *            somewhere in its row, column or box. Includes the easiest case of
 *            all, a group with a single empty square left in it.
 *   'hidden' also allows: within one row, column or box, a digit that has only
 *            one square left it could go in. Finding these means scanning
 *            across the lines that cross a box -- the cross-hatching that real
 *            sudoku is actually made of, and the reason to leave more blanks.
 *
 * A puzzle that solves this way needs no guesswork, and its solution is
 * therefore unique: every placement above is forced. */
function solvableBy(cells, spec, technique) {
  const work = cells.slice();
  const units = unitsOf(spec);
  const allowHidden = technique === 'hidden';

  for (;;) {
    let placed = false;

    for (let i = 0; i < work.length && !placed; i++) {
      if (work[i] !== 0) continue;
      let only = 0;
      let count = 0;
      for (let d = 1; d <= spec.size; d++) {
        if (!isLegal(work, spec, i, d)) continue;
        count++; only = d;
        if (count > 1) break;
      }
      if (count === 0) return false;         // painted into a corner
      if (count === 1) { work[i] = only; placed = true; }
    }

    if (!placed && allowHidden) {
      for (let u = 0; u < units.length && !placed; u++) {
        const unit = units[u];
        for (let d = 1; d <= spec.size && !placed; d++) {
          let spot = -1;
          let count = 0;
          for (let k = 0; k < unit.length; k++) {
            const i = unit[k];
            if (work[i] === d) { count = -1; break; }   // already in this group
            if (work[i] !== 0) continue;
            if (!isLegal(work, spec, i, d)) continue;
            count++; spot = i;
            if (count > 1) break;
          }
          if (count === 1) { work[spot] = d; placed = true; }
        }
      }
    }

    if (!placed) break;
  }

  return work.indexOf(0) === -1;
}

/* The next square that can be worked out from what is already on the board,
 * and the reason it can be. Same two techniques the levels are built on, tried
 * easiest first, so the help offered is never beyond what the child has met.
 *
 * Returns { index, digit, kind, proof } where proof is the squares to light up:
 * for elimination, the filled squares that rule out every other digit; for
 * cross-hatching, the group the digit has only one home left in. Deliberately
 * does not return the answer for the caller to fill in -- the child still puts
 * the number there themselves.
 *
 * `cells` must be a board the caller trusts -- the given numbers plus answers
 * already confirmed. Reasoning over a board holding an unchecked guess would
 * produce advice built on a wrong number. `skip` marks squares not to offer,
 * which is how the caller keeps a hint from quietly revealing that a guess
 * already sitting on the board is wrong. */
function nextStep(cells, spec, skip) {
  const units = unitsOf(spec);
  const blocked = function (i) { return skip ? !!skip[i] : false; };

  // Elimination: a square with only one digit left that fits.
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== 0 || blocked(i)) continue;
    let only = 0;
    let count = 0;
    for (let d = 1; d <= spec.size; d++) {
      if (!isLegal(cells, spec, i, d)) continue;
      count++; only = d;
      if (count > 1) break;
    }
    if (count === 1) {
      // What rules the others out: the filled squares this one can see.
      const proof = peersOf(spec, i).filter(function (p) { return cells[p] !== 0; });
      return { index: i, digit: only, kind: 'naked', proof: proof };
    }
  }

  // Cross-hatching: a digit with only one square left in some group.
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    for (let d = 1; d <= spec.size; d++) {
      let spot = -1;
      let count = 0;
      for (let k = 0; k < unit.length; k++) {
        const i = unit[k];
        if (cells[i] === d) { count = -1; break; }
        if (cells[i] !== 0) continue;
        if (!isLegal(cells, spec, i, d)) continue;
        count++; spot = i;
        if (count > 1) break;
      }
      if (count === 1 && !blocked(spot)) {
        return { index: spot, digit: d, kind: 'hidden', proof: unit.slice() };
      }
    }
  }

  return null;
}

/* Take numbers away for as long as the puzzle can still be reasoned out with
 * the techniques this level allows. Returns however many it managed. */
function carve(full, spec) {
  const cells = full.slice();
  const order = shuffled(cells.map(function (_, i) { return i; }));
  const technique = spec.technique || 'naked';
  let removed = 0;

  for (let k = 0; k < order.length && removed < spec.blanks; k++) {
    const idx = order[k];
    const kept = cells[idx];
    cells[idx] = 0;
    if (solvableBy(cells, spec, technique)) {
      removed++;
    } else {
      cells[idx] = kept;                     // would have needed a guess
    }
  }

  return { cells: cells, removed: removed };
}

/* A fresh puzzle for this level. Called for every attempt, so the five
 * repetitions needed to master a level are five different puzzles.
 *
 * spec.blanks is a target rather than a promise: how much can be taken away
 * depends on the grid that came up. Where the target is out of reach we keep
 * the emptiest board we found rather than hand back an easier kind of puzzle. */
function makePuzzle(spec) {
  let best = null;
  let bestAtTarget = null;

  for (let attempt = 0; attempt < 80; attempt++) {
    const full = generateFull(spec);
    const carved = carve(full, spec);
    const made = { puzzle: carved.cells, solution: full, removed: carved.removed };

    if (!best || carved.removed > best.removed) best = made;

    if (carved.removed !== spec.blanks) continue;
    if (!bestAtTarget) bestAtTarget = made;

    // Levels that promise cross-hatching have to actually need it. Plenty of
    // sparse grids still fall to plain elimination, and those would teach the
    // technique nothing, so keep looking for one that does not.
    if (spec.requireHidden && solvableBy(carved.cells, spec, 'naked')) continue;

    return made;
  }

  return bestAtTarget || best;
}
