import { sfx, type Sfx } from '../audio/sfx';
import { clamp } from '../core/math';
import type { Battle } from '../sim/battle';
import { ARENA_HALF_WIDTH, DT, ROUND_TIME } from '../sim/constants';
import { getStatus, type Fighter } from '../sim/fighter';
import { HAWK_DIVE, WHELP_BREATH } from '../sim/battle';
import type { ActionState, BattleEvent, FighterId, Projectile, ProjectileStyle, UsableId, Zone } from '../sim/types';
import { ArenaView } from './arena';
import { THEMES, type Theme } from './arenaArt';
import { drawText } from './font';
import { ellipseOutline, Fx, type View } from './fx';
import { css, mix } from './pixel/color';
import {
  boneRootSprite, caltropsPatch, charmSprite, clearPatches, hawkSprite, hourglassSprite, silenceSprite, skullSprite,
  TOTEM_TOP, totemSprite, wardSprite, whelpSprite, type HawkPose, type PatchLook,
} from './specialArt';
import { bottleSprite, isUsableShot, projFrames, projSprite, skinDraws } from './projArt';
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
  hook: 0xc8d0d8, bolas: 0xc89a5a, javelin: 0xd8c8a0, spark: 0x9fe0ff, soul: 0x9affc8, bonespike: 0xe8e0c8,
  frostflask: 0x9fe8ff, caltrops: 0x9aa0a8, hawk: 0xc8925a, breath: 0xff8a3a,
};

interface FighterView {
  art: CharacterArt;
  anim: Animator;
  bank: SpriteBank;
  out: AnimOut;
  flash: number;
  /**
   * Afterimages while hasted or dashing, and the one-off ones (a foresight
   * sidestep drifting off, a rewind trail): screen position, sprite, age,
   * plus an optional drift (px/s), colour, life and starting opacity.
   */
  ghosts: Ghost[];
  ghostT: number;
  emberT: number;
  /** Legendary skin sparkle timers, per place they shed from. */
  sparkT: { main: number; sec: number; head: number; body: number; feet: number; set: number; use: number };
  headY: number;
  /** Body landmarks in px above the feet: the shoulders and the top of the head; the shoulder spread. */
  shPx: number;
  topPx: number;
  spread: number;
  /** Last sprite drawn and where (chains start from the weapon hand, swaps and rewinds leave it behind). */
  lastS: Sprite | null;
  lastX: number;
  lastY: number;
  lastFlip: boolean;
  /** Hawk: where its dive ended and how long it had to fly home; a flap after landing. */
  hawkFrom: [number, number] | null;
  hawkAway: number;
  landT: number;
  /** Whelp: holds the open-jawed frame a moment after the breath. */
  breathT: number;
  /** Ward stone: lit for a moment after raising a shield. */
  wardT: number;
  /** Smoke puffs while hidden, sweat while afraid, motes while regenerating. */
  puffT: number;
  /** Who dragged this fighter with a chain (while pullT runs). */
  pulledBy: FighterId | -1;
}

