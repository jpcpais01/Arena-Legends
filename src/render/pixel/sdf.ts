/**
 * 2D signed distance functions in pixel space (negative inside). Sprites are
 * built from these shapes and rasterized without anti-aliasing, so the same
 * shape can be drawn at any angle without the smearing of rotated bitmaps.
 */

export type Sdf = (x: number, y: number) => number;

export interface Box {
  x0: number; y0: number; x1: number; y1: number;
}

export interface Shape {
  sdf: Sdf;
  /** Conservative bounds (pixels). */
  box: Box;
}

const len = (x: number, y: number) => Math.sqrt(x * x + y * y);

export function circle(cx: number, cy: number, r: number): Shape {
  return {
    sdf: (x, y) => len(x - cx, y - cy) - r,
    box: { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r },
  };
}

/** Segment a→b whose radius goes from ra to rb (limbs, blades, shafts). */
export function capsule(ax: number, ay: number, bx: number, by: number, ra: number, rb = ra): Shape {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-6;
  const m = Math.max(ra, rb);
  return {
    sdf: (x, y) => {
      let t = ((x - ax) * dx + (y - ay) * dy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return len(x - (ax + dx * t), y - (ay + dy * t)) - (ra + (rb - ra) * t);
    },
    box: { x0: Math.min(ax, bx) - m, y0: Math.min(ay, by) - m, x1: Math.max(ax, bx) + m, y1: Math.max(ay, by) + m },
  };
}

/** Ellipse with radii rx, ry rotated by `rot` radians (approximate distance, exact sign). */
export function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0): Shape {
  const c = Math.cos(rot), s = Math.sin(rot);
  const m = Math.max(rx, ry);
  const k = Math.min(rx, ry);
  return {
    sdf: (x, y) => {
      const px = x - cx, py = y - cy;
      const lx = (px * c + py * s) / rx, ly = (-px * s + py * c) / ry;
      return (len(lx, ly) - 1) * k;
    },
    box: { x0: cx - m, y0: cy - m, x1: cx + m, y1: cy + m },
  };
}

/** Exact polygon distance (any simple polygon), points as flat [x0, y0, x1, y1, ...]. */
export function polygon(pts: number[], round = 0): Shape {
  const n = pts.length / 2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2], y = pts[i * 2 + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return {
    sdf: (px, py) => {
      let d = (px - pts[0]) ** 2 + (py - pts[1]) ** 2;
      let sgn = 1;
      for (let i = 0, j = n - 1; i < n; j = i, i++) {
        const vix = pts[i * 2], viy = pts[i * 2 + 1], vjx = pts[j * 2], vjy = pts[j * 2 + 1];
        const ex = vjx - vix, ey = vjy - viy;
        const wx = px - vix, wy = py - viy;
        let t = (wx * ex + wy * ey) / (ex * ex + ey * ey || 1e-6);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const bx = wx - ex * t, by = wy - ey * t;
        d = Math.min(d, bx * bx + by * by);
        const c1 = py >= viy, c2 = py < vjy, c3 = ex * wy > ey * wx;
        if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sgn = -sgn;
      }
      return sgn * Math.sqrt(d) - round;
    },
    box: { x0: x0 - round, y0: y0 - round, x1: x1 + round, y1: y1 + round },
  };
}

/** Rotated box centred at (cx, cy) with half extents hx, hy and corner rounding. */
export function box(cx: number, cy: number, hx: number, hy: number, rot = 0, round = 0): Shape {
  const c = Math.cos(rot), s = Math.sin(rot);
  const m = len(hx, hy) + round;
  return {
    sdf: (x, y) => {
      const px = x - cx, py = y - cy;
      const lx = Math.abs(px * c + py * s) - hx + round, ly = Math.abs(-px * s + py * c) - hy + round;
      return len(Math.max(lx, 0), Math.max(ly, 0)) + Math.min(Math.max(lx, ly), 0) - round;
    },
    box: { x0: cx - m, y0: cy - m, x1: cx + m, y1: cy + m },
  };
}

/**
 * Ring sector around (cx, cy) between radii r0 and r1, from angle a0 to a1
 * (radians, raster space, any order). Used for weapon smears.
 */
export function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): Shape {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  const mid = (lo + hi) / 2, half = (hi - lo) / 2;
  return {
    sdf: (x, y) => {
      const px = x - cx, py = y - cy;
      const r = len(px, py);
      let a = Math.atan2(py, px) - mid;
      a = ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const radial = Math.max(r0 - r, r - r1);
      const angular = (Math.abs(a) - half) * Math.max(r, 1);
      return Math.max(radial, angular);
    },
    box: { x0: cx - r1, y0: cy - r1, x1: cx + r1, y1: cy + r1 },
  };
}

export function union(...shapes: Shape[]): Shape {
  return {
    sdf: (x, y) => {
      let d = Infinity;
      for (const s of shapes) { const v = s.sdf(x, y); if (v < d) d = v; }
      return d;
    },
    box: shapes.reduce((b, s) => ({
      x0: Math.min(b.x0, s.box.x0), y0: Math.min(b.y0, s.box.y0), x1: Math.max(b.x1, s.box.x1), y1: Math.max(b.y1, s.box.y1),
    }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }),
  };
}

/** Smooth union (blends shapes into one mass: torsos, muscles). */
export function blend(k: number, ...shapes: Shape[]): Shape {
  const u = union(...shapes);
  return {
    sdf: (x, y) => {
      let d = shapes[0].sdf(x, y);
      for (let i = 1; i < shapes.length; i++) {
        const b = shapes[i].sdf(x, y);
        const h = Math.max(k - Math.abs(d - b), 0) / k;
        d = Math.min(d, b) - h * h * k * 0.25;
      }
      return d;
    },
    box: { x0: u.box.x0 - k, y0: u.box.y0 - k, x1: u.box.x1 + k, y1: u.box.y1 + k },
  };
}

/** `a` with `b` carved out. */
export function subtract(a: Shape, b: Shape): Shape {
  return { sdf: (x, y) => Math.max(a.sdf(x, y), -b.sdf(x, y)), box: a.box };
}

export function intersect(a: Shape, b: Shape): Shape {
  return {
    sdf: (x, y) => Math.max(a.sdf(x, y), b.sdf(x, y)),
    box: { x0: Math.max(a.box.x0, b.box.x0), y0: Math.max(a.box.y0, b.box.y0), x1: Math.min(a.box.x1, b.box.x1), y1: Math.min(a.box.y1, b.box.y1) },
  };
}

/** Half-plane keeping the side the normal (nx, ny) points away from, through (px, py). */
export function halfPlane(px: number, py: number, nx: number, ny: number): Shape {
  const l = len(nx, ny) || 1;
  const ux = nx / l, uy = ny / l;
  return { sdf: (x, y) => (x - px) * ux + (y - py) * uy, box: { x0: -1e4, y0: -1e4, x1: 1e4, y1: 1e4 } };
}
