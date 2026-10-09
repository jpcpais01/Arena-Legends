import { material, type Raster } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { flow, lattice } from '../../pixel/tex';
import { hairCap } from '../draw';
import type { Xf } from '../xform';

/**
 * Reshaped headgear for mythic and legendary skins. Drawn in head space
 * (x toward the face, y up, the head is about 6 units in radius), in place
 * of the stock piece. Materials are named `h.*` and added to the character.
 */
export type HeadDraw = (r: Raster, H: Xf, m: (k: string) => number, g: number, sway: number) => void;

export interface HeadSkin {
  mats: Record<string, ReturnType<typeof material>>;
  draw: HeadDraw;
}

export function hornedWarhelm(): HeadSkin {
  return {
    mats: {
      'h.helm': material({ base: 0x5a6274, shiny: true, step: 0.15 }),
      'h.dark': material({ base: 0x23262f }),
      'h.trim': material({ base: 0xe0b040, shiny: true }),
      'h.horn': material({ base: 0xece0c4, shiny: true, step: 0.13 }),
    },
    draw(r, H, m, g) {
      // Far horn first, then the dome, then the near horn sweeping up and back.
      r.fill(H.poly([3, 4.8, 4.8, 9.4, 3, 12.8, 2.8, 8.8, 1.6, 5.2]), m('h.horn'), { group: g, bevel: 1.2, toneBias: -1 });
      const dome = hairCap(H, 1.2, -3.6, 1.3);
      r.fill(dome, m('h.helm'), { group: g, bevel: 3 });
      r.fill(H.poly([1.4, 1.6, 5.2, 1.6, 5, -3.6, 2.6, -4.6, 1.6, -2.8]), m('h.helm'), { group: g, bevel: 1.6 });
      r.fill(H.rect(5.8, 0.2, 0.6, 2.8), m('h.trim'), { group: g, bevel: 1 });
      r.fill(intersect(dome, H.rect(0, 2.1, 9, 0.6)), m('h.trim'), { group: g, flat: 2, noLine: true });
      r.line(H.x(2.6, 0.2), H.y(2.6, 0.2), H.x(4.8, 0.2), H.y(4.8, 0.2), m('h.dark'), 0, g);
      r.fill(H.poly([-0.6, 4.4, -3.6, 9.2, -8.2, 11.6, -4.8, 7.6, -2.8, 4.0]), m('h.horn'), { group: g, bevel: 1.2 });
      r.dot(H.x(-3, 1.8), H.y(-3, 1.8), m('h.trim'), 4, g);
    },
  };
}

export function celestialCrown(): HeadSkin {
  return {
    mats: {
      'h.gold': material({ base: 0xf0c048, shiny: true, step: 0.15, tex: flow(4, 1, 1, 1) }),
      'h.halo': material({ base: 0xffe8a0, glow: true }),
      'h.gem': material({ base: 0x8ad8ff, glow: true }),
      'h.star': material({ base: 0xffffff, glow: true }),
    },
    draw(r, H, m, g) {
      // A halo floating over the head, a band with star points, stars circling the halo.
      const halo: Shape = subtract(H.ell(0, 12.4, 6.6, 1.9), H.ell(0, 12.4, 5.2, 1));
      r.fill(halo, m('h.halo'), { group: g });
      const pts: Shape[] = [H.cap(-5, 4.6, 5.2, 5.6, 0.9)];
      for (const [x, y, s] of [[-3.4, 7.6, 1.2], [0.2, 9, 1.6], [3.8, 7.8, 1.2]] as const) {
        pts.push(H.poly([x, y + s * 1.6, x + s * 0.5, y + s * 0.4, x + s * 1.3, y, x + s * 0.5, y - s * 0.4, x, y - s * 2.6, x - s * 0.5, y - s * 0.4, x - s * 1.3, y, x - s * 0.5, y + s * 0.4]));
      }
      r.fill(union(...pts), m('h.gold'), { group: g, bevel: 1.4, local: H });
      r.dot(H.x(0.2, 9), H.y(0.2, 9), m('h.gem'), 3, g);
      r.dot(H.x(-3.4, 7.6), H.y(-3.4, 7.6), m('h.gem'), 3, g);
      r.dot(H.x(3.8, 7.8), H.y(3.8, 7.8), m('h.gem'), 3, g);
      for (let k = 0; k < 2; k++) {
        const a = r.phase * (Math.PI / 4) + k * Math.PI;
        r.dot(H.x(Math.cos(a) * 6, 12.4 + Math.sin(a) * 1.6), H.y(Math.cos(a) * 6, 12.4 + Math.sin(a) * 1.6), m('h.star'), 3, g);
      }
    },
  };
}

