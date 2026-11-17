// The three groves: the difficulty the player picks on the title screen.
// Seedling is a gentle first garden (more sun, more hearts); Warden is the
// game as designed; Thornstorm is the blight unchained (less of everything,
// tougher pests). The choice is real: it sets the starting purse, the
// tree's hearts and the pests' health for the whole run, and the victory
// screen names the grove the year was won in.

export const DIFFICULTIES = [
  {
    id: 'seedling',
    name: 'Seedling',
    tagline: 'A gentle first garden',
    sun: 200,
    hearts: 12,
    pestHp: 1,
  },
  {
    id: 'warden',
    name: 'Warden',
    tagline: 'The intended garden',
    sun: 150,
    hearts: 10,
    pestHp: 1,
  },
  {
    id: 'thornstorm',
    name: 'Thornstorm',
    tagline: 'The blight unchained',
    sun: 120,
    hearts: 8,
    pestHp: 1.15,
  },
];

/** The grove a run starts in when the player picks nothing: Warden. */
export const DEFAULT_DIFFICULTY = 'warden';

export function difficultyById(id) {
  return DIFFICULTIES.find((difficulty) => difficulty.id === id) ?? DIFFICULTIES[1];
}

/** The next grove up from this one: the victory screen's NEXT GOAL. */
export function nextDifficulty(id) {
  const index = DIFFICULTIES.findIndex((difficulty) => difficulty.id === id);
  if (index === -1 || index >= DIFFICULTIES.length - 1) return null;
  return DIFFICULTIES[index + 1];
}
