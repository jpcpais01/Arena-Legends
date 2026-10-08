import { sfx } from '../audio/sfx';
import { WINS_NEEDED, type Side } from '../net/protocol';
import type { CharacterBuild } from '../sim/loadout';
import { h } from './dom';
import { icon } from './icons';
import { fighterCard } from './menu';
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
  private matchup = h('div.matchup');
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
      h('div'),
      h('div.menu-main', null, this.matchup, this.actions));
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
      this.previews[s] = new Preview(info.builds[s], 100, 90, { autoplay: true, flip: s === 1 });
    }
    this.keys = buildKeys;
    const you = info.you, them = (1 - you) as Side;
    const mine = info.ready[you];
    const cards = ([0, 1] as const).map((s) => {
      const own = s === you;
      const tag = own ? (mine ? 'Locked in' : 'You') : info.ready[s] ? 'Ready' : 'Picking';
      const btns = own && !mine ? [h('button.btn', { onclick: () => this.cb.onGear() }, icon('bag'), 'Gear')] : [];
      return fighterCard(info.builds[s], this.previews[s]!, s === 1, tag, btns);
    });
    this.matchup.replaceChildren(cards[0], h('div.vs', null, 'VS'), cards[1]);
    this.bar.replaceChildren(
      h('div.match-title', null, h('b', null, `Round ${info.round}`), h('small.muted', null, `First to ${WINS_NEEDED} wins`)),
      scoreLine(info.score),
      this.clock);
    this.actions.replaceChildren(mine
      ? h('div.pick-wait', null,
        h('span.muted', null, info.ready[them] ? 'Starting' : `Waiting for ${info.builds[them].name}`),
        h('button.btn', { onclick: () => { sfx.play('ui'); this.cb.onUnready(); } }, 'Change build'))
      : h('button.btn.primary.big', { onclick: () => { sfx.play('ui'); this.cb.onReady(); } }, icon('lock'), 'Ready'));
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
    this.clock.textContent = sec === -2 ? '--' : String(sec);
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
