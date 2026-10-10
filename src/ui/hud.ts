import { Brain, PLAN_LABELS, type Plan } from '../sim/ai/brain';
import type { Battle } from '../sim/battle';
import { MATCH_TIME, MAX_ENERGY, ROUND_TIME } from '../sim/constants';
import { FORMS } from '../sim/forms';
import type { BattleEvent, StatusId } from '../sim/types';
import type { BattleView } from '../render/battleView';
import { h } from './dom';
import { fmtHp } from './format';
import { icon } from './icons';
import { scoreLine } from './online';

/** Online: the round and score shown under the clock. */
export interface HudMatch { round: number; score: [number, number] }

const SPEEDS = [1, 2, 4];

const STATUS: Record<StatusId, [string, string]> = {
  burn: ['BURN', '#ff8a3a'], poison: ['PSN', '#7ad84a'], chill: ['CHILL', '#9ad8ff'], frozen: ['ICE', '#d8f4ff'],
  stun: ['STUN', '#ffe070'], rage: ['RAGE', '#ff5a4a'], haste: ['HASTE', '#7af0c8'], mark: ['MARK', '#d07aff'],
  ironskin: ['IRON', '#c8d0e0'], vulnerable: ['VULN', '#ff9ab0'],
  silence: ['MUTE', '#b8a0ff'], root: ['ROOT', '#c8a060'], hidden: ['SMOKE', '#b8b8c8'], fear: ['FEAR', '#e070a0'],
  regen: ['REGEN', '#7ae07a'], momentum: ['MOMENTUM', '#ffc040'],
};

interface SideEls {
  fill: HTMLElement;
  ghost: HTMLElement;
  shield: HTMLElement;
  num: HTMLElement;
  en: HTMLElement;
  plan: HTMLElement;
  /** DEBUG (temporary): AI heat bar, tolerance tick and readout. */
  heat: HTMLElement; heatBar: HTMLElement; heatTick: HTMLElement; heatNum: HTMLElement; heatKey: string;
  statuses: HTMLElement;
  bubble: HTMLElement;
  bubbleT: number;
  /** Displayed (trailing) health for the ghost bar. */
  ghostV: number;
  last: { hp: number; ghost: number; shield: number; en: number; st: string; band: string };
}

export interface HudCallbacks {
  onSpeed(s: number): void;
  onPause(): void;
  onExit(): void;
  onSettings(): void;
  onCamera(): void;
}

/**
 * Battle HUD over the pixel canvas: health, shield and energy bars, the AI's
 * current plan, statuses, the clock, speed / pause / exit, and thought
 * bubbles over the fighters. Writes only when a shown value changes and only
 * touches transforms and text, so it never forces layout per frame.
 */
export class Hud {
  readonly el: HTMLDivElement;
  private sides: SideEls[] = [];
  private clock!: HTMLElement;
  private speedBtn!: HTMLButtonElement;
  private pauseBtn!: HTMLButtonElement;
  private banner!: HTMLElement;
  private camBtn!: HTMLButtonElement;
  private camToast!: HTMLElement;
  private camName = '';
  private bannerT = 0;
  private lastClock = -1;
  private battle: Battle | null = null;
  private bubbles = true;

  constructor(private readonly cb: HudCallbacks, private readonly view: BattleView) {
    this.el = h<HTMLDivElement>('div.hud');
  }

