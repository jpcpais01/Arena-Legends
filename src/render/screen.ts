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
    this.buffer.width = this.w;
    this.buffer.height = this.h;
    this.g.imageSmoothingEnabled = false;
    this.onResize?.();
  }

  present(): void {
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.buffer, 0, 0, this.w, this.h, this.dx, this.dy, this.w * this.scale, this.h * this.scale);
  }

  /** CSS px → art px. */
  toArt(cssX: number, cssY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((cssX - r.left) * this.dpr - this.dx) / this.scale, ((cssY - r.top) * this.dpr - this.dy) / this.scale];
  }

  /** Art px → CSS px relative to the canvas (DOM overlays). */
  toCss(x: number, y: number): [number, number] {
    return [(x * this.scale + this.dx) / this.dpr, (y * this.scale + this.dy) / this.dpr];
  }

  /** Size of one art pixel in CSS px. */
  get cssPixel(): number {
    return this.scale / this.dpr;
  }
}
