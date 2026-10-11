import { describe, expect, it } from 'vitest';
import { gems, resetCollectionForTests, START_GEMS } from './collection';
import { isAdmin, redeem } from './promo';

describe('promo codes', () => {
  it('turns down unknown and short codes; KELKEL makes the save admin and pays 10k gems, once', () => {
    resetCollectionForTests();
    expect(redeem('ABCDEF')).toEqual({ ok: false, why: 'unknown' });
    expect(redeem('KEL')).toEqual({ ok: false, why: 'short' });
    expect(isAdmin()).toBe(false);
    expect(redeem('kelkel')).toEqual({ ok: true, gems: 10000, admin: true, wasAdmin: false });
    expect(isAdmin()).toBe(true);
    expect(gems()).toBe(START_GEMS + 10000);
    expect(redeem('KELKEL')).toEqual({ ok: false, why: 'used' });
    expect(gems()).toBe(START_GEMS + 10000);
  });
});