  setup(b: Battle, speed: number): void {
    this.battle = b;
    this.sides = [];
    const top = h('div.hud-top');
    const bubbles: HTMLElement[] = [];
    for (const side of [0, 1] as const) {
      const f = b.fighters[side];
      const fill = h('i.fill'), ghost = h('i.ghost'), shield = h('i.shield'), num = h('span');
      const en = h('i.fill');
      const plan = h('span.plan', null, PLAN_LABELS[b.brains[side].plan]);
      const statuses = h('div.statuses');
      const heat = h('i.fill'), heatTick = h('i.tick'), heatNum = h('span.heat-num');
      const heatBar = h('div.bar.heat', null, heat, heatTick);
      const bubble = h('div.bubble', { hidden: true });
      bubbles.push(bubble);
      const el = h(`div.side${side ? '.right' : ''}`, null,
        h('div.side-name', null, h('span', null, f.name), h('small.muted', null, FORMS[f.form].name)),
        h('div.bar', null, ghost, fill, shield, h('i.ticks')),
        h('div.bar.en', null, en),
        h('div.heat-row', null, heatBar, heatNum),
        h('div.side-hp', null, num, ' · ', plan),
        statuses,
      );
      this.sides.push({ fill, ghost, shield, num, en, plan, heat, heatBar, heatTick, heatNum, heatKey: '', statuses, bubble, bubbleT: 0, ghostV: 1, last: { hp: -1, ghost: -1, shield: -1, en: -1, st: '-', band: '' } });
      if (side === 0) top.append(el);
      else {
        this.clock = h('div.clock.plate', null, String(ROUND_TIME));
        this.matchChip = h('div.match-chip.plate', { hidden: true });
        top.append(h('div.mid', null, this.clock, this.matchChip), el);
      }
    }
    this.speedBtn = h<HTMLButtonElement>('button.btn', {
      title: 'Speed', onclick: () => this.cb.onSpeed(SPEEDS[(SPEEDS.indexOf(this.speedV) + 1) % SPEEDS.length]),
    });
    this.pauseBtn = h<HTMLButtonElement>('button.btn', { title: 'Pause', 'aria-label': 'Pause', onclick: () => this.cb.onPause() }, icon('pause'));
    this.camBtn = h<HTMLButtonElement>('button.btn', { 'aria-label': 'Camera', onclick: () => this.cb.onCamera() }, icon('camera'));
    this.camToast = h('div.cam-toast.plate', { hidden: true });
    const ctrl = h('div.hud-ctrl', null,
      this.camToast,
      h('button.btn', { title: 'Settings', 'aria-label': 'Settings', onclick: () => this.cb.onSettings() }, icon('settings')),
      this.camBtn,
      this.speedBtn, this.pauseBtn,
      h('button.btn', { title: 'Leave', 'aria-label': 'Leave', onclick: () => this.cb.onExit() }, icon('close')));
    this.banner = h('div.banner', { hidden: true });
    this.el.replaceChildren(top, ...bubbles, ctrl, this.banner);
    this.setSpeed(speed);
    this.setCamera(this.camName);
    this.lastClock = -1;
    this.bannerT = 0;
    this.setMatch(this.match);
  }

  private match: HudMatch | null = null;
  private matchChip!: HTMLElement;

  /** Online: round and score under the clock, and no pause (both devices play at once). */
  setMatch(m: HudMatch | null): void {
    this.match = m;
    if (!this.matchChip) return;
    this.matchChip.hidden = !m;
    this.pauseBtn.hidden = !!m;
    if (m) this.matchChip.replaceChildren(h('small', null, `Round ${m.round}`), scoreLine(m.score));
  }

  private speedV = 1;
  setSpeed(s: number): void {
    this.speedV = s;
    this.speedBtn?.replaceChildren(icon('fast'), `${s}x`);
    this.speedBtn?.classList.toggle('on', s > 1);
  }

