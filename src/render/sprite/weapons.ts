import type { GearId, MainWeaponId, SecondaryId } from '../../sim/types';
import { material } from '../pixel/raster';
import { union, type Shape } from '../pixel/sdf';
import { SKIN_ART } from './skins';
import { clearShape, fillAll, M, type MainFamily, type SecFamily, type WeaponArt } from './weaponKit';

export type { MainFamily, SecFamily, WeaponArt, WeaponDrawOpts } from './weaponKit';

/**
 * Pixel art for every weapon, built from shapes in weapon-local space: the
 * origin is the grip (centre of the hand), +x runs toward the business end,
 * +y is the spine side. Drawn fresh for each frame at whatever angle the
 * animation asks for, so swings never smear the art.
 */

// -----------------------------------------------------------------------------
// Main weapons
// -----------------------------------------------------------------------------

function longsword(): WeaponArt {
  return {
    tip: 31,
    mats: { blade: M.steel(), guard: M.gold(), grip: M.leather(), pommel: M.gold() },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-5.2, 0, -1, 0, 1.3, 1.1)], m('grip'), o, 1);
      fillAll(r, [t.circ(-5.6, 0, 1.6)], m('pommel'), o, 1.2);
      fillAll(r, [t.poly([2, -1.6, 26.5, -1.4, 31, 0, 26.5, 1.4, 2, 1.6])], m('blade'), o, 1.4);
      r.line(t.x(3, 0), t.y(3, 0), t.x(24, 0), t.y(24, 0), m('blade'), 1, o.group ?? 6);
      fillAll(r, [t.rect(1, 0, 1, 4.2, 0.5)], m('guard'), o, 1.2);
    },
  };
}

function katana(): WeaponArt {
  return {
    tip: 31,
    mats: { blade: M.steel(), guard: M.darkSteel(), grip: M.wrap(0x2a2234), wrapHi: M.wrap(0xe8e0d0) },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-7, 0, 0, 0, 1.2, 1.15)], m('grip'), o, 1);
      for (let i = -6; i <= -1; i += 2) r.dot(t.x(i, 0), t.y(i, 0), m('wrapHi'), 2, o.group ?? 6);
      fillAll(r, [t.circ(0.8, 0, 2.2)], m('guard'), o, 1.2);
      // A gentle curve: the edge sweeps up toward the tip.
      fillAll(r, [t.poly([2, -1.2, 12, -1.1, 22, -0.4, 29, 0.9, 31.5, 2.2, 27, 2.0, 20, 1.3, 11, 1.1, 2, 1.1])], m('blade'), o, 1.3);
    },
  };
}

function mace(): WeaponArt {
  return {
    tip: 21,
    mats: { haft: M.darkWood(), head: M.bronze(), band: M.darkSteel() },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-4.5, 0, 15, 0, 1.25, 1.1)], m('haft'), o, 1);
      fillAll(r, [t.rect(-1, 0, 0.9, 1.6)], m('band'), o, 1);
      const head = [t.ell(18.2, 0, 3.4, 2.9)];
      for (const k of [-1, 1]) head.push(t.poly([15.5, k * 2.4, 19.5, k * 4.8, 21.5, k * 2.6]));
      head.push(t.poly([20, -1.6, 23.4, 0, 20, 1.6]));
      fillAll(r, [union(...head)], m('head'), o, 1.8);
    },
  };
}

function dagger(): WeaponArt {
  return {
    tip: 15,
    mats: { blade: material({ base: 0xa8d0b0, shiny: true, step: 0.15 }), venom: M.glow(0x9cff4a), grip: M.wrap(0x3a2a40), guard: M.darkSteel() },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-4, 0, 0, 0, 1.15)], m('grip'), o, 1);
      fillAll(r, [t.rect(0.8, 0, 0.8, 2.8, 0.4)], m('guard'), o, 1);
      fillAll(r, [t.poly([1.6, -1.4, 11, -1.2, 15, 0, 11, 1.4, 1.6, 1.3])], m('blade'), o, 1.2);
      r.line(t.x(4, -0.2), t.y(4, -0.2), t.x(11, -0.2), t.y(11, -0.2), m('venom'), 3, o.group ?? 6);
    },
  };
}