export function oniMask(): HeadSkin {
  // A blue oni: long gold horns, heavy brows, burning eyes and fangs.
  return {
    mats: {
      'h.mask': material({ base: 0x3a6ad0, shiny: true }),
      'h.brow': material({ base: 0x1a2048 }),
      'h.horn': material({ base: 0xf0c048, shiny: true, step: 0.15 }),
      'h.eye': material({ base: 0xffe040, glow: true }),
      'h.fang': material({ base: 0xf6f0e0, shiny: true }),
    },
    draw(r, H, m, g) {
      r.fill(H.poly([5.6, 3, 7.4, 8, 5.8, 11.6, 6, 7.6, 4.4, 3.2]), m('h.horn'), { group: g, bevel: 1.2, toneBias: -1 });
      r.fill(H.poly([0.6, 3.8, 7.4, 3.2, 8, -1.4, 6.6, -5.6, 1.2, -5.2, 0.4, -1]), m('h.mask'), { group: g, bevel: 2 });
      r.fill(H.poly([1.6, 2.2, 4.4, 2.8, 7.4, 1.6, 7.2, 0.8, 4.2, 1.6, 1.8, 1.2]), m('h.brow'), { group: g, flat: 1, noLine: true });
      r.line(H.x(2.6, 0.2), H.y(2.6, 0.2), H.x(3.8, -0.2), H.y(3.8, -0.2), m('h.eye'), 3, g);
      r.dot(H.x(5.8, 0), H.y(5.8, 0), m('h.eye'), 3, g);
      r.line(H.x(3, -3.4), H.y(3, -3.4), H.x(6.4, -3.4), H.y(6.4, -3.4), m('h.brow'), 0, g);
      r.fill(H.poly([3.4, -3.4, 3.9, -6.2, 4.4, -3.4]), m('h.fang'), { group: g, bevel: 0.8 });
      r.fill(H.poly([5.6, -3.4, 6.1, -6, 6.6, -3.4]), m('h.fang'), { group: g, bevel: 0.8 });
      r.fill(H.poly([1.6, 3.4, 1, 8.6, -1.4, 12.4, -0.4, 8.2, -0.2, 3.4]), m('h.horn'), { group: g, bevel: 1.2 });
    },
  };
}

export function ravenHood(): HeadSkin {
  // A feathered black hood with a long raven beak and violet eyes.
  return {
    mats: {
      'h.hood': material({ base: 0x2a2234, tex: lattice(2.6, -1) }),
      'h.feather': material({ base: 0x3a2e52 }),
      'h.beak': material({ base: 0xd8c8a0, shiny: true }),
      'h.eye': material({ base: 0xc070ff, glow: true }),
    },
    draw(r, H, m, g) {
      const feathers: Shape[] = [];
      for (let k = 0; k < 4; k++) {
        const y = 6 - k * 3.2;
        feathers.push(H.poly([-6, y, -11 - k * 0.6, y - 1.2, -6.4, y - 2.6]));
      }
      r.fill(union(...feathers), m('h.feather'), { group: g, bevel: 1.2, toneBias: -1, local: H });
      const hood = union(H.ell(-0.8, 1.2, 7.8, 7.6), H.poly([-7.6, 1, -6.4, -6.8, 1, -7.4, 3, -4]), H.poly([-3, 8, 0.4, 11.6, 1.6, 7.6]));
      r.fill(hood, m('h.hood'), { group: g, bevel: 3, softLight: true, local: H });
      r.fill(H.ell(3.8, -1.3, 3.7, 4.1), m('h.hood'), { group: g, flat: 0, noLine: true });
      r.fill(H.poly([4.2, 0.6, 12.4, -2.4, 5, -3.4]), m('h.beak'), { group: g, bevel: 1.2 });
      r.line(H.x(5.4, -1.4), H.y(5.4, -1.4), H.x(10.6, -2.3), H.y(10.6, -2.3), m('h.hood'), 0, g);
      r.dot(H.x(3, 0.8), H.y(3, 0.8), m('h.eye'), 3, g);
      r.dot(H.x(4, 0.8), H.y(4, 0.8), m('h.eye'), 3, g);
    },
  };
}

