// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. Flat vector shapes, canvas text for the HUD and the
// panels. Every button's rectangle lives in LAYOUT, which the main loop uses
// for hit-testing, so what you see is exactly what you can click.

import { BOARD, CARDS, FIELD, FONT, HUD, PALETTE, PANEL, TREE_CELL, TREE_HEARTS, WAVES_PER_YEAR, cellCentre, isPathCell } from './config.js';
import { PLANTS, STAGE_NAMES, nourishCost, plantDamage, plantHarvest, plantRange, sellValue } from './plants.js';
import { PESTS } from './pests.js';
import { seasonForWave, wavesLeftInSeason } from './seasons.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_HOWTO = 'howto';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
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
  startButton: { x: PANEL.x + 16, y: 246, w: PANEL.width - 32, h: 56 },
  speedButton: { x: PANEL.x + 16, y: 540, w: 120, h: 44 },
  pauseButton: { x: PANEL.x + 144, y: 540, w: 120, h: 44 },
  muteButton: { x: PANEL.x + 272, y: 540, w: 120, h: 44 },
  nourishButton: { x: PANEL.x + 16, y: 452, w: 184, h: 44 },
  sellButton: { x: PANEL.x + 208, y: 452, w: 184, h: 44 },
  titlePlay: { x: 490, y: 412, w: 300, h: 64 },
  titleHow: { x: 490, y: 492, w: 300, h: 48 },
  howBack: { x: 490, y: 566, w: 300, h: 48 },
  victoryAgain: { x: 380, y: 486, w: 230, h: 56 },
  victoryEndless: { x: 640, y: 486, w: 230, h: 56 },
  defeatAgain: { x: 490, y: 486, w: 300, h: 56 },
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
    context.globalAlpha = 0.1;
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
      const angle = (i / TREE_HEARTS) * Math.PI * 2 - Math.PI / 2;
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
      const pulse = 1 + Math.sin(elapsed * 3) * 0.04;
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
      circle(x - r * 0.3, y - r * 0.1, r * 0.14, '#e9d5ff');
      circle(x + r * 0.3, y - r * 0.1, r * 0.14, '#e9d5ff');
      circle(x, y + r * 0.3, r * 0.2, '#7c5cbf');
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
      const width = Math.max(28, r * 2.2);
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

  function drawHud(state, season, pestsLeft, pestsTotal) {
    context.fillStyle = PALETTE.hud;
    context.fillRect(0, 0, FIELD.width, HUD.height);
    context.fillStyle = 'rgba(0,0,0,0.2)';
    context.fillRect(0, HUD.height - 4, FIELD.width, 4);
    // Sunlight.
    circle(34, 28, 13, PALETTE.sun);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      context.strokeStyle = PALETTE.sun;
      context.lineWidth = 2.5;
      context.beginPath();
      context.moveTo(34 + Math.cos(angle) * 16, 28 + Math.sin(angle) * 16);
      context.lineTo(34 + Math.cos(angle) * 21, 28 + Math.sin(angle) * 21);
      context.stroke();
    }
    text(String(state.sun), 58, 37, 28, PALETTE.textLight, 'left', true);
    // Wave and its progress.
    const waveLabel = state.wave === 0 ? 'WAVE — / 20' : `WAVE ${state.wave} / ${state.endless ? '∞' : WAVES_PER_YEAR}`;
    text(waveLabel, 210, 36, 24, PALETTE.textLight, 'left', true);
    if (state.wave > 0 && pestsTotal > 0) {
      const done = 1 - pestsLeft / pestsTotal;
      context.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(400, 20, 150, 14, 7);
      context.fill();
      context.fillStyle = '#84cc16';
      if (done > 0) {
        roundRect(400, 20, Math.max(14, 150 * done), 14, 7);
        context.fill();
      }
      text(`${pestsLeft} left`, 560, 33, 16, PALETTE.textLight, 'left');
    }
    // Tree hearts.
    text('GROVE', 660, 36, 20, PALETTE.textLight, 'left', true);
    for (let i = 0; i < TREE_HEARTS; i += 1) {
      heart(745 + i * 22, 16, 15, i < state.hearts ? PALETTE.heart : 'rgba(0,0,0,0.35)');
    }
    // Season.
    const seasonX = 1000;
    circle(seasonX, 28, 13, season.accent);
    text(season.glyph, seasonX, 34, 16, PALETTE.text, 'center', true);
    text(season.name, seasonX + 20, 36, 22, PALETTE.textLight, 'left', true);
    text(`${wavesLeftInSeason(Math.max(state.wave, 1))} waves left`, seasonX + 20, 52, 13, 'rgba(243,234,211,0.75)', 'left');
    // Score.
    text('SCORE', 1145, 22, 13, 'rgba(243,234,211,0.75)', 'left', true);
    text(state.score.toLocaleString('en-US'), 1145, 46, 24, PALETTE.textLight, 'left', true);
  }

  function drawButton(rect, label, enabled, sub) {
    context.fillStyle = enabled ? PALETTE.button : '#7a7a6a';
    roundRect(rect.x, rect.y, rect.w, rect.h, 10);
    context.fill();
    context.fillStyle = enabled ? PALETTE.buttonEdge : '#5a5a4a';
    roundRect(rect.x, rect.y + rect.h - 6, rect.w, 6, 3);
    context.fill();
    text(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + (sub ? 2 : 8), 22, '#ffffff', 'center', true);
    if (sub) text(sub, rect.x + rect.w / 2, rect.y + rect.h - 10, 14, 'rgba(255,255,255,0.85)', 'center');
  }

  function drawPanel(state, ui, season) {
    context.fillStyle = PALETTE.panel;
    context.fillRect(PANEL.x, HUD.height, PANEL.width, FIELD.height - HUD.height);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(PANEL.x, HUD.height, 3, FIELD.height - HUD.height);
    const x = PANEL.x + 16;
    const w = PANEL.width - 32;
    // Next wave.
    text('NEXT WAVE', x, 92, 17, PALETTE.muted, 'left', true);
    const nextWave = state.wave + 1;
    text(`Wave ${nextWave}${nextWave > WAVES_PER_YEAR ? ' (endless)' : ''}`, x, 122, 26, PALETTE.text, 'left', true);
    const nextSeason = seasonForWave(nextWave);
    text(`${nextSeason.glyph} ${nextSeason.name} — ${nextSeason.tagline}`, x, 146, 14, PALETTE.muted, 'left');
    const preview = ui.preview;
    let rowY = 164;
    for (const group of preview) {
      const def = PESTS[group.type];
      circle(x + 12, rowY, 10, def.body);
      text(`${def.name}  ×${group.count}`, x + 30, rowY + 5, 17, PALETTE.text, 'left');
      rowY += 24;
      if (rowY > 240) break;
    }
    // Start wave button.
    const button = LAYOUT.startButton;
    if (state.won) {
      drawButton(button, 'THE GROVE HOLDS', false, 'twenty waves clear');
    } else if (state.over) {
      drawButton(button, 'THE GROVE HAS FALLEN', false, 'the pests broke through');
    } else if (state.waveState === 'idle') {
      const seconds = Math.ceil(state.waitTimer);
      drawButton(button, 'START WAVE', true, `or wait ${seconds}s · early bonus +${5 + seconds}`);
    } else if (state.waveState === 'spawning' || state.waveState === 'fighting') {
      drawButton(button, `WAVE ${state.wave} IN PROGRESS`, false, 'hold the grove…');
    }
    // Info box: selected plant, selected card, or the season.
    const boxY = 322;
    context.fillStyle = PALETTE.card;
    roundRect(x, boxY, w, 190, 12);
    context.fill();
    context.strokeStyle = PALETTE.cardEdge;
    context.lineWidth = 1.5;
    roundRect(x, boxY, w, 190, 12);
    context.stroke();
    const selected = ui.selectedPlant;
    if (selected) {
      const def = PLANTS.find((item) => item.id === selected.kind);
      text(def.name, x + 14, boxY + 30, 22, PALETTE.text, 'left', true);
      text(`${STAGE_NAMES[selected.stage]}${selected.nourished ? ' · Nourished' : ''}`, x + 14, boxY + 54, 15, PALETTE.muted, 'left');
      if (def.harvest) {
        text(`Harvests ${plantHarvest(selected.stage)} sun every 5s`, x + 14, boxY + 82, 16, PALETTE.text, 'left');
      } else {
        const damage = plantDamage(def, selected.stage, selected.nourished, season);
        text(`Damage ${damage.toFixed(0)}  ·  ${def.rate}/s  ·  Range ${Math.round(plantRange(def, selected.stage))}`, x + 14, boxY + 82, 16, PALETTE.text, 'left');
        if (def.slow > 0) text(`Slows pests ${Math.round(def.slow * 100)}%`, x + 14, boxY + 106, 16, PALETTE.text, 'left');
        if (def.splash > 0) text(`Splash ${def.splash}px${def.poison > 0 ? ' · poison' : ''}`, x + 14, boxY + 106, 16, PALETTE.text, 'left');
      }
      if (selected.stage < 2) {
        const growth = Math.min(1, selected.growth / 20);
        context.fillStyle = 'rgba(0,0,0,0.15)';
        roundRect(x + 14, boxY + 112, w - 28, 10, 5);
        context.fill();
        context.fillStyle = '#84cc16';
        roundRect(x + 14, boxY + 112, Math.max(10, (w - 28) * growth), 10, 5);
        context.fill();
        text(`Growing to ${STAGE_NAMES[selected.stage + 1]}…`, x + 14, boxY + 142, 14, PALETTE.muted, 'left');
      }
      const canNourish = selected.stage === 2 && !selected.nourished && state.sun >= nourishCost(def);
      const nourishLabel = selected.nourished ? 'NOURISHED' : selected.stage < 2 ? 'GROWING…' : `NOURISH ${nourishCost(def)}☀`;
      drawButton(LAYOUT.nourishButton, nourishLabel, canNourish, null);
      drawButton(LAYOUT.sellButton, `SELL +${sellValue(def)}☀`, true, null);
    } else if (ui.selectedCard >= 0) {
      const def = PLANTS[ui.selectedCard];
      text(def.name, x + 14, boxY + 30, 22, PALETTE.text, 'left', true);
      text(def.blurb, x + 14, boxY + 54, 15, PALETTE.muted, 'left');
      if (def.harvest) {
        text('Harvests 3 / 5 / 7 sun every 5s as it grows.', x + 14, boxY + 82, 16, PALETTE.text, 'left');
      } else {
        text(`Damage ${def.damage}  ·  ${def.rate}/s  ·  Range ${def.range}`, x + 14, boxY + 82, 16, PALETTE.text, 'left');
        if (def.slow > 0) text(`Slows pests ${Math.round(def.slow * 100)}% for ${def.slowSeconds}s`, x + 14, boxY + 106, 16, PALETTE.text, 'left');
        if (def.splash > 0) text(`Splash ${def.splash}px${def.poison > 0 ? ` · poison ${def.poison}/s` : ''}`, x + 14, boxY + 106, 16, PALETTE.text, 'left');
      }
      text('Click a grass cell to plant it.', x + 14, boxY + 142, 15, PALETTE.cardAfford, 'left', true);
      text('Right-click or Esc to cancel.', x + 14, boxY + 164, 14, PALETTE.muted, 'left');
    } else {
      text(`${season.glyph} ${season.name}`, x + 14, boxY + 30, 22, PALETTE.text, 'left', true);
      text(season.tagline, x + 14, boxY + 54, 15, PALETTE.muted, 'left');
      text('Plants grow: seed → sprout → bloom.', x + 14, boxY + 92, 16, PALETTE.text, 'left');
      text('Click a planted tower to nourish or sell it.', x + 14, boxY + 116, 16, PALETTE.text, 'left');
      text(`Kills: ${state.kills}   ·   Leaked: ${state.leaked}`, x + 14, boxY + 148, 16, PALETTE.text, 'left');
      text(`Sun earned: ${state.earned}`, x + 14, boxY + 172, 16, PALETTE.text, 'left');
    }
    // Speed / pause / mute.
    drawButton(LAYOUT.speedButton, ui.speed === 2 ? 'SPEED 2×' : 'SPEED 1×', true, null);
    drawButton(LAYOUT.pauseButton, 'PAUSE', true, null);
    drawButton(LAYOUT.muteButton, ui.muted ? 'MUTED' : 'SOUND', true, null);
    // Hints.
    text('1–6 pick a plant · click grass to plant', x, 620, 15, PALETTE.muted, 'left');
    text('Space start wave · F speed · P pause · M mute', x, 642, 15, PALETTE.muted, 'left');
    text('Hold the Heart Tree through 20 waves.', x, 676, 15, PALETTE.cardAfford, 'left', true);
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
      context.fillStyle = PALETTE.range;
      context.beginPath();
      context.arc(centre.x, centre.y, plantRange(def, 0), 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.rangeEdge;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(centre.x, centre.y, plantRange(def, 0), 0, Math.PI * 2);
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
    context.fillStyle = PALETTE.range;
    context.beginPath();
    context.arc(selected.x, selected.y, plantRange(def, selected.stage), 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.rangeEdge;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(selected.x, selected.y, plantRange(def, selected.stage), 0, Math.PI * 2);
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

  function drawTitlePanel(best) {
    context.fillStyle = 'rgba(18, 28, 16, 0.62)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('SEEDWARDEN', FIELD.width / 2, 190, 84, PALETTE.title, 'center', true);
    text('A garden tower defense', FIELD.width / 2, 236, 28, '#cfe8c0', 'center');
    text('Plant living towers. Grow them through four seasons.', FIELD.width / 2, 300, 24, PALETTE.title, 'center');
    text('Hold the Heart Tree through twenty waves.', FIELD.width / 2, 332, 24, PALETTE.title, 'center');
    text('6 plants  ·  5 pests  ·  4 seasons  ·  1 grove', FIELD.width / 2, 372, 19, '#cfe8c0', 'center');
    drawButton(LAYOUT.titlePlay, 'PLAY', true, null);
    drawButton(LAYOUT.titleHow, 'HOW TO PLAY', true, null);
    if (best > 0) text(`Best score ${best.toLocaleString('en-US')}`, FIELD.width / 2, 590, 20, '#cfe8c0', 'center');
    text('Mouse + keyboard  ·  no sound files, no network', FIELD.width / 2, 660, 15, 'rgba(243,234,211,0.6)', 'center');
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
      'Plants grow: seed → sprout → bloom, stronger at every stage.',
      'A bloomed plant can be nourished once (+50% damage) or sold back.',
      'Seasons change every 5 waves: spring grows, summer hits,',
      'autumn pays, winter slows everything — pests included.',
      'Sunspores grow sunlight. Calling a wave early pays a bonus.',
      'Survive all 20 waves to win. Then try endless mode.',
    ];
    lines.forEach((line, index) => {
      text(line, FIELD.width / 2, 190 + index * 34, 20, PALETTE.text, 'center');
    });
    text('Space start wave  ·  F speed  ·  P pause  ·  M mute', FIELD.width / 2, 500, 18, PALETTE.muted, 'center');
    drawButton(LAYOUT.howBack, 'BACK', true, null);
  }

  function drawEndPanel(state, victory, best) {
    context.fillStyle = 'rgba(18, 28, 16, 0.62)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const panel = { x: 320, y: 130, w: 640, h: 460 };
    context.fillStyle = PALETTE.panel;
    roundRect(panel.x, panel.y, panel.w, panel.h, 16);
    context.fill();
    text(victory ? 'The Grove Holds!' : 'The Grove Has Fallen', FIELD.width / 2, 205, 44, PALETTE.text, 'center', true);
    text(
      victory ? 'Twenty waves, four seasons, one grove — still standing.' : `The pests broke through on wave ${state.wave}.`,
      FIELD.width / 2, 245, 20, PALETTE.muted, 'center',
    );
    const rows = [
      ['Score', state.score.toLocaleString('en-US')],
      ['Best', Math.max(best, state.score).toLocaleString('en-US')],
      ['Waves cleared', String(victory ? state.wave : Math.max(0, state.wave - 1))],
      ['Pests stopped', String(state.kills)],
      ['Sunlight earned', String(state.earned)],
      ['Hearts left', victory ? `${state.hearts} / ${TREE_HEARTS}` : '0'],
    ];
    rows.forEach(([label, value], index) => {
      const y = 295 + index * 32;
      text(label, FIELD.width / 2 - 130, y, 20, PALETTE.muted, 'left');
      text(value, FIELD.width / 2 + 130, y, 20, PALETTE.text, 'right', true);
    });
    if (victory) {
      drawButton(LAYOUT.victoryAgain, 'PLAY AGAIN', true, null);
      drawButton(LAYOUT.victoryEndless, 'ENDLESS MODE', true, null);
    } else {
      drawButton(LAYOUT.defeatAgain, 'TRY AGAIN', true, null);
    }
  }

  function drawPausedPanel() {
    context.fillStyle = 'rgba(18, 28, 16, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('Paused', FIELD.width / 2, 340, 56, PALETTE.title, 'center', true);
    text('Press P or click PAUSE to keep gardening.', FIELD.width / 2, 386, 22, '#cfe8c0', 'center');
  }

  /** Paint one frame: the garden, then the HUD, panels and cards, then any overlay. */
  function draw(state, ui, screen, best) {
    const season = seasonForWave(Math.max(state.wave, 1));
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
    if (screen === SCREEN_TITLE) {
      drawTitlePanel(best);
      return;
    }
    if (screen === SCREEN_HOWTO) {
      drawHowPanel();
      return;
    }
    drawHud(state, season, ui.pestsLeft, ui.pestsTotal);
    drawPanel(state, ui, season);
    drawCards(state, ui);
    drawBanner(ui, state.elapsed);
    if (screen === SCREEN_PAUSED) drawPausedPanel();
    else if (screen === SCREEN_VICTORY) drawEndPanel(state, true, best);
    else if (screen === SCREEN_DEFEAT) drawEndPanel(state, false, best);
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
