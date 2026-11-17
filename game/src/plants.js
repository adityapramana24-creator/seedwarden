// The six plant-towers: their costs, stats and growth. Every plant is planted as
// a seed and grows through three visible stages — seed, sprout, bloom — gaining
// damage and range as it grows. A bloomed plant can be nourished once for +50%
// damage. Stats below are the seed-stage base; stage multipliers apply on top.

export const STAGE_SEED = 0;
export const STAGE_SPROUT = 1;
export const STAGE_BLOOM = 2;
export const STAGE_NAMES = ['Seed', 'Sprout', 'Bloom'];

/** Seconds of growth to the next stage, before the season's growth multiplier. */
export const GROWTH_SECONDS = 20;

/** Damage and range multipliers per growth stage. */
export const STAGE_DAMAGE = [1, 1.5, 2.2];
export const STAGE_RANGE = [0.85, 1, 1.15];
/** Sunspore's sun per harvest, per growth stage. */
export const STAGE_HARVEST = [3, 5, 7];
/** Damage multiplier from one nourishing, and its cost as a share of the plant's price. */
export const NOURISH_DAMAGE = 1.5;
export const NOURISH_COST_SHARE = 0.5;
/** Share of the plant's price refunded when it is sold. */
export const SELL_SHARE = 0.7;
/** Seconds between one Sunspore's harvests. */
export const HARVEST_SECONDS = 5;

export const PLANTS = [
  {
    id: 'thorn',
    name: 'Thornspitter',
    short: 'Thorn',
    cost: 50,
    damage: 8,
    rate: 1.2,
    range: 158,
    splash: 0,
    slow: 0,
    slowSeconds: 0,
    poison: 0,
    poisonSeconds: 0,
    harvest: false,
    blurb: 'Steady thorns, one pest at a time.',
    color: '#7ed491',
    dark: '#2a7a4a',
    shot: '#d9f99d',
  },
  {
    id: 'frost',
    name: 'Frostbloom',
    short: 'Frost',
    cost: 75,
    damage: 2,
    rate: 1,
    range: 130,
    splash: 0,
    slow: 0.45,
    slowSeconds: 1.4,
    poison: 0,
    poisonSeconds: 0,
    harvest: false,
    blurb: 'Chills pests in place, slowing the swarm.',
    color: '#9fe3f5',
    dark: '#3a8fb0',
    shot: '#bde0fe',
  },
  {
    id: 'sunspore',
    name: 'Sunspore',
    short: 'Sun',
    cost: 60,
    damage: 0,
    rate: 0,
    range: 0,
    splash: 0,
    slow: 0,
    slowSeconds: 0,
    poison: 0,
    poisonSeconds: 0,
    harvest: true,
    blurb: 'Grows sunlight. No thorns at all.',
    color: '#ffd94a',
    dark: '#b08a12',
    shot: '#fde68a',
  },
  {
    id: 'bramble',
    name: 'Brambleburst',
    short: 'Bramble',
    cost: 100,
    damage: 14,
    rate: 0.7,
    range: 172,
    splash: 66,
    slow: 0,
    slowSeconds: 0,
    poison: 0,
    poisonSeconds: 0,
    harvest: false,
    blurb: 'Exploding brambles splash the whole pack.',
    color: '#ff9a5c',
    dark: '#8a4a1e',
    shot: '#fdba74',
  },
  {
    id: 'vine',
    name: 'Vinewhip',
    short: 'Vine',
    cost: 120,
    damage: 5,
    rate: 3.5,
    range: 108,
    splash: 0,
    slow: 0,
    slowSeconds: 0,
    poison: 0,
    poisonSeconds: 0,
    harvest: false,
    blurb: 'Lashes fast at close range. Huge damage up close.',
    color: '#b8f04a',
    dark: '#5a8a1e',
    shot: '#bef264',
  },
  {
    id: 'spore',
    name: 'Sporecloud',
    short: 'Spore',
    cost: 150,
    damage: 3,
    rate: 0.8,
    range: 158,
    splash: 86,
    slow: 0,
    slowSeconds: 0,
    poison: 3,
    poisonSeconds: 3,
    harvest: false,
    blurb: 'Poison spores linger, draining whole groups.',
    color: '#c9a7ff',
    dark: '#6d3fd4',
    shot: '#ddd6fe',
  },
];

export function plantById(id) {
  return PLANTS.find((plant) => plant.id === id) ?? null;
}

/** Damage of one shot from this plant, at its stage, nourished or not, this season and these blessings. */
export function plantDamage(plant, stage, nourished, season, mods) {
  return plant.damage * STAGE_DAMAGE[stage] * (nourished ? NOURISH_DAMAGE : 1) * season.damage * (mods?.damage ?? 1);
}

/** Range in pixels of this plant, at its stage and these blessings. */
export function plantRange(plant, stage, mods) {
  return plant.range * STAGE_RANGE[stage] * (mods?.range ?? 1);
}

/** Sunlight one harvest of this Sunspore pays, at its stage and these blessings. */
export function plantHarvest(stage, mods) {
  return STAGE_HARVEST[stage] + (mods?.harvest ?? 0);
}

/** Sunlight to nourish a bloomed plant once — free with the Nourishroot blessing. */
export function nourishCost(plant, mods) {
  if (mods?.nourishFree) return 0;
  return Math.round(plant.cost * NOURISH_COST_SHARE);
}

/** Sunlight refunded when a plant is sold. */
export function sellValue(plant) {
  return Math.round(plant.cost * SELL_SHARE);
}