function emberWand(): WeaponArt {
  return {
    tip: 15,
    mats: { wood: M.darkWood(), band: M.gold(), ember: M.glow(0xffa040), core: M.glow(0xfff0a0) },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-4, 0, 12, 0, 1.1, 0.9)], m('wood'), o, 1);
      fillAll(r, [t.rect(11.5, 0, 0.8, 1.7)], m('band'), o, 1);
      fillAll(r, [t.poly([12.5, -1.6, 15.5, -1, 17, 0, 15.5, 1.2, 12.5, 1.6])], m('ember'), o);
      r.dot(t.x(14.6, 0), t.y(14.6, 0), m('core'), 4);
    },
  };
}

function warhammer(): WeaponArt {
  return {
    tip: 30,
    grip2: 10,
    mats: { haft: M.darkWood(), head: M.darkSteel(), band: M.bronze(), face: M.steel() },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-9, 0, 25, 0, 1.3, 1.2)], m('haft'), o, 1);
      fillAll(r, [t.rect(-9.5, 0, 1.2, 1.7), t.rect(20.8, 0, 1, 1.7)], m('band'), o, 1);
      // A block head with a spike on the back.
      fillAll(r, [t.rect(26, 0, 4.2, 6.2, 0.8)], m('head'), o, 2);
      fillAll(r, [t.rect(26, -6.1, 3.6, 1, 0.3)], m('face'), o, 1);
      fillAll(r, [t.poly([24.5, 5.8, 26, 10.5, 27.5, 5.8])], m('head'), o, 1.4);
    },
  };
}

function spear(): WeaponArt {
  return {
    tip: 43,
    grip2: 13,
    mats: { shaft: M.wood(), head: M.steel(), band: M.gold(), tassel: M.cloth(0xc83a3a) },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-20, 0, 34, 0, 1.05)], m('shaft'), o, 1);
      fillAll(r, [t.rect(33.5, 0, 1, 1.6)], m('band'), o, 1);
      fillAll(r, [t.poly([34.5, -1.4, 38, -2.6, 44, 0, 38, 2.6, 34.5, 1.4])], m('head'), o, 1.5);
      fillAll(r, [t.poly([33, -1, 30.5, -4.5, 32, -1])], m('tassel'), o, 1);
    },
  };
}

function greataxe(): WeaponArt {
  return {
    tip: 30,
    grip2: 11,
    mats: { haft: M.darkWood(), head: M.steel(), back: M.darkSteel(), wrap: M.cloth(0xb83a32) },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-8, 0, 28, 0, 1.3, 1.2)], m('haft'), o, 1);
      fillAll(r, [t.cap(-3, 0, 2, 0, 1.55)], m('wrap'), o, 1);
      // Crescent blade on the -y (edge) side, small spike on the back.
      fillAll(r, [t.poly([20, -1, 18, -5, 19.5, -9.5, 24, -11, 28.5, -9.5, 30, -5, 28, -1])], m('head'), o, 2.2);
      fillAll(r, [t.poly([21.5, 1, 24, 4.5, 26.5, 1])], m('back'), o, 1.3);
      r.line(t.x(19.3, -9.2), t.y(19.3, -9.2), t.x(28.8, -9.2), t.y(28.8, -9.2), m('head'), 4, o.group ?? 6);
    },
  };
}

function arcaneStaff(): WeaponArt {
  return {
    tip: 30,
    grip2: 12,
    mats: { shaft: M.darkWood(), metal: M.gold(), orb: M.glow(0xb07aff), core: M.glow(0xf0e0ff) },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-20, 0, 25, 0, 1.2, 1.05)], m('shaft'), o, 1);
      fillAll(r, [t.rect(-19, 0, 1.2, 1.5), t.rect(5, 0, 0.8, 1.5)], m('metal'), o, 1);
      // Prongs cradling a glowing orb.
      fillAll(r, [t.poly([24, -1, 26, -4.5, 30, -4, 28, -2.2, 26, -0.8]), t.poly([24, 1, 26, 4.5, 30, 4, 28, 2.2, 26, 0.8])], m('metal'), o, 1.2);
      fillAll(r, [t.circ(28.6, 0, 2.6)], m('orb'), o);
      r.dot(t.x(28, 0.6), t.y(28, 0.6), m('core'), 4);
    },
  };
}

