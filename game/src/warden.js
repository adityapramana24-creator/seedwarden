// The Warden: the grove's guardian wisp, the player's own character on the
// board. The player moves it with click-to-move; plants near it deal more
// damage (positioning matters), and clicking a pest within reach zaps it.
// The rules live here as pure data and pure functions — the world calls
// them, the renderer paints the wisp — so the aura, the zap's reach and the
// targeting can be tested in Node without a browser.

import { BOARD } from './config.js';

/** Plants this close to the Warden deal more damage. */
export const WARDEN_AURA_RADIUS = 110;
/** How much more damage plants in the aura deal. */
export const WARDEN_AURA_DAMAGE = 1.25;
/** The zap's damage to one pest, and the seconds before it can fire again. */
export const WARDEN_ZAP_DAMAGE = 30;
export const WARDEN_ZAP_COOLDOWN = 3;
/** How far from the Warden a pest can be zapped. */
export const WARDEN_ZAP_RANGE = 220;
/** How fast the Warden glides, in pixels per second. */
export const WARDEN_SPEED = 260;
/** How long the zap's bolt stays visible, in seconds. */
export const WARDEN_BOLT_SECONDS = 0.25;
/** Where the Warden waits: beside the Heart Tree, guarding it. */
export const WARDEN_HOME = { x: 790, y: 590 };

/** A plant's damage multiplier from the Warden's aura: ×1.25 inside it, ×1 outside. */
export function wardenAuraMul(plant, warden) {
  if (!warden) return 1;
  const dx = plant.x - warden.x;
  const dy = plant.y - warden.y;
  return dx * dx + dy * dy <= WARDEN_AURA_RADIUS * WARDEN_AURA_RADIUS
    ? WARDEN_AURA_DAMAGE
    : 1;
}

/** True when the pest is close enough to the Warden to be zapped. */
export function wardenInZapRange(warden, pest) {
  if (!warden || !pest) return false;
  return Math.hypot(pest.x - warden.x, pest.y - warden.y) <= WARDEN_ZAP_RANGE;
}

/**
 * The pest under a click: the nearest living pest whose circle (with a
 * small margin for a fat finger) holds the point, or null when the click
 * lands on open ground. The nearest wins, so a click between two pests
 * zaps the one the player aimed at.
 */
export function wardenZapTarget(pests, x, y) {
  let best = null;
  let bestDistance = Infinity;
  for (const pest of pests) {
    if (pest.hp <= 0) continue;
    const distance = Math.hypot(pest.x - x, pest.y - y);
    if (distance <= pest.radius + 4 && distance < bestDistance) {
      best = pest;
      bestDistance = distance;
    }
  }
  return best;
}

/** A point clamped to the board, so the Warden never leaves the garden. */
export function clampToBoard(x, y) {
  return {
    x: Math.max(BOARD.x + 16, Math.min(BOARD.x + BOARD.cols * BOARD.cell - 16, x)),
    y: Math.max(BOARD.y + 16, Math.min(BOARD.y + BOARD.rows * BOARD.cell - 16, y)),
  };
}
