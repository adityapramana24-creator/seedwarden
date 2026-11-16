// The game's rules and state, with no drawing and no browser in it: the garden
// grid, the plants and their growth, the pests walking the path, combat, the
// seasons, the waves, sunlight and score. step() advances one fixed step and
// returns what happened as bit flags, so the caller can react (sounds, screens)
// without the world knowing about them. Nothing here allocates after createWorld
// returns, apart from the small arrays a wave's spawn queue needs.

import { BOARD, EARLY_BONUS, START_SUN, TREE_HEARTS, WAVE_WAIT, WAVES_PER_YEAR, WAYPOINTS, cellCentre, isPlantable } from './config.js';
import { GROWTH_SECONDS, HARVEST_SECONDS, NOURISH_DAMAGE, PLANTS, nourishCost, plantDamage, plantHarvest, plantRange, plantById, sellValue } from './plants.js';
import { PESTS, pestMaxHp, pestSpeed } from './pests.js';
import { seasonForWave } from './seasons.js';
import { earlyCallBonus, killReward, killScore, startingSun, waveScore } from './economy.js';
import { waveGroups, wavePreview, waveSize } from './waves.js';

export const EVENT_KILL = 1;
export const EVENT_LEAK = 2;
export const EVENT_WAVE_START = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_WIN = 16;
export const EVENT_OVER = 32;
export const EVENT_HARVEST = 64;
export const EVENT_PLANT = 128;
export const EVENT_NOURISH = 256;
export const EVENT_SELL = 512;
export const EVENT_DENIED = 1024;
export const EVENT_GROW = 2048;
export const EVENT_SHOOT = 4096;

const MAX_PARTICLES = 320;
const MAX_FLOATS = 40;
const BLIGHT_SPAWN_SECONDS = 4;
const BLIGHT_SPAWN_MAX = 6;

