// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. Flat vector shapes, canvas text for the HUD and the
// panels. Every button's rectangle lives in LAYOUT, which the main loop uses
// for hit-testing, so what you see is exactly what you can click.
//
// Since v4 the grove is the Moonlit Grove: a midnight garden under a full
// moon, bioluminescent plants, fireflies, a moonlit path, dark indigo glass
// panels. Every animated thing here is driven by the world's deterministic
// sim clock (state.elapsed) and stable cell hashes — never wall time — so
// the same seed always paints the same frame.
//
// The screen is dense on purpose: the HUD carries the win/lose terms, the live
// combo and grade and the best score; the side panel carries the threat queue
// with traits and the blessings the grove has granted; the title, the draft and
// the end screens each show a full panel of the game's systems. Every number
// on screen is a live value from the world — nothing here is decoration.

import { BOARD, CARDS, FIELD, FONT, HUD, PALETTE, PANEL, TREE_CELL, WAVES_PER_YEAR, cellCentre, isPathCell } from './config.js';
import { GROWTH_SECONDS, PLANTS, STAGE_NAMES, nourishCost, plantDamage, plantHarvest, plantRange, sellValue } from './plants.js';
import { PESTS, blightPhaseRules, isChampion } from './pests.js';
import { wavesLeftInSeason } from './seasons.js';
import { blessingById, blessingMods } from './blessings.js';
import { GRADE_COLORS, comboMultiplier, gradeFor } from './combo.js';
import { DIFFICULTIES } from './difficulty.js';
import { FEATS, featsFor, nextGoal } from './feats.js';
import { REROLL_COST, SUNBURST_COOLDOWN } from './world.js';
import { FIREFLY_COUNT, MOON, blightLook, fireflyAt, stableHash as cellHash } from './night.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_HOWTO = 'howto';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_DRAFT = 'draft';
export const SCREEN_VICTORY = 'victory';
export const SCREEN_DEFEAT = 'defeat';

const CARD_WIDTH = 134;
const CARD_STEP = 142;

export const LAYOUT = {
  cards: PLANTS.map((_, index) => ({
    x: CARDS.margin + index * CARD_STEP,
    y: CARDS.y + 4,
    w: CARD_WIDTH,
    h: CARDS.height - 8,
  })),
  startButton: { x: PANEL.x + 16, y: 264, w: PANEL.width - 32, h: 52 },
  sunburstButton: { x: PANEL.x + 16, y: 322, w: PANEL.width - 32, h: 44 },
  speedButton: { x: PANEL.x + 16, y: 608, w: 120, h: 40 },
  pauseButton: { x: PANEL.x + 144, y: 608, w: 120, h: 40 },
  muteButton: { x: PANEL.x + 272, y: 608, w: 120, h: 40 },
  nourishButton: { x: PANEL.x + 16, y: 492, w: 184, h: 30 },
  sellButton: { x: PANEL.x + 208, y: 492, w: 184, h: 30 },
  titlePlay: { x: 490, y: 508, w: 300, h: 56 },
  titleHow: { x: 490, y: 574, w: 300, h: 44 },
  titleDifficulties: DIFFICULTIES.map((_, index) => ({
    x: 744, y: 256 + index * 48, w: 422, h: 44,
  })),
  howBack: { x: 490, y: 566, w: 300, h: 48 },
  draftCards: [
    { x: 170, y: 180, w: 300, h: 380 },
    { x: 490, y: 180, w: 300, h: 380 },
    { x: 810, y: 180, w: 300, h: 380 },
  ],
  draftReroll: { x: 540, y: 572, w: 200, h: 40 },
  victoryAgain: { x: 280, y: 540, w: 230, h: 52 },
  victoryEndless: { x: 525, y: 540, w: 230, h: 52 },
  victoryTitle: { x: 770, y: 540, w: 230, h: 52 },
  defeatAgain: { x: 392, y: 540, w: 230, h: 52 },
  defeatTitle: { x: 637, y: 540, w: 230, h: 52 },
};

