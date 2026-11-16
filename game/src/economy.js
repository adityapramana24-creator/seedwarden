// Sunlight, the one currency: what things cost, what kills pay, and the score.
// Kills pay the pest's reward (more in autumn); calling a wave early pays a
// bonus for the seconds saved; selling a plant refunds most of its price.

import { EARLY_BONUS, START_SUN } from './config.js';
import { sellValue } from './plants.js';

/** The purse a new game starts with. */
export function startingSun() {
  return START_SUN;
}

/** Sunlight a kill pays: the pest's reward, scaled by the season. */
export function killReward(pest, season) {
  return Math.round(pest.reward * season.reward);
}

/** Sunlight for calling the next wave early, from the seconds left on the wait. */
export function earlyCallBonus(secondsLeft) {
  return EARLY_BONUS.flat + Math.round(secondsLeft * EARLY_BONUS.perSecond);
}

/** Sunlight refunded for selling a plant. */
export function refundFor(plant) {
  return sellValue(plant);
}

/** Score for a kill: the pest's reward, tenfold. */
export function killScore(pest) {
  return pest.reward * 10;
}

/** Score for clearing a wave: a hundred per wave number. */
export function waveScore(wave) {
  return wave * 100;
}
