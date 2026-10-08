import { sfx } from '../audio/sfx';
import type { PlayerCharacter } from '../character/profile';
import { RARITY_INFO, skinOn, skinsFor, type SkinDef } from '../character/skins';
import { iconCanvas } from '../render/icons';
import { gearIdsFor, gearOf, SLOT_NAMES } from '../sim/gear';
import { FORMS, FORM_IDS } from '../sim/forms';
import { withGear } from '../sim/loadout';
import type { GearId, GearSlot } from '../sim/types';
import { h } from './dom';
import { icon } from './icons';
import { Preview } from './preview';
import { modText, statDiff, statLines } from './stats';

export interface GearCallbacks {
  onChange(c: PlayerCharacter): void;
  onClose(): void;
}

const SHORT: Record<GearSlot, string> = { main: 'Main', secondary: 'Second', special: 'Special', head: 'Head', chest: 'Chest', boots: 'Boots' };
/** Paper-doll sides: what you hold on the left, what you wear on the right. */
const LEFT: GearSlot[] = ['main', 'secondary', 'special'];
const RIGHT: GearSlot[] = ['head', 'chest', 'boots'];

function emptyIcon(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  c.className = 'icon';
  return c;
}

/**
 * Gear screen: the fighter stands big in the middle with the six slots around
 * them like a paper doll; the items for the chosen slot are a grid of icons.
 * Tapping an item opens a card with its text, skills, stat changes and skins,
 * and equips from there. Changes save at once (through `onChange`).
 */
