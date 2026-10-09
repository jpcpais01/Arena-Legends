import { beforeEach, describe, expect, it } from 'vitest';
import { EPIC_PITY, gems, loadCollection, openChest, owns, pity, PULL_COST, resetCollectionForTests, START_GEMS, TEN_COST, winGems } from './collection';
import { SKINS } from './skins';

/** Seeded rng so the rolls are repeatable. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('skin chests', () => {
  beforeEach(() => resetCollectionForTests());

  it('starts with the starting gems and keeps worn skins', () => {
    const worn = SKINS[0];
    loadCollection({ [worn.gear]: worn.id });
    expect(gems()).toBe(START_GEMS);
    expect(owns(worn.id)).toBe(true);
    expect(owns(SKINS[1].id)).toBe(false);
  });

  it('charges, refunds duplicates and refuses without gems', () => {
    loadCollection();
    const r = rng(7);
    const a = openChest(1, r)!;
    expect(a).toHaveLength(1);
    expect(gems()).toBe(START_GEMS - PULL_COST + a[0].refund);
    const ten = openChest(10, r)!;
    expect(ten).toHaveLength(10);
    // Ten always hold a mythic or better.
    expect(ten.some((p) => p.skin.rarity !== 'rare')).toBe(true);
    while (gems() >= PULL_COST) openChest(1, r);
    expect(openChest(1, r)).toBeNull();
    expect(openChest(10, r)).toBeNull();
    expect(gems()).toBeLessThan(TEN_COST);
  });

  it('guarantees an epic by the pity count', () => {
    loadCollection();
    const never = () => 0; // always the first rare
    let epic = 0;
    for (let i = 0; i < EPIC_PITY; i++) {
      // Keep the wallet topped up.
      (loadCollection() as { gems: number }).gems = 10000;
      if (openChest(1, never)![0].skin.rarity === 'epic') epic = i + 1;
    }
    expect(epic).toBe(EPIC_PITY);
    expect(pity()).toBe(0);
  });

  it('pays more for a cleaner win', () => {
    expect(winGems(0)).toBe(25);
    expect(winGems(1)).toBe(100);
    expect(winGems(0.5)).toBeGreaterThan(winGems(0.1));
  });
});
