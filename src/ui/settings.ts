import { sfx } from '../audio/sfx';
import { css } from '../render/pixel/color';
import { h } from './dom';
import { icon, type IconName } from './icons';

export interface Settings {
  /** Thought bubbles over the fighters during a battle. */
  quotes: boolean;
  sound: boolean;
  /** Arena id for every fight, or 'random'. */
  arena: string;
}

/** An arena as the picker shows it: name and a little sky-to-ground swatch. */
export interface ArenaChoice {
  id: string;
  name: string;
  sky: number[];
  floor: number;
}

interface Row {
  key: 'quotes' | 'sound';
  icon: IconName;
  label: string;
  hint: string;
}

const ROWS: Row[] = [
  { key: 'quotes', icon: 'quote', label: 'Battle quotes', hint: 'Speech bubbles with what each fighter is thinking.' },
  { key: 'sound', icon: 'soundOn', label: 'Sound', hint: 'Hits, spells, the crowd.' },
];

const swatch = (a: ArenaChoice) =>
  `linear-gradient(to bottom, ${a.sky.map((c, i) => `${css(c)} ${Math.round((i / a.sky.length) * 72)}% ${Math.round(((i + 1) / a.sky.length) * 72)}%`).join(', ')}, ${css(a.floor)} 72%)`;

/** Settings sheet: On/Off switches and the arena picker; every change applies at once. */
export function settingsSheet(start: Settings, arenas: ArenaChoice[], onChange: (s: Settings) => void, onClose: () => void): { el: HTMLElement; dispose(): void } {
  let s = { ...start };
  const body = h('div.panel-scroll');
  const set = (next: Settings) => { s = next; onChange(s); sfx.play('ui'); render(); };
  const random = { id: 'random', name: 'Random', bg: `linear-gradient(to right, ${arenas.map((a) => css(a.sky[2])).join(', ')})` };
  const arenaPicker = () => h('div.field', null,
    h('div.setting-text', null, h('b', null, icon('swords'), 'Arena'), h('span.muted', null, 'Where every fight takes place, and the view behind the menu.')),
    h('div.arena-grid', null, ...[...arenas.map((a) => ({ id: a.id, name: a.name, bg: swatch(a) })), random].map((a) =>
      h(`button.opt.arena-opt${s.arena === a.id ? '.on' : ''}`, {
        'aria-pressed': String(s.arena === a.id),
        onclick: () => { if (s.arena !== a.id) set({ ...s, arena: a.id }); },
      }, h('span.arena-swatch', { style: { background: a.bg } }), a.name))));
  const render = () => body.replaceChildren(...ROWS.map((r) => h('div.field.setting', null,
    h('div.setting-text', null, h('b', null, icon(r.icon), r.label), h('span.muted', null, r.hint)),
    h('div.opts', null, ...[true, false].map((v) => h(`button.opt${s[r.key] === v ? '.on' : ''}`, {
      'aria-pressed': String(s[r.key] === v),
      onclick: () => { if (s[r.key] !== v) set({ ...s, [r.key]: v }); },
    }, v ? 'On' : 'Off'))))), arenaPicker());
  render();
  const close = () => { sfx.play('ui'); onClose(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  window.addEventListener('keydown', onKey, true);
  const wrap: HTMLElement = h('div.sheet-wrap', { onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div.sheet.plate', { role: 'dialog', 'aria-label': 'Settings', style: { width: 'min(460px, 100%)' } },
      h('div.sheet-head', null, h('h2', null, 'Settings'),
        h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: close }, icon('close'))),
      body,
    ),
  );
  return { el: wrap, dispose: () => window.removeEventListener('keydown', onKey, true) };
}
