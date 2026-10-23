/** Full fighter state for the first ticks of one battle (debugging sim divergence). */
import { writeFileSync } from 'node:fs';
import { Battle } from '../../../src/sim/battle';
import { DEFAULT_BUILDS } from '../../../src/sim/loadout';

// Godot's JSON parser can be 1 ulp off on 17-digit numbers: floats go as their IEEE bits.
const exact = (_k: string, v: unknown) => typeof v === 'number' && !Number.isInteger(v) ? 'f:' + Buffer.from(new Float64Array([v]).buffer).toString('hex') : v;

const ticks = Number(process.argv[3] ?? 30);
const b = new Battle({ seed: 1000, fighters: [{ ...DEFAULT_BUILDS[0] }, { ...DEFAULT_BUILDS[1] }] });
const SKIP = new Set(['abilities', 'has', 'base', 'gear', 'gearIds', 'look', 'skins', 'profile']);
const snap = () => JSON.parse(JSON.stringify({
  tick: b.tick, time: b.time, over: b.over, winner: b.winner,
  fighters: b.fighters.map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => !SKIP.has(k)))),
  projectiles: b.projectiles, zones: b.zones, rngState: (b.rng as unknown as { a: number; b: number; c: number; d: number }),
}));
const out: unknown[] = [snap()];
for (let i = 0; i < ticks; i++) { b.step(); b.events.length = 0; out.push(snap()); }
writeFileSync(process.argv[2] ?? '/tmp/simstate.json', JSON.stringify(out, exact));
