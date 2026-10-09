import { describe, expect, it } from 'vitest';
import { iconFrame } from '../render/icons';
import { Raster } from '../render/pixel/raster';
import { clipLength, clipsFor, frameSpec } from '../render/sprite/anims';
import { drawFigure } from '../render/sprite/draw';
import { makeArt } from '../render/sprite/look';
import { SKIN_ART } from '../render/sprite/skins';
import { weaponArt } from '../render/sprite/weapons';
import { runHeadless } from '../sim/headless';
import { gearOf } from '../sim/gear';
import { DEFAULT_BUILDS, randomBuild, type CharacterBuild } from '../sim/loadout';
import { Rng } from '../core/rng';
import type { GearSet } from '../sim/types';
import { fullSet, randomSkins, sanitizeSkins, setPieces, SKIN_SETS, SKINS, skinsFor } from './skins';

/** A default build wearing `gear` in its slot, with the given skins. */
function wearing(skinId: string | null, gearId: string): CharacterBuild {
  const base = DEFAULT_BUILDS[0];
  const def = gearOf(gearId as never);
  const gear = { ...base.gear, [def.slot]: def.id } as GearSet;
  return { ...base, gear, skins: skinId ? { [def.id]: skinId } : {} };
}

/** Renders the idle frames and the first frame of every move. */
function render(build: CharacterBuild): Uint32Array[] {
  const art = makeArt(build);
  const set = clipsFor(art);
  const r = new Raster(176, 150);
  const out: Uint32Array[] = [];
  for (const [id, c] of set.clips) {
    const n = id === 'idle' ? clipLength(c) : 1;
    for (let i = 0; i < n; i++) {
      r.clear();
      r.phase = i;
      drawFigure(r, art, frameSpec(c, i, null, false), 88, 126);
      out.push(r.compose(88, 126).data);
    }
  }
  return out;
}

const same = (a: Uint32Array[], b: Uint32Array[]) => a.length === b.length && a.every((x, i) => x.length === b[i].length && x.every((v, j) => v === b[i][j]));

describe('item skins', () => {
  it('every skin has art, and art only exists for listed skins', () => {
    for (const s of SKINS) expect(SKIN_ART[s.id], s.id).toBeDefined();
    for (const id of Object.keys(SKIN_ART)) expect(SKINS.some((s) => s.id === id), id).toBe(true);
  });

  it('rarities follow their rules', () => {
    for (const s of SKINS) {
      const a = SKIN_ART[s.id];
      const special = gearOf(s.gear).slot === 'special';
      const reshaped = !!(a.weapon || a.head || a.chest || a.legs || a.boots || (special && a.icon));
      if (s.rarity === 'rare') {
        expect(reshaped, s.id).toBe(false);
        expect(a.mats && Object.keys(a.mats).length, s.id).toBeTruthy();
      } else expect(reshaped, s.id).toBe(true);
      // Effects: legendary and epic pieces you wear or wield; epic special items reshape their battle sprites instead.
      if (s.rarity === 'legendary' || (s.rarity === 'epic' && !special)) expect(a.fx, s.id).toBeDefined();
      else expect(a.fx, s.id).toBeUndefined();
      if (s.rarity === 'epic') {
        expect(s.set, s.id).toBeDefined();
        if (a.fx) expect(a.fx.kind, s.id).toBeDefined();
        if (special) expect(a.icon && (a.proj || a.plume), s.id).toBeTruthy();
      } else expect(s.set, s.id).toBeUndefined();
      // Special item skins colour their battle particles too.
      if (special && s.gear !== 'vampiric_fang') expect(a.glow, s.id).toBeDefined();
    }
  });

  it('epic sets have one piece for each gear slot', () => {
    expect(SKIN_SETS.length).toBe(16);
    for (const set of SKIN_SETS) {
      const slots = setPieces(set.id).map((p) => gearOf(p.gear).slot).sort();
      expect(slots, set.id).toEqual(['boots', 'chest', 'head', 'legs', 'main', 'secondary', 'special']);
    }
  });

  it('a set counts only when every piece is worn in its set skin', () => {
    const pieces = setPieces('foxfire');
    const gear = Object.fromEntries(pieces.map((p) => [gearOf(p.gear).slot, p.gear])) as GearSet;
    const skins = Object.fromEntries(pieces.map((p) => [p.gear, p.id]));
    expect(fullSet(gear, skins)).toBe('foxfire');
    expect(makeArt({ ...DEFAULT_BUILDS[0], gear, skins }).set).toBe('foxfire');
    expect(fullSet({ ...gear, boots: undefined }, skins)).toBeNull();
    expect(fullSet(gear, { ...skins, [pieces[5].gear]: undefined })).toBeNull();
  });

  it('every main weapon family has a skin of each rarity', () => {
    const families = new Map<string, Set<string>>();
    for (const s of SKINS) {
      const def = gearOf(s.gear);
      if (def.slot !== 'main') continue;
      const fam = makeArt(wearing(null, s.gear)).family;
      if (!families.has(fam)) families.set(fam, new Set());
      families.get(fam)!.add(s.rarity);
    }
    for (const fam of ['sword', 'wand', 'heavy', 'polearm', 'staff', 'bow']) {
      expect([...(families.get(fam) ?? [])].sort().filter((r) => r !== 'epic'), fam).toEqual(['legendary', 'mythic', 'rare']);
    }
  });

  it('reshaped weapons keep the stock grip and reach', () => {
    for (const s of SKINS) {
      if (!SKIN_ART[s.id].weapon) continue;
      const stock = weaponArt(s.gear)!, skin = weaponArt(s.gear, s.id)!;
      expect(skin.grip2, s.id).toBe(stock.grip2);
      expect(Math.abs(skin.tip - stock.tip) / stock.tip, s.id).toBeLessThan(0.1);
    }
  });

  it('every skin draws, and looks different from the plain item', () => {
    for (const s of SKINS) {
      // Special items are mostly not worn on the body: compare their icons.
      if (gearOf(s.gear).slot === 'special') {
        expect(same([iconFrame(s.gear).data], [iconFrame(s.gear, s.id).data]), s.id).toBe(false);
        continue;
      }
      const plain = render(wearing(null, s.gear));
      const skinned = render(wearing(s.id, s.gear));
      expect(same(plain, skinned), s.id).toBe(false);
    }
  }, 60_000);

  it('fights are identical with or without skins', () => {
    const rng = new Rng(77);
    for (let i = 0; i < 6; i++) {
      const a = randomBuild(rng), b = randomBuild(rng);
      const seed = rng.int(0, 1e9);
      const plain = runHeadless({ seed, fighters: [a, b] });
      // Every item wearing its rarest skin.
      const all = (x: CharacterBuild): CharacterBuild => ({
        ...x,
        skins: Object.fromEntries(Object.values(x.gear).map((id) => [id, skinsFor(id).at(-1)?.id]).filter(([, v]) => v)),
      });
      const skinned = runHeadless({ seed, fighters: [all(a), { ...b, skins: randomSkins(b.gear) }] });
      expect(skinned.tick).toBe(plain.tick);
      expect(skinned.winner).toBe(plain.winner);
      expect(skinned.fighters.map((f) => f.hp)).toEqual(plain.fighters.map((f) => f.hp));
    }
  });

  it('drops unknown skins and skins on the wrong item', () => {
    expect(sanitizeSkins({ longsword: 'longsword.dawnbreaker', katana: 'longsword.wyrmfang', mace: 'nope', spear: 3 }))
      .toEqual({ longsword: 'longsword.dawnbreaker' });
    expect(sanitizeSkins(null)).toEqual({});
  });
});
