/**
 * Reference frames for the forge test: draws every clip frame of a few
 * builds with the web game's rasterizer, the way bank.ts does, and writes
 * them as JSON lines (`npx tsx ../ref/dump.ts OUT_DIR` from tools/ts2gd).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_LOOK } from '../../../src/character/appearance';
import type { CharacterBuild } from '../../../src/sim/loadout';
import { Raster } from '../../../src/render/pixel/raster';
import { drawFigure } from '../../../src/render/sprite/draw';
import { makeArt } from '../../../src/render/sprite/look';
import { clipLength, clipsFor, frameSpec } from '../../../src/render/sprite/anims';
import { SKINS, SKIN_SETS, setPieces } from '../../../src/character/skins';
import { GEAR } from '../../../src/sim/gear';
import type { GearSet } from '../../../src/sim/types';

export const BUILDS: CharacterBuild[] = [
  { name: 'a', form: 'balanced', look: { ...DEFAULT_LOOK, species: 'human' },
    gear: { main: 'longsword', secondary: 'kite_shield', chest: 'plate_armor', boots: 'leather_boots', head: 'duelist_band' } },
  { name: 'b', form: 'mighty', look: { ...DEFAULT_LOOK, species: 'ogrin', hairColor: 3 },
    gear: { main: 'warhammer', secondary: 'parrying_dagger', chest: 'thornmail', boots: 'iron_greaves' } },
  { name: 'c', form: 'ethereal', look: { ...DEFAULT_LOOK, species: 'wisp', hairColor: 5 },
    gear: { main: 'arcane_staff', secondary: 'war_horn', chest: 'mage_robe', head: 'chrono_circlet' } },
];

// ALL=1: every skin set and every item skin, a sample of frames each.
const ALL = process.env.ALL === '1';
const slotOf = new Map<string, string>();
for (const [slot, items] of Object.entries(GEAR)) for (const id of Object.keys(items)) slotOf.set(id, slot);
const base = BUILDS[0];
if (ALL) {
  for (const set of SKIN_SETS) {
    const gear: Record<string, string> = { ...base.gear };
    const skins: Record<string, string> = {};
    for (const p of setPieces(set.id)) { gear[slotOf.get(p.gear)!] = p.gear; skins[p.gear] = p.id; }
    BUILDS.push({ ...base, name: set.id, gear: gear as GearSet, skins });
  }
  // Loose skins, one per slot per build.
  const bySlot = new Map<string, typeof SKINS[number][]>();
  for (const s of SKINS) if (!s.set) { const k = slotOf.get(s.gear)!; bySlot.set(k, [...(bySlot.get(k) ?? []), s]); }
  const n = Math.max(...[...bySlot.values()].map((v) => v.length));
  for (let i = 0; i < n; i++) {
    const gear: Record<string, string> = { ...base.gear };
    const skins: Record<string, string> = {};
    for (const [slot, list] of bySlot) { const s = list[i]; if (!s) continue; gear[slot] = s.gear; skins[s.gear] = s.id; }
    BUILDS.push({ ...base, name: `skins${i}`, gear: gear as GearSet, skins });
  }
}

const OX = 88, OY = 126;
const out = process.argv[2] ?? '/tmp/forge-ref';
mkdirSync(out, { recursive: true });
const b64 = (a: Uint32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');

BUILDS.forEach((build, bi) => {
  const art = makeArt(build);
  const set = clipsFor(art);
  const r = new Raster(176, 150);
  const lines: string[] = [JSON.stringify({ build })];
  for (const [clip, c] of set.clips) {
    for (let i = 0; i < clipLength(c); i++) {
      if (ALL && bi >= 3 && clip !== 'idle' && i % 4 !== 1) continue;
      r.clear();
      r.phase = clip === 'idle' ? Math.floor((i * 4) / Math.max(4, c.w.length)) : i;
      drawFigure(r, art, frameSpec(c, i, null, false), OX, OY);
      const f = r.compose(OX, OY, true, true);
      lines.push(JSON.stringify({ clip, frame: i, w: f.w, h: f.h, ox: f.ox, oy: f.oy, data: b64(f.data), glow: f.glow ? b64(f.glow) : null, sparks: f.sparks ?? [] }));
    }
  }
  writeFileSync(`${out}/build${bi}.jsonl`, lines.join('\n') + '\n');
  console.log(`build ${bi}: ${lines.length - 1} frames`);
});
