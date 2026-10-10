import { sfx } from '../audio/sfx';
import { h } from './dom';
import { icon, type IconName } from './icons';

/**
 * A small yes/no popup over a screen. Escape, the backdrop and Cancel close it; keys stay inside it
 * while it is open. `onOk` runs after it closes.
 */
export function confirmBox(parent: HTMLElement, title: string, text: string, okLabel: string, onOk: () => void, okIcon: IconName = 'check'): void {
  const onKey = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.key === 'Escape') cancel();
    else if (e.key === 'Enter') { e.preventDefault(); ok(); }
  };
  const close = () => { window.removeEventListener('keydown', onKey, true); wrap.remove(); };
  const cancel = () => { sfx.play('ui'); close(); };
  const ok = () => { close(); onOk(); };
  const wrap: HTMLDivElement = h<HTMLDivElement>('div.sheet-wrap.confirm', { onclick: (e: Event) => { if (e.target === wrap) cancel(); } },
    h('div.sheet.plate', { role: 'alertdialog', 'aria-label': title },
      h('div.sheet-head', null, h('h2', null, title)),
      h('div.sheet-body.confirm-body', null,
        h('p', null, text),
        h('div.opts', null,
          h('button.btn', { onclick: cancel }, 'Cancel'),
          h('button.btn.primary', { onclick: ok }, icon(okIcon), okLabel)))));
  window.addEventListener('keydown', onKey, true);
  parent.appendChild(wrap);
  sfx.play('ui');
}
