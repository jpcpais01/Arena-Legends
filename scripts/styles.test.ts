import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { randomBuild } from '../src/sim/loadout';
import { runHeadless } from '../src/sim/headless';
import { FIGHT_STYLE_IDS } from '../src/sim/styles';

/**
 * Not a pass/fail test: each fighting style against a Balanced fighter with
 * the same random gear and form, mirrored on both sides (`npx vitest run
 * --config vitest.scripts.config.ts scripts/styles.test.ts`). Styles should
 * play differently (time, breathers, parries) without a clear winner.
 */
it('fighting style report', () => {
  const N = Number(process.env.SIM_N ?? 80);
  const lines = ['', 'style vs balanced (same builds):'];
  for (const style of FIGHT_STYLE_IDS) {
    const rng = new Rng(7);
    let w = 0, games = 0, time = 0, parries = 0, evades = 0, dealt = 0;
    for (let i = 0; i < N; i++) {
      const a = randomBuild(rng), b = randomBuild(rng);
      const seed = rng.int(0, 2 ** 31);
      // Both mirrors: the style plays each build once.
      for (const [x, y] of [[a, b], [b, a]]) {
        const side = i & 1;
        const me = { ...x, style }, them = { ...y, style: 'balanced' as const };
        const r = runHeadless({ seed, fighters: side ? [them, me] : [me, them] });
        const mine = r.fighters[side ? 1 : 0];
        if (r.winner === mine.id) w++;
        games++; time += r.time; parries += mine.totals.parries; evades += mine.totals.evades;
        dealt += mine.totals.damageDealt / r.fighters[side ? 0 : 1].stats.maxHp;
      }
    }
    lines.push(`  ${style.padEnd(11)} win ${((w / games) * 100).toFixed(0)}%  avg ${(time / games).toFixed(1)}s  parries ${(parries / games).toFixed(2)}  evades ${(evades / games).toFixed(2)}  dealt ${(dealt / games).toFixed(2)}`);
  }
  process.stdout.write(lines.join('\n') + '\n');
});
