// Every tuning number, colour and layout measure in one place. The game draws on a
// fixed 1280x720 logical field; the renderer scales it to the window, so no rule
// below depends on the screen size.
//
// Layout: a top HUD bar, a 12x8 garden grid on the left, a side panel on the right
// (next wave, start button, selected plant), and a row of plant cards along the
// bottom. The pests walk one serpentine soil path from the west gate to the
// Heart Tree in the south-east corner.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const HUD = { height: 56 };
export const BOARD = { cols: 12, rows: 8, cell: 72, x: 0, y: HUD.height };
export const PANEL = { x: 864, width: 416 };
export const CARDS = { y: 632, height: 88, gap: 8, margin: 8 };

/** The tree's health, in hearts; one heart per pest damage point that reaches it. */
export const TREE_HEARTS = 10;
/** Sunlight the player starts with: enough for two cheap plants and a little room. */
export const START_SUN = 150;
/** Waves in one year; clearing wave 20 wins, and endless mode keeps going after. */
export const WAVES_PER_YEAR = 20;
/** Seconds between waves when the player lets the countdown run out. */
export const WAVE_WAIT = 12;
/** Sunlight for calling the next wave early: a flat bonus plus the seconds saved. */
export const EARLY_BONUS = { flat: 5, perSecond: 1 };

/** The path, as grid cells in walking order, from the gate to the Heart Tree. */
export const PATH_CELLS = [
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1],
  [10, 2], [10, 3],
  [9, 3], [8, 3], [7, 3], [6, 3], [5, 3], [4, 3], [3, 3], [2, 3], [1, 3],
  [1, 4], [1, 5],
  [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5],
  [10, 6], [10, 7],
  [11, 7],
];

/** The Heart Tree's cell: the last cell of the path, where pests do their damage. */
export const TREE_CELL = { col: 11, row: 7 };

/** Pixel centre of a grid cell. */
export function cellCentre(col, row) {
  return { x: BOARD.x + col * BOARD.cell + BOARD.cell / 2, y: BOARD.y + row * BOARD.cell + BOARD.cell / 2 };
}

/** Pixel waypoints of the path, in walking order, starting off-screen at the gate. */
export const WAYPOINTS = (() => {
  const points = [{ x: -BOARD.cell / 2, y: BOARD.y + 1 * BOARD.cell + BOARD.cell / 2 }];
  for (const [col, row] of PATH_CELLS) points.push(cellCentre(col, row));
  return points;
})();

const PATH_SET = new Set(PATH_CELLS.map(([col, row]) => `${col},${row}`));

/** True when a cell holds soil path (or the tree): nothing can be planted there. */
export function isPathCell(col, row) {
  return PATH_SET.has(`${col},${row}`);
}

/** True when a cell is inside the board and free to plant on. */
export function isPlantable(col, row) {
  return col >= 0 && col < BOARD.cols && row >= 0 && row < BOARD.rows && !isPathCell(col, row);
}

export const PALETTE = {
  backdrop: '#1e3320',
  board: '#3a6b32',
  boardAlt: '#335f2d',
  soil: '#8a6a45',
  soilEdge: '#77582f',
  panel: '#f3ead3',
  panelEdge: '#c9b98d',
  card: '#fbf6e6',
  cardEdge: '#b7a76e',
  cardAfford: '#2f6b2f',
  hud: '#223d1e',
  text: '#22301f',
  textLight: '#f3ead3',
  muted: '#6b7a5e',
  sun: '#f2b705',
  gold: '#f2b705',
  blight: '#7c5cbf',
  heart: '#e5534b',
  title: '#fbf6e6',
  button: '#4a7c3a',
  buttonEdge: '#2f5426',
  danger: '#c0392b',
  range: 'rgba(255, 255, 255, 0.16)',
  rangeEdge: 'rgba(255, 255, 255, 0.55)',
  ghostOk: 'rgba(120, 220, 120, 0.45)',
  ghostBad: 'rgba(230, 90, 70, 0.45)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'seedwarden.best';
/** Where the furthest wave reached is kept between visits. */
export const FURTHEST_KEY = 'seedwarden.furthest';
/** Where the count of groves saved (years won) is kept between visits. */
export const SAVED_KEY = 'seedwarden.saved';
