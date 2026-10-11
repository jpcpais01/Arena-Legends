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

/**
 * The promo code popup: six letter boxes over one hidden input (capitals only),
 * Redeem pays the reward right here. Escape, the backdrop and Close shut it.
 */
export function promoBox(parent: HTMLElement): void {
  const input = h<HTMLInputElement>('input.promo-input', {
    type: 'text', maxlength: String(CODE_LEN), autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off',
    spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Promo code',
  });
  const cells = Array.from({ length: CODE_LEN }, () => h('span.promo-cell'));
  const msg = h('p.promo-msg', { 'aria-live': 'polite' }, `Enter a ${CODE_LEN}-letter code.`);
  const go = h<HTMLButtonElement>('button.btn.primary', { onclick: () => submit() }, icon('tag'), 'Redeem');
  const shut = h<HTMLButtonElement>('button.btn', { onclick: () => cancel() }, 'Cancel');
  const box = h('label.promo-cells', null, ...cells, input);

  const paint = () => {
    const v = input.value;
    cells.forEach((c, i) => {
      c.textContent = v[i] ?? '';
      c.classList.toggle('on', i === Math.min(v.length, CODE_LEN - 1) && document.activeElement === input);
    });
    go.disabled = v.length !== CODE_LEN;
  };
  input.addEventListener('input', () => {
    const v = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LEN);
    if (v !== input.value) input.value = v;
    box.classList.remove('bad');
    msg.className = 'promo-msg';
    msg.textContent = `Enter a ${CODE_LEN}-letter code.`;
    paint();
  });
  input.addEventListener('focus', paint);
  input.addEventListener('blur', paint);

  function submit(): void {
    const r = redeem(input.value);
    if (!r.ok) {
      sfx.play('back');
      msg.className = 'promo-msg bad';
      msg.textContent = WHY[r.why];
      box.classList.remove('bad'); void box.offsetWidth; box.classList.add('bad');
      input.focus();
      return;
    }
    sfx.play(r.admin ? 'revealEpic' : 'gems');
    input.blur();
    body.replaceChildren(
      h('div.promo-won', null,
        r.admin && h('div.promo-admin', null, icon('crown'), h('b', null, 'Admin account')),
        gemTag(`+${fmtInt(r.gems)}`, 'promo-gems'),
        h('p', null, r.admin
          ? 'Every skin, entrance, finisher and pose is yours, including future ones. The gems are in your purse.'
          : r.wasAdmin ? 'You\'re already an admin, so the code gave you the gems.' : 'The gems are in your purse.')),
      h('div.opts', null, h('button.btn.primary', { onclick: () => { sfx.play('confirm'); close(); } }, icon('check'), 'Nice')));
  }

  const onKey = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.key === 'Escape') cancel();
    else if (e.key === 'Enter') { e.preventDefault(); if (!go.isConnected) close(); else if (!go.disabled) submit(); }
  };
  const close = () => { window.removeEventListener('keydown', onKey, true); wrap.remove(); };
  const cancel = () => { sfx.play('back'); close(); };
  const body = h('div.sheet-body.confirm-body.promo-body', null,
    box, msg,
    h('div.opts', null, shut, go));
  const wrap: HTMLDivElement = h<HTMLDivElement>('div.sheet-wrap.confirm.promo', { onclick: (e: Event) => { if (e.target === wrap) cancel(); } },
    h('div.sheet.plate', { role: 'dialog', 'aria-label': 'Promo code' },
      h('div.sheet-head', null, h('h2', null, 'Promo code')),
      body));
  window.addEventListener('keydown', onKey, true);
  parent.appendChild(wrap);
  sfx.play('ui');
  paint();
  input.focus();
}