function longbow(): WeaponArt {
  // Held in the far hand by the middle, limbs along local ±y. x is "up the limb".
  return {
    tip: 22,
    mats: { limb: M.wood(), grip: M.leather(), tip: M.gold(), string: M.string(), arrow: M.steel(), fletch: M.cloth(0xe84a3a) },
    draw(r, t, m, o) {
      const pull = o.pull ?? 0;
      const limbs: Shape[] = [];
      // Each limb curves back toward the archer (−x) more as the string is drawn.
      const bend = 2.5 + pull * 2.5;
      for (const s of [-1, 1]) {
        let px = 0, py = 0;
        for (let i = 1; i <= 6; i++) {
          const u = i / 6;
          const nx = -bend * u * u, ny = s * 22 * u;
          limbs.push(t.cap(px, py, nx, ny, 1.25 - u * 0.45));
          px = nx; py = ny;
        }
      }
      fillAll(r, [union(...limbs)], m('limb'), o, 1);
      fillAll(r, [t.cap(0, -2.6, 0, 2.6, 1.45)], m('grip'), o, 1);
      const ends = [[-bend, 22], [-bend, -22]];
      for (const [x, y] of ends) r.dot(t.x(x, y), t.y(x, y), m('tip'), 3, o.group ?? 6);
      const sx = o.stringTo ?? t.p(-bend - 0.5, 0);
      r.line(t.x(-bend, 21.5), t.y(-bend, 21.5), sx[0], sx[1], m('string'), 3, 9);
      r.line(sx[0], sx[1], t.x(-bend, -21.5), t.y(-bend, -21.5), m('string'), 3, 9);
      if (o.stringTo && pull > 0.15) {
        // Nocked arrow from the string hand past the grip.
        const hx = t.x(7, 0), hy = t.y(7, 0);
        r.line(sx[0], sx[1], hx, hy, m('arrow'), 2, 9);
        r.dot(hx, hy, m('arrow'), 4, 9);
        r.dot(sx[0], sx[1] - 1, m('fletch'), 3, 9);
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Secondary weapons
// -----------------------------------------------------------------------------

function kiteShield(): WeaponArt {
  // Held on the forearm: local x is the shield's long axis (pointing down in guard), y across.
  return {
    tip: 10,
    mats: { face: M.cloth(0x2f5fd0), rim: M.gold(), boss: M.steel(), emblem: M.cloth(0xe8d8a0) },
    draw(r, t, m, o) {
      const outer = t.poly([-8, -5.6, -9, -2, -9, 2, -8, 5.6, -2, 6.2, 6, 3.2, 11.5, 0, 6, -3.2, -2, -6.2]);
      fillAll(r, [outer], m('rim'), o, 2);
      const inner = t.poly([-7.2, -4.4, -7.8, 0, -7.2, 4.4, -2, 5, 5.4, 2.4, 9.5, 0, 5.4, -2.4, -2, -5]);
      r.fill(inner, m('face'), { group: o.group ?? 6, bevel: 3.5, toneBias: o.toneBias, noLine: true, local: o.local });
      r.fill(t.poly([-4, -0.7, 4, -0.7, 4, 0.7, -4, 0.7]), m('emblem'), { group: o.group ?? 6, bevel: 1, noLine: true, toneBias: o.toneBias, local: o.local });
      r.fill(t.poly([-1.5, -2.6, 1.5, -2.6, 1.5, 2.6, -1.5, 2.6]), m('emblem'), { group: o.group ?? 6, bevel: 1, noLine: true, toneBias: o.toneBias, local: o.local });
    },
  };
}

function parryingDagger(): WeaponArt {
  return {
    tip: 14,
    mats: { blade: M.steel(), guard: M.gold(), grip: M.wrap(0x8a2a32) },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-4, 0, 0, 0, 1.1)], m('grip'), o, 1);
      fillAll(r, [t.poly([0, -4.5, 1.6, -4.5, 3, -1, 3, 1, 1.6, 4.5, 0, 4.5])], m('guard'), o, 1.2);
      fillAll(r, [t.poly([2, -1.5, 11, -1.3, 14.5, 0, 11, 1.3, 2, 1.5])], m('blade'), o, 1.3);
      // Sword-breaker notches.
      r.dot(t.x(6, 1.2), t.y(6, 1.2), m('blade'), 0, o.group ?? 6);
      r.dot(t.x(8.5, 1.1), t.y(8.5, 1.1), m('blade'), 0, o.group ?? 6);
    },
  };
}

