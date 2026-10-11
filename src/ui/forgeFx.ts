import type { SkinRarity } from '../character/skins';
import { TIER_LIGHT } from './chestFx';
import { SceneGl } from './sceneGl';

/**
 * The forge, drawn on one low-res canvas like the chest (one art pixel = `k`
 * CSS pixels, blitted pixelated): a stone furnace with a living fire, an anvil
 * on its stump and a hammer. Forging plays out on it: spares melt in the
 * furnace, molten metal arcs onto the anvil, the hammer strikes it into shape
 * in a shower of sparks, and a hiss of steam quenches the new skin.
 */

const RAINBOW = ['#ffd860', '#ff7ac8', '#b07aff', '#7ad8ff', '#7ff0e0'];
const INK = '#0a0612';
const STONE = ['#1c1626', '#2c2438', '#3d334c', '#52476a'];
const IRON = ['#15121c', '#262233', '#3a3550', '#5a5478', '#8a84a8'];
const WOOD = ['#2a160e', '#4a2a18', '#6b3e22', '#8a5530'];
/** Heat ramp, cold to white hot. */
const HEAT = ['#3a0a06', '#8a1a0a', '#d8400e', '#ff8a1a', '#ffd24a', '#fff6c8'];

interface Part { x: number; y: number; vx: number; vy: number; t: number; life: number; col: string; s: number; g: number; star: boolean; puff: boolean }
interface Ring { x: number; y: number; r: number; v: number; t: number; life: number; col: string }

// Scene layout in art px, relative to the anchor (ground line, anvil centre).
const FURNACE = { x0: -74, x1: -32, top: -44 };
const MOUTH = { x0: -64, x1: -42, top: -26, bottom: -6 };
const CHIMNEY = { x0: -60, x1: -46, top: -70 };
const ANVIL_TOP = -23;
/** Where the hammer turns, and its reach to the metal on the anvil. */
const PIVOT = { x: 26, y: -34 };
const REACH = 23;
const A_STRIKE = Math.atan2(ANVIL_TOP - 4 - PIVOT.y, 2 - PIVOT.x);
const A_REST = A_STRIKE + 1.25;
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

/**
 * The smithy behind the forge, drawn once per size: a soot-dark brick wall
 * under a timber beam, a rack of tongs and hammers, a quench barrel, chains,
 * and a stone floor. The anvil stands at (ax, ay); the room is twice the
 * screen each way so it covers it wherever the scene pans.
 */
function smithyArt(sw: number, sh: number): { c: HTMLCanvasElement; ax: number; ay: number } {
  const RW = sw * 2 + 120, RH = sh * 2;
  const c = document.createElement('canvas');
  c.width = RW; c.height = RH;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const X = Math.round(RW / 2), Y = sh, seam = Y - 12;
  px(0, 0, RW, seam, '#120a0c');
  const BR = ['#2a1a1c', '#2f1d1f', '#251618', '#33201f'];
  for (let r = 0, y = seam; y > -8; r++, y -= 7) {
    const off = (r & 1) * 7;
    for (let x = -14 + off; x < RW; x += 14) {
      px(x + 1, y - 6, 13, 6, BR[Math.floor(hash(x * 0.41 + r * 11.3) * BR.length)]);
      px(x + 1, y - 6, 13, 1, '#3d2826');
      if (hash(x * 1.7 + r) > 0.8) px(x + 3, y - 4, 5, 2, '#1a1012');
    }
  }
  // Soot climbing the wall behind the furnace.
  const soot = g.createRadialGradient(X - 53, seam - 40, 4, X - 53, seam - 40, 60);
  soot.addColorStop(0, 'rgba(8, 4, 6, 0.75)');
  soot.addColorStop(1, 'rgba(8, 4, 6, 0)');
  g.fillStyle = soot; g.fillRect(X - 120, seam - 110, 140, 110);
  // Timber beam and its posts.
  const beam = seam - 96;
  px(0, beam - 1, RW, 10, INK); px(0, beam, RW, 8, WOOD[1]); px(0, beam, RW, 1, WOOD[3]); px(0, beam + 6, RW, 1, WOOD[0]);
  for (let x = 0; x < RW; x += 23) px(x + Math.floor(hash(x) * 10), beam + 3, 6, 1, WOOD[0]);
  for (const s of [-1, 1]) {
    const cx = X + s * 118;
    px(cx - 7, beam, 14, seam - beam, INK); px(cx - 6, beam, 12, seam - beam, WOOD[1]); px(cx - 6, beam, 2, seam - beam, WOOD[3]); px(cx + 3, beam, 3, seam - beam, WOOD[0]);
  }
  // Hanging chains with hooks.
  for (const cx of [X - 6, X + 84]) {
    for (let y = beam + 8; y < beam + 34; y += 3) { px(cx, y, 2, 2, IRON[2]); px(cx, y, 1, 1, IRON[4]); }
    px(cx - 1, beam + 34, 1, 4, IRON[3]); px(cx - 1, beam + 37, 4, 1, IRON[3]); px(cx + 2, beam + 35, 1, 2, IRON[3]);
  }
  // Tool rack: a board with tongs, a hammer and a file.
  const rx = X + 36, ry = seam - 70;
  px(rx - 1, ry - 1, 44, 6, INK); px(rx, ry, 42, 4, WOOD[2]); px(rx, ry, 42, 1, WOOD[3]);
  for (const [tx, len] of [[5, 26], [16, 22], [27, 24], [37, 18]] as const) {
    px(rx + tx - 1, ry + 4, 3, len, INK);
    px(rx + tx, ry + 4, 1, len, IRON[3]);
  }
  px(rx + 13, ry + 24, 8, 4, INK); px(rx + 14, ry + 25, 6, 2, IRON[3]);
  px(rx + 3, ry + 28, 5, 3, IRON[2]);
  // Floor: big worn flagstones.
  px(0, seam, RW, RH - seam, '#1c1214');
  px(0, seam, RW, 1, '#3a2624'); px(0, seam + 1, RW, 1, '#0e0809');
  for (let r = 0, y = seam + 2; y < RH; r++) {
    const hgt = 4 + r * 2;
    px(0, y + hgt, RW, 1, '#0e0809');
    const S = 20 + r * 6, off = (r & 1) * S / 2;
    for (let x = X - 400 + off; x < RW; x += S) { px(x, y + 1, 1, hgt - 1, '#120b0c'); px(x + 1, y + 1, S * 0.5, 1, '#271a1b'); }
    y += hgt + 1;
  }
  // Quench barrel on the right.
  const bx = X + 48, bt = Y - 18;
  px(bx - 1, bt - 1, 18, 19, INK); px(bx, bt, 16, 18, WOOD[2]);
  for (const x of [3, 8, 13]) px(bx + x, bt + 1, 1, 17, WOOD[1]);
  px(bx, bt, 16, 2, WOOD[3]);
  for (const y of [4, 12]) { px(bx, bt + y, 16, 2, IRON[2]); px(bx, bt + y, 16, 1, IRON[3]); }
  px(bx + 1, bt + 1, 14, 1, '#3a5a7a');
  // Light falloff.
  const up = g.createLinearGradient(0, seam - 130, 0, seam);
  up.addColorStop(0, 'rgba(6, 3, 4, 0.8)');
  up.addColorStop(1, 'rgba(6, 3, 4, 0)');
  g.fillStyle = up; g.fillRect(0, 0, RW, seam);
  const pool = g.createRadialGradient(X - 30, seam - 10, 30, X - 30, seam - 10, sw * 0.95);
  pool.addColorStop(0, 'rgba(6, 3, 4, 0)');
  pool.addColorStop(1, 'rgba(6, 3, 4, 0.72)');
  g.fillStyle = pool; g.fillRect(0, 0, RW, RH);
  return { c, ax: X, ay: Y };
}