export function inside(rect, x, y) {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

/** A stable speckling for a cell: the same cell always gets the same pebbles. */
/** A multiplier as the HUD shows it: ×2 when whole, ×2.5 when not. */
function formatMult(value) {
  if (Number.isInteger(value)) return `\u00D7${value}`;
  return `\u00D7${value.toFixed(2).replace(/0$/, '')}`;
}

/** Seconds as m:ss, for the run's time and the boss-felled banner. */
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** A season's main rule, in words: the one line the cover's season strip shows. */
function seasonEffectLine(season) {
  if (season.damage !== 1) {
    return season.damage > 1
      ? `plants deal +${Math.round((season.damage - 1) * 100)}% damage`
      : `plants deal ${Math.round((1 - season.damage) * 100)}% less damage`;
  }
  if (season.growth !== 1) return `plants grow \u00D7${season.growth}`;
  if (season.reward !== 1) {
    return season.reward > 1
      ? `kills pay +${Math.round((season.reward - 1) * 100)}% sun`
      : `kills pay ${Math.round((1 - season.reward) * 100)}% less sun`;
  }
  if (season.pestSpeed !== 1) return season.pestSpeed > 1 ? 'pests run faster' : 'pests walk slower';
  if (season.pestHp !== 1) return 'pests are tougher';
  return 'the grove holds steady';
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function font(size, bold) {
    const key = `${bold ? '700 ' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, bold) {
    context.font = font(size, bold);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  function ellipse(x, y, rx, ry, rotation, color) {
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
    context.fill();
  }

  function heart(x, y, size, color) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, y + size * 0.35);
    context.bezierCurveTo(x, y, x - size * 0.5, y - size * 0.1, x - size * 0.5, y + size * 0.15);
    context.bezierCurveTo(x - size * 0.5, y + size * 0.45, x, y + size * 0.7, x, y + size * 0.95);
    context.bezierCurveTo(x, y + size * 0.7, x + size * 0.5, y + size * 0.45, x + size * 0.5, y + size * 0.15);
    context.bezierCurveTo(x + size * 0.5, y - size * 0.1, x, y, x, y + size * 0.35);
    context.fill();
  }

  /** A small pill with a glyph and a label, for blessings and tags. `dim` greys it out (a feat not yet earned). */
  function chip(x, y, w, h, glyph, label, color, dim) {
    context.globalAlpha = dim ? 0.5 : 1;
    context.fillStyle = 'rgba(233, 238, 247, 0.08)';
    roundRect(x, y, w, h, h / 2);
    context.fill();
    context.strokeStyle = PALETTE.cardEdge;
    context.lineWidth = 1;
    roundRect(x, y, w, h, h / 2);
    context.stroke();
    text(glyph, x + 10, y + h / 2 + 5, 14, color ?? PALETTE.cardAfford, 'left', true);
    text(label, x + 30, y + h / 2 + 5, 13, PALETTE.text, 'left', true);
    context.globalAlpha = 1;
  }

  function drawBoard(state, season, elapsed) {
    for (let row = 0; row < BOARD.rows; row += 1) {
      for (let col = 0; col < BOARD.cols; col += 1) {
        const x = BOARD.x + col * BOARD.cell;
        const y = BOARD.y + row * BOARD.cell;
        if (isPathCell(col, row)) {
          // A moonlit road, not a soil checker: cool slate with a worn
          // centre, wheel ruts along the direction the path runs, pebbles,
          // and edges that catch the moonlight where the road meets grass.
          context.fillStyle = PALETTE.soil;
          context.fillRect(x, y, BOARD.cell, BOARD.cell);
          const horizontal = isPathCell(col - 1, row) || isPathCell(col + 1, row);
          const vertical = isPathCell(col, row - 1) || isPathCell(col, row + 1);
          context.fillStyle = PALETTE.roadLight;
          context.globalAlpha = 0.35;
          if (horizontal && !vertical) {
            context.fillRect(x, y + 26, BOARD.cell, 20);
          } else if (vertical && !horizontal) {
            context.fillRect(x + 26, y, 20, BOARD.cell);
          } else {
            context.beginPath();
            context.arc(x + 36, y + 36, 20, 0, Math.PI * 2);
            context.fill();
          }
          context.globalAlpha = 1;
          context.fillStyle = PALETTE.soilEdge;
          context.globalAlpha = 0.5;
          if (horizontal && !vertical) {
            context.fillRect(x, y + 18, BOARD.cell, 3);
            context.fillRect(x, y + 51, BOARD.cell, 3);
          } else if (vertical && !horizontal) {
            context.fillRect(x + 18, y, 3, BOARD.cell);
            context.fillRect(x + 51, y, 3, BOARD.cell);
          }
          context.globalAlpha = 1;
          if (cellHash(col, row, 1) > 0.5) context.fillRect(x + 10, y + 14, 12, 8);
          if (cellHash(col, row, 2) > 0.5) context.fillRect(x + 44, y + 46, 14, 9);
          if (cellHash(col, row, 3) > 0.6) context.fillRect(x + 30, y + 30, 8, 6);
          // Moonlit edges: a silver-blue line where the road meets the grass.
          context.fillStyle = 'rgba(150, 190, 255, 0.5)';
          if (!isPathCell(col, row - 1)) context.fillRect(x, y, BOARD.cell, 2);
          if (!isPathCell(col, row + 1)) context.fillRect(x, y + BOARD.cell - 2, BOARD.cell, 2);
          if (!isPathCell(col - 1, row)) context.fillRect(x, y, 2, BOARD.cell);
          if (!isPathCell(col + 1, row)) context.fillRect(x + BOARD.cell - 2, y, 2, BOARD.cell);
        } else {
          context.fillStyle = (col + row) % 2 === 0 ? PALETTE.board : PALETTE.boardAlt;
          context.fillRect(x, y, BOARD.cell, BOARD.cell);
          // The grove is alive at night: deterministic glow-flowers and
          // grass tufts, the same on every visit to the same cell.
          const flowerRoll = cellHash(col, row, 7);
          if (flowerRoll > 0.55) {
            const fx = x + 14 + cellHash(col, row, 8) * 44;
            const fy = y + 14 + cellHash(col, row, 9) * 44;
            const petal = flowerRoll > 0.85 ? '#f9a8d4' : flowerRoll > 0.7 ? '#fde68a' : '#dbeafe';
            context.globalAlpha = 0.28;
            circle(fx, fy, 7, petal);
            context.globalAlpha = 1;
            circle(fx, fy, 3.5, petal);
            circle(fx, fy, 1.5, '#f2b705');
          }
          if (cellHash(col, row, 10) > 0.5) {
            const tx = x + 12 + cellHash(col, row, 11) * 48;
            const ty = y + 40 + cellHash(col, row, 12) * 20;
            context.strokeStyle = 'rgba(120, 180, 140, 0.28)';
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(tx - 4, ty + 6);
            context.lineTo(tx - 5, ty - 2);
            context.moveTo(tx, ty + 6);
            context.lineTo(tx, ty - 4);
            context.moveTo(tx + 4, ty + 6);
            context.lineTo(tx + 5, ty - 2);
            context.stroke();
          }
          context.fillStyle = 'rgba(160, 190, 230, 0.08)';
          if (cellHash(col, row, 4) > 0.6) {
            context.beginPath();
            context.arc(x + 18 + cellHash(col, row, 5) * 36, y + 18 + cellHash(col, row, 6) * 36, 4, 0, Math.PI * 2);
            context.fill();
          }
        }
      }
    }
    // Season tint over the whole scene, strong enough to read: winter is pale
    // blue, autumn amber, summer gold.
    context.fillStyle = season.tint;
    context.globalAlpha = 0.22;
    context.fillRect(BOARD.x, BOARD.y, BOARD.cols * BOARD.cell, BOARD.rows * BOARD.cell);
    context.globalAlpha = 1;
    // Moonlight from the top right, cool and soft, and one wide beam from
    // the moon down across the beds.
    const light = context.createLinearGradient(BOARD.x + 864, BOARD.y, BOARD.x, BOARD.y + 576);
    light.addColorStop(0, 'rgba(180, 210, 255, 0.12)');
    light.addColorStop(1, 'rgba(180, 210, 255, 0)');
    context.fillStyle = light;
    context.fillRect(BOARD.x, BOARD.y, BOARD.cols * BOARD.cell, BOARD.rows * BOARD.cell);
    context.fillStyle = 'rgba(190, 215, 255, 0.13)';
    context.beginPath();
    context.moveTo(800, BOARD.y);
    context.lineTo(864, BOARD.y);
    context.lineTo(560, BOARD.y + BOARD.rows * BOARD.cell);
    context.lineTo(380, BOARD.y + BOARD.rows * BOARD.cell);
    context.closePath();
    context.fill();
    // The moon itself (geometry from night.js): a pale cratered disc in the
    // board's top-right corner, over the two cells no capture plan plants
    // on. Background art — a tower planted there draws over it cleanly.
    for (const halo of MOON.halos) {
      context.globalAlpha = halo.alpha;
      circle(MOON.x, MOON.y, halo.radius, MOON.halo);
    }
    context.globalAlpha = 1;
    circle(MOON.x, MOON.y, MOON.radius, MOON.disc);
    for (const crater of MOON.craters) {
      circle(MOON.x + crater.dx, MOON.y + crater.dy, crater.radius, crater.color);
    }
    context.strokeStyle = 'rgba(140, 170, 220, 0.10)';
    context.lineWidth = 1;
    for (let col = 0; col <= BOARD.cols; col += 1) {
      context.beginPath();
      context.moveTo(BOARD.x + col * BOARD.cell, BOARD.y);
      context.lineTo(BOARD.x + col * BOARD.cell, BOARD.y + BOARD.rows * BOARD.cell);
      context.stroke();
    }
    for (let row = 0; row <= BOARD.rows; row += 1) {
      context.beginPath();
      context.moveTo(BOARD.x, BOARD.y + row * BOARD.cell);
      context.lineTo(BOARD.x + BOARD.cols * BOARD.cell, BOARD.y + row * BOARD.cell);
      context.stroke();
    }
    // The west gate: where the pests come in.
    context.fillStyle = '#3a4a63';
    context.fillRect(BOARD.x - 2, BOARD.y + BOARD.cell * 0.5, 10, BOARD.cell);
    context.fillStyle = '#55688a';
    context.fillRect(BOARD.x - 2, BOARD.y + BOARD.cell * 0.5, 10, 10);
  }

  /**
   * Fireflies over the beds (flight data from night.js): each with a seeded
   * anchor and a slow sinusoidal drift, pulsing gold or pale green. Driven
   * by the sim clock and stable hashes, so the same frame always shows the
   * same fireflies in the same places.
   */
  function drawFireflies(elapsed) {
    for (let i = 0; i < FIREFLY_COUNT; i += 1) {
      const firefly = fireflyAt(i, elapsed);
      context.globalAlpha = firefly.pulse * 0.3;
      circle(firefly.x, firefly.y, 7, firefly.color);
      context.globalAlpha = firefly.pulse;
      circle(firefly.x, firefly.y, 2, firefly.color);
    }
    context.globalAlpha = 1;
  }

  /** A soft darkening at the board's corners: depth, without hiding anything. */
  function drawVignette() {
    const gradient = context.createRadialGradient(
      432, 344, 260,
      432, 344, 620,
    );
    gradient.addColorStop(0, 'rgba(4, 8, 18, 0)');
    gradient.addColorStop(1, 'rgba(4, 8, 18, 0.42)');
    context.fillStyle = gradient;
    context.fillRect(BOARD.x, BOARD.y, BOARD.cols * BOARD.cell, BOARD.rows * BOARD.cell);
  }

  function drawTree(state, elapsed) {
    const centre = cellCentre(TREE_CELL.col, TREE_CELL.row);
    let ox = 0;
    let oy = 0;
    if (state.shake > 0) {
      const mag = state.shake * 14;
      ox = Math.sin(elapsed * 55) * mag;
      oy = Math.cos(elapsed * 47) * mag * 0.5;
    }
    const x = centre.x + ox;
    const y = centre.y + oy;
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(x, y + 28, 30, 9, 0, 0, Math.PI * 2);
    context.fill();
    // Moonlight on the canopy: a wide halo behind the crown — the Heart Tree
    // is the grove's second moon, the light the rotting moon wants to eat.
    context.globalAlpha = 0.18;
    circle(x, y - 22, 58, '#bcd8f5');
    context.globalAlpha = 1;
    context.fillStyle = '#5a4630';
    context.fillRect(x - 9, y - 6, 18, 34);
    context.fillStyle = '#6a5438';
    context.fillRect(x - 9, y - 6, 6, 34);
    const sway = Math.sin(elapsed * 1.4) * 2;
    circle(x - 18 + sway, y - 18, 26, '#1e4a3a');
    circle(x + 18 + sway, y - 18, 26, '#256b4a');
    circle(x + sway, y - 32, 32, '#2e7d54');
    circle(x - 8 + sway, y - 12, 16, '#1e4a3a');
    circle(x + 10 + sway, y - 12, 16, '#256b4a');
    // A moonlit crown: a pale gold crescent along the canopy's top edge.
    context.strokeStyle = 'rgba(255, 230, 150, 0.35)';
    context.lineWidth = 4;
    context.beginPath();
    context.arc(x + sway, y - 32, 30, Math.PI * 1.15, Math.PI * 1.85);
    context.stroke();
    // Heart-fruits: one glowing dot per heart left, pulsing with the moon.
    const fruitPulse = 0.75 + 0.25 * Math.sin(elapsed * 2.2);
    for (let i = 0; i < state.hearts; i += 1) {
      const angle = (i / state.maxHearts) * Math.PI * 2 - Math.PI / 2;
      const fx = x + Math.cos(angle) * 26 + sway;
      const fy = y - 22 + Math.sin(angle) * 19;
      context.globalAlpha = 0.3 * fruitPulse;
      circle(fx, fy, 9, '#ff9d8a');
      context.globalAlpha = 1;
      circle(fx, fy, 4.5, '#ff9d8a');
    }
  }

  /**
   * The head of a plant, drawn at (x, y) with radius r, for the board and the
   * cards. Each kind has its own silhouette, so the garden reads as six
   * different creatures, not one stamp in six colours: a spiky rose, an ice
   * crystal, a sunflower, a berry bush, a whipping vine and a glowcap.
   */
  function drawPlantHead(kind, x, y, r, elapsed, wobble) {
    const sway = Math.sin(elapsed * 1.8 + wobble) * r * 0.08;
    const cx = x + sway;
    if (kind === 'thorn') {
      // A spiky rose: a ring of dark thorns around layered rose petals.
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2 + wobble;
        context.fillStyle = '#2a7a4a';
        context.beginPath();
        context.moveTo(cx + Math.cos(angle) * r * 0.5, y + Math.sin(angle) * r * 0.5);
        context.lineTo(cx + Math.cos(angle - 0.22) * r * 0.95, y + Math.sin(angle - 0.22) * r * 0.95);
        context.lineTo(cx + Math.cos(angle + 0.22) * r * 0.95, y + Math.sin(angle + 0.22) * r * 0.95);
        context.closePath();
        context.fill();
      }
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ellipse(cx + Math.cos(angle) * r * 0.34, y + Math.sin(angle) * r * 0.34, r * 0.42, r * 0.26, angle, '#e879a8');
      }
      circle(cx, y, r * 0.3, '#7ed491');
      circle(cx - r * 0.1, y - r * 0.1, r * 0.12, '#f2b705');
    } else if (kind === 'frost') {
      // An ice crystal: six pointed diamond petals around a bright core.
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2 + wobble * 0.3;
        const tipX = cx + Math.cos(angle) * r * 0.95;
        const tipY = y + Math.sin(angle) * r * 0.95;
        const side = Math.PI / 2;
        context.fillStyle = i % 2 === 0 ? '#9fe3f5' : '#7ec8e8';
        context.beginPath();
        context.moveTo(cx + Math.cos(angle - side) * r * 0.28, y + Math.sin(angle - side) * r * 0.28);
        context.lineTo(tipX, tipY);
        context.lineTo(cx + Math.cos(angle + side) * r * 0.28, y + Math.sin(angle + side) * r * 0.28);
        context.lineTo(cx, y);
        context.closePath();
        context.fill();
      }
      circle(cx, y, r * 0.34, '#ffffff');
      circle(cx - r * 0.3, y - r * 0.3, r * 0.07, '#ffffff');
      circle(cx + r * 0.35, y - r * 0.2, r * 0.06, '#ffffff');
      circle(cx + r * 0.1, y + r * 0.4, r * 0.06, '#d8f1ff');
    } else if (kind === 'sunspore') {
      // A sunflower: twelve pointed rays around a broad seed disc.
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2;
        context.fillStyle = i % 2 === 0 ? '#ffd94a' : '#f5b81e';
        context.beginPath();
        context.moveTo(cx + Math.cos(angle - 0.16) * r * 0.5, y + Math.sin(angle - 0.16) * r * 0.5);
        context.lineTo(cx + Math.cos(angle) * r * 0.98, y + Math.sin(angle) * r * 0.98);
        context.lineTo(cx + Math.cos(angle + 0.16) * r * 0.5, y + Math.sin(angle + 0.16) * r * 0.5);
        context.closePath();
        context.fill();
      }
      circle(cx, y, r * 0.58, '#7a5208');
      circle(cx - r * 0.2, y - r * 0.16, r * 0.08, '#fff3b0');
      circle(cx + r * 0.18, y - r * 0.14, r * 0.08, '#fff3b0');
      circle(cx, y + r * 0.2, r * 0.08, '#fff3b0');
      circle(cx - r * 0.05, y - r * 0.02, r * 0.07, '#ffd94a');
    } else if (kind === 'bramble') {
      // A berry bush: a cluster of six berries over two dark leaves.
      ellipse(cx - r * 0.4, y + r * 0.35, r * 0.5, r * 0.24, -0.5, '#3a5a28');
      ellipse(cx + r * 0.4, y + r * 0.35, r * 0.5, r * 0.24, 0.5, '#3a5a28');
      const berries = [
        [-0.42, 0.18, 0.34, '#e07f45'], [0.42, 0.18, 0.34, '#e07f45'],
        [0, -0.28, 0.38, '#ff9a5c'], [-0.15, -0.05, 0.3, '#d95f2b'],
        [0.28, -0.12, 0.28, '#ff9a5c'], [0.02, 0.32, 0.3, '#e07f45'],
      ];
      for (const [dx, dy, br, color] of berries) circle(cx + dx * r, y + dy * r, br * r, color);
      circle(cx - r * 0.48, y + r * 0.06, r * 0.1, '#ffc89e');
      circle(cx + r * 0.08, y - r * 0.4, r * 0.1, '#ffc89e');
      circle(cx + r * 0.3, y - r * 0.2, r * 0.07, '#ffc89e');
    } else if (kind === 'vine') {
      // A whipping vine: three tendrils with leaves and barbed tips.
      for (let i = 0; i < 3; i += 1) {
        const angle = -Math.PI / 2 + (i - 1) * 0.7 + Math.sin(elapsed * 3 + i) * 0.15;
        const tipX = cx + Math.cos(angle) * r;
        const tipY = y + r * 0.4 + Math.sin(angle) * r * 0.9;
        const midX = cx + Math.cos(angle) * r * 0.55;
        const midY = y + r * 0.4 + Math.sin(angle) * r * 0.5;
        context.strokeStyle = '#5a8a1e';
        context.lineWidth = r * 0.28;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(cx, y + r * 0.4);
        context.quadraticCurveTo(midX, midY, tipX, tipY);
        context.stroke();
        ellipse(midX, midY, r * 0.22, r * 0.1, angle + 0.6, '#7ed491');
        context.fillStyle = '#d8f7a8';
        context.beginPath();
        context.moveTo(tipX + Math.cos(angle - 0.5) * r * 0.16, tipY + Math.sin(angle - 0.5) * r * 0.16);
        context.lineTo(tipX + Math.cos(angle) * r * 0.3, tipY + Math.sin(angle) * r * 0.3);
        context.lineTo(tipX + Math.cos(angle + 0.5) * r * 0.16, tipY + Math.sin(angle + 0.5) * r * 0.16);
        context.closePath();
        context.fill();
      }
      circle(cx, y + r * 0.35, r * 0.45, '#b8f04a');
      circle(cx - r * 0.12, y + r * 0.28, r * 0.12, '#f2b705');
    } else if (kind === 'spore') {
      // A glowcap: a broad cap with a luminous rim, glowing gills below.
      context.fillStyle = '#d8d2e8';
      context.fillRect(cx - r * 0.18, y - r * 0.1, r * 0.36, r * 0.6);
      context.strokeStyle = 'rgba(201, 167, 255, 0.5)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(cx - r * 0.5, y + r * 0.08);
      context.lineTo(cx + r * 0.5, y + r * 0.08);
      context.stroke();
      for (let i = -1; i <= 1; i += 1) {
        context.beginPath();
        context.moveTo(cx + i * r * 0.3, y + r * 0.08);
        context.lineTo(cx + i * r * 0.3, y + r * 0.28);
        context.stroke();
      }
      context.fillStyle = '#c9a7ff';
      context.beginPath();
      context.arc(cx, y, r * 0.95, Math.PI, 0);
      context.closePath();
      context.fill();
      context.strokeStyle = '#efe6ff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(cx, y, r * 0.95, Math.PI * 1.1, Math.PI * 1.9);
      context.stroke();
      circle(cx - r * 0.4, y - r * 0.4, r * 0.13, '#efe6ff');
      circle(cx + r * 0.35, y - r * 0.5, r * 0.11, '#efe6ff');
      circle(cx + r * 0.05, y - r * 0.18, r * 0.1, '#efe6ff');
      circle(cx - r * 0.1, y - r * 0.62, r * 0.08, '#efe6ff');
    }
  }

  /** Each plant kind grows from its own mound, so the garden never reads as one repeated stamp. */
  const MOUNDS = {
    thorn: '#3a3348',
    frost: '#2e4a5c',
    sunspore: '#4a3a18',
    bramble: '#4a2e20',
    vine: '#2e4420',
    spore: '#3a2e4a',
  };

  function drawPlant(plant, elapsed) {
    const def = PLANTS.find((item) => item.id === plant.kind);
    const x = plant.x;
    const y = plant.y;
    ellipse(x, y + 24, 24, 7, 0, 'rgba(0,0,0,0.22)');
    context.fillStyle = MOUNDS[plant.kind] ?? '#3a3348';
    context.beginPath();
    context.ellipse(x, y + 20, 20, 7, 0, 0, Math.PI * 2);
    context.fill();
    // Growth ring: a gold arc filling as the plant grows to its next stage,
    // and three dots marking the stages — the stage reads at a glance.
    if (plant.stage < 2) {
      const progress = Math.min(1, plant.growth / GROWTH_SECONDS);
      context.strokeStyle = 'rgba(255,255,255,0.22)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(x, y + 2, 26, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = PALETTE.gold;
      context.beginPath();
      context.arc(x, y + 2, 26, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      context.stroke();
    }
    // Three stage pips under every plant — bigger and brighter at night, so
    // the growth system reads from the cover, not only up close.
    for (let i = 0; i < 3; i += 1) {
      circle(x - 12 + i * 12, y + 31, 3.5, i <= plant.stage ? PALETTE.gold : 'rgba(255,255,255,0.45)');
    }
    if (plant.stage === 0) {
      // A seed glimmers faintly: even the youngest plant is alive at night.
      context.globalAlpha = 0.25;
      circle(x, y + 10, 9, def.color);
      context.globalAlpha = 1;
      context.strokeStyle = '#2e7d54';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(x, y + 18);
      context.lineTo(x, y + 6);
      context.stroke();
      ellipse(x - 6, y + 8, 7, 3.5, -0.6, '#3fae72');
      ellipse(x + 6, y + 8, 7, 3.5, 0.6, '#3fae72');
      circle(x, y + 16, 5, '#6a5638');
      return;
    }
    const stemTop = plant.stage === 1 ? y + 2 : y - 8;
    context.strokeStyle = '#2e7d54';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x, y + 18);
    context.lineTo(x, stemTop);
    context.stroke();
    ellipse(x - 10, y + 10, 10, 4.5, -0.5, '#3fae72');
    ellipse(x + 10, y + 12, 10, 4.5, 0.5, '#35915e');
    if (plant.stage === 1) {
      context.globalAlpha = 0.18;
      circle(x, stemTop - 2, 15, def.color);
      context.globalAlpha = 1;
      circle(x, stemTop - 2, 8, def.color);
      return;
    }
    // A bloomed plant is bioluminescent: a three-ring halo in its own colour,
    // layered flat circles with a hard bright core — light that reads even
    // frozen in a still frame.
    const haloPulse = 0.9 + 0.1 * Math.sin(elapsed * 1.6 + plant.x * 0.05);
    context.globalAlpha = 0.08 * haloPulse;
    circle(x, stemTop - 8, 31, def.color);
    context.globalAlpha = 0.14 * haloPulse;
    circle(x, stemTop - 8, 24, def.color);
    context.globalAlpha = 0.22 * haloPulse;
    circle(x, stemTop - 8, 18, def.color);
    context.globalAlpha = 1;
    drawPlantHead(plant.kind, x, stemTop - 8, 17, elapsed, plant.x * 0.05 + plant.y * 0.03);
    if (plant.nourished) {
      context.strokeStyle = '#f2b705';
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(x, stemTop - 8, 23, 0, Math.PI * 2);
      context.stroke();
    }
    if (plant.flash > 0) {
      // A soft glow as it fires: bright in motion, never a white hole in a still.
      context.globalAlpha = (plant.flash / 0.12) * 0.45;
      circle(x, stemTop - 8, 20, '#ffffff');
      context.globalAlpha = 1;
    }
  }

  function drawPest(pest, elapsed) {
    const def = PESTS[pest.type];
    const x = pest.x;
    const y = pest.y;
    const r = pest.radius;
    ellipse(x, y + r * 0.8, r, r * 0.3, 0, 'rgba(0,0,0,0.25)');
    const wobble = Math.sin(elapsed * 8 + pest.wobble) * 2;
    // The swarm at night: dark silhouettes with glowing eyes — the shadow-
    // puppet language. Each kind keeps its shape, so it stays readable.
    if (pest.type === 'aphid') {
      ellipse(x, y, r * 1.15, r * 0.85, 0, def.body);
      circle(x + r * 0.7, y - r * 0.2, r * 0.4, def.dark);
      context.strokeStyle = def.dark;
      context.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        context.beginPath();
        context.moveTo(x - r * 0.4 + i * r * 0.4, y + r * 0.5);
        context.lineTo(x - r * 0.6 + i * r * 0.4, y + r * 1.1);
        context.stroke();
      }
      context.globalAlpha = 0.35;
      circle(x + r * 0.8, y - r * 0.35, 4.5, '#ffd166');
      context.globalAlpha = 1;
      circle(x + r * 0.75, y - r * 0.45, 2, '#ffd166');
      circle(x + r * 0.95, y - r * 0.2, 2, '#ffd166');
    } else if (pest.type === 'moth') {
      const flap = Math.sin(elapsed * 22 + pest.wobble) * 0.5;
      ellipse(x - r * 0.7, y - r * 0.3 + wobble, r * 0.9, r * 0.55, -0.5 - flap * 0.4, def.body);
      ellipse(x + r * 0.7, y - r * 0.3 + wobble, r * 0.9, r * 0.55, 0.5 + flap * 0.4, def.body);
      ellipse(x, y, r * 0.45, r * 0.9, 0, def.dark);
      circle(x, y - r * 0.7, r * 0.3, def.dark);
      context.globalAlpha = 0.35;
      circle(x, y - r * 0.7, 5, '#ffd166');
      context.globalAlpha = 1;
      circle(x - r * 0.15, y - r * 0.75, 2, '#ffd166');
      circle(x + r * 0.15, y - r * 0.75, 2, '#ffd166');
    } else if (pest.type === 'beetle') {
      context.fillStyle = def.body;
      context.beginPath();
      context.arc(x, y + r * 0.3, r, Math.PI, 0);
      context.closePath();
      context.fill();
      context.strokeStyle = def.dark;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x, y - r * 0.7);
      context.lineTo(x, y + r * 0.3);
      context.stroke();
      circle(x + r * 0.8, y + r * 0.1, r * 0.35, def.dark);
      context.strokeStyle = def.dark;
      for (let i = 0; i < 3; i += 1) {
        context.beginPath();
        context.moveTo(x - r * 0.5 + i * r * 0.5, y + r * 0.4);
        context.lineTo(x - r * 0.7 + i * r * 0.5, y + r * 1.05);
        context.stroke();
      }
      context.globalAlpha = 0.35;
      circle(x + r * 0.8, y + r * 0.05, 5, '#ff6b6b');
      context.globalAlpha = 1;
      circle(x + r * 0.7, y - r * 0.05, 2.2, '#ff6b6b');
      circle(x + r * 0.95, y + r * 0.15, 2.2, '#ff6b6b');
    } else if (pest.type === 'slug') {
      ellipse(x, y + r * 0.3, r * 1.25, r * 0.7, 0, def.body);
      circle(x + r * 0.9, y - r * 0.1, r * 0.45, def.body);
      context.strokeStyle = def.dark;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + r * 0.8, y - r * 0.4);
      context.lineTo(x + r * 0.6, y - r * 0.9);
      context.moveTo(x + r * 1.0, y - r * 0.4);
      context.lineTo(x + r * 1.1, y - r * 0.9);
      context.stroke();
      context.globalAlpha = 0.35;
      circle(x + r * 0.85, y - r * 0.95, 6, '#ffd166');
      context.globalAlpha = 1;
      circle(x + r * 0.6, y - r * 0.95, 2.5, '#ffd166');
      circle(x + r * 1.1, y - r * 0.95, 2.5, '#ffd166');
    } else if (pest.type === 'gloomcap') {
      // Gloomcap, the wave-5 champion: a giant mushroom, its deep indigo cap
      // studded with glowing cyan spots, pale stem, eyes burning under the
      // cap's brim. A moonlit milestone, not a wall.
      context.globalAlpha = 0.18;
      circle(x, y - r * 0.2, r * 1.5, '#7df9e8');
      context.globalAlpha = 1;
      context.fillStyle = '#ddd6f5';
      context.beginPath();
      context.moveTo(x - r * 0.35, y + r * 0.9);
      context.quadraticCurveTo(x - r * 0.45, y + r * 0.1, x - r * 0.28, y - r * 0.1);
      context.lineTo(x + r * 0.28, y - r * 0.1);
      context.quadraticCurveTo(x + r * 0.45, y + r * 0.1, x + r * 0.35, y + r * 0.9);
      context.closePath();
      context.fill();
      context.fillStyle = def.body;
      context.beginPath();
      context.arc(x, y - r * 0.1, r * 1.05, Math.PI, 0);
      context.closePath();
      context.fill();
      context.fillStyle = def.dark;
      context.beginPath();
      context.ellipse(x, y - r * 0.1, r * 1.05, r * 0.22, 0, 0, Math.PI * 2);
      context.fill();
      circle(x - r * 0.5, y - r * 0.55, r * 0.16, '#7df9e8');
      circle(x + r * 0.35, y - r * 0.7, r * 0.13, '#7df9e8');
      circle(x + r * 0.6, y - r * 0.35, r * 0.11, '#7df9e8');
      circle(x - r * 0.1, y - r * 0.85, r * 0.1, '#a7f3d0');
      context.globalAlpha = 0.4;
      circle(x, y - r * 0.05, 8, '#ffd166');
      context.globalAlpha = 1;
      circle(x - r * 0.2, y - r * 0.05, 2.5, '#ffd166');
      circle(x + r * 0.2, y - r * 0.05, 2.5, '#ffd166');
      context.fillStyle = 'rgba(20, 12, 48, 0.85)';
      roundRect(x - 42, y - r - 32, 84, 18, 9);
      context.fill();
      text('CHAMPION', x, y - r - 19, 11, '#7df9e8', 'center', true);
    } else if (pest.type === 'mirewarden') {
      // The Mire Warden: a mossy dome with a lantern's glow and a champion's tag.
      context.globalAlpha = 0.16;
      circle(x, y - r * 0.2, r * 1.5, '#d6f09a');
      context.globalAlpha = 1;
      context.fillStyle = def.body;
      context.beginPath();
      context.arc(x, y + r * 0.3, r, Math.PI, 0);
      context.closePath();
      context.fill();
      circle(x - r * 0.4, y - r * 0.35, r * 0.3, '#6a8a2a');
      circle(x + r * 0.35, y - r * 0.5, r * 0.22, '#6a8a2a');
      circle(x + r * 0.55, y - r * 0.15, r * 0.18, '#d6f09a');
      circle(x - r * 0.3, y - r * 0.1, r * 0.12, '#d6f09a');
      circle(x + r * 0.3, y - r * 0.1, r * 0.12, '#d6f09a');
      context.fillStyle = 'rgba(20, 32, 12, 0.85)';
      roundRect(x - 42, y - r - 32, 84, 18, 9);
      context.fill();
      text('CHAMPION', x, y - r - 19, 11, '#d6f09a', 'center', true);
    } else if (pest.type === 'rotmother') {
      // Rotmother: a great violet moth, her egg-sacs glowing under her wings.
      const flap = Math.sin(elapsed * 6 + pest.wobble) * 0.3;
      context.globalAlpha = 0.14;
      circle(x, y, r * 1.6, '#c084fc');
      context.globalAlpha = 1;
      ellipse(x - r * 0.85, y - r * 0.2 + wobble, r * 1.05, r * 0.6, -0.4 - flap * 0.3, def.body);
      ellipse(x + r * 0.85, y - r * 0.2 + wobble, r * 1.05, r * 0.6, 0.4 + flap * 0.3, def.body);
      ellipse(x, y, r * 0.45, r * 0.95, 0, def.dark);
      circle(x - r * 0.2, y + r * 0.4, r * 0.14, '#e9d5ff');
      circle(x + r * 0.15, y + r * 0.55, r * 0.12, '#e9d5ff');
      circle(x, y - r * 0.75, r * 0.3, def.dark);
      circle(x - r * 0.1, y - r * 0.78, 2.5, '#f0abfc');
      circle(x + r * 0.1, y - r * 0.78, 2.5, '#f0abfc');
      context.fillStyle = 'rgba(32, 12, 48, 0.85)';
      roundRect(x - 42, y - r - 32, 84, 18, 9);
      context.fill();
      text('CHAMPION', x, y - r - 19, 11, '#e9d5ff', 'center', true);
    } else if (pest.type === 'blight') {
      // The Blight is the biggest thing on the board: a rotting moon — a pale
      // violet orb with dark maria patches and glowing cracks, crowned in
      // thorns. Its look per phase comes from night.js, so each phase shows
      // at a glance: phase 2 wears a wider aura, a ring of ten orbiting
      // aphids and violet cracks; phase 3 burns red-hot cracks, a red ring,
      // longer spikes and faster pulse.
      const look = blightLook(pest.phase ?? 1);
      const rate = look.pulseRate;
      const pulse = 1 + Math.sin(elapsed * rate) * 0.06;
      context.globalAlpha = look.auraAlphaBase + Math.sin(elapsed * rate) * 0.05;
      circle(x, y, r * look.auraRadius * pulse, look.auraColor);
      context.globalAlpha = 1;
      if (look.ring) {
        context.strokeStyle = 'rgba(248, 113, 113, 0.7)';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(x, y, r * 1.2 * pulse, 0, Math.PI * 2);
        context.stroke();
      }
      for (let i = 0; i < look.orbiters; i += 1) {
        const angle = elapsed * 1.5 + (i / look.orbiters) * Math.PI * 2;
        circle(x + Math.cos(angle) * r * 1.45, y + Math.sin(angle) * r * 1.45, 7, '#241a33');
        circle(x + Math.cos(angle) * r * 1.45, y + Math.sin(angle) * r * 1.45, 3, '#ffd166');
      }
      // The moon's face: pale violet, dark maria patches, glowing cracks.
      // A thin dark rim keeps the pale orb defined against the moonlit road.
      circle(x, y, r * pulse, look.orb);
      context.strokeStyle = 'rgba(36, 26, 51, 0.6)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, r * pulse, 0, Math.PI * 2);
      context.stroke();
      ellipse(x - r * 0.35, y - r * 0.3, r * 0.28, r * 0.2, -0.4, '#6d5a9e');
      ellipse(x + r * 0.4, y + r * 0.25, r * 0.22, r * 0.16, 0.3, '#6d5a9e');
      ellipse(x + r * 0.15, y - r * 0.45, r * 0.14, r * 0.1, 0, '#6d5a9e');
      if (look.phase >= 2) {
        context.strokeStyle = look.crackColor;
        context.lineWidth = look.crackWidth;
        context.beginPath();
        context.moveTo(x - r * 0.55, y - r * 0.55);
        context.lineTo(x - r * 0.2, y - r * 0.1);
        context.lineTo(x - r * 0.45, y + r * 0.35);
        context.moveTo(x + r * 0.55, y - r * 0.45);
        context.lineTo(x + r * 0.25, y);
        context.lineTo(x + r * 0.5, y + r * 0.45);
        context.moveTo(x - r * 0.1, y - r * 0.7);
        context.lineTo(x, y - r * 0.3);
        context.lineTo(x + r * 0.15, y - r * 0.6);
        context.moveTo(x - r * 0.6, y + r * 0.1);
        context.lineTo(x - r * 0.25, y + r * 0.3);
        context.lineTo(x - r * 0.5, y + r * 0.6);
        context.moveTo(x + r * 0.25, y);
        context.lineTo(x + r * 0.35, y + r * 0.25);
        context.stroke();
        if (look.phase === 3) {
          context.globalAlpha = 0.35;
          context.strokeStyle = look.crackColor;
          context.lineWidth = 7;
          context.beginPath();
          context.moveTo(x - r * 0.55, y - r * 0.55);
          context.lineTo(x - r * 0.2, y - r * 0.1);
          context.lineTo(x - r * 0.45, y + r * 0.35);
          context.moveTo(x + r * 0.55, y - r * 0.45);
          context.lineTo(x + r * 0.25, y);
          context.lineTo(x + r * 0.5, y + r * 0.45);
          context.stroke();
          context.globalAlpha = 1;
        }
      }
      const spikeReach = look.spikeReach;
      for (let i = 0; i < 5; i += 1) {
        const angle = -Math.PI / 2 + (i - 2) * 0.45;
        context.fillStyle = def.dark;
        context.beginPath();
        context.moveTo(x + Math.cos(angle) * r * 0.7, y + Math.sin(angle) * r * 0.7);
        context.lineTo(x + Math.cos(angle - 0.14) * r * spikeReach, y + Math.sin(angle - 0.14) * r * spikeReach);
        context.lineTo(x + Math.cos(angle + 0.14) * r * spikeReach, y + Math.sin(angle + 0.14) * r * spikeReach);
        context.closePath();
        context.fill();
      }
      const eye = look.eyeColor;
      context.globalAlpha = 0.4;
      circle(x - r * 0.3, y - r * 0.1, r * 0.26, eye);
      circle(x + r * 0.3, y - r * 0.1, r * 0.26, eye);
      context.globalAlpha = 1;
      circle(x - r * 0.3, y - r * 0.1, r * 0.16, eye);
      circle(x + r * 0.3, y - r * 0.1, r * 0.16, eye);
      circle(x, y + r * 0.3, r * 0.2, '#7c5cbf');
      // No BOSS tag and no floating health bar above the Blight: the boss bar
      // across the top of the board already names it and shows its health,
      // and a tag up here would collide with the season strip.
    }
    if (pest.slowUntil > elapsed) {
      context.globalAlpha = 0.4;
      circle(x, y, r + 2, '#bde0fe');
      context.globalAlpha = 1;
    }
    if (pest.poisonUntil > elapsed) {
      circle(x - r * 0.5, y - r - 4, 3, '#a3e635');
      circle(x + r * 0.3, y - r - 8, 2.5, '#a3e635');
    }
    // The boss and the champions carry their health on the boss bar instead of
    // a floating bar, so their sprites stay clean.
    if (pest.hp < pest.maxHp && pest.type !== 'blight' && !isChampion(pest.type)) {
      const width = Math.max(28, r * 2.2);
      const ratio = Math.max(0, pest.hp / pest.maxHp);
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(x - width / 2, y - r - 12, width, 6);
      context.fillStyle = ratio > 0.5 ? '#84cc16' : ratio > 0.25 ? '#f2b705' : '#ff6b6b';
      context.fillRect(x - width / 2, y - r - 12, width * ratio, 6);
    }
  }

  function drawParticles(state) {
    for (const particle of state.particles) {
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      circle(particle.x, particle.y, particle.size, particle.color);
    }
    context.globalAlpha = 1;
  }

  /**
   * The shots' flight: a fading line from the plant's muzzle to where its
   * target stood when it fired, with a bright head travelling along it. The
   * damage is instant — the tracer is the visible proof a shot happened, so
   * the cover reads as a firefight, not a still garden.
   */
  function drawTracers(state) {
    for (const tracer of state.tracers) {
      const remaining = Math.max(0, tracer.life / tracer.maxLife);
      const travelled = 1 - remaining;
      const hx = tracer.x1 + (tracer.x2 - tracer.x1) * travelled;
      const hy = tracer.y1 + (tracer.y2 - tracer.y1) * travelled;
      context.globalAlpha = remaining * 0.7;
      context.strokeStyle = tracer.color;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(tracer.x1, tracer.y1);
      context.lineTo(tracer.x2, tracer.y2);
      context.stroke();
      context.globalAlpha = Math.min(1, remaining + 0.4);
      circle(hx, hy, 4, tracer.color);
    }
    context.globalAlpha = 1;
  }

  function drawFloats(state) {
    // Damage numbers, big and outlined so they read in a still frame.
    for (const floating of state.floats) {
      context.globalAlpha = Math.max(0, floating.life / floating.maxLife);
      context.font = font(17, true);
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      context.lineWidth = 3;
      context.strokeStyle = 'rgba(0,0,0,0.6)';
      context.strokeText(floating.text, floating.x, floating.y);
      context.fillStyle = floating.color;
      context.fillText(floating.text, floating.x, floating.y);
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, ui, season, records) {
    context.fillStyle = PALETTE.hud;
    context.fillRect(0, 0, FIELD.width, HUD.height);
    context.fillStyle = 'rgba(0,0,0,0.2)';
    context.fillRect(0, HUD.height - 4, FIELD.width, 4);
    // Sunlight, glowing against the night HUD.
    context.globalAlpha = 0.25;
    circle(32, 26, 18, PALETTE.sun);
    context.globalAlpha = 1;
    circle(32, 26, 12, PALETTE.sun);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      context.strokeStyle = PALETTE.sun;
      context.lineWidth = 2.5;
      context.beginPath();
      context.moveTo(32 + Math.cos(angle) * 15, 26 + Math.sin(angle) * 15);
      context.lineTo(32 + Math.cos(angle) * 19, 26 + Math.sin(angle) * 19);
      context.stroke();
    }
    text(String(state.sun), 54, 34, 26, PALETTE.textLight, 'left', true);
    // Wave and its progress.
    const waveLabel = state.wave === 0 ? 'WAVE — / 20' : `WAVE ${state.wave} / ${state.endless ? '∞' : WAVES_PER_YEAR}`;
    text(waveLabel, 150, 33, 21, PALETTE.textLight, 'left', true);
    if (state.wave > 0 && ui.pestsTotal > 0) {
      const done = 1 - ui.pestsLeft / ui.pestsTotal;
      context.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(308, 16, 130, 12, 6);
      context.fill();
      context.fillStyle = '#84cc16';
      if (done > 0) {
        roundRect(308, 16, Math.max(12, 130 * done), 12, 6);
        context.fill();
      }
      text(`${ui.pestsLeft} left`, 446, 27, 14, PALETTE.textLight, 'left');
    }
    // Tree hearts.
    text('GROVE', 640, 30, 16, PALETTE.textLight, 'left', true);
    for (let i = 0; i < state.maxHearts; i += 1) {
      heart(712 + i * 19, 14, 13, i < state.hearts ? PALETTE.heart : 'rgba(233,238,247,0.18)');
    }
    // Season. The glyph is dark: the accent disc is light, and the panel
    // text colour would vanish on it.
    circle(962, 26, 12, season.accent);
    text(season.glyph, 962, 32, 15, '#0b1726', 'center', true);
    text(season.name, 980, 30, 18, PALETTE.textLight, 'left', true);
    text(`${wavesLeftInSeason(Math.max(state.wave, 1))} waves left`, 980, 50, 12, 'rgba(243,234,211,0.75)', 'left');
    // Score and best.
    text('SCORE', 1150, 17, 12, 'rgba(243,234,211,0.75)', 'left', true);
    text(state.score.toLocaleString('en-US'), 1150, 39, 22, PALETTE.textLight, 'left', true);
    text(`BEST ${Math.max(records.best, state.score).toLocaleString('en-US')}`, 1150, 52, 11, 'rgba(243,234,211,0.75)', 'left');
    // Second row, left: the live combo and grade.
    const mult = comboMultiplier(state.combo.count);
    const grade = gradeFor({
      hearts: state.hearts,
      maxHearts: state.maxHearts,
      leaked: state.leaked,
      longestCombo: state.combo.longest,
      wave: state.wave,
    });
    const comboLabel = `COMBO ${formatMult(mult)}`;
    text(comboLabel, 54, 50, 15, state.combo.count > 0 ? PALETTE.gold : 'rgba(243,234,211,0.6)', 'left', true);
    context.font = font(15, true);
    const comboWidth = context.measureText(comboLabel).width;
    text('· GRADE ', 54 + comboWidth + 6, 50, 15, 'rgba(243,234,211,0.6)', 'left', true);
    const gradeLabelWidth = context.measureText('· GRADE ').width;
    text(grade.letter, 54 + comboWidth + 6 + gradeLabelWidth, 50, 15, GRADE_COLORS[grade.letter], 'left', true);
    // Second row, centre: the win and lose terms, always visible.
    text('WIN hold the Heart Tree through 20 waves  ·  LOSE the tree falls', 640, 50, 13, 'rgba(243,234,211,0.85)', 'center');
  }

  /** The boss bar, across the top of the board while the Blight is on the field. */
  /** The boss bar, across the top of the board while the Blight — or a champion — is on the field. */
  function drawBossBar(state, season) {
    const blight = state.pests.find((pest) => pest.type === 'blight');
    const champion = blight ? null : state.pests.find((pest) => isChampion(pest.type));
    const foe = blight ?? champion;
    if (!foe) return;
    const def = PESTS[foe.type];
    const x = 132;
    const y = 60;
    const w = 600;
    const h = 26;
    context.fillStyle = 'rgba(20, 12, 32, 0.85)';
    roundRect(x, y, w, h, 13);
    context.fill();
    context.strokeStyle = blight ? PALETTE.blight : '#9bc53d';
    context.lineWidth = 1.5;
    roundRect(x, y, w, h, 13);
    context.stroke();
    const label = blight ? '\u2620 THE BLIGHT' : `\u2694 ${def.name.toUpperCase()}`;
    text(label, x + 16, y + 18, 15, '#e9d5ff', 'left', true);
    const barX = blight ? x + 330 : x + 250;
    const barW = blight ? 130 : 210;
    if (blight) {
      const phase = foe.phase ?? 1;
      text(`PHASE ${phase}/3 · ${blightPhaseRules(phase).name.toUpperCase()}`, x + 172, y + 18, 12, PALETTE.gold, 'left', true);
    }
    const ratio = Math.max(0, foe.hp / foe.maxHp);
    context.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(barX, y + 8, barW, 10, 5);
    context.fill();
    context.fillStyle = blight ? PALETTE.blight : '#9bc53d';
    if (ratio > 0) {
      roundRect(barX, y + 8, Math.max(10, barW * ratio), 10, 5);
      context.fill();
    }
    text(
      `${Math.ceil(foe.hp).toLocaleString('en-US')} / ${foe.maxHp.toLocaleString('en-US')}`,
      x + w - 16, y + 18, 13, '#e9d5ff', 'right',
    );
    if (blight) {
      // The season strip: the drafted season, named under the boss bar, so the
      // draft mechanic reads on the cover itself, not only on the draft screen.
      const drafted = state.seasonDraftedAt > 0 ? `drafted at wave ${state.seasonDraftedAt}` : 'the starting spring';
      // A solid dark pill, not a translucent one: the boss's aura passes
      // behind it, and the text must read through that.
      context.fillStyle = 'rgba(20, 12, 32, 0.85)';
      roundRect(x, y + 30, w, 20, 10);
      context.fill();
      context.strokeStyle = 'rgba(242, 183, 5, 0.5)';
      context.lineWidth = 1;
      roundRect(x, y + 30, w, 20, 10);
      context.stroke();
      text(
        `${season.glyph} ${season.name} — ${drafted} · ${seasonEffectLine(season)}`,
        x + w / 2, y + 44, 12, '#fde68a', 'center', true,
      );
    }
  }

  function drawButton(rect, label, enabled, sub, size) {
    const labelSize = size ?? 22;
    context.fillStyle = enabled ? PALETTE.button : '#4a5a70';
    roundRect(rect.x, rect.y, rect.w, rect.h, 10);
    context.fill();
    context.fillStyle = enabled ? PALETTE.buttonEdge : '#3a4757';
    roundRect(rect.x, rect.y + rect.h - 6, rect.w, 6, 3);
    context.fill();
    text(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + (sub ? 2 : labelSize * 0.36), labelSize, '#ffffff', 'center', true);
    if (sub) text(sub, rect.x + rect.w / 2, rect.y + rect.h - 10, 14, 'rgba(255,255,255,0.85)', 'center');
  }

  function drawPanel(state, ui, season) {
    const mods = blessingMods(state.blessings);
    context.fillStyle = PALETTE.panel;
    context.fillRect(PANEL.x, HUD.height, PANEL.width, FIELD.height - HUD.height);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(PANEL.x, HUD.height, 3, FIELD.height - HUD.height);
    const x = PANEL.x + 16;
    const w = PANEL.width - 32;
    // Next wave: the threat queue, with each pest's trait. The on-field count
    // rides in the header row now — the row it used to own belongs to the
    // forecast line below.
    text('NEXT WAVE', x, 88, 16, PALETTE.muted, 'left', true);
    text(`ON FIELD: ${state.pests.length}`, x + w, 88, 13, PALETTE.muted, 'right', true);
    const nextWave = state.wave + 1;
    text(`Wave ${nextWave}${nextWave > WAVES_PER_YEAR ? ' (endless)' : ''}`, x, 114, 24, PALETTE.text, 'left', true);
    const drafted = ui.seasonFor(nextWave);
    const shown = drafted ?? season;
    text(
      drafted ? `${shown.glyph} ${shown.name} — ${shown.tagline}` : `${shown.glyph} ${shown.name} — season holds`,
      x, 136, 13, PALETTE.muted, 'left',
    );
    const preview = ui.preview;
    let rowY = 156;
    for (const group of preview.slice(0, 3)) {
      const def = PESTS[group.type];
      circle(x + 10, rowY, 8, def.body);
      text(`${def.name}  \u00D7${group.count}`, x + 26, rowY + 5, 16, PALETTE.text, 'left');
      text(def.trait, x + w, rowY + 5, 13, PALETTE.muted, 'right');
      rowY += 18;
    }
    // The next champion (or the boss) is warned two waves ahead, so the end
    // of a season — and of the year — is never a surprise.
    const nextChampion = [
      { wave: 5, name: 'Gloomcap' },
      { wave: 10, name: 'The Mire Warden' },
      { wave: 15, name: 'Rotmother' },
    ].find((champion) => champion.wave > state.wave);
    let forecastY = rowY + 6;
    if (!state.won && !state.over && nextChampion && nextChampion.wave - state.wave <= 2) {
      text(`\u2620 CHAMPION: ${nextChampion.name} walks wave ${nextChampion.wave}`, x, rowY + 4, 13, '#c9a7ff', 'left', true);
      forecastY = rowY + 22;
    } else if (state.wave >= 18 && state.wave < WAVES_PER_YEAR && !state.won && !state.over) {
      text('\u2620 BOSS: The Blight arrives wave 20', x, rowY + 4, 13, '#c9a7ff', 'left', true);
      forecastY = rowY + 22;
    }
    // The forecast: the three waves after the next one, lead group each —
    // live data, so the player can plan the garden three waves ahead.
    if (ui.forecast && ui.forecast.length === 3) {
      const shortName = (type) => (type === 'mirewarden' ? 'Mire Warden' : type === 'blight' ? 'Blight' : PESTS[type].name);
      const items = ui.forecast.map((entry) => `W${entry.wave} ${shortName(entry.type)} \u00D7${entry.count}`).join('  \u00B7  ');
      text(`FORECAST  ${items}`, x, forecastY + 8, 12, PALETTE.muted, 'left', true);
    }
    // Start wave button.
    const button = LAYOUT.startButton;
    if (state.won) {
      drawButton(button, 'THE GROVE HOLDS', false, 'twenty waves clear');
    } else if (state.over) {
      drawButton(button, 'THE GROVE HAS FALLEN', false, 'the pests broke through');
    } else if (state.waveState === 'draft') {
      drawButton(button, 'CHOOSE THE SEASON', false, 'the grove turns…');
    } else if (state.waveState === 'idle') {
      const seconds = Math.ceil(state.waitTimer);
      drawButton(button, 'START WAVE', true, `or wait ${seconds}s · early bonus +${5 + seconds}`);
    } else if (state.waveState === 'spawning' || state.waveState === 'fighting') {
      drawButton(button, `WAVE ${state.wave} IN PROGRESS`, false, 'hold the grove…');
    }
    drawSunburstButton(state, ui);
    // Info box: selected plant, selected card, or the season. Shorter than v2:
    // the Sunburst button took the room above it, and the tutorial lines live
    // on the title screen now.
    const boxY = 376;
    context.fillStyle = PALETTE.card;
    roundRect(x, boxY, w, 110, 12);
    context.fill();
    context.strokeStyle = PALETTE.cardEdge;
    context.lineWidth = 1.5;
    roundRect(x, boxY, w, 110, 12);
    context.stroke();
    const selected = ui.selectedPlant;
    if (selected) {
      const def = PLANTS.find((item) => item.id === selected.kind);
      text(def.name, x + 14, boxY + 26, 21, PALETTE.text, 'left', true);
      text(`${STAGE_NAMES[selected.stage]}${selected.nourished ? ' · Nourished' : ''}`, x + 14, boxY + 46, 14, PALETTE.muted, 'left');
      if (def.harvest) {
        text(`Harvests ${plantHarvest(selected.stage, mods)} sun every 5s`, x + 14, boxY + 68, 15, PALETTE.text, 'left');
      } else {
        const damage = plantDamage(def, selected.stage, selected.nourished, season, mods);
        text(`Damage ${damage.toFixed(0)}  ·  ${def.rate}/s  ·  Range ${Math.round(plantRange(def, selected.stage, mods))}`, x + 14, boxY + 68, 15, PALETTE.text, 'left');
        if (def.slow > 0) text(`Slows pests ${Math.round(def.slow * 100)}%`, x + 14, boxY + 88, 15, PALETTE.text, 'left');
        if (def.splash > 0) text(`Splash ${Math.round(def.splash * mods.splash)}px${def.poison > 0 ? ' · poison' : ''}`, x + 14, boxY + 88, 15, PALETTE.text, 'left');
      }
      if (selected.stage < 2) {
        const growth = Math.min(1, selected.growth / GROWTH_SECONDS);
        context.fillStyle = 'rgba(0,0,0,0.15)';
        roundRect(x + 14, boxY + 94, w - 28, 8, 4);
        context.fill();
        context.fillStyle = '#84cc16';
        roundRect(x + 14, boxY + 94, Math.max(8, (w - 28) * growth), 8, 4);
        context.fill();
      }
      const cost = nourishCost(def, mods);
      const canNourish = selected.stage === 2 && !selected.nourished && state.sun >= cost;
      const nourishLabel = selected.nourished ? 'NOURISHED' : selected.stage < 2 ? 'GROWING…' : cost === 0 ? 'NOURISH FREE' : `NOURISH ${cost}\u2600`;
      drawButton(LAYOUT.nourishButton, nourishLabel, canNourish, null, 17);
      drawButton(LAYOUT.sellButton, `SELL +${sellValue(def)}\u2600`, true, null, 17);
    } else if (ui.selectedCard >= 0) {
      const def = PLANTS[ui.selectedCard];
      text(def.name, x + 14, boxY + 26, 21, PALETTE.text, 'left', true);
      text(def.blurb, x + 14, boxY + 46, 14, PALETTE.muted, 'left');
      if (def.harvest) {
        text('Harvests 3 / 5 / 7 sun every 5s as it grows.', x + 14, boxY + 68, 15, PALETTE.text, 'left');
        text('Click a grass cell to plant it.', x + 14, boxY + 88, 15, PALETTE.cardAfford, 'left', true);
      } else {
        text(`Damage ${def.damage}  ·  ${def.rate}/s  ·  Range ${def.range}`, x + 14, boxY + 68, 15, PALETTE.text, 'left');
        if (def.slow > 0) text(`Slows pests ${Math.round(def.slow * 100)}% for ${def.slowSeconds}s`, x + 14, boxY + 88, 15, PALETTE.text, 'left');
        else if (def.splash > 0) text(`Splash ${def.splash}px${def.poison > 0 ? ` · poison ${def.poison}/s` : ''}`, x + 14, boxY + 88, 15, PALETTE.text, 'left');
        else text('Click a grass cell to plant it.', x + 14, boxY + 88, 15, PALETTE.cardAfford, 'left', true);
      }
    } else {
      text(`${season.glyph} ${season.name}`, x + 14, boxY + 26, 21, PALETTE.text, 'left', true);
      // The drafted wave rides on the tagline only when the two fit the box:
      // the longest taglines already fill it on their own.
      const drafted = state.seasonDraftedAt > 0 ? ` · drafted wave ${state.seasonDraftedAt}` : '';
      context.font = font(14, false);
      const tagline = context.measureText(`${season.tagline}${drafted}`).width <= w - 28
        ? `${season.tagline}${drafted}`
        : season.tagline;
      text(tagline, x + 14, boxY + 46, 14, PALETTE.muted, 'left');
      text(`Kills: ${state.kills}   \u00B7   Leaked: ${state.leaked}`, x + 14, boxY + 68, 15, PALETTE.text, 'left');
      // The draft count rides on the sunlight line: the cover says plainly
      // that the seasons were chosen, not merely dealt.
      const draftNote = state.draftNumber > 0 ? `   \u00B7   Draft ${state.draftNumber}/3` : '';
      text(`Sun earned: ${state.earned}${draftNote}`, x + 14, boxY + 88, 15, PALETTE.text, 'left');
    }
    // Blessings the grove has granted this run: six chips in two rows of three.
    text('BLESSINGS', x, 534, 15, PALETTE.muted, 'left', true);
    text(`${state.blessings.length}/10`, x + w, 534, 15, PALETTE.muted, 'right', true);
    if (state.blessings.length === 0) {
      text('Draft a season to earn a blessing.', x, 562, 14, PALETTE.muted, 'left');
      text('A flawless season earns a bonus one.', x, 584, 14, PALETTE.muted, 'left');
    } else {
      state.blessings.slice(0, 6).forEach((id, index) => {
        const blessing = blessingById(id);
        const col = index % 3;
        const row = Math.floor(index / 3);
        chip(x + col * 130, 542 + row * 26, 124, 22, blessing.glyph, blessing.name);
      });
    }
    // Champions felled, feats held and plants in full bloom, live: the run's
    // honours and the garden's growth at a glance.
    const earned = featsFor(state);
    const bloomCount = state.plants.filter((plant) => plant.stage === 2).length;
    text(`CHAMPIONS ${state.championsFelled}/3  \u00B7  FEATS ${earned.length}/5  \u00B7  BLOOM ${bloomCount}`, x, 600, 13, PALETTE.muted, 'left', true);
    // Speed / pause / mute.
    drawButton(LAYOUT.speedButton, ui.speed === 2 ? 'SPEED 2\u00D7' : 'SPEED 1\u00D7', true, null, 17);
    drawButton(LAYOUT.pauseButton, 'PAUSE', true, null, 17);
    drawButton(LAYOUT.muteButton, ui.muted ? 'MUTED' : 'SOUND', true, null, 17);
    // Hints.
    text('1–6 pick a plant · click grass to plant', x, 664, 14, PALETTE.muted, 'left');
    text('Space start wave · Q sunburst · F speed · P pause · M mute', x, 684, 14, PALETTE.muted, 'left');
    text('Kills in a row build a combo — up to \u00D78 score.', x, 706, 14, PALETTE.cardAfford, 'left', true);
  }

  /** The Sunburst hero button: gold and glowing when ready, a draining cooldown when not. */
  function drawSunburstButton(state, ui) {
    const rect = LAYOUT.sunburstButton;
    const status = ui.sunburst ?? { ready: false, cooldown: 0, cost: 150, reason: 'no pests' };
    if (status.ready) {
      const glow = 0.25 + Math.sin(state.elapsed * 4) * 0.12;
      context.fillStyle = `rgba(242, 183, 5, ${glow})`;
      roundRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8, 13);
      context.fill();
      context.fillStyle = PALETTE.gold;
      roundRect(rect.x, rect.y, rect.w, rect.h, 10);
      context.fill();
      context.fillStyle = '#8a5a12';
      roundRect(rect.x, rect.y + rect.h - 6, rect.w, 6, 3);
      context.fill();
      text('\u2600 SUNBURST', rect.x + rect.w / 2, rect.y + 22, 20, '#3a2a00', 'center', true);
      text(`READY · ${status.cost}\u2600 · Q`, rect.x + rect.w / 2, rect.y + 38, 12, '#5a4300', 'center', true);
      return;
    }
    context.fillStyle = '#4a5a70';
    roundRect(rect.x, rect.y, rect.w, rect.h, 10);
    context.fill();
    if (status.cooldown > 0) {
      // The cooldown sweeps back in gold as the Sunburst recharges.
      const share = 1 - status.cooldown / SUNBURST_COOLDOWN;
      context.fillStyle = 'rgba(242, 183, 5, 0.5)';
      roundRect(rect.x, rect.y, Math.max(10, rect.w * share), rect.h, 10);
      context.fill();
      text(`\u2600 SUNBURST — ${Math.ceil(status.cooldown)}s`, rect.x + rect.w / 2, rect.y + 27, 18, '#ffffff', 'center', true);
      return;
    }
    context.fillStyle = '#3a4757';
    roundRect(rect.x, rect.y + rect.h - 6, rect.w, 6, 3);
    context.fill();
    const reason = status.reason === 'needs sunlight' ? `needs ${status.cost}\u2600` : status.reason === 'no pests' ? 'no pests on field' : status.reason;
    text('\u2600 SUNBURST', rect.x + rect.w / 2, rect.y + 22, 18, '#ffffff', 'center', true);
    text(reason, rect.x + rect.w / 2, rect.y + 38, 12, 'rgba(255,255,255,0.8)', 'center');
  }

  function drawCards(state, ui) {
    context.fillStyle = PALETTE.panel;
    context.fillRect(0, CARDS.y, BOARD.cols * BOARD.cell, CARDS.height);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, CARDS.y, BOARD.cols * BOARD.cell, 3);
    for (let index = 0; index < PLANTS.length; index += 1) {
      const def = PLANTS[index];
      const rect = LAYOUT.cards[index];
      const afford = state.sun >= def.cost;
      const selected = ui.selectedCard === index;
      context.fillStyle = selected ? '#243b5c' : PALETTE.card;
      roundRect(rect.x, rect.y, rect.w, rect.h, 10);
      context.fill();
      context.strokeStyle = selected ? '#7fd08a' : PALETTE.cardEdge;
      context.lineWidth = selected ? 3 : 1.5;
      roundRect(rect.x, rect.y, rect.w, rect.h, 10);
      context.stroke();
      context.globalAlpha = afford ? 1 : 0.45;
      drawPlantHead(def.id, rect.x + 30, rect.y + 42, 20, state.elapsed, index);
      context.globalAlpha = 1;
      text(def.short, rect.x + 56, rect.y + 32, 18, PALETTE.text, 'left', true);
      text(def.harvest ? 'sun / 5s' : `${def.damage} dmg`, rect.x + 56, rect.y + 52, 13, PALETTE.muted, 'left');
      circle(rect.x + 62, rect.y + 68, 7, PALETTE.sun);
      text(String(def.cost), rect.x + 74, rect.y + 73, 17, afford ? PALETTE.text : PALETTE.danger, 'left', true);
      text(String(index + 1), rect.x + rect.w - 14, rect.y + 20, 13, PALETTE.muted, 'right');
    }
  }

  function drawGhost(state, ui) {
    const hover = ui.hover;
    if (!hover.inside || ui.selectedCard < 0) return;
    const col = Math.floor((hover.x - BOARD.x) / BOARD.cell);
    const row = Math.floor((hover.y - BOARD.y) / BOARD.cell);
    if (col < 0 || col >= BOARD.cols || row < 0 || row >= BOARD.rows) return;
    const def = PLANTS[ui.selectedCard];
    const centre = cellCentre(col, row);
    const ok = ui.canPlant(col, row) && state.sun >= def.cost;
    context.fillStyle = ok ? PALETTE.ghostOk : PALETTE.ghostBad;
    context.fillRect(BOARD.x + col * BOARD.cell + 2, BOARD.y + row * BOARD.cell + 2, BOARD.cell - 4, BOARD.cell - 4);
    if (!def.harvest) {
      const range = plantRange(def, 0, blessingMods(state.blessings));
      context.fillStyle = PALETTE.range;
      context.beginPath();
      context.arc(centre.x, centre.y, range, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.rangeEdge;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(centre.x, centre.y, range, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 0.75;
    drawPlantHead(def.id, centre.x, centre.y - 6, 17, state.elapsed, 0);
    context.globalAlpha = 1;
  }

  function drawSelectedRange(state, ui) {
    const selected = ui.selectedPlant;
    if (!selected) return;
    const def = PLANTS.find((item) => item.id === selected.kind);
    if (def.harvest) return;
    const range = plantRange(def, selected.stage, blessingMods(state.blessings));
    context.fillStyle = PALETTE.range;
    context.beginPath();
    context.arc(selected.x, selected.y, range, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.rangeEdge;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(selected.x, selected.y, range, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.strokeRect(
      BOARD.x + selected.col * BOARD.cell + 2,
      BOARD.y + selected.row * BOARD.cell + 2,
      BOARD.cell - 4,
      BOARD.cell - 4,
    );
  }

  function drawBanner(ui, elapsed) {
    if (!ui.banner) return;
    const left = ui.banner.until - elapsed;
    if (left <= 0) return;
    const alpha = left > 0.5 ? 1 : left / 0.5;
    context.globalAlpha = alpha;
    text(ui.banner.title, 432, 220, 54, '#ffffff', 'center', true);
    if (ui.banner.sub) text(ui.banner.sub, 432, 258, 22, '#f3ead3', 'center');
    context.globalAlpha = 1;
  }

  /** Split a line into rows of at most maxChars characters, on word breaks. */
  function wrapText(value, maxChars) {
    const words = value.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      if (line.length > 0 && line.length + 1 + word.length > maxChars) {
        lines.push(line);
        line = word;
      } else {
        line = line.length > 0 ? `${line} ${word}` : word;
      }
    }
    if (line.length > 0) lines.push(line);
    return lines;
  }

  function drawTitlePanel(records, ui) {
    context.fillStyle = 'rgba(6, 12, 22, 0.45)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // A warm halo behind the title: the moon's gold, so the name glows
    // instead of sitting flat on the dark garden.
    const halo = context.createRadialGradient(FIELD.width / 2, 105, 10, FIELD.width / 2, 105, 360);
    halo.addColorStop(0, 'rgba(242, 183, 5, 0.26)');
    halo.addColorStop(1, 'rgba(242, 183, 5, 0)');
    context.fillStyle = halo;
    context.fillRect(0, 0, FIELD.width, 260);
    // The name itself in moonlit gold, bright at the top and pale at the
    // base — the title glows like the moon it gardens under.
    const titleGold = context.createLinearGradient(0, 58, 0, 120);
    titleGold.addColorStop(0, '#ffd94a');
    titleGold.addColorStop(1, '#fff6d8');
    text('SEEDWARDEN', FIELD.width / 2, 118, 72, titleGold, 'center', true);
    text('Draft the seasons. Grow the grove. Hold the Heart Tree.', FIELD.width / 2, 156, 24, '#b9d2e8', 'center');
    text('6 plants  ·  3 stages  ·  8 seasons  ·  10 blessings  ·  3 champions  ·  5 feats  ·  20 waves  ·  1 Blight', FIELD.width / 2, 184, 16, '#b9d2e8', 'center');
    // Left: how to play.
    context.fillStyle = PALETTE.panel;
    roundRect(90, 210, 470, 190, 14);
    context.fill();
    text('HOW TO PLAY', 114, 242, 20, PALETTE.text, 'left', true);
    const howLines = [
      '1–6 pick a plant · click grass to plant it',
      'Space starts the next wave early (+sun)',
      'Q Sunburst: 150\u2600 blasts every pest on field',
      'Every 5 waves, draft the next season',
      'Each season grants a blessing, forever',
      'WIN hold the tree 20 waves · LOSE it falls',
    ];
    howLines.forEach((line, index) => {
      text(line, 114, 272 + index * 22, 16, PALETTE.text, 'left');
    });
    // Right: choose your grove — three difficulties, one picked.
    context.fillStyle = PALETTE.panel;
    roundRect(720, 210, 470, 190, 14);
    context.fill();
    text('CHOOSE YOUR GROVE', 744, 242, 20, PALETTE.text, 'left', true);
    DIFFICULTIES.forEach((difficulty, index) => {
      const rect = LAYOUT.titleDifficulties[index];
      const selected = ui.difficulty === difficulty.id;
      context.fillStyle = selected ? '#243b5c' : PALETTE.card;
      roundRect(rect.x, rect.y, rect.w, rect.h, 8);
      context.fill();
      context.strokeStyle = selected ? '#7fd08a' : PALETTE.cardEdge;
      context.lineWidth = selected ? 2.5 : 1.5;
      roundRect(rect.x, rect.y, rect.w, rect.h, 8);
      context.stroke();
      text(difficulty.name.toUpperCase(), rect.x + 14, rect.y + 20, 17, PALETTE.text, 'left', true);
      text(difficulty.tagline, rect.x + 14, rect.y + 37, 13, PALETTE.muted, 'left');
      const resources = difficulty.pestHp > 1
        ? `${difficulty.sun}\u2600 · ${difficulty.hearts}\u2665 · pests +15% HP`
        : `${difficulty.sun}\u2600 · ${difficulty.hearts}\u2665`;
      text(selected ? `\u2713 ${resources}` : resources, rect.x + rect.w - 14, rect.y + 28, 14, selected ? PALETTE.cardAfford : PALETTE.muted, 'right', true);
    });
    // The bestiary strip: every foe with its note — what it does, and when
    // the champions and the boss walk — so the title teaches the whole hunt.
    context.fillStyle = PALETTE.panel;
    roundRect(90, 408, 1100, 68, 14);
    context.fill();
    text('THE PESTS', 114, 447, 17, PALETTE.text, 'left', true);
    const pestOrder = ['aphid', 'moth', 'beetle', 'slug', 'gloomcap', 'mirewarden', 'rotmother', 'blight'];
    pestOrder.forEach((type, index) => {
      const def = PESTS[type];
      const x = 240 + index * 120;
      circle(x, 440, 9, def.body);
      // The Mire Warden's full name crowds the next icon: the strip shortens it.
      text(type === 'mirewarden' ? 'Mire Warden' : def.name, x + 14, 445, 14, PALETTE.text, 'left', true);
      text(def.note, x + 14, 463, 12, PALETTE.muted, 'left');
    });
    drawButton(LAYOUT.titlePlay, 'PLAY', true, null);
    drawButton(LAYOUT.titleHow, 'HOW TO PLAY', true, null);
    const best = records.best > 0 ? records.best.toLocaleString('en-US') : '\u2014';
    const furthest = records.furthest > 0 ? String(records.furthest) : '\u2014';
    const featCount = (records.feats ?? []).length;
    text(`BEST ${best}  ·  FURTHEST WAVE ${furthest}  ·  GROVES SAVED ${records.saved}  ·  FEATS ${featCount}/${FEATS.length}  ·  SEEDS ${records.seeds ?? 0}`, FIELD.width / 2, 664, 17, '#b9d2e8', 'center', true);
    text('1–6 plant  ·  Space start wave  ·  Q sunburst  ·  R reroll  ·  F speed  ·  P pause  ·  M mute', FIELD.width / 2, 700, 13, 'rgba(185,210,232,0.6)', 'center');
  }

  function drawHowPanel() {
    context.fillStyle = 'rgba(6, 12, 22, 0.62)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const panel = { x: 290, y: 84, w: 700, h: 540 };
    context.fillStyle = PALETTE.panel;
    roundRect(panel.x, panel.y, panel.w, panel.h, 16);
    context.fill();
    text('How to play', FIELD.width / 2, 140, 40, PALETTE.text, 'center', true);
    const lines = [
      'Pests walk the soil path to the Heart Tree. If it falls, the grove falls.',
      'Click a plant card (or press 1–6), then click a grass cell to plant it.',
      'Plants grow: seed \u2192 sprout \u2192 bloom, stronger at every stage.',
      'A bloomed plant can be nourished once (+50% damage) or sold back.',
      'Every 5 waves, draft the next season: each one changes the rules',
      'and grants a blessing that lasts the rest of the game.',
      'Q fires the Sunburst: 150 sun, every pest on the field takes 80 damage.',
      'R redraws the draft for 25 sun. Champions walk on waves 5, 10 and 15.',
      'Kills close together build a combo — up to \u00D78 score. A leak spends it.',
      'A flawless season (no leaks) earns a bonus blessing.',
      'Survive all 20 waves to win. Then try endless mode.',
    ];
    lines.forEach((line, index) => {
      text(line, FIELD.width / 2, 190 + index * 28, 20, PALETTE.text, 'center');
    });
    text('Space start wave  ·  Q sunburst  ·  R reroll  ·  F speed  ·  P pause  ·  M mute', FIELD.width / 2, 505, 18, PALETTE.muted, 'center');
    drawButton(LAYOUT.howBack, 'BACK', true, null);
  }

  /** One effect of a season card, as a line: green when it helps, red when it costs. */
  function cardEffectLines(card) {
    const lines = [];
    const pct = (value) => `${value > 1 ? '+' : '\u2212'}${Math.round(Math.abs(value - 1) * 100)}%`;
    if (card.growth !== 1) lines.push({ text: `Growth \u00D7${card.growth}`, good: card.growth > 1 });
    if (card.damage !== 1) lines.push({ text: `Damage ${pct(card.damage)}`, good: card.damage > 1 });
    if (card.reward !== 1) lines.push({ text: `Kills ${pct(card.reward)} sun`, good: card.reward > 1 });
    if (card.pestSpeed !== 1) {
      lines.push(card.pestSpeed > 1
        ? { text: `Pests ${pct(card.pestSpeed)} faster`, good: false }
        : { text: `Pests ${Math.round((1 - card.pestSpeed) * 100)}% slower`, good: true });
    }
    if (card.pestHp !== 1) lines.push({ text: `Pests ${pct(card.pestHp)} tougher`, good: false });
    return lines;
  }

  function drawDraftPanel(state, ui) {
    const offer = ui.draftOffer ?? [];
    context.fillStyle = 'rgba(6, 12, 22, 0.82)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('CHOOSE THE SEASON', FIELD.width / 2, 88, 46, PALETTE.title, 'center', true);
    text(`Draft ${state.draftNumber} of 3 · Wave ${state.wave} cleared — the grove turns. Every season brings its blessing.`, FIELD.width / 2, 118, 19, '#b9d2e8', 'center');
    if (state.flawlessGift) {
      text(`\u2726 Flawless season! The grove grants ${state.flawlessGift.name} — ${state.flawlessGift.blurb}`, FIELD.width / 2, 140, 16, PALETTE.gold, 'center', true);
    }
    // The year, as a four-node map: the season behind, the one being chosen
    // now, and the drafts still to come. Real data — the drafted seasons
    // come from the run's season plan, so the map always tells the truth.
    const yearY = 150;
    const nodeW = 190;
    const nodeGap = 12;
    const yearX = (FIELD.width - (nodeW * 4 + nodeGap * 3)) / 2;
    context.strokeStyle = 'rgba(242, 183, 5, 0.5)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(yearX + nodeW / 2, yearY + 13);
    context.lineTo(yearX + nodeW * 3 + nodeGap * 3 + nodeW / 2, yearY + 13);
    context.stroke();
    for (let block = 0; block < 4; block += 1) {
      const nx = yearX + block * (nodeW + nodeGap);
      const picked = block < state.draftNumber;
      const choosing = block === state.draftNumber;
      const season = picked ? ui.seasonFor(block * 5 + 1) : null;
      const label = picked
        ? `${season?.glyph ?? '\u273F'} ${season?.name ?? 'Spring'} \u2713`
        : choosing
          ? '\u2726 choose now'
          : `draft at wave ${block * 5}`;
      context.fillStyle = choosing ? 'rgba(242, 183, 5, 0.25)' : PALETTE.panel;
      roundRect(nx, yearY, nodeW, 26, 13);
      context.fill();
      context.strokeStyle = choosing ? PALETTE.gold : PALETTE.cardEdge;
      context.lineWidth = choosing ? 2 : 1;
      roundRect(nx, yearY, nodeW, 26, 13);
      context.stroke();
      text(`W${block * 5 + 1}\u2013${block * 5 + 5} \u00B7 ${label}`, nx + nodeW / 2, yearY + 18, 13, choosing ? PALETTE.gold : PALETTE.text, 'center', true);
    }
    const tagColors = { GROWTH: '#3f8a5f', POWER: '#d45d4d', RICHES: '#c79a2e', WARD: '#4a8fd4' };
    offer.forEach((card, index) => {
      const rect = LAYOUT.draftCards[index];
      const hovered = ui.hover.inside && inside(rect, ui.hover.x, ui.hover.y);
      context.fillStyle = PALETTE.panel;
      roundRect(rect.x, rect.y, rect.w, rect.h, 14);
      context.fill();
      // A wash of the season's own colour over the card's top, so the three
      // offers read as three different seasons at a glance, not three
      // identical panels.
      const seasonTint = { spring: '#7fb069', summer: '#e9c46a', autumn: '#d98e32', winter: '#8ecae6' }[card.base] ?? '#7fb069';
      context.save();
      roundRect(rect.x, rect.y, rect.w, rect.h, 14);
      context.clip();
      const tint = context.createLinearGradient(0, rect.y, 0, rect.y + rect.h * 0.45);
      tint.addColorStop(0, `${seasonTint}2e`);
      tint.addColorStop(1, `${seasonTint}00`);
      context.fillStyle = tint;
      context.fillRect(rect.x, rect.y, rect.w, rect.h * 0.45);
      context.restore();
      context.strokeStyle = hovered ? '#7fd08a' : PALETTE.cardEdge;
      context.lineWidth = hovered ? 3 : 1.5;
      roundRect(rect.x, rect.y, rect.w, rect.h, 14);
      context.stroke();
      // The card's kind, top left.
      context.fillStyle = tagColors[card.tag] ?? PALETTE.text;
      roundRect(rect.x + 16, rect.y + 16, 78, 22, 11);
      context.fill();
      text(card.tag, rect.x + 55, rect.y + 31, 11, '#ffffff', 'center', true);
      // Key number, top right.
      circle(rect.x + rect.w - 28, rect.y + 28, 13, PALETTE.text);
      text(String(index + 1), rect.x + rect.w - 28, rect.y + 33, 15, '#0b1726', 'center', true);
      // Season glyph in a tinted disc. The glyph is dark: the disc is light.
      const base = seasonTint;
      circle(rect.x + rect.w / 2, rect.y + 58, 30, base);
      text({ spring: '\u273F', summer: '\u2600', autumn: '\u2766', winter: '\u2744' }[card.base] ?? '\u273F', rect.x + rect.w / 2, rect.y + 69, 30, '#0b1726', 'center', true);
      text(card.name, rect.x + rect.w / 2, rect.y + 118, 25, PALETTE.text, 'center', true);
      const tagLines = wrapText(card.tagline, 32);
      tagLines.forEach((line, lineIndex) => {
        text(line, rect.x + rect.w / 2, rect.y + 144 + lineIndex * 20, 14, PALETTE.muted, 'center');
      });
      context.strokeStyle = PALETTE.cardEdge;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(rect.x + 24, rect.y + 186);
      context.lineTo(rect.x + rect.w - 24, rect.y + 186);
      context.stroke();
      let cursor = rect.y + 212;
      for (const effect of cardEffectLines(card)) {
        text(effect.text, rect.x + rect.w / 2, cursor, 16, effect.good ? '#7fd08a' : '#ff7a6b', 'center', true);
        cursor += 24;
      }
      if (card.risk) {
        text(`Risk: ${card.risk}`, rect.x + rect.w / 2, cursor, 14, '#ff7a6b', 'center');
        cursor += 24;
      }
      const blessing = blessingById(card.blessing);
      const held = state.blessings.includes(card.blessing);
      cursor += 8;
      context.fillStyle = held ? 'rgba(233,238,247,0.08)' : 'rgba(242, 183, 5, 0.16)';
      roundRect(rect.x + 16, cursor, rect.w - 32, 30, 15);
      context.fill();
      text(
        held ? `${blessing.glyph} ${blessing.name} — held: +75\u2600` : `${blessing.glyph} ${blessing.name}`,
        rect.x + rect.w / 2, cursor + 20, 15, PALETTE.text, 'center', true,
      );
      text(blessing.blurb, rect.x + rect.w / 2, cursor + 48, 13, PALETTE.muted, 'center');
    });
    // Reroll: redraw the three cards for 25 sunlight, as often as the purse allows.
    drawButton(LAYOUT.draftReroll, `REROLL · ${REROLL_COST}\u2600`, state.sun >= REROLL_COST, null, 17);
    const coming = state.wave < 10
      ? 'The Mire Warden walks on wave 10.'
      : state.wave < 15
        ? 'Rotmother walks on wave 15.'
        : 'The Blight arrives on wave 20.';
    text(coming, FIELD.width / 2, 630, 15, PALETTE.gold, 'center', true);
    // The footer lines sit over the plant cards, so they get a dark band of
    // their own to read against.
    context.fillStyle = 'rgba(6, 12, 22, 0.85)';
    roundRect(280, 644, 720, 54, 12);
    context.fill();
    text(
      `\u2600 ${state.sun.toLocaleString('en-US')}  \u00B7  \u2665 ${state.hearts}/${state.maxHearts}  \u00B7  SCORE ${state.score.toLocaleString('en-US')}  \u00B7  BLESSINGS ${state.blessings.length}  \u00B7  ${state.difficulty.name.toUpperCase()}`,
      FIELD.width / 2, 668, 17, PALETTE.title, 'center', true,
    );
    text('Click a card or press 1 – 3  ·  R reroll', FIELD.width / 2, 690, 15, 'rgba(185,210,232,0.75)', 'center');
  }

  function drawEndPanel(state, victory, records, ui) {
    const grade = gradeFor({
      hearts: state.hearts,
      maxHearts: state.maxHearts,
      leaked: state.leaked,
      longestCombo: state.combo.longest,
      wave: state.wave,
    });
    if (victory) {
      // Dawn breaks over the grove: a warm gold-to-rose wash over the night
      // garden, so winning feels like morning after a long night — the
      // defeat screen keeps the cold dark.
      const dawn = context.createLinearGradient(0, 0, 0, FIELD.height);
      dawn.addColorStop(0, 'rgba(247, 200, 115, 0.70)');
      dawn.addColorStop(0.55, 'rgba(232, 140, 160, 0.55)');
      dawn.addColorStop(1, 'rgba(120, 80, 140, 0.45)');
      context.fillStyle = dawn;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    context.fillStyle = victory ? 'rgba(6, 12, 22, 0.35)' : 'rgba(6, 12, 22, 0.62)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const panel = { x: 240, y: 80, w: 800, h: 560 };
    context.fillStyle = PALETTE.panel;
    roundRect(panel.x, panel.y, panel.w, panel.h, 16);
    context.fill();
    text(victory ? 'The Grove Holds!' : 'The Grove Has Fallen', FIELD.width / 2, 136, 40, PALETTE.text, 'center', true);
    text(
      victory ? 'Twenty waves, four seasons, one grove — still standing.' : `The pests broke through on wave ${state.wave}.`,
      FIELD.width / 2, 166, 19, PALETTE.muted, 'center',
    );
    text(`SCORE ${state.score.toLocaleString('en-US')}`, FIELD.width / 2, 198, 26, PALETTE.text, 'center', true);
    // The rank: a letter in a coloured ring, with the new-best badge under it.
    circle(370, 282, 62, '#0b1726');
    context.strokeStyle = GRADE_COLORS[grade.letter];
    context.lineWidth = 5;
    context.beginPath();
    context.arc(370, 282, 62, 0, Math.PI * 2);
    context.stroke();
    text(grade.letter, 370, 305, 64, GRADE_COLORS[grade.letter], 'center', true);
    text('RANK', 370, 366, 13, PALETTE.muted, 'center', true);
    if (records.newBest) {
      context.fillStyle = PALETTE.gold;
      roundRect(300, 380, 140, 26, 13);
      context.fill();
      text('\u2605 NEW BEST!', 370, 398, 14, '#3a2a00', 'center', true);
    } else {
      text(`BEST ${Math.max(records.best, state.score).toLocaleString('en-US')}`, 370, 398, 15, PALETTE.muted, 'center');
    }
    // The stat grid: eight numbers that say what the run was. "Best combo"
    // is the multiplier (×8); the kill count lives in the grade line as the
    // longest streak — the two no longer share one wording.
    const stats = [
      ['Waves cleared', String(victory ? state.wave : Math.max(0, state.wave - 1))],
      ['Pests stopped', String(state.kills)],
      ['Best combo', formatMult(comboMultiplier(state.combo.longest))],
      ['Champions felled', `${state.championsFelled}/3`],
      ['Leaks', String(state.leaked)],
      ['Time', formatTime(state.elapsed)],
      ['Sunlight earned', String(state.earned)],
      ['Blessings held', `${state.blessings.length}/10`],
    ];
    stats.forEach(([label, value], index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const x = 520 + col * 130;
      const y = 236 + row * 60;
      text(label, x, y, 13, PALETTE.muted, 'left', true);
      text(value, x, y + 24, 20, PALETTE.text, 'left', true);
    });
    text(`${grade.line}  \u00B7  ${grade.points} pts`, FIELD.width / 2, 340, 15, PALETTE.muted, 'center');
    // The score by wave: one gold bar per wave cleared, from the run's own
    // ledger — the season's shape at a glance, best wave called out.
    const scores = state.waveScores ?? [];
    if (scores.length > 0) {
      const deltas = scores.map((score, index) => score - (index === 0 ? 0 : scores[index - 1]));
      const best = Math.max(...deltas);
      const bestWave = deltas.indexOf(best) + 1;
      text('SCORE BY WAVE', 470, 372, 13, PALETTE.muted, 'left', true);
      text(`BEST WAVE ${bestWave} +${best.toLocaleString('en-US')}`, 1020, 372, 13, PALETTE.gold, 'right', true);
      const chartX = 470;
      const chartW = 550;
      const chartY = 380;
      const chartH = 36;
      const slot = chartW / scores.length;
      deltas.forEach((delta, index) => {
        const height = best > 0 ? Math.max(3, (delta / best) * chartH) : 3;
        context.fillStyle = index + 1 === bestWave ? PALETTE.gold : 'rgba(242, 183, 5, 0.55)';
        context.fillRect(chartX + index * slot + 1, chartY + chartH - height, Math.max(2, slot - 2), height);
      });
      context.fillStyle = 'rgba(255,255,255,0.25)';
      context.fillRect(chartX, chartY + chartH + 1, chartW, 1);
    }
    // The feats the run earned, and the ones it missed.
    text('FEATS', 280, 428, 13, PALETTE.muted, 'left', true);
    const earned = featsFor(state);
    FEATS.forEach((feat, index) => {
      chip(280 + index * 148, 438, 140, 24, feat.glyph, feat.name, earned.includes(feat.id) ? '#e0a92e' : PALETTE.muted, !earned.includes(feat.id));
    });
    // The boss-felled banner, when the run ended with the Blight dead.
    if (victory && state.blightKilled) {
      context.fillStyle = 'rgba(124, 58, 237, 0.25)';
      roundRect(280, 474, 720, 28, 14);
      context.fill();
      text(
        `\u2620 THE BLIGHT FELLED IN ${formatTime(state.blightFelledIn)} · WAVE 20 · +150\u2600`,
        FIELD.width / 2, 493, 14, '#d8b4fe', 'center', true,
      );
    }
    // The blessings the run collected, as one line.
    if (state.blessings.length === 0) {
      text('No blessings this run — draft a season next time.', 280, 520, 14, PALETTE.muted, 'left');
    } else {
      const names = state.blessings.map((id) => blessingById(id).name).join(' · ');
      text(`BLESSINGS ${state.blessings.length}/10: ${names}`, 280, 520, 13, PALETTE.muted, 'left');
    }
    if (victory) {
      drawButton(LAYOUT.victoryAgain, 'PLAY AGAIN', true, null, 20);
      drawButton(LAYOUT.victoryEndless, 'ENDLESS MODE', true, null, 20);
      drawButton(LAYOUT.victoryTitle, 'BACK TO TITLE', true, null, 20);
    } else {
      drawButton(LAYOUT.defeatAgain, 'TRY AGAIN', true, null, 20);
      drawButton(LAYOUT.defeatTitle, 'BACK TO TITLE', true, null, 20);
    }
    const goal = nextGoal({ won: victory, difficulty: state.difficulty.id, wave: state.wave });
    text(`NEXT GOAL: ${goal}`, FIELD.width / 2, 612, 15, '#e0a92e', 'center', true);
    const banked = records.seedsBanked ?? 0;
    const bankLine = victory && banked > 0
      ? `  \u00B7  +${banked} SEEDS BANKED (TOTAL ${records.seeds ?? banked})`
      : '';
    text(
      `Seed ${ui.seed} \u00B7 ${state.difficulty.name.toUpperCase()} \u00B7 ${earned.length} feats this run${bankLine}`,
      FIELD.width / 2, 634, 12, PALETTE.muted, 'center',
    );
  }

  function drawPausedPanel() {
    context.fillStyle = 'rgba(6, 12, 22, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('Paused', FIELD.width / 2, 340, 56, PALETTE.title, 'center', true);
    text('Press P or click PAUSE to keep gardening.', FIELD.width / 2, 386, 22, '#b9d2e8', 'center');
  }

  /** Paint one frame: the garden, then the HUD, panels and cards, then any overlay. */
  function draw(state, ui, screen, records) {
    const season = ui.season;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawBoard(state, season, state.elapsed);
    drawGhost(state, ui);
    drawSelectedRange(state, ui);
    drawTree(state, state.elapsed);
    for (const plant of state.plants) drawPlant(plant, state.elapsed);
    for (const pest of state.pests) drawPest(pest, state.elapsed);
    drawFireflies(state.elapsed);
    drawParticles(state);
    drawTracers(state);
    drawFloats(state);
    drawVignette();
    if (screen === SCREEN_TITLE) {
      drawTitlePanel(records, ui);
      return;
    }
    if (screen === SCREEN_HOWTO) {
      drawHowPanel();
      return;
    }
    drawHud(state, ui, season, records);
    drawBossBar(state, season);
    drawPanel(state, ui, season);
    drawCards(state, ui);
    drawBanner(ui, state.elapsed);
    if (screen === SCREEN_PAUSED) drawPausedPanel();
    else if (screen === SCREEN_DRAFT) drawDraftPanel(state, ui);
    else if (screen === SCREEN_VICTORY) drawEndPanel(state, true, records, ui);
    else if (screen === SCREEN_DEFEAT) drawEndPanel(state, false, records, ui);
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Convert a client (mouse) position to logical field coordinates. */
    toLogical(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const px = (clientX - rect.left) * ratio;
      const py = (clientY - rect.top) * ratio;
      return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
    },
  };
}
