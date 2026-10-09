import { sfx } from '../audio/sfx';
import { css } from '../render/pixel/color';
import { h } from './dom';
import { icon, type IconName } from './icons';

export interface Volume { master: number; music: number; sfx: number }

export interface Settings {
  /** Thought bubbles over the fighters during a battle. */
  quotes: boolean;
  /** Volume sliders, 0..1. */
  volume: Volume;
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
  key: 'quotes';
  icon: IconName;
  label: string;
  hint: string;
}

const ROWS: Row[] = [
  { key: 'quotes', icon: 'quote', label: 'Battle quotes', hint: 'Speech bubbles with what each fighter is thinking.' },
];

const SLIDERS: { key: keyof Volume; icon: IconName; label: string }[] = [
  { key: 'master', icon: 'soundOn', label: 'Master' },
  { key: 'music', icon: 'music', label: 'Music' },
  { key: 'sfx', icon: 'swords', label: 'Sound effects' },
];

const swatch = (a: ArenaChoice) =>
  `linear-gradient(to bottom, ${a.sky.map((c, i) => `${css(c)} ${Math.round((i / a.sky.length) * 72)}% ${Math.round(((i + 1) / a.sky.length) * 72)}%`).join(', ')}, ${css(a.floor)} 72%)`;

/** Settings sheet: volume sliders, On/Off switches and the arena picker; every change applies at once. */
export function settingsSheet(start: Settings, arenas: ArenaChoice[], onChange: (s: Settings) => void, onClose: () => void): { el: HTMLElement; dispose(): void } {
  let s = { ...start };
  const body = h('div.sheet-body.settings-body');
  const set = (next: Settings) => { s = next; onChange(s); sfx.play('ui'); render(); };
  const random = { id: 'random', name: 'Random', bg: `linear-gradient(to right, ${arenas.map((a) => css(a.sky[2])).join(', ')})` };
  const arenaPicker = () => h('div.arena-field', null,
    h('div.setting-text', null, h('b', null, icon('swords'), 'Arena'), h('span', null, 'Where every fight takes place, and the view behind the menu.')),
    h('div.arena-grid', null, ...[...arenas.map((a) => ({ id: a.id, name: a.name, bg: swatch(a) })), random].map((a) =>
      h(`button.opt.arena-opt${s.arena === a.id ? '.on' : ''}`, {
        'aria-pressed': String(s.arena === a.id),
        onclick: () => { if (s.arena !== a.id) set({ ...s, arena: a.id }); },
      }, h('span.arena-swatch', { style: { background: a.bg } }), a.name))));
  // Sliders apply while dragging without re-rendering (that would drop the drag).
  const slider = (r: typeof SLIDERS[number]) => {
    const pct = () => Math.round(s.volume[r.key] * 100);
    const out = h('output.vol-val', null, String(pct()));
    const input: HTMLInputElement = h<HTMLInputElement>('input.vol', {
      type: 'range', min: '0', max: '100', step: '5', value: String(pct()), 'aria-label': `${r.label} volume`,
      oninput: () => {
        s = { ...s, volume: { ...s.volume, [r.key]: Number(input.value) / 100 } };
        input.style.setProperty('--p', input.value + '%');
        out.textContent = input.value;
        onChange(s);
      },
      onchange: () => sfx.play(r.key === 'music' ? 'ui' : 'hit'),
      style: { '--p': pct() + '%' },
    });
    return h('div.setting.vol-row', null, h('b', null, icon(r.icon), r.label), input, out);
  };
  const volumes = SLIDERS.map(slider);
  const render = () => body.replaceChildren(...volumes, ...ROWS.map((r) => h('div.setting', null,
    h('div.setting-text', null, h('b', null, icon(r.icon), r.label), h('span', null, r.hint)),
    h(`button.toggle${s[r.key] ? '.on' : ''}`, {
      role: 'switch', 'aria-checked': String(s[r.key]), 'aria-label': r.label, title: s[r.key] ? 'On' : 'Off',
      onclick: () => set({ ...s, [r.key]: !s[r.key] }),
    }))), arenaPicker());
  render();
  const close = () => { sfx.play('ui'); onClose(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  window.addEventListener('keydown', onKey, true);
  const wrap: HTMLElement = h('div.sheet-wrap', { onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div.sheet.plate.settings-sheet', { role: 'dialog', 'aria-label': 'Settings', style: { width: 'min(30rem, 100%)' } },
      h('div.sheet-head', null, h('h2', null, 'Settings'),
        h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: close }, icon('close'))),
      body,
    ),
  );
  return { el: wrap, dispose: () => window.removeEventListener('keydown', onKey, true) };
}
