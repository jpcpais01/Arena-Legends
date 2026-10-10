import { it } from 'vitest';
import { buildArena, floorRow, THEMES, type Layer } from '../src/render/arenaArt';
import { Pix } from '../src/render/pixel/paint';
import { writePng } from './png';

/** Dev preview: an arena composed at a camera position (`THEME=0 (isle) | 1 (astral) CAM=0 W=560 H=315 OUT=...`). */
it('arena preview', () => {
  const W = Number(process.env.W ?? 560), H = Number(process.env.H ?? 315);
  const gy = H > W ? Math.round(H * 0.6) : H - Math.max(44, Math.round(H * 0.17));
  const travel = Math.max(0, (9 + 1.8) * 32 - W / 2) + 12;
  const th = THEMES[Number(process.env.THEME ?? 0)];
  const a = buildArena(th, W, H, gy, travel);
  const cam = Number(process.env.CAM ?? 0);
  const out = new Pix(W, H);
  const layer = (l: Layer) => out.blit(l.pix, Math.round(-(l.pix.w - W) / 2 - cam * l.factor), l.y);
  const floaters = (front: boolean) => {
    for (const f of a.floaters) if (f.front === front) out.blit(f.pix, Math.round(f.x - cam * f.factor - f.pix.w / 2), Math.round(f.y));
  };
  for (const l of [...a.layers, a.crowdLayer]) { layer(l); if (l.after === 'floaters') floaters(false); }
  for (let y = a.floorTop; y < Math.min(H, a.floorEnd); y++) {
    const { s, v } = floorRow(a, y);
    for (let x = 0; x < W; x++) {
      const u = Math.floor(a.floor.w / 2 + cam + (x - W / 2) / s);
      const c = a.floor.get(u, v);
      if (c >>> 24) out.data[y * W + x] = c;
    }
  }
  for (const l of a.front) layer(l);
  floaters(true);
  for (const sx of [-1, 1]) {
    const px = Math.round(W / 2 + sx * 9.75 * 32 - cam - a.pillar.w / 2);
    out.blit(a.pillar, px, gy - a.pillar.h + 2);
    if (a.crystal) out.blit(a.crystal, px + ((a.pillar.w - a.crystal.w) >> 1), gy - a.pillar.h - a.crystal.h);
  }
  writePng(process.env.OUT ?? '/tmp/arena.png', W, H, out.data, 2);
});
