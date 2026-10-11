import { beforeEach, describe, expect, it } from 'vitest';
import { gems, loadCollection, resetCollectionForTests, spendGems } from './collection';
import { sanitizeAppearance } from './appearance';
import {
  buyFinisher, buyPose, FINISHER_IDS, finisherOf, FINISHERS, ownsFinisher, ownsPose, poseOf, POSE_IDS, POSES, randomFinisher, resetFinalesForTests,
} from './finales';

// Node has no localStorage: a little in-memory one, so the saved list can be checked.
const mem = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;

describe('finishers and victory poses', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCollectionForTests();
    resetFinalesForTests();
    loadCollection();
  });

  it('prices them like the entrances, one free of each', () => {
    expect(FINISHER_IDS.filter((id) => FINISHERS[id].price === 0)).toEqual(['clean']);
    expect(POSE_IDS.filter((id) => POSES[id].price === 0)).toEqual(['cheer']);
    expect(FINISHERS.frost.price).toBe(300);
    expect(FINISHERS.eclipse.price).toBe(600);
    expect(POSES.champion.price).toBe(1200);
  });

  it('buys with gems, saves the owned list and plays the free one until bought', () => {
    const start = gems();
    expect(ownsFinisher('frost')).toBe(false);
    expect(finisherOf({ finisher: 'frost' }, true)).toBe('clean');
    // A rival's pick shows whether you own it or not.
    expect(finisherOf({ finisher: 'frost' }, false)).toBe('frost');
    expect(buyFinisher('frost')).toBe(true);
    expect(gems()).toBe(start - 300);
    expect(finisherOf({ finisher: 'frost' }, true)).toBe('frost');
    expect(JSON.parse(localStorage.getItem('al.finishers')!)).toEqual(['frost']);
    expect(buyFinisher('frost')).toBe(false);
    expect(buyPose('flex')).toBe(true);
    expect(ownsPose('flex')).toBe(true);
    expect(poseOf({ pose: 'flex' }, true)).toBe('flex');
  });

  it('refuses without the gems', () => {
    spendGems(gems() - 100);
    expect(buyFinisher('starfall')).toBe(false);
    expect(ownsFinisher('starfall')).toBe(false);
    expect(gems()).toBe(100);
  });

  it('falls back on bad saved values', () => {
    expect(finisherOf({ finisher: 'nope' })).toBe('clean');
    expect(poseOf(undefined)).toBe('cheer');
    const look = sanitizeAppearance({ finisher: 'nope', pose: 'skyward' });
    expect(look.finisher).toBeUndefined();
    expect(look.pose).toBe('skyward');
    expect(FINISHER_IDS).toContain(randomFinisher());
  });
});
