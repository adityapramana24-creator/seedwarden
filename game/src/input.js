// Keyboard and pointer input. Clicks arrive with their position in logical
// field coordinates (the renderer converts them); one-shot key presses are
// queued as flags and taken once by the loop, so a press between two frames is
// never lost and never counted twice. The pointer position is always available
// for hover previews.

export const KEY_CONFIRM = 1;
export const KEY_PAUSE = 2;
export const KEY_SPEED = 4;
export const KEY_MUTE = 8;
export const KEY_ESCAPE = 16;
export const KEY_SUNBURST = 32;
export const KEY_REROLL = 64;
export const KEY_MOONBEAM = 128;
export const KEY_GREENHOUSE = 256;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP']);
const SPEED = new Set(['KeyF']);
const MUTE = new Set(['KeyM']);
const ESCAPE = new Set(['Escape']);
const SUNBURST = new Set(['KeyQ']);
const REROLL = new Set(['KeyR']);
const MOONBEAM = new Set(['KeyW']);
const GREENHOUSE = new Set(['KeyG']);
const CARDS = new Map([
  ['Digit1', 0], ['Digit2', 1], ['Digit3', 2],
  ['Digit4', 3], ['Digit5', 4], ['Digit6', 5],
  ['Numpad1', 0], ['Numpad2', 1], ['Numpad3', 2],
  ['Numpad4', 3], ['Numpad5', 4], ['Numpad6', 5],
]);

export function createInput(canvas, toLogical) {
  let keys = 0;
  let cardKey = -1;
  const clicks = [];
  const hover = { x: -1, y: -1, inside: false };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (CONFIRM.has(event.code)) keys |= KEY_CONFIRM;
    else if (PAUSE.has(event.code)) keys |= KEY_PAUSE;
    else if (SPEED.has(event.code)) keys |= KEY_SPEED;
    else if (MUTE.has(event.code)) keys |= KEY_MUTE;
    else if (ESCAPE.has(event.code)) keys |= KEY_ESCAPE;
    else if (SUNBURST.has(event.code)) keys |= KEY_SUNBURST;
    else if (REROLL.has(event.code)) keys |= KEY_REROLL;
    else if (MOONBEAM.has(event.code)) keys |= KEY_MOONBEAM;
    else if (GREENHOUSE.has(event.code)) keys |= KEY_GREENHOUSE;
    else if (CARDS.has(event.code)) cardKey = CARDS.get(event.code);
    else return;
    event.preventDefault();
  });
  canvas.addEventListener('pointerdown', (event) => {
    const point = toLogical(event.clientX, event.clientY);
    clicks.push({ x: point.x, y: point.y });
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = toLogical(event.clientX, event.clientY);
    hover.x = point.x;
    hover.y = point.y;
    hover.inside = true;
  });
  canvas.addEventListener('pointerleave', () => {
    hover.inside = false;
  });

  return {
    /** One-shot key presses since the last call, as KEY_* flags. */
    takeKeys() {
      const taken = keys;
      keys = 0;
      return taken;
    },
    /** The plant card a number key picked since the last call, or -1. */
    takeCardKey() {
      const taken = cardKey;
      cardKey = -1;
      return taken;
    },
    /** Clicks since the last call, in logical field coordinates. */
    takeClicks() {
      return clicks.splice(0, clicks.length);
    },
    /** The pointer's current logical position, or inside:false when it left. */
    hover() {
      return hover;
    },
  };
}
