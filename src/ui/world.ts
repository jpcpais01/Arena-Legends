// The World: the region's painted map, dragged and pinched (or wheeled) around
// like a real map, with a banner over every place to fight. Tapping a banner
// flies the view to it and opens its card: the arena, the tournament held
// there, how hard it is and what it pays, and the way in.
//
// The map is a handful of canvases painted once (render/worldLoad) inside one
// transformed layer, so moving it only changes a transform; the banners and
// names sit in a flat layer above, placed from the same camera so their text
// stays sharp at any zoom.
import { sfx } from '../audio/sfx';
import { CHAMPION_GEMS } from '../character/progress';
import { THEMES } from '../render/arenaArt';
import { css } from '../render/pixel/color';
import { loadWorld, type WorldCanvases } from '../render/worldLoad';
import { REGIONS, tournamentOf, type Place, type Region } from '../world/world';
import { h } from './dom';
import { icon } from './icons';

export interface WorldCallbacks {
  onClose(): void;
  /** Enter the tournament held at this place: on your own, or by opening a lobby for friends. */
  onEnter(place: Place, friends: boolean): void;
  /** Back to the tournament you are in (it is held at the selected place). */
  onContinue(): void;
}

export interface WorldStatus {
  /** The tournament you are in, if any, and how far you are (e.g. "Semis"). */
  live: { tour: string; label: string } | null;
  /** Titles won, by tournament id. */
  wins: Record<string, number>;
  /** Your hero's level (rival levels are shown around it). */
  level: number;
}

const PIN_ICON: Record<string, Parameters<typeof icon>[0]> = { cup: 'trophy', blossom: 'blossom', gauntlet: 'tornado', crown: 'constellation' };

interface Cam { x: number; y: number; z: number }

