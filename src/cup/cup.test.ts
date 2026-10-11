import { describe, expect, it } from 'vitest';
import { newCharacter } from '../character/profile';
import { champion, cupPay, entrantAt, matchCount, newCup, openRound, parseCup, quickResult, ROUND_COUNT, roundOf, roundsOf, settleRound, statusOf, type Judge } from './cup';

const hero = () => ({ ...newCharacter(), name: 'Tester' });
// A judge that never runs a battle: the upper slot always wins.
const judge: Judge = async () => ({ winner: 0, reason: 'ko', hp: [0.5, 0], dmg: [100, 50] });

describe('arena cup', () => {
  it('draws 32 fighters with the player in a slot', () => {
    const cup = newCup([{ build: hero(), level: 3, pid: 'me' }], 3, false, 1234);
    expect(cup.entrants).toHaveLength(32);
    expect(cup.entrants[cup.me].pid).toBe('me');
    expect(cup.entrants.filter((e) => e.human)).toHaveLength(1);
    expect(new Set(cup.entrants.map((e) => e.build.name)).size).toBeGreaterThan(28);
    expect(statusOf(cup)).toEqual({ kind: 'play', round: 0, match: cup.me >> 1, side: cup.me & 1 });
  });

  it('keeps two players apart until the final', () => {
    const cup = newCup([{ build: hero(), level: 1, pid: 'a' }, { build: { ...hero(), name: 'Friend' }, level: 1, pid: 'b' }], 1, true, 99);
    const [a, b] = cup.entrants.map((e, i) => (e.human ? i : -1)).filter((i) => i >= 0);
    expect(Math.floor(a / 16)).not.toBe(Math.floor(b / 16));
  });

  it('plays through to a champion', async () => {
    const cup = newCup([{ build: hero(), level: 5, pid: 'me' }], 5, false, 7);
    for (let r = 0; r < ROUND_COUNT; r++) {
      const s = statusOf(cup);
      expect(s.kind).toBe('play');
      if (s.kind !== 'play') return;
      expect(s.round).toBe(r);
      cup.results[r][s.match] = { w: s.side, hp: 0.6, ko: true };
      await settleRound(cup, r, judge);
      expect(cup.results[r].every(Boolean)).toBe(true);
      expect(openRound(cup)).toBe(r + 1);
    }
    expect(statusOf(cup).kind).toBe('champion');
    expect(champion(cup)).toBe(cup.me);
    expect(parseCup(JSON.parse(JSON.stringify(cup)))?.results).toEqual(cup.results);
  });

  it('settles bot matches the same way every time', () => {
    const cup = newCup([{ build: hero(), level: 2, pid: 'me' }], 2, false, 42);
    const m = (cup.me >> 1) ^ 1;
    expect(quickResult(cup, 0, m)).toEqual(quickResult(cup, 0, m));
    expect(entrantAt(cup, 0, m, 0)).toBe(2 * m);
    expect(matchCount(4)).toBe(1);
  });

  it('runs smaller world tournaments: 8 fighters from the quarter-finals, rivals above you, a bigger purse', async () => {
    const cup = newCup([{ build: hero(), level: 4, pid: 'me' }], 4, false, 5, 'crown');
    expect(cup.entrants).toHaveLength(8);
    expect(roundsOf(cup)).toBe(3);
    expect(roundOf(cup, 0).name).toBe('Quarter-finals');
    expect(Math.min(...cup.entrants.filter((e) => !e.human).map((e) => e.level))).toBeGreaterThanOrEqual(10);
    expect(cupPay(cup, 2, true, 1).bonus).toBeGreaterThan(cupPay(newCup([{ build: hero(), level: 4, pid: 'me' }], 4, false, 5), 4, true, 1).bonus);
    for (let r = 0; r < roundsOf(cup); r++) {
      const s = statusOf(cup);
      if (s.kind !== 'play') throw new Error('out');
      cup.results[r][s.match] = { w: s.side, hp: 0.5, ko: true };
      await settleRound(cup, r, judge);
    }
    expect(champion(cup)).toBe(cup.me);
    const back = parseCup(JSON.parse(JSON.stringify(cup)));
    expect(back?.t).toBe('crown');
    expect(back?.results).toEqual(cup.results);
  });

  it('draws a 16-fighter cup with friends apart', () => {
    const cup = newCup([{ build: hero(), level: 1, pid: 'a' }, { build: { ...hero(), name: 'Friend' }, level: 1, pid: 'b' }], 1, true, 3, 'blossom');
    expect(cup.entrants).toHaveLength(16);
    const [a, b] = cup.entrants.map((e, i) => (e.human ? i : -1)).filter((i) => i >= 0);
    expect(Math.floor(a / 8)).not.toBe(Math.floor(b / 8));
    // An unknown tournament id doesn't load as a broken bracket.
    expect(parseCup({ ...JSON.parse(JSON.stringify(cup)), t: 'nope' })).toBeNull();
  });
});
