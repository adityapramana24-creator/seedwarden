// The career record, kept in the browser's own storage between visits: the
// best score, the furthest wave reached and the groves saved (years won).
// Nothing leaves the machine — there is no account and no network — and when
// storage is off (a private window) the record simply lasts the visit.

import { BEST_KEY, FURTHEST_KEY, SAVED_KEY } from './config.js';

function read(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off: the record then lasts this visit only.
  }
}

/** The career record as it stands: best score, furthest wave, groves saved. */
export function readRecords() {
  return { best: read(BEST_KEY), furthest: read(FURTHEST_KEY), saved: read(SAVED_KEY) };
}

/**
 * File one finished game: the best score moves when beaten, the furthest wave
 * when passed, the groves saved when the year was won. Returns the record as
 * it stands now, and whether this game set a new best.
 */
export function recordGame({ score, wave, won }) {
  const records = readRecords();
  const newBest = score > records.best;
  if (newBest) {
    records.best = score;
    write(BEST_KEY, score);
  }
  if (wave > records.furthest) {
    records.furthest = wave;
    write(FURTHEST_KEY, wave);
  }
  if (won) {
    records.saved += 1;
    write(SAVED_KEY, records.saved);
  }
  return { ...records, newBest };
}
