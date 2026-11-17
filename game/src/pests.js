// The pests that walk the path: their health, speed, the damage they do to
// the Heart Tree when they reach it, and the sunlight they pay when killed.
// Health grows with the wave, so the same pest is a different fight in winter.
//
// Three of them are champions — named mini-bosses with their own health bars,
// one each on waves 5, 10 and 15 — and the last is the Blight itself, the boss
// of wave 20, who fights in three phases and is the biggest thing on the
// board by far.

export const PESTS = {
  aphid: {
    id: 'aphid',
    name: 'Aphid',
    hp: 18,
    speed: 70,
    damage: 1,
    reward: 3,
    radius: 11,
    regen: 0,
    trait: 'swarm',
    blurb: 'Fast, weak, and always in a crowd.',
    note: 'swarms in crowds',
    body: '#a3b18a',
    dark: '#6a7a52',
    belly: '#d9e2c3',
  },
  moth: {
    id: 'moth',
    name: 'Moth',
    hp: 30,
    speed: 105,
    damage: 1,
    reward: 5,
    radius: 12,
    regen: 0,
    trait: 'fast',
    blurb: 'Flutters past the slow towers.',
    note: 'fast, frail',
    body: '#c9ada7',
    dark: '#8d6b66',
    belly: '#f2e9e4',
  },
  beetle: {
    id: 'beetle',
    name: 'Beetle',
    hp: 95,
    speed: 40,
    damage: 2,
    reward: 8,
    radius: 15,
    regen: 0,
    trait: 'armored',
    blurb: 'A walking shell. Takes its time.',
    note: 'armored shell',
    body: '#5c4a3a',
    dark: '#3a2d22',
    belly: '#8a6a45',
  },
  slug: {
    id: 'slug',
    name: 'Slug',
    hp: 75,
    speed: 32,
    damage: 2,
    reward: 7,
    radius: 14,
    regen: 3,
    trait: 'regenerating',
    blurb: 'Slow, slimy — and it heals.',
    note: 'slow, it heals',
    body: '#9bc53d',
    dark: '#5a7d1e',
    belly: '#d6f09a',
  },
  gloomcap: {
    id: 'gloomcap',
    name: 'Gloomcap',
    hp: 320,
    speed: 34,
    damage: 2,
    reward: 40,
    radius: 20,
    regen: 0,
    trait: 'CHAMPION',
    blurb: 'The first rot, a mushroom walking at wave 5.',
    note: 'champion · wave 5',
    body: '#4c3a8c',
    dark: '#2c2150',
    belly: '#7df9e8',
    champion: true,
  },
  mirewarden: {
    id: 'mirewarden',
    name: 'The Mire Warden',
    hp: 700,
    speed: 30,
    damage: 3,
    reward: 60,
    radius: 22,
    regen: 0,
    trait: 'CHAMPION',
    blurb: 'The swamp’s warden, walking at wave 10.',
    note: 'champion · wave 10',
    body: '#4a5d23',
    dark: '#2c3a12',
    belly: '#9bc53d',
    champion: true,
  },
  rotmother: {
    id: 'rotmother',
    name: 'Rotmother',
    hp: 1000,
    speed: 28,
    damage: 3,
    reward: 80,
    radius: 24,
    regen: 2,
    trait: 'CHAMPION',
    blurb: 'She lays the rot. She walks at wave 15.',
    note: 'champion · wave 15',
    body: '#5b21b6',
    dark: '#34125e',
    belly: '#c084fc',
    champion: true,
  },
  blight: {
    id: 'blight',
    name: 'The Blight',
    hp: 1400,
    speed: 24,
    damage: 5,
    reward: 150,
    radius: 58,
    regen: 0,
    trait: 'BOSS',
    blurb: 'The rot itself, crowned in aphids.',
    note: 'the boss · wave 20',
    body: '#3d2b56',
    dark: '#241a33',
    belly: '#7c5cbf',
    boss: true,
  },
};

/** The Blight's three phases: the health share where each one begins. */
export const BLIGHT_PHASES = [
  { phase: 1, name: 'The Crawling', above: 0.5, speed: 1, spawnSeconds: 4 },
  { phase: 2, name: 'The Swarming', above: 0.25, speed: 1.35, spawnSeconds: 3 },
  { phase: 3, name: 'The Enraged', above: 0, speed: 1.6, spawnSeconds: 2.5 },
];

/** The phase the Blight fights in at this health: 1 above half, 2 above a quarter, 3 below it. */
export function blightPhase(hp, maxHp) {
  const share = maxHp > 0 ? hp / maxHp : 0;
  if (share > 0.5) return 1;
  if (share > 0.25) return 2;
  return 3;
}

/** The phase's rules: its name, speed multiplier and aphid-spawn interval. */
export function blightPhaseRules(phase) {
  return BLIGHT_PHASES[phase - 1] ?? BLIGHT_PHASES[0];
}

/** True when this pest kind is a champion (a named mini-boss). */
export function isChampion(type) {
  return Boolean(PESTS[type]?.champion);
}

/** Health multiplier for a pest on a wave: +13% per wave after the first. */
export function hpScale(wave) {
  return 1 + 0.13 * (wave - 1);
}

/** Full health of a pest of this kind on this wave, in this season and grove. */
export function pestMaxHp(pest, wave, season, difficultyPestHp = 1) {
  return Math.round(pest.hp * hpScale(wave) * season.pestHp * difficultyPestHp);
}

/** Walking speed of a pest of this kind, in this season. */
export function pestSpeed(pest, season) {
  return pest.speed * season.pestSpeed;
}
