// Feats: the five honours a run can earn, judged when the year is won (and
// tracked live, so the side panel can count them while the game is still
// going). Each one names a way of playing well, not a number to grind: no
// leaks at all, a garden in full bloom, the Blight felled, a full purse at
// the end, and every wave called early. The victory screen shows the row;
// the next goal points at the grove above the one just won.

export const FEATS = [
  {
    id: 'untouched',
    name: 'Untouched',
    glyph: '\u2665',
    blurb: 'No pest ever reached the tree.',
  },
  {
    id: 'fullbloom',
    name: 'Full Bloom',
    glyph: '\u273F',
    blurb: '12 or more plants in bloom at the win.',
  },
  {
    id: 'blightslayer',
    name: 'Blight Slayer',
    glyph: '\u2620',
    blurb: 'The Blight fell to the grove.',
  },
  {
    id: 'hoarder',
    name: 'Hoarder',
    glyph: '\u2600',
    blurb: '1,000 sunlight in the purse at the win.',
  },
  {
    id: 'swiftseason',
    name: 'Swift Season',
    glyph: '\u26A1',
    blurb: 'Every wave called early, none waited out.',
  },
];

/** Plants in bloom needed for Full Bloom. */
export const FULL_BLOOM_COUNT = 12;
/** Sunlight in the purse needed for Hoarder. */
export const HOARDER_SUN = 1000;

export function featById(id) {
  return FEATS.find((feat) => feat.id === id) ?? null;
}

/**
 * The feats this run has earned so far, as ids in FEATS order. Live, the
 * list is what the run holds right now (Blight Slayer only once the boss
 * is dead); at the victory screen it is the run's final honours.
 */
export function featsFor(state) {
  const earned = [];
  if (state.leaked === 0) earned.push('untouched');
  const bloomed = state.plants.filter((plant) => plant.stage === 2).length;
  if (bloomed >= FULL_BLOOM_COUNT) earned.push('fullbloom');
  if (state.blightKilled) earned.push('blightslayer');
  if (state.sun >= HOARDER_SUN) earned.push('hoarder');
  if (state.wavesStarted > 0 && state.manualStarts === state.wavesStarted) earned.push('swiftseason');
  return earned;
}

/**
 * The next goal after this run: the grove above the one just won, or — when
 * the year was lost — the next wave to reach. Plain words, no numbers faked.
 */
export function nextGoal({ won, difficulty, wave }) {
  if (!won) return `Reach wave ${Math.min(20, wave + 1)}.`;
  if (difficulty === 'thornstorm') return 'Win Thornstorm flawless — no leaks at all.';
  if (difficulty === 'seedling') return 'Win on Warden.';
  return 'Win on Thornstorm.';
}
