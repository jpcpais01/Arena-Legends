import { sfx } from '../audio/sfx';
import type { PlayerCharacter } from '../character/profile';
import { RARITY_INFO, skinOn, skinsFor, type SkinDef } from '../character/skins';
import { iconCanvas } from '../render/icons';
import { GEAR_SLOTS, gearIdsFor, gearOf, SLOT_NAMES, type GearDef } from '../sim/gear';
import { FORMS, FORM_IDS } from '../sim/forms';
import { withGear } from '../sim/loadout';
import type { GearId, GearSlot } from '../sim/types';
import { h } from './dom';
import { icon } from './icons';
import { Preview } from './preview';
import { modText, statLines } from './stats';

export interface GearCallbacks {
  onChange(c: PlayerCharacter): void;
  onClose(): void;
}

const SHORT: Record<GearSlot, string> = { main: 'Main', secondary: 'Second', special: 'Special', head: 'Head', chest: 'Chest', boots: 'Boots' };

function emptyIcon(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  c.className = 'icon';
  return c;
}

/**
 * Gear picker: the six slots on top, the items for the chosen slot below.
 * Picking an item equips it at once (and saves through `onChange`).
 */
export function gearSheet(start: PlayerCharacter, cb: GearCallbacks, opts: { forms?: boolean; title?: string } = {}): { el: HTMLElement; dispose(): void } {
  let c = start;
  let slot: GearSlot = 'main';
  const stageBox = h('div.stage-box');
  const preview = new Preview(c, 100, 90, { pedestal: true, fit: stageBox });
  stageBox.append(preview.el, h('span.stage-hint', null, 'Tap for a move'));
  const stats = h('div.stats-list');
  const slots = h('div.slots');
  const list = h('div.items');
  const desc = h('p.slot-desc');
  const forms = h('div.field.forms-row');

  const skins = h('div.skins');
  const skinOf = (id: GearId) => skinOn(c.skins, id);

  const card = (g: GearDef | null, on: boolean) => {
    const ic = g ? iconCanvas(g.id, undefined, skinOf(g.id)?.id) : emptyIcon();
    const nSkins = g ? skinsFor(g.id).length : 0;
    ic.classList.add('icon');
    const abil = g ? [...(g.abilities ?? []), ...(g.evade ? [g.evade] : [])] : [];
    const mods = g ? modText(g.add, g.mul) : '';
    return h(`button.item${on ? '.on' : ''}`, { onclick: () => equip(g ? g.id : null) },
      ic,
      h('div', null,
        h('div.item-top', null,
          h('b', null, g ? g.name : 'Nothing'),
          g ? h(`span.rar.r-${g.rarity}`, null, g.rarity) : null,
          nSkins ? h('span.skin-count', null, `${nSkins} skin${nSkins > 1 ? 's' : ''}`) : null),
        h('p', null, g ? g.desc : 'Leave this slot empty.'),
        ...abil.map((a) => h('div.abil', null, h('i', null, a.name), a.desc ? ` · ${a.desc}` : '')),
        mods ? h('div.stats', null, mods) : null,
      ));
  };

  function equip(id: GearId | null): void {
    if (c.gear[slot] === id || (!id && !c.gear[slot])) return;
    c = { ...c, ...withGear(c, slot, id) } as PlayerCharacter;
    sfx.play('ui');
    cb.onChange(c);
    preview.set(c);
    if (id) preview.showcase();
    render();
  }

  /** Picks a skin for an item (null = the plain item). Kept per item, even after swapping it out. */
  function wear(id: GearId, skin: SkinDef | null): void {
    if ((skinOf(id)?.id ?? null) === (skin?.id ?? null)) return;
    const next = { ...c.skins };
    if (skin) next[id] = skin.id;
    else delete next[id];
    c = { ...c, skins: next };
    sfx.play('ui');
    cb.onChange(c);
    preview.set(c);
    preview.showcase();
    render();
  }

  /** Skins for the item in this slot: the plain item first, then rare, mythic, legendary. */
  function renderSkins(): void {
    const id = c.gear[slot];
    const list = id ? skinsFor(id) : [];
    skins.hidden = !list.length;
    if (!id || !list.length) { skins.replaceChildren(); return; }
    const cur = skinOf(id);
    const chip = (sk: SkinDef | null) => {
      const ic = iconCanvas(id, 40, sk?.id);
      ic.classList.add('icon');
      return h(`button.skin${sk ? '.' + sk.rarity : ''}${(cur?.id ?? null) === (sk?.id ?? null) ? '.on' : ''}`, {
        title: sk ? `${sk.name}: ${RARITY_INFO[sk.rarity]}` : 'The plain item.',
        onclick: () => wear(id, sk),
      }, ic, h('b', null, sk ? sk.name : 'Default'), h('small', null, sk ? sk.rarity : 'Plain'));
    };
    skins.replaceChildren(
      h('div.skins-head', null, h('span.label', null, icon('star'), `Skins · ${gearOf(id).name}`), h('i', null, cur ? RARITY_INFO[cur.rarity] : 'Looks only, never changes a fight.')),
      h('div.skin-row', null, chip(null), ...list.map(chip)),
    );
  }

  function render(): void {
    if (opts.forms) {
      forms.replaceChildren(h('div.label', null, icon('body'), 'Body form'),
        h('div.opts', null, ...FORM_IDS.map((id) => h(`button.opt${id === c.form ? '.on' : ''}`, {
          title: FORMS[id].blurb,
          onclick: () => {
            if (id === c.form) return;
            c = { ...c, form: id };
            sfx.play('ui');
            cb.onChange(c);
            preview.set(c);
            render();
          },
        }, FORMS[id].name))));
    }
    slots.replaceChildren(...GEAR_SLOTS.map((s) => {
      const id = c.gear[s];
      const ic = id ? iconCanvas(id, undefined, skinOf(id)?.id) : emptyIcon();
      ic.classList.add('icon');
      return h(`button.slot${s === slot ? '.on' : ''}${id ? '' : '.empty'}`, { title: SLOT_NAMES[s], onclick: () => { slot = s; sfx.play('ui'); render(); } }, ic, h('small', null, SHORT[s]));
    }));
    desc.textContent = SLOT_INFO[slot];
    const ids = gearIdsFor(slot) as GearId[];
    list.replaceChildren(
      ...(slot === 'main' ? [] : [card(null, !c.gear[slot])]),
      ...ids.map((id) => card(gearOf(id), c.gear[slot] === id)),
    );
    stats.replaceChildren(...statLines(c.form, c.gear));
    renderSkins();
  }

  render();
  const close = () => { sfx.play('ui'); cb.onClose(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  const el = h('div.scr.gear', { role: 'dialog', 'aria-label': opts.title ?? 'Gear' },
    h('header.scr-head', null,
      h('div.scr-title', null, h('h1', null, opts.title ?? 'Gear'), h('small', null, 'Pick a slot, then an item. Changes save at once.')),
      h('div.grow'),
      h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: close }, icon('close'))),
    h('section.scr-stage', null, stageBox, stats),
    h('section.scr-panel', null, opts.forms ? forms : null, slots, desc, skins, list),
    h('footer.scr-nav', null, h('div.grow'), h('button.btn.primary', { onclick: close }, icon('check'), 'Done')),
  );
  return { el, dispose: () => { preview.dispose(); window.removeEventListener('keydown', onKey); } };
}

const SLOT_INFO: Record<GearSlot, string> = {
  main: 'Your main weapon: basic attack, weapon skill and fighting distance. One- or two-handed.',
  secondary: 'A one-handed weapon or tool with one more skill. Drawn when used; a two-handed main goes on the back first.',
  special: 'Works on its own: auras, a familiar, or an attack the item makes by itself.',
  head: 'Passives and stats.',
  chest: 'Passives and stats; some grant a defensive skill.',
  boots: 'Movement, and the evade itself.',
};
