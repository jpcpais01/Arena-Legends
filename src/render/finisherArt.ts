import { blob, clamp01, easeOut, line, rnd } from './entranceArt';
import { css, mix } from './pixel/color';

/**
 * The drawn parts of the finishers (the ice that locks the fallen in, petal
 * gusts, the eclipse sky, slash lines, falling stars, the spirit dragon, the
 * great sword of Judgement...): pixel shapes, in screen pixels, that the
 * particles can't make. Light on top comes from the shader layer (or its
 * canvas stand-in). Sizes take a `scale` so the small menu previews get a
 * smaller version of the same thing.
 */

/** Ice crystals locking a body in place: shards jutting out of a frosted core, cracks racing over them before they break. */
export function drawIce(g: CanvasRenderingContext2D, cx: number, cy: number, grow: number, crack: number, scale: number): void {
  if (grow <= 0) return;
  const k = easeOut(grow);
  // The frosted core round the body.
  g.globalAlpha = 0.45;
  blob(g, cx, cy, Math.round(14 * scale * k), Math.round(19 * scale * k), '#9ad8f0');
  g.globalAlpha = 0.35;
  blob(g, cx - 2, cy - 3, Math.round(9 * scale * k), Math.round(13 * scale * k), '#e8fbff');
  g.globalAlpha = 1;
  // Shards, each a long hexagonal crystal: a lit face, a shaded face, a bright edge.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd(i + 3) * 0.5;
    const L = (10 + rnd(i) * 13) * scale * clamp01(grow * 1.6 - i * 0.07);
    if (L < 2) continue;
    const w = Math.max(1, Math.round((2 + rnd(i + 5) * 2) * scale));
    const ux = Math.cos(a), uy = Math.sin(a) * 1.15;
    const x0 = cx + ux * 5 * scale, y0 = cy + uy * 7 * scale;
    for (let j = 0; j <= L; j++) {
      const ww = Math.max(0, Math.round(w * Math.min(1, (L - j) / (w * 1.4))));
      const x = Math.round(x0 + ux * j), y = Math.round(y0 + uy * j);
      g.globalAlpha = 0.85;
      g.fillStyle = '#7ac0e0';
      g.fillRect(x - ww, y, ww, 1);
      g.fillStyle = '#c8f0ff';
      g.fillRect(x, y, ww + 1, 1);
      g.globalAlpha = 1;
      if (j % 3 === 0 || j > L - 2) { g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1); }
    }
  }
  // Cracks racing over the ice as it gives.
  if (crack > 0) {
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      let x = cx + Math.round((rnd(i + 11) - 0.5) * 8 * scale), y = cy + Math.round((rnd(i + 17) - 0.5) * 10 * scale);
      const n = Math.round(16 * scale * crack);
      for (let j = 0; j < n; j++) {
        x += rnd(i * 13 + j) > 0.45 ? 1 : -1;
        y += rnd(i * 7 + j * 3) > 0.5 ? 1 : -1;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
}

/** A flying ice shard: a short thick sliver with a bright edge. */
export function drawShard(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, alpha: number): void {
  g.globalAlpha = alpha;
  const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
  g.fillStyle = '#8ad0f0';
  line(g, x, y, x + dx, y + dy, 2);
  g.fillStyle = '#ffffff';
  line(g, x, y, x + dx * 0.6, y + dy * 0.6);
  g.globalAlpha = 1;
}

/** A burnt patch where lightning or fire struck: charred sand with embers glowing at its rim. */
export function drawScorch(g: CanvasRenderingContext2D, cx: number, gy: number, k: number, t: number, scale: number, hot: number): void {
  if (k <= 0) return;
  const rx = Math.round(20 * scale), ry = Math.max(2, Math.round(4 * scale));
  g.globalAlpha = 0.55 * k;
  blob(g, cx, gy, rx, ry, '#1a1018');
  g.globalAlpha = 0.7 * k;
  blob(g, cx, gy, Math.round(rx * 0.55), Math.max(1, ry - 1), '#0c0810');
  g.globalAlpha = k;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rnd(i) * 0.4;
    if ((Math.floor(t * 9) + i) % 4 === 0) continue;
    g.fillStyle = (i + Math.floor(t * 6)) % 3 ? css(hot) : '#fff4c0';
    g.fillRect(Math.round(cx + Math.cos(a) * rx * (0.7 + rnd(i + 2) * 0.3)), Math.round(gy + Math.sin(a) * ry), 1, 1);
  }
  g.globalAlpha = 1;
}

