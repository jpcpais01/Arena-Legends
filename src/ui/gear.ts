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
import { confirmBox } from './confirm';
import { h } from './dom';
import { icon } from './icons';
import { Preview } from './preview';
import { modText, statCompare, statLines } from './stats';

export interface GearCallbacks {
  onChange(c: PlayerCharacter): void;
  onClose(): void;
  /** Opens the skin chests (from a locked skin). */
  onChests?(): void;
}

type Tab = 'stats' | 'skins';

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
 * Tapping an item opens the inspector over the list (stats, skills, skins,
 * Equip) while the fighter tries it on. Changes save at once (through `onChange`).
 */
export function gearSheet(start: PlayerCharacter, cb: GearCallbacks, opts: { forms?: boolean; title?: string } = {}): { el: HTMLElement; dispose(): void } {
  let c = start;
  let slot: GearSlot = 'main';
  /** The item being inspected. */
  let open: GearId | null = null;
  /** The inspector's tab (kept while browsing items). */
  let tab: Tab = 'stats';
  /** The inspector body's scroll, kept across re-renders (picking a skin redraws it). */
  let bodyScroll = 0;
  /** A locked skin tapped in the inspector: tried on the fighter until another pick. */
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
  const tryTag = h('div.try-tag', { hidden: true }, icon('eye'), 'Preview');
  const stage = h('section.scr-stage.doll-stage', null, stageBox, dollL, dollR, h('div.stage-tools', null, statsBtn), tryTag, stats);
  const inspect = h('div.inspect-area');

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

  /** Earlier and undone builds for Undo/Redo (gear, skins and body form changed here). */
  const undos: PlayerCharacter[] = [];
  const redos: PlayerCharacter[] = [];
  const undoBtn = h<HTMLButtonElement>('button.btn.icon.sm.hist', { title: 'Undo', 'aria-label': 'Undo', onclick: () => travel(undos, redos) }, icon('undo'));
  const redoBtn = h<HTMLButtonElement>('button.btn.icon.sm.hist', { title: 'Redo', 'aria-label': 'Redo', onclick: () => travel(redos, undos) }, icon('redo'));
  /** Puts every item back to its plain look (one Undo brings the skins back). */
  const plainBtn = h<HTMLButtonElement>('button.btn.sm.hist.plain', {
    title: 'Unequip all skins', 'aria-label': 'Unequip all skins',
    onclick: () => { if (Object.keys(c.skins ?? {}).length) { peek = null; save({ ...c, skins: {} }, false); } },
  }, icon('star'), 'No skins');

  /** Steps back (or forward) one change: the current build goes on the other stack. */
  function travel(from: PlayerCharacter[], to: PlayerCharacter[]): void {
    const prev = from.pop();
    if (!prev) return;
    to.push(c);
    c = prev;
    peek = null;
    sfx.play('equip');
    cb.onChange(c);
    render();
  }

  function save(next: PlayerCharacter, move: boolean): void {
    undos.push(c);
    if (undos.length > 50) undos.shift();
    redos.length = 0;
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
        cb.onChests ? h('div.sk-set-row', null, h('button.btn.sm', { onclick: () => cb.onChests!() }, icon('shop'), 'Shop')) : null);
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
        worn < all && have === all ? h('button.btn.sm.ghost', { onclick: () => confirmBox(root, 'Equip set?', `Swap your items for the ${set.name} pieces and wear their set skins? Undo brings your build back.`, 'Equip set', () => wearSet(set.id), 'bag'), title: 'Equips every item of the set, in their set skins' }, 'Equip set') : null,
        have < all ? h('small', null, `${have}/${all} owned`) : null));
  }

  function show(id: GearId | null): void {
    if (id && id !== open) bodyScroll = 0;
    open = open === id ? null : id;
    peek = null;
    sfx.play(open ? 'select' : 'back');
    render();
  }

  /** Steps to the previous or next item of the slot while inspecting. */
  function step(d: number): void {
    if (!open) return;
    const ids = gearIdsFor(slot) as GearId[];
    const i = ids.indexOf(open);
    open = ids[(i + d + ids.length) % ids.length];
    peek = null;
    bodyScroll = 0;
    sfx.play('select');
    render();
  }

  function pickSlot(s: GearSlot): void {
    if (s === slot) return;
    slot = s;
    open = null;
    peek = null;
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
    const g = id ? gearOf(id) : null;
    const on = id ? c.gear[slot] === id : !c.gear[slot];
    return h(`button.itile.r-${g?.rarity ?? 'none'}${on ? '.on' : ''}`, {
      'aria-pressed': String(on), title: g ? g.name : 'Leave this slot empty',
      onclick: () => (id ? show(id) : equip(null)),
    }, h('span.sock', null, iconOf(id)), h('b', null, g ? g.name : 'None'));
  }

  /**
   * The item inspector: covers the item list while the fighter stays in view
   * wearing what is looked at. A head with the item (arrows step through the
   * slot), Stats and Skins tabs, and Equip at the bottom.
   */
  function inspector(id: GearId): HTMLElement {
    const g = gearOf(id);
    const on = c.gear[slot] === id;
    const skins = skinsFor(id);
    const cur = skinOf(id);
    const shown = peek ?? cur;
    if (tab === 'skins' && !skins.length) tab = 'stats';
    const big = iconCanvas(id, 64, shown?.id);
    big.className = 'icon';
    const hands = g.weapon ? `${g.weapon.hands === 2 ? '2' : '1'}-handed${g.weapon.ranged ? ' · ranged' : ''}` : SLOT_NAMES[slot];
    const many = (gearIdsFor(slot) as GearId[]).length > 1;
    const arrow = (d: number) => h('button.btn.icon.sm.ins-arrow', { title: d < 0 ? 'Previous item' : 'Next item', 'aria-label': d < 0 ? 'Previous item' : 'Next item', onclick: () => step(d) }, icon(d < 0 ? 'back' : 'next'));
    const tabBtn = (t: Tab, label: string, ic: Parameters<typeof icon>[0], extra?: string) =>
      h(`button.ins-tab${tab === t ? '.on' : ''}`, { role: 'tab', 'aria-selected': String(tab === t), onclick: () => { if (tab !== t) { tab = t; bodyScroll = 0; sfx.play('select'); render(); } } },
        icon(ic), label, extra ? h('small', null, extra) : null);
    const got = skins.filter((sk) => owns(sk.id)).length;

    let body: HTMLElement[];
    if (tab === 'stats') {
      // Equipped: what the item gives (against the slot left empty). Not equipped: what would change.
      const from = on ? (slot === 'main' ? c.gear : withGear(c, slot, null).gear) : c.gear;
      const to = on ? c.gear : withGear(c, slot, id).gear;
      const abil = [...(g.abilities ?? []), ...(g.evade ? [g.evade] : [])];
      const mods = modText(g.add, g.mul);
      body = [
        h('div.ins-sub', null, on ? 'Your stats with it' : 'If you equip it'),
        h('div.ins-stats', null, ...statCompare(c.form, from, to, c.train)),
        mods ? h('p.ins-mods', null, mods) : null,
        abil.length || g.passive ? h('div.ins-sub', null, 'Skills') : null,
        ...abil.map((a) => h('div.ins-ab', null,
          h('div.ins-ab-head', null, h('b', null, a.name),
            h('small', null, a.slot === 'basic' ? 'Basic' : a.uses ? `${a.uses} uses` : a.cooldown ? `${a.cooldown}s` : '')),
          a.desc ? h('p', null, a.desc) : null)),
        g.passive ? h('div.ins-ab.passive', null, h('div.ins-ab-head', null, h('b', null, 'Passive')), h('p', null, g.passive)) : null,
        h('p.ins-desc', null, g.desc),
      ].filter(Boolean) as HTMLElement[];
    } else {
      const cell = (sk: SkinDef | null) => {
        const ic = iconCanvas(id, 40, sk?.id);
        ic.className = 'icon';
        const sel = (cur?.id ?? null) === (sk?.id ?? null);
        const locked = !!sk && !owns(sk.id);
        const trying = !!sk && peek?.id === sk.id;
        return h(`button.skc.${sk ? sk.rarity : 'plain'}${sel ? '.on' : ''}${locked ? '.locked' : ''}${trying ? '.try' : ''}`, {
          title: sk ? `${sk.name} (${sk.rarity}${sk.set ? `, ${SKIN_SET_BY_ID.get(sk.set)!.name} set` : ''})${locked ? ', locked: tap to try it on' : ''}` : 'Default: the plain item',
          'aria-label': sk ? `${sk.name}${locked ? ' (locked)' : ''}` : 'Default', 'aria-pressed': String(sel),
          onclick: () => wear(id, sk),
        }, h('span.skc-ic', null, ic, locked ? icon('lock', 'sk-lock') : null), h('small', null, sk ? sk.name : 'Default'));
      };
      body = [h('div.skc-grid', null, cell(null), ...skins.map(cell))];
    }

    const foot = on
      ? h('div.ins-foot', null, h('span.eq', null, icon('check'), 'Equipped'),
        slot !== 'main' ? h('button.btn.sm.ghost', { onclick: () => equip(null) }, 'Unequip') : null)
      : h('div.ins-foot', null, h('button.btn.primary.ins-equip', { onclick: () => equip(id) }, icon('check'), 'Equip'));

    const scroller = h('div.ins-body', { role: 'tabpanel' }, ...body);
    scroller.addEventListener('scroll', () => { bodyScroll = scroller.scrollTop; }, { passive: true });
    requestAnimationFrame(() => { scroller.scrollTop = bodyScroll; });
    return h(`section.inspect.frame.r-${g.rarity}${on ? '.on' : ''}`, { role: 'dialog', 'aria-label': g.name },
      h('div.ins-head', null,
        many ? arrow(-1) : null,
        h(`span.sock.ins-sock${shown ? `.sk-${shown.rarity}` : ''}`, null, big),
        many ? arrow(1) : null,
        h('div.ins-title', null,
          h('b', null, g.name),
          h('small', null, h(`span.r-${g.rarity}`, null, g.rarity), ` · ${hands}`),
          shown ? h(`small.ins-skin.${shown.rarity}`, null, icon('star'), shown.name) : null),
        h('button.btn.icon.sm.ins-close', { title: 'Back to the items', 'aria-label': 'Close', onclick: () => show(open) }, icon('close'))),
      skins.length ? h('div.ins-tabs', { role: 'tablist' },
        tabBtn('stats', 'Stats', 'body'),
        tabBtn('skins', 'Skins', 'star', `${got}/${skins.length}`)) : null,
      scroller,
      tab === 'skins' ? h('div.ins-skin-info', null, skinInfo(cur, skins)) : null,
      foot);
  }

  /** What the stage shows: the saved fighter, or the inspected item (and a tried-on skin) on them. */
  let shownKey = '';
  function syncPreview(): void {
    let b: PlayerCharacter = c;
    if (open) {
      b = { ...c, ...withGear(c, slot, open) } as PlayerCharacter;
      if (peek) b = { ...b, skins: { ...c.skins, [open]: peek.id } };
    }
    const key = JSON.stringify([b.form, b.gear, b.skins]);
    const trying = b !== c && key !== JSON.stringify([c.form, c.gear, c.skins]);
    tryTag.hidden = !trying;
    if (key === shownKey) return;
    const fresh = shownKey !== '';
    shownKey = key;
    preview.set(b);
    if (fresh && trying) preview.showcase(slot === 'usable' && open ? (gearOf(open).abilities?.[0]?.anim ? `use.${gearOf(open).abilities![0].anim}` : undefined) : undefined);
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
    stats.replaceChildren(...statLines(c.form, c.gear, c.train));
    undoBtn.disabled = !undos.length;
    redoBtn.disabled = !redos.length;
    plainBtn.disabled = !Object.keys(c.skins ?? {}).length;
    root.classList.toggle('inspecting', !!open);
    inspect.replaceChildren(...(open ? [inspector(open)] : []));
    syncPreview();
  }

  const close = () => { sfx.play('back'); cb.onClose(); };
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) travel(redos, undos);
      else travel(undos, redos);
    } else if (e.key === 'Escape') { if (open) show(open); else close(); }
    else if (open && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) step(e.key === 'ArrowLeft' ? -1 : 1);
  };
  window.addEventListener('keydown', onKey);
  const root = h('div.scr.gear', { role: 'dialog', 'aria-label': opts.title ?? 'Armory' },
    h('header.scr-head', null,
      h('div.scr-title', null, h('h1', null, opts.title ?? 'Armory')),
      h('div.grow'),
      h('div.hist-btns', null, plainBtn, undoBtn, redoBtn),
      h('button.btn.primary.done', { onclick: close }, icon('check'), 'Done')),
    stage, panel, inspect,
  );
  render();
  return { el: root, dispose: () => { preview.dispose(); window.removeEventListener('keydown', onKey); } };
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
