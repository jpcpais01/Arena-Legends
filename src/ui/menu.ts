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
import { levelBadge } from './xp';

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
  /** Friends button (only when accounts are switched on). */
  onFriends?(): void;
  /** Leaderboard button (only when accounts are switched on). */
  onLeaderboard?(): void;
  /** The world map, where the tournaments are. */
  onWorld(): void;
}

export interface Record { w: number; l: number }

/** Art-pixel box of the little fighters on the cards. */
export const CARD_ART: [number, number] = [64, 64];

/**
 * Main menu over the background duel, kept out of the fight's way: a slim
 * nameplate in each top corner with the fighter and their gear (a dice on the
 * rival's draws a new one), the logo between them, and along the bottom a
 * rampart: the Fight crest in the middle rising over the wall, Hero and Armory
 * on its left, Online and World on its right, the Shop at the right end and the
 * small tools (account, friends, leaderboard, sound, settings, notes) at the
 * left end. The middle of the screen stays the duel's.
 */
export class Menu {
  readonly el: HTMLElement;
  private previews: Preview[] = [];
  private soundBtn: HTMLButtonElement;
  private you = h('div.home-slot.you');
  private rival = h('div.home-slot.rival');
  private chestBtn: HTMLButtonElement;
  private friendsBtn: HTMLButtonElement | null = null;
  private heroBtn: HTMLButtonElement;
  private worldBtn: HTMLButtonElement;
  private rivalBtn: HTMLButtonElement;
  private vsLabel = h('small.fight-vs');
  private toolsBox: HTMLElement;

  constructor(cb: MenuCallbacks) {
    this.chestBtn = h<HTMLButtonElement>('button.dock-shop', { title: 'Shop', onclick: () => cb.onChests() });
    this.soundBtn = h<HTMLButtonElement>('button.btn.icon.sm', { title: 'Sound', 'aria-label': 'Sound', onclick: () => cb.onSound() });
    const mark = h('div.menu-logo.home-logo', { 'aria-label': 'Arena Legends' });
    void logo().then((c) => { mark.append(c); fitPixels(c, mark); });
    if (cb.onFriends) this.friendsBtn = h<HTMLButtonElement>('button.btn.icon.sm', { title: 'Friends', 'aria-label': 'Friends', onclick: () => cb.onFriends!() }, icon('friends'));
    const tile = (cls: string, ic: Parameters<typeof icon>[0], label: string, fn: () => void, title = label) =>
      h<HTMLButtonElement>(`button.dock-tile.${cls}`, { title, onclick: fn }, h('span.dt-ic', null, icon(ic)), h('span.dt-label', null, label));
    this.heroBtn = tile('t-hero', 'crown', 'Hero', () => cb.onEditLook());
    this.worldBtn = tile('t-world', 'map', 'World', () => cb.onWorld(), 'World map');
    this.rivalBtn = h<HTMLButtonElement>('button.btn.icon.sm.rival-roll', { title: 'New rival', 'aria-label': 'New rival', onclick: () => cb.onNewRival() }, icon('dice'));
    this.toolsBox = h('div.dock-tools', null,
      h('div.dock-tool-row', null,
        cb.onAccount && h('button.btn.icon.sm', { title: 'Account', 'aria-label': 'Account', onclick: () => cb.onAccount!() }, icon('user')),
        this.friendsBtn,
        cb.onLeaderboard && h('button.btn.icon.sm', { title: 'Leaderboard', 'aria-label': 'Leaderboard', onclick: () => cb.onLeaderboard!() }, icon('podium')),
        this.soundBtn,
        h('button.btn.icon.sm', { title: 'Settings', 'aria-label': 'Settings', onclick: () => cb.onSettings() }, icon('settings'))));
    const fight = h<HTMLButtonElement>('button.dock-fight', { title: 'Fight', onclick: () => cb.onFight() },
      h('span.df-shine'),
      h('span.df-main', null, icon('swords'), h('b', null, 'Fight')),
      this.vsLabel);
    this.el = h('div.menu.home', null,
      h('div.home-top', null, this.you, mark, this.rival),
      h('nav.home-dock', { 'aria-label': 'Main menu' },
        h('div.dock-wall'),
        this.toolsBox,
        h('div.dock-wing.l', null, this.heroBtn, tile('t-armory', 'shield', 'Armory', () => cb.onGear())),
        fight,
        h('div.dock-wing.r', null, tile('t-online', 'globe', 'Online', () => cb.onOnline(), 'Online duel'), this.worldBtn),
        h('div.dock-end', null, this.chestBtn)),
    );
  }

  /** The version line (notes and update buttons) sits with the small tools. */
  dockVersion(badge: HTMLElement): void {
    this.toolsBox.append(badge);
  }

  setSound(on: boolean): void {
    this.soundBtn.replaceChildren(icon(on ? 'soundOn' : 'soundOff'));
    this.soundBtn.title = on ? 'Sound on' : 'Sound off';
  }

  /** The chest button shows the gems, with a dot when a chest can be opened. */
  setGems(n: number, canOpen: boolean): void {
    this.chestBtn.replaceChildren(h('span.ds-ic', null, icon('shop')), h('span.ds-text', null, h('b', null, 'Shop'), gemTag(n)));
    this.chestBtn.classList.toggle('unseen', canOpen);
  }

  /** A dot on the friends button while friend requests are waiting. */
  setFriendRequests(n: number): void {
    this.friendsBtn?.classList.toggle('unseen', n > 0);
    if (this.friendsBtn) this.friendsBtn.title = n > 0 ? `Friends (${n} new request${n > 1 ? 's' : ''})` : 'Friends';
  }

  /** A dot on Hero while there are stat points to spend. */
  setPoints(n: number): void {
    this.heroBtn.classList.toggle('unseen', n > 0);
    this.heroBtn.title = n > 0 ? `Hero (${n} stat point${n > 1 ? 's' : ''} to spend)` : 'Hero';
  }

  /** The World button says which round a running tournament is at. */
  setLive(round: string | null): void {
    this.worldBtn.replaceChildren(h('span.dt-ic', null, icon('map')), h('span.dt-label', null, round ?? 'World'));
    this.worldBtn.classList.toggle('live', !!round);
    this.worldBtn.title = round ? `World map (your tournament: ${round})` : 'World map';
  }

  set(player: PlayerCharacter, rival: PlayerCharacter, rec: Record): void {
    this.dispose();
    const a = new Preview(player, ...PLATE_ART, { autoplay: true, ground: -18 });
    const b = new Preview(rival, ...PLATE_ART, { autoplay: true, flip: true, ground: -18 });
    this.previews = [a, b];
    this.you.replaceChildren(this.plate(player, a, 0, 'You', `${rec.w}W ${rec.l}L`));
    const rp = this.plate(rival, b, 1, 'Rival', '');
    rp.append(this.rivalBtn);
    this.rival.replaceChildren(rp);
    this.vsLabel.textContent = `vs ${rival.name}`;
  }

  /** A nameplate: the fighter's portrait over name, species and form, beside their gear two to a row. */
  private plate(c: CharacterBuild, p: Preview, side: 0 | 1, tag: string, extra: string): HTMLElement {
    const look = c.look ?? DEFAULT_LOOK;
    const art = h('div.plate-art', null, p.el, levelBadge(c.level ?? 1, 'on-art'));
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
export function gearIcons(c: CharacterBuild): HTMLElement[] {
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
