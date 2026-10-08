import { it } from 'vitest';
import { buildArena, floorRow, THEMES } from '../src/render/arenaArt';
import { Pix } from '../src/render/pixel/paint';
import { writePng } from './png';

/** Dev preview: an arena composed at a camera position (`THEME=0 CAM=0 OUT=...`). */
it('arena preview', () => {
  const W = 560, H = 315, gy = H - 56, travel = 130;
  const th = THEMES[Number(process.env.THEME ?? 0)];
  const a = buildArena(th, W, gy, travel);
  const cam = Number(process.env.CAM ?? 0);
  const out = new Pix(W, H);
  for (const l of [...a.layers, a.crowdLayer]) {
    const ox = Math.round(-(l.pix.w - W) / 2 - cam * l.factor);
    out.blit(l.pix, ox, l.y);
  }
  for (let y = a.floorTop; y < H; y++) {
    const { s, v } = floorRow(a, y);
    for (let x = 0; x < W; x++) {
      const u = Math.floor(a.floor.w / 2 + cam + (x - W / 2) / s);
      out.data[y * W + x] = a.floor.get(u, v);
    }
  }
  for (const sx of [-1, 1]) out.blit(a.pillar, Math.round(W / 2 + sx * 9.6 * 32 - cam - a.pillar.w / 2), gy - a.pillar.h);
  writePng(process.env.OUT ?? '/tmp/arena.png', W, H, out.data, 2);
});
