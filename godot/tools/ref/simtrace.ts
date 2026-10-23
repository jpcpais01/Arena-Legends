/**
 * Sim reference traces: runs battles with the web game's sim and writes a
 * state trace every 10 ticks (`npx tsx ../ref/simtrace.ts OUT.json`).
 */
import { writeFileSync } from 'node:fs';
import { Battle } from '../../../src/sim/battle';
import { DT, MATCH_TIME } from '../../../src/sim/constants';
import { DEFAULT_BUILDS, randomBuild } from '../../../src/sim/loadout';
import { Rng } from '../../../src/core/rng';

// Godot's JSON parser can be 1 ulp off on 17-digit numbers: floats go as their IEEE bits.
const exact = (_k: string, v: unknown) => typeof v === 'number' && !Number.isInteger(v) ? 'f:' + Buffer.from(new Float64Array([v]).buffer).toString('hex') : v;

const out = process.argv[2] ?? '/tmp/simtrace.json';
const rng = new Rng(77);
const pairs = [
  [DEFAULT_BUILDS[0], DEFAULT_BUILDS[1]],
  [DEFAULT_BUILDS[1], DEFAULT_BUILDS[2] ?? DEFAULT_BUILDS[0]],
  ...Array.from({ length: 6 }, () => [randomBuild(rng), randomBuild(rng)]),
];
const runs = pairs.map((p, i) => {
  const seed = 1000 + i * 7919;
  const b = new Battle({ seed, fighters: [{ ...p[0] }, { ...p[1] }] });
  const trace: number[][] = [];
  const maxSteps = Math.ceil((MATCH_TIME + 30) / DT);
  const t0 = performance.now();
  for (let k = 0; k < maxSteps && !b.over; k++) {
    b.step();
    b.events.length = 0;
    if (b.tick % 10 === 0) {
      const row: number[] = [b.tick];
      for (const f of b.fighters) row.push(f.hp, f.energy, f.x, f.y, f.vx, f.action?.ability ?? -1, f.statuses.length);
      trace.push(row);
    }
  }
  const ms = performance.now() - t0;
  console.log(`run ${i}: ${b.tick} ticks, winner ${b.winner}, ${(ms * 1000 / b.tick).toFixed(1)} us/tick`);
  return { seed, builds: p, ticks: b.tick, winner: b.winner, trace };
});
writeFileSync(out, JSON.stringify(runs, exact));
