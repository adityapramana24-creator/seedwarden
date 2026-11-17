// Grove Blessings: permanent boons the grove grants for the rest of the run.
// Most arrive with a drafted season — each season card carries one — and two
// are kept back as the reward for a flawless season (five waves without a
// single leak). A blessing is never a number on a shelf: every one changes a
// rule the player can feel, and the panel on the right lists what the grove
// has granted so far.

export const BLESSINGS = [
  {
    id: 'thornward',
    name: 'Thornward',
    glyph: '\u2726',
    blurb: 'Plants deal +10% damage.',
    effect: 'damage',
  },
  {
    id: 'deeproots',
    name: 'Deep Roots',
    glyph: '\u2767',
    blurb: 'Plants grow 25% faster.',
    effect: 'growth',
  },
  {
    id: 'sunwell',
    name: 'Sunwell',
    glyph: '\u2600',
    blurb: 'Every kill pays +2 sunlight.',
    effect: 'bonusSun',
  },
  {
    id: 'heartwood',
    name: 'Heartwood',
    glyph: '\u2665',
    blurb: 'The Heart Tree gains +2 hearts at once.',
    effect: 'hearts',
  },
  {
    id: 'frostbind',
    name: 'Frostbind',
    glyph: '\u2744',
    blurb: 'Slows last 50% longer.',
    effect: 'slow',
  },
  {
    id: 'brambleweave',
    name: 'Brambleweave',
    glyph: '\u273F',
    blurb: 'Splashes reach 20% further.',
    effect: 'splash',
  },
  {
    id: 'goldenhour',
    name: 'Golden Hour',
    glyph: '\u25D0',
    blurb: 'Harvests pay +2 sunlight.',
    effect: 'harvest',
  },
  {
    id: 'nourishroot',
    name: 'Nourishroot',
    glyph: '\u2698',
    blurb: 'Nourishing is free from now on.',
    effect: 'nourishFree',
  },
  {
    id: 'wardenseye',
    name: "Warden's Eye",
    glyph: '\u25CE',
    blurb: 'Plants see 10% further.',
    effect: 'range',
  },
  {
    id: 'sporebloom',
    name: 'Sporebloom',
    glyph: '\u2663',
    blurb: 'Poison bites 50% harder, longer.',
    effect: 'poison',
  },
];

/**
 * Blessings no season card carries: only a flawless season (five waves, no
 * leak) can grant these, so a careful run earns what a careless one cannot.
 */
export const FLAWLESS_POOL = ['nourishroot', 'sporebloom'];

export function blessingById(id) {
  return BLESSINGS.find((blessing) => blessing.id === id) ?? null;
}

/**
 * The combined rule changes of the blessings held: multipliers the world
 * folds into damage, growth, slows, splash, range and poison, plus the flat
 * sunlight bonuses. Heartwood has no multiplier — it pays its hearts the
 * moment it is granted.
 */
export function blessingMods(held) {
  const mods = {
    damage: 1,
    growth: 1,
    slow: 1,
    splash: 1,
    range: 1,
    poison: 1,
    poisonSeconds: 1,
    harvest: 0,
    bonusSun: 0,
    nourishFree: false,
  };
  for (const id of held) {
    if (id === 'thornward') mods.damage *= 1.1;
    else if (id === 'deeproots') mods.growth *= 1.25;
    else if (id === 'sunwell') mods.bonusSun += 2;
    else if (id === 'frostbind') mods.slow *= 1.5;
    else if (id === 'brambleweave') mods.splash *= 1.2;
    else if (id === 'goldenhour') mods.harvest += 2;
    else if (id === 'nourishroot') mods.nourishFree = true;
    else if (id === 'wardenseye') mods.range *= 1.1;
    else if (id === 'sporebloom') {
      mods.poison *= 1.5;
      mods.poisonSeconds *= 1.5;
    }
  }
  return mods;
}

/**
 * Pick a blessing for a flawless season: one of the two kept-back blessings
 * first, any other unheld blessing after that, nothing when all ten are held.
 * Drawn with the world's seeded random, so it is the same for the same seed.
 */
export function drawFlawlessBlessing(random, held) {
  const keptBack = FLAWLESS_POOL.filter((id) => !held.includes(id));
  const pool = keptBack.length > 0
    ? keptBack
    : BLESSINGS.map((blessing) => blessing.id).filter((id) => !held.includes(id));
  if (pool.length === 0) return null;
  return pool[Math.floor(random() * pool.length)];
}
