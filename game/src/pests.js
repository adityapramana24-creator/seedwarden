// The five pests that walk the path: their health, speed, the damage they do to
// the Heart Tree when they reach it, and the sunlight they pay when killed.
// Health grows with the wave, so the same pest is a different fight in winter.

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
    body: '#9bc53d',
    dark: '#5a7d1e',
    belly: '#d6f09a',
  },
  blight: {
    id: 'blight',
    name: 'The Blight',
    hp: 1400,
    speed: 24,
    damage: 5,
    reward: 150,
    radius: 30,
    regen: 0,
    trait: 'BOSS',
    blurb: 'The rot itself, crowned in aphids.',
    body: '#3d2b56',
    dark: '#241a33',
    belly: '#7c5cbf',
  },
};

/** Health multiplier for a pest on a wave: +13% per wave after the first. */
export function hpScale(wave) {
  return 1 + 0.13 * (wave - 1);
}

/** Full health of a pest of this kind on this wave, in this season. */
export function pestMaxHp(pest, wave, season) {
  return Math.round(pest.hp * hpScale(wave) * season.pestHp);
}

/** Walking speed of a pest of this kind, in this season. */
export function pestSpeed(pest, season) {
  return pest.speed * season.pestSpeed;
}
