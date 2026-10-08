import { it } from 'vitest';
import { DEFAULT_LOOK } from '../src/character/appearance';
import { pack, mix } from '../src/render/pixel/color';
import { bayer } from '../src/render/pixel/paint';
import { Raster } from '../src/render/pixel/raster';
import { clipsFor, frameSpec } from '../src/render/sprite/anims';
import { drawFigure } from '../src/render/sprite/draw';
import { makeArt } from '../src/render/sprite/look';
import { Sheet, writePng } from './png';

/** Generates the PWA / home-screen icons in public/icons (`npx vitest run --config vitest.scripts.config.ts scripts/appicon.test.ts`). */
it('app icons', () => {
  const art = makeArt({
    name: 'x', form: 'balanced',
    gear: { main: 'longsword', secondary: 'kite_shield', chest: 'plate_armor', boots: 'leather_boots', head: 'duelist_band' },
    look: { ...DEFAULT_LOOK, species: 'kitsu' },
  });
  const c = clipsFor(art).clips.get('slash')!;
  const r = new Raster(160, 140);
  // The active frame of the slash, smear and all.
  drawFigure(r, art, frameSpec(c, c.draw.length + c.w.length, null, false), 80, 110);
  const f = r.compose(80, 110);

  const make = (size: number, scale: number, file: string, foot: number) => {
    const s = new Sheet(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      // Dusk sky: purple at the top to ember at the bottom, dithered bands.
      const t = y / size + (bayer(x, y) - 0.5) * 0.12;
      const col = t < 0.5 ? mix(0x2a1a44, 0x6a2a5a, t * 2) : mix(0x6a2a5a, 0xe0683a, (t - 0.5) * 2);
      s.data[y * size + x] = pack(col);
    }
    // Sun behind the fighter.
    const cx = size / 2, cy = size * 0.52, rad = size * 0.3;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < rad) s.data[y * size + x] = pack(d < rad - 2 ? 0xffc85a : 0xffe8a0);
    }
    // Ground strip.
    for (let y = foot + 1; y < size; y++) for (let x = 0; x < size; x++) s.data[y * size + x] = pack((x + y) & 1 && y === foot + 1 ? 0x3a2030 : 0x24141e);
    s.blit(f.data, f.w, f.h, Math.round(cx - 4) - f.ox, foot - f.oy);
    writePng(`public/icons/${file}`, size, size, s.data, scale);
  };
  make(64, 8, 'icon-512.png', 58);
  make(64, 3, 'icon-192.png', 58);
  make(90, 2, 'apple-touch-icon.png', 76);
  make(128, 4, 'icon-maskable-512.png', 98);
  make(32, 1, 'favicon-32.png', 31);
});