interface Ghost {
  x: number; y: number; s: Sprite; flip: boolean; t: number;
  vx?: number; col?: string; life?: number; a?: number;
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
  private bottles: { id: UsableId; skin: string | null; x: number; y: number; vx: number; vy: number; t: number }[] = [];
  /** Usable item shots in flight (frost flasks), by projectile id: who threw them, so their burst takes the thrower's skin. */
  private useShots = new Map<number, FighterId>();
  /** Skinned caltrops patches: their colours, built once per skin. */
  private patchLooks = new Map<string, PatchLook | null>();
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
  /** Totems that just struck (zone id → seconds the crystal stays bright). */
  private zoneHot = new Map<number, number>();
  /** Whelp breaths already heard. */
  private heard = new Set<number>();
  /** Fighter sprites drawn this frame, for their night accents: feet position and facing. */
  private glowList: { s: Sprite; x: number; y: number; flip: boolean }[] = [];

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
        flash: 0, ghosts: [], ghostT: 0, emberT: 0, sparkT: { main: 0, sec: 0, head: 0, body: 0, feet: 0, set: 0, use: 0 }, headY: 2,
        ...bodyMarks(art), lastS: null, lastX: 0, lastY: 0, lastFlip: false,
        hawkFrom: null, hawkAway: 0, landT: 0, breathT: 0, wardT: 0, puffT: 0, pulledBy: -1,
      };
    });
    clearPatches();
    this.zoneHot.clear();
    this.heard.clear();
    this.fx.clear();
    this.cues.length = 0;
    this.bottles.length = 0;
    this.useShots.clear();
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
    this.glowList.length = 0;
    this.arena!.setDay(b.time / ROUND_TIME);
    this.arena!.draw(g, cam, this.time, this.shakeX, this.shakeY);
    this.fx.drawUnder(g, this);
    for (const z of b.zones) this.drawZoneGround(g, z);
    // Shadows.
    for (const f of b.fighters) {
      const x = Math.round(this.sx(this.lx(f))), y = Math.round(this.sy(0));
      const lift = clamp(this.ly(f) / 2.5, 0, 0.7);
      this.arena!.shadow(g, x, y, 11 + (f.form === 'titan' ? 4 : f.form === 'robust' || f.form === 'mighty' || f.form === 'stout' ? 2 : 0), 1, lift);
    }
    for (const z of b.zones) if (z.kind === 'totem') this.drawTotem(g, z, dt);
    // The fighter mid-attack draws in front.
    const order: FighterId[] = b.fighters[0].action && !b.fighters[1].action ? [1, 0] : [0, 1];
    const secOut = (id: FighterId) => b.projectiles.some((p) => p.alive && p.owner === id && p.style === 'chakram');
    for (const id of order) this.drawFighter(g, b.fighters[id], this.fighters[id], dt, secOut(id));
    for (const f of b.fighters) this.drawItem(g, f);
    this.drawChains(g);
    for (const p of b.projectiles) if (p.alive) this.drawProjectile(g, p);
    this.runCues();
    this.drawBottles(g, dt);
    this.arena!.light(g, cam, this.time);
    for (const z of b.zones) if (z.kind === 'caltrops') this.caltropGlints(g, z);
    const night = this.arena!.night();
    if (night > 0.01) this.nightGlow(g, night);
    this.fx.draw(g, this);
    if (this.flashT > 0) {
      g.globalAlpha = Math.min(0.5, this.flashT * 4);
      g.fillStyle = css(this.flashCol);
      g.fillRect(0, 0, this.screen.w, this.screen.h);
      g.globalAlpha = 1;
      this.flashT -= dt;
    }
  }

  /**
   * Night accents, once the live sky has turned dark: only the parts of the
   * gear meant to catch the light shine (gems, runes, embers, hot veins, the
   * glints on polished metal), by the item's tier, with a faint bloom around
   * them. Legendary and epic pieces also twinkle now and then. All of it
   * scales with how far night has fallen (`n`).
   */
  private nightGlow(g: CanvasRenderingContext2D, n: number): void {
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < this.glowList.length; k++) {
      const { s, x, y, flip } = this.glowList[k];
      if (!s.glow) continue;
      g.globalAlpha = 0.14 * n;
      for (const [dx, dy] of RING1) blitImg(g, s, s.glow, x + dx, y + dy, flip);
      g.globalAlpha = 0.8 * n;
      blitImg(g, s, s.glow, x, y, flip);
      const sp = s.sparks;
      if (!sp?.length || n < 0.3) continue;
      // One twinkle at a time, hopping between the brightest accents.
      const beat = this.time * 1.3 + k * 0.43;
      const ph = beat % 1;
      if (ph > 0.5) continue;
      const j = (Math.floor(beat) * 7 + k * 3) % (sp.length / 2);
      const c = sp[j * 2], r = sp[j * 2 + 1];
      const px = flip ? x + s.ox - c : x - s.ox + c, py = y - s.oy + r;
      const a = Math.sin((ph / 0.5) * Math.PI) * n;
      g.fillStyle = '#fffbe8';
      g.globalAlpha = a;
      g.fillRect(px, py, 1, 1);
      g.globalAlpha = a * 0.55;
      g.fillRect(px - 1, py, 1, 1); g.fillRect(px + 1, py, 1, 1);
      g.fillRect(px, py - 1, 1, 1); g.fillRect(px, py + 1, 1, 1);
      if (a > 0.6) {
        g.globalAlpha = a * 0.25;
        g.fillRect(px - 2, py, 1, 1); g.fillRect(px + 2, py, 1, 1);
        g.fillRect(px, py - 2, 1, 1); g.fillRect(px, py + 2, 1, 1);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
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
    const alive = f.alive;
    const hidden = alive && !!getStatus(f, 'hidden');
    const fear = alive ? getStatus(f, 'fear') : undefined;
    // Afraid: the whole body trembles.
    const shiver = fear && dt > 0 ? (Math.floor(this.time * 26) & 1 ? 1 : -1) : 0;
    const px = Math.round(this.sx(x)) + o.jitter + shiver, py = Math.round(this.sy(y)) - o.hop;
    v.headY = y + 2.0;
    v.lastS = s; v.lastX = px; v.lastY = py; v.lastFlip = flip;

    // Afterimages: haste, dashes and rolls, and the one-off ones.
    const ab = f.action ? f.abilities[f.action.ability] : null;
    const dashing = !!ab && (ab.kind === 'dash' || ab.slot === 'evade') && f.action!.phase === 'active';
    v.ghostT -= dt;
    if ((dashing || getStatus(f, 'haste')) && v.ghostT <= 0 && dt > 0 && !hidden) {
      v.ghosts.push({ x: px, y: py, s, flip, t: 0 });
      v.ghostT = dashing ? 0.03 : 0.09;
    }
    const trail = getStatus(f, 'rage') ? '#ff6040' : '#9ad8ff';
    for (let i = v.ghosts.length - 1; i >= 0; i--) {
      const gh = v.ghosts[i];
      gh.t += dt;
      const life = gh.life ?? 0.22;
      if (gh.t > life) { v.ghosts.splice(i, 1); continue; }
      if (gh.t < 0) continue;
      g.globalAlpha = (gh.a ?? 0.45) * (1 - gh.t / life);
      blit(g, solidCache(gh.s, gh.col ?? trail), Math.round(gh.x + (gh.vx ?? 0) * gh.t), gh.y, gh.flip);
    }
    g.globalAlpha = 1;

    // Behind the body: the far half of the ward stone's orbit, bone claws closing at the back.
    const root = alive ? getStatus(f, 'root') : undefined;
    const bones = !!root && !b.fighters[root.source].has.has('bolas');
    if (alive && f.has.has('ward_stone')) this.drawWard(g, f, v, px, py, true);
    if (bones) blit(g, boneRootSprite(false), px, py + 1, flip);

    // Invulnerability frames blink; in smoke the body is only a faint shape.
    const set = alive && !hidden ? v.art.set : null;
    if (set) drawSetAura(g, set, px, py + o.hop, this.time, 'back');
    if (hidden) g.globalAlpha = 0.38 + 0.06 * Math.sin(this.time * 7);
    else if (f.invuln > 0 && alive && Math.floor(this.time * 30) % 2 === 0) g.globalAlpha = 0.55;
    blit(g, s, px, py, flip);
    if (hidden) {
      // A grey wash over what shows, so the shape reads as seen through smoke.
      g.globalAlpha = 0.16;
      blit(g, v.bank.flash(o, '#c8c8d4'), px, py, flip);
    }
    g.globalAlpha = 1;
    if (!hidden) this.glowList.push({ s, x: px, y: py, flip });
    if (set) drawSetAura(g, set, px, py + o.hop, this.time, 'front');

    if (dt > 0 && alive && !hidden) this.legendSparks(f, v, s, x, y, flip);

    // Tints and overlays.
    const tint = (color: string, a: number) => {
      g.globalAlpha = a * (hidden ? 0.4 : 1);
      blit(g, v.bank.flash(o, color), px, py, flip);
      g.globalAlpha = 1;
    };
    if (v.flash > 0) { tint('#ffffff', Math.min(1, v.flash * 12)); v.flash -= dt; }
    if (getStatus(f, 'frozen')) tint('#bff0ff', 0.6);
    else if (getStatus(f, 'chill')) tint('#8ad8ff', 0.22);
    if (getStatus(f, 'ironskin')) tint('#e8eef8', 0.25 + 0.15 * Math.sin(this.time * 10));
    if (getStatus(f, 'rage')) tint('#ff3020', 0.14 + 0.08 * Math.sin(this.time * 14));
    if (getStatus(f, 'vulnerable')) tint('#ff80a0', 0.12);
    if (fear) tint('#9a50e0', 0.2 + 0.08 * Math.sin(this.time * 20));
    if (f.empowered && alive) tint('#a878ff', 0.12 + 0.07 * Math.sin(this.time * 6));

    // Status particles.
    v.emberT -= dt;
    if (v.emberT <= 0 && dt > 0 && alive) {
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
    if (dt > 0 && alive) this.statusPuffs(f, v, x, y, dt, hidden, !!fear);
    const hx = px, hy = Math.round(this.sy(y + 2.05)) - o.hop;
    if (getStatus(f, 'stun') && alive) {
      // Stars circling over the head.
      for (let i = 0; i < 3; i++) {
        const a = this.time * 6 + (i * Math.PI * 2) / 3;
        const sx = Math.round(hx + Math.cos(a) * 7), sy = Math.round(hy - 3 + Math.sin(a) * 2);
        g.fillStyle = Math.sin(a) > 0 ? '#ffe070' : '#c89a30';
        g.fillRect(sx, sy - 1, 1, 3); g.fillRect(sx - 1, sy, 3, 1);
      }
    }
    const mark = getStatus(f, 'mark');
    if (mark && alive) {
      // Hex mark: a small rune over the head, pips per stack.
      const ry = hy - 9 + Math.round(Math.sin(this.time * 4));
      g.fillStyle = '#c070ff';
      g.fillRect(hx - 2, ry, 5, 1); g.fillRect(hx, ry - 2, 1, 5); g.fillRect(hx - 1, ry - 1, 3, 3);
      g.fillStyle = '#f0d8ff'; g.fillRect(hx, ry, 1, 1);
    }
    if (alive) this.headMarks(g, f, hx, py - v.topPx - (mark ? 15 : 7), !!fear);
    if (root) {
      // Rooted: bone claws locked round the ankles, or the bolas cords wound round the shins.
      if (bones) blit(g, boneRootSprite(true), px, py + 1, flip);
      else this.drawCords(g, px, py, f.facing);
    }
    const mom = alive ? getStatus(f, 'momentum') : undefined;
    if (mom) this.drawMomentum(g, px, py, f.facing, mom.stacks);
    if (f.shield > 0 && alive) {
      const r = 15, cx = px - (flip ? -1 : 1), cy = py - 30;
      g.fillStyle = 'rgba(255,215,107,0.9)';
      const n = 40;
      for (let i = 0; i < n; i++) {
        if ((i + Math.floor(this.time * 12)) % 5 === 0) continue;
        const a = (i / n) * Math.PI * 2;
        g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 1.9), 1, 1);
      }
    }
    if (!alive) return;
    if (f.has.has('ward_stone')) this.drawWard(g, f, v, px, py, false);
    // An epic core floats at the far shoulder, bobbing.
    if (skinDraws('core', v.art.specialSkinId)) {
      const s = projSprite('core', Math.floor(this.time * 6), 0, v.art.specialSkinId);
      const cx = Math.round(this.sx(x - f.facing * 0.42)), cy = Math.round(this.sy(y + 1.75) + Math.sin(this.time * 2.4) * 1.5);
      g.drawImage(s.img, cx - s.ox, cy - s.oy);
    }
    if (f.has.has('hourglass')) this.drawHourglass(g, f, v, px, py);
    if (f.has.has('thunder_totem')) this.drawCharm(g, f, v, px, py, dt);
    const fam = f.familiar;
    if (!fam) return;
    if (fam.kind === 'hawk') { this.drawHawk(g, f, v, px, py, dt); return; }
    if (fam.kind === 'whelp') { this.drawWhelp(g, f, v, px, py, dt); return; }
    // Familiar: the wisp lantern floats behind the shoulder.
    const fx = Math.round(this.sx(x - f.facing * 0.5)), fy = Math.round(this.sy(y + 2.1) + Math.sin(this.time * 3) * 2);
    const charging = fam.charge > 0;
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

  // --- Gear that rides along -------------------------------------------------------------

  /** Places a small sprite (anchor at px, py), facing like the fighter, with its night accents. */
  private put(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, flip: boolean): void {
    blit(g, s, x, y, flip);
    if (s.glow) this.glowList.push({ s, x, y, flip });
  }

  /**
   * The hunting hawk: perched on the near shoulder, now and then looking
   * round or rousing its wings. Charging a dive it flaps up off the
   * shoulder to where the dive starts; while it is out (the `hawk` shot) the
   * perch is empty, then it glides home and lands with a flap.
   */
  private drawHawk(g: CanvasRenderingContext2D, f: Fighter, v: FighterView, px: number, py: number, dt: number): void {
    const fam = f.familiar!;
    const flip = f.facing < 0;
    const perchX = px - f.facing * (v.spread + 7), perchY = py - v.shPx + 2;
    const flap: HawkPose = Math.floor(this.time * 16) & 1 ? 'up' : 'down';
    if (fam.away > 0) {
      for (const p of this.battle!.projectiles) if (p.alive && p.owner === f.id && p.style === 'hawk') return;
      if (!v.hawkFrom) return;
      // Flying home along a shallow arc.
      const k = clamp(1 - fam.away / Math.max(0.05, v.hawkAway), 0, 1);
      const sx = Math.round(this.sx(v.hawkFrom[0])), sy = Math.round(this.sy(v.hawkFrom[1]));
      const hx = Math.round(sx + (perchX - sx) * k), hy = Math.round(sy + (perchY - sy) * k - Math.sin(k * Math.PI) * 14);
      const pose: HawkPose = k > 0.8 ? flap : Math.floor(this.time * 8) % 3 === 0 ? 'up' : 'glide';
      this.put(g, hawkSprite(pose), hx, hy, perchX < sx);
      v.landT = 0.3;
      return;
    }
    v.hawkFrom = null;
    if (fam.charge > 0) {
      // Rousing, then lifting off toward the start of the dive (2.9 m up).
      const k = clamp(1 - fam.charge / HAWK_DIVE.windup, 0, 1);
      const top = Math.round(this.sy(f.y + 2.9));
      const lift = k < 0.35 ? 0 : ((k - 0.35) / 0.65) ** 2;
      this.put(g, hawkSprite(flap), perchX, Math.round(perchY + (top - perchY) * lift), flip);
      return;
    }
    if (v.landT > 0) { v.landT -= dt; this.put(g, hawkSprite(flap), perchX, perchY - (v.landT > 0.15 ? 1 : 0), flip); return; }
    // Idle on the perch: looks about every few seconds, rouses its wings now and then.
    const t = (this.time + f.id * 1.7) % 6;
    const pose: HawkPose = t > 5.5 ? (t > 5.75 ? 'down' : 'up') : t > 2.4 && t < 3.3 ? 'perch1' : 'perch0';
    this.put(g, hawkSprite(pose), perchX, perchY, flip);
  }

  /**
   * The dragon whelp hovers just above and behind its owner's head, wings
   * beating. Charging, it rears back with its wings flared, then thrusts its
   * head forward with its jaws open as the breath comes out.
   */
  private drawWhelp(g: CanvasRenderingContext2D, f: Fighter, v: FighterView, px: number, py: number, dt: number): void {
    const fam = f.familiar!;
    const flip = f.facing < 0;
    const bob = Math.round(Math.sin(this.time * 4 + f.id) * 1.5);
    let wx = px - f.facing * 4, wy = py - v.topPx - 5 + bob;
    let pose: 'hover0' | 'hover1' | 'rear' | 'breath' = Math.floor(this.time * 7 + f.id) & 1 ? 'hover1' : 'hover0';
    if (fam.charge > 0) {
      const k = 1 - fam.charge / WHELP_BREATH.windup;
      if (k < 0.65) { pose = 'rear'; wx -= f.facing; wy -= 1; }
      else { pose = 'breath'; wx += f.facing * 2; }
      v.breathT = 0.22;
    } else if (v.breathT > 0) {
      v.breathT -= dt;
      pose = 'breath';
      wx += f.facing * 2;
    }
    this.put(g, whelpSprite(pose), wx, wy, flip);
  }

  /** The thunder totem's charm, floating at the back shoulder until it is planted. */
  private drawCharm(g: CanvasRenderingContext2D, f: Fighter, v: FighterView, px: number, py: number, dt: number): void {
    for (const z of this.battle!.zones) if (z.owner === f.id && z.kind === 'totem') return;
    const it = f.item && f.abilities[f.item.ability].kind === 'totem' ? f.item : null;
    if (it && it.phase !== 'windup') return;
    // Rising and shaking as it charges to be planted.
    const charge = it ? clamp(it.t / f.abilities[it.ability].windup, 0, 1) : 0;
    const cx = px - f.facing * 12 + (charge > 0.5 ? (Math.floor(this.time * 30) & 1) : 0);
    const cy = Math.round(py - v.shPx - 6 + Math.sin(this.time * 2.6 + f.id) * 1.5 - charge * 8);
    this.put(g, charmSprite(), cx, cy, f.facing < 0);
    if (it && dt > 0 && Math.random() < 0.5) {
      this.fx.burst({ x: this.wx(cx), y: this.wy(cy - 3), count: 1, jitter: 0.08, speed: [0.5, 1.5], life: [0.1, 0.25], color: 0xf0ffff, color2: 0x4ac0ff, kind: 'streak' });
    }
  }

  /** Sands of Time: a small hourglass at the back shoulder, sand trickling (spent once it has turned). */
  private drawHourglass(g: CanvasRenderingContext2D, f: Fighter, v: FighterView, px: number, py: number): void {
    const used = f.rewindUsed;
    const cx = px - f.facing * 12, cy = Math.round(py - v.shPx - 4 + Math.sin(this.time * 2.2 + f.id) * 1.5);
    if (used) g.globalAlpha = 0.6;
    this.put(g, hourglassSprite(used ? 0 : Math.floor(this.time * 5)), cx, cy, false);
    g.globalAlpha = 1;
  }

  /** The ward stone circles the chest; `back` draws it only on the far half of its orbit. */
  private drawWard(g: CanvasRenderingContext2D, f: Fighter, v: FighterView, px: number, py: number, back: boolean): void {
    const a = this.time * 2.2 + f.id * 2;
    if ((Math.sin(a) < 0) !== back) return;
    const lit = v.wardT > this.time;
    const x = Math.round(px + Math.cos(a) * 13), y = Math.round(py - v.shPx * 0.72 + Math.sin(a) * 3 + Math.sin(this.time * 3) );
    if (back) g.globalAlpha = 0.85;
    this.put(g, wardSprite(lit || (f.shield > 0 && Math.floor(this.time * 3) % 4 === 0)), x, y, false);
    g.globalAlpha = 1;
  }

  /** Marks over the head: silenced (a struck-out seal), afraid (a small skull), side by side. */
  private headMarks(g: CanvasRenderingContext2D, f: Fighter, hx: number, hy: number, fear: boolean): void {
    const sil = !!getStatus(f, 'silence');
    if (!sil && !fear) return;
    const both = sil && fear;
    const bob = Math.round(Math.sin(this.time * 4));
    if (sil) blit(g, silenceSprite(), hx - (both ? 5 : 0), hy + bob, false);
    if (fear) blit(g, skullSprite(), hx + (both ? 5 : 0) + (Math.floor(this.time * 20) & 1), hy - 1 + bob, false);
  }

  /** Bolas cords wound round both shins, the weights hanging off them. */
  private drawCords(g: CanvasRenderingContext2D, px: number, py: number, facing: number): void {
    const x0 = px - 7 + facing, w = 14;
    // Two twisted cords, each a light strand over a dark one, slanting as they wrap.
    for (const [dy, ph] of [[-4, 0], [-8, 2]] as const) {
      for (let i = 0; i < w; i++) {
        const y = py + dy + (i < w / 2 ? 0 : -1);
        g.fillStyle = '#3a2414';
        g.fillRect(x0 + i, y + 1, 1, 1);
        g.fillStyle = (i + ph) % 3 === 0 ? '#8a5a2a' : (i + ph) % 3 === 1 ? '#d8a868' : '#f0d498';
        g.fillRect(x0 + i, y, 1, 1);
      }
    }
    // The two weights, swinging a little.
    const sw = Math.round(Math.sin(this.time * 5));
    for (const side of [-1, 1]) {
      const bx = px + side * 8 + (side > 0 ? sw : -sw), by = py - 3;
      g.fillStyle = '#c89a5a';
      g.fillRect(px + side * 6, by - 4, 1, 3);
      g.fillStyle = '#3a2a24';
      g.fillRect(bx - 1, by - 1, 3, 3);
      g.fillStyle = '#7a6a5a';
      g.fillRect(bx - 1, by - 1, 2, 2);
      g.fillStyle = '#b0a090';
      g.fillRect(bx - 1, by - 1, 1, 1);
    }
  }

  /** Momentum: a row of small orange chevrons at the feet, one per stack, a shimmer running forward. */
  private drawMomentum(g: CanvasRenderingContext2D, px: number, py: number, facing: number, stacks: number): void {
    const n = Math.min(5, stacks);
    const run = (this.time * 6) % (n + 3);
    for (let i = 0; i < n; i++) {
      const x = px + facing * (5 + i * 3), y = py - 2;
      g.fillStyle = Math.abs(run - i) < 1 ? '#fff0b0' : i < n - 1 ? '#ff9a2a' : '#ffc050';
      g.fillRect(x, y - 1, 1, 1);
      g.fillRect(x + facing, y, 1, 1);
      g.fillRect(x, y + 1, 1, 1);
    }
  }

  /** Smoke drifting round a hidden fighter, sweat off a frightened one, motes rising while regenerating. */
  private statusPuffs(f: Fighter, v: FighterView, x: number, y: number, dt: number, hidden: boolean, fear: boolean): void {
    v.puffT -= dt;
    if (v.puffT > 0) return;
    v.puffT = 0.09;
    const fx = this.fx;
    // Hiding in a skinned smoke bomb's cloud, or regenerating from a skinned tonic: the item's colours.
    const use = v.art.useSkinId ? v.art.use : null;
    if (hidden) {
      const c = use?.glow;
      const light = Math.random() < 0.5;
      fx.burst({ x, y: y + 0.4 + Math.random() * 1.4, count: 1, jitter: 0.45, dir: Math.PI / 2, spread: 1.2, speed: [0.15, 0.5], life: [0.7, 1.2], color: c ? mix(c[0], c[1], light ? 0.3 : 0.55) : light ? 0xb8b8c4 : 0x8a8a98, color2: c ? mix(c[1], 0x202028, 0.3) : 0x5a5a68, kind: 'smoke', size: 3 + Math.floor(Math.random() * 3), drag: 1 });
      const ufx = use ? v.art.useSkin?.fx : undefined;
      if (ufx && Math.random() < 0.3) fx.burst({ x, y: y + 1.6 + Math.random() * 0.6, count: 1, jitter: 0.6, dir: -Math.PI / 2, spread: 0.5, speed: [0.3, 0.6], life: [0.9, 1.4], color: ufx.spark, color2: ufx.spark2, kind: ufx.kind ?? 'twinkle' });
    }
    if (fear && Math.random() < 0.35) {
      fx.burst({ x: x + f.facing * 0.12, y: y + 2.0, count: 1, jitter: 0.12, dir: Math.PI / 2 - f.facing * 0.8, spread: 0.4, speed: [1, 2], life: [0.4, 0.6], color: 0xd8f0ff, color2: 0x6ab0e8, gravity: 9, kind: 'drop' });
    }
    if (getStatus(f, 'regen')) {
      const c = use && v.art.useId === 'troll_tonic' ? use.glow : null;
      fx.burst({ x, y: y + 0.2 + Math.random() * 1.4, count: 1, jitter: 0.42, dir: Math.PI / 2, spread: 0.15, speed: [0.6, 1.1], life: [0.6, 1.0], color: c ? mix(c[0], 0xffffff, 0.35) : 0xd0ffb0, color2: c ? c[1] : 0x3ab85a, kind: 'plus' });
      if (Math.random() < 0.5) fx.burst({ x, y: y + 0.1, count: 1, jitter: 0.35, dir: Math.PI / 2, spread: 0.1, speed: [0.8, 1.4], life: [0.5, 0.8], color: c ? c[0] : 0x9aff7a, color2: c ? c[1] : 0x2a8a4a });
    }
  }

  // --- Zones -----------------------------------------------------------------------------

  /** World position of an art-px point (for particles spawned at a sprite). */
  private wx(px: number): number { return this.camX + (px - this.screen.w / 2 - this.shakeX) / PPM; }
  private wy(py: number): number { return (this.gy + this.shakeY - py) / PPM; }

  /** How solid a zone is: it fades in, and flickers away over its last second. */
  private zoneAlpha(z: Zone): number {
    const age = z.span - z.life;
    if (z.life < 1) return z.life * (Math.floor(this.time * 20) & 1 && z.life < 0.5 ? 0.4 : 1);
    return Math.min(1, age * 6);
  }

  /** On the ground: the caltrops patch, the totem's circle. */
  private drawZoneGround(g: CanvasRenderingContext2D, z: Zone): void {
    const cx = Math.round(this.sx(z.x)), cy = Math.round(this.sy(0));
    const a = this.zoneAlpha(z);
    if (z.kind === 'caltrops') {
      const p = caltropsPatch(z.id, Math.round(z.radius * PPM), this.patchLook(z.owner));
      g.globalAlpha = a;
      g.drawImage(p.sprite.img, cx - p.sprite.ox, cy - p.sprite.oy);
      g.globalAlpha = 1;
      return;
    }
    // Totem: a faint dashed circle with sparks crawling round it.
    const rx = z.radius * PPM, ry = Math.min(rx * 0.22, 8);
    const hot = this.zoneHot.get(z.id) ?? 0;
    g.globalAlpha = a * (0.5 + (hot > 0 ? 0.4 : 0));
    ellipseOutline(g, cx, cy + 1, rx, ry, '#7ad8ff', 1);
    g.globalAlpha = a * 0.3;
    ellipseOutline(g, cx, cy + 1, rx - 3, ry - 1, '#d8f8ff', 0.5);
    g.globalAlpha = a;
    for (let i = 0; i < 3; i++) {
      const t = this.time * 1.4 + (i * Math.PI * 2) / 3;
      const sx = Math.round(cx + Math.cos(t) * rx), sy = Math.round(cy + 1 + Math.sin(t) * ry);
      g.fillStyle = '#f0ffff';
      g.fillRect(sx, sy, 1, 1);
      g.fillStyle = '#7ad8ff';
      g.fillRect(sx - Math.sign(Math.sin(t)), sy, 1, 1);
    }
    g.globalAlpha = 1;
  }

  /** A planted thunder totem: drops in, crackles, flares when it strikes, fades at the end. */
  private drawTotem(g: CanvasRenderingContext2D, z: Zone, dt: number): void {
    const age = z.span - z.life;
    const drop = age < 0.14 ? Math.round((1 - age / 0.14) ** 2 * 70) : 0;
    const cx = Math.round(this.sx(z.x)), cy = Math.round(this.sy(0));
    const hot = (this.zoneHot.get(z.id) ?? 0) - dt;
    if (hot > 0) this.zoneHot.set(z.id, hot); else this.zoneHot.delete(z.id);
    this.arena!.shadow(g, cx, cy, 6, 0.8);
    const a = this.zoneAlpha(z);
    if (a <= 0) return;
    const s = totemSprite(hot > 0 || (Math.floor(this.time * 7) % 9 === 0));
    g.globalAlpha = Math.min(1, a + 0.2);
    blit(g, s, cx, cy - drop, false);
    if (a > 0.5) this.glowList.push({ s, x: cx, y: cy - drop, flip: false });
    g.globalAlpha = 1;
    if (dt <= 0 || drop) return;
    // Crackling: sparks off the crystal, and now and then a little arc to the ground.
    const top = (TOTEM_TOP - 2) / PPM;
    if (Math.random() < dt * 9 * a) this.fx.burst({ x: z.x, y: top, count: 1, jitter: 0.12, speed: [0.6, 1.8], life: [0.12, 0.3], color: 0xf0ffff, color2: 0x4ab8ff, kind: Math.random() < 0.5 ? 'twinkle' : 'streak' });
    if (Math.random() < dt * 1.2 * a) this.fx.bolt(z.x, top, z.x + (Math.random() - 0.5) * 1.2, top + 0.3 + Math.random() * 0.4, 0x4ab8ff, 0.09, 0xd8f8ff);
  }

  /** A caltrops patch in the thrower's usable item skin (null: the stock iron spikes). */
  private patchLook(id: FighterId): PatchLook | null {
    const art = this.fighters[id]?.art;
    const skin = art?.useSkinId, use = art?.use;
    if (!skin || !use?.patch) return null;
    let look = this.patchLooks.get(skin);
    if (look === undefined) {
      const colors: Record<string, number> = {};
      for (const [ch, [mat, tone]] of Object.entries(use.patch.key)) colors[ch] = use.mats[mat].ramp[tone];
      look = { id: skin, shapes: use.patch.shapes, colors };
      this.patchLooks.set(skin, look);
    }
    return look;
  }

  /** Spike tips glinting on a caltrops patch (drawn after the light, so they still catch it at night). */
  private caltropGlints(g: CanvasRenderingContext2D, z: Zone): void {
    const p = caltropsPatch(z.id, Math.round(z.radius * PPM), this.patchLook(z.owner));
    const n = p.tips.length / 2;
    if (!n) return;
    const cx = Math.round(this.sx(z.x)), cy = Math.round(this.sy(0));
    const a = this.zoneAlpha(z);
    const night = this.arena!.night();
    // Two glints at a time, hopping between tips.
    for (let k = 0; k < 2; k++) {
      const beat = this.time * 2.2 + k * 0.5;
      const ph = beat % 1;
      if (ph > 0.6) continue;
      const j = (Math.floor(beat) * 7 + k * 5 + z.id) % n;
      const x = cx + p.tips[j * 2], y = cy + p.tips[j * 2 + 1];
      const b = Math.sin((ph / 0.6) * Math.PI) * a * (0.55 + night * 0.45);
      g.fillStyle = '#ffffff';
      g.globalAlpha = b;
      g.fillRect(x, y, 1, 1);
      g.globalAlpha = b * 0.45;
      g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1);
    }
    g.globalAlpha = 1;
  }

  // --- Chains --------------------------------------------------------------------------------

  /** Where a fighter's weapon hand is on screen (the weapon tip of its last sprite, or a guess). */
  private handAt(id: FighterId): [number, number] {
    const v = this.fighters[id], f = this.battle!.fighters[id];
    const tip = v.lastS?.tip;
    if (tip) {
      // The hand sits partway between the shoulder and the weapon tip.
      const sx = v.lastX - f.facing * v.spread, sy = v.lastY - v.shPx;
      const tx = v.lastX + (v.lastFlip ? -tip[0] : tip[0]), ty = v.lastY + tip[1];
      return [Math.round(sx + (tx - sx) * 0.45), Math.round(sy + (ty - sy) * 0.45)];
    }
    return [Math.round(this.sx(this.lx(f))) + f.facing * 9, Math.round(this.sy(this.ly(f) + 1.15))];
  }

  /** The chain sickle's chain: out to the hook in flight, then taut on whoever it is dragging. */
  private drawChains(g: CanvasRenderingContext2D): void {
    const b = this.battle!;
    for (const p of b.projectiles) {
      if (!p.alive || p.style !== 'hook') continue;
      const [hx, hy] = this.handAt(p.owner);
      const x = p.px + (p.x - p.px) * this.alpha, y = p.py + (p.y - p.py) * this.alpha;
      drawChain(g, hx, hy, Math.round(this.sx(x)), Math.round(this.sy(y)), 4);
    }
    for (const f of b.fighters) {
      const v = this.fighters[f.id];
      const by = v.pulledBy;
      if (f.pullT <= 0 || by === -1) { if (f.pullT <= 0) v.pulledBy = -1; continue; }
      const [hx, hy] = this.handAt(by);
      drawChain(g, hx, hy, Math.round(this.sx(this.lx(f))), Math.round(this.sy(this.ly(f) + 1.1)), 0);
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
    // A legendary usable on the belt: now and then a petal or a snowflake drifts off it.
    const use = art.useSkin?.fx;
    if (use && tick('use', f.action ? 0.25 : 0.6) && !f.uses.some((u, i) => u === 0 && f.abilities[i].from === 'usable')) {
      const drift = use.kind === 'petal' || use.kind === 'flake';
      this.fx.burst({
        x: x + f.facing * 0.14, y: y + 0.85, jitter: 0.1, count: 1, dir: drift ? -Math.PI / 2 : Math.PI / 2, spread: 0.6,
        speed: drift ? [0.2, 0.5] : [0.1, 0.4], life: [0.6, 1.0], color: use.spark, color2: use.spark2, kind: use.kind ?? 'twinkle',
      });
    }
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
      const s = bottleSprite(o.id, Math.floor(o.t * 22) * Math.sign(o.vx || 1), o.skin);
      g.drawImage(s.img, Math.round(this.sx(o.x)) - s.ox, Math.round(this.sy(o.y)) - s.oy);
    }
  }

  private drawProjectile(g: CanvasRenderingContext2D, p: Projectile): void {
    const x = p.px + (p.x - p.px) * this.alpha, y = p.py + (p.y - p.py) * this.alpha;
    if (p.style === 'breath' && !this.heard.has(p.id)) {
      // The whelp's breath: a fiery whoosh as it leaves the jaws.
      this.heard.add(p.id);
      this.play('firebomb', this.pan(x), 0.3);
    }
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
    // Usable items (bombs, caltrops) fly in their skin.
    const uskin = p.def.from === 'usable' && isUsableShot(style, thrower?.useSkinId) ? thrower!.useSkinId : null;
    if (p.def.from === 'usable') this.useShots.set(p.id, p.owner);
    const look = skin ?? uskin ?? (skinDraws(style, wskin) ? wskin : null);
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
    // Trails, in the colours of the item skin that reshaped the shot.
    const wfx = look && look === wskin ? legend : undefined;
    if (skin) this.projGlow.set(p.id, this.glow(p.owner, STYLE_COLOR[style], 0));
    else if (wfx) this.projGlow.set(p.id, [wfx.spark, wfx.spark2]);
    else if (uskin) this.projGlow.set(p.id, thrower!.useSkin?.trail ?? thrower!.use!.glow);
    // A legendary usable leaves its own sparkles (petals, snow) behind it.
    const ufx = uskin ? thrower!.useSkin?.fx : undefined;
    if (ufx && Math.random() < 0.5) this.fx.burst({ x, y, jitter: 0.08, count: 1, dir: -Math.PI / 2, spread: 0.6, speed: [0.2, 0.6], life: [0.4, 0.8], color: ufx.spark, color2: ufx.spark2, kind: ufx.kind ?? 'twinkle' });
    if (Math.random() < (style === 'meteor' ? 1 : 0.5)) {
      const col = skin ? this.glow(p.owner, STYLE_COLOR[style], 0)[0] : wfx ? wfx.spark : uskin ? this.projGlow.get(p.id)![0] : STYLE_COLOR[style];
      const back = Math.atan2(-p.vy, -p.vx);
      if (style === 'meteor') {
        const c = this.glow(p.owner, 0xffd060, 0x8a2a1a);
        this.fx.burst({ x, y, count: 2, dir: back, spread: 0.4, speed: [1, 3], life: [0.3, 0.6], color: c[0], color2: mix(c[1], 0x200a08, 0.4), kind: 'ember', jitter: 0.2 });
      }
      else if (style === 'flamewave' || style === 'groundwave') this.fx.burst({ x, y: 0.1, count: 1, dir: Math.PI / 2, spread: 0.6, speed: [0.5, 1.5], life: [0.3, 0.5], color: col, color2: wfx ? wfx.spark2 : 0x5a4a50, kind: style === 'flamewave' ? wfx?.kind ?? 'ember' : 'smoke', size: 3 });
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
          this.bottles.push({ id: art.useId, skin: art.useSkinId, x: f.x - f.facing * 0.1, y: 1.9, vx: -f.facing * (2.4 + Math.random()), vy: 4.5 + Math.random(), t: 0 });
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
    // A legendary potion skin adds its own sparkles.
    const k = this.fighters[id]?.art.useSkin?.fx;
    if (k) fx.burst({ x: f.x, y: 1.2, count: 14, jitter: 0.4, jitterY: 0.5, speed: [1, 2.5], life: [0.6, 1.1], color: k.spark, color2: k.spark2, drag: 2, kind: k.kind ?? 'twinkle' });
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
        if (ab.slot === 'evade' && ab.kind === 'aoe') {
          // Quake stomp: the knee comes up, dust trickles off the boot.
          fx.burst({ x: f.x + f.facing * 0.2, y: 0.4, count: 3, jitter: 0.1, dir: -Math.PI / 2, spread: 0.4, speed: [0.3, 0.8], life: [0.3, 0.5], color: 0xb8a080, color2: 0x7a6a60, gravity: 6 });
        } else if (ab.slot === 'evade') {
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
        if (ab.kind === 'buff' && ab.from === 'usable') {
          if (ab.anim === 'toss') this.smokeBomb(f.x, f.facing, f.id);
          else this.drinkFx(e.f);
        }
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
          if (e.amount >= 1) fx.pop(fmt(e.amount), e.x + (Math.random() - 0.5) * 0.3, e.y, { color: e.ability === 'poison' ? '#9cff4a' : e.ability === 'thorns' ? '#7ad870' : e.ability === 'totem' ? '#9fe0ff' : e.ability === 'caltrops' ? '#d0d6e0' : '#ffb040' }, 0.7, 1.2);
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
      case 'shield': {
        const f = b.fighters[e.f];
        fx.pulse('ring', f.x, 1.0, 0.9, 0xffd76b, 0.35);
        this.play('shield', this.pan(f.x));
        // The ward stone raised it: a ring of runes climbs the body and the stone lights up.
        if (f.has.has('ward_stone') && f.wardCd > 9.5) {
          fx.pulse('runes', f.x, f.y + 0.15, 0.5, 0x9ad8ff, 0.55, 0x3a6aa8);
          fx.burst({ x: f.x, y: f.y + 1.0, count: 10, jitter: 0.35, jitterY: 0.7, dir: Math.PI / 2, spread: 0.6, speed: [0.6, 1.6], life: [0.35, 0.6], color: 0xe0f4ff, color2: 0x5a9ae0, kind: 'twinkle' });
          this.fighters[e.f].wardT = this.time + 0.6;
        }
        break;
      }
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
        if (e.style === 'frost' || e.style === 'smoke' || e.style === 'stomp' || e.style === 'thunder') {
          this.shockStyle(e.style, e.x, e.radius, b.fighters[e.f].facing, e.f);
          break;
        }
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
        this.useShots.delete(e.id);
        this.heard.delete(e.id);
        if (e.style === 'hawk') {
          // The hawk heads home from wherever its dive ended.
          const owner = b.fighters.find((f) => f.familiar?.kind === 'hawk' && f.familiar.away > 0 && !b.projectiles.some((p) => p.alive && p.owner === f.id && p.style === 'hawk'));
          if (owner) { const v = this.fighters[owner.id]; v.hawkFrom = [e.x, e.y]; v.hawkAway = owner.familiar!.away; }
        }
        if (e.style !== 'meteor') fx.burst({ x: e.x, y: e.y, count: e.hit ? 14 : 6, speed: [1, e.hit ? 5 : 3], life: [0.2, 0.45], color: col, color2: mix(col, 0x202030, 0.6), drag: 2, size: e.hit ? 2 : 1 });
        break;
      }
      case 'blink': {
        // A violet silhouette left where they stood folds away; they reappear in a burst and a ring.
        const v = this.fighters[e.f];
        if (v.lastS) v.ghosts.push({ x: Math.round(this.sx(e.from)), y: v.lastY, s: v.lastS, flip: v.lastFlip, t: 0, col: '#c8a0ff', life: 0.3, a: 0.6 });
        for (const x of [e.from, e.to]) fx.burst({ x, y: 1, count: 22, jitter: 0.3, jitterY: 0.8, speed: [1, 4], life: [0.3, 0.6], color: 0xe0c8ff, color2: 0x8a4ae0, drag: 2 });
        fx.pulse('swirl', e.from, 1.0, 0.7, 0xe0c8ff, 0.25, 0x8a4ae0);
        fx.pulse('star', e.to, 1.0, 0.45, 0xe0c8ff, 0.14);
        fx.pulse('groundRing', e.to, 0, 1.2, 0xb07aff, 0.35);
        fx.burst({ x: e.to, y: 1, count: 10, jitter: 0.2, jitterY: 0.6, speed: [2, 5], life: [0.15, 0.3], color: 0xffffff, color2: 0xb07aff, drag: 3, kind: 'streak' });
        this.play('whoosh', this.pan(e.to));
        break;
      }
      case 'familiar': {
        const f = b.fighters[e.f];
        const kind = f.familiar?.kind;
        if (kind === 'hawk') {
          // A shriek and a couple of loose feathers as it rouses.
          fx.burst({ x: f.x - f.facing * 0.2, y: f.y + 1.6, count: 3, jitter: 0.15, dir: Math.PI / 2, spread: 1, speed: [0.5, 1.5], life: [0.5, 0.8], color: 0xb07a42, color2: 0x7a4a2a, gravity: 2, drag: 2, size: 2 });
          this.play('whoosh', this.pan(f.x), 0.4);
        } else if (kind === 'whelp') {
          // Smoke curls from the nostrils as it draws breath.
          fx.burst({ x: f.x + f.facing * 0.1, y: f.y + 2.2, count: 4, jitter: 0.1, dir: Math.PI / 2, spread: 0.5, speed: [0.3, 0.8], life: [0.4, 0.7], color: 0x9a8a88, color2: 0x5a4a50, kind: 'smoke', size: 2 });
          fx.burst({ x: f.x + f.facing * 0.1, y: f.y + 2.0, count: 3, jitter: 0.08, speed: [0.5, 1.5], life: [0.2, 0.4], color: 0xffd060, color2: 0xd83a1a, kind: 'ember' });
          this.play('roar', this.pan(f.x), 0.25);
        } else {
          const c = this.glow(f.id, 0xf0ffff, 0x3ac8e8);
          fx.burst({ x: f.x - f.facing * 0.5, y: f.y + 2.1, count: 6, speed: [1, 2], life: [0.2, 0.4], color: c[0], color2: c[1] });
        }
        break;
      }
      case 'zone': {
        if (e.kind === 'totem') {
          // Planted with a thunderclap: a bolt from the sky onto the crystal.
          const top = TOTEM_TOP / PPM;
          fx.bolt(e.x + (Math.random() - 0.5) * 0.6, 7, e.x, top, 0x7ad8ff, 0.24);
          fx.pulse('groundRing', e.x, 0, e.radius, 0x7ad8ff, 0.45);
          fx.pulse('star', e.x, top, 0.5, 0xd8f8ff, 0.16);
          fx.burst({ x: e.x, y: 0.15, count: 10, jitter: 0.3, dir: Math.PI / 2, spread: 1.2, speed: [1, 3], life: [0.4, 0.8], color: 0xb0a090, color2: 0x6a5a60, kind: 'smoke', size: 3, drag: 1.5 });
          fx.burst({ x: e.x, y: top, count: 14, speed: [2, 5], life: [0.2, 0.4], color: 0xf0ffff, color2: 0x4ab8ff, drag: 2, kind: 'streak' });
          this.play('lightning', this.pan(e.x), 0.6);
          this.play('hitHeavy', this.pan(e.x), 0.5);
          this.flash(0xc8e8ff, 0.35);
          this.shake(0.25);
        } else {
          // Caltrops strewn: iron bits skitter out and a puff of dust.
          fx.burst({ x: e.x, y: 0.2, count: 16, jitter: e.radius * 0.3, dir: Math.PI / 2, spread: 1.3, speed: [1.5, 4], life: [0.3, 0.6], color: 0xc8d0dc, color2: 0x4a5060, gravity: 14, size: 1 });
          fx.burst({ x: e.x, y: 0.2, count: 6, jitter: e.radius * 0.5, dir: Math.PI / 2, spread: 1, speed: [0.3, 1], life: [0.5, 0.8], color: 0xb0a090, color2: 0x6a5a60, kind: 'smoke', size: 3, drag: 1.5 });
          this.play('rattle', this.pan(e.x));
          this.play('glass', this.pan(e.x), 0.25);
        }
        break;
      }
      case 'zap': {
        // The totem strikes: a bolt from its crystal to the enemy's chest.
        const tgt = b.other(b.fighters[e.f]);
        const ty = tgt.y + 1.1;
        fx.bolt(e.from, (TOTEM_TOP - 2) / PPM, e.to, ty, 0x7ad8ff, 0.2);
        fx.pulse('star', e.to, ty, 0.4, 0xd8f8ff, 0.12);
        fx.burst({ x: e.to, y: ty, count: 10, speed: [2, 5], life: [0.15, 0.3], color: 0xffffff, color2: 0x7ad8ff, drag: 2, kind: 'streak' });
        for (const z of b.zones) if (z.owner === e.f && z.kind === 'totem') this.zoneHot.set(z.id, 0.18);
        this.play('lightning', this.pan(e.to), 0.45);
        this.flash(0xc8e8ff, 0.18);
        break;
      }
      case 'swap': {
        // Trickster: both flash, a coin flips over each spot, a quick swirl where each one was.
        const f = b.fighters[e.f], o = b.other(f);
        for (const [id, at, was] of [[f.id, e.to, e.from], [o.id, e.from, e.to]] as const) {
          const v = this.fighters[id];
          v.flash = 0.1;
          if (v.lastS) v.ghosts.push({ x: Math.round(this.sx(was)), y: v.lastY, s: v.lastS, flip: v.lastFlip, t: 0, col: '#ffe08a', life: 0.28, a: 0.55 });
          fx.pulse('swirl', at, 1.0, 0.8, 0xfff0b0, 0.3, 0xc89a28);
          fx.pulse('coin', at, 2.0, 0.45, 0xffffff, 0.6);
          fx.burst({ x: at, y: 1.0, count: 10, jitter: 0.3, jitterY: 0.7, speed: [1, 3], life: [0.3, 0.5], color: 0xfff4c0, color2: 0xc89a28, drag: 2, kind: 'twinkle' });
        }
        this.play('flip', this.pan(e.to));
        this.play('whoosh', this.pan(e.from), 0.7);
        this.arena?.cheer(0.4);
        break;
      }
      case 'pull': {
        const t = b.fighters[e.target];
        this.fighters[e.target].pulledBy = e.f;
        fx.burst({ x: t.x, y: t.y + 1.1, count: 8, speed: [1, 3], life: [0.15, 0.3], color: 0xffffff, color2: 0x9aa2ae, drag: 2, kind: 'streak' });
        fx.burst({ x: t.x, y: 0.1, count: 4, jitter: 0.2, dir: Math.PI / 2, spread: 1, speed: [0.5, 1.5], life: [0.3, 0.5], color: 0xc8b8a0, color2: 0x8a7a70, kind: 'smoke', size: 3 });
        this.play('rattle', this.pan(t.x));
        this.play('swingHeavy', this.pan(t.x), 0.5);
        this.shake(0.2);
        break;
      }
      case 'foresight': {
        // Saw it coming: a ghost of them slides aside, an eye flashes open.
        const f = b.fighters[e.f], v = this.fighters[e.f];
        if (v.lastS) {
          v.ghosts.push({ x: v.lastX, y: v.lastY, s: v.lastS, flip: v.lastFlip, t: 0, vx: -f.facing * 70, col: '#c8b0ff', life: 0.4, a: 0.6 });
          v.ghosts.push({ x: v.lastX, y: v.lastY, s: v.lastS, flip: v.lastFlip, t: -0.06, vx: -f.facing * 40, col: '#8a6ae0', life: 0.4, a: 0.45 });
        }
        fx.pulse('eye', f.x, v.headY + 0.55, 0, 0xd8c8ff, 0.5, 0x8a4ae0);
        fx.burst({ x: f.x, y: f.y + 1.2, count: 8, jitter: 0.2, jitterY: 0.6, dir: f.facing > 0 ? Math.PI : 0, spread: 0.3, speed: [2, 4], life: [0.2, 0.35], color: 0xffffff, color2: 0xa080ff, drag: 2, kind: 'streak' });
        fx.pop('MISS', f.x, v.headY + 0.3, { color: '#d8c8ff', shade: '#7a5ac8' }, 0.8);
        this.play('whoosh', this.pan(f.x), 0.6);
        this.play('cast', this.pan(f.x), 0.35);
        break;
      }
      case 'callout': {
        const f = b.fighters[e.f];
        fx.pop(e.text.toUpperCase(), f.x, this.fighters[e.f].headY + 0.45, { color: e.color }, 0.9);
        break;
      }
      case 'rewind':
        this.rewindFx(e.f, e.from, e.to);
        break;
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

  /** The newer shockwaves: frost bursts, smoke, quake stomps and thunderclaps. */
  private shockStyle(style: 'frost' | 'smoke' | 'stomp' | 'thunder', x: number, radius: number, facing: number, id: FighterId): void {
    const fx = this.fx;
    const pan = this.pan(x);
    switch (style) {
      case 'frost': {
        // A frost bomb in a skin bursts in its colours (frost boots keep the stock burst).
        const art = this.fighters[id]?.art;
        const bomb = art?.useId === 'frost_bomb' && !!art.useSkinId && [...this.useShots.values()].includes(id);
        if (bomb) { this.frostBurst(x, radius, art!); break; }
        // An icy ring, shards flung out, ice spikes jutting from the ground and a cold mist.
        fx.pulse('groundRing', x, 0, radius * 1.1, 0xbff4ff, 0.45);
        fx.pulse('icicles', x, 0, radius * 0.8, 0xa8e8ff, 0.9, 0x5ab0e0);
        fx.pulse('star', x, 0.6, 0.5, 0xe8fbff, 0.14);
        fx.burst({ x, y: 0.4, count: 24, jitter: 0.3, dir: Math.PI / 2, spread: 1.3, speed: [2, 6], life: [0.3, 0.6], color: 0xffffff, color2: 0x8ad8ff, gravity: 12, drag: 1, kind: 'streak' });
        fx.burst({ x, y: 0.3, count: 8, jitter: radius * 0.5, dir: Math.PI / 2, spread: 0.8, speed: [0.2, 0.7], life: [0.7, 1.1], color: 0xe8f8ff, color2: 0x9ac8e0, kind: 'smoke', size: 4, drag: 1 });
        fx.burst({ x, y: 0.8, count: 10, jitter: radius * 0.4, jitterY: 0.5, dir: -Math.PI / 2, spread: 0.6, speed: [0.2, 0.6], life: [0.5, 0.9], color: 0xffffff, color2: 0x8ad8ff, kind: 'twinkle' });
        this.play('freeze', pan);
        this.play('glass', pan, 0.35);
        this.shake(0.2);
        break;
      }
      case 'smoke':
        this.smokeBomb(x, facing, id);
        break;
      case 'stomp':
        // The quake: a dust wave rolling out, the ground cracking in a ring, debris kicked up.
        fx.pulse('groundRing', x, 0, radius * 1.15, 0xd8b888, 0.45);
        fx.pulse('groundRing', x, 0, radius * 0.7, 0xa88a60, 0.3);
        fx.pulse('crack', x, 0, radius * 0.9, 0x6a4a30, 1.8);
        fx.pulse('cloud', x, 0, radius * 0.75, 0xc8b090, 0.9, 0x9a8468);
        for (const side of [-1, 1]) {
          fx.burst({ x: x + side * 0.3, y: 0.15, count: 8, jitter: 0.2, dir: side > 0 ? 0.25 : Math.PI - 0.25, spread: 0.25, speed: [2, 5], life: [0.6, 1.0], color: 0xc8b090, color2: 0x7a6a60, kind: 'smoke', size: 4, drag: 2.2 });
        }
        fx.burst({ x, y: 0.2, count: 18, jitter: 0.5, dir: Math.PI / 2, spread: 0.9, speed: [3, 7], life: [0.4, 0.8], color: 0xa88a60, color2: 0x4a3a30, gravity: 16, size: 2 });
        fx.burst({ x, y: 0.2, count: 10, jitter: 0.6, dir: Math.PI / 2, spread: 1.1, speed: [2, 5], life: [0.3, 0.6], color: 0xd8c8a8, color2: 0x7a6a60, gravity: 14 });
        this.play('hitHeavy', pan);
        this.play('explosion', pan, 0.35);
        this.shake(0.6);
        this.punchIn(1, 0.3, x);
        break;
      case 'thunder': {
        // A thunderclap: a crackling ring, sparks, short bolts arcing out along the ground.
        fx.pulse('ring', x, 1.0, radius * 0.9, 0xaee4ff, 0.3);
        fx.pulse('groundRing', x, 0, radius * 1.15, 0x7ad8ff, 0.4);
        fx.pulse('star', x, 1.0, 0.7, 0xf0ffff, 0.16);
        for (let i = 0; i < 4; i++) {
          const side = i & 1 ? 1 : -1, reach = radius * (0.6 + Math.random() * 0.4);
          fx.bolt(x + side * 0.2, 0.9 + Math.random() * 0.4, x + side * reach, 0.1 + Math.random() * 0.6, 0x7ad8ff, 0.18);
        }
        fx.burst({ x, y: 1.0, count: 26, speed: [3, 8], life: [0.15, 0.35], color: 0xffffff, color2: 0x7ad8ff, drag: 2.5, kind: 'streak' });
        this.play('lightning', pan, 0.8);
        this.play('hitHeavy', pan, 0.6);
        this.flash(0xc8e8ff, 0.4);
        this.shake(0.45);
        break;
      }
    }
  }

  /** A smoke bomb smashed at the feet: clay bits, a dark burst, and a cloud that hangs for a couple of seconds. */
  private smokeBomb(x: number, facing: number, id: FighterId): void {
    const fx = this.fx;
    const art = this.fighters[id]?.art;
    if (art?.useSkinId && art.use) { this.skinnedSmoke(x, facing, art); return; }
    fx.pulse('cloud', x, 0, 1.5, 0xb8b8c4, 2.6, 0x8a8a98);
    fx.pulse('groundRing', x, 0, 1.4, 0xc8c8d0, 0.35);
    fx.burst({ x: x + facing * 0.2, y: 0.15, count: 10, dir: Math.PI / 2, spread: 1.2, speed: [1.5, 4], life: [0.3, 0.5], color: 0x8a8898, color2: 0x4a4858, gravity: 14, size: 1 });
    fx.burst({ x, y: 0.5, count: 14, jitter: 0.5, jitterY: 0.4, speed: [0.8, 2.4], life: [0.8, 1.5], color: 0xc8c8d4, color2: 0x6a6a78, kind: 'smoke', size: 5, drag: 1.6 });
    fx.burst({ x, y: 1.2, count: 8, jitter: 0.4, jitterY: 0.6, dir: Math.PI / 2, spread: 0.8, speed: [0.3, 1], life: [1.4, 2.2], color: 0xa8a8b4, color2: 0x5a5a68, kind: 'smoke', size: 6, drag: 1 });
    this.play('glass', this.pan(x), 0.5);
    this.play('firebomb', this.pan(x), 0.3);
    this.play('whoosh', this.pan(x), 0.8);
  }

  /** A smoke bomb in a skin: its cloud, shards and splash in the item's colours, and a legendary one's petals or sparkles. */
  private skinnedSmoke(x: number, facing: number, art: CharacterArt): void {
    const fx = this.fx;
    const [hi, lo] = art.use!.glow;
    fx.pulse('cloud', x, 0, 1.5, mix(hi, lo, 0.3), 2.6, mix(hi, lo, 0.6));
    fx.pulse('groundRing', x, 0, 1.4, hi, 0.35);
    fx.burst({ x: x + facing * 0.2, y: 0.15, count: 10, dir: Math.PI / 2, spread: 1.2, speed: [1.5, 4], life: [0.3, 0.5], color: mix(hi, lo, 0.6), color2: lo, gravity: 14, size: 1 });
    // A splash of the colour flung low over the floor.
    fx.burst({ x, y: 0.2, count: 8, dir: Math.PI / 2, spread: 1.3, speed: [2, 4.5], life: [0.35, 0.6], color: hi, color2: lo, gravity: 16, size: 2 });
    fx.burst({ x, y: 0.5, count: 14, jitter: 0.5, jitterY: 0.4, speed: [0.8, 2.4], life: [0.8, 1.5], color: mix(hi, lo, 0.25), color2: mix(lo, 0x202028, 0.3), kind: 'smoke', size: 5, drag: 1.6 });
    fx.burst({ x, y: 1.2, count: 8, jitter: 0.4, jitterY: 0.6, dir: Math.PI / 2, spread: 0.8, speed: [0.3, 1], life: [1.4, 2.2], color: mix(hi, lo, 0.45), color2: mix(lo, 0x202028, 0.3), kind: 'smoke', size: 6, drag: 1 });
    const k = art.useSkin?.fx;
    if (k) {
      // Thrown out with the burst, then drifting down through the cloud for a while.
      fx.burst({ x, y: 0.6, count: 22, jitter: 0.3, dir: Math.PI / 2, spread: 1.3, speed: [2, 4.5], life: [1.2, 2.2], color: k.spark, color2: k.spark2, gravity: 1.6, drag: 2.4, kind: k.kind ?? 'twinkle' });
      fx.burst({ x, y: 2.4, count: 12, jitter: 1.3, jitterY: 0.5, dir: -Math.PI / 2, spread: 0.5, speed: [0.2, 0.5], life: [1.6, 2.6], color: k.spark, color2: k.spark2, kind: k.kind ?? 'twinkle' });
    }
    this.play('glass', this.pan(x), 0.5);
    this.play('firebomb', this.pan(x), 0.3);
    this.play('whoosh', this.pan(x), 0.8);
  }

  /** A frost bomb in a skin: ring, ice spikes and mist in the item's colours; a legendary one bursts into snow. */
  private frostBurst(x: number, radius: number, art: CharacterArt): void {
    const fx = this.fx, pan = this.pan(x);
    const [hi, lo] = art.use!.glow;
    fx.pulse('groundRing', x, 0, radius * 1.1, hi, 0.45);
    fx.pulse('icicles', x, 0, radius * 0.8, mix(hi, lo, 0.35), 0.9, lo);
    fx.pulse('star', x, 0.6, 0.5, hi, 0.14);
    fx.burst({ x, y: 0.4, count: 24, jitter: 0.3, dir: Math.PI / 2, spread: 1.3, speed: [2, 6], life: [0.3, 0.6], color: 0xffffff, color2: lo, gravity: 12, drag: 1, kind: 'streak' });
    fx.burst({ x, y: 0.3, count: 8, jitter: radius * 0.5, dir: Math.PI / 2, spread: 0.8, speed: [0.2, 0.7], life: [0.7, 1.1], color: mix(hi, 0xffffff, 0.3), color2: mix(hi, lo, 0.5), kind: 'smoke', size: 4, drag: 1 });
    // Glass shards.
    fx.burst({ x, y: 0.5, count: 10, dir: Math.PI / 2, spread: 1.3, speed: [2, 5], life: [0.25, 0.5], color: 0xf0fbff, color2: mix(hi, lo, 0.5), gravity: 16, size: 1 });
    const k = art.useSkin?.fx;
    if (k) {
      // A flurry: flung up and out, then drifting down over the burst.
      fx.burst({ x, y: 0.6, count: 30, jitter: 0.3, dir: Math.PI / 2, spread: 1.2, speed: [2, 5], life: [1.4, 2.4], color: k.spark, color2: k.spark2, gravity: 1.4, drag: 2.2, kind: k.kind ?? 'twinkle' });
      fx.burst({ x, y: 2.6, count: 14, jitter: radius * 0.8, jitterY: 0.5, dir: -Math.PI / 2, spread: 0.4, speed: [0.2, 0.5], life: [1.8, 2.8], color: k.spark, color2: k.spark2, kind: k.kind ?? 'twinkle' });
    } else fx.burst({ x, y: 0.8, count: 10, jitter: radius * 0.4, jitterY: 0.5, dir: -Math.PI / 2, spread: 0.6, speed: [0.2, 0.6], life: [0.5, 0.9], color: 0xffffff, color2: hi, kind: 'twinkle' });
    this.play('freeze', pan);
    this.play('glass', pan, 0.6);
    this.shake(0.2);
  }

  /**
   * Sands of Time turning back: a golden afterimage trail from where the
   * blow landed back to where they were, a clock face sweeping backwards,
   * sand swirling up, and a short sepia flash with a beat of slow motion.
   */
  private rewindFx(id: FighterId, from: number, to: number): void {
    const fx = this.fx, v = this.fighters[id], f = this.battle!.fighters[id];
    if (v.lastS) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        // From the old spot to the new one, each echo appearing a moment after the last.
        v.ghosts.push({ x: Math.round(this.sx(from + (to - from) * k)), y: v.lastY, s: v.lastS, flip: v.lastFlip, t: -k * 0.18, col: k < 0.5 ? '#ffe8a0' : '#ffc860', life: 0.45, a: 0.25 + 0.4 * k });
      }
    }
    const y = f.y + 1.1;
    fx.pulse('clock', to, y, 0.85, 0xffd060, 0.7, 0xa87a20);
    fx.pulse('swirl', to, y, 1.1, 0xfff0b0, 0.5, 0xe0a030);
    fx.pulse('swirl', from, y, 0.8, 0xfff0b0, 0.35, 0xe0a030);
    fx.burst({ x: to, y: 0.4, count: 26, jitter: 0.5, dir: Math.PI / 2, spread: 0.5, speed: [1, 3], life: [0.5, 0.9], color: 0xfff0b0, color2: 0xd09030, drag: 1.5, kind: 'twinkle' });
    fx.burst({ x: (from + to) / 2, y, count: 14, jitter: Math.abs(to - from) / 2 + 0.2, jitterY: 0.6, speed: [0.3, 1], life: [0.4, 0.7], color: 0xf0c060, color2: 0xa07020, drag: 1 });
    fx.pop('REWIND!', to, v.headY + 0.45, { color: '#ffe08a', scale: 2, shade: '#b07a20' }, 1.1);
    this.play('revive', this.pan(to), 0.6);
    this.play('gems', this.pan(to));
    this.flash(0xffe0a0, 0.7);
    this.slowmo(0.45, 0.35);
    this.punchIn(1, 0.4, to);
    this.arena?.cheer(0.6);
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

const RING1 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
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

/** Draws a sprite's companion layer (night accents) exactly where `blit` draws the sprite. */
function blitImg(g: CanvasRenderingContext2D, s: Sprite, img: HTMLCanvasElement, x: number, y: number, flip: boolean): void {
  if (!flip) { g.drawImage(img, x - s.ox, y - s.oy); return; }
  g.save();
  g.translate(x + 1, 0);
  g.scale(-1, 1);
  g.drawImage(img, -s.ox, y - s.oy);
  g.restore();
}

function blit(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, flip: boolean): void {
  if (!flip) { g.drawImage(s.img, x - s.ox, y - s.oy); return; }
  g.save();
  g.translate(x + 1, 0);
  g.scale(-1, 1);
  g.drawImage(s.img, -s.ox, y - s.oy);
  g.restore();
}

/** Body landmarks for a character's build, in px above the feet. */
function bodyMarks(art: CharacterArt): { shPx: number; topPx: number; spread: number } {
  const b = art.body;
  const shPx = Math.round((b.footH + b.shin + b.thigh) * 0.94 + b.torso * 0.9);
  return { shPx, topPx: Math.round(shPx + b.neck + b.headRy * 2), spread: Math.round(b.shoulderSpread) };
}

/**
 * A chain of alternating light and dark links between two screen points,
 * sagging by `sag` px in the middle (0 = pulled taut).
 */
function drawChain(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, sag: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(2, Math.round(len));
  // Links three pixels long, every other one turned (a pixel off the line), lit on top.
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag);
    const k = i % 6;
    g.fillStyle = k === 0 || k === 3 ? '#3a3a48' : k < 3 ? '#d8dee8' : '#8a92a0';
    g.fillRect(x, y, 1, 1);
    if (k === 4) { g.fillStyle = '#5a6270'; g.fillRect(x, y + 1, 1, 1); }
  }
}

function fmt(n: number): string {
  return String(Math.max(1, Math.round(n)));
}