export function gearSheet(start: PlayerCharacter, cb: GearCallbacks, opts: { forms?: boolean; title?: string } = {}): { el: HTMLElement; dispose(): void } {
  let c = start;
  let slot: GearSlot = 'main';
  /** The item whose card is open. */
  let open: GearId | null = null;

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
      sfx.play('ui');
    },
  }, icon('body'), 'Stats');
  const stage = h('section.scr-stage.doll-stage', null, stageBox, dollL, dollR, h('div.stage-tools', null, statsBtn), stats);

  const forms = h('div.field.forms-row');
  const slotHead = h('div.slot-head');
  const list = h('div.items');
  const panel = h('section.scr-panel', null, opts.forms ? forms : null, slotHead, list);
  const pop = h('div.item-pop.plate', { role: 'dialog', hidden: true });

  const skinOf = (id: GearId) => skinOn(c.skins, id);
  const iconOf = (id: GearId | null | undefined, px?: number) => {
    const ic = id ? iconCanvas(id, px, skinOf(id)?.id) : emptyIcon();
    ic.classList.add('icon');
    return ic;
  };

  function save(next: PlayerCharacter, move: boolean): void {
    c = next;
    sfx.play('ui');
    cb.onChange(c);
    preview.set(c);
    if (move) preview.showcase();
    render();
  }

  function equip(id: GearId | null): void {
    if (c.gear[slot] === id || (!id && !c.gear[slot])) return;
    save({ ...c, ...withGear(c, slot, id) } as PlayerCharacter, !!id);
  }

  /** Picks a skin for an item (null = the plain item). Kept per item, even after swapping it out. */
  function wear(id: GearId, skin: SkinDef | null): void {
    if ((skinOf(id)?.id ?? null) === (skin?.id ?? null)) return;
    const next = { ...c.skins };
    if (skin) next[id] = skin.id;
    else delete next[id];
    save({ ...c, skins: next }, c.gear[slot] === id);
  }

  function show(id: GearId | null): void {
    open = open === id ? null : id;
    sfx.play('ui');
    render();
  }

  function pickSlot(s: GearSlot): void {
    if (s === slot) return;
    slot = s;
    open = null;
    sfx.play('ui');
    panel.scrollTop = 0;
    render();
  }

  function slotBtn(s: GearSlot): HTMLElement {
    const id = c.gear[s];
    return h(`button.slot${s === slot ? '.on' : ''}${id ? '' : '.empty'}`, {
      title: id ? `${SLOT_NAMES[s]}: ${gearOf(id).name}` : SLOT_NAMES[s], 'aria-pressed': String(s === slot),
      onclick: () => pickSlot(s),
    }, iconOf(id), h('small', null, SHORT[s]));
  }

  function tile(id: GearId | null): HTMLElement {
    const g = id ? gearOf(id) : null;
    const on = id ? c.gear[slot] === id : !c.gear[slot];
    return h(`button.itile.r-${g?.rarity ?? 'none'}${on ? '.on' : ''}${id && open === id ? '.sel' : ''}`, {
      'aria-pressed': String(on), title: g ? g.name : 'Leave this slot empty',
      onclick: () => (id ? show(id) : equip(null)),
    }, iconOf(id), h('b', null, g ? g.name : 'None'));
  }

  function renderPop(): void {
    if (!open || gearOf(open).slot !== slot) { pop.hidden = true; pop.replaceChildren(); return; }
    const id = open;
    const g = gearOf(id);
    const on = c.gear[slot] === id;
    const abil = [...(g.abilities ?? []), ...(g.evade ? [g.evade] : [])];
    const mods = modText(g.add, g.mul);
    const diff = on ? [] : statDiff(c.form, c.gear, withGear(c, slot, id).gear);
    const skins = skinsFor(id);
    const cur = skinOf(id);
    const chip = (sk: SkinDef | null) => h(`button.skin${sk ? '.' + sk.rarity : ''}${(cur?.id ?? null) === (sk?.id ?? null) ? '.on' : ''}`, {
      title: sk ? `${sk.name}: ${RARITY_INFO[sk.rarity]}` : 'The plain item.',
      onclick: () => wear(id, sk),
    }, Object.assign(iconCanvas(id, 40, sk?.id), { className: 'icon' }), h('b', null, sk ? sk.name : 'Default'), h('small', null, sk ? sk.rarity : 'Plain'));
    const hands = g.weapon ? `${g.weapon.hands === 2 ? 'Two' : 'One'}-handed${g.weapon.ranged ? ' · ranged' : ''}` : SLOT_NAMES[g.slot];

    pop.replaceChildren(
      h('div.pop-head', null,
        h(`div.pop-icon.r-${g.rarity}`, null, iconOf(id, 64)),
        h('div.pop-title', null,
          h('b', null, g.name),
          h('div.pop-tags', null, h(`span.rar.r-${g.rarity}`, null, g.rarity), h('span', null, hands))),
        h('button.btn.sm.icon.ghost', { title: 'Close', 'aria-label': 'Close', onclick: () => show(id) }, icon('close'))),
      h('div.pop-body', null,
        h('p.pop-desc', null, g.desc),
        abil.length ? h('div.pop-abils', null, ...abil.map((a) => h('div.abil', null,
          h('div.abil-top', null, h('i', null, a.name), a.slot !== 'basic' && a.cooldown ? h('small', null, `${a.cooldown}s`) : null),
          a.desc ? h('span', null, a.desc) : null))) : null,
        mods ? h('div.pop-mods', null, mods) : null,
        diff.length ? h('div.diff', null, h('div.label', null, 'If equipped'), h('div.diff-grid', null, ...diff)) : null,
        skins.length ? h('div.pop-skins', null,
          h('div.label', null, icon('star'), 'Skins', h('i', null, cur ? RARITY_INFO[cur.rarity] : 'Looks only')),
          h('div.skin-row', null, chip(null), ...skins.map(chip))) : null),
      h('div.pop-foot', null,
        on && slot !== 'main' ? h('button.btn.ghost', { onclick: () => equip(null) }, 'Unequip') : null,
        on
          ? h('button.btn.equipped', { disabled: true }, icon('check'), 'Equipped')
          : h('button.btn.primary', { onclick: () => equip(id) }, icon('bag'), 'Equip')),
    );
    pop.hidden = false;
  }

  function render(): void {
    if (opts.forms) {
      forms.replaceChildren(h('div.label', null, icon('body'), 'Body form'),
        h('div.opts', null, ...FORM_IDS.map((id) => h(`button.opt${id === c.form ? '.on' : ''}`, {
          title: FORMS[id].blurb,
          onclick: () => { if (id !== c.form) save({ ...c, form: id }, false); },
        }, FORMS[id].name))));
    }
    dollL.replaceChildren(...LEFT.map(slotBtn));
    dollR.replaceChildren(...RIGHT.map(slotBtn));
    slotHead.replaceChildren(h('h2', null, SLOT_NAMES[slot]), h('p', null, SLOT_INFO[slot]));
    const ids = gearIdsFor(slot) as GearId[];
    list.replaceChildren(...(slot === 'main' ? [] : [tile(null)]), ...ids.map(tile));
    stats.replaceChildren(...statLines(c.form, c.gear));
    renderPop();
  }

  render();
  const close = () => { sfx.play('ui'); cb.onClose(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (open) show(open);
    else close();
  };
  window.addEventListener('keydown', onKey);
  const el = h('div.scr.gear', { role: 'dialog', 'aria-label': opts.title ?? 'Gear' },
    h('header.scr-head', null,
      h('div.scr-title', null, h('h1', null, opts.title ?? 'Gear'), h('small', null, 'Pick a slot, then tap an item. Changes save at once.')),
      h('div.grow'),
      h('button.btn.primary.done', { onclick: close }, icon('check'), 'Done')),
    stage, panel, pop,
  );
  // A tap outside the card (and not on another item) closes it.
  el.addEventListener('pointerdown', (e) => {
    const t = e.target as Element;
    if (!open || pop.contains(t) || t.closest('.itile')) return;
    // No re-render here: it would replace the button being pressed and swallow its click.
    open = null;
    renderPop();
    for (const s of list.querySelectorAll('.itile.sel')) s.classList.remove('sel');
  });
  return { el, dispose: () => { preview.dispose(); window.removeEventListener('keydown', onKey); } };
}

const SLOT_INFO: Record<GearSlot, string> = {
  main: 'Basic attack, weapon skill and fighting distance. One- or two-handed.',
  secondary: 'A one-handed weapon or tool with one more skill. A two-handed main goes on the back while it is used.',
  special: 'Works on its own: auras, a familiar, or an attack the item makes by itself.',
  head: 'Passives and stats.',
  chest: 'Passives and stats; some grant a defensive skill.',
  boots: 'Movement, and the evade itself.',
};
