import { sfx } from '../audio/sfx';
import { h } from './dom';
import { icon, type IconName } from './icons';

export interface Settings {
  /** Thought bubbles over the fighters during a battle. */
  quotes: boolean;
  sound: boolean;
}

interface Row {
  key: keyof Settings;
  icon: IconName;
  label: string;
  hint: string;
}

const ROWS: Row[] = [
  { key: 'quotes', icon: 'quote', label: 'Battle quotes', hint: 'Speech bubbles with what each fighter is thinking.' },
  { key: 'sound', icon: 'soundOn', label: 'Sound', hint: 'Hits, spells, the crowd.' },
];

/** Settings sheet: one On/Off switch per row; every change applies at once. */
export function settingsSheet(start: Settings, onChange: (s: Settings) => void, onClose: () => void): { el: HTMLElement; dispose(): void } {
  let s = { ...start };
  const body = h('div.panel-scroll');
  const render = () => body.replaceChildren(...ROWS.map((r) => h('div.field.setting', null,
    h('div.setting-text', null, h('b', null, icon(r.icon), r.label), h('span.muted', null, r.hint)),
    h('div.opts', null, ...[true, false].map((v) => h(`button.opt${s[r.key] === v ? '.on' : ''}`, {
      'aria-pressed': String(s[r.key] === v),
      onclick: () => {
        if (s[r.key] === v) return;
        s = { ...s, [r.key]: v };
        onChange(s);
        sfx.play('ui');
        render();
      },
    }, v ? 'On' : 'Off'))))));
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