export class ForgeFx {
  readonly src: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private readonly gl: SceneGl;
  private room: ReturnType<typeof smithyArt> | null = null;
  k = 3;
  w = 0;
  h = 0;
  private home = { x: 0, y: 0 };
  private at = { x: 0, y: 0 };
  private center = false;
  private t = 0;

  /** Furnace heat (0 idle embers .. 1 roaring) and its flame colour. */
  heat = 0.3;
  private heatTarget = 0.3;
  private flameTier: SkinRarity | null = null;
  /** Molten metal in flight from the furnace to the anvil (0..1), and the bar on the anvil. */
  private pourT = -1;
  private bar = 0;
  /** How shaped the bar is (one step per strike, 0..3) and its glow (1 white hot .. 0 cooled). */
  private shaped = 0;
  private barHeat = 0;
  private barTier: SkinRarity = 'rare';
  /** Hammer: shown (0..1) and its swing (0 raised .. 1 on the metal). */
  private hammer = 0;
  private hammerTarget = 0;
  private swing = 0;
  private swingV = 0;
  private shake = 0;
  private flash = 0;
  private flashCol = '#ffffff';
  dim = 0;
  private dimTarget = 0;
  /** The smithy fades back while the new skin is shown (1 seen .. 0 gone). */
  private scene = 1;
  private sceneTarget = 1;
  /** The light pillar for a legendary or epic result, and epic's falling stars. */
  private beam = 0;
  private beamTarget = 0;
  private beamTier: SkinRarity = 'legendary';
  private starfall = 0;
  private halo: { x: number; y: number; r: number; tier: SkinRarity } | null = null;
  private haloT = 0;
  private parts: Part[] = [];
  private rings: Ring[] = [];
  private emberT = 0;
  private raf = 0;
  private last = 0;

  constructor() {
    this.src = document.createElement('canvas');
    this.src.className = 'chest-fx forge-fx';
    this.g = this.src.getContext('2d')!;
    this.gl = new SceneGl(this.src);
    this.gl.canvas.className = 'chest-fx forge-fx';
    this.gl.vignette = { col: '#000000', k: 0.5 };
    this.gl.onLost = () => { this.gl.canvas.replaceWith(this.src); };
  }

  /** The element to put on screen (the shader layer, or the plain canvas without WebGL2). */
  get canvas(): HTMLCanvasElement {
    return this.gl.ok ? this.gl.canvas : this.src;
  }

  resize(): void {
    const r = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.k = Math.max(2, Math.floor((r.height * 0.62) / 76));
    this.w = Math.ceil(r.width / this.k);
    this.h = Math.ceil(r.height / this.k);
    this.src.width = this.w;
    this.src.height = this.h;
    this.src.style.width = `${this.w * this.k}px`;
    this.src.style.height = `${this.h * this.k}px`;
    this.gl.resize(this.k);
    this.room = smithyArt(this.w, this.h);
  }

  private hue(tier: SkinRarity, bright: boolean): string {
    return TIER_LIGHT[tier][bright ? 1 : 0];
  }
  /** Screen point (CSS px, relative to the canvas) of the metal on the anvil. */
  get barPx(): { x: number; y: number } {
    return { x: this.barAt.x * this.k, y: this.barAt.y * this.k };
  }
  private get barAt(): { x: number; y: number } {
    return { x: this.at.x + 2, y: this.at.y + ANVIL_TOP - 3 };
  }

