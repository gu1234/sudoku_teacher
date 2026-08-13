# Sudoku Steps

A small, gentle sudoku game that teaches a five-year-old to play, one step at a time.

The player cannot read yet, so the game speaks in numerals, colour, sound and
animation. Colour carries meaning rather than decoration: blue is the child's own
answer, red is a mistake, orange is "look over here", teal is every square holding
the number they just tapped.

## How it works

- **20 levels**: a line of four with one number missing → a column → a 2×2 square
  → 4×4 sudoku → 6×6 → 9×9, with the grid emptying out as it goes.
- A level is **mastered after 5 flawless solves in a row**. The five stars in the
  header fill up; a mistake sends them back to zero. Every attempt is a **freshly
  generated puzzle**, so nothing can be memorised.
- **You choose the square.** The game never picks one for you — deciding where to
  work next is half of playing sudoku.
- **Tap any number on the board** to light up every other square holding it —
  the "where are all the threes?" question sudoku keeps asking. Tap it again, or
  tap away from the puzzle, to put it away. Choosing a square to answer keeps it
  up; entering a number clears it, since that is answering rather than looking.
- **Levels 1–5 answer back immediately** — a wrong digit wobbles, turns red, and
  hops out so the child can try again. On these levels the game also **lights up
  the squares that already hold that number** in the same line or box, in orange,
  so the child can see for themselves why it did not fit rather than just being
  told no. Red always means "this is wrong"; orange always means "look here".
- **Levels 6–10 hold the verdict** until the grid is full. **Levels 11+ check
  each box as it fills**, so a 9×9 with fifty blanks gives a small result every
  few moves instead of one long silence.
- **Stuck? Tap the 💡.** It finds a square that can genuinely be worked out from
  what is already on the board and lights up the numbers that prove it — the
  same two techniques the levels are built on, easiest first. It never fills the
  answer in. The reasoning runs only over given numbers and confirmed answers,
  so a hint is never built on an unchecked guess, and it steps around squares
  already holding one rather than quietly revealing they are wrong.
- **Every completed level gets confetti** and a tune; mastering one earns a
  **sticker** — twenty of them, one per level, kept in the menu — plus a fanfare,
  then moves on automatically.
- **A mistake costs one star, not all five.** Five *consecutive* flawless solves
  is a punishing ask on the bigger grids, and stalling there is the likeliest way
  for the ladder to fail a real child.
- The **level number is always in the header**, and the menu button opens a grid
  of all 20 levels so you can jump anywhere at any time. Levels already beaten
  stay gold in the menu even after their stars start over for a replay.
- **Three looks** to choose from in the menu, and the choice is remembered:
  **Sky** (soft and app-like), **Crayon** (warm paper, gold rules, a hand-drawn
  face) and **Chalk** (a classroom board, the child writing in yellow chalk).
  A theme is a complete set of custom properties, so it changes the roundness,
  the typeface and the weight of the rules as well as the colours.
- **For grown-ups** in the menu shows rounds played, how many were clean and
  where the mistakes are, so you can retune the ladder from what actually
  happens rather than guesswork.
- **Add it to your home screen** and it works with no signal — it is a proper
  installable app with its own icon.
- **Start over** at the bottom of the menu clears every star. It takes two taps,
  because a five-year-old is holding the device.
- The level reached, the stars and the sound setting are kept in `localStorage`.
  Refreshing deals a fresh puzzle on the level you were on rather than dropping
  you back into a half-filled grid.

## Playing

Tap a square, then tap a number. On a desktop, the number keys, the arrow keys
and backspace work too.

## Running it locally

There is no build step. Any static server will do:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

Opening `index.html` straight from the filesystem also works.

## Hosting on GitHub Pages

Push the repository, then **Settings → Pages → Source: Deploy from a branch**,
branch `main`, folder `/ (root)`. The site appears at
`https://<user>.github.io/<repo>/` within a minute.

Every asset path is relative, so it works from a project subpath. `.nojekyll`
stops Pages from trying to process the files.

## Difficulty

How many numbers are showing matters much less than what you have to do to find
the next one, so each level names the hardest reasoning it will ever ask for and
the generator holds it to that:

- **Elimination** (`naked`) — somewhere on the board there is always a square
  with only one digit left that fits.
- **Cross-hatching** (`hidden`) — sometimes the only way on is to take one digit
  and scan the rows and columns crossing a box to find the single square it can
  still live in. This is the technique real sudoku is built on, and levels 14 and
  18–20 are generated so they cannot be finished without it.

No level ever needs a guess, or anything harder than cross-hatching.

By the clue counts real sudoku uses — easy is roughly 32–40 givens, hard 26–30 —
level 17 is an easy puzzle and level 20 is a hard one:

| Level | Grid | Blanks | Givens | Needs |
| --- | --- | --- | --- | --- |
| 1–3 | line / square of 4 | 1 | 3 | — |
| 4–10 | 4×4 | 3 → 11 | 13 → 5 | elimination |
| 11–14 | 6×6 | 12 → 24 | 24 → 12 | cross-hatching from 13 |
| 15–20 | 9×9 | 30 → 53 | 51 → 28 | cross-hatching from 17 |

A 4×4 can never require cross-hatching — with only four digits each square sees
so much of the grid that elimination always gets there — so those levels do not
pretend otherwise.

## Tuning the difficulty

The whole ladder lives in one table at the top of `js/levels.js`. To make the
ramp gentler, change a `blanks` number or insert a row — nothing else needs to
change — `blanks` is a target, and the generator takes away as many numbers as it
can while the puzzle still yields to the level's technique.

`technique` and `requireHidden` set the reasoning a level demands; `feedback`
chooses when it answers back (`immediate`, `onBox`, `onComplete`); `sticker` is
what mastering it earns.

`showConflicts: true` turns on the orange "that number is already here" hint;
add it to a later level if it is still wanted, or drop it from an early one once
the child no longer needs the help. `requireHidden: true` insists a puzzle really
cannot be finished by elimination alone. `MASTERY_TARGET` (5 in a row) and `RESET_ON_MISTAKE` are constants in the
same file; setting `RESET_ON_MISTAKE = false` costs one star per mistake instead
of all of them, which is kinder for a young child who is tiring.

## Files

| File | What it does |
| --- | --- |
| `js/levels.js` | The level table and the mastery constants — the tuning knob |
| `js/generator.js` | Grid generation, the human-technique solver, and blank carving |
| `js/audio.js` | Oscillator sound effects, and keeping Safari's audio awake |
| `js/game.js` | State, rendering, input, streaks, confetti, themes, hints, stats |
| `sw.js` | Offline cache. **Bump `CACHE` on any deploy that ships new files** |
| `manifest.webmanifest` | Makes it installable to a home screen |

A number is never taken away unless the puzzle can still be reasoned out with the
level's own technique, which also guarantees exactly one solution — a child who
types a genuinely correct digit must never be told they are wrong.
