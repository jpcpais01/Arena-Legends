import { box, capsule, circle, ellipse, polygon, type Shape } from '../pixel/sdf';
import type { P } from './pose';

/**
 * A local frame placed in raster space: origin, rotation and scale, with
 * helpers that build shapes from local coordinates (y up, like the rig).
 * Raster space has y down, so local y and angles are mirrored on the way in.
 */
export class Xf {
  constructor(
    readonly ox: number,
    readonly oy: number,
    /** Rotation in rig space (counter-clockwise, y up). */
    readonly ang: number,
    readonly sx = 1,
    readonly sy = 1,
  ) {}

  /** Local point to raster coordinates. */
  x(lx: number, ly: number): number {
    return this.ox + (lx * this.sx * Math.cos(this.ang) - ly * this.sy * Math.sin(this.ang));
  }
  y(lx: number, ly: number): number {
    return this.oy - (lx * this.sx * Math.sin(this.ang) + ly * this.sy * Math.cos(this.ang));
  }
  p(lx: number, ly: number): [number, number] {
    return [this.x(lx, ly), this.y(lx, ly)];
  }

  cap(ax: number, ay: number, bx: number, by: number, ra: number, rb = ra): Shape {
    const s = Math.abs(this.sy);
    return capsule(this.x(ax, ay), this.y(ax, ay), this.x(bx, by), this.y(bx, by), ra * s, rb * s);
  }
  circ(cx: number, cy: number, r: number): Shape {
    return circle(this.x(cx, cy), this.y(cx, cy), r * Math.abs(this.sy));
  }
  ell(cx: number, cy: number, rx: number, ry: number, rot = 0): Shape {
    return ellipse(this.x(cx, cy), this.y(cx, cy), rx * Math.abs(this.sx), ry * Math.abs(this.sy), -(this.ang + rot * Math.sign(this.sx * this.sy)));
  }
  poly(pts: number[], round = 0): Shape {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(this.x(pts[i], pts[i + 1]), this.y(pts[i], pts[i + 1]));
    return polygon(out, round);
  }
  rect(cx: number, cy: number, hx: number, hy: number, round = 0): Shape {
    return box(this.x(cx, cy), this.y(cx, cy), hx * Math.abs(this.sx), hy * Math.abs(this.sy), -this.ang, round);
  }
}

/** Frame at rig point `p` (rig space, y up) given the raster origin of the sprite. */
export function frameAt(ox: number, oy: number, p: P, ang: number, sx = 1, sy = 1): Xf {
  return new Xf(ox + p.x, oy - p.y, ang, sx, sy);
}
