import { it } from 'vitest';
import { setPieces, type SkinSetId } from '../src/character/skins';
import { iconFrame } from '../src/render/icons';
import { pack } from '../src/render/pixel/color';
import { Raster, type Material } from '../src/render/pixel/raster';
import { clipLength, clipsFor, frameSpec } from '../src/render/sprite/anims';
import { drawFigure } from '../src/render/sprite/draw';
import { makeArt } from '../src/render/sprite/look';
import { SKIN_ART } from '../src/render/sprite/skins';
import { Xf } from '../src/render/sprite/xform';
import { drawSetAura } from '../src/render/setAura';
import { gearOf } from '../src/sim/gear';
import { DEFAULT_BUILDS, type CharacterBuild } from '../src/sim/loadout';
import type { GearSet } from '../src/sim/types';
import { Sheet, writePng } from './png';

/**
 * Dev contact sheet for one epic set:
 * `SET=seraph OUT=/tmp/seraph.png npx vitest run --config vitest.scripts.config.ts scripts/setsheet.test.ts`
 * Rows: the full set on two bodies (idle loop with the aura, then moves), each piece alone,
 * icons (plain, then skinned), and the set's battle sprites.
 */

/** Just enough of a 2D context for the aura drawers (fillStyle, globalAlpha, fillRect). */
function fakeCtx(sheet: Sheet): CanvasRenderingContext2D {
  let rgb = [0, 0, 0], a0 = 1;
  const ctx = {
    globalAlpha: 1,
    set fillStyle(v: string) {
      const m = v.match(/[\d.]+/g)!.map(Number);
      rgb = m.slice(0, 3); a0 = m[3] ?? 1;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const a = Math.max(0, Math.min(1, a0 * ctx.globalAlpha));
      for (let yy = Math.round(y); yy < Math.round(y + h); yy++) for (let xx = Math.round(x); xx < Math.round(x + w); xx++) {
        if (xx < 0 || yy < 0 || xx >= sheet.w || yy >= sheet.h) continue;
        const i = yy * sheet.w + xx, c = sheet.data[i];
        const r = (c & 255) * (1 - a) + rgb[0] * a, g = ((c >>> 8) & 255) * (1 - a) + rgb[1] * a, b = ((c >>> 16) & 255) * (1 - a) + rgb[2] * a;
        sheet.data[i] = (0xff << 24 | Math.round(b) << 16 | Math.round(g) << 8 | Math.round(r)) >>> 0;
      }
    },
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

it('set contact sheet', () => {
  const set = (process.env.SET ?? 'voidborn') as SkinSetId;
  const pieces = setPieces(set);
  const full = (base: CharacterBuild): CharacterBuild => {
    const gear = { ...base.gear } as Record<string, string>;
    const skins: Record<string, string> = {};
    for (const p of pieces) { gear[gearOf(p.gear).slot] = p.gear; skins[p.gear] = p.id; }
    return { ...base, gear: gear as GearSet, skins };
  };
  const cw = 90, ch = 92;
  const W = cw * 10, H = ch * 5 + 60;
  const sheet = new Sheet(W, H, pack(0x5a6a7a));
  const g = fakeCtx(sheet);
  const r = new Raster(176, 150);
  const put = (build: CharacterBuild, clip: string, i: number, cx: number, cy: number, aura: boolean) => {
    const art = makeArt(build);
    const c = clipsFor(art).clips.get(clip);
    if (!c) return;
    if (aura && art.set) drawSetAura(g, art.set, cx, cy, i * 0.25, 'back');
    r.clear();
    r.phase = i % 4;
    drawFigure(r, art, frameSpec(c, i % clipLength(c), null, false), 88, 126);
    const f = r.compose(88, 126);
    sheet.blit(f.data, f.w, f.h, cx - f.ox, cy - f.oy);
    if (aura && art.set) drawSetAura(g, art.set, cx, cy, i * 0.25, 'front');
  };
  // Row 0 and 1: the full set, idle loop with aura, then the first frame of the moves.
  [0, 1].forEach((b) => {
    const build = full(DEFAULT_BUILDS[b]);
    const art = makeArt(build);
    const clips = [...clipsFor(art).clips.keys()].filter((k) => !['idle', 'ko', 'run', 'back', 'stop', 'stopB', 'land', 'hurt', 'stun', 'air'].includes(k));
    for (let i = 0; i < 4; i++) put(build, 'idle', i, cw * i + cw / 2, ch * (b + 1) - 8, true);
    clips.slice(0, 6).forEach((k, j) => {
      const c = clipsFor(art).clips.get(k)!;
      put(build, k, Math.floor(clipLength(c) / 2), cw * (4 + j) + cw / 2, ch * (b + 1) - 8, false);
    });
  });
  // Row 2: each piece alone on a plain fighter (the shield swapped out so the chest shows).
  pieces.forEach((p, j) => {
    const base = DEFAULT_BUILDS[0];
    const def = gearOf(p.gear);
    const gear = { ...base.gear, secondary: 'throwing_knives', [def.slot]: p.gear } as GearSet;
    put({ ...base, gear, skins: { [p.gear]: p.id } }, 'idle', 0, cw * j + cw / 2, ch * 3 - 8, false);
  });
  // Row 3: icons, plain then skinned.
  pieces.forEach((p, j) => {
    for (const [k, skin] of [[0, null], [1, p.id]] as const) {
      const f = iconFrame(p.gear, skin);
      sheet.blit(f.data, f.w, f.h, j * 2 * 46 + k * 46 + 2, ch * 3 + 4);
    }
  });
  // Row 4: battle sprites the set reshapes, every frame.
  let x = 4;
  for (const p of pieces) {
    for (const [id, art] of Object.entries(SKIN_ART[p.id]?.proj ?? {})) {
      if (!art) continue;
      for (let f = 0; f < art.frames; f++) {
        const pr = new Raster(80, 80);
        const mats = new Map<Material, number>();
        const h = (m: Material) => { let k = mats.get(m); if (!k) { k = pr.add(m); mats.set(m, k); } return k; };
        art.draw(pr, new Xf(40, 40, 0), f, h);
        const fr = pr.compose(40, 40, art.outline ?? false);
        sheet.blit(fr.data, fr.w, fr.h, x, ch * 4 + 6);
        x += fr.w + 3;
      }
      void id;
      x += 8;
    }
  }
  writePng(process.env.OUT ?? `/tmp/${set}.png`, sheet.w, sheet.h, sheet.data, Number(process.env.SCALE ?? 3));
});
