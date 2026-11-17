# SEEDWARDEN

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/adityapramana24-creator/seedwarden/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/adityapramana24-creator/seedwarden/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A garden tower defense for make.fun's `best-game-01` bounty: plant living
towers, **draft the seasons**, and hold the Heart Tree through twenty waves of
pests. It runs in a desktop browser from static files, offline, with keyboard
and mouse — no build step, no network request, no sound files (all sound is
synthesized with the Web Audio API).

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

You choose the seasons. The first five waves are always Bloom Spring; after
every fifth wave the game pauses and offers **three season cards** — eight in
all, from Stormspring (fast growth, quicker pests) to Frostfall (pests crawl,
plants hit softer) — and each pick grants a permanent **Grove Blessing**
(ten to collect: Thornward, Deeproots, Sunwell, Heartwood, and more). A
flawless season, with no leaks at all, earns a bonus blessing. Kills close
together build a **combo** (up to ×8 score) and a live **letter grade**
(S/A/B/C/D), shown in the HUD and big on the victory screen.

Eight pests march the path — aphids, moths, beetles, regenerating slugs — plus
three named champions: Gloomcap on wave 5, the Mire Warden on wave 10 and
Rotmother on wave 15. On wave 20 comes the Blight itself, a three-phase boss
that sheds an aphid swarm at half health and rages at a quarter. The warden
is not helpless: the **Sunburst** (Q, 150☀) blasts every pest on the field and
slows the survivors, and the **Moonbeam** (W) answers kills — every kill
charges moonlight, and at 100 the moon strikes the row thickest with pests.
Three groves set the stakes before the first wave — Seedling (200☀, 12
hearts), Warden (150☀, 10 hearts) and Thornstorm (120☀, 8 hearts, tougher
pests). Drafts can be rerolled for 25☀, and five **feats** (Untouched, Full
Bloom, Blight Slayer, Hoarder, Swift Season) are scored on the victory screen
with a next goal to chase. The side panel forecasts the three waves after the
next one, so the garden can be planned ahead. Clear all twenty waves to win,
then keep going in endless mode. Best scores, furthest waves and groves saved
are kept in localStorage, no network involved. A won year banks one **seed**
per feat earned that run, and the **Greenhouse** (G) spends banked seeds on
nine permanent upgrades — more hearts, harder thorns, richer soil — that last
every run after. The four seasons are four named groves (Dewmere Fen, Ember
Orchard, Amber Hollow, Frosthollow), and the title screen maps the year's
twenty waves from Gloomcap to the Blight; the victory screen charts the score
wave by wave from the run's own ledger and marks the path the year walked.

The grove is the **Moonlit Grove**: a midnight garden under a full moon, where
every plant is bioluminescent in its own colour — a spiky rose, an ice
crystal, a sunflower, a berry bush, a whipping vine and a glowcap — fireflies
drift over the beds, the Heart Tree glows like a second moon, and the Blight
hangs over the field like a rotting moon.

## How to play

Pick a grove on the title screen, then click a plant card (or press 1–6) and a
grass cell to plant it. Click a planted tower to nourish or sell it. Press
Space (or the START WAVE button) to call the next wave early for a sunlight
bonus. When a draft opens, click a season card (or press 1–3) to choose the
next five waves — or reroll the offer for 25☀. Press Q when the swarm closes
in to fire the Sunburst, or W when the moon is full to call the Moonbeam.
Press G on the title screen to open the Greenhouse and spend banked seeds.

- **1–6** pick a plant · **click** plant / select · **Space** start wave
- **Q** Sunburst (150☀) · **W** Moonbeam (100 moonlight) · **1–3** pick a season card (draft) · **R** reroll
- **G** Greenhouse · **F** speed 1×/2× · **P** pause · **M** mute · **Esc** cancel / back

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Layout

- `game/` — the game itself: `index.html` plus ES modules in `src/`
  (`config`, `world`, `plants`, `pests`, `waves`, `seasons`, `draft`,
  `blessings`, `combo`, `records`, `economy`, `input`, `audio`, `render`,
  `shots`, `main`, plus `difficulty` for the three groves, `feats` for
  the five victory feats, `night` for the moon and fireflies, `moonbeam`
  for the moonlight charge and the beam, and `greenhouse` for the nine
  permanent upgrades). No library, no assets.
- `screenshots/` — four real renders of the game's own code, staged by
  `game/src/shots.js` from `shots.json` (the cover is the wave-20 boss fight,
  frozen in phase 2 with the Sunburst ready and the Moonbeam in the air).
- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the vendored make.fun library.
- `vendor/makefun-game.ts` — the kit's copy, unchanged.

---

<sub>Entered on [make.fun](https://make.fun/?ref=5435dmkf&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