  /** The camera mode's name on the button; `announce` flashes it over the controls. */
  setCamera(name: string, announce = false): void {
    this.camName = name;
    if (!this.camBtn) return;
    this.camBtn.title = `Camera: ${name}`;
    if (!announce) return;
    const t = this.camToast;
    t.replaceChildren(icon('camera'), name);
    t.hidden = false;
    t.getAnimations().forEach((a) => a.cancel());
    t.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1400, fill: 'forwards' })
      .onfinish = () => { t.hidden = true; };
  }

  /** Shows or hides the fighters' thought bubbles (hiding clears any on screen). */
  setBubbles(on: boolean): void {
    this.bubbles = on;
    if (!on) for (const s of this.sides) { s.bubble.hidden = true; s.bubbleT = 0; }
  }

  setPaused(p: boolean): void {
    this.pauseBtn.replaceChildren(icon(p ? 'play' : 'pause'));
    this.pauseBtn.title = p ? 'Resume' : 'Pause';
    this.pauseBtn.classList.toggle('on', p);
  }

  /** Big centred text; `seconds` 0 keeps it until replaced. */
  showBanner(text: string, sub = '', seconds = 1.2): void {
    this.banner.replaceChildren(text, sub ? h('small', null, sub) : '');
    this.banner.hidden = !text;
    this.bannerT = seconds;
  }

  onEvent(e: BattleEvent): void {
    const b = this.battle;
    if (!b) return;
    if (e.type === 'thought') {
      if (!this.bubbles) return;
      const s = this.sides[e.f];
      s.bubble.textContent = e.text;
      s.bubble.hidden = false;
      s.bubbleT = 1.4 + Math.min(1.4, e.text.length * 0.035);
    } else if (e.type === 'plan') {
      this.sides[e.f].plan.textContent = PLAN_LABELS[e.plan as Plan];
    } else if (e.type === 'overtime') {
      this.showBanner('OVERTIME!', 'Night falls: double damage', 2.2);
    } else if (e.type === 'ko') {
      this.showBanner('K.O.!', '', 2);
    } else if (e.type === 'end' && e.reason === 'time') {
      this.showBanner('TIME!', e.winner === -1 ? 'Draw' : `${b.fighters[e.winner].name} wins`, 2);
    }
  }

  update(dt: number): void {
    const b = this.battle;
    if (!b) return;
    for (let i = 0; i < 2; i++) {
      const f = b.fighters[i];
      const s = this.sides[i];
      const hp = Math.max(0, f.hp) / f.stats.maxHp;
      const hpQ = Math.round(hp * 1000);
      if (hpQ !== s.last.hp) {
        s.last.hp = hpQ;
        s.fill.style.transform = `scaleX(${(hpQ / 1000).toFixed(3)})`;
        s.num.textContent = `${fmtHp(f.hp, f.alive)} / ${Math.round(f.stats.maxHp)}`;
        const band = hp > 0.5 ? '' : hp > 0.25 ? 'mid' : 'low';
        if (band !== s.last.band) { s.last.band = band; s.fill.className = 'fill' + (band ? ' ' + band : ''); }
      }
      // The pale ghost trails the real bar so big hits read as a chunk.
      if (s.ghostV > hp) s.ghostV = Math.max(hp, s.ghostV - dt * (s.ghostV - hp > 0.2 ? 0.9 : 0.45));
      else s.ghostV = hp;
      const gQ = Math.round(s.ghostV * 1000);
      if (gQ !== s.last.ghost) { s.last.ghost = gQ; s.ghost.style.transform = `scaleX(${(gQ / 1000).toFixed(3)})`; }
      const sh = Math.round(Math.min(1, f.shield / f.stats.maxHp) * 1000);
      if (sh !== s.last.shield) { s.last.shield = sh; s.shield.style.transform = `scaleX(${(sh / 1000).toFixed(3)})`; }
      const en = Math.round(f.energy);
      if (en !== s.last.en) {
        s.last.en = en;
        s.en.style.transform = `scaleX(${(en / MAX_ENERGY).toFixed(2)})`;
        s.en.classList.toggle('full', en >= MAX_ENERGY);
      }
      // DEBUG (temporary): heat vs this fighter's tolerance; tinted while circling.
      const br = b.brains[i];
      if (br instanceof Brain) {
        const ht = Math.round(br.heat * 100), tol = Math.round(Math.min(1, br.tolerance) * 100);
        const key = `${ht}|${tol}|${br.breathing}`;
        if (key !== s.heatKey) {
          s.heatKey = key;
          s.heat.style.transform = `scaleX(${(ht / 100).toFixed(2)})`;
          s.heatTick.style.left = `${tol}%`;
          s.heatBar.classList.toggle('breathing', br.breathing);
          s.heatNum.textContent = `heat ${(ht / 100).toFixed(2)} / ${(br.tolerance).toFixed(2)}`;
        }
      }
      let st = '';
      for (const x of f.statuses) st += x.id + x.stacks;
      if (st !== s.last.st) {
        s.last.st = st;
        s.statuses.replaceChildren(...f.statuses.map((x) => {
          const [label, color] = STATUS[x.id];
          return h('span.st', { style: { background: color } }, x.stacks > 1 ? `${label}${x.stacks}` : label);
        }));
      }
      if (s.bubbleT > 0) {
        s.bubbleT -= dt;
        if (s.bubbleT <= 0 || !f.alive) { s.bubble.hidden = true; s.bubbleT = 0; }
        else {
          const [ax, ay] = this.view.headAt(f.id);
          const [cx, cy] = this.view.screen.toCss(ax, ay);
          s.bubble.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy - 6)}px) translate(-50%, -100%)`;
        }
      }
    }
    // Regular time counts down to 0, then overtime counts down its own 30s.
    const ot = b.time >= ROUND_TIME;
    const left = Math.max(0, Math.ceil((ot ? MATCH_TIME : ROUND_TIME) - b.time));
    const key = ot ? 1000 + left : left;
    if (key !== this.lastClock) {
      this.lastClock = key;
      this.clock.textContent = String(left);
      this.clock.classList.toggle('ot', ot);
      this.clock.classList.toggle('low', left <= 10);
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.hidden = true;
    }
  }

  show(v: boolean): void {
    this.el.hidden = !v;
  }
}
