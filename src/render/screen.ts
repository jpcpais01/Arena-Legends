/**
 * Pixel-perfect screen: the scene is drawn into a small canvas (the "art"
 * resolution) and copied to the visible canvas at an integer scale in exact
 * device pixels, with nearest-neighbour filtering. No CSS scaling, so pixels
 * stay square and sharp at any browser zoom or display scaling.
 */
export class Screen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly buffer: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  /** Art-pixel size of the buffer. */
  w = 0;
  h = 0;
  /** Device pixels per art pixel. */
  scale = 1;
  /** Device-pixel offset of the buffer (centring leftovers). */
  private dx = 0;
  private dy = 0;
  private dpr = 1;
  /** Camera crop: zoom (1 = whole buffer) and the art-px centre of the shown part. */
  private zoom = 1;
  private cx = 0;
  private cy = 0;
  /** Art-px origin of the shown part and device px per art px on screen, as last presented. */
  private ox = 0;
  private oy = 0;
  private vs = 1;
  onResize: (() => void) | null = null;

  constructor(readonly host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'screen';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.buffer = document.createElement('canvas');
    this.g = this.buffer.getContext('2d')!;
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    const r = this.host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(r.width * dpr));
    const H = Math.max(1, Math.round(r.height * dpr));
    if (W === this.canvas.width && H === this.canvas.height && dpr === this.dpr) return;
    this.dpr = dpr;
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.style.width = `${W / dpr}px`;
    this.canvas.style.height = `${H / dpr}px`;
    // Aim for ~340 art pixels of height, but keep at least ~420 of width (phones in portrait).
    const s = Math.max(1, Math.min(Math.round(H / 340), Math.floor(W / 420)));
    this.scale = s;
    this.w = Math.ceil(W / s);
    this.h = Math.ceil(H / s);
    this.dx = Math.floor((W - this.w * s) / 2);
    this.dy = Math.floor((H - this.h * s) / 2);
    this.vs = s;
    this.ox = this.oy = 0;
    this.buffer.width = this.w;
    this.buffer.height = this.h;
    this.g.imageSmoothingEnabled = false;
    this.onResize?.();
  }

  /**
   * Shows only part of the buffer, `zoom` times larger, centred near art px
   * (cx, cy) and kept inside the buffer. When `zoom` is a whole multiple of a
   * device pixel (scale × zoom is an integer) the crop snaps to whole art
   * pixels, so the picture stays as sharp as at zoom 1.
   */
  setView(zoom: number, cx: number, cy: number): void {
    this.zoom = Math.max(1, zoom);
    this.cx = cx;
    this.cy = cy;
  }

  present(): void {
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    const z = this.zoom, W = this.w * this.scale, H = this.h * this.scale;
    if (z === 1) {
      this.ox = this.oy = 0;
      this.vs = this.scale;
      c.drawImage(this.buffer, 0, 0, this.w, this.h, this.dx, this.dy, W, H);
      return;
    }
    const sw = this.w / z, sh = this.h / z;
    let ox = Math.min(Math.max(0, this.cx - sw / 2), this.w - sw);
    let oy = Math.min(Math.max(0, this.cy - sh / 2), this.h - sh);
    const vs = this.scale * z;
    if (Math.abs(vs - Math.round(vs)) < 1e-6) { ox = Math.floor(ox); oy = Math.floor(oy); }
    this.ox = ox;
    this.oy = oy;
    this.vs = vs;
    c.drawImage(this.buffer, ox, oy, sw, sh, this.dx, this.dy, W, H);
  }

  /** CSS px → art px. */
  toArt(cssX: number, cssY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((cssX - r.left) * this.dpr - this.dx) / this.vs + this.ox, ((cssY - r.top) * this.dpr - this.dy) / this.vs + this.oy];
  }

  /** Art px → CSS px relative to the canvas (DOM overlays). */
  toCss(x: number, y: number): [number, number] {
    return [((x - this.ox) * this.vs + this.dx) / this.dpr, ((y - this.oy) * this.vs + this.dy) / this.dpr];
  }

  /** Size of one art pixel in CSS px, at the current zoom. */
  get cssPixel(): number {
    return this.vs / this.dpr;
  }
}
