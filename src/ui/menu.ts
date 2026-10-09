import { DEFAULT_LOOK, SPECIES } from '../character/appearance';
import type { PlayerCharacter } from '../character/profile';
import { skinOn } from '../character/skins';
import { iconCanvas } from '../render/icons';
import { FORMS } from '../sim/forms';
import { GEAR_SLOTS, gearOf, SLOT_NAMES } from '../sim/gear';
import type { CharacterBuild } from '../sim/loadout';
import { h } from './dom';
import { gemTag } from './gacha';
import { icon } from './icons';
import { logo } from './logo';
import { fitPixels } from './pixelfit';
import { Preview } from './preview';

export interface MenuCallbacks {
  onFight(): void;
  onEditLook(): void;
  onGear(): void;
  onNewRival(): void;
  onSound(): void;
  onSettings(): void;
  onOnline(): void;
  onChests(): void;
}

export interface Record { w: number; l: number }

/** Art-pixel box of the little fighters on the cards. */
export const CARD_ART: [number, number] = [64, 64];

/**
 * Main menu over the background duel: the logo and tools on top, and a dock
 * along the bottom with your fighter, VS with Fight and Online, and the rival.
 */
export class Menu {
  readonly el: HTMLElement;
  private previews: Preview[] = [];
  private soundBtn: HTMLButtonElement;
  private dock = h('div.menu-dock');
  private actions: HTMLElement;
  private chestBtn: HTMLButtonElement;

  constructor(private readonly cb: MenuCallbacks) {
    this.soundBtn = h<HTMLButtonElement>('button.btn.icon', { title: 'Sound', 'aria-label': 'Sound', onclick: () => cb.onSound() });
    this.actions = h('div.menu-actions', null,
      h('div.vs', { 'aria-hidden': 'true' }, 'VS'),
      h('button.btn.primary.big.fight', { onclick: () => cb.onFight() }, icon('swords'), h('span', null, 'Fight')),
      h('button.btn.online', { onclick: () => cb.onOnline() }, icon('globe'), 'Online duel'));
    this.chestBtn = h<HTMLButtonElement>('button.btn.chest-btn', { title: 'Skin chests', onclick: () => cb.onChests() });
    const mark = h('div.menu-logo', { 'aria-label': 'Arena Legends' });
    void logo().then((c) => { mark.append(c); fitPixels(c, mark); });
    this.el = h('div.menu', null,
      h('div.menu-top', null,
        mark,
        h('div.menu-tools', null, this.chestBtn, this.soundBtn,
          h('button.btn.icon', { title: 'Settings', 'aria-label': 'Settings', onclick: () => cb.onSettings() }, icon('settings')))),
      this.dock,
    );
  }

  setSound(on: boolean): void {
    this.soundBtn.replaceChildren(icon(on ? 'soundOn' : 'soundOff'));
    this.soundBtn.title = on ? 'Sound on' : 'Sound off';
  }

  /** The chest button shows the gems, with a dot when a chest can be opened. */
  setGems(n: number, canOpen: boolean): void {
    this.chestBtn.replaceChildren(icon('chest'), h('span', null, 'Chests'), gemTag(n));
    this.chestBtn.classList.toggle('unseen', canOpen);
  }

  set(player: PlayerCharacter, rival: PlayerCharacter, rec: Record): void {
    this.dispose();
    const a = new Preview(player, ...CARD_ART, { autoplay: true, ground: 3 });
    const b = new Preview(rival, ...CARD_ART, { autoplay: true, flip: true, ground: 3 });
    this.previews = [a, b];
    this.dock.replaceChildren(
      fighterCard(player, a, 0, 'You', `${rec.w}W ${rec.l}L`, [
        h('button.btn.sm', { onclick: () => this.cb.onGear() }, icon('bag'), 'Armory'),
        h('button.btn.sm', { onclick: () => this.cb.onEditLook() }, icon('edit'), 'Hero'),
      ]),
      this.actions,
      fighterCard(rival, b, 1, 'Rival', '', [
        h('button.btn.sm', { onclick: () => this.cb.onNewRival() }, icon('dice'), 'New rival'),
      ]),
    );
  }

  dispose(): void {
    for (const p of this.previews) p.dispose();
    this.previews = [];
  }
}

/**
 * A fighter's card: the fighter on a little stage, a corner tag, name,
 * species and form, the six gear slots and the card's buttons.
 * Side 0 is the blue corner (left), side 1 the red one (right, mirrored).
 */
export function fighterCard(c: CharacterBuild, p: Preview, side: 0 | 1, tag: string, extra: string, btns: HTMLElement[]): HTMLElement {
  const gear = GEAR_SLOTS.map((slot) => {
    const id = c.gear[slot];
    if (!id) return h('i', { title: `${SLOT_NAMES[slot]}: empty` });
    const skin = skinOn(c.skins, id);
    const ic = iconCanvas(id, undefined, skin?.id);
    ic.classList.add('icon');
    ic.title = skin ? `${gearOf(id).name} · ${skin.name}` : gearOf(id).name;
    return ic;
  });
  const look = c.look ?? DEFAULT_LOOK;
  const art = h('div.fcard-art', null, p.el);
  p.fitTo(art);
  return h(`div.fcard${side ? '.rival' : '.you'}`, null,
    art,
    h('div.fcard-info', null,
      h('div.fcard-tag', null, h('span.side-tag', null, tag), extra ? h('span.rec', null, extra) : null),
      h('div.fcard-name', null, c.name),
      h('div.fcard-sub', null, `${SPECIES[look.species].name} · ${FORMS[c.form].name}`),
      h('div.fcard-gear', null, ...gear.map((g) => h('span.sock', null, g)))),
    btns.length ? h('div.fcard-btns', null, ...btns) : null,
  );
}
