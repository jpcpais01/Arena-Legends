import { material, type Raster } from '../../pixel/raster';
import { intersect, subtract, union, type Shape } from '../../pixel/sdf';
import { flow } from '../../pixel/tex';
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
