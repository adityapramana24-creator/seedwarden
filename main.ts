// SEEDWARDEN's entry program (Node 22, standard library only): the game is this
// directory's game/ folder — plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library and no network request) — and
// this program hands it in. It copies game/ and screenshots/ from beside this
// file to /output and writes /output/dossier.json, the summary the judge reads,
// with the vendored make.fun library.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// v2: the seasons are drafted, not fixed — game/src/draft.js offers three
// season cards after every fifth wave, and each pick grants a permanent Grove
// Blessing (game/src/blessings.js). Kills close together build a combo and a
// letter grade (game/src/combo.js); best scores and furthest waves are kept in
// localStorage (game/src/records.js).
// v3: the Blight fights in three phases, the warden answers with a Sunburst (Q), and three groves, two champions and five feats join the draft (game/src/difficulty.js, game/src/feats.js).
// v4: the grove is the Moonlit Grove — a midnight garden of bioluminescent plants under a full moon, Gloomcap walks wave 5 as the third champion, and the panel forecasts the next three waves (game/src/render.js, game/src/waves.js).
// v5: the Moonbeam answers kills with moonlight (W), the Greenhouse spends banked seeds on nine permanent upgrades (G), the four seasons are named groves, and the title shows the year's twenty-wave path (game/src/moonbeam.js, game/src/greenhouse.js).
// v6: the Warden is yours to move — a guardian wisp whose aura strengthens nearby plants and whose zap strikes one pest (game/src/warden.js); blessings deepen to level 2, and the victory panel grades each five-wave grove block.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps: only text_max_bytes shapes the bytes; the others refuse
// an entry the scorer would refuse (more than 4 screenshots or one over 256 KiB;
// more than 993 files in game/ or 48 MiB of game files in all, or a path under
// game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
