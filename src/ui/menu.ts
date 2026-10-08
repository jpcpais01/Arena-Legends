import { SPECIES } from '../character/appearance';
import type { PlayerCharacter } from '../character/profile';
import { iconCanvas } from '../render/icons';
import { FORMS } from '../sim/forms';
import { gearIds } from '../sim/loadout';
import { gearOf } from '../sim/gear';
import { h } from './dom';
import { icon } from './icons';
import { Preview } from './preview';

export interface MenuCallbacks {
  onFight(): void;
  onEditLook(): void;
  onGear(): void;
  onNewRival(): void;
  onSound(): void;
}

export interface Record { w: number; l: number }

/**
 * Title screen over the background duel: the logo, your fighter against the
 * current rival, and the big Fight button.
 */
export class Menu {
  readonly el: HTMLElement;
  private previews: Preview[] = [];
  private soundBtn: HTMLButtonElement;
  private matchup = h('div.matchup');

  constructor(private readonly cb: MenuCallbacks) {
    this.soundBtn = h<HTMLButtonElement>('button.btn.icon', { title: 'Sound', 'aria-label': 'Sound', onclick: () => cb.onSound() });
    this.el = h('div.menu', null,
      h('div.menu-top', null,
        h('div.logo', null, 'ARENA ', h('em', null, 'LEGENDS'), h('small', null, 'AUTO DUEL ARENA')),
        h('div.menu-tools', null, this.soundBtn)),
      h('div'),
      h('div.menu-main', null,
        this.matchup,
        h('div.menu-actions', null, h('button.btn.primary.big', { onclick: () => cb.onFight() }, icon('swords'), 'Fight'))),
    );
  }

  setSound(on: boolean): void {
    this.soundBtn.replaceChildren(icon(on ? 'soundOn' : 'soundOff'));
  }

  set(player: PlayerCharacter, rival: PlayerCharacter, rec: Record): void {
    for (const p of this.previews) p.dispose();
    const a = new Preview(player, 100, 90, { autoplay: true });
    const b = new Preview(rival, 100, 90, { autoplay: true, flip: true });
    this.previews = [a, b];
    this.matchup.replaceChildren(
      this.card(player, a, false, `${rec.w}W ${rec.l}L`, [
        h('button.btn', { onclick: () => this.cb.onGear() }, icon('bag'), 'Gear'),
        h('button.btn', { onclick: () => this.cb.onEditLook() }, icon('edit'), 'Edit'),
      ]),
      h('div.vs', null, 'VS'),
      this.card(rival, b, true, 'Rival', [
        h('button.btn', { onclick: () => this.cb.onNewRival() }, icon('dice'), 'New rival'),
      ]),
    );
  }

  private card(c: PlayerCharacter, p: Preview, right: boolean, tag: string, btns: HTMLElement[]): HTMLElement {
    const gear = gearIds(c.gear).map((id) => {
      const ic = iconCanvas(id);
      ic.classList.add('icon');
      ic.title = gearOf(id).name;
      return ic;
    });
    return h(`div.card.plate${right ? '.right' : ''}`, null,
      h('div.card-art', null, p.el),
      h('div', { style: { minWidth: '0' } },
        h('div.card-name', null, c.name),
        h('div.card-sub', null, `${SPECIES[c.look.species].name} · ${FORMS[c.form].name} · ${tag}`),
        h('div.card-gear', null, ...gear),
        h('div.card-btns', null, ...btns)),
    );
  }

  dispose(): void {
    for (const p of this.previews) p.dispose();
    this.previews = [];
  }
}