const PETAL = ['#ffd0e4', '#ffb0d0', '#ff90b8', '#fff0f6', '#f070a0'];
/**
 * A gust of cherry petals sweeping across the view (`dir` the way it blows):
 * curling streams of wind with a thick swarm of petals riding them, densest
 * at the front, thinning out behind. It crosses the stretch `cx` ± `R`
 * (screen px) at about the height `y0` as `k` goes 0 to 1.
 */
export function drawPetalGust(g: CanvasRenderingContext2D, cx: number, R: number, y0: number, k: number, t: number, dir: number, scale: number): void {
  if (k <= 0 || k >= 1.4) return;
  const tail = R * 1.3;
  const front = -R + k * (2 * R + tail);
  const X = (x: number) => Math.round(cx + dir * x);
  const fade = k > 1 ? 1 - (k - 1) / 0.4 : 1;
  // Streams of wind, each a wavy line that curls over at its head.
  for (let i = 0; i < 5; i++) {
    const yb = y0 + (i - 2) * 11 * scale + Math.sin(i * 2.1) * 6 * scale;
    const head = front - rnd(i + 2) * R * 0.25;
    const len = tail * (0.5 + rnd(i + 7) * 0.5);
    for (let j = 0; j < len; j += 1.5) {
      const x = head - j;
      const a = (1 - j / len) * 0.55 * fade;
      if (a <= 0.02) continue;
      const y = yb + Math.sin((x * 0.045 + i * 1.7) + t * 3) * 5 * scale;
      g.globalAlpha = a;
      g.fillStyle = j < 6 ? '#ffffff' : '#ffe4f0';
      g.fillRect(X(x), Math.round(y), 1, 1);
    }
    // The curl: a little loop thrown up at the head.
    for (let a = 0; a < Math.PI * 1.6; a += 0.25) {
      const r = (4 + a * 1.4) * scale;
      g.globalAlpha = 0.6 * fade * (1 - a / (Math.PI * 1.6));
      g.fillStyle = '#ffffff';
      g.fillRect(X(head - 2 + Math.sin(a) * r), Math.round(yb - r + Math.cos(a) * r), 1, 1);
    }
  }
  // The swarm: petals bunched at the front, strung out behind, each tumbling on its own swirl.
  const n = Math.round(150 * scale + 40);
  for (let i = 0; i < n; i++) {
    const lag = (rnd(i) ** 1.8) * tail;
    const x = front - lag;
    if (x < -R * 1.6 || x > R * 1.6) continue;
    const sw = t * (3 + rnd(i + 3) * 3) + i * 1.3;
    const spread = (16 + lag * 0.18) * scale;
    const y = y0 + (rnd(i + 5) - 0.5) * 2 * spread + Math.sin(sw) * 6 * scale + Math.sin(x * 0.03 + i) * 3;
    const px = X(x + Math.cos(sw) * 3 * scale), py = Math.round(y);
    const flat = (Math.floor(sw * 1.5) & 1) === 0;
    g.globalAlpha = fade * (lag < tail * 0.75 ? 1 : 1 - (lag - tail * 0.75) / (tail * 0.25));
    const big = i % 7 === 0 && lag < tail * 0.3;
    g.fillStyle = PETAL[i % PETAL.length];
    if (big) {
      g.fillRect(px - 1, py, 3, flat ? 2 : 1);
      g.fillRect(px, py - 1, 1, flat ? 1 : 3);
    } else g.fillRect(px, py, 2, flat ? 1 : 2);
    if (i % 3 === 0) { g.fillStyle = '#fff4f8'; g.fillRect(px + (flat ? 1 : 0), py, 1, 1); }
  }
  g.globalAlpha = 1;
}

