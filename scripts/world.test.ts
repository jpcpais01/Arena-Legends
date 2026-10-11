import { it } from 'vitest';
import { paintSunhaven } from '../src/render/worldArt';
import { Pix } from '../src/render/pixel/paint';
import { writePng } from './png';

/** Dev preview of the region map: `OUT=x.png SCALE=1 CROP=x,y,w,h WAVES=1 npx vitest run --config vitest.scripts.config.ts scripts/world.test.ts`. */
it('world map preview', () => {
  const t0 = performance.now();
  const a = paintSunhaven();
  console.log('painted in', Math.round(performance.now() - t0), 'ms');
  const full = new Pix(a.w, a.h);
  full.blit(a.base, 0, 0);
  if (process.env.WAVES) full.blit(a.waves, 0, 0);
  full.blit(a.isle, a.isleAt.x, a.isleAt.y);
  const [cx, cy, cw, ch] = (process.env.CROP ?? `0,0,${a.w},${a.h}`).split(',').map(Number);
  const out = new Pix(cw, ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out.data[y * cw + x] = full.get(cx + x, cy + y);
  writePng(process.env.OUT ?? '/tmp/world.png', cw, ch, out.data, Number(process.env.SCALE ?? 1));
});
