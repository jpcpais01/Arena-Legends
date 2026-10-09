import { sfx } from '../audio/sfx';
import type { PlayerCharacter } from '../character/profile';
import { SPECIES } from '../character/appearance';
import { owns } from '../character/collection';
import { RARITY_INFO, setPieces, SKIN_SET_BY_ID, skinOn, skinsFor, type SkinDef, type SkinSetId } from '../character/skins';
import { iconCanvas } from '../render/icons';
import { gearIdsFor, gearOf, SLOT_NAMES } from '../sim/gear';
import { FORMS } from '../sim/forms';
import { withGear } from '../sim/loadout';
import type { GearId, GearSlot } from '../sim/types';
import { h } from './dom';
import { icon } from './icons';
import { Preview } from './preview';
import { modText, statDiff, statLines } from './stats';

export interface GearCallbacks {
  onChange(c: PlayerCharacter): void;
  onClose(): void;
  /** Opens the skin chests (from a locked skin). */
  onChests?(): void;
}

const SHORT: Record<GearSlot, string> = {
  main: 'Main', secondary: 'Second', special: 'Special', usable: 'Usable', head: 'Head', chest: 'Chest', legs: 'Legs', boots: 'Boots',
};
/** Paper-doll sides: what you hold and carry on the left, what you wear on the right. */
const LEFT: GearSlot[] = ['main', 'secondary', 'special', 'usable'];
const RIGHT: GearSlot[] = ['head', 'chest', 'legs', 'boots'];

function emptyIcon(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  c.className = 'icon';
  return c;
}

/**
 * Gear screen: the fighter stands big in the middle with the eight slots around
 * them like a paper doll; the items for the chosen slot are a grid of icons.
 * Tapping an item grows it in place into a 3x2 card with its text, skills,
 * stat changes and skins, and equips from there. Changes save at once (through `onChange`).
 */