/**
 * The eclipse: the whole view flips to a blood-red sky with a black sun
 * ringed in fire, the ground under it gone to ink. `k` fades it in and out.
 */
export function drawEclipseSky(g: CanvasRenderingContext2D, W: number, H: number, gy: number, sx: number, sy: number, k: number, t: number): void {
  if (k <= 0) return;
  g.globalAlpha = k;
  const sky = g.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, '#2a0008');
  sky.addColorStop(0.55, '#a00818');
  sky.addColorStop(1, '#ff3a2a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, gy);
  g.fillStyle = '#0a0004';
  g.fillRect(0, gy, W, H - gy);
  drawBlackSun(g, sx, sy, Math.round(Math.min(W, H) * 0.2), t);
  g.globalAlpha = 1;
}

/** A black sun with a corona of fire licking round its rim. */
export function drawBlackSun(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number): void {
  const a = g.globalAlpha;
  g.globalAlpha = a * 0.5;
  blob(g, cx, cy, r + 6, r + 6, '#ff5a3a');
  g.globalAlpha = a;
  blob(g, cx, cy, r + 2, r + 2, '#ffd0a0');
  for (let i = 0; i < 28; i++) {
    const ang = (i / 28) * Math.PI * 2;
    const L = 2 + Math.round((rnd(i + Math.floor(t * 14) * 0.37) * 5));
    g.fillStyle = i & 1 ? '#fff0d0' : '#ff8a5a';
    line(g, cx + Math.cos(ang) * (r + 1), cy + Math.sin(ang) * (r + 1), cx + Math.cos(ang) * (r + 1 + L), cy + Math.sin(ang) * (r + 1 + L));
  }
  blob(g, cx, cy, r, r, '#050002');
}

/**
 * A cut across the view: a straight line through (x, y) at angle `a`,
 * reaching `reach` px each way (grown by `k`). `ink` makes it a brush
 * stroke (black, ragged, splattered) round a white core; otherwise it is a
 * clean white line edged in `edge`.
 */
export function drawCut(g: CanvasRenderingContext2D, x: number, y: number, a: number, reach: number, k: number, fade: number, ink: boolean, edge: string): void {
  if (k <= 0 || fade <= 0) return;
  const ux = Math.cos(a), uy = Math.sin(a);
  const L = Math.round(reach * easeOut(k));
  g.globalAlpha = fade;
  for (let i = -L; i <= L; i++) {
    const px = Math.round(x + ux * i), py = Math.round(y + uy * i);
    const taper = 1 - Math.abs(i) / (L + 1);
    if (ink) {
      const w = Math.max(1, Math.round(1 + 4 * taper * (0.7 + 0.3 * rnd(i * 0.13))));
      g.fillStyle = '#08040a';
      g.fillRect(px, py - w, 1, w * 2 + 1);
      if (i % 7 === 0 && taper > 0.2) g.fillRect(px + Math.round((rnd(i) - 0.5) * 6), py + Math.round((rnd(i + 1) - 0.5) * 14), 2, 2);
      g.fillStyle = '#ffffff';
      if (taper > 0.15) g.fillRect(px, py, 1, 1);
    } else {
      g.fillStyle = edge;
      if (taper > 0.1) g.fillRect(px, py - 1, 1, 3);
      g.fillStyle = '#ffffff';
      g.fillRect(px, py, 1, 1);
    }
  }
  g.globalAlpha = 1;
}

