# SEEDWARDEN

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/adityapramana24-creator/seedwarden/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/adityapramana24-creator/seedwarden/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A garden tower defense for make.fun's `best-game-01` bounty: plant living
towers, grow them through four seasons, and hold the Heart Tree through twenty
waves of pests. It runs in a desktop browser from static files, offline, with
keyboard and mouse — no build step, no network request, no sound files (all
sound is synthesized with the Web Audio API).

## The game

Pests walk a serpentine soil path from the west gate to the Heart Tree. If the
tree's ten hearts run out, the grove falls. Six plants defend it:

- **Thornspitter** (50☀) — steady thorns, one pest at a time.
- **Frostbloom** (75☀) — chills pests in place, slowing the swarm.
- **Sunspore** (60☀) — grows sunlight; no thorns at all.
- **Brambleburst** (100☀) — exploding brambles splash the whole pack.
- **Vinewhip** (120☀) — lashes fast at close range.
- **Sporecloud** (150☀) — poison spores linger, draining whole groups.

Every plant is planted as a seed and grows through three visible stages —
seed, sprout, bloom — gaining damage and range as it grows. A bloomed plant can
be nourished once (+50% damage) or sold back for most of its price.

The year turns as you play, five waves a season: **spring** grows plants twice
as fast, **summer** adds +25% damage, **autumn** pays +50% sunlight per kill,
and **winter** slows the pests down but makes them tougher and halves growth.
Five pests march the path — aphids, moths, beetles, regenerating slugs — and on
wave 20, the Blight itself, spawning aphids as it crawls. Clear all twenty
waves to win, then keep going in endless mode.

## How to play

Click a plant card (or press 1–6), then click a grass cell to plant it. Click
a planted tower to nourish or sell it. Press Space (or the START WAVE button)
to call the next wave early for a sunlight bonus.

- **1–6** pick a plant · **click** plant / select · **Space** start wave
- **F** speed 1×/2× · **P** pause · **M** mute · **Esc** cancel / back

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Layout

- `game/` — the game itself: `index.html` plus ES modules in `src/`
  (`config`, `world`, `plants`, `pests`, `waves`, `seasons`, `economy`,
  `input`, `audio`, `render`, `shots`, `main`). No library, no assets.
- `screenshots/` — four real renders of the game's own code, staged by
  `game/src/shots.js` from `shots.json` (the cover is the mid-game frame).
- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the vendored make.fun library.
- `vendor/makefun-game.ts` — the kit's copy, unchanged.

---

<sub>Entered on [make.fun](https://make.fun/?ref=5435dmkf&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
