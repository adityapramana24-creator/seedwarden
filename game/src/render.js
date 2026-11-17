// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. Flat vector shapes, canvas text for the HUD and the
// panels. Every button's rectangle lives in LAYOUT, which the main loop uses
// for hit-testing, so what you see is exactly what you can click.
//
// The screen is dense on purpose: the HUD carries the win/lose terms, the live
// combo and grade and the best score; the side panel carries the threat queue
// with traits and the blessings the grove has granted; the title, the draft and
// the end screens each show a full panel of the game's systems. Every number
// on screen is a live value from the world — nothing here is decoration.

import { BOARD, CARDS, FIELD, FONT, HUD, PALETTE, PANEL, TREE_CELL, TREE_HEARTS, WAVES_PER_YEAR, cellCentre, isPathCell } from './config.js';
import { GROWTH_SECONDS, PLANTS, STAGE_NAMES, nourishCost, plantDamage, plantHarvest, plantRange, sellValue } from './plants.js';
import { PESTS } from './pests.js';
import { wavesLeftInSeason } from './seasons.js';
import { blessingById, blessingMods } from './blessings.js';
import { GRADE_COLORS, comboMultiplier, gradeFor } from './combo.js';

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
  speedButton: { x: PANEL.x + 16, y: 608, w: 120, h: 40 },
  pauseButton: { x: PANEL.x + 144, y: 608, w: 120, h: 40 },
  muteButton: { x: PANEL.x + 272, y: 608, w: 120, h: 40 },
  nourishButton: { x: PANEL.x + 16, y: 446, w: 184, h: 30 },
  sellButton: { x: PANEL.x + 208, y: 446, w: 184, h: 30 },
  titlePlay: { x: 490, y: 508, w: 300, h: 56 },
  titleHow: { x: 490, y: 574, w: 300, h: 44 },
  howBack: { x: 490, y: 566, w: 300, h: 48 },
  draftCards: [
    { x: 170, y: 160, w: 300, h: 400 },
    { x: 490, y: 160, w: 300, h: 400 },
    { x: 810, y: 160, w: 300, h: 400 },
  ],
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
function cellHash(col, row, salt) {
  let hash = (col * 374761393 + row * 668265263 + salt * 974634211) | 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

/** A multiplier as the HUD shows it: ×2 when whole, ×2.5 when not. */
function formatMult(value) {
  if (Number.isInteger(value)) return `\u00D7${value}`;
  return `\u00D7${value.toFixed(2).replace(/0$/, '')}`;
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

  /** A small pill with a glyph and a label, for blessings and tags. */
  function chip(x, y, w, h, glyph, label, color) {
    context.fillStyle = 'rgba(34, 48, 31, 0.08)';
    roundRect(x, y, w, h, h / 2);
    context.fill();
    context.strokeStyle = PALETTE.cardEdge;
    context.lineWidth = 1;
    roundRect(x, y, w, h, h / 2);
    context.stroke();
    text(glyph, x + 10, y + h / 2 + 5, 14, color ?? PALETTE.cardAfford, 'left', true);
    text(label, x + 30, y + h / 2 + 5, 13, PALETTE.text, 'left', true);
  }

  function drawBoard(state, season, elapsed) {
    for (let row = 0; row < BOARD.rows; row += 1) {
      for (let col = 0; col < BOARD.cols; col += 1) {
        const x = BOARD.x + col * BOARD.cell;
        const y = BOARD.y + row * BOARD.cell;
        if (isPathCell(col, row)) {
          context.fillStyle = PALETTE.soil;
          context.fillRect(x, y, BOARD.cell, BOARD.cell);
          context.fillStyle = PALETTE.soilEdge;
          if (cellHash(col, row, 1) > 0.5) context.fillRect(x + 10, y + 14, 12, 8);
          if (cellHash(col, row, 2) > 0.5) context.fillRect(x + 44, y + 46, 14, 9);
          if (cellHash(col, row, 3) > 0.6) context.fillRect(x + 30, y + 30, 8, 6);
        } else {
          context.fillStyle = (col + row) % 2 === 0 ? PALETTE.board : PALETTE.boardAlt;
          context.fillRect(x, y, BOARD.cell, BOARD.cell);
          context.fillStyle = 'rgba(0,0,0,0.06)';
          if (cellHash(col, row, 4) > 0.6) {
            context.beginPath();
            context.arc(x + 18 + cellHash(col, row, 5) * 36, y + 18 + cellHash(col, row, 6) * 36, 4, 0, Math.PI * 2);
            context.fill();
          }
        }
      }
    }
    // Season tint over the grass, light enough to keep the board readable.
    context.fillStyle = season.tint;
    context.globalAlpha = 0.13;
    context.fillRect(BOARD.x, BOARD.y, BOARD.cols * BOARD.cell, BOARD.rows * BOARD.cell);
    context.globalAlpha = 1;
    context.strokeStyle = 'rgba(0,0,0,0.15)';
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
    context.fillStyle = '#5d4a2f';
    context.fillRect(BOARD.x - 2, BOARD.y + BOARD.cell * 0.5, 10, BOARD.cell);
    context.fillStyle = '#7a6240';
    context.fillRect(BOARD.x - 2, BOARD.y + BOARD.cell * 0.5, 10, 10);
  }

  /** A soft darkening at the board's corners: depth, without hiding anything. */
  function drawVignette() {
    const gradient = context.createRadialGradient(
      432, 344, 260,
      432, 344, 620,
    );
    gradient.addColorStop(0, 'rgba(10, 18, 10, 0)');
    gradient.addColorStop(1, 'rgba(10, 18, 10, 0.22)');
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
    context.fillStyle = '#6b4a2a';
    context.fillRect(x - 9, y - 6, 18, 34);
    context.fillStyle = '#7d5a34';
    context.fillRect(x - 9, y - 6, 6, 34);
    const sway = Math.sin(elapsed * 1.4) * 2;
    circle(x - 18 + sway, y - 18, 22, '#2f6b2f');
    circle(x + 18 + sway, y - 18, 22, '#357a32');
    circle(x + sway, y - 32, 26, '#3f8a37');
    circle(x - 8 + sway, y - 12, 14, '#2f6b2f');
    circle(x + 10 + sway, y - 12, 14, '#357a32');
    // Heart-fruits: one glowing dot per heart left.
    for (let i = 0; i < state.hearts; i += 1) {
      const angle = (i / state.maxHearts) * Math.PI * 2 - Math.PI / 2;
      circle(x + Math.cos(angle) * 22 + sway, y - 22 + Math.sin(angle) * 16, 3.5, '#ff8a7a');
    }
  }

  /** The head of a plant, drawn at (x, y) with radius r, for the board and the cards. */
  function drawPlantHead(kind, x, y, r, elapsed, wobble) {
    const sway = Math.sin(elapsed * 1.8 + wobble) * r * 0.08;
    const cx = x + sway;
    if (kind === 'thorn') {
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2 + wobble;
        context.fillStyle = '#2f6b3c';
        context.beginPath();
        context.moveTo(cx + Math.cos(angle) * r * 0.5, y + Math.sin(angle) * r * 0.5);
        context.lineTo(cx + Math.cos(angle - 0.22) * r * 0.95, y + Math.sin(angle - 0.22) * r * 0.95);
        context.lineTo(cx + Math.cos(angle + 0.22) * r * 0.95, y + Math.sin(angle + 0.22) * r * 0.95);
        context.closePath();
        context.fill();
      }
      circle(cx, y, r * 0.62, '#5aa469');
      circle(cx - r * 0.18, y - r * 0.18, r * 0.2, '#8fd0a0');
    } else if (kind === 'frost') {
      for (let i = 0; i < 6; i += 1) {
        ellipse(cx, y, r * 0.95, r * 0.42, (i / 6) * Math.PI, '#7cc7d9');
      }
      circle(cx, y, r * 0.4, '#eaf7ff');
      circle(cx, y, r * 0.2, '#bde0fe');
    } else if (kind === 'sunspore') {
      for (let i = 0; i < 10; i += 1) {
        const angle = (i / 10) * Math.PI * 2;
        ellipse(cx + Math.cos(angle) * r * 0.72, y + Math.sin(angle) * r * 0.72, r * 0.42, r * 0.2, angle, '#f2b705');
      }
      circle(cx, y, r * 0.55, '#8a5a12');
      circle(cx - r * 0.16, y - r * 0.12, r * 0.07, '#fde68a');
      circle(cx + r * 0.16, y - r * 0.12, r * 0.07, '#fde68a');
    } else if (kind === 'bramble') {
      circle(cx - r * 0.4, y + r * 0.2, r * 0.55, '#c2703d');
      circle(cx + r * 0.4, y + r * 0.2, r * 0.55, '#c2703d');
      circle(cx, y - r * 0.3, r * 0.6, '#d97b45');
      circle(cx - r * 0.4, y + r * 0.05, r * 0.16, '#fdba74');
      circle(cx + r * 0.1, y - r * 0.45, r * 0.16, '#fdba74');
    } else if (kind === 'vine') {
      context.strokeStyle = '#3f6212';
      context.lineWidth = r * 0.28;
      context.lineCap = 'round';
      for (let i = 0; i < 3; i += 1) {
        const angle = -Math.PI / 2 + (i - 1) * 0.7 + Math.sin(elapsed * 3 + i) * 0.15;
        context.beginPath();
        context.moveTo(cx, y + r * 0.4);
        context.quadraticCurveTo(
          cx + Math.cos(angle) * r * 0.6, y + r * 0.4 + Math.sin(angle) * r * 0.5,
          cx + Math.cos(angle) * r, y + r * 0.4 + Math.sin(angle) * r * 0.9,
        );
        context.stroke();
      }
      circle(cx, y + r * 0.35, r * 0.45, '#84cc16');
    } else if (kind === 'spore') {
      context.fillStyle = '#e9e4d8';
      context.fillRect(cx - r * 0.18, y - r * 0.1, r * 0.36, r * 0.6);
      context.fillStyle = '#a78bfa';
      context.beginPath();
      context.arc(cx, y, r * 0.85, Math.PI, 0);
      context.closePath();
      context.fill();
      circle(cx - r * 0.35, y - r * 0.35, r * 0.12, '#ddd6fe');
      circle(cx + r * 0.3, y - r * 0.45, r * 0.1, '#ddd6fe');
      circle(cx + r * 0.05, y - r * 0.15, r * 0.09, '#ddd6fe');
    }
  }

  function drawPlant(plant, elapsed) {
    const def = PLANTS.find((item) => item.id === plant.kind);
    const x = plant.x;
    const y = plant.y;
    ellipse(x, y + 24, 24, 7, 0, 'rgba(0,0,0,0.22)');
    context.fillStyle = '#5d4a2f';
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
    for (let i = 0; i < 3; i += 1) {
      circle(x - 11 + i * 11, y + 31, 2.6, i <= plant.stage ? PALETTE.gold : 'rgba(255,255,255,0.35)');
    }
    if (plant.stage === 0) {
      context.strokeStyle = '#3f8a37';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(x, y + 18);
      context.lineTo(x, y + 6);
      context.stroke();
      ellipse(x - 6, y + 8, 7, 3.5, -0.6, '#5aa469');
      ellipse(x + 6, y + 8, 7, 3.5, 0.6, '#5aa469');
      circle(x, y + 16, 5, '#8a6a45');
      return;
    }
    const stemTop = plant.stage === 1 ? y + 2 : y - 8;
    context.strokeStyle = '#3f8a37';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x, y + 18);
    context.lineTo(x, stemTop);
    context.stroke();
    ellipse(x - 10, y + 10, 10, 4.5, -0.5, '#5aa469');
    ellipse(x + 10, y + 12, 10, 4.5, 0.5, '#4a9a58');
    if (plant.stage === 1) {
      circle(x, stemTop - 2, 8, def.color);
      return;
    }
    // A bloomed plant glows softly in its own colour.
    context.globalAlpha = 0.2;
    circle(x, stemTop - 8, 25, def.color);
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
      circle(x + r * 0.8, y - r * 0.35, 2, '#1c2415');
    } else if (pest.type === 'moth') {
      const flap = Math.sin(elapsed * 22 + pest.wobble) * 0.5;
      ellipse(x - r * 0.7, y - r * 0.3 + wobble, r * 0.9, r * 0.55, -0.5 - flap * 0.4, def.body);
      ellipse(x + r * 0.7, y - r * 0.3 + wobble, r * 0.9, r * 0.55, 0.5 + flap * 0.4, def.body);
      ellipse(x, y, r * 0.45, r * 0.9, 0, def.dark);
      circle(x, y - r * 0.7, r * 0.3, def.dark);
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
      circle(x + r * 0.6, y - r * 0.95, 2.5, '#1c2415');
      circle(x + r * 1.1, y - r * 0.95, 2.5, '#1c2415');
    } else if (pest.type === 'blight') {
      // The Blight is the biggest thing on the board: a pulsing violet aura,
      // a crown of thorns, glowing eyes — nothing else looks like it.
      const pulse = 1 + Math.sin(elapsed * 3) * 0.06;
      context.globalAlpha = 0.28 + Math.sin(elapsed * 3) * 0.06;
      circle(x, y, r * 1.55 * pulse, PALETTE.blight);
      context.globalAlpha = 1;
      circle(x, y, r * pulse, def.body);
      for (let i = 0; i < 5; i += 1) {
        const angle = -Math.PI / 2 + (i - 2) * 0.45;
        context.fillStyle = def.dark;
        context.beginPath();
        context.moveTo(x + Math.cos(angle) * r * 0.7, y + Math.sin(angle) * r * 0.7);
        context.lineTo(x + Math.cos(angle - 0.14) * r * 1.25, y + Math.sin(angle - 0.14) * r * 1.25);
        context.lineTo(x + Math.cos(angle + 0.14) * r * 1.25, y + Math.sin(angle + 0.14) * r * 1.25);
        context.closePath();
        context.fill();
      }
      circle(x - r * 0.3, y - r * 0.1, r * 0.16, '#e9d5ff');
      circle(x + r * 0.3, y - r * 0.1, r * 0.16, '#e9d5ff');
      circle(x, y + r * 0.3, r * 0.2, '#7c5cbf');
      context.fillStyle = 'rgba(20, 12, 32, 0.85)';
      roundRect(x - 26, y - r - 32, 52, 18, 9);
      context.fill();
      text('BOSS', x, y - r - 19, 12, '#e9d5ff', 'center', true);
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
    if (pest.hp < pest.maxHp) {
      const width = pest.type === 'blight' ? 76 : Math.max(28, r * 2.2);
      const ratio = Math.max(0, pest.hp / pest.maxHp);
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(x - width / 2, y - r - 12, width, 6);
      context.fillStyle = ratio > 0.5 ? '#84cc16' : ratio > 0.25 ? '#f2b705' : '#e5534b';
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

  function drawFloats(state) {
    for (const floating of state.floats) {
      context.globalAlpha = Math.max(0, floating.life / floating.maxLife);
      text(floating.text, floating.x, floating.y, 15, floating.color, 'center', true);
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, ui, season, records) {
    context.fillStyle = PALETTE.hud;
    context.fillRect(0, 0, FIELD.width, HUD.height);
    context.fillStyle = 'rgba(0,0,0,0.2)';
    context.fillRect(0, HUD.height - 4, FIELD.width, 4);
    // Sunlight.
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
      heart(712 + i * 19, 14, 13, i < state.hearts ? PALETTE.heart : 'rgba(0,0,0,0.35)');
    }
    // Season.
    circle(962, 26, 12, season.accent);
    text(season.glyph, 962, 32, 15, PALETTE.text, 'center', true);
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
  function drawBossBar(state) {
    const blight = state.pests.find((pest) => pest.type === 'blight');
    if (!blight) return;
    const x = 132;
    const y = 60;
    const w = 600;
    const h = 26;
    context.fillStyle = 'rgba(20, 12, 32, 0.85)';
    roundRect(x, y, w, h, 13);
    context.fill();
    context.strokeStyle = PALETTE.blight;
    context.lineWidth = 1.5;
    roundRect(x, y, w, h, 13);
    context.stroke();
    text('\u2620 THE BLIGHT', x + 16, y + 18, 15, '#e9d5ff', 'left', true);
    const barX = x + 150;
    const barW = 300;
    const ratio = Math.max(0, blight.hp / blight.maxHp);
    context.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(barX, y + 8, barW, 10, 5);
    context.fill();
    context.fillStyle = PALETTE.blight;
    if (ratio > 0) {
      roundRect(barX, y + 8, Math.max(10, barW * ratio), 10, 5);
      context.fill();
    }
    text(
      `${Math.ceil(blight.hp).toLocaleString('en-US')} / ${blight.maxHp.toLocaleString('en-US')}`,
      x + w - 16, y + 18, 13, '#e9d5ff', 'right',
    );
  }

  function drawButton(rect, label, enabled, sub, size) {
    const labelSize = size ?? 22;
    context.fillStyle = enabled ? PALETTE.button : '#7a7a6a';
    roundRect(rect.x, rect.y, rect.w, rect.h, 10);
    context.fill();
    context.fillStyle = enabled ? PALETTE.buttonEdge : '#5a5a4a';
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
    // Next wave: the threat queue, with each pest's trait.
    text('NEXT WAVE', x, 88, 16, PALETTE.muted, 'left', true);
    const nextWave = state.wave + 1;
    text(`Wave ${nextWave}${nextWave > WAVES_PER_YEAR ? ' (endless)' : ''}`, x, 114, 24, PALETTE.text, 'left', true);
    const drafted = ui.seasonFor(nextWave);
    const shown = drafted ?? season;
    text(
      drafted ? `${shown.glyph} ${shown.name} — ${shown.tagline}` : `${shown.glyph} ${shown.name} — season holds`,
      x, 136, 13, PALETTE.muted, 'left',
    );
    const preview = ui.preview;
    let rowY = 158;
    for (const group of preview.slice(0, 4)) {
      const def = PESTS[group.type];
      circle(x + 10, rowY, 8, def.body);
      text(`${def.name}  \u00D7${group.count}`, x + 26, rowY + 5, 16, PALETTE.text, 'left');
      text(def.trait, x + w, rowY + 5, 13, PALETTE.muted, 'right');
      rowY += 21;
    }
    text(`ON FIELD: ${state.pests.length}`, x, 252, 13, PALETTE.muted, 'left', true);
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
    // Info box: selected plant, selected card, or the season.
    const boxY = 330;
    context.fillStyle = PALETTE.card;
    roundRect(x, boxY, w, 150, 12);
    context.fill();
    context.strokeStyle = PALETTE.cardEdge;
    context.lineWidth = 1.5;
    roundRect(x, boxY, w, 150, 12);
    context.stroke();
    const selected = ui.selectedPlant;
    if (selected) {
      const def = PLANTS.find((item) => item.id === selected.kind);
      text(def.name, x + 14, boxY + 28, 21, PALETTE.text, 'left', true);
      text(`${STAGE_NAMES[selected.stage]}${selected.nourished ? ' · Nourished' : ''}`, x + 14, boxY + 50, 14, PALETTE.muted, 'left');
      if (def.harvest) {
        text(`Harvests ${plantHarvest(selected.stage, mods)} sun every 5s`, x + 14, boxY + 74, 15, PALETTE.text, 'left');
      } else {
        const damage = plantDamage(def, selected.stage, selected.nourished, season, mods);
        text(`Damage ${damage.toFixed(0)}  ·  ${def.rate}/s  ·  Range ${Math.round(plantRange(def, selected.stage, mods))}`, x + 14, boxY + 74, 15, PALETTE.text, 'left');
        if (def.slow > 0) text(`Slows pests ${Math.round(def.slow * 100)}%`, x + 14, boxY + 96, 15, PALETTE.text, 'left');
        if (def.splash > 0) text(`Splash ${Math.round(def.splash * mods.splash)}px${def.poison > 0 ? ' · poison' : ''}`, x + 14, boxY + 96, 15, PALETTE.text, 'left');
      }
      if (selected.stage < 2) {
        const growth = Math.min(1, selected.growth / GROWTH_SECONDS);
        context.fillStyle = 'rgba(0,0,0,0.15)';
        roundRect(x + 14, boxY + 104, w - 28, 8, 4);
        context.fill();
        context.fillStyle = '#84cc16';
        roundRect(x + 14, boxY + 104, Math.max(8, (w - 28) * growth), 8, 4);
        context.fill();
      }
      const cost = nourishCost(def, mods);
      const canNourish = selected.stage === 2 && !selected.nourished && state.sun >= cost;
      const nourishLabel = selected.nourished ? 'NOURISHED' : selected.stage < 2 ? 'GROWING…' : cost === 0 ? 'NOURISH FREE' : `NOURISH ${cost}\u2600`;
      drawButton(LAYOUT.nourishButton, nourishLabel, canNourish, null, 17);
      drawButton(LAYOUT.sellButton, `SELL +${sellValue(def)}\u2600`, true, null, 17);
    } else if (ui.selectedCard >= 0) {
      const def = PLANTS[ui.selectedCard];
      text(def.name, x + 14, boxY + 28, 21, PALETTE.text, 'left', true);
      text(def.blurb, x + 14, boxY + 50, 14, PALETTE.muted, 'left');
      if (def.harvest) {
        text('Harvests 3 / 5 / 7 sun every 5s as it grows.', x + 14, boxY + 74, 15, PALETTE.text, 'left');
      } else {
        text(`Damage ${def.damage}  ·  ${def.rate}/s  ·  Range ${def.range}`, x + 14, boxY + 74, 15, PALETTE.text, 'left');
        if (def.slow > 0) text(`Slows pests ${Math.round(def.slow * 100)}% for ${def.slowSeconds}s`, x + 14, boxY + 96, 15, PALETTE.text, 'left');
        if (def.splash > 0) text(`Splash ${def.splash}px${def.poison > 0 ? ` · poison ${def.poison}/s` : ''}`, x + 14, boxY + 96, 15, PALETTE.text, 'left');
      }
      text('Click a grass cell to plant it.', x + 14, boxY + 122, 15, PALETTE.cardAfford, 'left', true);
      text('Right-click or Esc to cancel.', x + 14, boxY + 142, 13, PALETTE.muted, 'left');
    } else {
      text(`${season.glyph} ${season.name}`, x + 14, boxY + 28, 21, PALETTE.text, 'left', true);
      text(season.tagline, x + 14, boxY + 50, 14, PALETTE.muted, 'left');
      text('Plants grow: seed \u2192 sprout \u2192 bloom.', x + 14, boxY + 74, 15, PALETTE.text, 'left');
      text('Click a planted tower to nourish or sell it.', x + 14, boxY + 96, 15, PALETTE.text, 'left');
      text(`Kills: ${state.kills}   \u00B7   Leaked: ${state.leaked}`, x + 14, boxY + 122, 15, PALETTE.text, 'left');
      text(`Sun earned: ${state.earned}`, x + 14, boxY + 142, 15, PALETTE.text, 'left');
    }
    // Blessings the grove has granted this run.
    text('BLESSINGS', x, 514, 15, PALETTE.muted, 'left', true);
    text(`${state.blessings.length}/10`, x + w, 514, 15, PALETTE.muted, 'right', true);
    if (state.blessings.length === 0) {
      text('Draft a season to earn a blessing.', x, 548, 14, PALETTE.muted, 'left');
      text('A flawless season earns a bonus one.', x, 570, 14, PALETTE.muted, 'left');
    } else {
      const shownBlessings = state.blessings.slice(0, 6);
      shownBlessings.forEach((id, index) => {
        const blessing = blessingById(id);
        const col = index % 2;
        const row = Math.floor(index / 2);
        chip(x + col * 196, 522 + row * 26, 188, 22, blessing.glyph, blessing.name);
      });
      if (state.blessings.length > 6) {
        text(`+${state.blessings.length - 6} more`, x, 596, 13, PALETTE.muted, 'left');
      }
    }
    // Speed / pause / mute.
    drawButton(LAYOUT.speedButton, ui.speed === 2 ? 'SPEED 2\u00D7' : 'SPEED 1\u00D7', true, null, 17);
    drawButton(LAYOUT.pauseButton, 'PAUSE', true, null, 17);
    drawButton(LAYOUT.muteButton, ui.muted ? 'MUTED' : 'SOUND', true, null, 17);
    // Hints.
    text('1–6 pick a plant · click grass to plant', x, 664, 14, PALETTE.muted, 'left');
    text('Space start wave · F speed · P pause · M mute', x, 684, 14, PALETTE.muted, 'left');
    text('Kills in a row build a combo — up to \u00D78 score.', x, 706, 14, PALETTE.cardAfford, 'left', true);
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
      context.fillStyle = selected ? '#e3f2d5' : PALETTE.card;
      roundRect(rect.x, rect.y, rect.w, rect.h, 10);
      context.fill();
      context.strokeStyle = selected ? '#2f6b2f' : PALETTE.cardEdge;
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

  function drawTitlePanel(records) {
    context.fillStyle = 'rgba(18, 28, 16, 0.62)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('SEEDWARDEN', FIELD.width / 2, 118, 72, PALETTE.title, 'center', true);
    text('Draft the seasons. Grow the grove. Hold the Heart Tree.', FIELD.width / 2, 156, 24, '#cfe8c0', 'center');
    text('6 plants  ·  5 pests + the Blight  ·  8 seasons  ·  10 blessings  ·  20 waves', FIELD.width / 2, 184, 16, '#cfe8c0', 'center');
    // Left: how to play.
    context.fillStyle = PALETTE.panel;
    roundRect(90, 210, 470, 270, 14);
    context.fill();
    text('HOW TO PLAY', 114, 242, 20, PALETTE.text, 'left', true);
    const howLines = [
      '1–6 pick a plant · click grass to plant it',
      'Space starts the next wave early (+sun)',
      'Plants grow: seed \u2192 sprout \u2192 bloom',
      'WIN hold the Heart Tree through 20 waves',
      'LOSE the tree falls — every pest hurts it',
      'Every 5 waves, draft the next season',
      'Each season grants a blessing, forever',
      'Flawless season? A bonus blessing.',
    ];
    howLines.forEach((line, index) => {
      text(line, 114, 272 + index * 24, 16, PALETTE.text, 'left');
    });
    // Right: the pests.
    context.fillStyle = PALETTE.panel;
    roundRect(720, 210, 470, 270, 14);
    context.fill();
    text('THE PESTS', 744, 242, 20, PALETTE.text, 'left', true);
    const pestOrder = ['aphid', 'moth', 'beetle', 'slug', 'blight'];
    pestOrder.forEach((type, index) => {
      const def = PESTS[type];
      const y = 272 + index * 28;
      circle(756, y - 5, 8, def.body);
      text(`${def.name}  ·  ${def.trait}  —  ${def.blurb}`, 772, y, 15, PALETTE.text, 'left');
    });
    text('Blessings: 10 to collect — draft, flawless, victory.', 744, 440, 14, PALETTE.muted, 'left');
    drawButton(LAYOUT.titlePlay, 'PLAY', true, null);
    drawButton(LAYOUT.titleHow, 'HOW TO PLAY', true, null);
    const best = records.best > 0 ? records.best.toLocaleString('en-US') : '\u2014';
    const furthest = records.furthest > 0 ? String(records.furthest) : '\u2014';
    text(`BEST ${best}  ·  FURTHEST WAVE ${furthest}  ·  GROVES SAVED ${records.saved}`, FIELD.width / 2, 664, 17, '#cfe8c0', 'center', true);
    text('Mouse + keyboard  ·  no sound files, no network', FIELD.width / 2, 700, 13, 'rgba(243,234,211,0.6)', 'center');
  }

  function drawHowPanel() {
    context.fillStyle = 'rgba(18, 28, 16, 0.62)';
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
      'Kills close together build a combo — up to \u00D78 score. A leak spends it.',
      'A flawless season (no leaks) earns a bonus blessing.',
      'Sunspores grow sunlight. Calling a wave early pays a bonus.',
      'Survive all 20 waves to win. Then try endless mode.',
    ];
    lines.forEach((line, index) => {
      text(line, FIELD.width / 2, 190 + index * 30, 20, PALETTE.text, 'center');
    });
    text('Space start wave  ·  F speed  ·  P pause  ·  M mute', FIELD.width / 2, 500, 18, PALETTE.muted, 'center');
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
    context.fillStyle = 'rgba(18, 28, 16, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('CHOOSE THE SEASON', FIELD.width / 2, 96, 46, PALETTE.title, 'center', true);
    text(`Wave ${state.wave} cleared — the grove turns. Every season brings its blessing.`, FIELD.width / 2, 126, 19, '#cfe8c0', 'center');
    if (state.flawlessGift) {
      text(`\u2726 Flawless season! The grove grants ${state.flawlessGift.name} — ${state.flawlessGift.blurb}`, FIELD.width / 2, 150, 16, PALETTE.gold, 'center', true);
    }
    offer.forEach((card, index) => {
      const rect = LAYOUT.draftCards[index];
      const hovered = ui.hover.inside && inside(rect, ui.hover.x, ui.hover.y);
      context.fillStyle = PALETTE.panel;
      roundRect(rect.x, rect.y, rect.w, rect.h, 14);
      context.fill();
      context.strokeStyle = hovered ? '#2f6b2f' : PALETTE.cardEdge;
      context.lineWidth = hovered ? 3 : 1.5;
      roundRect(rect.x, rect.y, rect.w, rect.h, 14);
      context.stroke();
      // Key number, top right.
      circle(rect.x + rect.w - 28, rect.y + 28, 13, PALETTE.text);
      text(String(index + 1), rect.x + rect.w - 28, rect.y + 33, 15, PALETTE.title, 'center', true);
      // Season glyph in a tinted disc.
      const season = { tint: '#7fb069' };
      const base = { spring: '#7fb069', summer: '#e9c46a', autumn: '#d98e32', winter: '#8ecae6' }[card.base] ?? season.tint;
      circle(rect.x + rect.w / 2, rect.y + 58, 30, base);
      text({ spring: '\u273F', summer: '\u2600', autumn: '\u2766', winter: '\u2744' }[card.base] ?? '\u273F', rect.x + rect.w / 2, rect.y + 69, 30, PALETTE.text, 'center', true);
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
        text(effect.text, rect.x + rect.w / 2, cursor, 16, effect.good ? '#2f6b2f' : '#c0392b', 'center', true);
        cursor += 24;
      }
      if (card.risk) {
        text(`Risk: ${card.risk}`, rect.x + rect.w / 2, cursor, 14, '#c0392b', 'center');
        cursor += 24;
      }
      const blessing = blessingById(card.blessing);
      const held = state.blessings.includes(card.blessing);
      cursor += 8;
      context.fillStyle = held ? 'rgba(0,0,0,0.08)' : 'rgba(242, 183, 5, 0.16)';
      roundRect(rect.x + 16, cursor, rect.w - 32, 30, 15);
      context.fill();
      text(
        held ? `${blessing.glyph} ${blessing.name} — held: +75\u2600` : `${blessing.glyph} ${blessing.name}`,
        rect.x + rect.w / 2, cursor + 20, 15, PALETTE.text, 'center', true,
      );
      text(blessing.blurb, rect.x + rect.w / 2, cursor + 48, 13, PALETTE.muted, 'center');
    });
    text(
      `\u2600 ${state.sun.toLocaleString('en-US')}  \u00B7  \u2665 ${state.hearts}/${state.maxHearts}  \u00B7  SCORE ${state.score.toLocaleString('en-US')}  \u00B7  BLESSINGS ${state.blessings.length}`,
      FIELD.width / 2, 592, 17, PALETTE.title, 'center', true,
    );
    text('Click a card or press 1 – 3', FIELD.width / 2, 618, 15, 'rgba(243,234,211,0.75)', 'center');
  }

  function drawEndPanel(state, victory, records) {
    const grade = gradeFor({
      hearts: state.hearts,
      maxHearts: state.maxHearts,
      leaked: state.leaked,
      longestCombo: state.combo.longest,
      wave: state.wave,
    });
    context.fillStyle = 'rgba(18, 28, 16, 0.62)';
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
    circle(370, 282, 62, '#22301f');
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
      text('\u2605 NEW BEST!', 370, 398, 14, PALETTE.text, 'center', true);
    } else {
      text(`BEST ${Math.max(records.best, state.score).toLocaleString('en-US')}`, 370, 398, 15, PALETTE.muted, 'center');
    }
    // The stat grid: six numbers that say what the run was.
    const stats = [
      ['Waves cleared', String(victory ? state.wave : Math.max(0, state.wave - 1))],
      ['Pests stopped', String(state.kills)],
      ['Longest combo', formatMult(comboMultiplier(state.combo.longest))],
      ['Sunlight earned', String(state.earned)],
      ['Hearts left', victory ? `${state.hearts} / ${state.maxHearts}` : '0'],
      ['Blessings held', `${state.blessings.length}/10`],
    ];
    stats.forEach(([label, value], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 520 + col * 240;
      const y = 236 + row * 50;
      text(label, x, y, 13, PALETTE.muted, 'left', true);
      text(value, x, y + 24, 22, PALETTE.text, 'left', true);
    });
    text(`${grade.line}  \u00B7  ${grade.points} pts`, FIELD.width / 2, 424, 15, PALETTE.muted, 'center');
    // The blessings the run collected.
    text('BLESSINGS HELD', 280, 452, 13, PALETTE.muted, 'left', true);
    if (state.blessings.length === 0) {
      text('No blessings this run — draft a season next time.', 280, 478, 14, PALETTE.muted, 'left');
    } else {
      state.blessings.forEach((id, index) => {
        const blessing = blessingById(id);
        const col = index % 5;
        const row = Math.floor(index / 5);
        chip(280 + col * 148, 462 + row * 28, 140, 24, blessing.glyph, blessing.name);
      });
    }
    if (victory) {
      drawButton(LAYOUT.victoryAgain, 'PLAY AGAIN', true, null, 20);
      drawButton(LAYOUT.victoryEndless, 'ENDLESS MODE', true, null, 20);
      drawButton(LAYOUT.victoryTitle, 'BACK TO TITLE', true, null, 20);
    } else {
      drawButton(LAYOUT.defeatAgain, 'TRY AGAIN', true, null, 20);
      drawButton(LAYOUT.defeatTitle, 'BACK TO TITLE', true, null, 20);
    }
  }

  function drawPausedPanel() {
    context.fillStyle = 'rgba(18, 28, 16, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('Paused', FIELD.width / 2, 340, 56, PALETTE.title, 'center', true);
    text('Press P or click PAUSE to keep gardening.', FIELD.width / 2, 386, 22, '#cfe8c0', 'center');
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
    drawParticles(state);
    drawFloats(state);
    drawVignette();
    if (screen === SCREEN_TITLE) {
      drawTitlePanel(records);
      return;
    }
    if (screen === SCREEN_HOWTO) {
      drawHowPanel();
      return;
    }
    drawHud(state, ui, season, records);
    drawBossBar(state);
    drawPanel(state, ui, season);
    drawCards(state, ui);
    drawBanner(ui, state.elapsed);
    if (screen === SCREEN_PAUSED) drawPausedPanel();
    else if (screen === SCREEN_DRAFT) drawDraftPanel(state, ui);
    else if (screen === SCREEN_VICTORY) drawEndPanel(state, true, records);
    else if (screen === SCREEN_DEFEAT) drawEndPanel(state, false, records);
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
