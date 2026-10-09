import { sfx, type Sfx } from '../audio/sfx';
import { clamp } from '../core/math';
import type { Battle } from '../sim/battle';
import { ARENA_HALF_WIDTH, DT, ROUND_TIME } from '../sim/constants';
import { getStatus, type Fighter } from '../sim/fighter';
import type { ActionState, BattleEvent, FighterId, Projectile, ProjectileStyle, UsableId } from '../sim/types';
import { ArenaView } from './arena';
import { THEMES, type Theme } from './arenaArt';
import { drawText } from './font';
import { Fx, type View } from './fx';
import { css, mix } from './pixel/color';
import { bottleSprite, projFrames, projSprite, skinDraws } from './projArt';
import { drawSetAura, SET_FX } from './setAura';
import type { Screen } from './screen';
import { Animator, PPM, type AnimOut } from './sprite/animator';
import { SpriteBank, type Sprite } from './sprite/bank';
import { makeArt, type CharacterArt } from './sprite/look';
import type { SkinFx } from './sprite/skins';

const STYLE_COLOR: Record<ProjectileStyle, number> = {
  arcane: 0xc58cff, hex: 0xa04aff, wave: 0xd8f4ff, groundwave: 0xc8a070, meteor: 0xff7a1a, arrow: 0xf0e0c0,
  knife: 0xd0d8e8, bolt: 0xd0d8e8, fire: 0xff9a3a, flamewave: 0xff7a2a, chakram: 0xb8e4f0, wisp: 0x7ae8ff,
  flask: 0xff8a2a,
};

interface FighterView {
  art: CharacterArt;
  anim: Animator;
  bank: SpriteBank;
  out: AnimOut;
  flash: number;
  /** Afterimages while hasted or dashing: [x, y, sprite, flip]. */
  ghosts: { x: number; y: number; s: Sprite; flip: boolean; t: number }[];
  ghostT: number;
  emberT: number;
  /** Legendary skin sparkle timers, per place they shed from. */
  sparkT: { main: number; sec: number; head: number; body: number; feet: number; set: number };
  headY: number;
}

/**
 * Battle camera modes. Every mode zooms by whole device pixels per art pixel
 * (crisp pixels) and only eases between those steps.
 * - classic: the whole arena, as it has always been.
 * - action: frames the duel a step closer, punches in on big hits, parries
 *   and wall splats, and goes in tight on the knockout.
 * - close: as tight as both fighters fit, stepping out only when they part.
 * - follow: tight on your own fighter, leaning toward the rival.
 */
export type CamMode = 'classic' | 'action' | 'close' | 'follow';
export const CAM_MODES: { id: CamMode; name: string }[] = [
  { id: 'classic', name: 'Classic' },
  { id: 'action', name: 'Action' },
  { id: 'close', name: 'Close-up' },
  { id: 'follow', name: 'Follow' },
];

export interface BattleListener {
  onEvent?(e: BattleEvent): void;
  onEnd?(b: Battle): void;
}

/**
 * Draws a battle: arena, fighters, projectiles, effects. Steps the sim at a
 * fixed 60 Hz and interpolates for the display; speed, pause and slow motion
 * only change how many steps run per frame.
 */
export class BattleView implements View {
  battle: Battle | null = null;
  arena: ArenaView | null = null;
  private theme: Theme = THEMES[0];
  readonly fx = new Fx();
  private fighters: FighterView[] = [];
  /** Skinned special item shots: their colours, for the burst when they end. */
  private projGlow = new Map<number, [number, number]>();
  /** Sound and effect cues tied to a moment inside an action (the cork popping, the bottle tossed). */
  private cues: { f: FighterId; action: ActionState; due: (a: ActionState) => boolean; run: () => void }[] = [];
  /** Empty bottles flying away after a drink. */
  private bottles: { id: UsableId; x: number; y: number; vx: number; vy: number; t: number }[] = [];
  private acc = 0;
  private alpha = 0;
  speed = 1;
  paused = false;
  private slow = 1;
  private slowT = 0;
  private time = 0;
  /** Camera centre in world metres (what the buffer is drawn around), and shake. */
  private camX = 0;
  camMode: CamMode = 'classic';
  /** The fighter the follow camera stays on (the local player). */
  focus: FighterId = 0;
  /** Where the view looks (may pass the arena-drawing clamp; the zoom crop covers the rest). */
  private viewX = 0;
  private viewY = 0;
  /** Current zoom, and the steady zoom level in device px per art px. */
  private zoom = 1;
  private level = 0;
  /** Action camera punch-in: extra zoom levels, time left, where it looks. */
  private punchL = 0;
  private punchT = 0;
  private punchX = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  private flashT = 0;
  private flashCol = 0xffffff;
  private gy = 0;
  private ended = false;
  listener: BattleListener | null = null;
  /** No sounds (the menu's background duel). */
  quiet = false;
  /** Fighters animate but the sim doesn't advance (intro, countdown). */
  hold = false;
  /** Called after the scene is drawn (HUD overlays). */
  onFrame: ((dt: number) => void) | null = null;
  private lastDt = 0;

  constructor(readonly screen: Screen) {
    screen.onResize = () => this.layout();
  }

  start(b: Battle, theme?: Theme): void {
    this.battle = b;
    this.theme = theme ?? THEMES[b.seed % THEMES.length];
    this.fighters = b.fighters.map((f) => {
      const art = makeArt({ name: f.name, form: f.form, gear: f.gear, look: f.look, skins: f.skins });
      const anim = new Animator(art);
      return {
        art, anim, bank: new SpriteBank(art, anim.set), out: anim.update(f, f.x, 0, false, false, false),
        flash: 0, ghosts: [], ghostT: 0, emberT: 0, sparkT: { main: 0, sec: 0, head: 0, body: 0, feet: 0, set: 0 }, headY: 2,
      };
    });
    this.fx.clear();
    this.cues.length = 0;
    this.bottles.length = 0;
    this.acc = 0;
    this.ended = false;
    this.slow = 1;
    this.camX = this.viewX = (b.fighters[0].x + b.fighters[1].x) / 2;
    this.viewY = 0;
    this.zoom = 1;
    this.level = 0;
    this.punchT = 0;
    this.layout();
  }

  /** Swaps the arena under a running battle (the arena picker). */
  setTheme(theme: Theme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    if (this.battle) this.layout();
  }

  /** Pre-draws sprites within a time budget; true when everything is ready. */
  warm(budgetMs: number): boolean {
    let done = true;
    for (const v of this.fighters) done = v.bank.warm(budgetMs / this.fighters.length) && done;
    return done;
  }

  private layout(): void {
    const { w, h } = this.screen;
    this.gy = h > w ? Math.round(h * 0.6) : h - Math.max(44, Math.round(h * 0.17));
    const travel = Math.max(0, (ARENA_HALF_WIDTH + 1.8) * PPM - w / 2) + 12;
    this.arena = new ArenaView(this.theme, w, h, this.gy, travel);
  }

  // --- View --------------------------------------------------------------------
  sx(x: number): number {
    return this.screen.w / 2 + (x - this.camX) * PPM + this.shakeX;
  }
  sy(y: number): number {
    return this.gy - y * PPM + this.shakeY;
  }
  private shakeX = 0;
  private shakeY = 0;

  shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeT = 0.25 + amount * 0.3;
  }

  flash(color: number, amount: number): void {
    this.flashT = Math.max(this.flashT, amount * 0.12);
    this.flashCol = color;
  }

  /** Action camera: a quick zoom toward world x. */
  private punchIn(levels: number, seconds: number, x: number): void {
    if (this.camMode !== 'action' || this.quiet) return;
    if (this.punchT > 0 && this.punchL > levels) return;
    this.punchL = levels;
    this.punchT = seconds;
    this.punchX = x;
  }

  slowmo(scale: number, seconds: number): void {
    this.slow = scale;
    this.slowT = seconds;
  }

  // --- Loop ----------------------------------------------------------------------
  frame(realDt: number): void {
    const b = this.battle;
    if (!b || !this.arena) return;
    const dt = Math.min(0.1, realDt);
    this.time += dt;
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 1; }
    if (!this.paused && !this.hold) {
      this.acc += dt * this.speed * this.slow;
      let steps = 0;
      while (this.acc >= DT && steps < 12) {
        b.step();
        for (const e of b.drainEvents()) this.handle(e);
        this.acc -= DT;
        steps++;
      }
      if (steps === 12) this.acc = 0;
      if (b.over && !this.ended && b.endTime > 2.2) {
        this.ended = true;
        this.listener?.onEnd?.(b);
      }
    }
    this.alpha = this.acc / DT;
    const vdt = this.paused ? 0 : dt * this.speed * this.slow;
    this.fx.update(vdt);
    this.arena.update(vdt);
    this.updateCamera(dt);
    this.draw(vdt);
    this.onFrame?.(dt);
    this.screen.present();
  }

  private lx(f: Fighter): number {
    return f.px + (f.x - f.px) * this.alpha;
  }
  private ly(f: Fighter): number {
    return f.py + (f.y - f.py) * this.alpha;
  }

  private updateCamera(dt: number): void {
    const b = this.battle!;
    const sc = this.screen;
    const [a, c] = b.fighters;
    const ax = this.lx(a), cx = this.lx(c);
    const mid = (ax + cx) / 2;
    const s = sc.scale;
    // Zoom levels in device px per art px: s is the whole arena; `tight` aims
    // for ~220 art px of height (~260 of width on portrait phones).
    const W = sc.w * s, H = sc.h * s;
    const tight = Math.max(s + 1, Math.min(Math.round(H / 220), Math.floor(W / 260)));
    const mode = this.camMode;
    let lo = s, hi = s, tx = mid, ty = Math.max(this.ly(a), this.ly(c));
    if (mode === 'action') hi = Math.max(s + 1, tight - 1);
    else if (mode === 'close') hi = tight;
    else if (mode === 'follow') lo = hi = tight;
    // Widest view (metres) at level L, and what the duel needs to stay in frame.
    const span = (L: number) => W / L / PPM;
    const need = Math.abs(ax - cx) + 3.2;
    let L = clamp(this.level || hi, lo, hi);
    while (L > lo && span(L) < need) L--;
    while (L < hi && span(L + 1) >= need + 1.2) L++;
    this.level = L;
    if (mode === 'follow') {
      // On you, leaning toward the rival: a two-shot when they're near, your side of it when they're not.
      const you = b.fighters[this.focus], them = b.other(you);
      const yx = this.lx(you), room = Math.max(0, span(L) / 2 - 1.6);
      tx = yx + clamp((this.lx(them) - yx) / 2, -room, room);
      ty = this.ly(you);
    }
    let zl = L;
    if (this.punchT > 0) {
      this.punchT -= dt;
      zl = Math.min(L + this.punchL, tight + 1);
      tx = mid + (this.punchX - mid) * 0.6;
    }
    const zt = mode === 'classic' ? 1 : zl / s;
    // Never look past the arena's ends at the zoom we're heading for.
    const edge = Math.max(0, ARENA_HALF_WIDTH + 1.8 - sc.w / zt / 2 / PPM);
    tx = clamp(tx, -edge, edge);
    const zoomIn = zt > this.zoom;
    this.zoom += (zt - this.zoom) * Math.min(1, dt * (zoomIn ? (this.punchT > 0 ? 16 : 6) : 4));
    if (Math.abs(zt - this.zoom) < 0.004) this.zoom = zt;
    this.viewX += (tx - this.viewX) * Math.min(1, dt * (this.punchT > 0 ? 9 : 5));
    this.viewY += (ty - this.viewY) * Math.min(1, dt * 4);
    // The buffer is drawn as far as the arena art reaches; the zoom crop looks past that.
    const half = sc.w / 2 / PPM;
    const lim = Math.max(0, ARENA_HALF_WIDTH + 1.8 - half);
    this.camX = clamp(this.viewX, -lim, lim);
    // Keep the ground at the same height on screen, lifting a little for jumps.
    const vh = sc.h / this.zoom;
    const cy = this.gy - (this.gy / sc.h - 0.5) * vh - Math.min(this.viewY, 2.5) * PPM * 0.5 * (1 - 1 / this.zoom);
    sc.setView(this.zoom, sc.w / 2 + (this.viewX - this.camX) * PPM, cy);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * PPM * 0.12 * Math.max(0, this.shakeT * 3);
      this.shakeX = Math.round((Math.random() - 0.5) * 2 * a);
      this.shakeY = Math.round((Math.random() - 0.5) * 2 * a * 0.6);
      if (this.shakeT <= 0) { this.shakeAmp = 0; this.shakeX = this.shakeY = 0; }
    }
  }

  // --- Drawing -----------------------------------------------------------------------
  private draw(dt: number): void {
    const g = this.screen.g;
    const b = this.battle!;
    const cam = this.camX * PPM;
    this.arena!.setDay(b.time / ROUND_TIME);
    this.arena!.draw(g, cam, this.time, this.shakeX, this.shakeY);
    this.fx.drawUnder(g, this);
    // Shadows.
    for (const f of b.fighters) {
      const x = Math.round(this.sx(this.lx(f))), y = Math.round(this.sy(0));
      const lift = clamp(this.ly(f) / 2.5, 0, 0.7);
      this.arena!.shadow(g, x, y, 11 + (f.form === 'titan' ? 4 : f.form === 'robust' || f.form === 'mighty' || f.form === 'stout' ? 2 : 0), 1, lift);
    }
    // The fighter mid-attack draws in front.
    const order: FighterId[] = b.fighters[0].action && !b.fighters[1].action ? [1, 0] : [0, 1];
    const secOut = (id: FighterId) => b.projectiles.some((p) => p.alive && p.owner === id && p.style === 'chakram');
    for (const id of order) this.drawFighter(g, b.fighters[id], this.fighters[id], dt, secOut(id));
    for (const f of b.fighters) this.drawItem(g, f);
    for (const p of b.projectiles) if (p.alive) this.drawProjectile(g, p);
    this.runCues();
    this.drawBottles(g, dt);
    this.arena!.light(g, cam, this.time);
    this.fx.draw(g, this);
    if (this.flashT > 0) {
      g.globalAlpha = Math.min(0.5, this.flashT * 4);
      g.fillStyle = css(this.flashCol);
      g.fillRect(0, 0, this.screen.w, this.screen.h);
      g.globalAlpha = 1;
      this.flashT -= dt;
    }
  }

  private drawFighter(g: CanvasRenderingContext2D, f: Fighter, v: FighterView, dt: number, secOut: boolean): void {
    const b = this.battle!;
    this.lastDt = dt;
    const x = this.lx(f), y = this.ly(f);
    const over = b.over;
    // The belt is empty once every use of the usable item is spent.
    const useOut = f.uses.some((u, i) => u === 0 && f.abilities[i].from === 'usable');
    v.out = v.anim.update(f, x, dt, over, b.winner === f.id, secOut, useOut);
    const o = v.out;
    const s = v.bank.get(o);
    const flip = f.facing < 0;
    const px = Math.round(this.sx(x)) + o.jitter, py = Math.round(this.sy(y)) - o.hop;
    v.headY = y + 2.0;

    // Afterimages: haste, dashes and rolls.
    const ab = f.action ? f.abilities[f.action.ability] : null;
    const dashing = !!ab && (ab.kind === 'dash' || ab.slot === 'evade') && f.action!.phase === 'active';
    v.ghostT -= dt;
    if ((dashing || getStatus(f, 'haste')) && v.ghostT <= 0 && dt > 0) {
      v.ghosts.push({ x: px, y: py, s, flip, t: 0 });
      v.ghostT = dashing ? 0.03 : 0.09;
    }
    for (let i = v.ghosts.length - 1; i >= 0; i--) {
      const gh = v.ghosts[i];
      gh.t += dt;
      if (gh.t > 0.22) { v.ghosts.splice(i, 1); continue; }
      g.globalAlpha = 0.45 * (1 - gh.t / 0.22);
      blit(g, solidCache(gh.s, getStatus(f, 'rage') ? '#ff6040' : '#9ad8ff'), gh.x, gh.y, gh.flip);
    }
    g.globalAlpha = 1;

    // Invulnerability frames blink.
    const set = f.alive ? v.art.set : null;
    if (set) drawSetAura(g, set, px, py + o.hop, this.time, 'back');
    if (f.invuln > 0 && f.alive && Math.floor(this.time * 30) % 2 === 0) g.globalAlpha = 0.55;
    blit(g, s, px, py, flip);
    g.globalAlpha = 1;
    if (set) drawSetAura(g, set, px, py + o.hop, this.time, 'front');

    if (dt > 0 && f.alive) this.legendSparks(f, v, s, x, y, flip);

    // Tints and overlays.
    const tint = (color: string, a: number) => {
      g.globalAlpha = a;
      blit(g, v.bank.flash(o, color), px, py, flip);
      g.globalAlpha = 1;
    };
    if (v.flash > 0) { tint('#ffffff', Math.min(1, v.flash * 12)); v.flash -= dt; }
    if (getStatus(f, 'frozen')) tint('#bff0ff', 0.6);
    else if (getStatus(f, 'chill')) tint('#8ad8ff', 0.22);
    if (getStatus(f, 'ironskin')) tint('#e8eef8', 0.25 + 0.15 * Math.sin(this.time * 10));
    if (getStatus(f, 'rage')) tint('#ff3020', 0.14 + 0.08 * Math.sin(this.time * 14));
    if (getStatus(f, 'vulnerable')) tint('#ff80a0', 0.12);
    if (f.empowered && f.alive) tint('#a878ff', 0.12 + 0.07 * Math.sin(this.time * 6));

    // Status particles.
    v.emberT -= dt;
    if (v.emberT <= 0 && dt > 0 && f.alive) {
      v.emberT = 0.06;
      const bx = x, by = y + 0.9;
      if (f.empowered && Math.random() < 0.4) this.fx.burst({ x: bx, y: by - 0.6, jitter: 0.45, jitterY: 0.9, count: 1, dir: Math.PI / 2, spread: 0.25, speed: [0.8, 1.8], life: [0.35, 0.7], color: 0xe8d8ff, color2: 0x8050f0, kind: 'twinkle' });
      if (getStatus(f, 'burn')) this.fx.burst({ x: bx, y: by, jitter: 0.35, jitterY: 0.6, count: 1, dir: Math.PI / 2, spread: 0.3, speed: [0.8, 1.6], life: [0.3, 0.6], color: 0xffd060, color2: 0xd83a1a, kind: 'ember' });
      if (getStatus(f, 'poison')) this.fx.burst({ x: bx, y: by, jitter: 0.3, jitterY: 0.6, count: 1, dir: Math.PI / 2, spread: 0.2, speed: [0.4, 0.8], life: [0.4, 0.7], color: 0x9cff4a, color2: 0x3a8a2a, size: 2 });
      if (getStatus(f, 'chill')) this.fx.burst({ x: bx, y: by + 0.6, jitter: 0.4, count: 1, dir: -Math.PI / 2, spread: 0.4, speed: [0.3, 0.7], life: [0.4, 0.8], color: 0xf0ffff, color2: 0x8ad8ff });
      if (f.has.has('ember_core') && Math.random() < 0.35) {
        const c = this.glow(f.id, 0xffb040, 0xc83a1a);
        this.fx.burst({ x: bx - f.facing * 0.2, y: by, jitter: 0.3, jitterY: 0.5, count: 1, dir: Math.PI / 2, spread: 0.3, speed: [0.6, 1.2], life: [0.3, 0.6], color: c[0], color2: c[1], kind: 'ember' });
      }
      if (f.has.has('frost_core') && Math.random() < 0.35) {
        const c = this.glow(f.id, 0xe8fbff, 0x7ac8f0);
        this.fx.burst({ x: bx, y: by + 0.4, jitter: 0.4, jitterY: 0.5, count: 1, dir: -Math.PI / 2, spread: 0.6, speed: [0.2, 0.5], life: [0.5, 0.9], color: c[0], color2: c[1] });
      }
    }
    const hx = px, hy = Math.round(this.sy(y + 2.05)) - o.hop;
    if (getStatus(f, 'stun') && f.alive) {
      // Stars circling over the head.
      for (let i = 0; i < 3; i++) {
        const a = this.time * 6 + (i * Math.PI * 2) / 3;
        const sx = Math.round(hx + Math.cos(a) * 7), sy = Math.round(hy - 3 + Math.sin(a) * 2);
        g.fillStyle = Math.sin(a) > 0 ? '#ffe070' : '#c89a30';
        g.fillRect(sx, sy - 1, 1, 3); g.fillRect(sx - 1, sy, 3, 1);
      }
    }
    const mark = getStatus(f, 'mark');
    if (mark && f.alive) {
      // Hex mark: a small rune over the head, pips per stack.
      const ry = hy - 9 + Math.round(Math.sin(this.time * 4));
      g.fillStyle = '#c070ff';
      g.fillRect(hx - 2, ry, 5, 1); g.fillRect(hx, ry - 2, 1, 5); g.fillRect(hx - 1, ry - 1, 3, 3);
      g.fillStyle = '#f0d8ff'; g.fillRect(hx, ry, 1, 1);
    }
    if (f.shield > 0 && f.alive) {
      const r = 15, cx = px - (flip ? -1 : 1), cy = py - 30;
      g.fillStyle = 'rgba(255,215,107,0.9)';
      const n = 40;
      for (let i = 0; i < n; i++) {
        if ((i + Math.floor(this.time * 12)) % 5 === 0) continue;
        const a = (i / n) * Math.PI * 2;
        g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 1.9), 1, 1);
      }
    }
    // An epic core floats at the far shoulder, bobbing.
    if (f.alive && skinDraws('core', v.art.specialSkinId)) {
      const s = projSprite('core', Math.floor(this.time * 6), 0, v.art.specialSkinId);
      const cx = Math.round(this.sx(x - f.facing * 0.42)), cy = Math.round(this.sy(y + 1.75) + Math.sin(this.time * 2.4) * 1.5);
      g.drawImage(s.img, cx - s.ox, cy - s.oy);
    }
    // Familiar: the wisp lantern floats behind the shoulder.
    if (f.familiar && f.alive) {
      const fx = Math.round(this.sx(x - f.facing * 0.5)), fy = Math.round(this.sy(y + 2.1) + Math.sin(this.time * 3) * 2);
      const charging = f.familiar.charge > 0;
      const skinId = v.art.specialSkinId;
      if (skinDraws('lantern', skinId)) {
        // An epic lantern brings its own sprite; it flickers faster while charging a shot.
        const s = projSprite('lantern', Math.floor(this.time * (charging ? 16 : 6)), 0, skinId);
        g.drawImage(s.img, fx - s.ox, fy - s.oy);
        return;
      }
      const sk = v.art.specialSkin?.mats;
      const metal = sk?.lantern?.base ?? 0xc89a30, light = sk?.wisp?.base ?? 0x7ae8ff, hot = sk?.wispHot?.base ?? 0xf0ffff;
      g.fillStyle = css(metal); g.fillRect(fx - 2, fy - 4, 5, 1); g.fillRect(fx - 2, fy + 3, 5, 1); g.fillRect(fx, fy - 6, 1, 2);
      g.fillStyle = css(mix(metal, 0x1a0c08, 0.6)); g.fillRect(fx - 2, fy - 3, 1, 6); g.fillRect(fx + 2, fy - 3, 1, 6);
      g.fillStyle = css(charging && Math.floor(this.time * 20) % 2 ? hot : light);
      g.fillRect(fx - 1, fy - 3, 3, 6);
      g.fillStyle = css(hot); g.fillRect(fx, fy - 1, 1, 2);
    }
  }

  /**
   * Legendary skins shed sparkles from where they are worn: weapon tips
   * (faster mid-move), the head, around the body, and at the feet (more
   * while moving).
   */
  private legendSparks(f: Fighter, v: FighterView, s: Sprite, x: number, y: number, flip: boolean): void {
    const dt = this.lastDt, art = v.art, t = v.sparkT;
    const at = (p: [number, number]): [number, number] => [x + (flip ? -p[0] : p[0]) / PPM, y + (v.out.hop - p[1]) / PPM];
    const emit = (fx: SkinFx, px: number, py: number, jitter: number, life: [number, number], speed: [number, number] = [0.1, 0.5]) => {
      const flame = fx.kind === 'flame';
      this.fx.burst({
        x: px, y: py, jitter, jitterY: jitter, count: 1, dir: Math.PI / 2, spread: flame ? 0.3 : 0.6,
        speed: flame ? [speed[0] + 0.4, speed[1] + 0.8] : speed, life, color: fx.spark, color2: fx.spark2, kind: fx.kind ?? 'twinkle',
      });
    };
    const tick = (k: keyof FighterView['sparkT'], every: number) => (t[k] -= dt) <= 0 && ((t[k] = every), true);
    const main = art.mainSkin?.fx;
    if (main && s.tip && tick('main', f.action ? 0.03 : 0.12)) emit(main, ...at(s.tip), 0.06, [0.25, 0.55]);
    const sec = art.secSkin?.fx;
    if (sec && s.secTip && tick('sec', f.action ? 0.04 : 0.14)) emit(sec, ...at(s.secTip), 0.06, [0.25, 0.55]);
    const head = art.headSkin?.fx;
    if (head && tick('head', 0.35)) emit(head, x - f.facing * 0.05, y + 2.35, 0.22, [0.5, 0.9], [0.2, 0.45]);
    const body = art.chestSkin?.fx;
    if (body && tick('body', 0.22)) emit(body, x, y + 1.1, 0.4, [0.5, 0.9], [0.15, 0.4]);
    const feet = art.bootsSkin?.fx;
    if (feet && tick('feet', Math.abs(f.x - f.px) > 0.001 || f.y > 0.05 ? 0.05 : 0.4)) emit(feet, x, y + 0.08, 0.25, [0.3, 0.6], [0.2, 0.6]);
    // A whole epic set: its aura sheds particles from the ring at the feet.
    if (art.set && tick('set', 0.07)) {
      const a = Math.random() * Math.PI * 2;
      emit(SET_FX[art.set], x + Math.cos(a) * 0.55, y + 0.05 + Math.sin(a) * 0.1, 0.05, [0.5, 0.9], [0.5, 1.1]);
    }
  }

  private drawItem(g: CanvasRenderingContext2D, f: Fighter): void {
    const it = f.item;
    if (!it) return;
    const ab = f.abilities[it.ability];
    if (ab.kind === 'meteor') {
      if (it.phase !== 'windup') return;
      const s = projSprite('sigil', Math.floor(this.time * 10), 0, this.fighters[f.id]?.art.specialSkinId);
      const x = Math.round(this.sx(this.lx(f))), y = Math.round(this.sy(this.ly(f) + 2.8));
      g.drawImage(s.img, x - s.ox, y - s.oy);
      return;
    }
    // Phantom blade: rises, flies at the enemy, slashes, returns.
    let ang = Math.PI / 2;
    const e = this.battle!.other(f);
    if (it.phase === 'travel') ang = Math.atan2(1.2 - it.y, e.x - it.x);
    else if (it.phase === 'active') ang = this.time * 14 * f.facing;
    else if (it.phase === 'return') ang = Math.atan2(f.y + 2 - it.y, f.x - it.x) + Math.PI;
    const s = projSprite('phantom', Math.floor(this.time * 8), ang, this.fighters[f.id]?.art.specialSkinId);
    const x = Math.round(this.sx(it.x)), y = Math.round(this.sy(it.y));
    g.globalAlpha = 0.85;
    g.drawImage(s.img, x - s.ox, y - s.oy);
    g.globalAlpha = 1;
    if (Math.random() < 0.5) {
      const c = this.glow(f.id, 0xd8e8ff, 0x6a8ad8);
      this.fx.burst({ x: it.x, y: it.y, count: 1, speed: [0.2, 0.6], life: [0.2, 0.4], color: c[0], color2: c[1] });
    }
  }

  /** Fires cues whose moment in the action has come; drops those whose action is over. */
  private runCues(): void {
    const b = this.battle!;
    for (let i = this.cues.length - 1; i >= 0; i--) {
      const c = this.cues[i];
      const f = b.fighters[c.f];
      if (f.action !== c.action) { this.cues.splice(i, 1); continue; }
      if (c.due(c.action)) { c.run(); this.cues.splice(i, 1); }
    }
  }

  /** Empty bottles tumbling over the shoulder, smashing where they land. */
  private drawBottles(g: CanvasRenderingContext2D, dt: number): void {
    for (let i = this.bottles.length - 1; i >= 0; i--) {
      const o = this.bottles[i];
      o.t += dt;
      o.vy -= 22 * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.y <= 0.08) {
        this.bottles.splice(i, 1);
        this.fx.burst({ x: o.x, y: 0.12, count: 9, dir: Math.PI / 2, spread: 1.2, speed: [1.5, 4], life: [0.25, 0.5], color: 0xf0fbff, color2: 0x9ab8c8, gravity: 16, size: 1 });
        this.play('glass', this.pan(o.x), 0.5);
        continue;
      }
      const s = bottleSprite(o.id, Math.floor(o.t * 22) * Math.sign(o.vx || 1));
      g.drawImage(s.img, Math.round(this.sx(o.x)) - s.ox, Math.round(this.sy(o.y)) - s.oy);
    }
  }

  private drawProjectile(g: CanvasRenderingContext2D, p: Projectile): void {
    const x = p.px + (p.x - p.px) * this.alpha, y = p.py + (p.y - p.py) * this.alpha;
    const style = p.style;
    let ang = Math.atan2(p.vy, p.vx);
    if (p.ground || style === 'chakram' || style === 'hex' || style === 'fire' || style === 'arcane' || style === 'wisp') ang = p.vx < 0 ? Math.PI : 0;
    if (style === 'flask') ang = 0; // tumbles on its own
    if (style === 'flamewave' || style === 'groundwave') ang = p.vx < 0 ? Math.PI : 0;
    const thrower = this.fighters[p.owner]?.art;
    // Meteors and wisp shots come from the special item, in its skin's colours.
    const fromItem = style === 'meteor' || style === 'wisp';
    const skin = fromItem ? thrower?.specialSkinId : null;
    // Epic weapons can reshape what they throw.
    const wid = p.def.from === 'main' ? thrower?.mainId : p.def.from === 'secondary' ? thrower?.secId : null;
    const wskin = !fromItem && wid ? thrower?.skins[wid] ?? null : null;
    const look = skin ?? (skinDraws(style, wskin) ? wskin : null);
    const frame = Math.floor(this.time * (style === 'chakram' || style === 'knife' ? 24 : 12)) % projFrames(style, look);
    let s = projSprite(style, frame, ang, look);
    const sx = Math.round(this.sx(x)), sy = Math.round(this.sy(y));
    if ((style === 'flamewave' || style === 'groundwave') && p.vx < 0) {
      // Ground waves are drawn upright and mirrored rather than rotated.
      s = projSprite(style, frame, 0, look);
      blit(g, s, sx, sy, true);
    } else g.drawImage(s.img, sx - s.ox, sy - s.oy);
    // Legendary weapons leave sparkles behind their shots.
    const legend = p.def.from === 'main' ? thrower?.mainSkin?.fx : p.def.from === 'secondary' ? thrower?.secSkin?.fx : undefined;
    if (legend && Math.random() < 0.6) this.fx.burst({ x, y, jitter: 0.05, count: 1, speed: [0, 0.3], life: [0.2, 0.4], color: legend.spark, color2: legend.spark2, kind: legend.kind ?? 'twinkle' });
    // Trails.
    if (skin) this.projGlow.set(p.id, this.glow(p.owner, STYLE_COLOR[style], 0));
    if (Math.random() < (style === 'meteor' ? 1 : 0.5)) {
      const col = skin ? this.glow(p.owner, STYLE_COLOR[style], 0)[0] : STYLE_COLOR[style];
      const back = Math.atan2(-p.vy, -p.vx);
      if (style === 'meteor') {
        const c = this.glow(p.owner, 0xffd060, 0x8a2a1a);
        this.fx.burst({ x, y, count: 2, dir: back, spread: 0.4, speed: [1, 3], life: [0.3, 0.6], color: c[0], color2: mix(c[1], 0x200a08, 0.4), kind: 'ember', jitter: 0.2 });
      }
      else if (style === 'flamewave' || style === 'groundwave') this.fx.burst({ x, y: 0.1, count: 1, dir: Math.PI / 2, spread: 0.6, speed: [0.5, 1.5], life: [0.3, 0.5], color: col, color2: 0x5a4a50, kind: style === 'flamewave' ? 'ember' : 'smoke', size: 3 });
      else if (style !== 'arrow' && style !== 'bolt' && style !== 'knife') this.fx.burst({ x, y, count: 1, dir: back, spread: 0.3, speed: [0.5, 1.5], life: [0.15, 0.3], color: col, color2: mix(col, 0x202040, 0.6) });
    }
  }

  // --- Events -----------------------------------------------------------------------------
  private play(name: Sfx, pan = 0, k = 1): void {
    if (!this.quiet) sfx.play(name, pan, k);
  }

  private pan(x: number): number {
    return clamp((x - this.camX) / 8, -0.8, 0.8);
  }

  /** Cues for using an item: the cork pops as the flask comes up, the empty bottle flies off after. */
  private useCues(id: FighterId, anim: string): void {
    const f = this.battle!.fighters[id];
    const a = f.action;
    if (!a) return;
    const art = this.fighters[id]?.art;
    if (anim === 'drink') {
      this.cues.push({ f: id, action: a, due: (x) => x.phase !== 'windup' || x.t >= x.draw + (x.windup - x.draw) * 0.3, run: () => this.play('cork', this.pan(f.x), 0.8) });
      this.cues.push({
        f: id, action: a,
        due: (x) => x.phase === 'recovery' && x.t >= (x.recovery - x.stow) * 0.4,
        run: () => {
          if (!art?.useId) return;
          this.bottles.push({ id: art.useId, x: f.x - f.facing * 0.1, y: 1.9, vx: -f.facing * (2.4 + Math.random()), vy: 4.5 + Math.random(), t: 0 });
          this.play('whoosh', this.pan(f.x), 0.4);
        },
      });
    } else this.play('whoosh', this.pan(f.x), 0.5);
  }

  /** The potion takes effect: its colour swirls up around the drinker. */
  private drinkFx(id: FighterId): void {
    const f = this.battle!.fighters[id];
    const c = this.fighters[id]?.art.use?.glow ?? [0xffffff, 0xc0c0c0];
    const fx = this.fx;
    this.play('gulp', this.pan(f.x));
    fx.pulse('ring', f.x, 1.1, 1.3, c[0], 0.4);
    fx.burst({ x: f.x, y: 0.4, count: 22, jitter: 0.45, dir: Math.PI / 2, spread: 0.35, speed: [1.5, 3.5], life: [0.5, 0.9], color: c[0], color2: c[1], drag: 1.5, kind: 'twinkle' });
    fx.burst({ x: f.x, y: 1.0, count: 10, jitter: 0.3, speed: [2, 4], life: [0.2, 0.4], color: 0xffffff, color2: c[0], drag: 3, kind: 'streak' });
  }

  private handle(e: BattleEvent): void {
    this.listener?.onEvent?.(e);
    const b = this.battle!;
    const fx = this.fx;
    switch (e.type) {
      case 'actionStart': {
        const f = b.fighters[e.f];
        const ab = f.abilities[e.ability];
        if (ab.from === 'usable') {
          this.useCues(e.f, ab.anim);
          break;
        }
        if (ab.slot === 'evade') {
          fx.burst({ x: f.x, y: 0.1, count: 5, jitter: 0.3, dir: Math.PI / 2, spread: 1, speed: [0.5, 1.5], life: [0.3, 0.5], color: 0xc8b8a0, color2: 0x8a7a70, kind: 'smoke', size: 3 });
          this.play('whoosh', this.pan(f.x), 0.7);
        } else if (ab.kind === 'projectile' || ab.kind === 'meteor') this.play('cast', this.pan(f.x), 0.8);
        else if (ab.kind === 'buff') this.play('roar', this.pan(f.x));
        break;
      }
      case 'itemStart': {
        const f = b.fighters[e.f];
        const ab = f.abilities[e.ability];
        this.play('castBig', this.pan(f.x));
        fx.pulse('ring', f.x, 2.4, 1.2, this.glow(f.id, ab.kind === 'meteor' ? 0xff9a3a : 0xa8c8ff, 0)[0], 0.4);
        this.arena?.cheer(0.4);
        break;
      }
      case 'actionActive': {
        const f = b.fighters[e.f];
        const ab = f.abilities[e.ability];
        if (ab.kind === 'melee' || (ab.kind === 'dash' && ab.slot !== 'evade')) this.play(ab.heavy ? 'swingHeavy' : 'swing', this.pan(f.x));
        if (ab.kind === 'buff' && ab.from === 'usable') this.drinkFx(e.f);
        else if (ab.kind === 'buff') {
          const col = ab.id === 'war_cry' || ab.anim === 'horn' ? 0xff5030 : ab.anim === 'harden' ? 0xe8eef8 : 0xffd76b;
          fx.pulse('ring', f.x, 1.1, 1.6, col, 0.4);
          fx.burst({ x: f.x, y: 1.1, count: 18, speed: [3, 6], life: [0.25, 0.5], color: col, drag: 3, kind: 'streak' });
          if (ab.anim === 'horn') { this.shake(0.3); this.arena?.cheer(0.6); }
        }
        if (ab.kind === 'dash' && ab.slot !== 'evade') {
          fx.burst({ x: f.x, y: 0.1, count: 6, jitter: 0.3, dir: Math.PI / 2 + f.facing * 1.2, spread: 0.5, speed: [1, 3], life: [0.4, 0.6], color: 0xd8c8b0, color2: 0x8a7a70, kind: 'smoke', size: 3 });
          fx.burst({ x: f.x, y: 1.0, count: 12, dir: f.facing > 0 ? Math.PI : 0, spread: 0.15, speed: [4, 9], life: [0.15, 0.3], color: 0xffffff, color2: 0x9ad8ff, kind: 'streak' });
        }
        break;
      }
      case 'hit': {
        if (e.dot) {
          if (e.amount >= 1) fx.pop(fmt(e.amount), e.x + (Math.random() - 0.5) * 0.3, e.y, { color: e.ability === 'poison' ? '#9cff4a' : e.ability === 'thorns' ? '#7ad870' : '#ffb040' }, 0.7, 1.2);
          break;
        }
        const tv = this.fighters[e.target];
        if (tv && !e.blocked) tv.flash = 0.09;
        const att = b.fighters[e.attacker];
        const dir = e.x >= att.x ? 0 : Math.PI;
        const heavy = e.heavy || e.crit;
        const color = e.blocked ? 0xbfd8ff : e.dtype === 'magic' ? 0xc58cff : e.ability === 'lightning' ? 0xaedcff : 0xffd27a;
        fx.burst({ x: e.x, y: e.y, count: e.blocked ? 8 : heavy ? 22 : 12, dir, spread: e.blocked ? 1.2 : 0.8, speed: heavy ? [5, 12] : [3, 8], life: [0.12, 0.35], color: 0xffffff, color2: color, gravity: 12, drag: 2, kind: 'streak' });
        fx.pulse('star', e.x, e.y, e.blocked ? 0.25 : heavy ? 0.5 : 0.32, color, heavy ? 0.16 : 0.1);
        this.legendHit(e.attacker, e.target, e.ability, e.blocked, heavy, e.x, e.y);
        if (heavy && !e.blocked) {
          fx.pulse('ring', e.x, e.y, 0.9, color, 0.25);
          fx.burst({ x: e.x, y: 0.1, count: 4, jitter: 0.3, dir: Math.PI / 2, spread: 1, speed: [0.5, 1.5], life: [0.4, 0.7], color: 0xb0a090, color2: 0x6a5a60, kind: 'smoke', size: 3 });
        }
        const pan = this.pan(e.x);
        if (e.blocked) this.play('block', pan);
        else this.play(heavy ? 'hitHeavy' : 'hit', pan, e.echo ? 0.5 : 1);
        if (e.crit) this.play('crit', pan);
        this.shake(e.blocked ? 0.1 : e.killing ? 1 : heavy ? 0.45 : 0.18);
        if (heavy && !e.blocked) this.punchIn(1, e.crit ? 0.5 : 0.35, e.x);
        if (heavy) { this.arena?.cheer(0.3); }
        const label = e.crit ? `${fmt(e.amount)}!` : fmt(e.amount);
        const st = e.blocked ? { color: '#a8c8f0' } : e.crit ? { color: '#ffe040', scale: 2, shade: '#e08a20' } : e.echo ? { color: css(this.glow(e.attacker, 0xc0a8ff, 0)[0]) } : e.dtype === 'magic' ? { color: '#d8a8ff', shade: '#9a5ae0' } : heavy ? { color: '#ffffff', scale: 2, shade: '#c8c8d8' } : { color: '#ffffff', shade: '#c8c8d8' };
        fx.pop(label, e.x, e.y + 0.5, st, e.crit ? 1.1 : 0.85);
        if (e.ability === 'wall') fx.pop('WALL SPLAT!', e.x, e.y + 1.2, { color: '#ffb040', scale: 2 }, 1.1, 0.8);
        break;
      }
      case 'parry':
        fx.pulse('ring', e.x, e.y, 0.9, 0xffffff, 0.3);
        fx.pulse('star', e.x, e.y, 0.7, 0xbfe4ff, 0.2);
        fx.burst({ x: e.x, y: e.y, count: 22, speed: [5, 11], life: [0.15, 0.35], color: 0xffffff, color2: 0x9ad8ff, drag: 3, kind: 'streak' });
        this.play('parry', this.pan(e.x));
        fx.pop('PARRY!', e.x, e.y + 1.1, { color: '#bfe8ff', scale: 2, shade: '#6aa8e0' }, 1.1, 0.9);
        this.shake(0.3);
        this.flash(0xffffff, 0.5);
        this.arena?.cheer(0.5);
        this.punchIn(1, 0.45, e.x);
        break;
      case 'heal': {
        const f = b.fighters[e.f];
        fx.burst({ x: f.x, y: 1.0, count: 6, jitter: 0.4, dir: Math.PI / 2, spread: 0.3, speed: [0.8, 1.6], life: [0.5, 0.8], color: 0x8aff9a, color2: 0x3ac860, size: 2 });
        if (e.amount >= 15) fx.pop(`+${fmt(e.amount)}`, f.x, this.fighters[e.f].headY, { color: '#8aff9a', shade: '#3ac860' }, 0.8);
        break;
      }
      case 'used':
        break;
      case 'cleanse': {
        const f = b.fighters[e.f];
        fx.burst({ x: f.x, y: 1.0, count: 16, jitter: 0.35, jitterY: 0.6, dir: Math.PI / 2, spread: 0.5, speed: [1, 3], life: [0.4, 0.7], color: 0xffffff, color2: 0xc8e8ff, kind: 'twinkle' });
        fx.pop('CLEANSED', f.x, this.fighters[e.f].headY + 0.35, { color: '#e8f4ff' }, 0.9);
        break;
      }
      case 'energy': {
        const f = b.fighters[e.f];
        fx.burst({ x: f.x, y: 1.0, count: 20, jitter: 0.3, dir: Math.PI / 2, spread: 0.35, speed: [2, 5], life: [0.3, 0.6], color: 0xfffbe0, color2: 0xffc020, drag: 2, kind: 'streak' });
        if (e.amount > 0) fx.pop(`+${e.amount} ENERGY`, f.x, this.fighters[e.f].headY + 0.35, { color: '#ffe060', shade: '#c08a10' }, 0.9);
        this.play('cast', this.pan(f.x), 0.6);
        break;
      }
      case 'secondWind': {
        const f = b.fighters[e.f];
        fx.pulse('ring', f.x, 1.0, 1.4, 0xff3a4a, 0.4);
        fx.burst({ x: f.x, y: 0.8, count: 30, jitter: 0.4, speed: [2, 6], life: [0.4, 0.8], color: 0xffb0b8, color2: 0xc0102a, gravity: -2, drag: 2, kind: 'ember' });
        fx.pop('SECOND WIND!', f.x, this.fighters[e.f].headY + 0.4, { color: '#ff6a7a', scale: 2, shade: '#a01020' }, 1.1);
        this.play('roar', this.pan(f.x), 0.7);
        break;
      }
      case 'shield':
        fx.pulse('ring', b.fighters[e.f].x, 1.0, 0.9, 0xffd76b, 0.35);
        this.play('shield', this.pan(b.fighters[e.f].x));
        break;
      case 'shieldBreak': {
        const f = b.fighters[e.f];
        fx.burst({ x: f.x, y: 1.1, count: 20, speed: [3, 7], life: [0.3, 0.6], color: 0xffd76b, color2: 0xa87a20, gravity: 8, kind: 'streak' });
        fx.pop('SHIELD BROKEN', f.x, this.fighters[e.f].headY + 0.3, { color: '#ffd76b' }, 0.9);
        break;
      }
      case 'status': {
        const f = b.fighters[e.f];
        const hy = this.fighters[e.f].headY + 0.35;
        if (e.status === 'frozen') {
          fx.burst({ x: f.x, y: 1.0, count: 28, jitter: 0.4, speed: [2, 5], life: [0.3, 0.6], color: 0xffffff, color2: 0x8ad8ff, gravity: 6, kind: 'streak' });
          this.play('freeze', this.pan(f.x));
          fx.pop('FROZEN!', f.x, hy, { color: '#bff4ff', scale: 2, shade: '#6ac0e8' }, 1);
        } else if (e.status === 'stun') fx.pop('STUNNED', f.x, hy, { color: '#ffe070' }, 0.9);
        else if (e.status === 'rage') fx.pop('ENRAGED', f.x, hy, { color: '#ff7050' }, 0.9);
        else if (e.status === 'mark' && e.stacks === 1) fx.pop('HEXED', f.x, hy, { color: '#d8a8ff' }, 0.8);
        break;
      }
      case 'wallSplat':
        fx.pulse('star', e.x, 1.2, 0.8, 0xffd27a, 0.2);
        fx.burst({ x: e.x, y: 1, count: 10, jitter: 0.5, jitterY: 0.8, speed: [1, 3], life: [0.5, 0.9], color: 0xb0a090, color2: 0x6a5a60, kind: 'smoke', size: 4 });
        this.shake(0.55);
        this.arena?.cheer(0.5);
        this.punchIn(1, 0.45, e.x);
        break;
      case 'revive': {
        const f = b.fighters[e.f];
        const c = this.glow(f.id, 0xffd060, 0xc83a1a), mid = mix(c[0], c[1], 0.5);
        fx.pulse('pillar', f.x, 0, 0.5, mid, 0.8);
        fx.pulse('groundRing', f.x, 0, 3, mid, 0.6);
        fx.burst({ x: f.x, y: 1, count: 50, jitter: 0.5, speed: [2, 7], life: [0.5, 1.0], color: c[0], color2: c[1], gravity: -3, drag: 1.5, kind: 'ember' });
        this.play('revive', this.pan(f.x));
        fx.pop('REVIVE!', f.x, this.fighters[e.f].headY + 0.4, { color: css(mix(c[0], c[1], 0.3)), scale: 2, shade: css(c[1]) }, 1.3);
        this.shake(0.4);
        this.arena?.cheer(0.9);
        this.slowmo(0.35, 0.6);
        this.punchIn(1, 0.8, f.x);
        break;
      }
      case 'lightning':
        this.lightning(e.x);
        this.play('lightning', this.pan(e.x));
        this.shake(0.3);
        break;
      case 'reflect':
        fx.pulse('ring', e.x, e.y, 0.7, 0xaff6ff, 0.3);
        fx.pop('REFLECT!', e.x, e.y + 1, { color: '#aff6ff', scale: 2 }, 1);
        this.play('parry', this.pan(e.x), 0.7);
        break;
      case 'shockwave': {
        const met = e.style === 'meteor' ? this.glow(e.f, 0xffe070, 0xc83a1a) : null;
        if (e.style === 'flask') {
          // Alchemist fire: the flask shatters into a splash of flame.
          fx.pulse('groundRing', e.x, 0, e.radius * 1.1, 0xff8a2a, 0.45);
          fx.pulse('star', e.x, 0.5, 0.7, 0xfff0a0, 0.15);
          fx.burst({ x: e.x, y: 0.3, count: 34, jitter: e.radius * 0.5, dir: Math.PI / 2, spread: 1.0, speed: [2, 6], life: [0.35, 0.8], color: 0xfff0a0, color2: 0xd83a1a, gravity: 3, drag: 1.2, kind: 'flame' });
          fx.burst({ x: e.x, y: 0.3, count: 10, dir: Math.PI / 2, spread: 1.3, speed: [2, 5], life: [0.2, 0.4], color: 0xf0fbff, color2: 0x8a7a70, gravity: 14 });
          fx.burst({ x: e.x, y: 0.6, count: 6, jitter: 0.6, speed: [0.5, 1.5], life: [0.7, 1.2], color: 0x6a5a58, color2: 0x2a2028, kind: 'smoke', size: 5, drag: 1.5 });
          this.play('firebomb', this.pan(e.x));
          this.shake(0.35);
          break;
        }
        const col = e.style === 'nova' ? 0x9fe8ff : met ? (this.fighters[e.f]?.art.specialSkin?.glow ? mix(met[0], met[1], 0.5) : 0xff6a1a) : e.style === 'whirl' ? 0xe8f4ff : 0xd8a060;
        fx.pulse('groundRing', e.x, 0, e.radius * 1.2, col, 0.5);
        if (e.style !== 'nova') fx.pulse('crack', e.x, 0, e.radius * 0.8, mix(col, 0x2a1a20, 0.4), 1.6);
        if (e.style === 'meteor') {
          fx.pulse('pillar', e.x, 0, e.radius * 0.25, col, 0.5);
          fx.burst({ x: e.x, y: 0.3, count: 50, jitter: 0.6, dir: Math.PI / 2, spread: 1.1, speed: [4, 11], life: [0.4, 1.0], color: met![0], color2: met![1], gravity: 10, drag: 1, kind: 'ember' });
          fx.burst({ x: e.x, y: 0.4, count: 12, jitter: 1, speed: [1, 3], life: [0.8, 1.4], color: 0x7a6a60, color2: 0x3a2a30, kind: 'smoke', size: 6, drag: 1.5 });
          this.play('explosion', this.pan(e.x));
          this.shake(0.9);
          this.flash(this.fighters[e.f]?.art.specialSkin?.glow ? mix(met![0], 0xffffff, 0.3) : 0xffc070, 1);
          this.arena?.cheer(0.8);
          this.punchIn(1, 0.5, e.x);
        } else if (e.style === 'nova') {
          fx.burst({ x: e.x, y: 1, count: 36, speed: [4, 9], life: [0.3, 0.6], color: 0xffffff, color2: col, drag: 3, kind: 'streak' });
          this.play('freeze', this.pan(e.x));
          this.shake(0.2);
        } else {
          fx.burst({ x: e.x, y: 0.3, count: 10, jitter: 0.8, speed: [1, 3], life: [0.6, 1.0], color: 0xa89080, color2: 0x5a4a50, kind: 'smoke', size: 4, drag: 1.5 });
          fx.burst({ x: e.x, y: 0.2, count: 22, jitter: 0.6, dir: Math.PI / 2, spread: 1, speed: [3, 7], life: [0.3, 0.6], color: col, color2: 0x6a5040, gravity: 14, size: 2 });
          this.play('hitHeavy', this.pan(e.x));
          this.shake(0.55);
        }
        break;
      }
      case 'projectileEnd': {
        const col = this.projGlow.get(e.id)?.[0] ?? STYLE_COLOR[e.style];
        this.projGlow.delete(e.id);
        if (e.style !== 'meteor') fx.burst({ x: e.x, y: e.y, count: e.hit ? 14 : 6, speed: [1, e.hit ? 5 : 3], life: [0.2, 0.45], color: col, color2: mix(col, 0x202030, 0.6), drag: 2, size: e.hit ? 2 : 1 });
        break;
      }
      case 'blink':
        for (const x of [e.from, e.to]) fx.burst({ x, y: 1, count: 22, jitter: 0.3, jitterY: 0.8, speed: [1, 4], life: [0.3, 0.6], color: 0xe0c8ff, color2: 0x8a4ae0, drag: 2 });
        fx.pulse('groundRing', e.to, 0, 1.2, 0xb07aff, 0.35);
        this.play('whoosh', this.pan(e.to));
        break;
      case 'familiar': {
        const f = b.fighters[e.f];
        const c = this.glow(f.id, 0xf0ffff, 0x3ac8e8);
        fx.burst({ x: f.x - f.facing * 0.5, y: f.y + 2.1, count: 6, speed: [1, 2], life: [0.2, 0.4], color: c[0], color2: c[1] });
        break;
      }
      case 'feint': {
        const f = b.fighters[e.f];
        fx.pop('FEINT', f.x, this.fighters[e.f].headY + 0.3, { color: '#e8e0ff' }, 0.8);
        break;
      }
      case 'ko': {
        const f = b.fighters[e.f];
        fx.pulse('groundRing', f.x, 0, 4, 0xffffff, 0.7);
        fx.pulse('star', f.x, 1.2, 1.2, 0xfff0c0, 0.3);
        fx.burst({ x: f.x, y: 1.2, count: 50, speed: [4, 11], life: [0.4, 0.9], color: 0xffffff, color2: 0xffd27a, gravity: 6, drag: 1, kind: 'streak' });
        this.play('ko', this.pan(f.x));
        this.shake(1.1);
        this.flash(0xffffff, 1.4);
        this.arena?.cheer(1);
        this.slowmo(0.25, 1.3);
        this.punchIn(2, 2.2, f.x);
        break;
      }
      case 'overtime': {
        // Night overtime: both fighters flare up, empowered until the end.
        for (const f of b.fighters) {
          if (!f.alive) continue;
          fx.pulse('groundRing', f.x, 0, 2.6, 0xa070ff, 0.6);
          fx.burst({ x: f.x, y: f.y + 1, jitter: 0.4, jitterY: 0.8, count: 24, dir: Math.PI / 2, spread: 0.9, speed: [2, 5], life: [0.4, 0.8], color: 0xe8d8ff, color2: 0x8050f0, drag: 2, kind: 'twinkle' });
        }
        this.play('roar');
        this.shake(0.6);
        this.flash(0x8060ff, 0.8);
        this.arena?.cheer(1);
        break;
      }
      case 'end':
        if (e.reason === 'time') this.play('ko');
        break;
      default:
        break;
    }
  }

  /** Legendary skins: hits with the weapon burst in its colours; a legendary shield flares when it blocks. */
  /** Particle colours for a fighter's special item: its skin's glow, or the stock pair. */
  private glow(id: FighterId, a: number, b: number): [number, number] {
    return this.fighters[id]?.art.specialSkin?.glow ?? [a, b];
  }

  private legendHit(attacker: FighterId, target: FighterId, ability: string, blocked: boolean, heavy: boolean, x: number, y: number): void {
    const b = this.battle!;
    const art = this.fighters[attacker]?.art;
    const from = b.fighters[attacker].abilities.find((a) => a.id === ability)?.from;
    const fx = from === 'main' ? art?.mainSkin?.fx : from === 'secondary' ? art?.secSkin?.fx : undefined;
    if (fx && !blocked) {
      this.fx.burst({ x, y, count: heavy ? 14 : 8, speed: [2, 6], life: [0.25, 0.5], color: fx.spark, color2: fx.spark2, drag: 2.5, kind: 'twinkle' });
      this.fx.pulse('ring', x, y, heavy ? 0.75 : 0.5, fx.spark2, 0.22);
      // Epic weapons hit harder to look at: a star flash and a spray of their own particles.
      if (fx.kind) {
        this.fx.pulse('star', x, y, heavy ? 0.9 : 0.6, fx.spark, 0.2);
        this.fx.burst({ x, y, count: heavy ? 10 : 6, dir: Math.PI / 2, spread: 1.2, speed: [1.5, 4], life: [0.3, 0.6], color: fx.spark, color2: fx.spark2, kind: fx.kind });
      }
    }
    const shield = this.fighters[target]?.art.secSkin?.fx;
    if (shield && blocked) {
      this.fx.burst({ x, y, count: 12, speed: [2, 5], life: [0.25, 0.5], color: shield.spark, color2: shield.spark2, drag: 2.5, kind: 'twinkle' });
      this.fx.pulse('ring', x, y, 0.6, shield.spark2, 0.25);
      if (shield.kind) this.fx.pulse('star', x, y, 0.8, shield.spark, 0.22);
    }
  }

  /** A jagged bolt from the sky (storm crown). */
  private lightning(x: number): void {
    const fx = this.fx;
    let px = x, py = 6;
    while (py > 0.2) {
      const nx = px + (Math.random() - 0.5) * 0.6, ny = py - 0.35;
      fx.burst({ x: nx, y: ny, count: 2, speed: [0, 0.3], life: [0.12, 0.2], color: 0xffffff, color2: 0x8ac8ff, size: 2 });
      px = nx; py = ny;
    }
    fx.burst({ x, y: 1.2, count: 16, speed: [3, 7], life: [0.15, 0.3], color: 0xffffff, color2: 0xaedcff, kind: 'streak' });
    fx.pulse('groundRing', x, 0, 1.4, 0xaedcff, 0.3);
    this.flash(0xc8e8ff, 0.6);
  }

  /** Head position in art px (for DOM bubbles). */
  headAt(id: FighterId): [number, number] {
    const f = this.battle!.fighters[id];
    return [this.sx(this.lx(f)), this.sy(this.ly(f) + 2.3)];
  }

  /** Draws a name tag over a fighter (pixel font), used before the fight starts. */
  tag(g: CanvasRenderingContext2D, id: FighterId, text: string, color: string): void {
    const [x, y] = this.headAt(id);
    drawText(g, text, x, y - 6, { color });
  }
}

const solid = new WeakMap<Sprite, Map<string, Sprite>>();
function solidCache(s: Sprite, color: string): Sprite {
  let m = solid.get(s);
  if (!m) { m = new Map(); solid.set(s, m); }
  let o = m.get(color);
  if (!o) {
    const c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    const g = c.getContext('2d')!;
    g.drawImage(s.img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, s.w, s.h);
    o = { ...s, img: c };
    m.set(color, o);
  }
  return o;
}

function blit(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, flip: boolean): void {
  if (!flip) { g.drawImage(s.img, x - s.ox, y - s.oy); return; }
  g.save();
  g.translate(x + 1, 0);
  g.scale(-1, 1);
  g.drawImage(s.img, -s.ox, y - s.oy);
  g.restore();
}

function fmt(n: number): string {
  return String(Math.max(1, Math.round(n)));
}