function buckler(): WeaponArt {
  return {
    tip: 7,
    mats: { face: M.darkSteel(), rim: M.steel(), spike: M.steel() },
    draw(r, t, m, o) {
      fillAll(r, [t.ell(2, 0, 2.2, 6.2)], m('rim'), o, 2);
      r.fill(t.ell(2.4, 0, 1.6, 5.2), m('face'), { group: o.group ?? 6, bevel: 3, noLine: true, toneBias: o.toneBias, local: o.local });
      fillAll(r, [t.poly([3.5, -1.5, 8, 0, 3.5, 1.5])], m('spike'), o, 1.2);
    },
  };
}

function throwingKnife(): WeaponArt {
  return {
    tip: 8,
    mats: { blade: M.steel(), grip: M.wrap(0x4a4a5a) },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-2.5, 0, 0.5, 0, 0.9)], m('grip'), o, 1);
      fillAll(r, [t.poly([0.5, -1.1, 6, -0.8, 8.5, 0, 6, 0.8, 0.5, 1.1])], m('blade'), o, 1);
    },
  };
}

function handCrossbow(): WeaponArt {
  return {
    tip: 9,
    mats: { stock: M.darkWood(), prod: M.darkSteel(), string: M.string(), bolt: M.steel() },
    draw(r, t, m, o) {
      fillAll(r, [t.poly([-2, -1.6, 9, -1.1, 9, 1.1, 1, 1.4, -1, 3.8, -3, 3.6, -1.6, 0.6])], m('stock'), o, 1.4);
      const bowShape = t.poly([6.5, -0.5, 4.5, 5.2, 5.8, 5.6, 8, 0, 5.8, -5.6, 4.5, -5.2]);
      fillAll(r, [bowShape], m('prod'), o, 1);
      const pull = o.pull ?? 1;
      const sx = 5 - pull * 3.5;
      r.line(t.x(4.8, 5), t.y(4.8, 5), t.x(sx, 0), t.y(sx, 0), m('string'), 3, 9);
      r.line(t.x(sx, 0), t.y(sx, 0), t.x(4.8, -5), t.y(4.8, -5), m('string'), 3, 9);
      if (pull > 0.5) r.line(t.x(sx, 0.3), t.y(sx, 0.3), t.x(10, 0.3), t.y(10, 0.3), m('bolt'), 3, 9);
    },
  };
}

function chakram(): WeaponArt {
  return {
    tip: 5,
    mats: { ring: M.steel(), grip: M.wrap(0x3a8aa0) },
    draw(r, t, m, o) {
      const outer: Shape[] = [t.circ(3, 0, 4.6)];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        outer.push(t.poly([3 + Math.cos(a) * 3.6, Math.sin(a) * 3.6, 3 + Math.cos(a + 0.5) * 6.4, Math.sin(a + 0.5) * 6.4, 3 + Math.cos(a + 0.75) * 3.8, Math.sin(a + 0.75) * 3.8]));
      }
      fillAll(r, [union(...outer)], m('ring'), o, 1.6);
      // Punch the hole through (paint it transparent by clearing the pixels).
      const hole = t.circ(3, 0, 2.6);
      clearShape(r, hole);
      fillAll(r, [t.cap(-1.2, -1.4, -1.2, 1.4, 0.9)], m('grip'), o, 1);
    },
  };
}