  /** The scene stands on the bottom of an element's box, centred in it. */
  anchor(el: HTMLElement): void {
    const c = this.canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!r.width) return;
    this.home = { x: Math.round((r.left + r.width / 2 - c.left) / this.k) + 22, y: Math.round((r.bottom - c.top) / this.k) - 6 };
    if (!this.at.x) this.at = { ...this.home };
  }

  setCentered(on: boolean): void {
    this.center = on;
    this.dimTarget = on ? 0.3 : 0;
    this.gl.vignette.k = on ? 0.75 : 0.5;
  }

  /** Screen point (CSS px, relative to the canvas) of the furnace mouth. */
  get mouthPx(): { x: number; y: number } {
    return { x: (this.at.x + (MOUTH.x0 + MOUTH.x1) / 2) * this.k, y: (this.at.y + (MOUTH.top + MOUTH.bottom) / 2) * this.k };
  }

  /** Art-px point of a screen element's centre. */
  pointOf(el: Element): { x: number; y: number } {
    const c = this.canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - c.left) / this.k, y: (r.top + r.height / 2 - c.top) / this.k };
  }

  reset(): void {
    this.heatTarget = 0.3;
    this.flameTier = null;
    this.pourT = -1;
    this.bar = 0;
    this.shaped = 0;
    this.barHeat = 0;
    this.hammerTarget = 0;
    this.swing = 0;
    this.swingV = 0;
    this.shake = 0;
    this.beamTarget = 0;
    this.starfall = 0;
    this.halo = null;
    this.sceneTarget = 1;
    this.parts.length = 0;
    this.rings.length = 0;
    this.gl.clear();
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      if (this.gl.ok) {
        // Heat shimmer over the furnace, stronger the hotter it burns.
        const ax = this.at.x, ay = this.at.y;
        this.gl.haze = { x0: ax + FURNACE.x0 + 4, y0: ay + CHIMNEY.top - 30, x1: ax + FURNACE.x1 - 2, y1: ay + MOUTH.top + 4, amp: (0.35 + this.heat * 1.1) * this.scene };
        this.gl.cam = { x: this.barAt.x - 20, y: this.barAt.y, zoom: this.zoom };
        this.gl.render(dt);
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.gl.clear();
  }
  private zoom = 1;
  private punch = 0;
  private beamLight: import('./sceneGl').Glow | null = null;

  color(tier: SkinRarity, bright = false, i = 0): string {
    if (tier === 'epic') return RAINBOW[(i + Math.floor(this.t * 6)) % RAINBOW.length];
    return TIER_LIGHT[tier][bright ? 1 : 0];
  }

  // --- The steps of a forging ------------------------------------------------------------------

  /** The spares drop in: the fire roars up in their colour. */
  feed(tier: SkinRarity): void {
    this.flameTier = tier;
    this.heatTarget = 1;
    this.shake = 1;
    const m = this.mouth();
    this.rings.push({ x: m.x, y: m.y, r: 3, v: 70, t: 0, life: 0.5, col: this.color(tier, true) });
    for (let i = 0; i < 40; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const v = 30 + Math.random() * 80;
      this.spark(m.x + (Math.random() - 0.5) * 14, m.y, Math.cos(a) * v, Math.sin(a) * v, Math.random() < 0.5 ? HEAT[4] : this.color(tier, true, i), 0.5 + Math.random() * 0.6, 60, i % 4 === 0);
    }
    this.gl.add({ kind: 'glow', x: m.x, y: m.y - 4, r0: 14, r1: 40, hi: this.hue(tier, true), lo: HEAT[2], power: 0.9, life: 1.1 });
    this.gl.shock(m.x, m.y, 50, 2, 0.6, HEAT[4]);
    this.punch = 0.04;
  }

  /** Molten metal leaps from the furnace onto the anvil. */
  pour(tier: SkinRarity): void {
    this.pourT = 0;
    this.barTier = tier;
    this.hammerTarget = 1;
    this.gl.add({ kind: 'glow', x: 0, y: 0, follow: () => (this.pourT >= 0 ? this.pourPos() : this.barAt), r0: 8, r1: 14, hi: HEAT[5], lo: HEAT[3], power: 0.8, life: 0.9 });
  }

  /** One hammer blow (`n` = 0, 1, 2; the last is the hardest). */
  strike(n: number): void {
    this.swingV = 9 + n * 2;
    this.swing = 0.0001;
    this.strikeN = n;
  }
  private strikeN = 0;
  /** Called as each blow lands (0, 1, 2), for its sound. */
  onLand: ((n: number) => void) | null = null;

  /** The blow lands: sparks, a ring, a flash, the bar takes shape and shows its colour. */
  private land(): void {
    const n = this.strikeN;
    this.onLand?.(n);
    const x = this.at.x + 2, y = this.at.y + ANVIL_TOP - 3;
    this.shaped = n + 1;
    this.barHeat = Math.max(0.35, 1 - (n + 1) * 0.2);
    this.shake = 1.4 + n * 0.8;
    this.flashOnce(n === 2 ? this.color(this.barTier, true) : HEAT[5], 0.18 + n * 0.12);
    this.rings.push({ x, y, r: 2, v: 90 + n * 40, t: 0, life: 0.4, col: n === 2 ? this.color(this.barTier, true) : HEAT[4] });
    for (let i = 0; i < 46 + n * 24; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.9;
      const v = 50 + Math.random() * (110 + n * 40);
      const hot = Math.random() < 0.6;
      this.spark(x + (Math.random() - 0.5) * 6, y, Math.cos(a) * v, Math.sin(a) * v, hot ? HEAT[3 + Math.floor(Math.random() * 3)] : this.color(this.barTier, true, i), 0.4 + Math.random() * 0.7, 140, Math.random() < 0.25);
    }
    const hi = n === 2 ? this.hue(this.barTier, true) : HEAT[5];
    this.gl.shock(x, y, 50 + n * 30, 2 + n * 1.4, 0.55, hi);
    this.gl.add({ kind: 'star', x, y, r0: 14 + n * 6, r1: 26 + n * 10, w: 0.8, hi, lo: HEAT[3], power: 1, life: 0.35 });
    this.gl.add({ kind: 'glow', x, y, r0: 8, r1: 20 + n * 6, hi, lo: HEAT[2], power: 0.5, life: 0.4 });
    this.gl.split(1 + n * 0.8, 0.3);
    if (n === 2) this.gl.zoomBlur(x, y, 0.18, 0.35);
    this.punch = 0.03 + n * 0.025;
  }

  /** Legendary or epic: the room darkens and light pours up out of the metal. */
  omen(tier: SkinRarity): void {
    this.beamTier = tier;
    this.beamTarget = 1;
    this.dimTarget = 0.9;
    this.barHeat = 1;
    this.shake = 2;
    if (tier === 'epic') this.starfall = 1;
    const x = this.at.x + 2, y = this.at.y + ANVIL_TOP - 3;
    for (let i = 0; i < 3; i++) this.rings.push({ x, y, r: 3, v: 150 + i * 60, t: -i * 0.12, life: 0.8, col: this.color(tier, true, i) });
    this.beamLight = this.gl.add({ kind: 'beam', x, y, r0: y + 20, r1: y + 20, w: tier === 'epic' ? 15 : 11, rot: -Math.PI / 2, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 1, life: 2.6, fin: 0.05, hold: true });
    this.gl.shock(x, y, 110, 3, 0.8, this.hue(tier, true));
    this.gl.vignette.k = 0.95;
  }

  slam(tier: SkinRarity): void {
    this.flashOnce(this.color(tier, true), 0.7);
    const x = this.at.x + 2, y = this.at.y + ANVIL_TOP - 30;
    this.rings.push({ x, y, r: 8, v: 240, t: 0, life: 0.9, col: this.color(tier, true) });
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 150;
      this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, this.color(tier, Math.random() < 0.5, i), 0.6 + Math.random() * 0.8, 50, Math.random() < 0.4);
    }
    this.gl.impact(this.hue(tier, true), INK, 0.09);
    this.gl.shock(x, y, 190, 6, 1, this.hue(tier, true));
    this.gl.split(3, 0.5);
    this.punch = 0.08;
  }

  /** Quench: a burst of steam swallows the bar (the card comes out of it). */
  quench(tier: SkinRarity): void {
    this.beamTarget = 0;
    this.starfall = 0;
    this.dimTarget = this.center ? 0.55 : 0;
    this.hammerTarget = 0;
    this.heatTarget = 0.45;
    this.bar = 0;
    this.sceneTarget = 0.12;
    this.flashOnce('#ffffff', 0.7);
    this.gl.vignette.k = this.center ? 0.75 : 0.5;
    this.gl.end(this.beamLight);
    this.beamLight = null;
    {
      const b = this.barAt;
      this.gl.shock(b.x, b.y, 130, 4, 0.8, '#ffffff');
      this.gl.add({ kind: 'flare', x: b.x, y: b.y, r0: 50, r1: 130, w: 2.2, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 1.1, life: 0.7 });
      this.gl.add({ kind: 'rays', x: b.x, y: b.y, r0: 50, r1: 170, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 0.5, life: 2.4, seed: Math.random() * 50 });
    }
    const x = this.at.x + 2, y = this.at.y + ANVIL_TOP - 3;
    for (let i = 0; i < 50; i++) {
      const v = 20 + Math.random() * 50;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      this.parts.push({ x: x + (Math.random() - 0.5) * 16, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.9 + Math.random() * 0.9, col: Math.random() < 0.6 ? '#d8d0e8' : '#ffffff', s: 2 + Math.floor(Math.random() * 3), g: -18, star: false, puff: true });
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 120;
      this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, this.color(tier, Math.random() < 0.5, i), 0.5 + Math.random() * 0.7, 40, Math.random() < 0.35);
    }
  }

  /** Sparkles circling a revealed card; null stops them. */
  setHalo(el: Element | null, tier: SkinRarity = 'legendary'): void {
    if (!el) { this.halo = null; return; }
    const p = this.pointOf(el), r = el.getBoundingClientRect();
    this.halo = { x: p.x, y: p.y, r: Math.max(r.width, r.height) / this.k / 2 + 3, tier };
  }

  /** A burst at a point (the revealed card). */
  pop(x: number, y: number, tier: SkinRarity, n = 30): void {
    const big = tier === 'epic' ? 2 : 1;
    this.rings.push({ x, y, r: 3, v: 80 * big, t: 0, life: 0.45, col: this.color(tier, true) });
    for (let i = 0; i < n * big; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 20 + Math.random() * 90 * big;
      this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, this.color(tier, Math.random() < 0.5, i), 0.4 + Math.random() * 0.6, 40, Math.random() < 0.3);
    }
    const r = ['rare', 'mythic', 'legendary', 'epic'].indexOf(tier);
    this.gl.add({ kind: 'star', x, y, r0: 12 + r * 8, r1: 24 + r * 12, w: 0.8, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 0.9, life: 0.6 });
    this.gl.add({ kind: 'glow', x, y, r0: 20, r1: 40 + r * 6, hi: this.hue(tier, true), lo: this.hue(tier, false), power: 0.6, life: 1.4 });
    if (r >= 2) this.gl.impact(this.hue(tier, true), INK, 0.07);
  }

  flashOnce(col: string, a: number): void {
    this.flashCol = col;
    this.flash = Math.max(this.flash, a);
  }

  // --- Simulation ------------------------------------------------------------------------------

  private mouth(): { x: number; y: number } {
    return { x: this.at.x + (MOUTH.x0 + MOUTH.x1) / 2, y: this.at.y + MOUTH.bottom - 6 };
  }

  private spark(x: number, y: number, vx: number, vy: number, col: string, life: number, g: number, star: boolean): void {
    if (this.parts.length > 500) this.parts.shift();
    this.parts.push({ x, y, vx, vy, t: 0, life, col, s: Math.random() < 0.3 ? 2 : 1, g, star, puff: false });
  }

  private update(dt: number): void {
    this.t += dt;
    const target = this.center ? { x: Math.round(this.w / 2) + 22, y: Math.round(this.h * 0.72) } : this.home;
    const e = 1 - Math.exp(-dt * 9);
    this.at.x += (target.x - this.at.x) * e;
    this.at.y += (target.y - this.at.y) * e;
    this.dim += (this.dimTarget - this.dim) * (1 - Math.exp(-dt * 6));
    this.punch *= Math.exp(-dt * 7);
    this.zoom += ((this.center && this.sceneTarget > 0.5 ? 1.06 : 1) + this.punch - this.zoom) * (1 - Math.exp(-dt * 8));
    this.scene += (this.sceneTarget - this.scene) * (1 - Math.exp(-dt * 4));
    this.heat += (this.heatTarget - this.heat) * (1 - Math.exp(-dt * 3));
    this.hammer += (this.hammerTarget - this.hammer) * (1 - Math.exp(-dt * 8));
    this.beam += (this.beamTarget - this.beam) * (1 - Math.exp(-dt * (this.beamTarget > this.beam ? 5 : 3)));
    this.flash = Math.max(0, this.flash - dt * 2.6);
    this.shake = Math.max(0, this.shake - dt * 5);
    if (this.bar > 0 && this.beamTarget === 0) this.barHeat = Math.max(0.3, this.barHeat - dt * 0.12);

    // Molten metal in flight: an arc from the furnace to the anvil, dripping sparks.
    if (this.pourT >= 0) {
      this.pourT += dt / 0.6;
      const p = this.pourPos();
      this.spark(p.x, p.y, (Math.random() - 0.5) * 20, 10, HEAT[3 + Math.floor(Math.random() * 3)], 0.4, 120, false);
      if (this.pourT >= 1) {
        this.pourT = -1;
        this.bar = 1;
        this.barHeat = 1;
        this.shaped = 0;
        const x = this.at.x + 2, y = this.at.y + ANVIL_TOP - 2;
        for (let i = 0; i < 24; i++) this.spark(x, y, (Math.random() - 0.5) * 80, -Math.random() * 60, HEAT[3 + Math.floor(Math.random() * 3)], 0.5, 120, false);
        this.heatTarget = 0.7;
      }
    }

    // The hammer: swings down fast, lands, then lifts back.
    if (this.swingV > 0) {
      this.swing += this.swingV * dt;
      if (this.swing >= 1) { this.swing = 1; this.swingV = -3.2; this.land(); }
    } else if (this.swingV < 0) {
      this.swing += this.swingV * dt;
      if (this.swing <= 0) { this.swing = 0; this.swingV = 0; }
    }

    // Embers from the fire, more of them the hotter it burns; the chimney smokes.
    this.emberT -= dt;
    if (this.emberT <= 0) {
      this.emberT = 0.16 - this.heat * 0.13;
      const m = this.mouth();
      const col = this.flameTier && Math.random() < 0.4 ? this.color(this.flameTier, true, Math.floor(Math.random() * 5)) : HEAT[2 + Math.floor(Math.random() * 4)];
      this.spark(m.x + (Math.random() - 0.5) * 18, m.y - 4, (Math.random() - 0.5) * 10, -15 - Math.random() * 30 * (0.5 + this.heat), col, 0.8 + Math.random() * 0.8, -6, false);
      if (Math.random() < 0.35) {
        const cx = this.at.x + (CHIMNEY.x0 + CHIMNEY.x1) / 2;
        this.parts.push({ x: cx + (Math.random() - 0.5) * 6, y: this.at.y + CHIMNEY.top, vx: 4 + Math.random() * 6, vy: -8 - Math.random() * 8, t: 0, life: 2 + Math.random(), col: '#4a4058', s: 2 + Math.floor(Math.random() * 2), g: -2, star: false, puff: true });
      }
    }
    if (this.starfall > 0 && Math.random() < dt * 40) {
      this.spark(Math.random() * this.w, -2, (Math.random() - 0.3) * 20, 40 + Math.random() * 50, RAINBOW[Math.floor(Math.random() * RAINBOW.length)], 2 + Math.random(), 10, Math.random() < 0.5);
    }
    if (this.halo) {
      this.haloT -= dt;
      const hl = this.halo;
      if (this.haloT <= 0) {
        this.haloT = hl.tier === 'epic' ? 0.02 : 0.04;
        const a = Math.random() * Math.PI * 2;
        this.spark(hl.x + Math.cos(a) * hl.r * 0.8, hl.y + Math.sin(a) * hl.r, -Math.sin(a) * 14, Math.cos(a) * 14 - 6, this.color(hl.tier, Math.random() < 0.6, Math.floor(Math.random() * 5)), 0.8 + Math.random() * 0.6, -6, Math.random() < 0.5);
      }
    }
    for (const p of this.parts) {
      p.t += dt;
      p.vy += p.g * dt;
      p.vx *= 1 - dt * (p.puff ? 2 : 1.2);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const r of this.rings) { r.t += dt; if (r.t > 0) r.r += r.v * dt * (1 - r.t / r.life); }
    this.rings = this.rings.filter((r) => r.t < r.life);
  }

  private pourPos(): { x: number; y: number } {
    const m = this.mouth();
    const t = Math.min(1, this.pourT);
    const x1 = this.at.x + 2, y1 = this.at.y + ANVIL_TOP - 3;
    return { x: m.x + (x1 - m.x) * t, y: m.y + (y1 - m.y) * t - Math.sin(t * Math.PI) * 26 };
  }

  // --- Drawing ---------------------------------------------------------------------------------

  private draw(): void {
    const g = this.g;
    if (this.room) g.drawImage(this.room.c, Math.round(this.at.x) - this.room.ax, Math.round(this.at.y) - this.room.ay);
    else { g.fillStyle = '#120a0c'; g.fillRect(0, 0, this.w, this.h); }
    if (this.dim > 0.01) { g.fillStyle = `rgba(6, 3, 12, ${this.dim})`; g.fillRect(0, 0, this.w, this.h); }
    const sx = this.shake ? Math.round(Math.sin(this.t * 61) * this.shake) : 0;
    const sy = this.shake ? Math.round(Math.cos(this.t * 47) * this.shake * 0.6) : 0;
    const ox = Math.round(this.at.x) + sx, oy = Math.round(this.at.y) + sy;

    this.drawGlow(ox, oy);
    this.drawFurnace(ox, oy);
    this.drawAnvil(ox, oy);
    if (this.beam > 0.01) this.drawBeam(ox + 2, oy + ANVIL_TOP - 3);
    if (this.bar > 0) this.drawBar(ox, oy);
    if (this.hammer > 0.02) this.drawHammer(ox, oy);
    if (this.pourT >= 0) {
      const p = this.pourPos();
      g.fillStyle = HEAT[4];
      g.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 4);
      g.fillStyle = HEAT[5];
      g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 2);
    }

    if (this.scene < 0.99) {
      g.fillStyle = `rgba(6, 3, 12, ${(1 - this.scene) * 0.92})`;
      g.fillRect(0, 0, this.w, this.h);
    }

    // Steam, rings and sparks.
    for (const p of this.parts) {
      if (!p.puff) continue;
      g.globalAlpha = (1 - p.t / p.life) * 0.55;
      g.fillStyle = p.col;
      const s = Math.round(p.s + p.t * 3);
      g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
    g.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      if (r.t < 0) continue;
      g.globalAlpha = 1 - r.t / r.life;
      g.strokeStyle = r.col;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(r.x + sx, r.y + sy, r.r, r.r * 0.55, 0, 0, Math.PI * 2);
      g.stroke();
    }
    for (const p of this.parts) {
      if (p.puff) continue;
      const a = 1 - p.t / p.life;
      g.globalAlpha = a;
      g.fillStyle = p.col;
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.star && a > 0.3) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
      else g.fillRect(x, y, p.s, p.s);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (this.flash > 0.01) {
      g.globalAlpha = Math.min(1, this.flash);
      g.fillStyle = this.flashCol;
      g.fillRect(0, 0, this.w, this.h);
      g.globalAlpha = 1;
    }
  }

  /** Warm light from the fire on the floor and wall, flickering. */
  private drawGlow(ox: number, oy: number): void {
    const g = this.g;
    const mx = ox + (MOUTH.x0 + MOUTH.x1) / 2, my = oy + MOUTH.bottom - 8;
    const flick = Math.sin(this.t * 13) * 0.05 + Math.sin(this.t * 31) * 0.04;
    const rad = 46 + this.heat * 50;
    g.globalCompositeOperation = 'lighter';
    const grd = g.createRadialGradient(mx, my, 2, mx, my, rad);
    grd.addColorStop(0, this.flameTier && this.heat > 0.8 ? this.color(this.flameTier, false) : HEAT[2]);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = (0.28 + this.heat * 0.35 + flick) * (1 - this.dim * 0.4);
    g.fillStyle = grd;
    g.fillRect(mx - rad, my - rad, rad * 2, rad * 2);
    // The hot bar lights the anvil too.
    if (this.bar > 0) {
      const bx = ox + 2, by = oy + ANVIL_TOP - 3;
      const r2 = 24 + this.barHeat * 20;
      const gb = g.createRadialGradient(bx, by, 1, bx, by, r2);
      gb.addColorStop(0, this.barColor(false));
      gb.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.25 + this.barHeat * 0.35;
      g.fillStyle = gb;
      g.fillRect(bx - r2, by - r2, r2 * 2, r2 * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // Floor shadows.
    g.fillStyle = 'rgba(0, 0, 0, 0.45)';
    g.fillRect(ox + FURNACE.x0 - 2, oy, FURNACE.x1 - FURNACE.x0 + 4, 2);
    g.fillRect(ox - 14, oy, 30, 2);
  }

  private drawFurnace(ox: number, oy: number): void {
    const g = this.g;
    const px = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(ox + x, oy + y, w, h); };
    // Chimney.
    px(CHIMNEY.x0 - 1, CHIMNEY.top - 1, CHIMNEY.x1 - CHIMNEY.x0 + 2, FURNACE.top - CHIMNEY.top + 2, INK);
    for (let y = CHIMNEY.top; y < FURNACE.top; y += 4) {
      px(CHIMNEY.x0, y, CHIMNEY.x1 - CHIMNEY.x0, 4, STONE[1 + ((y >> 2) & 1)]);
      px(CHIMNEY.x0, y, CHIMNEY.x1 - CHIMNEY.x0, 1, STONE[3]);
    }
    px(CHIMNEY.x0 - 2, CHIMNEY.top - 2, CHIMNEY.x1 - CHIMNEY.x0 + 4, 3, STONE[2]);
    px(CHIMNEY.x0 - 2, CHIMNEY.top - 2, CHIMNEY.x1 - CHIMNEY.x0 + 4, 1, STONE[3]);
    // Body: a stepped dome of stone blocks.
    const w = FURNACE.x1 - FURNACE.x0;
    for (let y = FURNACE.top; y < 0; y++) {
      const row = y - FURNACE.top;
      const inset = row < 4 ? [6, 3, 2, 1][row] : 0;
      px(FURNACE.x0 + inset - 1, y, w - inset * 2 + 2, 1, INK);
      px(FURNACE.x0 + inset, y, w - inset * 2, 1, STONE[1]);
    }
    // Block pattern.
    for (let y = FURNACE.top + 2; y < -2; y += 6) {
      const off = ((y - FURNACE.top) / 6) & 1 ? 0 : 5;
      px(FURNACE.x0 + 1, y, w - 2, 1, STONE[0]);
      for (let x = FURNACE.x0 + off; x < FURNACE.x1; x += 10) px(x, y + 1, 1, 5, STONE[0]);
      px(FURNACE.x0 + 2, y + 1, w - 4, 1, STONE[2]);
    }
    // Mouth: a dark arch with the fire inside.
    const mw = MOUTH.x1 - MOUTH.x0;
    for (let y = MOUTH.top; y < MOUTH.bottom; y++) {
      const row = y - MOUTH.top;
      const inset = row < 4 ? [5, 3, 1, 0][row] : 0;
      px(MOUTH.x0 + inset - 2, y, mw - inset * 2 + 4, 1, STONE[3]);
      px(MOUTH.x0 + inset, y, mw - inset * 2, 1, '#120808');
    }
    this.drawFire(ox, oy);
    // Lip and hearth stones.
    px(MOUTH.x0 - 4, MOUTH.bottom, mw + 8, 3, STONE[3]);
    px(MOUTH.x0 - 4, MOUTH.bottom, mw + 8, 1, '#6a5e88');
    px(MOUTH.x0 - 4, MOUTH.bottom + 3, mw + 8, 1, INK);
    // Bellows on the right side, puffing with the heat.
    const puff = Math.round((Math.sin(this.t * (2 + this.heat * 6)) + 1) * (0.5 + this.heat));
    px(FURNACE.x1 - 2, -12 + puff, 8, 9 - puff, INK);
    px(FURNACE.x1 - 1, -11 + puff, 6, 7 - puff, WOOD[2]);
    px(FURNACE.x1 - 1, -11 + puff, 6, 1, WOOD[3]);
    px(FURNACE.x1 + 5, -9, 4, 2, IRON[2]);
  }

  /** Pixel flames: columns that lick up and down, hotter (and taller) with the heat. */
  private drawFire(ox: number, oy: number): void {
    const g = this.g;
    const tier = this.flameTier && this.heat > 0.75 ? this.flameTier : null;
    const n = MOUTH.x1 - MOUTH.x0 - 2;
    for (let i = 0; i < n; i++) {
      const x = ox + MOUTH.x0 + 1 + i;
      const wave = Math.sin(this.t * 9 + i * 0.9) + Math.sin(this.t * 14 - i * 1.7) * 0.6;
      const edge = 1 - Math.abs(i - n / 2) / (n / 2);
      const hgt = Math.max(1, Math.round((3 + this.heat * 14) * (0.35 + edge * 0.65) + wave * (1 + this.heat * 2)));
      const top = Math.max(MOUTH.top + 3, MOUTH.bottom - hgt);
      for (let y = top; y < MOUTH.bottom; y++) {
        const k = (y - top) / Math.max(1, MOUTH.bottom - top);
        let col: string;
        if (tier && k < 0.45) col = this.color(tier, k > 0.2, i);
        else col = HEAT[Math.min(5, 1 + Math.floor(k * 3 + this.heat * 2))];
        g.fillStyle = col;
        g.fillRect(x, oy + y, 1, 1);
      }
    }
    // Coals.
    for (let i = 0; i < n; i += 3) {
      g.fillStyle = (i + Math.floor(this.t * 3)) % 4 ? HEAT[1] : HEAT[3];
      g.fillRect(ox + MOUTH.x0 + 1 + i, oy + MOUTH.bottom - 2, 2, 2);
    }
  }

  private drawAnvil(ox: number, oy: number): void {
    const g = this.g;
    const px = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(ox + x, oy + y, w, h); };
    // Stump.
    px(-12, -7, 24, 7, INK);
    px(-11, -6, 22, 6, WOOD[1]);
    px(-11, -6, 22, 1, WOOD[3]);
    for (const x of [-7, -1, 5]) px(x, -5, 1, 5, WOOD[0]);
    px(-9, -6, 18, 1, WOOD[2]);
    // Base and feet.
    px(-14, -12, 28, 6, INK);
    px(-13, -11, 26, 4, IRON[1]);
    px(-13, -11, 26, 1, IRON[2]);
    // Waist.
    px(-7, -18, 14, 7, INK);
    px(-6, -18, 12, 7, IRON[1]);
    px(-6, -18, 2, 7, IRON[2]);
    // Face and horn.
    px(-15, ANVIL_TOP - 1, 33, 7, INK);
    px(-14, ANVIL_TOP, 31, 5, IRON[2]);
    px(-14, ANVIL_TOP, 31, 1, IRON[4]);
    px(-14, ANVIL_TOP + 1, 31, 1, IRON[3]);
    px(-14, ANVIL_TOP + 4, 31, 1, IRON[1]);
    // The horn tapers off to the left.
    px(-23, ANVIL_TOP, 9, 4, INK);
    px(-22, ANVIL_TOP + 1, 8, 2, IRON[2]);
    px(-22, ANVIL_TOP + 1, 8, 1, IRON[3]);
    px(-27, ANVIL_TOP + 1, 5, 2, INK);
    px(-26, ANVIL_TOP + 1, 4, 1, IRON[2]);
    // Hardy hole on the heel.
    px(13, ANVIL_TOP + 1, 2, 2, INK);
  }

  private barColor(bright: boolean): string {
    // White hot first; the cooler it gets the more its rarity shows.
    if (this.barHeat > 0.8) return bright ? HEAT[5] : HEAT[4];
    if (this.barHeat > 0.6 && this.shaped < 3) return bright ? HEAT[4] : HEAT[3];
    return this.color(this.barTier, bright, Math.floor(this.t * 4));
  }

  /** The bar on the anvil: a lump at first, longer and flatter with each blow. */
  private drawBar(ox: number, oy: number): void {
    const g = this.g;
    const len = [8, 12, 16, 20][Math.min(3, this.shaped)];
    const hgt = [5, 4, 3, 3][Math.min(3, this.shaped)];
    const x = ox + 2 - len / 2, y = oy + ANVIL_TOP - hgt;
    g.fillStyle = INK;
    g.fillRect(x - 1, y - 1, len + 2, hgt + 1);
    g.fillStyle = this.barColor(false);
    g.fillRect(x, y, len, hgt);
    g.fillStyle = this.barColor(true);
    g.fillRect(x + 1, y, len - 2, 1);
    if (this.shaped >= 3) {
      // A tip and a glint once it's shaped.
      g.fillRect(x + len - 1, y + 1, 1, 1);
      if (Math.sin(this.t * 5) > 0.6) { g.fillStyle = '#ffffff'; g.fillRect(x + 2 + Math.floor((this.t * 12) % (len - 4)), y, 2, 1); }
    }
  }

  private drawHammer(ox: number, oy: number): void {
    const g = this.g;
    const a = A_REST + (A_STRIKE - A_REST) * this.swing * this.swing;
    const px0 = ox + PIVOT.x, py0 = oy + PIVOT.y;
    g.globalAlpha = Math.min(1, this.hammer);
    // Handle: pixels along the line.
    for (let i = 0; i <= REACH - 3; i++) {
      const x = Math.round(px0 + Math.cos(a) * i), y = Math.round(py0 + Math.sin(a) * i);
      g.fillStyle = INK;
      g.fillRect(x - 1, y - 1, 3, 3);
    }
    for (let i = 0; i <= REACH - 3; i++) {
      const x = Math.round(px0 + Math.cos(a) * i), y = Math.round(py0 + Math.sin(a) * i);
      g.fillStyle = i < 5 ? WOOD[1] : WOOD[3];
      g.fillRect(x, y, 1, 1);
    }
    // Head across the handle's end.
    const hx = px0 + Math.cos(a) * REACH, hy = py0 + Math.sin(a) * REACH;
    g.save();
    g.translate(Math.round(hx), Math.round(hy));
    g.rotate(a + Math.PI / 2);
    g.fillStyle = INK;
    g.fillRect(-6, -4, 12, 8);
    g.fillStyle = IRON[3];
    g.fillRect(-5, -3, 10, 6);
    g.fillStyle = IRON[4];
    g.fillRect(-5, -3, 10, 1);
    g.fillStyle = IRON[2];
    g.fillRect(-5, 2, 10, 1);
    g.restore();
    g.globalAlpha = 1;
  }

  private drawBeam(x: number, y: number): void {
    const g = this.g;
    const tier = this.beamTier;
    const wide = Math.round((9 + Math.sin(this.t * 30) * 1.5) * this.beam * (tier === 'epic' ? 1.4 : 1));
    g.globalCompositeOperation = 'lighter';
    for (let i = 3; i >= 0; i--) {
      const w = wide * (1 + i * 0.7);
      g.globalAlpha = this.beam * (i ? 0.16 : 0.9);
      g.fillStyle = i ? this.color(tier, false, i) : this.color(tier, true, Math.floor(this.t * 4));
      g.fillRect(Math.round(x - w / 2), 0, Math.round(w), Math.round(y));
    }
    g.globalAlpha = this.beam;
    g.fillStyle = '#ffffff';
    g.fillRect(Math.round(x - Math.max(1, wide / 5)), 0, Math.max(2, Math.round(wide / 2.5)), Math.round(y));
    if (Math.random() < this.beam) this.spark(x + (Math.random() - 0.5) * wide * 2, y - Math.random() * 10, 0, -120 - Math.random() * 120, this.color(tier, true, Math.floor(Math.random() * 5)), 0.6, 0, Math.random() < 0.3);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}
