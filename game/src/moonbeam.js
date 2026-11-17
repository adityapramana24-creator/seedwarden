// The Moonbeam: the warden's second hero power. Every kill charges the moon
// with moonlight; at a full charge, W calls a beam down on the row thickest
// with pests. The rules live here as pure data and one pure function — the
// world calls them, the renderer paints the beam — so the targeting can be
// tested in Node without a browser.

import { BOARD } from './config.js';

/** Moonlight a full charge holds, and what one kill pays toward it. */
export const MOONLIGHT_MAX = 100;
export const MOONLIGHT_PER_KILL = 1;
/** The beam's price (a full charge), its damage to the row, the slow it leaves, and how long the beam stays visible. */
export const MOONBEAM_COST = 100;
export const MOONBEAM_DAMAGE = 60;
export const MOONBEAM_SLOW = 0.5;
export const MOONBEAM_SLOW_SECONDS = 2;
export const MOONBEAM_BEAM_SECONDS = 0.9;

/** The board row a pest's centre sits in, clamped to the board. */
export function rowOf(pest) {
  return Math.max(0, Math.min(BOARD.rows - 1, Math.floor((pest.y - BOARD.y) / BOARD.cell)));
}

/**
 * The row the Moonbeam strikes: the one holding the most pest health right
 * now. Ties break toward the lowest row, so the choice is deterministic for
 * a fixed field. -1 when the field is empty.
 */
export function pickMoonbeamRow(pests) {
  let bestRow = -1;
  let bestHp = 0;
  for (let row = 0; row < BOARD.rows; row += 1) {
    let hp = 0;
    for (const pest of pests) {
      if (pest.hp > 0 && rowOf(pest) === row) hp += pest.hp;
    }
    if (hp > bestHp) {
      bestHp = hp;
      bestRow = row;
    }
  }
  return bestRow;
}
