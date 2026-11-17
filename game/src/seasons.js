// The four seasons: five waves each, one year per game. Every season changes the
// rules a little — growth, damage, rewards or the pests themselves — and tints the
// garden, so the player can read the season from the board at a glance. Since v5
// each season is also a named grove the year travels through: the draft cards,
// the HUD and the year map name the place, not just the weather.

export const SEASON_LENGTH = 5;

export const SEASONS = [
  {
    id: 'spring',
    name: 'Spring',
    grove: 'Dewmere Fen',
    groveNote: 'Soft rain, quick growth',
    glyph: '\u273F',
    tagline: 'Plants grow twice as fast',
    growth: 2,
    damage: 1,
    reward: 1,
    pestSpeed: 1,
    pestHp: 1,
    tint: '#7fb069',
    accent: '#a7d489',
  },
  {
    id: 'summer',
    name: 'Summer',
    grove: 'Ember Orchard',
    groveNote: 'Scorching light, hard hits',
    glyph: '\u2600',
    tagline: 'Plants deal +25% damage',
    growth: 1,
    damage: 1.25,
    reward: 1,
    pestSpeed: 1,
    pestHp: 1,
    tint: '#e9c46a',
    accent: '#f4d35e',
  },
  {
    id: 'autumn',
    name: 'Autumn',
    grove: 'Amber Hollow',
    groveNote: 'Falling leaves, rich kills',
    glyph: '\u2766',
    tagline: 'Kills pay +50% sunlight',
    growth: 1,
    damage: 1,
    reward: 1.5,
    pestSpeed: 1,
    pestHp: 1,
    tint: '#d98e32',
    accent: '#e9a13b',
  },
  {
    id: 'winter',
    name: 'Winter',
    grove: 'Frosthollow',
    groveNote: 'Deep cold, slow and tough',
    glyph: '\u2744',
    tagline: 'Pests are slower but tougher; growth is halved',
    growth: 0.5,
    damage: 1,
    reward: 1,
    pestSpeed: 0.8,
    pestHp: 1.3,
    tint: '#8ecae6',
    accent: '#bde0fe',
  },
];

/** The grove a season card's base season names (Spring is Dewmere Fen, and so on). */
export function groveFor(baseId) {
  return SEASONS.find((season) => season.id === baseId)?.grove ?? SEASONS[0].grove;
}

/** The season a wave belongs to: waves 1-5 spring, 6-10 summer, and so on, cycling. */
export function seasonForWave(wave) {
  return SEASONS[Math.floor((wave - 1) / SEASON_LENGTH) % SEASONS.length];
}

/** Waves left in the current season, counting the wave now showing. */
export function wavesLeftInSeason(wave) {
  return SEASON_LENGTH - ((wave - 1) % SEASON_LENGTH);
}
