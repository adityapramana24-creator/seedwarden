// Combo and grade: the two numbers that judge a run while it is still going.
// Kills close together build a combo, and the combo multiplies the score each
// kill pays — up to eightfold — so a hot streak is worth real points. A leak,
// or three quiet seconds, spends it. The grade is a letter from the whole run
// so far: hearts kept, leaks, the longest combo and the waves cleared, added
// up in the open so the player can read exactly what the grade is made of.

/** Seconds without a kill before the combo spends itself. */
export const COMBO_WINDOW = 3;
/** The highest multiplier a streak can reach. */
export const COMBO_MAX = 8;

/** Score multiplier of a streak this long: +1 for every 4 kills, capped at 8. */
export function comboMultiplier(count) {
  return 1 + Math.min(count, (COMBO_MAX - 1) * 4) / 4;
}

export const GRADE_COLORS = {
  S: '#f2b705',
  A: '#84cc16',
  B: '#7cc7d9',
  C: '#e9a13b',
  D: '#9ca3af',
};

/**
 * The run's grade so far, from hearts kept (up to 80), a clean record (up to
 * 20), the longest combo (up to 32) and the waves cleared (up to 20): 152 at
 * most. S needs 130 — a run that kept every heart, leaked nothing and chained
 * kills; D is anything under 55. The line says what the grade is made of.
 */
export function gradeFor({ hearts, maxHearts, leaked, longestCombo, wave }) {
  const heartPoints = hearts * 8;
  const cleanPoints = Math.max(0, 20 - leaked * 4);
  const comboPoints = Math.min(longestCombo, 16) * 2;
  const wavePoints = Math.min(wave, 20);
  const points = heartPoints + cleanPoints + comboPoints + wavePoints;
  const letter = points >= 130 ? 'S' : points >= 105 ? 'A' : points >= 80 ? 'B' : points >= 55 ? 'C' : 'D';
  return {
    letter,
    points,
    line: `${hearts}/${maxHearts} hearts \u00B7 ${leaked} leaked \u00B7 longest combo \u00D7${longestCombo}`,
  };
}
