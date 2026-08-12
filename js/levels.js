/* The level ladder.
 *
 * This table is the tuning knob for the whole game. Everything else -- the
 * renderer, the generator, the validator -- reads from it, so retuning the
 * difficulty ramp after watching a real child play is a one-line edit here.
 *
 * kind:     'row' | 'col' | 'box'  -> a single group of 4 cells, "no repeats"
 *           'grid'                 -> a real sudoku grid
 * size:     cells per side of the grid (4, 6, 9)
 * boxW/boxH:box dimensions inside the grid (2x2, 3x2, 3x3)
 * blanks:   how many squares the player has to fill. A target, not a promise:
 *           see makePuzzle. Kept below what the generator can reliably reach.
 * technique:the hardest kind of reasoning the puzzle will ever ask for, and
 *           the real measure of difficulty -- how many numbers are showing
 *           matters much less than what you have to do to find the next one.
 *           'naked'  -> somewhere there is always a square with only one digit
 *                       left that fits. Findable by elimination alone.
 *           'hidden' -> the only way on may be to take one digit and
 *                       scan the lines crossing a box to find the single
 *                       square it can still live in. This is cross-hatching,
 *                       the technique real sudoku is built on.
 * feedback: 'immediate'  -> a wrong digit is rejected the moment it is tapped
 *           'onComplete' -> everything is accepted, checked once the grid is full
 * requireHidden: insist the puzzle genuinely cannot be finished by elimination
 *           alone. Only worth asking for where the shape allows it: on a 4x4
 *           every square sees so much of the grid that plain elimination always
 *           gets there, whatever you do, so those levels do not claim otherwise.
 * showConflicts: on a rejected digit, light up the squares in the same line or
 *           box that already hold that number, so the child can see for
 *           themselves why it did not fit.
 */

const MASTERY_TARGET = 5;   // flawless solves in a row needed to unlock the next level
const RESET_ON_MISTAKE = true; // false -> a mistake costs one star instead of all of them

const LEVELS = [
  // --- warm-ups: one group of four, the only rule is "no repeats" ---
  { id: 1, kind: 'row', size: 4, boxW: 2, boxH: 2, blanks: 1, technique: 'naked', feedback: 'immediate', showConflicts: true },
  { id: 2, kind: 'col', size: 4, boxW: 2, boxH: 2, blanks: 1, technique: 'naked', feedback: 'immediate', showConflicts: true },
  { id: 3, kind: 'box', size: 4, boxW: 2, boxH: 2, blanks: 1, technique: 'naked', feedback: 'immediate', showConflicts: true },

  // --- 4x4 sudoku. Never fewer than three missing numbers: with only one or
  //     two gaps there is nothing to work out, just a blank to fill in. ---
  { id: 4, kind: 'grid', size: 4, boxW: 2, boxH: 2, blanks: 3, technique: 'naked', feedback: 'immediate', showConflicts: true },
  { id: 5, kind: 'grid', size: 4, boxW: 2, boxH: 2, blanks: 4, technique: 'naked', feedback: 'immediate', showConflicts: true },
  { id: 6, kind: 'grid', size: 4, boxW: 2, boxH: 2, blanks: 5, technique: 'naked', feedback: 'onComplete', showConflicts: true },
  { id: 7, kind: 'grid', size: 4, boxW: 2, boxH: 2, blanks: 6, technique: 'naked', feedback: 'onComplete', showConflicts: true },
  { id: 8, kind: 'grid', size: 4, boxW: 2, boxH: 2, blanks: 8, technique: 'naked', feedback: 'onComplete', showConflicts: true },
  { id: 9, kind: 'grid', size: 4, boxW: 2, boxH: 2, blanks: 9, technique: 'naked', feedback: 'onComplete', showConflicts: true },
  { id: 10, kind: 'grid', size: 4, boxW: 2, boxH: 2, blanks: 11, technique: 'naked', feedback: 'onComplete', showConflicts: true },

  // --- 6x6 sudoku, boxes are 3 wide and 2 tall ---
  { id: 11, kind: 'grid', size: 6, boxW: 3, boxH: 2, blanks: 12, technique: 'naked', feedback: 'onComplete' },
  { id: 12, kind: 'grid', size: 6, boxW: 3, boxH: 2, blanks: 16, technique: 'naked', feedback: 'onComplete' },
  { id: 13, kind: 'grid', size: 6, boxW: 3, boxH: 2, blanks: 20, technique: 'hidden', feedback: 'onComplete' },
  // the first puzzle that cannot be finished without cross-hatching
  { id: 14, kind: 'grid', size: 6, boxW: 3, boxH: 2, blanks: 24, technique: 'hidden', feedback: 'onComplete', requireHidden: true },

  // --- the real thing. By the clue counts real sudoku uses, level 17 is an
  //     easy puzzle and level 20 is a hard one -- but never harder than
  //     cross-hatching, so it is always findable without guessing. ---
  { id: 15, kind: 'grid', size: 9, boxW: 3, boxH: 3, blanks: 30, technique: 'naked', feedback: 'onComplete' },
  { id: 16, kind: 'grid', size: 9, boxW: 3, boxH: 3, blanks: 36, technique: 'naked', feedback: 'onComplete' },
  { id: 17, kind: 'grid', size: 9, boxW: 3, boxH: 3, blanks: 41, technique: 'hidden', feedback: 'onComplete' },
  { id: 18, kind: 'grid', size: 9, boxW: 3, boxH: 3, blanks: 46, technique: 'hidden', feedback: 'onComplete', requireHidden: true },
  { id: 19, kind: 'grid', size: 9, boxW: 3, boxH: 3, blanks: 49, technique: 'hidden', feedback: 'onComplete', requireHidden: true },
  { id: 20, kind: 'grid', size: 9, boxW: 3, boxH: 3, blanks: 53, technique: 'hidden', feedback: 'onComplete', requireHidden: true },
];

function getLevel(id) {
  return LEVELS.find(function (l) { return l.id === id; }) || LEVELS[0];
}
