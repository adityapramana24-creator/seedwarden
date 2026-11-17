// The year's twenty waves: each one a list of groups, each group a pest kind, a
// count and the gap between spawns. The mix shifts as the year turns — aphid
// swarms in spring, moths and beetles in summer, slugs in autumn, and the Blight
// itself in the deep of winter. Three champions walk the year: Gloomcap on
// wave 5, the Mire Warden on 10, Rotmother on 15. After wave 20, endless mode
// cycles the year's hardest waves with ever more health.

import { WAVES_PER_YEAR } from './config.js';

const G = (type, count, gap) => ({ type, count, gap });

export const WAVES = [
  [G('aphid', 6, 0.9)],
  [G('aphid', 10, 0.8)],
  [G('aphid', 8, 0.7), G('moth', 3, 1.2)],
  [G('aphid', 12, 0.6), G('moth', 4, 1.0)],
  [G('gloomcap', 1, 1), G('beetle', 5, 1.6), G('aphid', 8, 0.6)],
  [G('moth', 10, 0.7), G('aphid', 8, 0.5)],
  [G('beetle', 8, 1.2), G('moth', 6, 0.8)],
  [G('slug', 6, 1.4), G('aphid', 10, 0.5)],
  [G('beetle', 10, 1.0), G('moth', 8, 0.7)],
  [G('mirewarden', 1, 1), G('slug', 8, 1.0), G('beetle', 8, 1.0), G('moth', 6, 0.7)],
  [G('aphid', 20, 0.35), G('moth', 8, 0.6)],
  [G('slug', 10, 0.9), G('beetle', 10, 0.9)],
  [G('moth', 16, 0.5), G('aphid', 14, 0.4)],
  [G('beetle', 14, 0.8), G('slug', 8, 0.9)],
  [G('rotmother', 1, 1), G('slug', 12, 0.7), G('beetle', 12, 0.7), G('moth', 10, 0.5)],
  [G('aphid', 24, 0.3), G('beetle', 10, 0.8)],
  [G('moth', 20, 0.4), G('slug', 10, 0.8)],
  [G('beetle', 18, 0.6), G('slug', 12, 0.7)],
  [G('slug', 16, 0.5), G('moth', 18, 0.4), G('beetle', 12, 0.6)],
  [G('blight', 1, 1), G('aphid', 16, 0.5), G('beetle', 10, 0.8), G('moth', 12, 0.5)],
];

/** The groups of a wave: the year's table, or an endless remix past wave 20. */
export function waveGroups(wave) {
  if (wave <= WAVES_PER_YEAR) return WAVES[wave - 1];
  const cycle = (wave - WAVES_PER_YEAR - 1) % 5;
  const table = [WAVES[15], WAVES[16], WAVES[17], WAVES[18], WAVES[19]][cycle];
  const extra = Math.floor((wave - WAVES_PER_YEAR - 1) / 5);
  return table.map((group) => ({ ...group, count: group.count + extra * 2 }));
}

/** How many pests a wave sends in total. */
export function waveSize(wave) {
  return waveGroups(wave).reduce((total, group) => total + group.count, 0);
}

/** A short preview of a wave's mix, for the side panel: kind, count, in order. */
export function wavePreview(wave) {
  return waveGroups(wave).map((group) => ({ type: group.type, count: group.count }));
}

/**
 * The three waves after the next one, one line each: the wave number and its
 * lead group. The side panel's forecast line shows them, so the player can
 * read what is coming beyond the wave already queued. Endless-aware: past
 * wave 20 the remix table answers, as it does for the preview itself.
 */
export function waveForecast(nextWave) {
  const forecast = [];
  for (let offset = 1; offset <= 3; offset += 1) {
    const wave = nextWave + offset;
    const groups = waveGroups(wave);
    const lead = groups[0];
    forecast.push({ wave, type: lead.type, count: lead.count });
  }
  return forecast;
}
