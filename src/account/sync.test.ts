import { describe, expect, it } from 'vitest';
import { applySave, hashSave, mergeGuest, snapshot } from './sync';

function fakeStorage(init: Record<string, string>): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

describe('account sync', () => {
  it('snapshots every al.* key except device-only ones', () => {
    const ls = fakeStorage({ 'al.character': '{"name":"A"}', 'al.gems': '1000', 'al.account': '{}', 'al.online': 'x', other: '1' });
    expect(snapshot(ls)).toEqual({ 'al.character': '{"name":"A"}', 'al.gems': '1000' });
  });

  it('merges guest progress: account wins, guest-only keys kept, record combined', () => {
    const local = { 'al.character': '"guest"', 'al.speed': '2', 'al.record': '{"w":5,"l":1}' };
    const cloud = { 'al.character': '"cloud"', 'al.record': '{"w":3,"l":4}' };
    expect(mergeGuest(local, cloud)).toEqual({ 'al.character': '"cloud"', 'al.speed': '2', 'al.record': '{"w":5,"l":4}' });
  });

  it('applies a save, dropping synced keys it lacks', () => {
    const ls = fakeStorage({ 'al.speed': '2', 'al.notesSeen': '"v"', 'al.record': '{}' });
    applySave({ 'al.record': '{"w":1,"l":0}' }, ls);
    expect(snapshot(ls)).toEqual({ 'al.record': '{"w":1,"l":0}' });
    expect(ls.getItem('al.notesSeen')).toBe('"v"');
  });

  it('hashes independent of key order', () => {
    expect(hashSave({ a: '1', b: '2' })).toBe(hashSave({ b: '2', a: '1' }));
    expect(hashSave({ a: '1' })).not.toBe(hashSave({ a: '2' }));
  });
});