let nextId = 1;

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function createWorld(random) {
  const state = {
    plants: [],
    pests: [],
    particles: [],
    floats: [],
    sun: startingSun(),
    score: 0,
    wave: 0,
    waveState: 'idle',
    spawnQueue: [],
    spawnTimer: 0,
    waitTimer: WAVE_WAIT,
    hearts: TREE_HEARTS,
    kills: 0,
    leaked: 0,
    earned: 0,
    planted: 0,
    elapsed: 0,
    shake: 0,
    endless: false,
    won: false,
    over: false,
    best: 0,
  };

  function season() {
    return seasonForWave(state.wave === 0 ? 1 : state.wave);
  }

  function reset() {
    state.plants.length = 0;
    state.pests.length = 0;
    state.particles.length = 0;
    state.floats.length = 0;
    state.sun = startingSun();
    state.score = 0;
    state.wave = 0;
    state.waveState = 'idle';
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.waitTimer = WAVE_WAIT;
    state.hearts = TREE_HEARTS;
    state.kills = 0;
    state.leaked = 0;
    state.earned = 0;
    state.planted = 0;
    state.elapsed = 0;
    state.shake = 0;
    state.endless = false;
    state.won = false;
    state.over = false;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length >= MAX_PARTICLES) return;
      const angle = random() * Math.PI * 2;
      const velocity = speed * (0.4 + random() * 0.8);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 20,
        life: 0.4 + random() * 0.4,
        maxLife: 0.8,
        color,
        size: 2 + random() * 3,
      });
    }
  }

  function floatText(x, y, text, color) {
    if (state.floats.length >= MAX_FLOATS) state.floats.shift();
    state.floats.push({ x, y, life: 0.9, maxLife: 0.9, text, color });
  }

  function plantAt(col, row) {
    return state.plants.find((plant) => plant.col === col && plant.row === row) ?? null;
  }

  /** Plant a tower of this kind on a cell: false when the cell or the purse says no. */
  function plant(kind, col, row) {
    const def = plantById(kind);
    if (!def) return EVENT_DENIED;
    if (!isPlantable(col, row) || plantAt(col, row)) return EVENT_DENIED;
    if (state.sun < def.cost) return EVENT_DENIED;
    const centre = cellCentre(col, row);
    state.sun -= def.cost;
    state.planted += 1;
    state.plants.push({
      id: nextId,
      kind,
      col, row,
      x: centre.x, y: centre.y,
      stage: 0,
      growth: 0,
      nourished: false,
      cooldown: 0,
      harvestTimer: HARVEST_SECONDS,
      flash: 0,
    });
    nextId += 1;
    burst(centre.x, centre.y, '#8a6a45', 8, 60);
    return EVENT_PLANT;
  }

  /** Nourish a bloomed plant once: +50% damage for half its price. */
  function nourish(plant) {
    const def = plantById(plant.kind);
    if (plant.stage < 2 || plant.nourished) return EVENT_DENIED;
    const cost = nourishCost(def);
    if (state.sun < cost) return EVENT_DENIED;
    state.sun -= cost;
    plant.nourished = true;
    burst(plant.x, plant.y, '#f2b705', 14, 80);
    floatText(plant.x, plant.y - 30, 'Nourished!', '#f2b705');
    return EVENT_NOURISH;
  }

  /** Sell a plant for most of its price. */
  function sell(plant) {
    const def = plantById(plant.kind);
    const index = state.plants.indexOf(plant);
    if (index === -1) return EVENT_DENIED;
    state.plants.splice(index, 1);
    const value = sellValue(def);
    state.sun += value;
    floatText(plant.x, plant.y - 30, `+${value}`, '#f2b705');
    return EVENT_SELL;
  }

  function spawnPest(type, x, y, waypoint) {
    const def = PESTS[type];
    const wave = Math.max(state.wave, 1);
    const maxHp = pestMaxHp(def, wave, season());
    state.pests.push({
      id: nextId,
      type,
      x, y,
      hp: maxHp,
      maxHp,
      waypoint,
      progress: 0,
      slowUntil: 0,
      slowFactor: 1,
      poisonUntil: 0,
      poisonDps: 0,
      spawnTimer: BLIGHT_SPAWN_SECONDS,
      spawned: 0,
      radius: def.radius,
      wobble: random() * Math.PI * 2,
    });
    nextId += 1;
  }

  /** Begin the next wave. A manual call pays the early bonus; the countdown's own start does not. */
  function startWave(manual) {
    if (state.waveState !== 'idle' || state.over || state.won) return 0;
    if (manual) {
      const bonus = earlyCallBonus(state.waitTimer);
      state.sun += bonus;
      state.earned += bonus;
    }
    state.wave += 1;
    const groups = waveGroups(state.wave);
    state.spawnQueue = [];
    for (const group of groups) {
      for (let i = 0; i < group.count; i += 1) state.spawnQueue.push({ type: group.type, gap: group.gap });
    }
    state.spawnTimer = 0.5;
    state.waveState = 'spawning';
    return EVENT_WAVE_START;
  }

  function damagePest(pest, amount, color) {
    pest.hp -= amount;
    if (amount >= 1) floatText(pest.x, pest.y - pest.radius - 6, String(Math.round(amount)), color ?? '#ffffff');
    if (pest.hp <= 0) {
      const def = PESTS[pest.type];
      const reward = killReward(def, season());
      state.sun += reward;
      state.earned += reward;
      state.score += killScore(def);
      state.kills += 1;
      burst(pest.x, pest.y, def.body, 12, 90);
      floatText(pest.x, pest.y - pest.radius - 18, `+${reward}`, '#f2b705');
      return true;
    }
    return false;
  }

  function firePlant(plant, def) {
    let target = null;
    let bestProgress = -1;
    const range = plantRange(def, plant.stage);
    for (const pest of state.pests) {
      if (pest.hp <= 0) continue;
      if (distance(plant.x, plant.y, pest.x, pest.y) > range) continue;
      if (pest.progress > bestProgress) {
        bestProgress = pest.progress;
        target = pest;
      }
    }
    if (!target) return 0;
    const damage = plantDamage(def, plant.stage, plant.nourished, season());
    plant.cooldown = 1 / def.rate;
    plant.flash = 0.12;
    burst(target.x, target.y, def.shot, 4, 50);
    if (def.splash > 0) {
      for (const pest of state.pests) {
        if (pest.hp <= 0) continue;
        if (distance(target.x, target.y, pest.x, pest.y) > def.splash) continue;
        if (def.poison > 0) {
          pest.poisonUntil = state.elapsed + def.poisonSeconds;
          pest.poisonDps = def.poison * (plant.nourished ? NOURISH_DAMAGE : 1);
        }
        damagePest(pest, damage, def.shot);
      }
      burst(target.x, target.y, def.color, 10, 110);
    } else {
      if (def.slow > 0) {
        target.slowUntil = state.elapsed + def.slowSeconds;
        target.slowFactor = 1 - def.slow;
      }
      damagePest(target, damage, def.shot);
    }
    return EVENT_SHOOT;
  }

  function stepPlants(dt) {
    let events = 0;
    const growthRate = season().growth;
    for (const plant of state.plants) {
      const def = plantById(plant.kind);
      if (plant.flash > 0) plant.flash = Math.max(0, plant.flash - dt);
      if (plant.stage < 2) {
        plant.growth += dt * growthRate;
        if (plant.growth >= GROWTH_SECONDS) {
          plant.growth = 0;
          plant.stage += 1;
          burst(plant.x, plant.y - 10, def.color, 10, 70);
          events |= EVENT_GROW;
        }
      }
      if (def.harvest) {
        plant.harvestTimer -= dt;
        if (plant.harvestTimer <= 0) {
          plant.harvestTimer += HARVEST_SECONDS;
          const amount = plantHarvest(plant.stage);
          state.sun += amount;
          state.earned += amount;
          floatText(plant.x, plant.y - 30, `+${amount}`, '#f2b705');
          burst(plant.x, plant.y - 14, '#fde68a', 5, 40);
          events |= EVENT_HARVEST;
        }
        continue;
      }
      plant.cooldown -= dt;
      if (plant.cooldown <= 0) events |= firePlant(plant, def);
    }
    return events;
  }

  function stepPests(dt, harmless) {
    let events = 0;
    const now = state.elapsed;
    for (let index = state.pests.length - 1; index >= 0; index -= 1) {
      const pest = state.pests[index];
      if (pest.hp <= 0) {
        state.pests.splice(index, 1);
        continue;
      }
      const def = PESTS[pest.type];
      if (pest.poisonUntil > now) {
        if (damagePest(pest, pest.poisonDps * dt, '#c084fc')) {
          events |= EVENT_KILL;
          state.pests.splice(index, 1);
          continue;
        }
      }
      if (def.regen > 0 && pest.hp < pest.maxHp) pest.hp = Math.min(pest.maxHp, pest.hp + def.regen * dt);
      if (pest.type === 'blight') {
        pest.spawnTimer -= dt;
        if (pest.spawnTimer <= 0) {
          pest.spawnTimer += BLIGHT_SPAWN_SECONDS;
          const alive = state.pests.filter((other) => other.type === 'aphid').length;
          if (alive < BLIGHT_SPAWN_MAX + 6) {
            spawnPest('aphid', pest.x, pest.y, pest.waypoint);
            burst(pest.x, pest.y, '#7c5cbf', 8, 60);
          }
        }
      }
      const slowed = pest.slowUntil > now;
      const speed = pestSpeed(def, season()) * (slowed ? pest.slowFactor : 1);
      let move = speed * dt;
      while (move > 0 && pest.waypoint < WAYPOINTS.length) {
        const point = WAYPOINTS[pest.waypoint];
        const dx = point.x - pest.x;
        const dy = point.y - pest.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= move) {
          pest.x = point.x;
          pest.y = point.y;
          pest.progress += dist;
          move -= dist;
          pest.waypoint += 1;
        } else {
          pest.x += (dx / dist) * move;
          pest.y += (dy / dist) * move;
          pest.progress += move;
          move = 0;
        }
      }
      if (pest.waypoint >= WAYPOINTS.length) {
        state.pests.splice(index, 1);
        if (harmless) continue;
        state.hearts -= def.damage;
        state.leaked += 1;
        state.shake = 0.45;
        burst(pest.x, pest.y, '#e5534b', 14, 100);
        events |= EVENT_LEAK;
        if (state.hearts <= 0) {
          state.hearts = 0;
          state.over = true;
          events |= EVENT_OVER;
        }
      }
    }
    return events;
  }

  function stepParticles(dt) {
    for (let index = state.particles.length - 1; index >= 0; index -= 1) {
      const particle = state.particles[index];
      particle.life -= dt;
      if (particle.life <= 0) {
        state.particles.splice(index, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 140 * dt;
    }
    for (let index = state.floats.length - 1; index >= 0; index -= 1) {
      const floating = state.floats[index];
      floating.life -= dt;
      floating.y -= 26 * dt;
      if (floating.life <= 0) state.floats.splice(index, 1);
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
  }

  function stepFloatsHarmless(harmless) {
    // The title screen's backdrop plants shoot and harvest, but their numbers
    // would float over the title: keep the particles, drop the text.
    if (harmless) state.floats.length = 0;
  }

  function stepWave(dt, harmless) {
    let events = 0;
    if (state.waveState === 'idle') {
      if (state.over || state.won) return 0;
      state.waitTimer -= dt;
      if (state.waitTimer <= 0) {
        state.waitTimer = 0;
        return startWave(false);
      }
      return 0;
    }
    if (state.waveState === 'spawning') {
      state.spawnTimer -= dt;
      while (state.spawnTimer <= 0 && state.spawnQueue.length > 0) {
        const next = state.spawnQueue.shift();
        spawnPest(next.type, WAYPOINTS[0].x, WAYPOINTS[0].y, 1);
        state.spawnTimer += next.gap;
      }
      if (state.spawnQueue.length === 0) state.waveState = 'fighting';
    }
    if (state.waveState === 'fighting' && state.pests.length === 0 && state.spawnQueue.length === 0) {
      // A tree that fell on the very last pest is a loss, not a win: the
      // wave-clear below must never fire on the same step as the defeat.
      if (state.over) return events;
      state.score += waveScore(state.wave);
      events |= EVENT_WAVE_CLEAR;
      if (state.wave >= WAVES_PER_YEAR && !state.endless && !harmless) {
        state.won = true;
        events |= EVENT_WIN;
      } else {
        state.waveState = 'idle';
        state.waitTimer = WAVE_WAIT;
      }
    }
    return events;
  }

  /**
   * One fixed step. With `harmless` set (the title screen's backdrop) pests walk
   * but never hurt the tree and waves never end the game.
   */
  function step(dt, harmless) {
    let events = 0;
    state.elapsed += dt;
    events |= stepPlants(dt);
    const killsBefore = state.kills;
    events |= stepPests(dt, harmless);
    if (state.kills > killsBefore) events |= EVENT_KILL;
    events |= stepWave(dt, harmless);
    stepParticles(dt);
    stepFloatsHarmless(harmless);
    return events;
  }

  /** A pretty garden for the title screen: grown plants, no pests yet. */
  function demoGarden() {
    reset();
    const layout = [
      ['thorn', 2, 0], ['sunspore', 4, 0], ['thorn', 8, 0],
      ['frost', 3, 2], ['bramble', 7, 2], ['vine', 9, 2],
      ['spore', 4, 4], ['sunspore', 6, 4], ['thorn', 8, 4],
      ['vine', 3, 6], ['frost', 6, 6], ['bramble', 8, 6],
    ];
    for (const [kind, col, row] of layout) {
      state.sun = 9999;
      plant(kind, col, row);
      const placed = plantAt(col, row);
      if (placed) {
        placed.stage = 2;
        placed.growth = 0;
      }
    }
    state.sun = startingSun();
    state.waveState = 'idle';
    state.waitTimer = WAVE_WAIT;
  }

  /** Release one pest onto the path for the title screen's backdrop. */
  function spawnAmbient(type) {
    spawnPest(type, WAYPOINTS[0].x, WAYPOINTS[0].y, 1);
  }

  /** Start endless mode after a victory: the waves keep coming, harder each year. */
  function startEndless() {
    state.endless = true;
    state.won = false;
    state.waveState = 'idle';
    state.waitTimer = 3;
  }

  /** Pests still to come in the current wave, for the progress bar. */
  function pestsLeft() {
    return state.spawnQueue.length + state.pests.length;
  }

  /** Total pests of the current wave, for the progress bar. */
  function pestsTotal() {
    return state.wave === 0 ? 0 : waveSize(state.wave);
  }

  return {
    state,
    reset,
    step,
    plant,
    plantAt,
    nourish,
    sell,
    startWave,
    spawnAmbient,
    demoGarden,
    startEndless,
    pestsLeft,
    pestsTotal,
    season,
    preview: () => wavePreview(state.wave + 1),
  };
}

