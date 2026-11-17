// The career record, kept in the browser's own storage between visits: the
// best score, the furthest wave reached, the groves saved (years won) and
// the feats ever earned. Nothing leaves the machine — there is no account
// and no network — and when storage is off (a private window) the record
// simply lasts the visit.

import { BEST_KEY, FEATS_KEY, FURTHEST_KEY, SAVED_KEY, SEEDS_KEY } from './config.js';

function read(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function readText(key) {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off: the record then lasts this visit only.
  }
}

/** The career record as it stands: best score, furthest wave, groves saved, feats ever earned, seeds banked. */
export function readRecords() {
  const feats = readText(FEATS_KEY).split(',').map((id) => id.trim()).filter(Boolean);
  return { best: read(BEST_KEY), furthest: read(FURTHEST_KEY), saved: read(SAVED_KEY), feats, seeds: read(SEEDS_KEY) };
}

/**
 * File one finished game: the best score moves when beaten, the furthest wave
 * when passed, the groves saved when the year was won, and any feat earned
 * joins the career set for good. A won year banks one seed per feat earned
 * that run — the grove's own savings, shown on the title. Returns the record
 * as it stands now, whether this game set a new best, and the seeds banked.
 */
export function recordGame({ score, wave, won, feats = [] }) {
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
  const seedsBanked = won ? feats.length : 0;
  if (won) {
    records.saved += 1;
    write(SAVED_KEY, records.saved);
    records.seeds += seedsBanked;
    write(SEEDS_KEY, records.seeds);
  }
  const earned = new Set(records.feats);
  let grew = false;
  for (const id of feats) {
    if (!earned.has(id)) {
      earned.add(id);
      grew = true;
    }
  }
  if (grew) {
    records.feats = [...earned];
    write(FEATS_KEY, records.feats.join(','));
  }
  return { ...records, newBest, seedsBanked };
}
