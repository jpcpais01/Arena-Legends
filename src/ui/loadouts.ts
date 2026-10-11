import { sfx } from '../audio/sfx';
import { owns } from '../character/collection';
import type { PlayerCharacter } from '../character/profile';
import { skinOn, type SkinMap } from '../character/skins';
import { iconCanvas } from '../render/icons';
import { GEAR_BY_ID, GEAR_SLOTS, SLOT_NAMES } from '../sim/gear';
import type { GearId, GearSet } from '../sim/types';
import { confirmBox } from './confirm';
import { h, save, store } from './dom';
import { icon } from './icons';

/** A saved build: the item in each slot and the skin each item wears. */
export interface Loadout { name: string; gear: GearSet; skins: SkinMap }

export const LOADOUT_SLOTS = 5;
const KEY = 'al.loadouts';

/** The five saved loadouts (null = an empty slot). Synced with the account like every al.* key. */
export function readLoadouts(): (Loadout | null)[] {
  const raw = store<unknown>(KEY, []);
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: LOADOUT_SLOTS }, (_, i) => {
    const l = list[i] as Loadout | null | undefined;
    return l && typeof l === 'object' && l.gear && typeof l.gear === 'object' ? l : null;
  });
}

function writeLoadouts(list: (Loadout | null)[]): void {
  save(KEY, list);
}

/**
 * What a loadout puts on today: items that no longer exist are left out (a missing
 * main weapon keeps the current one) and only skins still owned are worn.
 */
export function resolveLoadout(l: Loadout, current: GearSet): { gear: GearSet; skins: SkinMap } {
  const gear: Record<string, GearId> = {};
  for (const s of GEAR_SLOTS) {
    const id = (l.gear as Record<string, GearId | undefined>)[s];
    if (id && GEAR_BY_ID[id]?.slot === s) gear[s] = id;
  }
  if (!gear.main) gear.main = current.main;
  const skins: SkinMap = {};
  for (const [g, sk] of Object.entries(l.skins ?? {}) as [GearId, string][]) {
    const def = skinOn({ [g]: sk }, g);
    if (def && owns(def.id)) skins[g] = def.id;
  }
  return { gear: gear as GearSet, skins };
}

const sameBuild = (l: Loadout, c: PlayerCharacter) => {
  const r = resolveLoadout(l, c.gear);
  const pick = (m: SkinMap, g: GearSet) => GEAR_SLOTS.map((s) => { const id = (g as Record<string, GearId | undefined>)[s]; return id ? `${id}:${m[id] ?? ''}` : '-'; }).join('|');
  return pick(r.skins, r.gear) === pick(c.skins ?? {}, c.gear);
};

/**
 * The loadouts sheet: five slots, each with its name (tap to rename), its eight
 * items, Save (the current build goes in; asks before replacing one) and Load.
 */
export function openLoadouts(parent: HTMLElement, current: () => PlayerCharacter, onLoad: (gear: GearSet, skins: SkinMap) => void): void {
  let list = readLoadouts();
  const rows = h('div.lo-rows');

  const onKey = (e: KeyboardEvent) => {
    if (wrap.querySelector('.sheet-wrap.confirm')) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT' && e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { sfx.play('ui'); close(); }
  };
  const close = () => { window.removeEventListener('keydown', onKey, true); wrap.remove(); };

  function put(i: number): void {
    const c = current();
    const name = list[i]?.name || `Loadout ${i + 1}`;
    const gear = { ...c.gear };
    const skins: SkinMap = {};
    for (const id of Object.values(gear) as GearId[]) if (c.skins?.[id]) skins[id] = c.skins[id];
    list = list.map((l, j) => (j === i ? { name, gear, skins } : l));
    writeLoadouts(list);
    sfx.play('equip');
    render();
  }

  function row(l: Loadout | null, i: number): HTMLElement {
    const c = current();
    const worn = !!l && sameBuild(l, c);
    const name = h<HTMLInputElement>('input.lo-name', {
      type: 'text', maxlength: '18', spellcheck: 'false', autocomplete: 'off',
      placeholder: l ? `Loadout ${i + 1}` : 'Empty', 'aria-label': `Name of loadout ${i + 1}`, title: l ? 'Tap to rename' : '',
    });
    name.value = l?.name ?? '';
    name.disabled = !l;
    name.addEventListener('change', () => {
      if (!list[i]) return;
      list = list.map((x, j) => (j === i && x ? { ...x, name: name.value.trim() || `Loadout ${i + 1}` } : x));
      writeLoadouts(list);
      name.value = list[i]!.name;
    });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
    const r = l ? resolveLoadout(l, c.gear) : null;
    const socks = GEAR_SLOTS.map((s) => {
      const id = r ? (r.gear as Record<string, GearId | undefined>)[s] : undefined;
      if (!id) return h('span.sock.lo-sock.empty', { title: SLOT_NAMES[s] });
      const ic = iconCanvas(id, 24, r!.skins[id]);
      ic.className = 'icon';
      return h('span.sock.lo-sock', { title: `${SLOT_NAMES[s]}: ${GEAR_BY_ID[id].name}` }, ic);
    });
    return h(`div.lo-row${l ? '' : '.empty'}${worn ? '.worn' : ''}`, null,
      h('span.lo-num', null, String(i + 1)),
      h('div.lo-main', null,
        h('div.lo-top', null, name, worn ? h('small.lo-worn', null, icon('check'), 'Wearing') : null),
        h('div.lo-gear', null, ...socks)),
      h('div.lo-btns', null,
        h('button.btn.sm', {
          title: l ? 'Replace this loadout with your current build' : 'Save your current build here',
          onclick: () => l
            ? confirmBox(wrap, `Replace ${l.name}?`, `Save your current build over ${l.name}? The items saved there now will be lost.`, 'Save', () => put(i))
            : put(i),
        }, icon('bag'), 'Save'),
        h<HTMLButtonElement>('button.btn.sm.primary', {
          disabled: !l || worn, title: 'Wear this loadout',
          onclick: () => { if (!l) return; const res = resolveLoadout(l, current().gear); close(); onLoad(res.gear, res.skins); },
        }, icon('check'), 'Load')));
  }

  function render(): void {
    rows.replaceChildren(...list.map(row));
  }

  const wrap: HTMLDivElement = h<HTMLDivElement>('div.sheet-wrap.loadouts', { onclick: (e: Event) => { if (e.target === wrap) { sfx.play('ui'); close(); } } },
    h('div.sheet.plate', { role: 'dialog', 'aria-label': 'Loadouts' },
      h('div.sheet-head', null, h('h2', null, 'Loadouts'),
        h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: () => { sfx.play('ui'); close(); } }, icon('close'))),
      h('div.sheet-body.lo-body', null,
        h('p.lo-hint', null, 'Save your build in a slot, then load it any time with one tap. Tap a name to rename it.'),
        rows)));
  render();
  window.addEventListener('keydown', onKey, true);
  parent.appendChild(wrap);
  sfx.play('ui');
}
