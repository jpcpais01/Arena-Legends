import { describe, expect, it } from 'vitest';
import { Battle } from '../sim/battle';
import { DEFAULT_BUILDS } from '../sim/loadout';
import { judge, stateHash } from './verdict';

describe('online verdict', () => {
  it('is the same on every run of the same round', () => {
    const builds = [DEFAULT_BUILDS[0], DEFAULT_BUILDS[1]] as const;
    const a = judge(1234, [builds[0], builds[1]]);
    const b = judge(1234, [builds[0], builds[1]]);
    expect(a.hash).toBe(b.hash);
    expect(a.checks).toEqual(b.checks);
  });

  it('matches a battle stepped the way the game watches it (events drained)', () => {
    const builds = [DEFAULT_BUILDS[0], DEFAULT_BUILDS[1]] as [typeof DEFAULT_BUILDS[0], typeof DEFAULT_BUILDS[1]];
    const v = judge(99, builds);
    const b = new Battle({ seed: 99, fighters: [{ ...builds[0] }, { ...builds[1] }] });
    for (let i = 0; i < 20000 && !b.over; i++) { b.step(); b.drainEvents(); }
    expect(stateHash(b)).toBe(v.hash);
    expect(b.winner).toBe(v.winner);
  });
});
