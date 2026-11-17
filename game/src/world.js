// The game's rules and state, with no drawing and no browser in it: the garden
// grid, the plants and their growth, the pests walking the path, combat, the
// seasons the player drafts, the blessings the grove grants, the combo and the
// waves, sunlight and score — and, since v3, the three groves (difficulties),
// the Sunburst hero ability, the draft's reroll, the champions and the Blight's
// three phases, and the feats a run can earn. Since v4 there are three
// champions (Gloomcap walks wave 5) and the panel forecasts the three waves
// after the next one. Since v5 kills charge moonlight for the Moonbeam hero
// ability, and the Greenhouse's grown upgrades strengthen every new run.
// Since v6 the Warden walks the garden — a guardian wisp the player moves,
// whose aura strengthens nearby plants and whose zap strikes one pest —
// blessings can deepen to level 2, each five-wave block keeps its own
// kills-and-leaks ledger for the end panel's grades, and a run can be
// replayed on its exact seed. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react (sounds,
// screens) without the world knowing about them. Nothing here allocates after
// createWorld returns, apart from the small arrays a wave's spawn queue needs.

import { BOARD, EARLY_BONUS, WAVE_WAIT, WAVES_PER_YEAR, WAYPOINTS, cellCentre, isPlantable } from './config.js';
import { createRandom } from './random.js';
import { GROWTH_SECONDS, HARVEST_SECONDS, NOURISH_DAMAGE, PLANTS, nourishCost, plantDamage, plantHarvest, plantRange, plantById, sellValue } from './plants.js';
import { PESTS, blightPhase, blightPhaseRules, isChampion, pestMaxHp, pestSpeed } from './pests.js';
import { SEASON_LENGTH } from './seasons.js';
import { STARTING_CARD, cardById, drawOffer, isDraftWave, seasonOfCard } from './draft.js';
import { blessingById, blessingMods, drawFlawlessBlessing } from './blessings.js';
import { COMBO_WINDOW, comboMultiplier } from './combo.js';
import { earlyCallBonus, killReward, killScore, waveScore } from './economy.js';
import { waveForecast, waveGroups, wavePreview, waveSize } from './waves.js';
import { DEFAULT_DIFFICULTY, difficultyById } from './difficulty.js';
import {
  MOONBEAM_BEAM_SECONDS, MOONBEAM_COST, MOONBEAM_DAMAGE, MOONBEAM_SLOW, MOONBEAM_SLOW_SECONDS,
  MOONLIGHT_MAX, MOONLIGHT_PER_KILL, pickMoonbeamRow, rowOf,
} from './moonbeam.js';
import {
  WARDEN_BOLT_SECONDS, WARDEN_HOME, WARDEN_SPEED, WARDEN_ZAP_COOLDOWN,
  WARDEN_ZAP_DAMAGE, clampToBoard, wardenAuraMul, wardenInZapRange, wardenZapTarget,
} from './warden.js';

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
export const EVENT_DRAFT = 8192;
export const EVENT_BLESSING = 16384;
export const EVENT_BOSS_PHASE = 32768;
export const EVENT_SUNBURST = 65536;
export const EVENT_CHAMPION = 131072;
export const EVENT_REROLL = 262144;
export const EVENT_MOONBEAM = 524288;
export const EVENT_WARDEN_ZAP = 1048576;

