import { it } from 'vitest';
import { BACKDROPS } from '../src/character/appearance';
import { BH, BW, paintBackdrop } from '../src/render/backdrops';
import { writePng } from './png';

/** Dev preview: every portrait backdrop in a sheet (`OUT=... SCALE=4`). */
it('backdrops sheet', () => {
  const cols = 6, gap = 2, n = BACKDROPS.length, rows = Math.ceil(n / cols);
  const W = cols * (BW + gap) - gap, H = rows * (BH + gap) - gap;
  const out = new Uint32Array(W * H);
  for (let i = 0; i < n; i++) {
    const px = new Uint32Array(paintBackdrop(i).buffer), ox = (i % cols) * (BW + gap), oy = Math.floor(i / cols) * (BH + gap);
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) out[(oy + y) * W + ox + x] = px[y * BW + x];
  }
  writePng(process.env.OUT ?? '/tmp/backdrops.png', W, H, out, Number(process.env.SCALE ?? 4));
});