export function eternityCirclet(): HeadSkin {
  // A gold circlet with a clock-face jewel, and a floating dial behind the head whose hands turn.
  return {
    mats: {
      'h.gold': material({ base: 0xf0c048, shiny: true, step: 0.15, tex: flow(4, 1, 1, 1) }),
      'h.dial': material({ base: 0xd8b0ff, glow: true }),
      'h.face': material({ base: 0x3a2a5a }),
      'h.hand': material({ base: 0xfff0b0, glow: true }),
      'h.gem': material({ base: 0xc080ff, glow: true }),
    },
    draw(r, H, m, g) {
      // The dial floats behind and above the head; it is drawn first so the head covers its lower part.
      const cx = -4.4, cy = 7.6;
      r.fill(subtract(H.circ(cx, cy, 4.6), H.circ(cx, cy, 3.7)), m('h.dial'), { group: g });
      r.fill(H.circ(cx, cy, 3.7), m('h.face'), { group: g, flat: 1, noLine: true });
      for (let k = 0; k < 12; k += 3) {
        const a = (k / 12) * Math.PI * 2;
        r.dot(H.x(cx + Math.cos(a) * 3.1, cy + Math.sin(a) * 3.1), H.y(cx + Math.cos(a) * 3.1, cy + Math.sin(a) * 3.1), m('h.dial'), 3, g);
      }
      const big = Math.PI / 2 - r.phase * (Math.PI / 2), small = 2.4;
      r.line(H.x(cx, cy), H.y(cx, cy), H.x(cx + Math.cos(big) * 2.8, cy + Math.sin(big) * 2.8), H.y(cx + Math.cos(big) * 2.8, cy + Math.sin(big) * 2.8), m('h.hand'), 3, g);
      r.line(H.x(cx, cy), H.y(cx, cy), H.x(cx + Math.cos(small) * 1.8, cy + Math.sin(small) * 1.8), H.y(cx + Math.cos(small) * 1.8, cy + Math.sin(small) * 1.8), m('h.hand'), 3, g);
      r.fill(H.cap(-6.4, 2.2, 6.6, 3.4, 0.8), m('h.gold'), { group: g, bevel: 1, local: H });
      r.fill(H.circ(5.8, 3.6, 1.6), m('h.gold'), { group: g, bevel: 1, local: H });
      r.dot(H.x(5.8, 3.6), H.y(5.8, 3.6), m('h.gem'), 3, g);
    },
  };
}

export function phoenixBand(): HeadSkin {
  // A band of gold whose tails are living flames, flickering frame by frame.
  return {
    mats: {
      'h.band': material({ base: 0xf0b030, shiny: true, step: 0.15 }),
      'h.flame': material({ base: 0xff8a2a, glow: true }),
      'h.hot': material({ base: 0xfff0a0, glow: true }),
      'h.gem': material({ base: 0xff4a2a, glow: true }),
    },
    draw(r, H, m, g, sway) {
      const s = sway * 2;
      const f = r.phase % 4;
      const lick = [0, 1.2, 0.4, 1.6][f];
      r.fill(H.poly([-6.2, 2.6, -10 - s, 3.4 + lick, -12.6 - s, 1 + lick * 0.5, -10.4 - s, 0.4, -12 - s, -1.6, -8.6 - s, -0.6, -6.4, 0.6]), m('h.flame'), { group: g });
      r.fill(H.poly([-6.2, 1.4, -9 - s, -2.6 - lick * 0.6, -10.6 - s, -4.6, -8.2 - s, -3.6, -6, 0]), m('h.flame'), { group: g });
      r.fill(H.poly([-6.4, 1.8, -8.6 - s, 1.8 + lick * 0.4, -9.6 - s, 0.6, -6.6, 0.8]), m('h.hot'), { group: g });
      r.fill(H.cap(-6.6, 1.8, 6.6, 3, 1), m('h.band'), { group: g, bevel: 1 });
      r.fill(H.poly([5.2, 3.6, 6.2, 5.4, 7.2, 3.6, 6.2, 2]), m('h.band'), { group: g, bevel: 1 });
      r.dot(H.x(6.2, 3.6), H.y(6.2, 3.6), m('h.gem'), 3, g);
    },
  };
}

// -----------------------------------------------------------------------------
// Third wave
// -----------------------------------------------------------------------------

