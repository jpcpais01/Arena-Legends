import { sfx } from '../audio/sfx';
import type { PlayerCharacter } from '../character/profile';
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
  const preview = new Preview(c, 100, 90);
  const stats = h('div.statline');
  const slots = h('div.slots');
  const list = h('div.items');
  const desc = h('p.muted', { style: { margin: '0 0 10px', fontSize: '13px' } });
  const forms = h('div.field');

  const card = (g: GearDef | null, on: boolean) => {
    const ic = g ? iconCanvas(g.id) : emptyIcon();
    ic.classList.add('icon');
    const abil = g ? [...(g.abilities ?? []), ...(g.evade ? [g.evade] : [])] : [];
    const mods = g ? modText(g.add, g.mul) : '';
    return h(`button.item${on ? '.on' : ''}`, { onclick: () => equip(g ? g.id : null) },
      ic,
      h('div', null,
        h('b', null, g ? g.name : 'Nothing'),
        g ? h(`span.rar.r-${g.rarity}`, null, g.rarity) : null,
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

  function render(): void {
    if (opts.forms) {
      forms.replaceChildren(h('div.label', null, 'Body form'),
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
      const ic = id ? iconCanvas(id) : emptyIcon();
      ic.classList.add('icon');
      return h(`button.slot${s === slot ? '.on' : ''}`, { title: SLOT_NAMES[s], onclick: () => { slot = s; sfx.play('ui'); render(); } }, ic, h('small', null, SHORT[s]));
    }));
    desc.textContent = SLOT_INFO[slot];
    const ids = gearIdsFor(slot) as GearId[];
    list.replaceChildren(
      ...(slot === 'main' ? [] : [card(null, !c.gear[slot])]),
      ...ids.map((id) => card(gearOf(id), c.gear[slot] === id)),
    );
    stats.replaceChildren(...statLines(c.form, c.gear));
  }

  render();
  const el = h('div.sheet-wrap', null,
    h('div.sheet.plate', { role: 'dialog', 'aria-label': 'Gear' },
      h('div.sheet-head', null, h('h2', null, opts.title ?? 'Gear'),
        h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: () => { sfx.play('ui'); cb.onClose(); } }, icon('close'))),
      h('div.sheet-body.split', null,
        h('div.stage', null, preview.el, h('div.hint', null, 'Tap to see a move'), stats),
        h('div.panel-scroll', null, opts.forms ? forms : null, slots, desc, list)),
      h('div.sheet-foot', null, h('button.btn.primary', { onclick: () => { sfx.play('ui'); cb.onClose(); } }, icon('check'), 'Done')),
    ),
  );
  return { el, dispose: () => preview.dispose() };
}

const SLOT_INFO: Record<GearSlot, string> = {
  main: 'Your main weapon: basic attack, weapon skill and fighting distance. One- or two-handed.',
  secondary: 'A one-handed weapon or tool with one more skill. Drawn when used; a two-handed main goes on the back first.',
  special: 'Works on its own: auras, a familiar, or an attack the item makes by itself.',
  head: 'Passives and stats.',
  chest: 'Passives and stats; some grant a defensive skill.',
  boots: 'Movement, and the evade itself.',
};