/** The sky darkening to night, a field of stars pricking out over it. `full` covers the whole view (battle). */
export function drawNight(g: CanvasRenderingContext2D, W: number, H: number, k: number, t: number, full: boolean): void {
  if (k <= 0) return;
  if (full) {
    g.globalAlpha = 0.62 * k;
    g.fillStyle = '#05030f';
    g.fillRect(0, 0, W, H);
  }
  const n = full ? 70 : 18;
  for (let i = 0; i < n; i++) {
    const on = clamp01((k - rnd(i) * 0.6) / 0.3);
    if (on <= 0) continue;
    const tw = (Math.floor(t * 7 + i) % 5) === 0;
    g.globalAlpha = on * (tw ? 1 : 0.55);
    g.fillStyle = i % 4 ? '#c8d8ff' : '#ffffff';
    g.fillRect(Math.round(rnd(i + 0.5) * W), Math.round(rnd(i + 2.5) * H * 0.75), 1, 1);
  }
  g.globalAlpha = 1;
}

/** A falling star: a bright four-point head and a tapering trail behind it, along (dx, dy). */
export function drawFallingStar(g: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, size: number, t: number, tint: string): void {
  const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const T = Math.round(14 * size);
  for (let i = T; i >= 1; i--) {
    g.globalAlpha = (1 - i / (T + 1)) * 0.9;
    g.fillStyle = i < T * 0.3 ? '#ffffff' : tint;
    const w = Math.max(1, Math.round(size * 2 * (1 - i / T)));
    g.fillRect(Math.round(x - ux * i * 1.6), Math.round(y - uy * i * 1.6), w, w);
  }
  g.globalAlpha = 1;
  const r = Math.round(2 * size + ((Math.floor(t * 20) & 1) ? 1 : 0));
  g.fillStyle = tint;
  g.fillRect(Math.round(x) - r, Math.round(y), r * 2 + 1, 1);
  g.fillRect(Math.round(x), Math.round(y) - r, 1, r * 2 + 1);
  g.fillStyle = '#ffffff';
  g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
}

/** One point along the spirit dragon's body (screen px) and how near the viewer it is (−1 behind .. 1 in front). */
export interface DragonPt { x: number; y: number; z: number }

/**
 * The spirit dragon: a glowing serpent body from tail to head (`pts`, head
 * last), drawn only where its depth matches the layer, so it coils behind
 * and in front of the winner. Scales run down its back, a pale belly under
 * it, a crest of fins, and a horned head with whiskers trailing; `open`
 * drops the jaw (the roar).
 */