export function hourglassCrown(): HeadSkin {
  // A gold circlet carrying a little hourglass on the brow, with a cog turning behind.
  return {
    mats: {
      'h.gold': material({ base: 0xe0b040, shiny: true, step: 0.15 }),
      'h.cog': material({ base: 0xa8804a, shiny: true }),
      'h.glass': material({ base: 0xd8ccff, shiny: true, step: 0.12 }),
      'h.sand': material({ base: 0xf2d27a }),
    },
    draw(r, H, m, g) {
      // Cog behind the head.
      const teeth: Shape[] = [H.circ(-4.2, 6.2, 2.2)];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        teeth.push(H.circ(-4.2 + Math.cos(a) * 2.5, 6.2 + Math.sin(a) * 2.5, 0.6));
      }
      r.fill(union(...teeth), m('h.cog'), { group: g, bevel: 1.2, toneBias: -1 });
      r.dot(H.x(-4.2, 6.2), H.y(-4.2, 6.2), m('h.gold'), 0, g);
      r.fill(H.cap(-6.4, 2.2, 6.6, 3.4, 0.8), m('h.gold'), { group: g, bevel: 1 });
      // Hourglass on a short stem above the brow.
      r.fill(H.cap(5.6, 3.6, 4.6, 5, 0.5), m('h.gold'), { group: g, bevel: 0.8 });
      r.fill(union(H.poly([3.2, 9.4, 5.8, 9.4, 4.6, 7.4, 4.4, 7.4]), H.poly([4.4, 7.4, 4.6, 7.4, 5.8, 5.4, 3.2, 5.4])), m('h.glass'), { group: g, bevel: 1 });
      r.fill(H.poly([3.6, 5.6, 5.4, 5.6, 4.5, 6.6]), m('h.sand'), { group: g, flat: 2, noLine: true });
      r.fill(H.poly([3.9, 8.8, 5.1, 8.8, 4.5, 7.8]), m('h.sand'), { group: g, flat: 2, noLine: true });
      r.fill(union(H.rect(4.5, 9.8, 1.9, 0.45), H.rect(4.5, 5.0, 1.9, 0.45), H.rect(2.9, 7.4, 0.3, 2.2), H.rect(6.1, 7.4, 0.3, 2.2)), m('h.gold'), { group: g, bevel: 0.8 });
    },
  };
}

export function thunderbirdCrest(): HeadSkin {
  // A storm-blue thunderbird spreading its wings over the head, a lightning bolt down each wing.
  return {
    mats: {
      'h.wing': material({ base: 0x3a5ab8, shiny: true, tex: lattice(2.2, -1) }),
      'h.trim': material({ base: 0xf0c040, shiny: true }),
      'h.bolt': material({ base: 0xfff080, glow: true }),
      'h.eye': material({ base: 0xfff8c0, glow: true }),
    },
    draw(r, H, m, g) {
      // Far wing, then the band, the bird's head over the brow, and the near wing sweeping back.
      r.fill(H.poly([-0.4, 6, 1.6, 10.4, -1.6, 13.4, -3.2, 11.4, -6, 12.8, -5.6, 10, -2.8, 7]), m('h.wing'), { group: g, bevel: 1.2, toneBias: -1, local: H });
      r.fill(H.cap(-5.6, 4.2, 5.4, 5, 0.9), m('h.trim'), { group: g, bevel: 1 });
      r.fill(H.poly([1, 5.2, 3.8, 8.6, 6.2, 8.8, 8.8, 7.6, 6.4, 6.8, 5, 5]), m('h.wing'), { group: g, bevel: 1.2, local: H });
      r.fill(H.poly([6.4, 8.4, 9, 7.6, 6.6, 7.1]), m('h.trim'), { group: g, bevel: 0.6 });
      r.fill(H.poly([3.4, 8.2, 2.6, 10.6, 4.4, 8.8]), m('h.wing'), { group: g, bevel: 0.8 });
      r.dot(H.x(5.4, 7.8), H.y(5.4, 7.8), m('h.eye'), 3, g);
      const near = H.poly([0, 5.6, -2.4, 9.4, -6, 11, -10.8, 13, -9, 10.8, -11, 10.6, -8.2, 9, -9.8, 8.2, -6.4, 7.4, -3.2, 5.4]);
      r.fill(near, m('h.wing'), { group: g, bevel: 1.4, local: H });
      const bolt = [[-1.6, 7.2], [-4.2, 8.8], [-4.8, 8], [-8.4, 10.4]];
      for (let i = 1; i < bolt.length; i++) r.line(H.x(bolt[i - 1][0], bolt[i - 1][1]), H.y(bolt[i - 1][0], bolt[i - 1][1]), H.x(bolt[i][0], bolt[i][1]), H.y(bolt[i][0], bolt[i][1]), m('h.bolt'), 3, g);
    },
  };
}

