// The Season Draft: the player chooses the next season. The first five waves
// are always Bloom Spring, so the opening is gentle and learnable; after every
// fifth wave the game pauses and offers three season cards. Each card is a
// season variant — its own growth, damage, reward and pest rules, with a risk
// printed on it — and each one carries a Grove Blessing that lasts the rest of
// the game. Picking a season is the game's signature choice: no two years turn
// the same way, and the choice is always a trade, never a free lunch.
//
// The offer is drawn with the world's seeded random, so the same seed always
// offers the same cards in the same order; the autopilot and the player both
// pick from the same three.

import { SEASONS } from './seasons.js';

/** Waves in one season: a draft follows every fifth cleared wave. */
export const DRAFT_EVERY = 5;

/**
 * The eight season cards. `base` names the season the card's colours and glyph
 * come from; the numbers are the card's own rules for its five waves. `risk`
 * is printed on the card when the season asks something back. `blessing` is
 * the Grove Blessing the card grants when picked.
 */
export const SEASON_CARDS = [
  {
    id: 'bloomspring',
    name: 'Bloom Spring',
    base: 'spring',
    tagline: 'Plants grow twice as fast',
    growth: 2,
    damage: 1,
    reward: 1,
    pestSpeed: 1,
    pestHp: 1,
    risk: null,
    blessing: 'deeproots',
  },
  {
    id: 'stormspring',
    name: 'Stormspring',
    base: 'spring',
    tagline: 'Fast growth, harder hits — and quicker pests',
    growth: 1.5,
    damage: 1.1,
    reward: 1,
    pestSpeed: 1.15,
    pestHp: 1,
    risk: 'Pests move 15% faster',
    blessing: 'thornward',
  },
  {
    id: 'highsummer',
    name: 'High Summer',
    base: 'summer',
    tagline: 'Plants deal +25% damage',
    growth: 1,
    damage: 1.25,
    reward: 1,
    pestSpeed: 1,
    pestHp: 1,
    risk: null,
    blessing: 'goldenhour',
  },
  {
    id: 'droughtsummer',
    name: 'Drought Summer',
    base: 'summer',
    tagline: 'Scorching damage, thin rewards',
    growth: 1,
    damage: 1.4,
    reward: 0.8,
    pestSpeed: 1,
    pestHp: 1,
    risk: 'Kills pay 20% less sunlight',
    blessing: 'wardenseye',
  },
  {
    id: 'emberautumn',
    name: 'Ember Autumn',
    base: 'autumn',
    tagline: 'Kills pay +50% sunlight',
    growth: 1,
    damage: 1,
    reward: 1.5,
    pestSpeed: 1,
    pestHp: 1,
    risk: null,
    blessing: 'sunwell',
  },
  {
    id: 'rotautumn',
    name: 'Rot Autumn',
    base: 'autumn',
    tagline: 'Rich kills — and tougher pests',
    growth: 1,
    damage: 1,
    reward: 1.75,
    pestSpeed: 1,
    pestHp: 1.15,
    risk: 'Pests are 15% tougher',
    blessing: 'brambleweave',
  },
  {
    id: 'deepwinter',
    name: 'Deep Winter',
    base: 'winter',
    tagline: 'Pests are slower but tougher; growth is halved',
    growth: 0.5,
    damage: 1,
    reward: 1,
    pestSpeed: 0.8,
    pestHp: 1.3,
    risk: null,
    blessing: 'heartwood',
  },
  {
    id: 'frostfall',
    name: 'Frostfall',
    base: 'winter',
    tagline: 'Pests crawl — but the cold bites your plants too',
    growth: 0.75,
    damage: 0.9,
    reward: 1,
    pestSpeed: 0.7,
    pestHp: 1,
    risk: 'Plants hit 10% softer',
    blessing: 'frostbind',
  },
];

/** The card a run starts with: Bloom Spring, waves 1–5, no choice yet. */
export const STARTING_CARD = 'bloomspring';

export function cardById(id) {
  return SEASON_CARDS.find((card) => card.id === id) ?? null;
}

/**
 * The season a card plays as: the base season's glyph and tints, the card's
 * own name, tagline and rules. The result has the same shape as a season in
 * seasons.js, so the world can use it wherever a season goes.
 */
export function seasonOfCard(card) {
  const base = SEASONS.find((season) => season.id === card.base) ?? SEASONS[0];
  return {
    id: card.id,
    name: card.name,
    glyph: base.glyph,
    tagline: card.tagline,
    growth: card.growth,
    damage: card.damage,
    reward: card.reward,
    pestSpeed: card.pestSpeed,
    pestHp: card.pestHp,
    tint: base.tint,
    accent: base.accent,
  };
}

/** True when clearing this wave opens a draft: every fifth wave. */
export function isDraftWave(wave) {
  return wave > 0 && wave % DRAFT_EVERY === 0;
}

function shuffle(random, items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Draw three cards for a draft. Cards whose blessing the player already holds
 * sink to the back of the deck, so the offer usually brings something new;
 * the current season's card never appears in its own draft. The draw uses the
 * world's seeded random, so it is the same for the same seed.
 */
export function drawOffer(random, heldBlessings, currentCardId) {
  const pool = SEASON_CARDS.filter((card) => card.id !== currentCardId);
  const fresh = shuffle(random, pool.filter((card) => !heldBlessings.includes(card.blessing)));
  const stale = shuffle(random, pool.filter((card) => heldBlessings.includes(card.blessing)));
  return [...fresh, ...stale].slice(0, 3);
}
