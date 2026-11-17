// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (twice as many at 2x speed), and the renderer paints what is
// there. The game moves between eight screens: title, how to play, play,
// paused, draft, victory, defeat, and the greenhouse.
//
// ?seed=N fixes the random pattern. ?shot=start|play|draft|victory|defeat
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { BOARD, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BLESSING, EVENT_BOSS_PHASE, EVENT_CHAMPION, EVENT_DENIED, EVENT_DRAFT, EVENT_GROW,
  EVENT_HARVEST, EVENT_KILL, EVENT_LEAK, EVENT_MOONBEAM, EVENT_NOURISH, EVENT_OVER, EVENT_PLANT, EVENT_REROLL,
  EVENT_SELL, EVENT_SHOOT, EVENT_SUNBURST, EVENT_WARDEN_ZAP, EVENT_WAVE_CLEAR, EVENT_WAVE_START, EVENT_WIN, createWorld,
} from './world.js';
import { WARDEN_AURA_RADIUS, wardenZapTarget } from './warden.js';
import { KEY_CONFIRM, KEY_ESCAPE, KEY_GREENHOUSE, KEY_MOONBEAM, KEY_MUTE, KEY_PAUSE, KEY_REROLL, KEY_SPEED, KEY_SUNBURST, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  LAYOUT, SCREEN_DEFEAT, SCREEN_DRAFT, SCREEN_GREENHOUSE, SCREEN_HOWTO, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_VICTORY, createRenderer, inside,
} from './render.js';
import { readRecords, recordGame, spendSeeds } from './records.js';
import { UPGRADES, greenhouseEffects, growUpgrade, writeGreenhouse } from './greenhouse.js';
import { stageShot } from './shots.js';
import { blightPhaseRules } from './pests.js';
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from './difficulty.js';
import { featsFor } from './feats.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Seconds between ambient pests wandering the title screen's garden. */
const AMBIENT_SECONDS = 2.5;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function runShot(name) {
  const scene = stageShot(name, world);
  // What the staging actually produced, for the screenshot harness to check.
  const blight = world.state.pests.find((pest) => pest.type === 'blight') ?? null;
  window.__shot = {
    name,
    screen: scene.screen,
    wave: world.state.wave,
    score: world.state.score,
    hearts: world.state.hearts,
    plants: world.state.plants.length,
    pests: world.state.pests.length,
    blessings: world.state.blessings.length,
    longestCombo: world.state.combo.longest,
    won: world.state.won,
    over: world.state.over,
    difficulty: world.state.difficulty.id,
    championsFelled: world.state.championsFelled,
    championsSlain: [...world.state.championsSlain],
    feats: featsFor(world.state),
    blightPhase: blight ? blight.phase : 0,
    blightX: blight ? Math.round(blight.x) : -1,
    sunburstReady: world.sunburstStatus().ready,
    floats: world.state.floats.length,
    tracers: world.state.tracers.length,
    waveScores: [...world.state.waveScores],
    moonlight: world.state.moonlight,
    moonbeamActive: world.state.moonbeam !== null,
    banner: scene.banner?.title ?? null,
    wardenX: Math.round(world.state.warden.x),
    wardenY: Math.round(world.state.warden.y),
    wardenZaps: world.state.warden.zaps,
    wardenZapFired: world.state.warden.zaps > 0,
    wardenNearBlight: blight
      ? Math.hypot(world.state.warden.x - blight.x, world.state.warden.y - blight.y) <= WARDEN_AURA_RADIUS
      : false,
    blockStats: world.state.blockStats.map((block) => ({ kills: block.kills, leaked: block.leaked })),
  };
  const ui = {
    hover: { x: -1, y: -1, inside: false },
    selectedCard: -1,
    selectedPlant: null,
    speed: 1,
    muted: false,
    banner: scene.banner ?? null,
    difficulty: world.state.difficulty.id,
    seed,
    sunburst: world.sunburstStatus(),
    moonbeam: world.moonbeamStatus(),
    preview: world.preview(),
    forecast: world.forecast(),
    pestsLeft: world.pestsLeft(),
    pestsTotal: world.pestsTotal(),
    season: world.season(),
    seasonFor: (wave) => world.seasonFor(wave),
    draftOffer: world.draftOffer(),
    canPlant: () => false,
  };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, ui, scene.screen, scene.records);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (x, y) => renderer.toLogical(x, y));
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let records = readRecords();
  let accumulator = 0;
  let last = performance.now();
  let ambientTimer = 0;
  // The seed of the run being played: the one the page opened with (?seed=N,
  // or one drawn at load) for the first run, a fresh one for every run after.
  let runSeed = seed;
  let runStarted = false;

  const ui = {
    selectedCard: -1,
    selectedPlant: null,
    speed: 1,
    banner: null,
    difficulty: DEFAULT_DIFFICULTY,
    get seed() {
      return runSeed;
    },
    get muted() {
      return audio.muted();
    },
    get sunburst() {
      return world.sunburstStatus();
    },
    get moonbeam() {
      return world.moonbeamStatus();
    },
    get hover() {
      return input.hover();
    },
    get preview() {
      return world.preview();
    },
    get forecast() {
      return world.forecast();
    },
    get pestsLeft() {
      return world.pestsLeft();
    },
    get pestsTotal() {
      return world.pestsTotal();
    },
    get season() {
      return world.season();
    },
    seasonFor(wave) {
      return world.seasonFor(wave);
    },
    get draftOffer() {
      return world.draftOffer();
    },
    canPlant(col, row) {
      return world.plantAt(col, row) === null;
    },
  };

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function showBanner(title, sub, seconds) {
    ui.banner = { title, sub: sub ?? null, until: world.state.elapsed + seconds };
  }

  /** Reset the world and start playing; the seed is the caller's business. */
  function beginRun() {
    world.reset(ui.difficulty, greenhouseEffects(records.greenhouse));
    ui.selectedCard = -1;
    ui.selectedPlant = null;
    ui.banner = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Plant your first tower, then start wave 1.');
  }

  function startGame() {
    // The first run on the page uses the seed it opened with; every run
    // after it is a new year on a fresh seed, so the seed on the end screen
    // is always the seed of the run just played.
    if (runStarted) {
      runSeed = Math.floor(Math.random() * 4294967296);
      world.reseed(runSeed);
    }
    runStarted = true;
    beginRun();
  }

  /** The same seed again: the exact same pests, drafts and gifts. */
  function replaySeed() {
    world.reseed(runSeed);
    beginRun();
  }

  function endGame(victory) {
    screen = victory ? SCREEN_VICTORY : SCREEN_DEFEAT;
    records = recordGame({ score: world.state.score, wave: world.state.wave, won: victory, feats: featsFor(world.state) });
    announce(victory
      ? `Victory! The grove holds. Score ${world.state.score}.`
      : `Defeat on wave ${world.state.wave}. Score ${world.state.score}.`);
  }

  function backToTitle() {
    screen = SCREEN_TITLE;
    world.demoGarden();
    announce('Seedwarden. Press Space or click Play to start.');
  }

  /** Pick a draft card by its index in the offer; returns true when it took. */
  function pickDraftCard(index) {
    const offer = world.draftOffer();
    if (index < 0 || index >= offer.length) return false;
    const events = world.applyDraft(offer[index].id);
    if (!(events & EVENT_BLESSING)) {
      audio.denied();
      return false;
    }
    playEvents(events);
    screen = SCREEN_PLAY;
    const season = world.season();
    announce(`The grove turns to ${season.name}.`);
    return true;
  }

  function playEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_KILL) audio.kill();
    if (events & EVENT_LEAK) audio.leak();
    if (events & EVENT_HARVEST) audio.harvest();
    if (events & EVENT_GROW) audio.grow();
    if (events & EVENT_PLANT) audio.plant();
    if (events & EVENT_NOURISH) audio.nourish();
    if (events & EVENT_SELL) audio.sell();
    if (events & EVENT_WAVE_START) {
      audio.waveStart();
      const season = world.season();
      showBanner(`WAVE ${world.state.wave}`, `${season.glyph} ${season.name} — ${season.tagline}`, 2.4);
      announce(`Wave ${world.state.wave}. ${season.name}.`);
    }
    if (events & EVENT_WAVE_CLEAR) audio.waveClear();
    if (events & EVENT_SUNBURST) {
      audio.sunburst();
      showBanner('SUNBURST!', 'Noon light falls on every pest.', 1.6);
    }
    if (events & EVENT_MOONBEAM) {
      audio.moonbeam();
      showBanner('MOONBEAM!', 'The moon answers the grove.', 1.6);
    }
    // No banner for the zap: the bolt and the damage number carry it.
    if (events & EVENT_WARDEN_ZAP) audio.zap();
    if (events & EVENT_BOSS_PHASE) {
      audio.bossPhase();
      const blight = world.state.pests.find((pest) => pest.type === 'blight');
      const phase = blight ? blight.phase : 2;
      showBanner(`THE BLIGHT — PHASE ${phase}`, blightPhaseRules(phase).name, 2.4);
      announce(`The Blight turns: phase ${phase}, ${blightPhaseRules(phase).name}.`);
    }
    if (events & EVENT_CHAMPION) {
      audio.champion();
      const name = world.state.championsSlain[world.state.championsSlain.length - 1] ?? 'A champion';
      showBanner('CHAMPION FELLED', `${name} — ${world.state.championsFelled} of 3.`, 2.4);
      announce(`${name} has fallen.`);
    }
    if (events & EVENT_REROLL) audio.reroll();
    if (events & EVENT_BLESSING) {
      audio.blessing();
      const blessing = world.state.lastBlessing;
      if (blessing) showBanner('BLESSING', `${blessing.glyph} ${blessing.name} — ${blessing.blurb}`, 2.8);
    }
    if (events & EVENT_DRAFT) {
      audio.draft();
      screen = SCREEN_DRAFT;
      announce(`Wave ${world.state.wave} cleared. Choose the next season.`);
    }
    if (events & EVENT_WIN) {
      audio.win();
      endGame(true);
    }
    if (events & EVENT_OVER) {
      audio.lose();
      endGame(false);
    }
  }

  function cellFromPoint(x, y) {
    const col = Math.floor((x - BOARD.x) / BOARD.cell);
    const row = Math.floor((y - BOARD.y) / BOARD.cell);
    if (col < 0 || col >= BOARD.cols || row < 0 || row >= BOARD.rows) return null;
    return { col, row };
  }

  function handleBoardClick(x, y) {
    const cell = cellFromPoint(x, y);
    if (!cell) return;
    const plant = world.plantAt(cell.col, cell.row);
    if (plant) {
      // A planted tower is always selectable, even with a card picked: the
      // card is put away rather than planting on top of a tower.
      ui.selectedCard = -1;
      ui.selectedPlant = plant;
      audio.click();
      return;
    }
    // A pest under the cursor is zapped, even with a card picked: the pest
    // is on the path, where planting would be denied anyway, and the card
    // stays picked for the next click. A pest can never sit under a grass
    // cell's centre, so the zap can never steal a plant click.
    if (wardenZapTarget(world.state.pests, x, y)) {
      const events = world.zapAt(x, y);
      if (events & EVENT_WARDEN_ZAP) playEvents(events);
      else audio.denied();
      return;
    }
    if (ui.selectedCard >= 0) {
      const kinds = ['thorn', 'frost', 'sunspore', 'bramble', 'vine', 'spore'];
      const events = world.plant(kinds[ui.selectedCard], cell.col, cell.row);
      if (events & EVENT_PLANT) audio.plant();
      else audio.denied();
      return;
    }
    // An empty click moves the Warden: the wisp glides to the clicked cell
    // and the selected tower is put away.
    world.moveWarden(x, y);
    ui.selectedPlant = null;
  }

  function handlePlayClick(x, y) {
    for (let index = 0; index < LAYOUT.cards.length; index += 1) {
      if (inside(LAYOUT.cards[index], x, y)) {
        ui.selectedCard = ui.selectedCard === index ? -1 : index;
        ui.selectedPlant = null;
        audio.click();
        return;
      }
    }
    if (inside(LAYOUT.startButton, x, y)) {
      const events = world.startWave(true);
      if (events & EVENT_WAVE_START) playEvents(events);
      else audio.denied();
      return;
    }
    if (inside(LAYOUT.sunburstButton, x, y)) {
      const events = world.sunburst();
      if (events & EVENT_SUNBURST) playEvents(events);
      else audio.denied();
      return;
    }
    if (inside(LAYOUT.moonbeamButton, x, y)) {
      const events = world.moonbeam();
      if (events & EVENT_MOONBEAM) playEvents(events);
      else audio.denied();
      return;
    }
    if (inside(LAYOUT.speedButton, x, y)) {
      ui.speed = ui.speed === 1 ? 2 : 1;
      audio.click();
      return;
    }
    if (inside(LAYOUT.pauseButton, x, y)) {
      screen = SCREEN_PAUSED;
      audio.click();
      announce('Paused.');
      return;
    }
    if (inside(LAYOUT.muteButton, x, y)) {
      audio.toggleMute();
      audio.click();
      return;
    }
    if (ui.selectedPlant) {
      if (inside(LAYOUT.nourishButton, x, y)) {
        const events = world.nourish(ui.selectedPlant);
        if (events & EVENT_NOURISH) audio.nourish();
        else audio.denied();
        return;
      }
      if (inside(LAYOUT.sellButton, x, y)) {
        const events = world.sell(ui.selectedPlant);
        if (events & EVENT_SELL) {
          audio.sell();
          ui.selectedPlant = null;
        }
        return;
      }
    }
    handleBoardClick(x, y);
  }

  function handleClick(x, y) {
    audio.unlock();
    if (screen === SCREEN_TITLE) {
      if (inside(LAYOUT.titlePlay, x, y)) {
        audio.click();
        startGame();
      } else if (inside(LAYOUT.titleHow, x, y)) {
        audio.click();
        screen = SCREEN_HOWTO;
      } else if (inside(LAYOUT.titleGreenhouse, x, y)) {
        audio.click();
        records = readRecords();
        screen = SCREEN_GREENHOUSE;
        announce('The Greenhouse. Spend banked seeds on permanent upgrades.');
      } else {
        for (let index = 0; index < LAYOUT.titleDifficulties.length; index += 1) {
          if (inside(LAYOUT.titleDifficulties[index], x, y)) {
            ui.difficulty = DIFFICULTIES[index].id;
            audio.click();
            announce(`${DIFFICULTIES[index].name} grove selected.`);
            return;
          }
        }
      }
      return;
    }
    if (screen === SCREEN_HOWTO) {
      if (inside(LAYOUT.howBack, x, y)) {
        audio.click();
        screen = SCREEN_TITLE;
      }
      return;
    }
    if (screen === SCREEN_GREENHOUSE) {
      for (let index = 0; index < LAYOUT.greenhouseCards.length; index += 1) {
        if (inside(LAYOUT.greenhouseCards[index], x, y)) {
          const upgrade = UPGRADES[index];
          const result = growUpgrade(records.greenhouse ?? [], upgrade.id, records.seeds ?? 0);
          if (result.ok) {
            writeGreenhouse(result.grown);
            spendSeeds((records.seeds ?? 0) - result.seeds);
            records = readRecords();
            audio.greenhouse();
            announce(`${upgrade.name} grown. ${records.seeds} seeds left.`);
          } else {
            audio.denied();
          }
          return;
        }
      }
      if (inside(LAYOUT.greenhouseBack, x, y)) {
        audio.click();
        screen = SCREEN_TITLE;
      }
      return;
    }
    if (screen === SCREEN_PLAY) {
      handlePlayClick(x, y);
      return;
    }
    if (screen === SCREEN_DRAFT) {
      for (let index = 0; index < LAYOUT.draftCards.length; index += 1) {
        if (inside(LAYOUT.draftCards[index], x, y)) {
          if (pickDraftCard(index)) audio.click();
          return;
        }
      }
      if (inside(LAYOUT.draftReroll, x, y)) {
        const events = world.rerollDraft();
        if (events & EVENT_REROLL) audio.reroll();
        else audio.denied();
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (inside(LAYOUT.pauseButton, x, y)) {
        screen = SCREEN_PLAY;
        audio.click();
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_VICTORY) {
      if (inside(LAYOUT.victoryAgain, x, y)) {
        audio.click();
        startGame();
      } else if (inside(LAYOUT.victoryEndless, x, y)) {
        audio.click();
        world.startEndless();
        screen = SCREEN_PLAY;
        showBanner('ENDLESS MODE', 'The waves never stop now.', 2.4);
        announce('Endless mode.');
      } else if (inside(LAYOUT.victoryTitle, x, y)) {
        audio.click();
        backToTitle();
      }
      return;
    }
    if (screen === SCREEN_DEFEAT) {
      if (inside(LAYOUT.defeatAgain, x, y)) {
        audio.click();
        startGame();
      } else if (inside(LAYOUT.defeatTitle, x, y)) {
        audio.click();
        backToTitle();
      }
    }
  }

  function handleKeys() {
    const keys = input.takeKeys();
    const cardKey = input.takeCardKey();
    if (keys & (KEY_CONFIRM | KEY_PAUSE | KEY_SPEED | KEY_MUTE | KEY_ESCAPE | KEY_SUNBURST | KEY_REROLL | KEY_MOONBEAM | KEY_GREENHOUSE)) audio.unlock();
    if (keys & KEY_SUNBURST && screen === SCREEN_PLAY) {
      const events = world.sunburst();
      if (events & EVENT_SUNBURST) playEvents(events);
      else if (events & EVENT_DENIED) audio.denied();
    }
    if (keys & KEY_MOONBEAM && screen === SCREEN_PLAY) {
      const events = world.moonbeam();
      if (events & EVENT_MOONBEAM) playEvents(events);
      else if (events & EVENT_DENIED) audio.denied();
    }
    if (keys & KEY_GREENHOUSE) {
      if (screen === SCREEN_TITLE || screen === SCREEN_VICTORY || screen === SCREEN_DEFEAT) {
        records = readRecords();
        screen = SCREEN_GREENHOUSE;
        announce('The Greenhouse. Spend banked seeds on permanent upgrades.');
      } else if (screen === SCREEN_GREENHOUSE) {
        screen = SCREEN_TITLE;
      }
    }
    if (keys & KEY_REROLL && screen === SCREEN_DRAFT) {
      const events = world.rerollDraft();
      if (events & EVENT_REROLL) audio.reroll();
      else audio.denied();
    }
    // R on an end screen replays the run that just ended, seed and all.
    if (keys & KEY_REROLL && (screen === SCREEN_VICTORY || screen === SCREEN_DEFEAT)) {
      audio.click();
      replaySeed();
    }
    if (cardKey >= 0 && screen === SCREEN_PLAY) {
      ui.selectedCard = ui.selectedCard === cardKey ? -1 : cardKey;
      ui.selectedPlant = null;
      audio.click();
    }
    if (cardKey >= 0 && cardKey < 3 && screen === SCREEN_DRAFT) {
      if (pickDraftCard(cardKey)) audio.click();
    }
    if (keys & KEY_MUTE) audio.toggleMute();
    if (keys & KEY_SPEED && screen === SCREEN_PLAY) {
      ui.speed = ui.speed === 1 ? 2 : 1;
      audio.click();
    }
    if (keys & KEY_ESCAPE) {
      if (screen === SCREEN_HOWTO) screen = SCREEN_TITLE;
      else if (screen === SCREEN_GREENHOUSE) screen = SCREEN_TITLE;
      else if (screen === SCREEN_PLAY) {
        ui.selectedCard = -1;
        ui.selectedPlant = null;
      }
    }
    if (keys & KEY_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (keys & KEY_CONFIRM) {
      if (screen === SCREEN_TITLE) startGame();
      else if (screen === SCREEN_HOWTO) screen = SCREEN_TITLE;
      else if (screen === SCREEN_GREENHOUSE) screen = SCREEN_TITLE;
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
      else if (screen === SCREEN_VICTORY || screen === SCREEN_DEFEAT) startGame();
      else if (screen === SCREEN_PLAY) {
        const events = world.startWave(true);
        if (events & EVENT_WAVE_START) playEvents(events);
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE || screen === SCREEN_HOWTO || screen === SCREEN_GREENHOUSE) {
      ambientTimer -= STEP;
      if (ambientTimer <= 0) {
        ambientTimer += AMBIENT_SECONDS;
        if (world.state.pests.length < 4) {
          world.spawnAmbient(world.state.pests.length % 3 === 0 ? 'moth' : 'aphid');
        }
      }
      world.step(STEP, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, false);
    playEvents(events);
    if (ui.selectedPlant && !world.state.plants.includes(ui.selectedPlant)) ui.selectedPlant = null;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME) * ui.speed;
    last = now;
    for (const click of input.takeClicks()) handleClick(click.x, click.y);
    handleKeys();
    if (screen === SCREEN_TITLE || screen === SCREEN_HOWTO || screen === SCREEN_GREENHOUSE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_HOWTO || screen === SCREEN_GREENHOUSE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, ui, screen, records);
  }

  // Leaving the tab pauses a running game rather than letting pests walk unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A handle for scripted playtests: read the world, never write through it.
  window.__seedwarden = {
    world,
    screen: () => screen,
    records: () => records,
    ui: () => ({ selectedCard: ui.selectedCard, speed: ui.speed, difficulty: ui.difficulty, seed: ui.seed }),
  };

  world.demoGarden();
  announce('Seedwarden. Plant living towers and hold the grove. Press Space or click Play to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