export function musketeerHat(): HeadSkin {
  // A wide-brimmed felt hat with a gold band and a long plume that streams behind.
  const barbs = (x: number, y: number) => (((Math.floor(x * 1.3 - y * 0.6) % 2) + 2) % 2 === 0 ? -1 : 0);
  return {
    mats: {
      'h.hat': material({ base: 0x3e2c5e }),
      'h.band': material({ base: 0xe0b040, shiny: true }),
      'h.plume': material({ base: 0xf4eee6, tex: barbs }),
      'h.plume2': material({ base: 0xd84a6a, tex: barbs }),
    },
    draw(r, H, m, g, sway) {
      const s = sway * 2.4;
      const plume = (pts: [number, number, number][], mat: number, bias = 0) => {
        const segs: Shape[] = [];
        for (let i = 1; i < pts.length; i++) segs.push(H.cap(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i - 1][2], pts[i][2]));
        r.fill(union(...segs), mat, { group: g, bevel: 1.2, toneBias: bias, local: H });
      };
      plume([[-2, 8.4, 1], [-6 - s * 0.6, 10.4, 1.3], [-10 - s, 10.6, 1.1], [-13 - s * 1.4, 8.4, 0.6]], m('h.plume2'), -1);
      const crown = intersect(H.ell(0, 7.6, 4.8, 3.6), H.rect(0, 9, 8, 3.8));
      r.fill(crown, m('h.hat'), { group: g, bevel: 2.4 });
      r.fill(intersect(crown, H.rect(0, 6.3, 8, 0.65)), m('h.band'), { group: g, flat: 2, noLine: true });
      r.fill(H.ell(0.6, 5.4, 9, 1.4, -0.06), m('h.hat'), { group: g, bevel: 1.2 });
      plume([[-1.6, 7, 1.3], [-5.6 - s * 0.6, 9.8, 1.8], [-10.4 - s, 10.4, 1.5], [-14 - s * 1.5, 7.6, 0.8]], m('h.plume'));
      r.fill(H.circ(-1.4, 6.6, 0.9), m('h.band'), { group: g, bevel: 0.8 });
    },
  };
}

export function bloodfuryVisage(): HeadSkin {
  // A black-and-crimson demon mask: ram horns, a fanged maw, and blood-red veins pulsing outward.
  const pulse = (x: number, y: number, ph: number) => {
    const v = Math.sin(x * 0.9 + Math.sin(y * 1.2) * 2) + Math.sin(y * 0.8 - x * 0.3) * 0.6;
    if (Math.abs(v) >= 0.28) return 0;
    return ((Math.floor(Math.hypot(x - 4, y) - ph * 1.5) % 6) + 6) % 6 < 3 ? 4 : 1;
  };
  return {
    mats: {
      'h.mask': material({ base: 0x2a1418, ramp: [0x120608, 0x1e0a0e, 0x2e1218, 0x4a1c24, 0xff3a3a], tex: pulse }),
      'h.horn': material({ base: 0x3a2a2e, shiny: true, tex: (x) => (((Math.floor(x * 1.2) % 2) + 2) % 2 === 0 ? 1 : 0) }),
      'h.fang': material({ base: 0xf2ead8, shiny: true }),
      'h.eye': material({ base: 0xff4030, glow: true }),
      'h.flame': material({ base: 0xff5a2a, glow: true }),
    },
    draw(r, H, m, g) {
      const lick = [0, 1, 0.4, 1.4][r.phase % 4];
      // Far horn, mask, then the near horn curling back over the head, with flames at the tips.
      r.fill(H.poly([5.2, 3, 7.6, 6.8, 6.4, 10.4, 5.4, 8.4, 5.8, 6, 4, 3.2]), m('h.horn'), { group: g, bevel: 1.2, toneBias: -1, local: H });
      r.fill(H.poly([0.6, 4, 7.6, 3.4, 8.2, -1.2, 7, -6, 1.2, -5.6, 0.2, -1]), m('h.mask'), { group: g, bevel: 2, local: H });
      r.fill(H.poly([1.6, 2.4, 4.6, 3, 7.6, 1.6, 7.4, 0.6, 4.4, 1.6, 1.8, 1.2]), m('h.horn'), { group: g, flat: 0, noLine: true });
      r.line(H.x(2.6, 0.2), H.y(2.6, 0.2), H.x(3.9, -0.3), H.y(3.9, -0.3), m('h.eye'), 3, g);
      r.dot(H.x(6, 0), H.y(6, 0), m('h.eye'), 3, g);
      // Maw with four fangs.
      r.fill(H.poly([2.8, -3, 7.4, -3, 7, -5, 3.2, -5]), m('h.horn'), { group: g, flat: 0, noLine: true });
      for (const x of [3.4, 4.6, 5.8, 6.8]) r.fill(H.poly([x - 0.4, -3, x, -4.6, x + 0.4, -3]), m('h.fang'), { group: g, bevel: 0.6 });
      r.fill(H.poly([1.2, 3.6, -1, 7.4, -4.4, 9.2, -7.4, 8, -8.4, 5.4, -6.2, 6.6, -3.8, 6.8, -1.4, 5.4, -0.4, 3.4]), m('h.horn'), { group: g, bevel: 1.4, local: H });
      r.fill(H.poly([-7.6, 8, -9.8 - lick * 0.4, 10.6 + lick, -9.4, 8, -10.6, 7.4 + lick * 0.3, -8.4, 5.6]), m('h.flame'), { group: g });
      r.fill(H.poly([6.4, 10.2, 6.8 + lick * 0.3, 12.6 + lick, 7.6, 10.4]), m('h.flame'), { group: g });
    },
  };
}

