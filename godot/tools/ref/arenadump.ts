/**
 * Arena reference: paints an arena's layers with the web code and writes
 * them as raw RGBA (`npx tsx ../ref/arenadump.ts OUT_DIR ARENA`), for
 * comparing with test/arena_dump.gd.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildArena, THEMES } from '../../../src/render/arenaArt';

const [out = '/tmp/arena-ref', id = 'isle'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const theme = THEMES.find((t) => t.id === id)!;
const t0 = performance.now();
const art = buildArena(theme, 800, 360, 260, 300);
console.log(`built in ${(performance.now() - t0).toFixed(0)} ms`);
const dump = (name: string, p: { w: number; h: number; data: Uint32Array }) => {
  writeFileSync(`${out}/${name}.rgba`, Buffer.from(p.data.buffer, p.data.byteOffset, p.w * p.h * 4));
  console.log(`${name}: ${p.w}x${p.h}`);
};
art.layers.forEach((l, i) => dump(`layer${i}`, l.pix));
dump('floor', art.floor);