export function drawDragon(g: CanvasRenderingContext2D, pts: DragonPt[], front: boolean, alpha: number, open: number, hi: number, lo: number, scale: number, t: number): void {
  if (alpha <= 0 || pts.length < 3) return;
  const body = css(mix(hi, lo, 0.35)), dark = css(lo), light = css(mix(hi, 0xffffff, 0.45)), white = '#ffffff';
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if ((p.z >= 0) !== front) continue;
    const u = i / (n - 1);
    const r = Math.max(1, Math.round((1.2 + 4.2 * Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.5)) * scale));
    const q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    const nx = -(q.y - o.y), ny = q.x - o.x, nl = Math.hypot(nx, ny) || 1;
    // Shimmer as it moves: every few scales flicker brighter.
    const lit = (i + Math.floor(t * 18)) % 6 === 0;
    g.globalAlpha = alpha * (front ? 0.95 : 0.7);
    blob(g, p.x, p.y, r, r, lit ? light : body);
    g.fillStyle = dark;
    g.fillRect(Math.round(p.x + (nx / nl) * r), Math.round(p.y + (ny / nl) * r), 1, 1);
    // Belly plates on the underside, the crest along the back.
    g.fillStyle = light;
    g.fillRect(Math.round(p.x - (nx / nl) * (r - 1)), Math.round(p.y - (ny / nl) * (r - 1)), 1, 1);
    if (i % 4 === 0 && u > 0.1 && u < 0.92) {
      g.fillStyle = white;
      g.fillRect(Math.round(p.x + (nx / nl) * (r + 1)), Math.round(p.y + (ny / nl) * (r + 1)), 1, 2);
    }
  }
  const h = pts[n - 1], b = pts[n - 3];
  if ((h.z >= 0) !== front) { g.globalAlpha = 1; return; }
  // The head, pointing along the last stretch of body.
  const dx = h.x - b.x, dy = h.y - b.y, dl = Math.hypot(dx, dy) || 1;
  const ux = dx / dl, uy = dy / dl, px = -uy, py = ux;
  const up = py < 0 ? 1 : -1; // which side of the head is "up" on screen
  const S = scale;
  const at = (f: number, s: number): [number, number] => [h.x + ux * f * S + px * up * s * S, h.y + uy * f * S + py * up * s * S];
  g.globalAlpha = alpha;
  // Horns sweeping back.
  g.fillStyle = light;
  for (const [f, s, L] of [[-2, 4, 8], [-1, 3, 6]] as const) {
    const [x0, y0] = at(f, s), [x1, y1] = at(f - L, s + L * 0.55);
    line(g, x0, y0, x1, y1);
  }
  // Skull and snout; the jaw drops open below for the roar.
  let [x, y] = at(0, 0);
  blob(g, x, y, Math.round(5 * S), Math.round(4 * S), body);
  [x, y] = at(5, 0.5);
  blob(g, x, y, Math.round(4 * S), Math.round(3 * S), body);
  [x, y] = at(8, 0.5);
  blob(g, x, y, Math.round(2.5 * S), Math.round(2.2 * S), light);
  const jaw = open * 3;
  [x, y] = at(5, -2.5 - jaw);
  blob(g, x, y, Math.round(4 * S), Math.max(1, Math.round(1.6 * S)), dark);
  if (open > 0.3) {
    // Fangs and a glowing throat.
    [x, y] = at(6, -1 - jaw * 0.5);
    blob(g, x, y, Math.round(2 * S), Math.max(1, Math.round(jaw * 0.6 * S)), white);
  }
  // The eye: a bright slit, the brightest pixel on screen.
  [x, y] = at(1, 1.5);
  g.fillStyle = white;
  g.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
  g.fillStyle = css(hi);
  g.fillRect(Math.round(x), Math.round(y), 1, 1);
  // Whiskers trailing back in a wave.
  g.fillStyle = light;
  for (const s of [1, -1]) {
    for (let j = 0; j < 14; j++) {
      const [wx, wy] = at(7 - j * 1.4, s * (1.5 + j * 0.3) + Math.sin(t * 10 + j * 0.6) * j * 0.18);
      g.globalAlpha = alpha * (1 - j / 14);
      g.fillRect(Math.round(wx), Math.round(wy), 1, 1);
    }
  }
  g.globalAlpha = 1;
}

/**
 * The great sword of Judgement, point down: the tip at (x, tip), a blade
 * `len` px long rising from it to a winged golden guard, the grip and a
 * pommel, a gem set in the guard. `glow` brightens its edges.
 */
