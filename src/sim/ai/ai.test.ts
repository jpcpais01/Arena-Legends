import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import { Battle } from '../battle';
import { createFighter } from '../fighter';
import { runHeadless } from '../headless';
import { DEFAULT_BUILDS, randomBuild, type CharacterBuild } from '../loadout';
import { analyzeKit, analyzeMatchup } from './kit';

const build = (gear: CharacterBuild['gear'], form: CharacterBuild['form'] = 'balanced'): CharacterBuild => ({ name: 'T', form, gear });

/** Everything that matters about a fighter, as plain data. */
const state = (b: Battle) => JSON.stringify(b.fighters.map((f) => ({ ...f, has: [...f.has] })))
  + JSON.stringify(b.projectiles.map((p) => ({ ...p, def: p.def.id }))) + b.time + b.hitstop;

describe('battle AI', () => {
  it('look-ahead forks never touch the real battle', () => {
    const b = new Battle({ seed: 77, fighters: DEFAULT_BUILDS });
    for (let i = 0; i < 400; i++) b.step();
    const before = state(b);
    const copy = b.fork(5, (c) => [c.brains[0], c.brains[1]].map((_, i) => ({ plan: 'pressure' as const, think: () => { c.fighters[i].move = 1; } })) as never);
    for (let i = 0; i < 300; i++) copy.step();
    expect(state(b)).toBe(before);
    expect(copy.events.length).toBe(0);
  });

  it('stays deterministic with look-ahead on random builds', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 4; i++) {
      const cfg = { seed: rng.int(0, 1e9), fighters: [randomBuild(rng), randomBuild(rng)] as [CharacterBuild, CharacterBuild] };
      const a = runHeadless(cfg), b = runHeadless(cfg);
      expect(state(a)).toBe(state(b));
    }
  });

  it('understands kits from gear alone', () => {
    const spear = analyzeKit(createFighter(0, build({ main: 'spear' })));
    const sword = analyzeKit(createFighter(0, build({ main: 'longsword', secondary: 'kite_shield' })));
    const staff = analyzeKit(createFighter(0, build({ main: 'arcane_staff', chest: 'phase_cloak' })));
    const plate = analyzeKit(createFighter(0, build({ main: 'warhammer', chest: 'plate_armor', special: 'meteor_sigil' })));
    const mirror = analyzeKit(createFighter(0, build({ main: 'katana', chest: 'mirror_mail' })));
    expect(spear.meleeReach).toBeGreaterThan(sword.meleeReach);
    expect(staff.ranged).toBe(true);
    expect(sword.ranged).toBe(false);
    expect(sword.defenses.map((d) => d.defense)).toContain('parry');
    expect(staff.defenses.map((d) => d.defense)).toContain('blink');
    expect(plate.defenses.map((d) => d.defense)).toContain('armor');
    expect(mirror.defenses.map((d) => d.defense)).toContain('shield');
    expect(plate.info.some((a) => a.ultimate && a.item && a.offensive)).toBe(true);
  });

  it('a staff wants range against a hammer, the hammer wants to brawl', () => {
    const staff = createFighter(0, build({ main: 'arcane_staff' }, 'ethereal'));
    const hammer = createFighter(1, build({ main: 'warhammer' }, 'mighty'));
    const sk = analyzeKit(staff), hk = analyzeKit(hammer);
    const fromStaff = analyzeMatchup(staff, sk, hammer, hk, 0.6);
    const fromHammer = analyzeMatchup(hammer, hk, staff, sk, 0.3);
    expect(fromStaff.zone).toBeGreaterThan(4);
    expect(fromStaff.engage).toBeGreaterThan(fromHammer.engage);
    expect(fromHammer.engage).toBeLessThan(2.6);
  });

  it('a two-handed main makes the secondary slower to bring out', () => {
    const oneHand = createFighter(0, build({ main: 'longsword', secondary: 'hand_crossbow' }));
    const twoHand = createFighter(0, build({ main: 'warhammer', secondary: 'hand_crossbow' }));
    const bolt = (f: typeof oneHand) => f.abilities.find((a) => a.id === 'crossbow_bolt')!;
    expect(bolt(twoHand).windup).toBeGreaterThan(bolt(oneHand).windup + 0.15);
    expect(bolt(twoHand).recovery).toBeGreaterThan(bolt(oneHand).recovery + 0.15);
  });

  it('uses every piece of gear that grants an ability', () => {
    const rng = new Rng(21);
    const used = new Set<string>(), owned = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const b = new Battle({ seed: rng.int(0, 1e9), fighters: [randomBuild(rng), randomBuild(rng)] });
      for (const f of b.fighters) for (const ab of f.abilities) owned.add(ab.id);
      while (!b.over && b.tick < 6000) {
        b.step();
        for (const e of b.drainEvents()) {
          if (e.type === 'actionStart' || e.type === 'itemStart') used.add(b.fighters[e.f].abilities[e.ability].id);
        }
      }
    }
    const unused = [...owned].filter((id) => !used.has(id));
    expect(unused).toEqual([]);
  }, 20000);
});
