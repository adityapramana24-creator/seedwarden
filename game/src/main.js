// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (twice as many at 2x speed), and the renderer paints what is
// there. The game moves between six screens: title, how to play, play, paused,
// victory and defeat.
//
// ?seed=N fixes the random pattern. ?shot=start|play|victory|defeat (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { BEST_KEY, BOARD, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_GROW, EVENT_HARVEST, EVENT_KILL, EVENT_LEAK, EVENT_NOURISH, EVENT_OVER,
  EVENT_PLANT, EVENT_SELL, EVENT_SHOOT, EVENT_WAVE_CLEAR, EVENT_WAVE_START, EVENT_WIN,
  createWorld,
} from './world.js';
import { KEY_CONFIRM, KEY_ESCAPE, KEY_MUTE, KEY_PAUSE, KEY_SPEED, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  LAYOUT, SCREEN_DEFEAT, SCREEN_HOWTO, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  SCREEN_VICTORY, createRenderer, inside,
} from './render.js';
import { seasonForWave } from './seasons.js';
import { stageShot } from './shots.js';

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

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  // What the staging actually produced, for the screenshot harness to check.
  window.__shot = {
    name,
    screen: scene.screen,
    wave: world.state.wave,
    score: world.state.score,
    hearts: world.state.hearts,
    plants: world.state.plants.length,
    pests: world.state.pests.length,
    won: world.state.won,
    over: world.state.over,
  };
  const ui = {
    hover: { x: -1, y: -1, inside: false },
    selectedCard: -1,
    selectedPlant: null,
    speed: 1,
    muted: false,
    banner: null,
    preview: world.preview(),
    pestsLeft: world.pestsLeft(),
    pestsTotal: world.pestsTotal(),
    canPlant: () => false,
  };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, ui, scene.screen, scene.best);
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
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let ambientTimer = 0;

  const ui = {
    selectedCard: -1,
    selectedPlant: null,
    speed: 1,
    banner: null,
    get muted() {
      return audio.muted();
    },
    get hover() {
      return input.hover();
    },
    get preview() {
      return world.preview();
    },
    get pestsLeft() {
      return world.pestsLeft();
    },
    get pestsTotal() {
      return world.pestsTotal();
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

  function startGame() {
    world.reset();
    ui.selectedCard = -1;
    ui.selectedPlant = null;
    ui.banner = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Plant your first tower, then start wave 1.');
  }

  function endGame(victory) {
    screen = victory ? SCREEN_VICTORY : SCREEN_DEFEAT;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(victory
      ? `Victory! The grove holds. Score ${world.state.score}.`
      : `Defeat on wave ${world.state.wave}. Score ${world.state.score}.`);
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
      const season = seasonForWave(world.state.wave);
      showBanner(`WAVE ${world.state.wave}`, `${season.glyph} ${season.name} — ${season.tagline}`, 2.4);
      announce(`Wave ${world.state.wave}. ${season.name}.`);
    }
    if (events & EVENT_WAVE_CLEAR) audio.waveClear();
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
    if (ui.selectedCard >= 0) {
      const kinds = ['thorn', 'frost', 'sunspore', 'bramble', 'vine', 'spore'];
      const events = world.plant(kinds[ui.selectedCard], cell.col, cell.row);
      if (events & EVENT_PLANT) audio.plant();
      else audio.denied();
      return;
    }
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
    if (screen === SCREEN_PLAY) {
      handlePlayClick(x, y);
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
      }
      return;
    }
    if (screen === SCREEN_DEFEAT) {
      if (inside(LAYOUT.defeatAgain, x, y)) {
        audio.click();
        startGame();
      }
    }
  }

  function handleKeys() {
    const keys = input.takeKeys();
    const cardKey = input.takeCardKey();
    if (keys & (KEY_CONFIRM | KEY_PAUSE | KEY_SPEED | KEY_MUTE | KEY_ESCAPE)) audio.unlock();
    if (cardKey >= 0 && screen === SCREEN_PLAY) {
      ui.selectedCard = ui.selectedCard === cardKey ? -1 : cardKey;
      ui.selectedPlant = null;
      audio.click();
    }
    if (keys & KEY_MUTE) audio.toggleMute();
    if (keys & KEY_SPEED && screen === SCREEN_PLAY) {
      ui.speed = ui.speed === 1 ? 2 : 1;
      audio.click();
    }
    if (keys & KEY_ESCAPE) {
      if (screen === SCREEN_HOWTO) screen = SCREEN_TITLE;
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
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
      else if (screen === SCREEN_VICTORY || screen === SCREEN_DEFEAT) startGame();
      else if (screen === SCREEN_PLAY) {
        const events = world.startWave(true);
        if (events & EVENT_WAVE_START) playEvents(events);
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE || screen === SCREEN_HOWTO) {
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
    if (screen === SCREEN_TITLE || screen === SCREEN_HOWTO || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_HOWTO || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, ui, screen, best);
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
    ui: () => ({ selectedCard: ui.selectedCard, speed: ui.speed }),
  };

  world.demoGarden();
  announce('Seedwarden. Plant living towers and hold the grove. Press Space or click Play to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