export function drawGreatSword(g: CanvasRenderingContext2D, x: number, tip: number, len: number, scale: number, glow: number, gem: number, alpha: number): void {
  if (alpha <= 0) return;
  const w = Math.max(2, Math.round(5 * scale));
  const top = tip - len;
  g.globalAlpha = alpha;
  // Blade: an edge on each side, a fuller down the middle, tapering to the point.
  for (let y = top; y <= tip; y++) {
    const k = (y - top) / len;
    const ww = k > 0.82 ? Math.max(0, Math.round(w * (1 - (k - 0.82) / 0.18))) : w;
    g.fillStyle = '#c8b070';
    g.fillRect(x - ww, y, ww * 2 + 1, 1);
    g.fillStyle = '#fff8e0';
    g.fillRect(x - ww + 1, y, Math.max(1, ww - 1), 1);
    if (ww > 2 && k < 0.78) { g.fillStyle = '#d8b850'; g.fillRect(x, y, 1, 1); }
    if (glow > 0 && (y + Math.floor(glow * 40)) % 9 === 0) { g.fillStyle = '#ffffff'; g.fillRect(x - ww, y, 1, 1); }
  }
  // Guard: swept wings of gold, darker underneath.
  const gw = Math.round(17 * scale), gy = top - 1;
  for (let i = -gw; i <= gw; i++) {
    const lift = Math.round(((Math.abs(i) / gw) ** 2) * 4 * scale);
    g.fillStyle = '#8a5a10';
    g.fillRect(x + i, gy - lift + 1, 1, Math.max(2, Math.round(3 * scale)));
    g.fillStyle = Math.abs(i) % 5 === 0 ? '#fff0a0' : '#ffd040';
    g.fillRect(x + i, gy - lift, 1, Math.max(1, Math.round(2 * scale)));
  }
  blob(g, x, gy, Math.round(3 * scale), Math.round(3 * scale), '#ffd040');
  blob(g, x, gy, Math.max(1, Math.round(1.6 * scale)), Math.max(1, Math.round(1.6 * scale)), css(gem));
  g.fillStyle = '#ffffff';
  g.fillRect(x - 1, gy - 1, 1, 1);
  // Grip and pommel.
  const gl = Math.round(14 * scale);
  for (let y = 0; y < gl; y++) {
    g.fillStyle = y % 3 ? '#6a3a20' : '#a86a30';
    g.fillRect(x - Math.max(1, Math.round(1.5 * scale)), gy - 3 * scale - y, Math.max(2, Math.round(3 * scale)), 1);
  }
  blob(g, x, Math.round(gy - 3 * scale - gl - 2 * scale), Math.round(3 * scale), Math.round(3 * scale), '#ffd040');
  g.globalAlpha = 1;
}

/** A ring of golden runes turning in the sky. */
export function drawRuneRing(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, k: number, t: number): void {
  if (k <= 0) return;
  const R = r * easeOut(k), ry = R * 0.32;
  g.globalAlpha = Math.min(1, k * 1.4);
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    g.fillStyle = '#ffe070';
    g.fillRect(Math.round(cx + Math.cos(a) * R), Math.round(cy + Math.sin(a) * ry), 1, 1);
    if (i % 2 === 0) g.fillRect(Math.round(cx + Math.cos(a) * R * 0.8), Math.round(cy + Math.sin(a) * ry * 0.8), 1, 1);
  }
  // Rune marks between the two rings, turning.
  g.fillStyle = '#fff8d0';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + t * 0.8;
    const x = Math.round(cx + Math.cos(a) * R * 0.9), y = Math.round(cy + Math.sin(a) * ry * 0.9);
    g.fillRect(x, y - 1, 1, 3);
    if (i % 3 === 0) g.fillRect(x - 1, y, 3, 1);
  }
  g.globalAlpha = 1;
}

/** A rock to put a foot up on (the Champion pose): a rough lump with a lit top and a dark base. */
export function drawRock(g: CanvasRenderingContext2D, cx: number, gy: number, w: number, h: number): void {
  blob(g, cx, gy - Math.round(h * 0.45), w, Math.max(1, Math.round(h * 0.6)), '#4a4048');
  blob(g, cx - 1, gy - Math.round(h * 0.6), w - 2, Math.max(1, Math.round(h * 0.4)), '#7a6c70');
  g.fillStyle = '#a89a98';
  g.fillRect(cx - w + 3, gy - h, w * 2 - 7, 1);
  g.fillStyle = '#2a2228';
  g.fillRect(cx - w, gy, w * 2, 1);
}
