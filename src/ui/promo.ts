import { sfx } from '../audio/sfx';
import { CODE_LEN, redeem } from '../character/promo';
import { h } from './dom';
import { fmtInt } from './format';
import { gemTag } from './gacha';
import { icon } from './icons';

const WHY = {
  short: `Codes are ${CODE_LEN} letters.`,
  unknown: 'That code doesn\'t exist.',
  used: 'You already redeemed that code.',
} as const;

const HINT = `Type the ${CODE_LEN}-letter code.`;
const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/**
 * The promo code popup: six letter boxes and an in-game QWERTY keyboard under
 * them, so the phone keyboard never opens (there is no text field at all). A
 * real keyboard and pasting still work on a computer. Redeem pays the reward
 * right here. Escape, the backdrop and Cancel shut it.
 */
export function promoBox(parent: HTMLElement): void {
  let code = '';
  const cells = Array.from({ length: CODE_LEN }, () => h('span.promo-cell'));
  const box = h('div.promo-cells', { role: 'status', 'aria-label': 'Promo code' }, ...cells);
  const msg = h('p.promo-msg', { 'aria-live': 'polite' }, HINT);
  const go = h<HTMLButtonElement>('button.btn.primary', { onclick: () => submit() }, icon('tag'), 'Redeem');
  const shut = h<HTMLButtonElement>('button.btn', { onclick: () => cancel() }, 'Cancel');

  const paint = () => {
    cells.forEach((c, i) => {
      c.textContent = code[i] ?? '';
      c.classList.toggle('on', i === Math.min(code.length, CODE_LEN - 1));
    });
    go.disabled = code.length !== CODE_LEN;
  };
  const edit = (next: string) => {
    next = next.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LEN);
    if (next === code) return;
    code = next;
    box.classList.remove('bad');
    msg.className = 'promo-msg';
    msg.textContent = HINT;
    paint();
  };
  const press = (k: string) => {
    sfx.play('select');
    edit(k === 'del' ? code.slice(0, -1) : k === 'clr' ? '' : code + k);
  };

  const key = (k: string, label: Node | string, title: string, cls = '') =>
    h(`button.key.promo-key${cls}`, { type: 'button', title, 'aria-label': title, onclick: () => press(k) }, label);
  const pad = h('div.promo-kb', null,
    ...ROWS[0].split('').map((c) => key(c, c, c)),
    ...ROWS[1].split('').map((c, i) => key(c, c, c, i === 0 ? '.r2' : '')),
    key('clr', icon('close'), 'Clear', '.wide'),
    ...ROWS[2].split('').map((c) => key(c, c, c)),
    key('del', icon('back'), 'Delete', '.wide'));

  function submit(): void {
    const r = redeem(code);
    if (!r.ok) {
      sfx.play('back');
      msg.className = 'promo-msg bad';
      msg.textContent = WHY[r.why];
      box.classList.remove('bad'); void box.offsetWidth; box.classList.add('bad');
      return;
    }
    sfx.play(r.admin ? 'revealEpic' : 'gems');
    body.replaceChildren(
      h('div.promo-won', null,
        r.admin && h('div.promo-admin', null, icon('crown'), h('b', null, 'Admin account')),
        gemTag(`+${fmtInt(r.gems)}`, 'promo-gems'),
        h('p', null, r.admin
          ? 'Every skin, entrance, finisher and pose is yours, including future ones. The gems are in your purse.'
          : r.wasAdmin ? 'You\'re already an admin, so the code gave you the gems.' : 'The gems are in your purse.')),
      h('div.opts', null, h('button.btn.primary', { onclick: () => { sfx.play('confirm'); close(); } }, icon('check'), 'Nice')));
  }

  // A real keyboard types straight into the boxes; nothing else in the game sees the keys meanwhile.
  const onKey = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') cancel();
    else if (e.key === 'Enter') { e.preventDefault(); if (!go.isConnected) close(); else if (!go.disabled) submit(); }
    else if (!go.isConnected) return;
    else if (e.key === 'Backspace') { e.preventDefault(); edit(code.slice(0, -1)); }
    else if (/^[a-z]$/i.test(e.key)) { e.preventDefault(); edit(code + e.key); }
  };
  const onPaste = (e: ClipboardEvent) => {
    if (!go.isConnected) return;
    e.preventDefault();
    edit(e.clipboardData?.getData('text') ?? '');
  };
  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('paste', onPaste);
    wrap.remove();
  };
  const cancel = () => { sfx.play('back'); close(); };
  const body = h('div.sheet-body.confirm-body.promo-body', null,
    box, pad,
    h('div.promo-foot', null, msg, shut, go));
  const wrap: HTMLDivElement = h<HTMLDivElement>('div.sheet-wrap.confirm.promo', { onclick: (e: Event) => { if (e.target === wrap) cancel(); } },
    h('div.sheet.plate', { role: 'dialog', 'aria-label': 'Promo code' },
      h('div.sheet-head', null, h('h2', null, 'Promo code')),
      body));
  // Nothing keeps focus behind the popup (a focused field there could pull the phone keyboard up).
  (document.activeElement as HTMLElement | null)?.blur?.();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('paste', onPaste);
  parent.appendChild(wrap);
  sfx.play('ui');
  paint();
}