export function seraphHelm(): HeadSkin {
  // A white-gold great helm with a burning visor, two feathered wings that beat slowly, and a halo.
  const feathers = (x: number, y: number) => (((Math.floor(x * 0.9 + y * 0.5) % 2) + 2) % 2 === 0 ? -1 : 0);
  return {
    mats: {
      'h.helm': material({ base: 0xe6eaf2, shiny: true, step: 0.15 }),
      'h.gold': material({ base: 0xf0c048, shiny: true, step: 0.15, tex: flow(4, 1, 1, 1) }),
      'h.visor': material({ base: 0xfff2a0, glow: true }),
      'h.wing': material({ base: 0xffffff, ramp: [0x9aa6c8, 0xc8d2e8, 0xe4eaf6, 0xf6f8ff, 0xffffff], tex: feathers }),
      'h.halo': material({ base: 0xffe8a0, glow: true }),
    },
    draw(r, H, m, g) {
      const beat = [0, 0.7, 1.2, 0.7][r.phase % 4];
      const wing = (bias: number, dx: number) => {
        r.fill(H.poly([
          -2 + dx, 3, -6 + dx, 6 + beat * 0.5, -11.4 + dx, 10.4 + beat, -10.4 + dx, 8.2 + beat, -12.6 + dx, 7.6 + beat * 0.8,
          -10.2 + dx, 6 + beat * 0.6, -11.6 + dx, 4.8 + beat * 0.4, -8 + dx, 3.8, -4 + dx, 1.4,
        ]), m('h.wing'), { group: g, bevel: 1.4, toneBias: bias, local: H });
      };
      wing(-1, 2.2);
      const dome = hairCap(H, 1.2, -3.6, 1.3);
      r.fill(dome, m('h.helm'), { group: g, bevel: 3 });
      r.fill(H.poly([1.4, 1.6, 5.4, 1.6, 5, -3.8, 2.4, -4.4, 1.6, -2.8]), m('h.helm'), { group: g, bevel: 1.6 });
      // Gold crest down the middle and the burning T visor.
      r.fill(intersect(dome, H.rect(1.6, 4, 0.7, 4)), m('h.gold'), { group: g, flat: 3, noLine: true, local: H });
      r.fill(intersect(dome, H.rect(0, 2.1, 9, 0.5)), m('h.gold'), { group: g, flat: 2, noLine: true, local: H });
      r.line(H.x(2.4, 0.2), H.y(2.4, 0.2), H.x(5.2, 0.2), H.y(5.2, 0.2), m('h.visor'), 3, g);
      r.line(H.x(4.4, 0.2), H.y(4.4, 0.2), H.x(4.4, -2.4), H.y(4.4, -2.4), m('h.visor'), 3, g);
      wing(0, 0);
      r.fill(subtract(H.ell(-0.6, 11.6 + beat * 0.3, 5.4, 1.5), H.ell(-0.6, 11.6 + beat * 0.3, 4.2, 0.8)), m('h.halo'), { group: g });
    },
  };
}