const MAX_PARTICLES = 320;
const MAX_FLOATS = 40;
const BLIGHT_SPAWN_MAX = 6;
/** Aphids the Blight sheds at once when it enters phase 2. */
const BLIGHT_PHASE2_SWARM = 6;
/** The Sunburst hero ability: its price, damage to every pest on the field, the slow it leaves, and its cooldown. */
export const SUNBURST_COST = 150;
export const SUNBURST_DAMAGE = 80;
export const SUNBURST_SLOW = 0.5;
export const SUNBURST_SLOW_SECONDS = 2;
export const SUNBURST_COOLDOWN = 25;
/** Sunlight to redraw the draft's three cards. */
export const REROLL_COST = 25;
/** Seconds a shot's tracer stays visible — long enough to read, short enough to stay honest. */
export const TRACER_LIFE = 0.3;
/** Tracers are visual only; cap them so a full garden never floods the frame. */
const TRACER_MAX = 48;

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
    // The shots' visible flight, muzzle to target — visual only, the damage
    // is instant; the tracer is what makes a shot readable in a still frame.
    tracers: [],
    // The run's own ledger: the cumulative score after each wave cleared.
    waveScores: [],
    // One ledger per five-wave block: the kills and leaks of waves 1-5,
    // 6-10, 11-15 and 16-20, for the end panel's per-block grades.
    blockStats: [
      { kills: 0, leaked: 0 },
      { kills: 0, leaked: 0 },
      { kills: 0, leaked: 0 },
      { kills: 0, leaked: 0 },
    ],
    sun: difficultyById(DEFAULT_DIFFICULTY).sun,
    score: 0,
    wave: 0,
    waveState: 'idle',
    spawnQueue: [],
    spawnTimer: 0,
    waitTimer: WAVE_WAIT,
    hearts: difficultyById(DEFAULT_DIFFICULTY).hearts,
    maxHearts: difficultyById(DEFAULT_DIFFICULTY).hearts,
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
    // The grove this run plays in (Seedling, Warden or Thornstorm).
    difficulty: difficultyById(DEFAULT_DIFFICULTY),
    // Seconds until the Sunburst can fire again (0 means ready).
    sunburstCooldown: 0,
    // Moonlight charged by kills (0-100): a full charge fires the Moonbeam.
    moonlight: 0,
    // The Moonbeam's strike, while it is still visible: the row it hit, the
    // impact point, and the sim time it fades at. Null when no beam is showing.
    moonbeam: null,
    // The Warden, the grove's guardian wisp: where it hovers, where it is
    // gliding to, the seconds until its zap can fire again, how many zaps
    // this run has fired, and the bolt's target while it is still visible.
    warden: {
      x: WARDEN_HOME.x, y: WARDEN_HOME.y,
      tx: WARDEN_HOME.x, ty: WARDEN_HOME.y,
      zapCooldown: 0,
      zaps: 0,
      zap: null,
    },
    // The Greenhouse's gifts to this run: a multiplier on every shot's damage
    // and on every kill's sunlight, set at reset from the grown upgrades.
    greenhouseDamage: 1,
    greenhouseSun: 1,
    // Champions felled this run, and their names in the order they fell.
    championsFelled: 0,
    championsSlain: [],
    // The Blight: whether it fell, and how long it took from its arrival.
    blightKilled: false,
    blightSpawnedAt: 0,
    blightFelledIn: 0,
    // Waves started, and how many of them the player called early by hand:
    // the Swift Season feat needs every one of them manual.
    wavesStarted: 0,
    manualStarts: 0,
    // Drafts redrawn this run, and which draft is open (1 of 3, and so on).
    rerolls: 0,
    draftNumber: 0,
    // The wave the current season was drafted on (0 for the starting spring),
    // so the cover can say the season was chosen, not merely dealt.
    seasonDraftedAt: 0,
    // The drafted year: block 0 is always Bloom Spring; later blocks are the
    // cards the player picked, keyed by block index (waves 6-10 are block 1).
    seasonPlan: {},
    currentCard: STARTING_CARD,
    // The three cards on offer while the game waits for a draft pick, else null.
    draftOffer: null,
    // Blessing ids the grove has granted this run, in the order they arrived.
    blessings: [],
    // Each blessing's level (1 or 2): a drafted card can deepen a held
    // blessing to level 2 instead of granting a new one.
    blessingLevels: {},
    // The last blessing granted (or a consolation note), for the banner.
    lastBlessing: null,
    // The flawless-season gift granted at the draft now open, else null.
    flawlessGift: null,
    // The kill streak: count, seconds left on it, and the run's longest.
    combo: { count: 0, timer: 0, longest: 0 },
    // Leaks in the current five-wave season: zero at its end earns a blessing.
    leaksThisSeason: 0,
  };

  /** The combined rule changes of the blessings held this run. */
  function mods() {
    return blessingMods(state.blessings, state.blessingLevels);
  }

  /** The five-wave block the current wave belongs to (0-3); endless waves count as the last block. */
  function blockIndex() {
    return Math.min(3, Math.max(0, Math.floor((state.wave - 1) / SEASON_LENGTH)));
  }

  /**
   * The season a wave plays under: block 0 is Bloom Spring; a drafted block is
   * the card picked for it; a block not drafted yet has no season at all.
   */
  function seasonFor(wave) {
    const block = Math.floor((wave - 1) / SEASON_LENGTH);
    if (block === 0) return seasonOfCard(cardById(STARTING_CARD));
    const cardId = state.seasonPlan[block];
    if (!cardId) return null;
    return seasonOfCard(cardById(cardId));
  }

  /**
   * The season in force right now: the coming wave's while the garden waits
   * (so a fresh draft takes effect the moment it is picked), the current
   * wave's while it is being fought, and the last drafted one while a draft
   * is still open.
   */
  function season() {
    if (state.waveState === 'idle') {
      return seasonFor(state.wave + 1) ?? seasonFor(Math.max(state.wave, 1));
    }
    if (state.waveState === 'draft') return seasonFor(Math.max(state.wave, 1));
    return seasonFor(Math.max(state.wave, 1));
  }

  /**
   * Start a fresh run in this grove (or Warden when none is named). `greenhouse`
   * is the grown upgrades' combined effects (or null for a bare run): it adds
   * hearts to the tree, sunlight to the opening purse, and multipliers to every
   * shot's damage and every kill's sunlight for the whole run.
   */
  function reset(difficultyId, greenhouse) {
    const difficulty = difficultyById(difficultyId ?? DEFAULT_DIFFICULTY);
    const gifts = greenhouse ?? { hearts: 0, damageMul: 1, startSun: 0, sunMul: 1 };
    state.difficulty = difficulty;
    state.plants.length = 0;
    state.pests.length = 0;
    state.particles.length = 0;
    state.floats.length = 0;
    state.tracers.length = 0;
    state.waveScores = [];
    state.blockStats = [
      { kills: 0, leaked: 0 },
      { kills: 0, leaked: 0 },
      { kills: 0, leaked: 0 },
      { kills: 0, leaked: 0 },
    ];
    state.sun = difficulty.sun + gifts.startSun;
    state.greenhouseDamage = gifts.damageMul;
    state.greenhouseSun = gifts.sunMul;
    state.moonlight = 0;
    state.moonbeam = null;
    state.warden.x = WARDEN_HOME.x;
    state.warden.y = WARDEN_HOME.y;
    state.warden.tx = WARDEN_HOME.x;
    state.warden.ty = WARDEN_HOME.y;
    state.warden.zapCooldown = 0;
    state.warden.zaps = 0;
    state.warden.zap = null;
    state.score = 0;
    state.wave = 0;
    state.waveState = 'idle';
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.waitTimer = WAVE_WAIT;
    state.hearts = difficulty.hearts + gifts.hearts;
    state.maxHearts = difficulty.hearts + gifts.hearts;
    state.kills = 0;
    state.leaked = 0;
    state.earned = 0;
    state.planted = 0;
    state.elapsed = 0;
    state.shake = 0;
    state.endless = false;
    state.won = false;
    state.over = false;
    state.seasonPlan = {};
    state.currentCard = STARTING_CARD;
    state.draftOffer = null;
    state.blessings.length = 0;
    state.blessingLevels = {};
    state.lastBlessing = null;
    state.flawlessGift = null;
    state.combo.count = 0;
    state.combo.timer = 0;
    state.combo.longest = 0;
    state.leaksThisSeason = 0;
    state.sunburstCooldown = 0;
    state.championsFelled = 0;
    state.championsSlain.length = 0;
    state.blightKilled = false;
    state.blightSpawnedAt = 0;
    state.blightFelledIn = 0;
    state.wavesStarted = 0;
    state.manualStarts = 0;
    state.rerolls = 0;
    state.draftNumber = 0;
    state.seasonDraftedAt = 0;
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

  /** Nourish a bloomed plant once: +50% damage for half its price (free with Nourishroot). */
  function nourish(plant) {
    const def = plantById(plant.kind);
    if (plant.stage < 2 || plant.nourished) return EVENT_DENIED;
    const cost = nourishCost(def, mods());
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
    const maxHp = pestMaxHp(def, wave, season(), state.difficulty.pestHp);
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
      spawnTimer: blightPhaseRules(1).spawnSeconds,
      spawned: 0,
      radius: def.radius,
      wobble: random() * Math.PI * 2,
      // The Blight's phase (1-3); other pests never use it.
      phase: 1,
    });
    if (type === 'blight') state.blightSpawnedAt = state.elapsed;
    nextId += 1;
  }

  /** Begin the next wave. A manual call pays the early bonus; the countdown's own start does not. */
  function startWave(manual) {
    if (state.waveState !== 'idle' || state.over || state.won) return 0;
    state.wavesStarted += 1;
    if (manual) {
      state.manualStarts += 1;
      const bonus = earlyCallBonus(state.waitTimer);
      state.sun += bonus;
      state.earned += bonus;
    }
    state.wave += 1;
    // A new five-wave season starts its own flawless count.
    if ((state.wave - 1) % SEASON_LENGTH === 0) state.leaksThisSeason = 0;
    const groups = waveGroups(state.wave);
    state.spawnQueue = [];
    for (const group of groups) {
      for (let i = 0; i < group.count; i += 1) state.spawnQueue.push({ type: group.type, gap: group.gap });
    }
    state.spawnTimer = 0.5;
    state.waveState = 'spawning';
    return EVENT_WAVE_START;
  }

  /**
   * Hurt a pest, returning the events of it: 0 while it lives, EVENT_KILL when
   * the blow lands the kill, plus EVENT_CHAMPION when the kill was a champion.
   * A champion's fall is counted for the victory screen; the Blight's is timed
   * from its arrival, for the boss-felled banner.
   */
  function damagePest(pest, amount, color) {
    pest.hp -= amount;
    if (amount >= 1) floatText(pest.x, pest.y - pest.radius - 6, String(Math.round(amount)), color ?? '#ffffff');
    if (pest.hp <= 0) {
      const def = PESTS[pest.type];
      // The kill feeds the combo first: the streak multiplies the score it pays.
      state.combo.count += 1;
      state.combo.timer = COMBO_WINDOW;
      if (state.combo.count > state.combo.longest) state.combo.longest = state.combo.count;
      const multiplier = comboMultiplier(state.combo.count);
      const reward = Math.round(killReward(def, season(), mods().bonusSun) * state.greenhouseSun);
      state.sun += reward;
      state.earned += reward;
      state.score += killScore(def, multiplier);
      state.kills += 1;
      state.blockStats[blockIndex()].kills += 1;
      // Every kill charges the moon: a full charge is a Moonbeam waiting.
      state.moonlight = Math.min(MOONLIGHT_MAX, state.moonlight + MOONLIGHT_PER_KILL);
      burst(pest.x, pest.y, def.body, 12, 90);
      floatText(pest.x, pest.y - pest.radius - 18, `+${reward}`, '#f2b705');
      if (multiplier > 1) {
        const shown = Number.isInteger(multiplier) ? String(multiplier) : multiplier.toFixed(2).replace(/0$/, '');
        floatText(pest.x, pest.y - pest.radius - 34, `\u00D7${shown}`, '#f2b705');
      }
      if (isChampion(pest.type)) {
        state.championsFelled += 1;
        state.championsSlain.push(def.name);
        burst(pest.x, pest.y, '#f2b705', 20, 130);
        return EVENT_KILL | EVENT_CHAMPION;
      }
      if (pest.type === 'blight') {
        state.blightKilled = true;
        state.blightFelledIn = Math.max(0, state.elapsed - state.blightSpawnedAt);
        burst(pest.x, pest.y, '#7c5cbf', 30, 160);
      }
      return EVENT_KILL;
    }
    return 0;
  }

  function firePlant(plant, def) {
    let target = null;
    let bestProgress = -1;
    const blessing = mods();
    const range = plantRange(def, plant.stage, blessing);
    for (const pest of state.pests) {
      if (pest.hp <= 0) continue;
      if (distance(plant.x, plant.y, pest.x, pest.y) > range) continue;
      if (pest.progress > bestProgress) {
        bestProgress = pest.progress;
        target = pest;
      }
    }
    if (!target) return 0;
    const damage = plantDamage(def, plant.stage, plant.nourished, season(), blessing)
      * state.greenhouseDamage
      * wardenAuraMul(plant, state.warden);
    plant.cooldown = 1 / def.rate;
    plant.flash = 0.12;
    // A tracer from the plant's muzzle to where the target stands: visual
    // only — the damage below lands instantly either way.
    if (state.tracers.length >= TRACER_MAX) state.tracers.shift();
    state.tracers.push({
      x1: plant.x, y1: plant.y - 10,
      x2: target.x, y2: target.y,
      color: def.shot, life: TRACER_LIFE, maxLife: TRACER_LIFE,
    });
    burst(target.x, target.y, def.shot, 4, 50);
    let events = EVENT_SHOOT;
    if (def.splash > 0) {
      const splash = def.splash * blessing.splash;
      for (const pest of state.pests) {
        if (pest.hp <= 0) continue;
        if (distance(target.x, target.y, pest.x, pest.y) > splash) continue;
        if (def.poison > 0) {
          pest.poisonUntil = state.elapsed + def.poisonSeconds * blessing.poisonSeconds;
          pest.poisonDps = def.poison * blessing.poison * (plant.nourished ? NOURISH_DAMAGE : 1);
        }
        events |= damagePest(pest, damage, def.shot);
      }
      burst(target.x, target.y, def.color, 10, 110);
    } else {
      if (def.slow > 0) {
        target.slowUntil = state.elapsed + def.slowSeconds * blessing.slow;
        target.slowFactor = 1 - def.slow;
      }
      events |= damagePest(target, damage, def.shot);
    }
    return events;
  }

  function stepPlants(dt) {
    let events = 0;
    const blessing = mods();
    const growthRate = season().growth * blessing.growth;
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
          const amount = plantHarvest(plant.stage, blessing);
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
        const dealt = damagePest(pest, pest.poisonDps * dt, '#c084fc');
        if (dealt & EVENT_KILL) {
          events |= dealt;
          state.pests.splice(index, 1);
          continue;
        }
      }
      if (def.regen > 0 && pest.hp < pest.maxHp) pest.hp = Math.min(pest.maxHp, pest.hp + def.regen * dt);
      // The Blight changes as it is hurt: each phase is faster, sheds aphids
      // more often, and announces itself. Entering phase 2 sheds a swarm at
      // once; phase 3 is enraged and hits the tree harder when it leaks.
      let phaseSpeed = 1;
      if (pest.type === 'blight') {
        const phase = blightPhase(pest.hp, pest.maxHp);
        if (phase > pest.phase) {
          pest.phase = phase;
          events |= EVENT_BOSS_PHASE;
          if (phase === 2) {
            for (let s = 0; s < BLIGHT_PHASE2_SWARM; s += 1) {
              spawnPest('aphid', pest.x, pest.y, pest.waypoint);
              pest.spawned += 1;
            }
            burst(pest.x, pest.y, '#7c5cbf', 20, 130);
          }
        }
        phaseSpeed = blightPhaseRules(pest.phase).speed;
        pest.spawnTimer -= dt;
        if (pest.spawnTimer <= 0) {
          pest.spawnTimer += blightPhaseRules(pest.phase).spawnSeconds;
          const alive = state.pests.filter((other) => other.type === 'aphid').length;
          if (alive < BLIGHT_SPAWN_MAX + 6) {
            spawnPest('aphid', pest.x, pest.y, pest.waypoint);
            burst(pest.x, pest.y, '#7c5cbf', 8, 60);
          }
        }
      }
      const slowed = pest.slowUntil > now;
      const speed = pestSpeed(def, season()) * (slowed ? pest.slowFactor : 1) * phaseSpeed;
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
        // An enraged Blight (phase 3) hits the tree harder when it leaks.
        state.hearts -= pest.type === 'blight' && pest.phase === 3 ? def.damage + 3 : def.damage;
        state.leaked += 1;
        state.leaksThisSeason += 1;
        state.blockStats[blockIndex()].leaked += 1;
        // A leak spends the combo as well as a heart.
        state.combo.count = 0;
        state.combo.timer = 0;
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
    for (let index = state.tracers.length - 1; index >= 0; index -= 1) {
      const tracer = state.tracers[index];
      tracer.life -= dt;
      if (tracer.life <= 0) state.tracers.splice(index, 1);
    }
    if (state.moonbeam && state.elapsed >= state.moonbeam.until) state.moonbeam = null;
    if (state.warden.zap && state.elapsed >= state.warden.zap.until) state.warden.zap = null;
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
      // The run's own ledger: the cumulative score after each wave cleared,
      // so the victory screen can chart the score wave by wave.
      state.waveScores.push(state.score);
      events |= EVENT_WAVE_CLEAR;
      if (state.wave >= WAVES_PER_YEAR && !state.endless && !harmless) {
        state.won = true;
        events |= EVENT_WIN;
      } else if (isDraftWave(state.wave) && !harmless) {
        // A season ends: a flawless one earns a kept-back blessing first,
        // then the grove turns and the player drafts the next season.
        if (state.leaksThisSeason === 0) {
          const gift = drawFlawlessBlessing(random, state.blessings);
          if (gift) {
            grantBlessing(gift);
            state.flawlessGift = blessingById(gift);
            events |= EVENT_BLESSING;
          }
        }
        state.draftOffer = drawOffer(random, state.blessings, state.currentCard, state.blessingLevels);
        state.draftNumber = state.wave / SEASON_LENGTH;
        state.waveState = 'draft';
        events |= EVENT_DRAFT;
      } else {
        state.waveState = 'idle';
        state.waitTimer = WAVE_WAIT;
      }
    }
    return events;
  }

  /**
   * Grant a blessing the grove owes the player: Heartwood pays its hearts at
   * once. A blessing already held at level 1 deepens to level 2 instead
   * (Heartwood pays its hearts again); only a blessing at its peak refuses,
   * so the caller can pay sunlight instead.
   */
  function grantBlessing(id) {
    const blessing = blessingById(id);
    if (!blessing) return false;
    if (state.blessings.includes(id)) {
      const level = state.blessingLevels[id] ?? 1;
      if (level >= (blessing.maxLevel ?? 2)) return false;
      state.blessingLevels[id] = 2;
      if (id === 'heartwood') {
        state.maxHearts += 2;
        state.hearts = Math.min(state.maxHearts, state.hearts + 2);
      }
      state.lastBlessing = { ...blessing, level: 2 };
      return true;
    }
    state.blessings.push(id);
    state.blessingLevels[id] = 1;
    if (id === 'heartwood') {
      state.maxHearts += 2;
      state.hearts = Math.min(state.maxHearts, state.hearts + 2);
    }
    state.lastBlessing = blessing;
    return true;
  }

  /** The cards on offer while a draft is open, or null when no draft is open. */
  function draftOffer() {
    return state.draftOffer;
  }

  /**
   * Pick a season card: its season rules the next five waves, and its blessing
   * joins the grove — or deepens to level 2 when already held at level 1.
   * When the blessing is already at its peak, the grove pays sunlight
   * instead. Only valid while a draft is open.
   */
  function applyDraft(cardId) {
    if (state.waveState !== 'draft' || !state.draftOffer) return 0;
    const card = state.draftOffer.find((offered) => offered.id === cardId);
    if (!card) return 0;
    const block = Math.floor(state.wave / SEASON_LENGTH);
    state.seasonPlan[block] = card.id;
    state.currentCard = card.id;
    state.seasonDraftedAt = state.wave;
    state.draftOffer = null;
    state.flawlessGift = null;
    state.waveState = 'idle';
    state.waitTimer = WAVE_WAIT;
    let events = 0;
    if (!grantBlessing(card.blessing)) {
      state.sun += 75;
      state.earned += 75;
      state.lastBlessing = { name: 'Sunlight Gift', glyph: '\u2600', blurb: 'Blessing already at its peak: +75 sunlight instead.' };
    }
    events |= EVENT_BLESSING;
    return events;
  }

  /**
   * One fixed step. With `harmless` set (the title screen's backdrop) pests walk
   * but never hurt the tree and waves never end the game.
   */
  /** Whether the Sunburst can fire right now, and why not when it cannot. */
  function sunburstStatus() {
    if (state.over || state.won || state.waveState === 'draft') return { ready: false, cooldown: state.sunburstCooldown, cost: SUNBURST_COST, reason: 'not now' };
    if (state.sunburstCooldown > 0) return { ready: false, cooldown: state.sunburstCooldown, cost: SUNBURST_COST, reason: 'cooling down' };
    if (state.sun < SUNBURST_COST) return { ready: false, cooldown: 0, cost: SUNBURST_COST, reason: 'needs sunlight' };
    if (state.pests.length === 0) return { ready: false, cooldown: 0, cost: SUNBURST_COST, reason: 'no pests' };
    return { ready: true, cooldown: 0, cost: SUNBURST_COST, reason: '' };
  }

  /**
   * The Sunburst hero ability: a blast of noon light that hurts every pest on
   * the field and slows what survives it for two seconds. It costs sunlight
   * and then needs twenty-five seconds to charge again; it refuses when the
   * purse is short, while it is charging, or when the field is empty.
   */
  function sunburst() {
    if (!sunburstStatus().ready) return EVENT_DENIED;
    state.sun -= SUNBURST_COST;
    state.sunburstCooldown = SUNBURST_COOLDOWN;
    let events = EVENT_SUNBURST;
    for (const pest of state.pests) {
      if (pest.hp <= 0) continue;
      pest.slowUntil = state.elapsed + SUNBURST_SLOW_SECONDS;
      pest.slowFactor = 1 - SUNBURST_SLOW;
      events |= damagePest(pest, SUNBURST_DAMAGE, '#f2b705');
    }
    burst(432, 344, '#fde68a', 40, 260);
    floatText(432, 300, 'SUNBURST!', '#f2b705');
    return events;
  }

  /** Whether the Moonbeam can fire right now, and why not when it cannot. */
  function moonbeamStatus() {
    if (state.over || state.won || state.waveState === 'draft') return { ready: false, moonlight: state.moonlight, cost: MOONBEAM_COST, reason: 'not now' };
    if (state.moonlight < MOONBEAM_COST) return { ready: false, moonlight: state.moonlight, cost: MOONBEAM_COST, reason: 'charging' };
    if (state.pests.length === 0) return { ready: false, moonlight: state.moonlight, cost: MOONBEAM_COST, reason: 'no pests' };
    return { ready: true, moonlight: state.moonlight, cost: MOONBEAM_COST, reason: '' };
  }

  /**
   * The Moonbeam hero ability: a full charge of moonlight calls a beam down
   * on the row thickest with pests — 60 damage to every pest whose centre is
   * in that row, and a slow on what survives. It costs the whole charge and
   * refuses when the moon is not full or the field is empty.
   */
  function moonbeam() {
    if (!moonbeamStatus().ready) return EVENT_DENIED;
    const row = pickMoonbeamRow(state.pests);
    if (row < 0) return EVENT_DENIED;
    const struck = state.pests.filter((pest) => pest.hp > 0 && rowOf(pest) === row);
    const impactX = struck.length > 0
      ? struck.reduce((sum, pest) => sum + pest.x, 0) / struck.length
      : BOARD.x + (BOARD.cols * BOARD.cell) / 2;
    state.moonlight = 0;
    state.moonbeam = {
      row,
      x: impactX,
      y: BOARD.y + row * BOARD.cell + BOARD.cell / 2,
      until: state.elapsed + MOONBEAM_BEAM_SECONDS,
    };
    let events = EVENT_MOONBEAM;
    for (const pest of struck) {
      pest.slowUntil = state.elapsed + MOONBEAM_SLOW_SECONDS;
      pest.slowFactor = 1 - MOONBEAM_SLOW;
      events |= damagePest(pest, MOONBEAM_DAMAGE, '#bcd8f5');
    }
    burst(impactX, state.moonbeam.y, '#bcd8f5', 30, 200);
    floatText(impactX, state.moonbeam.y - 40, 'MOONBEAM!', '#bcd8f5');
    return events;
  }

  /**
   * Send the Warden gliding to a point on the board (clamped to the garden).
   * The Warden hovers, so it can cross the path and the beds alike.
   */
  function moveWarden(x, y) {
    const point = clampToBoard(x, y);
    state.warden.tx = point.x;
    state.warden.ty = point.y;
  }

  /** Whether the Warden's zap can fire right now, and why not when it cannot. */
  function wardenStatus() {
    if (state.over || state.won || state.waveState === 'draft') {
      return { ready: false, cooldown: state.warden.zapCooldown, zaps: state.warden.zaps, reason: 'not now' };
    }
    if (state.warden.zapCooldown > 0) {
      return { ready: false, cooldown: state.warden.zapCooldown, zaps: state.warden.zaps, reason: 'charging' };
    }
    if (state.pests.length === 0) {
      return { ready: false, cooldown: 0, zaps: state.warden.zaps, reason: 'no pests' };
    }
    return { ready: true, cooldown: 0, zaps: state.warden.zaps, reason: '' };
  }

  /**
   * The Warden's zap: a bolt of moonlight that strikes one pest for 30
   * damage, through the same kill path as every other blow — so a zap that
   * kills pays sunlight and score, feeds the combo and charges the moon.
   * It refuses while charging, out of reach, or when the field is empty.
   */
  function zapPest(pest) {
    if (!pest || pest.hp <= 0) return EVENT_DENIED;
    if (!wardenStatus().ready) return EVENT_DENIED;
    if (!wardenInZapRange(state.warden, pest)) return EVENT_DENIED;
    state.warden.zapCooldown = WARDEN_ZAP_COOLDOWN;
    state.warden.zaps += 1;
    state.warden.zap = { x: pest.x, y: pest.y, until: state.elapsed + WARDEN_BOLT_SECONDS };
    burst(pest.x, pest.y, '#ffe066', 8, 80);
    return EVENT_WARDEN_ZAP | damagePest(pest, WARDEN_ZAP_DAMAGE, '#ffe066');
  }

  /** Zap the pest under a click, if one is there and in reach. */
  function zapAt(x, y) {
    const target = wardenZapTarget(state.pests, x, y);
    if (!target) return EVENT_DENIED;
    return zapPest(target);
  }

  /**
   * Glide the Warden toward its target and let the zap recharge. Called
   * every step, in play and on the title — on the title the Warden simply
   * idles at home, target and position already the same.
   */
  function stepWarden(dt) {
    const warden = state.warden;
    if (warden.zapCooldown > 0) warden.zapCooldown = Math.max(0, warden.zapCooldown - dt);
    const dx = warden.tx - warden.x;
    const dy = warden.ty - warden.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0) return;
    const stride = WARDEN_SPEED * dt;
    if (distance <= stride) {
      warden.x = warden.tx;
      warden.y = warden.ty;
    } else {
      warden.x += (dx / distance) * stride;
      warden.y += (dy / distance) * stride;
    }
  }

  /**
   * Restart the random stream from a seed, so a run can be replayed exactly:
   * the same seed deals the same drafts, the same flawless gifts, the same
   * wobble. The caller resets the world after reseeding.
   */
  function reseed(seedValue) {
    random = createRandom(seedValue);
  }

  /** Redraw the draft's three cards for 25 sunlight, while a draft is open. */
  function rerollDraft() {
    if (state.waveState !== 'draft' || !state.draftOffer) return EVENT_DENIED;
    if (state.sun < REROLL_COST) return EVENT_DENIED;
    state.sun -= REROLL_COST;
    state.rerolls += 1;
    state.draftOffer = drawOffer(random, state.blessings, state.currentCard, state.blessingLevels);
    return EVENT_REROLL;
  }

  function step(dt, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.sunburstCooldown > 0) state.sunburstCooldown = Math.max(0, state.sunburstCooldown - dt);
    stepWarden(dt);
    // The combo spends itself after three quiet seconds.
    if (state.combo.timer > 0) {
      state.combo.timer -= dt;
      if (state.combo.timer <= 0) {
        state.combo.count = 0;
        state.combo.timer = 0;
      }
    }
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
    state.sun = state.difficulty.sun;
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
    seasonFor,
    draftOffer,
    applyDraft,
    sunburst,
    sunburstStatus,
    moonbeam,
    moonbeamStatus,
    moveWarden,
    zapPest,
    zapAt,
    wardenStatus,
    reseed,
    rerollDraft,
    preview: () => wavePreview(state.wave + 1),
    /** The three waves after the next one, for the panel's forecast line. */
    forecast: () => waveForecast(state.wave + 1),
  };
}

