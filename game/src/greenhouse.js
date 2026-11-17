// The Greenhouse: the grove's permanent upgrades, bought with seeds banked
// from won years. Three tracks, three tiers each; a tier only opens once the
// one below it is grown. The effects apply to every new run from then on, so
// a lost year still leaves the grove stronger than it was. Storage is the
// same localStorage pattern as records.js (comma-separated ids, try/catch,
// safe with storage off); the pure functions (costs, gating, effects) run in
// Node with no window at all.

import { GREENHOUSE_KEY } from './config.js';

/** The three tracks: what each one grows, in words. */
export const TRACKS = [
  { id: 'oldwood', name: 'The Oldwood', glyph: '\u2665', blurb: 'A sturdier Heart Tree.' },
  { id: 'thornwork', name: 'Thornwork', glyph: '\u2726', blurb: 'Sharper plants.' },
  { id: 'sunfields', name: 'Sunfields', glyph: '\u2600', blurb: 'A richer purse.' },
];

/**
 * The nine upgrades. `effect` is one rule change each: hearts (added to the
 * tree at run start), damage (a multiplier on every shot), startSun (added
 * to the opening purse), sunMul (a multiplier on every kill's sunlight).
 * Names stay clear of the ten Grove Blessings, so the two systems never
 * share a word.
 */
export const UPGRADES = [
  { id: 'sturdyboughs', track: 'oldwood', tier: 1, name: 'Sturdy Boughs', glyph: '\u2665', blurb: 'The Heart Tree starts with +1 heart.', cost: 4, effect: { hearts: 1 } },
  { id: 'ironbark', track: 'oldwood', tier: 2, name: 'Ironbark', glyph: '\u2665', blurb: 'The Heart Tree starts with +2 hearts.', cost: 8, effect: { hearts: 2 } },
  { id: 'ancientcrown', track: 'oldwood', tier: 3, name: 'Ancient Crown', glyph: '\u2665', blurb: 'The Heart Tree starts with +2 hearts.', cost: 12, effect: { hearts: 2 } },
  { id: 'keenthorns', track: 'thornwork', tier: 1, name: 'Keen Thorns', glyph: '\u2726', blurb: 'Plants deal +5% damage.', cost: 4, effect: { damage: 1.05 } },
  { id: 'moonlitedge', track: 'thornwork', tier: 2, name: 'Moonlit Edge', glyph: '\u2726', blurb: 'Plants deal +10% damage.', cost: 8, effect: { damage: 1.1 } },
  { id: 'grovewrath', track: 'thornwork', tier: 3, name: "Grove's Wrath", glyph: '\u2726', blurb: 'Plants deal +10% damage.', cost: 12, effect: { damage: 1.1 } },
  { id: 'richsoil', track: 'sunfields', tier: 1, name: 'Rich Soil', glyph: '\u2600', blurb: 'Start each run with +25 sunlight.', cost: 4, effect: { startSun: 25 } },
  { id: 'goldenharvest', track: 'sunfields', tier: 2, name: 'Golden Harvest', glyph: '\u2600', blurb: 'Kills pay +10% sunlight.', cost: 8, effect: { sunMul: 1.1 } },
  { id: 'bountifulgrove', track: 'sunfields', tier: 3, name: 'Bountiful Grove', glyph: '\u2600', blurb: 'Start each run with +50 sunlight.', cost: 12, effect: { startSun: 50 } },
];

export function upgradeById(id) {
  return UPGRADES.find((upgrade) => upgrade.id === id) ?? null;
}

/** The combined rule changes of the upgrades grown: what a new run starts with. */
export function greenhouseEffects(grownIds) {
  const effects = { hearts: 0, damageMul: 1, startSun: 0, sunMul: 1 };
  for (const id of grownIds ?? []) {
    const upgrade = upgradeById(id);
    if (!upgrade) continue;
    if (upgrade.effect.hearts) effects.hearts += upgrade.effect.hearts;
    if (upgrade.effect.damage) effects.damageMul *= upgrade.effect.damage;
    if (upgrade.effect.startSun) effects.startSun += upgrade.effect.startSun;
    if (upgrade.effect.sunMul) effects.sunMul *= upgrade.effect.sunMul;
  }
  return effects;
}

/**
 * Whether this upgrade can be grown right now: it must exist, not be grown
 * yet, have the tier below it grown, and the purse must hold its cost.
 */
export function canGrow(grownIds, id, seeds) {
  const upgrade = upgradeById(id);
  if (!upgrade) return { ok: false, reason: 'no such upgrade' };
  const grown = grownIds ?? [];
  if (grown.includes(id)) return { ok: false, reason: 'already grown' };
  if (upgrade.tier > 1) {
    const below = UPGRADES.find((item) => item.track === upgrade.track && item.tier === upgrade.tier - 1);
    if (below && !grown.includes(below.id)) return { ok: false, reason: `grow ${below.name} first` };
  }
  if (seeds < upgrade.cost) return { ok: false, reason: `needs ${upgrade.cost} seeds` };
  return { ok: true, reason: '' };
}

/**
 * Grow an upgrade: the seeds are spent, the id joins the grown list. Pure —
 * the caller writes the result back to storage. Returns the new list and
 * purse (unchanged when the grow is refused).
 */
export function growUpgrade(grownIds, id, seeds) {
  const verdict = canGrow(grownIds, id, seeds);
  if (!verdict.ok) return { grown: [...(grownIds ?? [])], seeds, ok: false, reason: verdict.reason };
  const upgrade = upgradeById(id);
  return { grown: [...(grownIds ?? []), id], seeds: seeds - upgrade.cost, ok: true, reason: '' };
}

// Storage: the grown ids as one comma-separated string. The in-memory copy
// covers Node (no window) and storage-off browsers.
let memoryStore = [];
function readText() {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(GREENHOUSE_KEY);
  } catch {
    return null;
  }
}
function writeText(value) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(GREENHOUSE_KEY, value);
  } catch {
    // Storage off: the in-memory copy still holds it for this session.
  }
}

/** The upgrades grown so far, as ids in the order they were grown. */
export function readGreenhouse() {
  const raw = readText();
  if (raw === null) return [...memoryStore];
  if (raw === '') return [];
  return raw.split(',').filter((id) => upgradeById(id) !== null);
}

/** Persist the grown list (and the in-memory copy for Node). */
export function writeGreenhouse(ids) {
  memoryStore = [...ids];
  writeText(ids.join(','));
}
