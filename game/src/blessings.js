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
    blurb2: 'Plants deal +20% damage.',
    effect: 'damage',
    maxLevel: 2,
  },
  {
    id: 'deeproots',
    name: 'Deep Roots',
    glyph: '\u2767',
    blurb: 'Plants grow 25% faster.',
    blurb2: 'Plants grow 50% faster.',
    effect: 'growth',
    maxLevel: 2,
  },
  {
    id: 'sunwell',
    name: 'Sunwell',
    glyph: '\u2600',
    blurb: 'Every kill pays +2 sunlight.',
    blurb2: 'Every kill pays +4 sunlight.',
    effect: 'bonusSun',
    maxLevel: 2,
  },
  {
    id: 'heartwood',
    name: 'Heartwood',
    glyph: '\u2665',
    blurb: 'The Heart Tree gains +2 hearts at once.',
    blurb2: 'The Heart Tree gains +2 more hearts.',
    effect: 'hearts',
    maxLevel: 2,
  },
  {
    id: 'frostbind',
    name: 'Frostbind',
    glyph: '\u2744',
    blurb: 'Slows last 50% longer.',
    blurb2: 'Slows last twice as long.',
    effect: 'slow',
    maxLevel: 2,
  },
  {
    id: 'brambleweave',
    name: 'Brambleweave',
    glyph: '\u273F',
    blurb: 'Splashes reach 20% further.',
    blurb2: 'Splashes reach 40% further.',
    effect: 'splash',
    maxLevel: 2,
  },
  {
    id: 'goldenhour',
    name: 'Golden Hour',
    glyph: '\u25D0',
    blurb: 'Harvests pay +2 sunlight.',
    blurb2: 'Harvests pay +4 sunlight.',
    effect: 'harvest',
    maxLevel: 2,
  },
  {
    id: 'nourishroot',
    name: 'Nourishroot',
    glyph: '\u2698',
    blurb: 'Nourishing is free from now on.',
    effect: 'nourishFree',
    // A flawless-season gift with no season card: it has no level 2 to grow
    // into, so it is already at its peak.
    maxLevel: 1,
  },
  {
    id: 'wardenseye',
    name: "Warden's Eye",
    glyph: '\u25CE',
    blurb: 'Plants see 10% further.',
    blurb2: 'Plants see 20% further.',
    effect: 'range',
    maxLevel: 2,
  },
  {
    id: 'sporebloom',
    name: 'Sporebloom',
    glyph: '\u2663',
    blurb: 'Poison bites 50% harder, longer.',
    blurb2: 'Poison bites twice as hard, twice as long.',
    effect: 'poison',
    maxLevel: 2,
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
 * moment it is granted. `levels` maps a blessing id to its level (1 or 2);
 * a blessing with no entry is level 1, so a call without levels behaves
 * exactly as it always did. Level 2 deepens the effect: thornward ×1.2,
 * deeproots ×1.5, sunwell +4, frostbind ×2.0, brambleweave ×1.4,
 * goldenhour +4, wardenseye ×1.2, sporebloom ×2.0 for twice as long.
 */
export function blessingMods(held, levels) {
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
  const levelOf = (id) => {
    const blessing = blessingById(id);
    const max = blessing?.maxLevel ?? 2;
    return Math.min(Math.max(1, levels?.[id] ?? 1), max);
  };
  for (const id of held) {
    const level = levelOf(id);
    if (id === 'thornward') mods.damage *= level === 2 ? 1.2 : 1.1;
    else if (id === 'deeproots') mods.growth *= level === 2 ? 1.5 : 1.25;
    else if (id === 'sunwell') mods.bonusSun += level === 2 ? 4 : 2;
    else if (id === 'frostbind') mods.slow *= level === 2 ? 2 : 1.5;
    else if (id === 'brambleweave') mods.splash *= level === 2 ? 1.4 : 1.2;
    else if (id === 'goldenhour') mods.harvest += level === 2 ? 4 : 2;
    else if (id === 'nourishroot') mods.nourishFree = true;
    else if (id === 'wardenseye') mods.range *= level === 2 ? 1.2 : 1.1;
    else if (id === 'sporebloom') {
      mods.poison *= level === 2 ? 2 : 1.5;
      mods.poisonSeconds *= level === 2 ? 2 : 1.5;
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