export function gearSheet(start: PlayerCharacter, cb: GearCallbacks, opts: { forms?: boolean; title?: string } = {}): { el: HTMLElement; dispose(): void } {
  let c = start;
  let slot: GearSlot = 'main';
  /** The item whose card is open. */
  let open: GearId | null = null;
  /** Grid cell of the tile that was tapped open: the card grows around it. */
  let anchor = { col: 0, row: 0 };
  /** A locked skin tapped in the open card: its info shows until another pick. */
  let peek: SkinDef | null = null;

  const stageBox = h('div.stage-box');
  const preview = new Preview(c, 100, 90, { pedestal: true, fit: stageBox });
  preview.el.title = 'Tap for a move';
  stageBox.append(preview.el);
  const dollL = h('div.doll.l');
  const dollR = h('div.doll.r');
  const stats = h('div.stats-list');
  const statsBtn = h<HTMLButtonElement>('button.btn.sm.stats-btn', {
    'aria-pressed': 'false',
    onclick: () => {
      const on = stage.classList.toggle('show-stats');
      statsBtn.classList.toggle('on', on);
      statsBtn.setAttribute('aria-pressed', String(on));
      sfx.play('select');
    },
  }, icon('body'), 'Stats');
  const stage = h('section.scr-stage.doll-stage', null, stageBox, dollL, dollR, h('div.stage-tools', null, statsBtn), stats);

  const forms = h('div.field.forms-row');
  const slotHead = h('div.slot-head');
  const list = h('div.items');
  const panel = h('section.scr-panel.frame', null, opts.forms ? forms : null, slotHead, list);

  const skinOf = (id: GearId) => skinOn(c.skins, id);
  const iconOf = (id: GearId | null | undefined, px?: number) => {
    const ic = id ? iconCanvas(id, px, skinOf(id)?.id) : emptyIcon();
    ic.classList.add('icon');
    return ic;
  };

  function save(next: PlayerCharacter, move: boolean): void {
    c = next;
    sfx.play(move ? 'equip' : 'select');
    cb.onChange(c);
    preview.set(c);
    // A new usable item is shown being used; anything else plays a random move.
    const use = slot === 'usable' && c.gear.usable ? gearOf(c.gear.usable).abilities?.[0]?.anim : undefined;
    if (move) preview.showcase(use ? `use.${use}` : undefined);
    render();
  }

  function equip(id: GearId | null): void {
    if (c.gear[slot] === id || (!id && !c.gear[slot])) return;
    save({ ...c, ...withGear(c, slot, id) } as PlayerCharacter, !!id);
  }

  /** Picks a skin for an item (null = the plain item). Kept per item, even after swapping it out. */
  function wear(id: GearId, skin: SkinDef | null): void {
    if (skin && !owns(skin.id)) {
      peek = peek?.id === skin.id ? null : skin;
      sfx.play('select');
      render();
      return;
    }
    peek = null;
    if ((skinOf(id)?.id ?? null) === (skin?.id ?? null)) { render(); return; }
    const next = { ...c.skins };
    if (skin) next[id] = skin.id;
    else delete next[id];
    save({ ...c, skins: next }, c.gear[slot] === id);
  }

  /** Equips every piece of an epic set, each in its set skin. */
  function wearSet(set: SkinSetId): void {
    let next = c;
    const skins = { ...c.skins };
    for (const p of setPieces(set)) {
      next = { ...next, ...withGear(next, gearOf(p.gear).slot, p.gear) } as PlayerCharacter;
      skins[p.gear] = p.id;
    }
    save({ ...next, skins }, true);
  }

  /** Pieces of a set equipped and wearing their set skin. */
  const setWorn = (set: SkinSetId) => setPieces(set).filter((p) => c.gear[gearOf(p.gear).slot] === p.gear && c.skins?.[p.gear] === p.id).length;

  /** The info line under the skins: the picked skin, or for an epic one its set and how much of it is worn. */
  function skinInfo(cur: SkinDef | null, list: SkinDef[]): HTMLElement {
    if (peek && list.includes(peek)) {
      const set = peek.set ? SKIN_SET_BY_ID.get(peek.set)! : null;
      return h('div.sk-set', null,
        h('p.sk-info', null, h(`b.${peek.rarity}`, null, `${peek.name} · ${peek.rarity}`), ' ', h('span.sk-locked', null, 'Locked.'),
          ` Find it in a skin chest.${set ? ` Part of the ${set.name} set.` : ''}`),
        cb.onChests ? h('div.sk-set-row', null, h('button.btn.sm', { onclick: () => cb.onChests!() }, icon('chest'), 'Open chests')) : null);
    }
    const got = list.filter((sk) => owns(sk.id)).length;
    if (!cur) return h('p.sk-info', null, h('b', null, 'Default look'), ` ${got} of ${list.length} skin${list.length > 1 ? 's' : ''} unlocked. Looks only.`);
    if (!cur.set) return h('p.sk-info', null, h(`b.${cur.rarity}`, null, `${cur.name} · ${cur.rarity}`), ` ${RARITY_INFO[cur.rarity]}`);
    const set = SKIN_SET_BY_ID.get(cur.set)!;
    const worn = setWorn(set.id), all = setPieces(set.id).length;
    const have = setPieces(set.id).filter((p) => owns(p.id)).length;
    return h('div.sk-set', null,
      h('p.sk-info', null, h('b.epic', null, `${cur.name} · epic`), ` Part of the `, h('b.set', null, set.name), ` set. ${set.blurb}`),
      h('div.sk-set-row', null,
        h(`span.sk-pips${worn === all ? '.full' : ''}`, { title: `${worn} of ${all} pieces worn` }, ...setPieces(set.id).map((_, i) => h(`i${i < worn ? '.on' : ''}`))),
        h('small', null, worn === all ? 'Full set: aura on' : `${worn}/${all} worn. Wear all ${all} for its aura.`),
        worn < all && have === all ? h('button.btn.sm.ghost', { onclick: () => wearSet(set.id), title: 'Equips every item of the set, in their set skins' }, 'Equip set') : null,
        have < all ? h('small', null, `${have}/${all} owned`) : null));
  }

  function show(id: GearId | null, from?: Element): void {
    if (from) anchor = cellOf(from);
    open = open === id ? null : id;
    peek = null;
    sfx.play(open ? 'select' : 'back');
    render();
  }

  function pickSlot(s: GearSlot): void {
    if (s === slot) return;
    slot = s;
    open = null;
    sfx.play('select');
    panel.scrollTop = 0;
    render();
  }

  function slotBtn(s: GearSlot): HTMLElement {
    const id = c.gear[s];
    return h(`button.slot${s === slot ? '.on' : ''}${id ? '' : '.empty'}`, {
      title: id ? `${SLOT_NAMES[s]}: ${gearOf(id).name}` : SLOT_NAMES[s], 'aria-pressed': String(s === slot),
      onclick: () => pickSlot(s),
    }, h('span.sock', null, iconOf(id)), h('small', null, SHORT[s]));
  }

  function tile(id: GearId | null): HTMLElement {
    if (id && open === id) return card(id);
    const g = id ? gearOf(id) : null;
    const on = id ? c.gear[slot] === id : !c.gear[slot];
    return h(`button.itile.r-${g?.rarity ?? 'none'}${on ? '.on' : ''}`, {
      'aria-pressed': String(on), title: g ? g.name : 'Leave this slot empty',
      onclick: (e: MouseEvent) => (id ? show(id, e.currentTarget as Element) : equip(null)),
    }, h('span.sock', null, iconOf(id)), h('b', null, g ? g.name : 'None'));
  }

  /** The item grid's resolved tracks (px), read from the live layout. */
  function tracks(): { cols: number[]; rows: number[]; cg: number; rg: number } {
    const cs = getComputedStyle(list);
    const px = (v: string) => v.split(' ').map(parseFloat).filter((n) => !Number.isNaN(n));
    return { cols: px(cs.gridTemplateColumns), rows: px(cs.gridTemplateRows), cg: parseFloat(cs.columnGap) || 0, rg: parseFloat(cs.rowGap) || 0 };
  }

  /** Which column and row of the item grid an element sits in. */
  function cellOf(el: Element): { col: number; row: number } {
    const t = tracks();
    const lr = list.getBoundingClientRect(), r = el.getBoundingClientRect();
    const at = (sizes: number[], gap: number, off: number) => {
      let acc = 0;
      for (let i = 0; i < sizes.length; i++) {
        if (off < acc + sizes[i] + gap / 2) return i;
        acc += sizes[i] + gap;
      }
      return Math.max(0, sizes.length - 1);
    };
    return { col: at(t.cols, t.cg, r.left - lr.left + 1), row: at(t.rows, t.rg, r.top - lr.top + 1) };
  }

  /**
   * Places the open card 3 columns wide and 2 rows tall from the tapped tile's
   * row: centred on its column, or growing inward from the first/last column.
   */
  function place(el: HTMLElement): void {
    const n = tracks().cols.length;
    if (n < 3) { el.style.gridColumn = '1 / -1'; el.style.gridRow = `${anchor.row + 1} / span 2`; return; }
    const start = Math.min(Math.max(anchor.col - 1, 0), n - 3);
    el.style.gridColumn = `${start + 1} / span 3`;
    el.style.gridRow = `${anchor.row + 1} / span 2`;
  }

  /** The open item: grows in place to 3x2 cells with its text, stat changes, skins and Equip. */
  function card(id: GearId): HTMLElement {
    const g = gearOf(id);
    const on = c.gear[slot] === id;
    const abil = [...(g.abilities ?? []), ...(g.evade ? [g.evade] : [])];
    // Not equipped: what would change. Equipped: the item's own stats.
    const diff = on ? [] : statDiff(c.form, c.gear, withGear(c, slot, id).gear);
    const mods = on ? modText(g.add, g.mul) : '';
    const skins = skinsFor(id);
    const cur = skinOf(id);
    const chip = (sk: SkinDef | null) => {
      const ic = iconCanvas(id, 40, sk?.id);
      ic.className = 'icon';
      const sel = (cur?.id ?? null) === (sk?.id ?? null);
      const locked = !!sk && !owns(sk.id);
      return h(`button.sk.${sk ? sk.rarity : 'plain'}${sel ? '.on' : ''}${locked ? '.locked' : ''}`, {
        title: sk ? `${sk.name} (${sk.rarity}${sk.set ? `, ${SKIN_SET_BY_ID.get(sk.set)!.name} set` : ''})${locked ? ', locked' : ''}: ${RARITY_INFO[sk.rarity]}` : 'Default: the plain item',
        'aria-label': sk ? `${sk.name}${locked ? ' (locked)' : ''}` : 'Default', 'aria-pressed': String(sel),
        onclick: () => wear(id, sk),
      }, ic, locked ? icon('lock', 'sk-lock') : null);
    };
    const hands = g.weapon ? `${g.weapon.hands === 2 ? '2' : '1'}-handed${g.weapon.ranged ? ', ranged' : ''}` : '';
    // Tapping the card again closes it; its own buttons (skins, Equip) keep their job.
    const el = h(`div.icard.r-${g.rarity}${on ? '.on' : ''}`, {
      role: 'group', 'aria-label': g.name,
      onclick: (e: MouseEvent) => { if (!(e.target as Element).closest('button')) show(id); },
    },
      h('div.icard-head', null,
        h('span.sock', null, iconOf(id)),
        h('div.icard-title', null,
          h('b', null, g.name),
          h('small', null, h(`span.r-${g.rarity}`, null, g.rarity), hands ? ` · ${hands}` : '', g.passive ? ` · Passive: ${g.passive}` : ''))),
      h('div.icard-body', null,
        h('p.desc', null, g.desc),
        ...abil.map((a) => h('p.ab', null, h('i', null, a.name),
          a.slot !== 'basic' && a.cooldown ? h('small', null, a.uses ? ` ${a.uses} uses · ${a.cooldown}s` : ` ${a.cooldown}s`) : '', a.desc ? ` ${a.desc}` : '')),
        diff.length ? h('div.diff', null, ...diff) : null,
        mods ? h('p.mods', null, mods) : null),
      skins.length ? h('div.icard-skins', null,
        h('div.sk-row', null, icon('star'), chip(null), ...skins.map(chip)),
        skinInfo(cur, skins)) : null,
      h('div.icard-foot', null,
        on
          ? (slot !== 'main' ? h('button.btn.sm.ghost', { onclick: () => equip(null) }, 'Unequip') : h('span.eq', null, icon('check'), 'Equipped'))
          : h('button.btn.sm.primary', { onclick: () => equip(id) }, 'Equip')),
    );
    place(el);
    requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    return el;
  }

  function render(): void {
    if (opts.forms) {
      forms.replaceChildren(h('div.label', null, icon('body'), 'Body form'),
        h('div.opts', null, ...SPECIES[c.look.species].forms.map((id) => h(`button.opt${id === c.form ? '.on' : ''}`, {
          title: FORMS[id].blurb,
          onclick: () => { if (id !== c.form) save({ ...c, form: id }, false); },
        }, FORMS[id].name))));
    }
    dollL.replaceChildren(...LEFT.map(slotBtn));
    dollR.replaceChildren(...RIGHT.map(slotBtn));
    slotHead.replaceChildren(h('div.ribbon', null, h('span', null, SLOT_NAMES[slot])), h('p', null, SLOT_INFO[slot]));
    const ids = gearIdsFor(slot) as GearId[];
    list.replaceChildren(...(slot === 'main' ? [] : [tile(null)]), ...ids.map(tile));
    stats.replaceChildren(...statLines(c.form, c.gear));
  }

  render();
  const close = () => { sfx.play('back'); cb.onClose(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (open) show(open);
    else close();
  };
  window.addEventListener('keydown', onKey);
  // The column count changes with the window: keep an open card inside the grid.
  const onResize = () => { const card = list.querySelector<HTMLElement>('.icard'); if (card) place(card); };
  window.addEventListener('resize', onResize);
  const el = h('div.scr.gear', { role: 'dialog', 'aria-label': opts.title ?? 'Armory' },
    h('header.scr-head', null,
      h('div.scr-title', null, h('h1', null, opts.title ?? 'Armory')),
      h('div.grow'),
      h('button.btn.primary.done', { onclick: close }, icon('check'), 'Done')),
    stage, panel,
  );
  return { el, dispose: () => { preview.dispose(); window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); } };
}

const SLOT_INFO: Record<GearSlot, string> = {
  main: 'Basic attack, weapon skill and fighting distance. One- or two-handed.',
  secondary: 'A one-handed weapon or tool with one more skill. A two-handed main goes on the back while it is used.',
  special: 'Works on its own: auras, a familiar, or an attack the item makes by itself.',
  usable: 'A potion or bomb on the belt, used a few times per battle. The free hand grabs it.',
  head: 'Passives and stats.',
  chest: 'Passives and stats; some grant a defensive skill.',
  legs: 'Armour for the legs: stats, and sometimes a passive.',
  boots: 'Movement, and the evade itself.',
};
