// The screenshot scenes behind ?shot=start|play|draft|victory|defeat. Each one
// plays the real rules forward from a fresh world for a fixed stretch, steered
// by a simple autopilot — plant from a fixed plan, nourish what bloomed, pick
// the first draft card, call every wave at once — so the frame is what a real
// game looks like and the same seed always gives the same frame. The defeat
// scene's pilot plants two towers and gives up, as a hurried player might.
//
// The records each scene reports are honest: a fresh profile (best 0) for the
// play and draft frames, so the HUD's BEST is the run's own score; the victory
// frame claims NEW BEST because a fresh profile has no best yet; the start
// frame reads the stored records, so a harness that played a real game first
// sees its numbers on the title.

import { STEP } from './config.js';
import { EVENT_MOONBEAM, EVENT_OVER, EVENT_PLANT, EVENT_WIN } from './world.js';
import { WARDEN_AURA_RADIUS, WARDEN_HOME, wardenInZapRange } from './warden.js';
import { featsFor } from './feats.js';
import { readRecords } from './records.js';
import { SCREEN_DEFEAT, SCREEN_DRAFT, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';

/** A fresh profile's records: nothing stored yet, no new best claimed. */
const FRESH_RECORDS = { best: 0, furthest: 0, saved: 0, feats: [], seeds: 0, seedsBanked: 0, newBest: false, greenhouse: [] };

/** The autopilot's planting plan, in order: the best cells first, near the path. */
const PLAN = [
  ['thorn', 9, 2], ['thorn', 2, 2], ['sunspore', 5, 0], ['frost', 9, 4],
  ['thorn', 2, 4], ['sunspore', 5, 6], ['bramble', 9, 0], ['vine', 9, 6],
  ['thorn', 5, 2], ['frost', 2, 6], ['bramble', 5, 4], ['spore', 7, 2],
  ['vine', 7, 4], ['thorn', 3, 0], ['bramble', 3, 6], ['frost', 7, 6],
  ['sunspore', 0, 0], ['spore', 7, 0], ['vine', 3, 4], ['thorn', 11, 2],
  ['bramble', 11, 4], ['frost', 0, 6], ['spore', 0, 4], ['vine', 11, 6],
  ['thorn', 4, 0], ['bramble', 6, 0], ['spore', 4, 6], ['vine', 6, 2],
  ['thorn', 1, 2], ['frost', 1, 6], ['bramble', 10, 4], ['spore', 8, 6],
];

/** Seconds of simulated play between one autopilot decision and the next. */
const THINK_SECONDS = 1;

/**
 * Drive the world with the autopilot until `stop` says the scene is ready, or
 * the time cap runs out. Returns the events of the last step. When a draft
 * opens, the autopilot takes the first card — deterministic for a fixed seed —
 * unless `autoDraft` is false, in which case the draft stays open for the shot.
 * The autopilot also drives the Warden — to the fight, and zapping — unless
 * `useWarden` is false, as in the defeat scene, where the player has stopped.
 */
function autoplay(world, stop, capSeconds, plan, autoDraft = true, useWarden = true) {
  const state = world.state;
  let planIndex = 0;
  let thinkTimer = 0;
  let events = 0;
  const cap = capSeconds / STEP;
  for (let step = 0; step < cap; step += 1) {
    thinkTimer -= STEP;
    if (thinkTimer <= 0) {
      thinkTimer += THINK_SECONDS;
      // A draft is a pause, not a wall: take the first card and keep playing.
      if (state.waveState === 'draft' && autoDraft) {
        const offer = world.draftOffer();
        if (offer.length > 0) world.applyDraft(offer[0].id);
      }
      // Plant the next tower on the plan whenever the purse allows it.
      while (planIndex < plan.length) {
        const [kind, col, row] = plan[planIndex];
        const result = world.plant(kind, col, row);
        if (result & EVENT_PLANT) planIndex += 1;
        else break;
      }
      // Nourish whatever bloomed, once the plan is done or the purse is full.
      if (planIndex >= plan.length || state.sun > 300) {
        for (const plant of state.plants) {
          if (plant.stage === 2 && !plant.nourished && state.sun > 150) world.nourish(plant);
        }
      }
      // The Warden is a player, not scenery: it glides to the thick of the
      // fight — beside the Blight when the boss walks, over the most
      // advanced pests otherwise — and zaps the toughest pest in reach.
      // Never the Blight: the play shot needs its phase-2 walk, and clearing
      // the swarm so the towers can focus the boss is the honest tactic.
      if (useWarden) {
        const blight = state.pests.find((pest) => pest.type === 'blight');
        if (blight) {
          world.moveWarden(blight.x - 80, blight.y - 40);
        } else if (state.pests.length > 0) {
          const front = [...state.pests].sort((a, b) => b.progress - a.progress).slice(0, 3);
          const cx = front.reduce((sum, pest) => sum + pest.x, 0) / front.length;
          const cy = front.reduce((sum, pest) => sum + pest.y, 0) / front.length;
          world.moveWarden(cx, cy - 20);
        } else {
          world.moveWarden(WARDEN_HOME.x, WARDEN_HOME.y);
        }
        if (world.wardenStatus().ready) {
          const inRange = state.pests.filter((pest) => pest.type !== 'blight' && wardenInZapRange(state.warden, pest));
          if (inRange.length > 0) {
            const target = inRange.sort((a, b) => b.hp - a.hp)[0];
            world.zapPest(target);
          }
        }
      }
      // Never wait out the countdown: call the next wave at once, bonus and all.
      if (state.waveState === 'idle' && !state.won && !state.over) world.startWave(true);
    }
    events = world.step(STEP, false);
    if (stop(state, events)) break;
  }
  return events;
}

function stageStart(world) {
  world.demoGarden();
  // A few pests wandering the path, harmless, so the title has life in it.
  for (let index = 0; index < 3; index += 1) {
    world.spawnAmbient(index === 0 ? 'moth' : 'aphid');
    for (let step = 0; step < 6 / STEP; step += 1) world.step(STEP, true);
  }
  return { screen: SCREEN_TITLE, records: readRecords() };
}

/**
 * The play shot's plan: the first twenty-four towers of the full plan. A full
 * garden kills the Blight before it reaches mid-field; a smaller one lets the
 * boss walk further while still holding the grove to wave 20 — and twenty-eight
 * keeps the garden looking full.
 */
const PLAY_PLAN = PLAN.slice(0, 28);

function stagePlay(world) {
  world.reset();
  // Wave 20, the boss fight, frozen at the moment the cover needs: the Blight
  // mid-field in phase 2, the Sunburst ready, a damage number in the air, a
  // combo building, and company on the field. If the boss dies or the grove
  // falls first, the frame is whatever the run reached — the harness fails
  // loudly on the checks, so a phase-1 cover can never slip through.
  autoplay(
    world,
    (state) => {
      if (state.wave >= 20 && (state.waveState === 'spawning' || state.waveState === 'fighting')) {
        const blight = state.pests.find((pest) => pest.type === 'blight');
        if (
          blight
          && blight.phase === 2
          && blight.x >= 280
          && state.pests.length >= 4
          && state.floats.length > 0
          && state.tracers.length >= 5
          && state.combo.count >= 3
          && world.sunburstStatus().ready
          && state.warden.zaps > 0
          && Math.hypot(state.warden.x - blight.x, state.warden.y - blight.y) <= WARDEN_AURA_RADIUS
        ) return true;
      }
      return state.over || state.won;
    },
    2400,
    PLAY_PLAN,
  );
  // The cover's moment: the Moonbeam fires as the frame freezes — the beam in
  // the air, the banner up, the moon's charge spent. The beam is real (fired
  // through the world's own rules, at the densest row); the banner is what
  // live play would show a third of a second after the same keypress. The
  // frame is taken the instant the beam fires: the tracers alive at the
  // freeze (five or more, by the stop condition) are all still in the air,
  // and the beam's own damage numbers are just appearing. Waiting even a
  // third of a second lets the beam thin the field and the tracers decay
  // faster than the thinned garden can replace them.
  let banner = null;
  if (world.moonbeamStatus().ready) {
    const events = world.moonbeam();
    if (events & EVENT_MOONBEAM) {
      banner = { title: 'MOONBEAM!', sub: 'The moon answers the grove.', until: world.state.elapsed + 1.6 };
    }
  }
  return { screen: SCREEN_PLAY, records: FRESH_RECORDS, banner };
}

function stageDraft(world) {
  world.reset();
  // The first draft, after wave 5: the autopilot leaves the offer open so the
  // frame shows the three cards and the grove behind them.
  autoplay(world, (state) => state.waveState === 'draft', 900, PLAN, false);
  return { screen: SCREEN_DRAFT, records: FRESH_RECORDS };
}

function stageVictory(world) {
  world.reset();
  autoplay(world, (state, events) => Boolean(events & EVENT_WIN) || state.over, 2400, PLAN);
  // A fresh profile's victory: the run's own feats are the seeds it banks.
  const banked = featsFor(world.state).length;
  return { screen: SCREEN_VICTORY, records: { best: 0, furthest: 0, saved: 0, feats: [], seeds: banked, seedsBanked: banked, newBest: true, greenhouse: [] } };
}

function stageDefeat(world) {
  world.reset();
  // No Warden: the scene is a player who stopped playing, and the Warden
  // only moves when the player moves it.
  autoplay(world, (state, events) => Boolean(events & EVENT_OVER), 1200, [['thorn', 9, 2], ['thorn', 2, 2]], true, false);
  return { screen: SCREEN_DEFEAT, records: FRESH_RECORDS };
}

/**
 * Set `world` to the named scene (start, play, draft, victory or defeat; any
 * other name is start) and return the screen to draw over it and the records
 * to show on it.
 */
export function stageShot(name, world) {
  if (name === 'play') return stagePlay(world);
  if (name === 'draft') return stageDraft(world);
  if (name === 'victory') return stageVictory(world);
  if (name === 'defeat') return stageDefeat(world);
  return stageStart(world);
}
