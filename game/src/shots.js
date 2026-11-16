// The screenshot scenes behind ?shot=start|play|victory|defeat. Each one plays
// the real rules forward from a fresh world for a fixed stretch, steered by a
// simple autopilot — plant from a fixed plan, nourish what bloomed, call every
// wave at once — so the frame is what a real game looks like and the same seed
// always gives the same frame. The defeat scene's pilot plants two towers and
// gives up, as a hurried player might.

import { STEP } from './config.js';
import { EVENT_OVER, EVENT_PLANT, EVENT_WIN } from './world.js';
import { SCREEN_DEFEAT, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';

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
 * the time cap runs out. Returns the events of the last step.
 */
function autoplay(world, stop, capSeconds, plan) {
  const state = world.state;
  let planIndex = 0;
  let thinkTimer = 0;
  let events = 0;
  const cap = capSeconds / STEP;
  for (let step = 0; step < cap; step += 1) {
    thinkTimer -= STEP;
    if (thinkTimer <= 0) {
      thinkTimer += THINK_SECONDS;
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
  return { screen: SCREEN_TITLE, best: 0 };
}

function stagePlay(world) {
  world.reset();
  // Wave 13: a moth swarm in autumn, fast enough to spread across the path's
  // legs within the wait, and an orange season the other shots don't show.
  let waveTimer = -1;
  autoplay(
    world,
    (state) => {
      if (state.wave >= 13 && (state.waveState === 'spawning' || state.waveState === 'fighting')) {
        if (waveTimer < 0) waveTimer = 8;
        waveTimer -= STEP;
        return waveTimer <= 0 && state.pests.length >= 4;
      }
      return state.over || state.won;
    },
    1500,
    PLAN,
  );
  return { screen: SCREEN_PLAY, best: world.state.score };
}

function stageVictory(world) {
  world.reset();
  autoplay(world, (state, events) => Boolean(events & EVENT_WIN) || state.over, 2400, PLAN);
  return { screen: SCREEN_VICTORY, best: world.state.score };
}

function stageDefeat(world) {
  world.reset();
  autoplay(world, (state, events) => Boolean(events & EVENT_OVER), 1200, [['thorn', 9, 2], ['thorn', 2, 2]]);
  return { screen: SCREEN_DEFEAT, best: world.state.score };
}

/**
 * Set `world` to the named scene (start, play, victory or defeat; any other
 * name is start) and return the screen to draw over it and the best score.
 */
export function stageShot(name, world) {
  if (name === 'play') return stagePlay(world);
  if (name === 'victory') return stageVictory(world);
  if (name === 'defeat') return stageDefeat(world);
  return stageStart(world);
}
