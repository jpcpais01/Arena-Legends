import { DEFAULT_LOOK, SPECIES } from '../character/appearance';
import type { PlayerCharacter } from '../character/profile';
import { skinOn } from '../character/skins';
import { applyBackdrop, BH, BW } from '../render/backdrops';
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
  /** Account button (only when accounts are switched on). */
  onAccount?(): void;
}

export interface Record { w: number; l: number }

/** Art-pixel box of the little fighters on the cards. */
export const CARD_ART: [number, number] = [64, 64];

/**
 * Main menu over the background duel, kept out of the fight's way: a slim
 * nameplate in each top corner with the fighter and their gear, the logo
 * between them, sound and settings in the bottom-left corner and every action
 * grouped in the bottom-right one. The middle of the screen stays the duel's.
 */
export class Menu {
  readonly el: HTMLElement;
  private previews: Preview[] = [];
  private soundBtn: HTMLButtonElement;
  private you = h('div.home-slot.you');
  private rival = h('div.home-slot.rival');
  private chestBtn: HTMLButtonElement;

  constructor(cb: MenuCallbacks) {
    this.chestBtn = h<HTMLButtonElement>('button.btn.chest-btn.go', { title: 'Skin chests', onclick: () => cb.onChests() });
    this.soundBtn = h<HTMLButtonElement>('button.btn.icon.sm', { title: 'Sound', 'aria-label': 'Sound', onclick: () => cb.onSound() });
    const mark = h('div.menu-logo.home-logo', { 'aria-label': 'Arena Legends' });
    void logo().then((c) => { mark.append(c); fitPixels(c, mark); });
    const side = (ic: Parameters<typeof icon>[0], label: string, fn: () => void) =>
      h('button.btn.sm.home-side', { title: label, onclick: fn }, icon(ic), h('span', null, label));
    this.el = h('div.menu.home', null,
      h('div.home-top', null, this.you, mark, this.rival),
      h('div.home-tools', null,
        cb.onAccount && h('button.btn.icon.sm', { title: 'Account', 'aria-label': 'Account', onclick: () => cb.onAccount!() }, icon('user')),
        this.soundBtn,
        h('button.btn.icon.sm', { title: 'Settings', 'aria-label': 'Settings', onclick: () => cb.onSettings() }, icon('settings'))),
      h('div.home-actions', null,
        h('div.home-row', null, this.chestBtn),
        h('div.home-row', null,
          side('bag', 'Armory', () => cb.onGear()),
          side('edit', 'Hero', () => cb.onEditLook()),
          side('dice', 'Rival', () => cb.onNewRival())),
        h('div.home-row', null,
          h('button.btn.home-online', { title: 'Online duel', onclick: () => cb.onOnline() }, icon('globe'), h('span', null, 'Online')),
          h('button.btn.primary.big.fight', { onclick: () => cb.onFight() }, icon('swords'), h('span', null, 'Fight')))),
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
    const a = new Preview(player, ...PLATE_ART, { autoplay: true, ground: -18 });
    const b = new Preview(rival, ...PLATE_ART, { autoplay: true, flip: true, ground: -18 });
    this.previews = [a, b];
    this.you.replaceChildren(this.plate(player, a, 0, 'You', `${rec.w}W ${rec.l}L`));
    this.rival.replaceChildren(this.plate(rival, b, 1, 'Rival', ''));
  }

  /** A nameplate: the fighter's portrait over name, species and form, beside their gear two to a row. */
  private plate(c: CharacterBuild, p: Preview, side: 0 | 1, tag: string, extra: string): HTMLElement {
    const look = c.look ?? DEFAULT_LOOK;
    const art = h('div.plate-art', null, p.el);
    applyBackdrop(art, look.backdrop);
    p.fitTo(art);
    return h(`div.nplate${side ? '.rival' : '.you'}`, null,
      art,
      h('div.plate-info', null,
        h('div.plate-tag', null, h('span.side-tag', null, tag), extra ? h('span.rec', null, extra) : null),
        h('div.plate-name', null, c.name),
        h('div.plate-sub', null, `${SPECIES[look.species].name} · ${FORMS[c.form].name}`)),
      h('div.plate-gear', null, ...gearIcons(c).map((g) => h('span.sock', null, g))));
  }

  dispose(): void {
    for (const p of this.previews) p.dispose();
    this.previews = [];
  }
}

/** Art-pixel box of the fighter portraits on the menu nameplates (head and shoulders). */
const PLATE_ART: [number, number] = [BW, BH];

/** Icons for every gear slot in order, skins applied; empty slots are blank. */
function gearIcons(c: CharacterBuild): HTMLElement[] {
  return GEAR_SLOTS.map((slot) => {
    const id = c.gear[slot];
    if (!id) return h('i', { title: `${SLOT_NAMES[slot]}: empty` });
    const skin = skinOn(c.skins, id);
    const ic = iconCanvas(id, undefined, skin?.id);
    ic.classList.add('icon');
    ic.title = skin ? `${gearOf(id).name} · ${skin.name}` : gearOf(id).name;
    return ic;
  });
}

/**
 * A fighter's card: the fighter on a little stage, a corner tag, name,
 * species and form, the six gear slots and the card's buttons.
 * Side 0 is the blue corner (left), side 1 the red one (right, mirrored).
 */
export function fighterCard(c: CharacterBuild, p: Preview, side: 0 | 1, tag: string, extra: string, btns: HTMLElement[]): HTMLElement {
  const gear = gearIcons(c);
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
