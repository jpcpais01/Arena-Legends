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
import { modText, SHOWN_STATS, statCompare, statLines } from './stats';

export interface GearCallbacks {
  onChange(c: PlayerCharacter): void;
  onClose(): void;
  /** Opens the skin chests (from a locked skin). */
  onChests?(): void;
}

const SHORT: Record<GearSlot, string> = {
  main: 'Main', secondary: 'Second', special: 'Special', usable: 'Usable', head: 'Head', chest: 'Chest', legs: 'Legs', boots: 'Boots',
};
/** The slot rail: what you hold and carry in the first column, what you wear in the second. */
const HELD: GearSlot[] = ['main', 'secondary', 'special', 'usable'];
const WORN: GearSlot[] = ['head', 'chest', 'legs', 'boots'];

function emptyIcon(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  c.className = 'icon';
  return c;
}

/**
 * Gear screen, read left to right like most game loadouts:
 *   slot rail → the fighter → the items for that slot → the picked item's card.
 * Picking a slot picks the item worn there, so its card (stats, skills and its
 * skins along the bottom) is always in view. Tapping another item shows its card
 * and tries it on the fighter; Equip (or a second tap on it) wears it.
 * Changes save at once (through `onChange`).
 */
export function gearSheet(start: PlayerCharacter, cb: GearCallbacks, opts: { forms?: boolean; title?: string } = {}): { el: HTMLElement; dispose(): void } {
  let c = start;
  let slot: GearSlot = 'main';
  /** The item whose card is shown (null: the slot is empty and nothing is picked). */
  let pick: GearId | null = c.gear.main ?? null;
  /** A locked skin tapped on the card: tried on the fighter until another pick. */
  let peek: SkinDef | null = null;
  /** The card body's scroll, kept across re-renders of the same item. */
  let bodyScroll = 0;

  const stageBox = h('div.stage-box');
  const preview = new Preview(c, 76, 82, { pedestal: true, fit: stageBox });
  preview.el.title = 'Tap for a move';
  stageBox.append(preview.el);
  const stats = h('div.stats-list');
  const statsBtn = h<HTMLButtonElement>('button.btn.sm.stats-btn', {
    'aria-pressed': 'false', title: 'Your stats',
    onclick: () => {
      const on = stage.classList.toggle('show-stats');
      statsBtn.classList.toggle('on', on);
      statsBtn.setAttribute('aria-pressed', String(on));
      sfx.play('select');
    },
  }, icon('body'), 'Stats');
  const tryTag = h('div.try-tag', { hidden: true }, icon('eye'), 'Trying on');
  const stage = h('section.scr-stage.ld-stage', null, stageBox, h('div.stage-tools', null, statsBtn), tryTag, stats);

  const rail = h('nav.ld-rail', { 'aria-label': 'Gear slots' });
  const forms = h('div.field.forms-row');
  const listHead = h('div.ld-list-head');
  const list = h('div.items');
  const listBox = h('section.ld-list.frame', null, opts.forms ? forms : null, listHead, list);
  const card = h('section.ld-card.frame');

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
    pick = c.gear[slot] ?? null;
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
    pick = id;
    peek = null;
    if (c.gear[slot] === id || (!id && !c.gear[slot])) { render(); return; }
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

  /** The line under the skins: the picked skin, or for an epic one its set and how much of it is worn. */
  function skinInfo(cur: SkinDef | null, all: SkinDef[]): HTMLElement {
    if (peek && all.includes(peek)) {
      const set = peek.set ? SKIN_SET_BY_ID.get(peek.set)! : null;
      return h('div.sk-set', null,
        h('p.sk-info', null, h(`b.${peek.rarity}`, null, peek.name), ' ', h('span.sk-locked', null, 'Locked.'),
          ` Find it in a skin chest${set ? `, part of the ${set.name} set` : ''}.`),
        cb.onChests ? h('button.btn.sm', { onclick: () => cb.onChests!() }, icon('shop'), 'Shop') : null);
    }
    const got = all.filter((sk) => owns(sk.id)).length;
    if (!cur) return h('p.sk-info', null, h('b', null, 'Default look'), ` · ${got}/${all.length} unlocked. Looks only.`);
    if (!cur.set) return h('p.sk-info', null, h(`b.${cur.rarity}`, null, cur.name), ` · ${cur.rarity}. ${RARITY_INFO[cur.rarity]}`);
    const set = SKIN_SET_BY_ID.get(cur.set)!;
    const worn = setWorn(set.id), n = setPieces(set.id).length;
    const have = setPieces(set.id).filter((p) => owns(p.id)).length;
    return h('div.sk-set', null,
      h('p.sk-info', null, h('b.epic', null, cur.name), ' · ', h('b.set', null, `${set.name} set`), ' ',
        h(`span.sk-pips${worn === n ? '.full' : ''}`, { title: `${worn} of ${n} pieces worn` }, ...setPieces(set.id).map((_, i) => h(`i${i < worn ? '.on' : ''}`))),
        ` ${worn === n ? 'Full set: aura on.' : `${worn}/${n} worn${have < n ? `, ${have}/${n} owned` : ''}.`}`),
      worn < n && have === n ? h('button.btn.sm', {
        title: 'Equips every item of the set, in their set skins',
        onclick: () => confirmBox(root, 'Equip set?', `Swap your items for the ${set.name} pieces and wear their set skins? Undo brings your build back.`, 'Equip set', () => wearSet(set.id), 'bag'),
      }, icon('bag'), 'Equip set') : null);
  }

  /** Shows an item's card (tries it on); a second tap on an item already shown equips it. */
  function choose(id: GearId): void {
    if (pick === id && c.gear[slot] !== id) { equip(id); return; }
    if (pick !== id) bodyScroll = 0;
    pick = id;
    peek = null;
    sfx.play('select');
    render();
  }

  /** Steps to the previous or next item of the slot. */
  function step(d: number): void {
    const ids = gearIdsFor(slot) as GearId[];
    const i = pick ? ids.indexOf(pick) : -1;
    pick = ids[(i + d + ids.length) % ids.length];
    peek = null;
    bodyScroll = 0;
    sfx.play('select');
    render();
    list.querySelector('.itile.pick')?.scrollIntoView({ block: 'nearest' });
  }

  function pickSlot(s: GearSlot): void {
    if (s === slot) return;
    slot = s;
    pick = c.gear[s] ?? null;
    peek = null;
    bodyScroll = 0;
    sfx.play('select');
    render();
    list.scrollTop = 0;
    list.querySelector('.itile.on')?.scrollIntoView({ block: 'nearest' });
  }

  function slotBtn(s: GearSlot): HTMLElement {
    const id = c.gear[s];
    return h(`button.slot${s === slot ? '.on' : ''}${id ? '' : '.empty'}`, {
      title: id ? `${SLOT_NAMES[s]}: ${gearOf(id).name}` : `${SLOT_NAMES[s]}: empty`, 'aria-pressed': String(s === slot),
      onclick: () => pickSlot(s),
    }, h('span.sock', null, iconOf(id)), h('small', null, SHORT[s]));
  }

  function tile(id: GearId | null): HTMLElement {
    const g = id ? gearOf(id) : null;
    const on = id ? c.gear[slot] === id : !c.gear[slot];
    const picked = !!id && pick === id && !on;
    return h(`button.itile.r-${g?.rarity ?? 'none'}${on ? '.on' : ''}${picked ? '.pick' : ''}`, {
      'aria-pressed': String(on), title: g ? `${g.name}${on ? ' (equipped)' : ''}` : 'Leave this slot empty',
      onclick: () => (id ? choose(id) : equip(null)),
    }, h('span.sock', null, iconOf(id)), h('b', null, g ? g.name : 'None'));
  }

  /** The picked item's card: head with Equip, stats and skills, and its skins along the bottom. */
  function itemCard(id: GearId): HTMLElement[] {
    const g = gearOf(id);
    const on = c.gear[slot] === id;
    const skins = skinsFor(id);
    const cur = skinOf(id);
    const shown = peek ?? cur;
    const big = iconCanvas(id, 64, shown?.id);
    big.className = 'icon';
    const hands = g.weapon ? `${g.weapon.hands === 2 ? '2' : '1'}-hand${g.weapon.ranged ? ' · ranged' : ''}` : SLOT_NAMES[slot];

    // Equipped: what the item gives (against the slot left empty). Not equipped: what would change.
    const from = on ? (slot === 'main' ? c.gear : withGear(c, slot, null).gear) : c.gear;
    const to = on ? c.gear : withGear(c, slot, id).gear;
    const abil = [...(g.abilities ?? []), ...(g.evade ? [g.evade] : [])];
    // Only the stats that move: the full sheet is behind the Stats button on the stage.
    // The worn main weapon has nothing to compare against: its bonuses are listed as text.
    const bare = on && slot === 'main';
    const moved = bare ? [] : statCompare(c.form, from, to, c.train, true);
    const mods = modText(g.add, g.mul, bare ? undefined : SHOWN_STATS);
    const body = h('div.ins-body', null,
      bare && !mods ? null : h('div.ins-sub', null, bare ? 'Bonuses' : on ? 'What it gives you' : 'If you equip it'),
      moved.length ? h('div.ins-stats', null, ...moved) : !mods && !bare ? h('p.ins-none', null, on ? 'No stat bonus.' : 'No stat changes.') : null,
      mods ? h('p.ins-mods', null, mods) : null,
      abil.length || g.passive ? h('div.ins-sub', null, 'Skills') : null,
      ...abil.map((a) => h('div.ins-ab', null,
        h('div.ins-ab-head', null, h('b', null, a.name),
          h('small', null, a.slot === 'basic' ? 'Basic' : a.uses ? `${a.uses} uses` : a.cooldown ? `${a.cooldown}s` : '')),
        a.desc ? h('p', null, a.desc) : null)),
      g.passive ? h('div.ins-ab.passive', null, h('div.ins-ab-head', null, h('b', null, 'Passive')), h('p', null, g.passive)) : null,
      h('p.ins-desc', null, g.desc));
    body.addEventListener('scroll', () => { bodyScroll = body.scrollTop; }, { passive: true });
    requestAnimationFrame(() => { body.scrollTop = bodyScroll; });

    // Worn: a gold check on the icon and its name in gold; Unequip for slots that may stay empty.
    const action = on
      ? (slot !== 'main' ? h('div.ld-act', null, h('button.btn.sm.ghost', { onclick: () => equip(null) }, 'Unequip')) : null)
      : h('div.ld-act', null, h('button.btn.primary.ins-equip', { onclick: () => equip(id) }, icon('check'), 'Equip'));

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
      }, h('span.skc-ic', null, ic, locked ? icon('lock', 'sk-lock') : null));
    };
    const got = skins.filter((sk) => owns(sk.id)).length;

    return [
      h('div.ins-head', null,
        h(`span.sock.ins-sock${shown ? `.sk-${shown.rarity}` : ''}`, null, big, on ? h('i.ld-worn', { title: 'Equipped' }, icon('check')) : null),
        h('div.ins-title', null,
          h('b', null, g.name),
          on ? h('small.ld-eqd', null, icon('check'), 'Equipped') : null,
          h('small', null, h(`span.r-${g.rarity}`, null, g.rarity), ` · ${hands}`),
          shown ? h(`small.ins-skin.${shown.rarity}`, null, icon('star'), shown.name) : null),
        action),
      body,
      skins.length ? h('div.ld-skins', null,
        h('div.ld-skins-head', null, icon('star'), 'Skins', h('small', null, `${got}/${skins.length}`)),
        h('div.skc-row', null, cell(null), ...skins.map(cell)),
        skinInfo(cur, skins)) : null,
    ].filter(Boolean) as HTMLElement[];
  }

  /** What the stage shows: the saved fighter, or the picked item (and a tried-on skin) on them. */
  let shownKey = '';
  function syncPreview(): void {
    let b: PlayerCharacter = c;
    if (pick && c.gear[slot] !== pick) b = { ...c, ...withGear(c, slot, pick) } as PlayerCharacter;
    if (pick && peek) b = { ...b, skins: { ...c.skins, [pick]: peek.id } };
    const key = JSON.stringify([b.form, b.gear, b.skins]);
    const trying = b !== c && key !== JSON.stringify([c.form, c.gear, c.skins]);
    tryTag.hidden = !trying;
    if (key === shownKey) return;
    const fresh = shownKey !== '';
    shownKey = key;
    preview.set(b);
    if (fresh && trying) preview.showcase(slot === 'usable' && pick ? (gearOf(pick).abilities?.[0]?.anim ? `use.${gearOf(pick).abilities![0].anim}` : undefined) : undefined);
  }

  let cardKey = '';
  function render(): void {
    if (opts.forms) {
      forms.replaceChildren(h('div.label', null, icon('body'), 'Body form'),
        h('div.opts', null, ...SPECIES[c.look.species].forms.map((id) => h(`button.opt${id === c.form ? '.on' : ''}`, {
          title: FORMS[id].blurb,
          onclick: () => { if (id !== c.form) save({ ...c, form: id }, false); },
        }, FORMS[id].name))));
    }
    rail.replaceChildren(...HELD.map(slotBtn), ...WORN.map(slotBtn));
    const ids = gearIdsFor(slot) as GearId[];
    listHead.replaceChildren(h('b', null, SLOT_NAMES[slot]), h('small', null, `${ids.length} items`));
    list.replaceChildren(...(slot === 'main' ? [] : [tile(null)]), ...ids.map(tile));
    stats.replaceChildren(...statLines(c.form, c.gear, c.train));
    undoBtn.disabled = !undos.length;
    redoBtn.disabled = !redos.length;
    plainBtn.disabled = !Object.keys(c.skins ?? {}).length;
    const key = `${pick}`;
    if (key !== cardKey) { cardKey = key; card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
    const g = pick ? gearOf(pick) : null;
    card.className = `ld-card frame pop${g ? ` r-${g.rarity}` : ''}${pick && c.gear[slot] === pick ? ' on' : ''}`;
    card.replaceChildren(...(pick ? itemCard(pick) : [
      h('div.ld-empty', null, h('b', null, `${SLOT_NAMES[slot]}: empty`), h('p', null, SLOT_INFO[slot]), h('p.muted', null, 'Pick an item from the list to see what it does.')),
    ]));
    syncPreview();
  }

  const close = () => { sfx.play('back'); cb.onClose(); };
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) travel(redos, undos);
      else travel(undos, redos);
    } else if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'Enter' && pick && c.gear[slot] !== pick) { e.preventDefault(); equip(pick); }
  };
  window.addEventListener('keydown', onKey);
  const root = h('div.scr.gear.loadout', { role: 'dialog', 'aria-label': opts.title ?? 'Armory' },
    h('header.scr-head', null,
      h('div.scr-title', null, h('h1', null, opts.title ?? 'Armory')),
      h('div.grow'),
      h('div.hist-btns', null, plainBtn, undoBtn, redoBtn),
      h('button.btn.primary.done', { onclick: close }, icon('check'), 'Done')),
    rail, stage, listBox, card,
  );
  render();
  // Once on screen, bring the worn item into view (long lists put it below the fold).
  requestAnimationFrame(() => list.querySelector('.itile.on')?.scrollIntoView({ block: 'nearest' }));
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
