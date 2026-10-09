// Account sheet: sign in or create an account (username + password), or see
// who is signed in and sign out.
import { sfx } from '../audio/sfx';
import {
  accountStatus, lastError, onAccount, signIn, signOut, signUp, validName, validPassword,
  type AccountError, type AccountStatus, type SyncState,
} from '../account/account';
import { PASSWORD_MIN } from '../account/config';
import { h } from './dom';
import { icon } from './icons';

const ERRORS: Record<AccountError, string> = {
  taken: 'That name is already taken. Try another one.',
  wrong: 'Wrong name or password.',
  weak: `Pick a longer password (at least ${PASSWORD_MIN} characters).`,
  network: "Couldn't reach the server. Check your internet connection.",
  busy: 'Too many tries. Wait a minute and try again.',
  disabled: "Accounts aren't switched on for this game yet.",
  unknown: 'Something went wrong. Try again.',
};

const SYNC: Record<SyncState, string> = {
  idle: 'Your hero, gear and wins are saved to your account.',
  saved: 'Your hero, gear and wins are saved to your account.',
  saving: 'Saving…',
  offline: "You're offline. Progress saves when you're back online.",
  error: "Couldn't save just now. It tries again by itself.",
};

export function accountSheet(onClose: () => void): { el: HTMLElement; dispose(): void } {
  let mode: 'in' | 'new' = 'in';
  let busy = false;
  let error = '';
  const body = h('div.sheet-body.acct-body');

  const nameIn = h<HTMLInputElement>('input.name.acct-input', {
    type: 'text', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', maxlength: '16',
    placeholder: 'Name', 'aria-label': 'Name', name: 'username',
  });
  const passIn = h<HTMLInputElement>('input.name.acct-input', {
    type: 'password', autocomplete: 'current-password', placeholder: 'Password', 'aria-label': 'Password', name: 'password',
  });
  const peek = h<HTMLButtonElement>('button.btn.icon.acct-peek', {
    type: 'button', title: 'Show password', 'aria-label': 'Show password',
    onclick: () => { passIn.type = passIn.type === 'password' ? 'text' : 'password'; peek.classList.toggle('on', passIn.type === 'text'); },
  }, icon('eye'));
  const errEl = h('p.acct-err', { role: 'alert' });
  const submitBtn = h<HTMLButtonElement>('button.btn.primary.acct-go', { type: 'submit' });

  const shake = (el: HTMLElement) => { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); };
  const submit = async () => {
    if (busy) return;
    const name = nameIn.value.trim();
    const pass = passIn.value;
    if (!validName(name)) { error = 'Names are 3 to 16 letters, numbers or _.'; shake(nameIn); paint(); return; }
    if (!validPassword(pass)) { error = ERRORS.weak; shake(passIn); paint(); return; }
    busy = true; error = ''; paint();
    sfx.play('confirm');
    const err = await (mode === 'new' ? signUp(name, pass) : signIn(name, pass));
    busy = false;
    if (err) { error = err === 'wrong' || err === 'taken' ? ERRORS[err] : `${ERRORS[err]} (${lastError})`; sfx.play('back'); shake(err === 'taken' ? nameIn : passIn); }
    else passIn.value = '';
    render();
  };
  const form = h<HTMLFormElement>('form.acct-form', {
    onsubmit: (e: Event) => { e.preventDefault(); void submit(); },
  }, nameIn, h('div.acct-pass', null, passIn, peek), errEl, submitBtn);

  const tab = (id: 'in' | 'new', label: string) => h(`button.opt.acct-tab${mode === id ? '.on' : ''}`, {
    type: 'button', 'aria-pressed': String(mode === id),
    onclick: () => { if (mode !== id && !busy) { mode = id; error = ''; sfx.play('select'); render(); } },
  }, label);

  /** Updates the form in place (keeps focus and the typed text). */
  const paint = () => {
    errEl.textContent = error;
    errEl.hidden = !error;
    submitBtn.disabled = busy;
    nameIn.disabled = passIn.disabled = busy;
    passIn.autocomplete = mode === 'new' ? 'new-password' : 'current-password';
    submitBtn.replaceChildren(icon(mode === 'new' ? 'star' : 'check'), busy ? 'Please wait…' : mode === 'new' ? 'Create account' : 'Sign in');
  };

  const guest = () => [
    h('div.acct-tabs', null, tab('in', 'Sign in'), tab('new', 'Create account')),
    form,
    h('p.muted.acct-note', null, mode === 'new'
      ? 'Just a name and a password. Your hero, gear and wins come with you to any device. There is no way to recover a lost password, so keep it safe.'
      : 'Sign in to load your hero on this device. Without an account you play as a guest and progress stays on this device.'),
  ];

  const signedIn = (s: AccountStatus) => [
    h('div.acct-who', null, h('span.sock', null, icon('user')),
      h('div', null, h('span.muted', null, 'Signed in as'), h('b', null, s.name ?? ''))),
    h(`p.acct-sync.${s.sync}`, null, SYNC[s.sync]),
    h('div.opts.acct-foot', null,
      h('button.btn', {
        onclick: async () => { sfx.play('back'); await signOut(); },
      }, icon('exit'), 'Sign out')),
    h('p.muted.acct-note', null, 'After signing out you keep playing here as a guest with the same hero.'),
  ];

  const render = () => {
    const s = accountStatus();
    if (s.restoring) body.replaceChildren(h('p.muted.acct-note', null, 'Checking your account…'));
    else if (s.name) body.replaceChildren(...signedIn(s));
    else { paint(); body.replaceChildren(...guest()); }
  };
  const off = onAccount(() => { if (!busy) render(); });
  render();

  const close = () => { sfx.play('ui'); onClose(); };
  // Keys stay inside the sheet: Enter submits the form, not a fight or the title screen.
  const onKey = (e: KeyboardEvent) => { e.stopImmediatePropagation(); if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey, true);
  const wrap: HTMLElement = h('div.sheet-wrap.acct-wrap', { onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div.sheet.plate.acct-sheet', { role: 'dialog', 'aria-label': 'Account', style: { width: 'min(26rem, 100%)' } },
      h('div.sheet-head', null, h('h2', null, 'Account'),
        h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: close }, icon('close'))),
      body));
  if (!matchMedia('(pointer: coarse)').matches && !accountStatus().name) setTimeout(() => nameIn.focus(), 50);
  return { el: wrap, dispose: () => { off(); window.removeEventListener('keydown', onKey, true); } };
}
