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
