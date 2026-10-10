import { beforeEach, describe, expect, it } from 'vitest';
import { addGems, buySkins, gems, loadCollection, owns, resetCollectionForTests, START_GEMS } from './collection';
import { DAILY_PICKS, dailyPicks, featuredSet, setOffer, SKIN_PRICE } from './shop';
import { setPieces, SKIN_SETS } from './skins';

describe('skin shop', () => {
  beforeEach(() => resetCollectionForTests());

  it('rotates a fixed offer per day', () => {
    for (let d = 20000; d < 20030; d++) {
      const picks = dailyPicks(d);
      expect(picks).toHaveLength(DAILY_PICKS);
      expect(new Set(picks).size).toBe(DAILY_PICKS);
      expect(picks.some((s) => s.rarity !== 'rare')).toBe(true);
      expect(picks.every((s) => s.set !== featuredSet(d).id)).toBe(true);
      expect(dailyPicks(d)).toEqual(picks);
    }
  });

  it('prices bundles by the missing pieces and buys them', () => {
    loadCollection();
    const set = SKIN_SETS[0];
    const o = setOffer(set);
    expect(o.full).toBe(setPieces(set.id).reduce((n, p) => n + SKIN_PRICE[p.rarity], 0));
    expect(setOffer(set, true).price).toBeLessThan(o.price);
    expect(buySkins([o.missing[0].id], 0)).toBe(true);
    expect(setOffer(set).missing).toHaveLength(o.missing.length - 1);
    expect(buySkins(o.missing.map((p) => p.id), START_GEMS + 1)).toBe(false);
    const after = setOffer(set);
    addGems(after.price);
    expect(buySkins(after.missing.map((p) => p.id), after.price)).toBe(true);
    expect(gems()).toBe(START_GEMS);
    expect(o.pieces.every((p) => owns(p.id))).toBe(true);
    expect(setOffer(set).price).toBe(0);
  });
});
