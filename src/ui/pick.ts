import { sfx } from '../audio/sfx';
import { WINS_NEEDED, type Side } from '../net/protocol';
import type { CharacterBuild } from '../sim/loadout';
import { h } from './dom';
import { icon } from './icons';
import { CARD_ART, fighterCard } from './menu';
import { STYLE_ICON } from './creator';
import { css } from '../render/pixel/color';
import { FIGHT_STYLES } from '../sim/styles';
import { scoreLine } from './online';
import { Preview } from './preview';

export interface PickInfo {
  you: Side;
  round: number;
  score: [number, number];
  ready: [boolean, boolean];
  /** performance.now() when the pick clock runs out (Infinity while frozen). */
  deadline: number;
  /** [blue, red]: your own side shows your draft, the rival their last build. */
  builds: [CharacterBuild, CharacterBuild];
}

export interface PickCallbacks {
  onGear(): void;
  /** Steps your fighting style for this round to the next one. */
  onStyle(): void;
  onReady(): void;
  onUnready(): void;
  onLeave(): void;
}

/**
 * Online round pick: both fighters side by side (blue host left, red guest
 * right), the score, the pick clock, and Ready. Only your own corner has buttons.
 */
export class PickScreen {
  readonly el: HTMLElement;
  private bar = h('div.match-bar.plate');
  private dock = h('div.menu-dock');
  private actions = h('div.menu-actions');
  private clock = h('b.pick-clock');
  private previews: [Preview | null, Preview | null] = [null, null];
  private keys: [string, string] = ['', ''];
  private key = '';
  private info: PickInfo | null = null;
  private lastSec = -1;

  constructor(private readonly cb: PickCallbacks) {
    this.el = h('div.menu.pick', null,
      h('div.menu-top', null, this.bar,
        h('div.menu-tools', null, h('button.btn', { title: 'Leave match', onclick: () => { sfx.play('ui'); cb.onLeave(); } }, icon('exit'), 'Leave'))),
      this.dock);
    this.el.hidden = true;
  }

  show(info: PickInfo): void {
    this.el.hidden = false;
    this.info = info;
    const key = JSON.stringify([info.you, info.round, info.score, info.ready]);
    const buildKeys = info.builds.map((b) => JSON.stringify(b)) as [string, string];
    if (key === this.key && buildKeys[0] === this.keys[0] && buildKeys[1] === this.keys[1]) return;
    this.key = key;
    for (const s of [0, 1] as const) {
      if (buildKeys[s] === this.keys[s] && this.previews[s]) continue;
      this.previews[s]?.dispose();
      this.previews[s] = new Preview(info.builds[s], ...CARD_ART, { autoplay: true, flip: s === 1, ground: 3 });
    }
    this.keys = buildKeys;
    const you = info.you, them = (1 - you) as Side;
    const mine = info.ready[you];
    const cards = ([0, 1] as const).map((s) => {
      const own = s === you;
      const state = (own ? mine : info.ready[s]) ? 'Ready' : 'Picking';
      const st = FIGHT_STYLES[info.builds[s].style ?? 'balanced'];
      const btns = own && !mine ? [
        h('button.btn.sm', { onclick: () => this.cb.onGear() }, icon('bag'), 'Build'),
        h('button.btn.sm.style-btn', {
          title: `Fighting style: ${st.name} (${st.title}). Tap for the next style.`,
          onclick: () => { sfx.play('select'); this.cb.onStyle(); },
        }, h('span.style-ic', { style: { color: css(st.color) } }, icon(STYLE_ICON[st.id])), st.name),
      ] : [];
      const card = fighterCard(info.builds[s], this.previews[s]!, s, own ? 'You' : 'Rival', state, btns);
      // Both corners show the style each fighter goes in with.
      card.querySelector('.fcard-sub')?.append(` · ${st.name}`);
      return card;
    });
    this.dock.replaceChildren(cards[0], this.actions, cards[1]);
    this.bar.replaceChildren(
      h('div.match-title', null, h('b', null, `Round ${info.round}`), h('small.muted', null, `First to ${WINS_NEEDED} wins`)),
      scoreLine(info.score),
      this.clock);
    this.actions.replaceChildren(mine
      ? h('div.pick-wait.plate', null,
        h('div.lobby-status', null, h('span.spinner'), info.ready[them] ? 'Starting' : `Waiting for ${info.builds[them].name}`),
        h('button.btn.sm', { onclick: () => { sfx.play('ui'); this.cb.onUnready(); } }, 'Change build'))
      : h('button.btn.primary.big.fight', { onclick: () => { sfx.play('ui'); this.cb.onReady(); } }, icon('lock'), 'Ready'));
    this.lastSec = -1;
    this.tick();
  }

  /** Updates the pick clock. */
  tick(): void {
    const i = this.info;
    if (!i || this.el.hidden) return;
    const sec = i.deadline === Infinity ? -2 : Math.max(0, Math.ceil((i.deadline - performance.now()) / 1000));
    if (sec === this.lastSec) return;
    this.lastSec = sec;
    this.clock.textContent = sec === -2 ? '--' : sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec);
    this.clock.classList.toggle('low', sec >= 0 && sec <= 10);
  }

  hide(): void {
    this.el.hidden = true;
    for (const p of this.previews) p?.dispose();
    this.previews = [null, null];
    this.keys = ['', ''];
    this.key = '';
    this.info = null;
  }
}