export class WorldScreen {
  readonly el: HTMLElement;
  private region: Region = REGIONS[0];
  private view = h('div.wm-view');
  private stage = h('div.wm-stage');
  private marks = h('div.wm-marks');
  private card = h('aside.wm-card.frame', { hidden: true });
  private loading = h('div.wm-loading', null, h('span.spinner'), h('span', null, 'Unrolling the map…'));
  private hint = h('div.wm-hint', null, 'Drag to explore · pinch or scroll to zoom · tap a banner');
  private pins = new Map<string, HTMLButtonElement>();
  private labels: { el: HTMLElement; x: number; y: number }[] = [];
  private art: WorldCanvases | null = null;
  private cam: Cam = { x: 0, y: 0, z: 1 };
  private vw = 1;
  private vh = 1;
  private picked: Place | null = null;
  private raf = 0;
  private anim: ((t: number) => boolean) | null = null;
  private ro: ResizeObserver;
  private disposed = false;
  private snapTimer = 0;
  // Gestures.
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; cam: Cam; t: number; moved: boolean; pin: string | null; vx: number; vy: number; lx: number; ly: number; lt: number } | null = null;
  private pinch: { d: number; mx: number; my: number; cam: Cam } | null = null;

  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key;
    if (k === 'Escape') {
      e.stopImmediatePropagation();
      if (this.picked) { sfx.play('back'); this.select(null); } else { sfx.play('back'); this.cb.onClose(); }
    } else if (k === '+' || k === '=') this.zoomBy(1.4);
    else if (k === '-' || k === '_') this.zoomBy(1 / 1.4);
    else if (k.startsWith('Arrow')) {
      const s = 90;
      const dx = k === 'ArrowLeft' ? s : k === 'ArrowRight' ? -s : 0, dy = k === 'ArrowUp' ? s : k === 'ArrowDown' ? -s : 0;
      this.flyTo({ x: this.cam.x + dx, y: this.cam.y + dy, z: this.cam.z }, 220);
    }
  };

  constructor(private readonly cb: WorldCallbacks, private status: WorldStatus, focus?: string) {
    const r = this.region;
    this.el = h('div.scr.world', { role: 'dialog', 'aria-label': `World: ${r.name}` },
      this.view,
      h('header.wm-head', null,
        h('div.ribbon.wm-title', null, h('span', null, r.name)),
        h('div.grow'),
        h('button.btn.icon.close', { title: 'Menu', 'aria-label': 'Back to the menu', onclick: () => { sfx.play('back'); cb.onClose(); } }, icon('home'))),
      h('div.wm-zoom', null,
        h('button.btn.icon.sm', { title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => { sfx.play('ui'); this.zoomBy(1.5); } }, h('b', null, '+')),
        h('button.btn.icon.sm', { title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => { sfx.play('ui'); this.zoomBy(1 / 1.5); } }, h('b', null, '−'))),
      this.card,
      this.loading,
      this.hint);
    this.view.append(this.stage, this.marks);
    // Names first, banners over them.
    for (const l of r.labels) {
      const el = h(`span.wm-label${l.size ? '.' + l.size : ''}${l.sea ? '.sea' : ''}`, null, l.text);
      this.labels.push({ el, x: l.x, y: l.y });
      this.marks.append(el);
    }
    for (const p of r.places) {
      const pin = h<HTMLButtonElement>('button.wm-pin', { title: p.name, onclick: () => this.select(p) });
      this.pins.set(p.id, pin);
      this.marks.append(pin);
    }
    this.renderPins();
    this.view.addEventListener('pointerdown', this.down);
    this.view.addEventListener('pointermove', this.move);
    this.view.addEventListener('pointerup', this.up);
    this.view.addEventListener('pointercancel', this.up);
    this.view.addEventListener('wheel', this.wheel, { passive: false });
    window.addEventListener('keydown', this.onKey, true);
    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(this.view);
    setTimeout(() => this.hint.classList.add('gone'), 5000);
    void loadWorld().then((art) => {
      if (this.disposed) return;
      this.mount(art);
      const p = focus ? r.places.find((x) => x.id === focus) : null;
      this.measure();
      const z = this.homeZoom();
      const at = p ?? r.home;
      // A gentle settle from a little further out.
      this.cam = this.clamp({ x: this.vw / 2 - at.x * z * 0.86, y: this.vh / 2 - at.y * z * 0.86, z: z * 0.86 });
      this.apply();
      if (p) this.select(p, false);
      else this.flyTo(this.centerOn(at.x, at.y, z), 650);
    }).catch(() => {
      this.loading.replaceChildren(h('span', null, "Couldn't draw the map."));
    });
  }

  /** New status (a cup started, a round played): banners and the open card follow. */
  update(status: WorldStatus): void {
    this.status = status;
    this.renderPins();
    if (this.picked) this.renderCard(this.picked);
  }

  private mount(art: WorldCanvases): void {
    this.art = art;
    this.loading.remove();
    const px = (c: HTMLCanvasElement, cls: string, x = 0, y = 0) => {
      c.className = cls;
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
      c.style.width = `${c.width}px`;
      c.style.height = `${c.height}px`;
      return c;
    };
    this.stage.style.width = `${art.w}px`;
    this.stage.style.height = `${art.h}px`;
    this.stage.replaceChildren(
      px(art.base, 'wm-layer'),
      px(art.waves, 'wm-layer wm-waves'),
      px(art.isle, 'wm-layer wm-isle', art.isleAt.x, art.isleAt.y),
      ...art.clouds.map((c, i) => {
        const wrap = h('div.wm-cloud', { style: { top: `${[120, 300, 520, 660][i % 4]}px`, '--dur': `${[150, 190, 130, 170][i % 4]}s`, '--delay': `${-[20, 110, 70, 150][i % 4]}s` } });
        wrap.append(px(cloudShadow(c), 'wm-cshadow'), px(c, 'wm-cloud-art'));
        return wrap;
      }));
  }

  private measure(): void {
    const r = this.view.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.vw = r.width;
    this.vh = r.height;
    if (this.art) { this.cam = this.clamp(this.cam); this.apply(); }
  }

  // --- Camera --------------------------------------------------------------------------------------

  private zMin(): number { return Math.max(this.vw / this.region.w, this.vh / this.region.h); }
  private zMax(): number { return Math.max(5, this.zMin() * 3); }
  /** Where the view opens: the town and the bay, not too far out. */
  private homeZoom(): number { return Math.max(this.zMin() * 1.15, Math.min(1.6, this.vh / 380)); }

  /** The width of the screen the card covers (the map may scroll under it). */
  private cardCover(): number {
    if (this.card.hidden) return 0;
    return this.vw > this.vh ? this.card.getBoundingClientRect().width + 12 : 0;
  }

  private clamp(c: Cam): Cam {
    const z = Math.max(this.zMin(), Math.min(this.zMax(), c.z));
    const W = this.region.w * z, H = this.region.h * z;
    const padR = this.cardCover();
    const padB = !this.card.hidden && this.vw <= this.vh ? this.card.getBoundingClientRect().height : 0;
    return {
      x: Math.max(this.vw - W - padR, Math.min(0, c.x)),
      y: Math.max(this.vh - H - padB, Math.min(0, c.y)),
      z,
    };
  }

  /** The camera that puts a map point in the middle of the free part of the screen. */
  private centerOn(ax: number, ay: number, z: number): Cam {
    const free = this.vw - this.cardCover();
    const freeH = this.vh - (!this.card.hidden && this.vw <= this.vh ? this.card.getBoundingClientRect().height : 0);
    return this.clamp({ x: free / 2 - ax * z, y: freeH / 2 - ay * z, z });
  }

  /** Whole device pixels per map pixel (when zoomed in enough), so every map pixel is the same size. */
  private snapped(c: Cam): Cam {
    const d = window.devicePixelRatio || 1;
    let z = c.z;
    if (z * d >= 1.5) {
      const zs = Math.round(z * d) / d;
      if (zs >= this.zMin() && zs <= this.zMax()) z = zs;
    }
    // Keep the middle of the screen still.
    const mx = (this.vw / 2 - c.x) / c.z, my = (this.vh / 2 - c.y) / c.z;
    const out = this.clamp({ x: this.vw / 2 - mx * z, y: this.vh / 2 - my * z, z });
    out.x = Math.round(out.x * d) / d;
    out.y = Math.round(out.y * d) / d;
    return out;
  }

  private apply(): void {
    const { x, y, z } = this.cam;
    this.stage.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`;
    for (const p of this.region.places) {
      const pin = this.pins.get(p.id)!;
      pin.style.transform = `translate3d(${Math.round(x + p.x * z)}px, ${Math.round(y + p.y * z)}px, 0)`;
    }
    for (const l of this.labels) l.el.style.transform = `translate3d(${Math.round(x + l.x * z)}px, ${Math.round(y + l.y * z)}px, 0)`;
    this.marks.classList.toggle('far', z < 1.05);
  }

  private loop = (t: number) => {
    this.raf = 0;
    if (this.anim && this.anim(t)) this.raf = requestAnimationFrame(this.loop);
    else this.anim = null;
  };

  private run(step: (t: number) => boolean): void {
    this.anim = step;
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  private stop(): void {
    this.anim = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Eases the camera to `to` (clamped and snapped). */
  private flyTo(to: Cam, ms = 380): void {
    if (!this.art) return;
    const from = { ...this.cam };
    const end = this.snapped(this.clamp(to));
    // Ease in the map's own space so the zoom feels even.
    const fx = (this.vw / 2 - from.x) / from.z, fy = (this.vh / 2 - from.y) / from.z;
    const tx = (this.vw / 2 - end.x) / end.z, ty = (this.vh / 2 - end.y) / end.z;
    let t0 = -1;
    this.run((now) => {
      if (t0 < 0) t0 = now;
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const z = from.z * Math.pow(end.z / from.z, e);
      const mx = fx + (tx - fx) * e, my = fy + (ty - fy) * e;
      this.cam = k >= 1 ? end : { x: this.vw / 2 - mx * z, y: this.vh / 2 - my * z, z };
      this.apply();
      return k < 1;
    });
  }

  private zoomBy(f: number, sx = this.vw / 2, sy = this.vh / 2): void {
    const c = this.cam;
    const z = Math.max(this.zMin(), Math.min(this.zMax(), c.z * f));
    const ax = (sx - c.x) / c.z, ay = (sy - c.y) / c.z;
    this.flyTo({ x: sx - ax * z, y: sy - ay * z, z }, 260);
  }

  private settle(): void {
    this.flyTo(this.cam, 200);
  }

  // --- Gestures ------------------------------------------------------------------------------------

  private down = (e: PointerEvent) => {
    if (!this.art || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.stop();
    clearTimeout(this.snapTimer);
    this.view.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.hint.classList.add('gone');
    if (this.pointers.size === 1) {
      const pin = (e.target as Element).closest?.('.wm-pin');
      this.startDrag(e.clientX, e.clientY, pin ? [...this.pins].find(([, b]) => b === pin)?.[0] ?? null : null);
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.drag = null;
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cam: { ...this.cam } };
    }
  };

  private startDrag(x: number, y: number, pin: string | null): void {
    const t = performance.now();
    this.drag = { x, y, cam: { ...this.cam }, t, moved: false, pin, vx: 0, vy: 0, lx: x, ly: y, lt: t };
  }

  private move = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const vr = this.view.getBoundingClientRect();
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const p = this.pinch;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const z = Math.max(this.zMin(), Math.min(this.zMax(), p.cam.z * (d / p.d)));
      const ax = (p.mx - vr.left - p.cam.x) / p.cam.z, ay = (p.my - vr.top - p.cam.y) / p.cam.z;
      this.cam = this.clamp({ x: mx - vr.left - ax * z, y: my - vr.top - ay * z, z });
      this.apply();
      return;
    }
    const g = this.drag;
    if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) > 7) g.moved = true;
    if (!g.moved) return;
    this.cam = this.clamp({ x: g.cam.x + dx, y: g.cam.y + dy, z: g.cam.z });
    this.apply();
    const t = performance.now(), dt = Math.max(1, t - g.lt);
    g.vx = g.vx * 0.6 + ((e.clientX - g.lx) / dt) * 0.4;
    g.vy = g.vy * 0.6 + ((e.clientY - g.ly) / dt) * 0.4;
    g.lx = e.clientX; g.ly = e.clientY; g.lt = t;
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size === 1) {
        // One finger left: carry on dragging with it.
        const [p] = [...this.pointers.values()];
        this.pinch = null;
        this.startDrag(p.x, p.y, null);
        this.drag!.moved = true;
      } else if (!this.pointers.size) { this.pinch = null; this.settle(); }
      return;
    }
    const g = this.drag;
    this.drag = null;
    if (!g || this.pointers.size) return;
    if (!g.moved) {
      if (e.type === 'pointercancel') return;
      const place = g.pin ? this.region.places.find((p) => p.id === g.pin) : null;
      if (place) this.select(place);
      else if (this.picked) { sfx.play('back'); this.select(null); }
      return;
    }
    // A flick keeps the map gliding.
    let vx = g.vx, vy = g.vy;
    if (performance.now() - g.lt > 90 || Math.hypot(vx, vy) < 0.15) { this.settle(); return; }
    let last = -1;
    this.run((now) => {
      const dt = last < 0 ? 16 : Math.min(40, now - last);
      last = now;
      const before = this.cam;
      this.cam = this.clamp({ x: before.x + vx * dt, y: before.y + vy * dt, z: before.z });
      this.apply();
      const f = Math.exp(-dt / 280);
      vx *= f; vy *= f;
      if (Math.hypot(vx, vy) < 0.03) { this.settle(); return false; }
      return true;
    });
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.art) return;
    this.stop();
    const vr = this.view.getBoundingClientRect();
    const sx = e.clientX - vr.left, sy = e.clientY - vr.top;
    const c = this.cam;
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const z = Math.max(this.zMin(), Math.min(this.zMax(), c.z * Math.exp(-dy * 0.0016)));
    const ax = (sx - c.x) / c.z, ay = (sy - c.y) / c.z;
    this.cam = this.clamp({ x: sx - ax * z, y: sy - ay * z, z });
    this.apply();
    clearTimeout(this.snapTimer);
    this.snapTimer = window.setTimeout(() => this.settle(), 160);
  };

  // --- Places --------------------------------------------------------------------------------------

  private renderPins(): void {
    for (const p of this.region.places) {
      const t = tournamentOf(p.tournament);
      const live = this.status.live?.tour === t.id ? this.status.live : null;
      const wins = this.status.wins[t.id] ?? 0;
      const pin = this.pins.get(p.id)!;
      pin.className = `wm-pin tier-${t.stars}${live ? ' live' : ''}${this.picked?.id === p.id ? ' on' : ''}`;
      pin.setAttribute('aria-label', `${p.name}: ${t.name}${live ? `, you are in it (${live.label})` : ''}`);
      pin.replaceChildren(
        h('span.wp-plaque', null,
          h('span.wp-ic', null, icon(PIN_ICON[t.id] ?? 'swords')),
          h('span.wp-text', null, h('b', null, p.name), h('small', null, live ? `In progress · ${live.label}` : t.name)),
          wins ? h('span.wp-won', { title: `Won ${wins}×` }, icon('crown'), wins > 1 ? h('i', null, String(wins)) : null) : null),
        h('span.wp-stem'));
    }
  }

  /** Opens a place's card (null closes it) and flies the view there. */
  private select(p: Place | null, sound = true): void {
    const same = p?.id === this.picked?.id;
    this.picked = p;
    this.renderPins();
    if (!p) {
      this.card.hidden = true;
      this.cam = this.clamp(this.cam);
      this.settle();
      return;
    }
    if (sound && !same) sfx.play('select');
    this.renderCard(p);
    this.card.hidden = false;
    this.card.classList.remove('in');
    void this.card.offsetWidth;
    this.card.classList.add('in');
    this.flyTo(this.centerOn(p.x, p.y + 30, Math.max(this.zMin(), Math.min(this.zMax(), Math.min(this.vw, this.vh) / 320))), 520);
  }

  private renderCard(p: Place): void {
    const t = tournamentOf(p.tournament);
    const theme = THEMES.find((x) => x.id === t.arena) ?? THEMES[0];
    const live = this.status.live;
    const here = live?.tour === t.id;
    const wins = this.status.wins[t.id] ?? 0;
    const lv = this.status.level;
    const sky = theme.sky.map((c, i) => `${css(c)} ${Math.round((i / (theme.sky.length - 1)) * 70)}%`).join(', ');
    const stars = h('span.wc-stars', { title: `Difficulty ${t.stars} of 4` }, ...[1, 2, 3, 4].map((i) => h(`i${i <= t.stars ? '.on' : ''}`, null, icon('star'))));
    const rounds = Math.round(Math.log2(t.size));
    const fact = (label: string, value: string) => h('span.wc-fact', null, h('small', null, label), h('b', null, value));
    let foot: HTMLElement[];
    if (here) {
      foot = [h('button.btn.primary.big.go', { onclick: () => { sfx.play('confirm'); this.cb.onContinue(); } }, icon('trophy'), h('span', null, `Continue · ${live!.label}`))];
    } else if (live) {
      const other = tournamentOf(live.tour);
      const at = this.region.places.find((x) => x.tournament === other.id);
      foot = [
        h('p.wc-busy', null, icon('lock'), `You're in the ${other.name}. Finish it or give it up first.`),
        at ? h('button.btn', { onclick: () => this.select(at) }, icon('pin'), `Go to ${at.name}`) : null,
      ].filter((x): x is HTMLElement => !!x);
    } else {
      foot = [
        h('button.btn', { title: 'Open a lobby for up to 8 friends', onclick: () => { sfx.play('confirm'); this.cb.onEnter(p, true); } }, icon('friends'), 'With friends'),
        h('button.btn.primary.go', { onclick: () => { sfx.play('confirm'); this.cb.onEnter(p, false); } }, icon('swords'), h('span', null, 'Enter')),
      ];
    }
    this.card.replaceChildren(
      h('button.btn.icon.sm.wc-close', { title: 'Close', 'aria-label': 'Close', onclick: () => { sfx.play('back'); this.select(null); } }, icon('close')),
      h('div.wc-art', { style: { background: `linear-gradient(180deg, ${sky}, ${css(theme.floor)} 70%, ${css(theme.floor)})` } },
        h('span.wc-ic', null, icon(PIN_ICON[t.id] ?? 'swords')),
        h('div.wc-place', null, h('b', null, p.name), h('small', null, `Arena: ${theme.name}`))),
      h('div.wc-body', null,
        h('div.wc-tour', null, h('h3', null, t.name), stars),
        h('p.wc-blurb', null, t.blurb),
        h('div.wc-facts', null,
          fact('Fighters', String(t.size)),
          fact('Rounds', String(rounds)),
          fact('Rivals', `Lv ${Math.max(1, lv + t.lo)}–${lv + t.hi}`),
          fact('Title', `+${Math.round(CHAMPION_GEMS * t.pay)}`)),
        wins ? h('p.wc-wins', null, icon('crown'), `Champion ${wins > 1 ? `${wins} times` : 'once'}`) : null),
      h('div.wc-foot', null, ...foot));
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    clearTimeout(this.snapTimer);
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKey, true);
  }
}

/** A cloud's shadow: its shape, dark and faint. */
function cloudShadow(c: HTMLCanvasElement): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = c.width;
  s.height = c.height;
  const g = s.getContext('2d')!;
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = 'rgba(10, 20, 50, 0.22)';
  g.fillRect(0, 0, s.width, s.height);
  return s;
}
