import { it } from 'vitest';
import { randomAppearance, SPECIES_IDS, type Appearance } from '../src/character/appearance';
import { Rng } from '../src/core/rng';
import { FORM_IDS } from '../src/sim/forms';
import { gearIdsFor } from '../src/sim/gear';
import type { CharacterBuild } from '../src/sim/loadout';
import { Raster } from '../src/render/pixel/raster';
import { pack } from '../src/render/pixel/color';
import { drawFigure, type FrameSpec } from '../src/render/sprite/draw';
import { makeArt } from '../src/render/sprite/look';
import { STAND } from '../src/render/sprite/pose';
import { Sheet, writePng } from './png';

const OUT = process.env.OUT ?? '/tmp/preview.png';

/** Dev preview: renders a lineup of characters to a PNG (`OUT=... npx vitest run --config vitest.scripts.config.ts scripts/preview.test.ts`). */
it('character lineup', () => {
  const rng = new Rng(Number(process.env.SEED ?? 5));
  const cols = 6, rows = 3, cw = 96, ch = 96;
  const sheet = new Sheet(cols * cw, rows * ch, pack(0x6a7a8a));
  const r = new Raster(128, 112);
  const mains = gearIdsFor('main');
  for (let i = 0; i < cols * rows; i++) {
    const look: Appearance = { ...randomAppearance(() => rng.next()), species: SPECIES_IDS[i % SPECIES_IDS.length], hair: i % 6 };
    const gear: CharacterBuild['gear'] = { main: mains[i % mains.length] };
    for (const s of ['secondary', 'special', 'head', 'chest', 'boots'] as const) {
      if (rng.next() < 0.75) (gear as Record<string, string>)[s] = rng.pick(gearIdsFor(s));
    }
    const build: CharacterBuild = { name: 'x', form: FORM_IDS[(i >> 1) % FORM_IDS.length], gear, look };
    const art = makeArt(build);
    r.clear();
    const spec: FrameSpec = { pose: STAND, hold: { main: 'hand', sec: 'stowed' }, face: 'calm' };
    drawFigure(r, art, spec, 64, 100);
    const f = r.compose(64, 100);
    const cx = (i % cols) * cw + cw / 2, cy = Math.floor(i / cols) * ch + ch - 8;
    sheet.blit(f.data, f.w, f.h, cx - f.ox, cy - f.oy);
  }
  writePng(OUT, sheet.w, sheet.h, sheet.data, 3);
});