function frostWand(): WeaponArt {
  return {
    tip: 14,
    mats: { shaft: M.cloth(0xd8f0ff), crystal: M.glow(0x9ae8ff), core: M.glow(0xf0ffff) },
    draw(r, t, m, o) {
      fillAll(r, [t.cap(-3.5, 0, 10, 0, 1, 0.8)], m('shaft'), o, 1);
      fillAll(r, [t.poly([9, -1.4, 12, -2.6, 15, 0, 12, 2.6, 9, 1.4])], m('crystal'), o);
      r.dot(t.x(12, 0), t.y(12, 0), m('core'), 4);
    },
  };
}

function warHorn(): WeaponArt {
  return {
    tip: 10,
    mats: { horn: material({ base: 0xe8d8b0 }), band: M.gold(), mouth: M.darkWood() },
    draw(r, t, m, o) {
      // Mouthpiece at the grip side, flaring and curling up toward the bell.
      const pts: Shape[] = [];
      let px = -1.5, py = 0;
      for (let i = 1; i <= 6; i++) {
        const u = i / 6;
        const nx = -1.5 + u * 10.5, ny = u * u * 3.5;
        pts.push(t.cap(px, py, nx, ny, 0.8 + u * 1.6));
        px = nx; py = ny;
      }
      fillAll(r, [union(...pts)], m('horn'), o, 1.6);
      fillAll(r, [t.rect(3, 0.5, 0.7, 1.8), t.rect(7, 1.8, 0.7, 2.2)], m('band'), o, 1);
      r.fill(t.ell(9.2, 3.6, 0.9, 2.1, 0.5), m('mouth'), { group: o.group ?? 6, flat: 1, noLine: true });
    },
  };
}

export const MAIN_FAMILY: Record<MainWeaponId, MainFamily> = {
  longsword: 'sword', katana: 'sword', mace: 'sword', dagger: 'sword', ember_wand: 'wand',
  warhammer: 'heavy', greataxe: 'heavy', spear: 'polearm', arcane_staff: 'staff', longbow: 'bow',
};

export const SEC_FAMILY: Record<SecondaryId, SecFamily> = {
  kite_shield: 'shield', parrying_dagger: 'parry', buckler: 'buckler', throwing_knives: 'knife',
  hand_crossbow: 'crossbow', wind_chakram: 'chakram', frost_wand: 'wand', war_horn: 'horn',
};

const BUILDERS: Partial<Record<GearId, () => WeaponArt>> = {
  longsword, katana, mace, dagger, ember_wand: emberWand, warhammer, spear, greataxe,
  arcane_staff: arcaneStaff, longbow,
  kite_shield: kiteShield, parrying_dagger: parryingDagger, buckler, throwing_knives: throwingKnife,
  hand_crossbow: handCrossbow, wind_chakram: chakram, frost_wand: frostWand, war_horn: warHorn,
};

const cache = new Map<string, WeaponArt>();

/**
 * Art for a weapon, optionally in a skin: mythic and legendary skins bring a
 * reshaped weapon, rare ones recolour the stock one. Textures are laid out in
 * weapon space so they stay glued to the item as it swings.
 */
export function weaponArt(id: GearId, skinId?: string | null): WeaponArt | null {
  const b = BUILDERS[id];
  if (!b) return null;
  const skin = skinId ? SKIN_ART[skinId] : undefined;
  const key = skin ? `${id}|${skinId}` : id;
  let a = cache.get(key);
  if (!a) {
    const base = skin?.weapon ? skin.weapon() : b();
    const mats = { ...base.mats };
    if (skin?.mats) for (const [k, spec] of Object.entries(skin.mats)) mats[k] = material(spec);
    a = { ...base, mats, draw: (r, t, m, o) => base.draw(r, t, m, { ...o, local: t }) };
    cache.set(key, a);
  }
  return a;
}
