// Friends sheet: add players by name, answer friend requests, and look at a
// friend's hero with the gear and skins they have equipped (read-only).
import { sfx } from '../audio/sfx';
import { accountStatus, me, onAccount, social, type AccountStatus } from '../account/account';
import { isOnline, seenAgo } from '../account/presence';
import { parseCharacter } from '../character/profile';
import type { AddResult, Friend, FriendRequest, FriendsData, SharedHero } from '../account/social';
import { h } from './dom';
import { icon } from './icons';
import type { Preview } from './preview';
import { heroCard } from './heroCard';

export interface FriendsCallbacks {
  onClose(): void;
  /** Opens the account sheet (guests have to sign in first). */
  onAccount(): void;
  /** The number of requests waiting changed (the menu's dot). */
  onIncoming?(n: number): void;
  /** Hosts an online duel and invites this friend to it. */
  onInvite?(f: Friend): void;
}

const ADDED: Record<AddResult, string> = {
  sent: 'Friend request sent.',
  friends: 'They had already asked you. You are now friends!',
  self: "That's you!",
  missing: 'No player with that name.',
  already: 'You are already friends.',
  pending: 'Request already sent. Waiting for them to accept.',
};

const REFRESH_EVERY = 20_000;
/** Layouts with room for one column: a picked friend's hero replaces the list. Matches styles.css. */
const NARROW = '(orientation: portrait) and (max-width: 720px)';
const OFFLINE = "Couldn't reach the server. Check your internet connection and try again.";
/** The server refuses (friends not switched on there yet) or the network failed. */
const failed = (e: unknown) => (String((e as { code?: string })?.code ?? '').includes('permission-denied')
  ? "Friends aren't switched on on the server yet." : OFFLINE);

export function friendsSheet(cb: FriendsCallbacks): { el: HTMLElement; dispose(): void } {
  let data: FriendsData | null = null;
  let loading = false;
  let msg = '';
  let msgBad = false;
  let busy = false;
  let picked: Friend | null = null;
  let removeArmed = false;
  let preview: Preview | null = null;
  const heroes = new Map<string, SharedHero | null | 'error'>();

  const body = h('div.sheet-body.fr-body');
  const side = h('div.fr-side');
  const view = h('div.fr-view');
  const nameIn = h<HTMLInputElement>('input.name.fr-input', {
    type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '16',
    placeholder: 'Player name', 'aria-label': 'Player name to add', enterkeyhint: 'send',
  });
  const addBtn = h<HTMLButtonElement>('button.btn.primary.fr-add', { type: 'submit', title: 'Send friend request' }, icon('addUser'), h('span', null, 'Add'));
  const msgEl = h('p.fr-msg', { role: 'status' });
  const form = h<HTMLFormElement>('form.fr-form', { onsubmit: (e: Event) => { e.preventDefault(); void addFriend(); } }, nameIn, addBtn);

  const say = (text: string, bad = false) => { msg = text; msgBad = bad; msgEl.textContent = text; msgEl.hidden = !text; msgEl.classList.toggle('bad', bad); };

  /** Runs one server call with the buttons locked; failures show a message. */
  const act = async (f: () => Promise<void>) => {
    if (busy) return;
    busy = true; paintSide();
    try { await f(); } catch (e) { console.warn('[friends]', e); say(failed(e), true); sfx.play('back'); }
    busy = false;
    await refresh();
  };

  const addFriend = async () => {
    const who = me();
    const name = nameIn.value.trim();
    if (!who || busy) return;
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(name)) { say('Names are 3 to 16 letters, numbers or _.', true); sfx.play('back'); return; }
    sfx.play('confirm');
    await act(async () => {
      const r = await (await social()).add(who, name);
      say(ADDED[r], r === 'missing' || r === 'self');
      if (r === 'sent' || r === 'friends') nameIn.value = '';
    });
  };

  const refresh = async () => {
    const who = me();
    if (!who || loading) return;
    loading = true;
    if (!data) paintSide();
    try {
      data = await (await social()).load(who);
      cb.onIncoming?.(data.incoming.length);
      if (picked && !data.friends.some((f) => f.uid === picked!.uid)) pick(null);
    } catch (e) {
      console.warn('[friends]', e);
      if (!data) say(failed(e), true);
    }
    loading = false;
    paintSide();
  };

  const reqRow = (r: FriendRequest, incoming: boolean) => h('li.fr-row.req', null,
    h('span.sock', null, icon(incoming ? 'addUser' : 'user')),
    h('div.fr-who', null, h('b', null, incoming ? r.fromName : r.toName), h('span.muted', null, incoming ? 'wants to be friends' : 'request sent')),
    incoming && h('button.btn.sm.primary', {
      title: 'Accept', disabled: busy, onclick: () => { sfx.play('confirm'); void act(async () => { await (await social()).accept(me()!, r); say(`You and ${r.fromName} are now friends!`); }); },
    }, icon('check'), h('span', null, 'Accept')),
    h('button.btn.sm.icon', {
      title: incoming ? 'Decline' : 'Cancel request', 'aria-label': incoming ? 'Decline' : 'Cancel request', disabled: busy,
      onclick: () => { sfx.play('back'); void act(async () => { await (await social()).drop(r); say(''); }); },
    }, icon('close')));

  const friendRow = (f: Friend) => h(`li.fr-row.friend${picked?.uid === f.uid ? '.on' : ''}`, null,
    h('button.fr-pick', { onclick: () => { sfx.play('select'); pick(f); } },
      h('span.sock', null, icon('user')),
      h('div.fr-who', null, h('b', null, f.name),
        isOnline(f.seen) ? h('span.fr-seen.on', null, h('i'), 'Online') : h('span.fr-seen', null, seenAgo(f.seen))),
      icon('next')));

  const section = (title: string, items: HTMLElement[]) => items.length
    ? h('section.fr-sec', null, h('h3', null, title), h('ul.fr-list', null, ...items)) : null;

  /** The lists under the add box: redrawn on refresh while the add box keeps its focus and text. */
  const lists = h('div.fr-lists');
  side.append(form, msgEl, lists);

  function paintSide(): void {
    addBtn.disabled = nameIn.disabled = busy;
    msgEl.textContent = msg; msgEl.hidden = !msg; msgEl.classList.toggle('bad', msgBad);
    if (!data) { lists.replaceChildren(h('p.muted.fr-note', null, loading ? 'Loading your friends…' : '')); return; }
    const { friends, incoming, outgoing } = data;
    lists.replaceChildren(...[
      section(`Requests (${incoming.length})`, incoming.map((r) => reqRow(r, true))),
      friends.length
        ? section(`Friends (${friends.filter((f) => isOnline(f.seen)).length}/${friends.length} online)`, friends.map(friendRow))
        : h('p.muted.fr-note', null, 'No friends yet. Add someone by the name they use to sign in.'),
      section('Sent', outgoing.map((r) => reqRow(r, false))),
    ].filter((x): x is HTMLElement => !!x));
  }

  function pick(f: Friend | null): void {
    picked = f;
    removeArmed = false;
    body.classList.toggle('viewing', !!f);
    paintSide();
    paintView();
    if (f && !heroes.has(f.uid)) {
      social().then((m) => m.hero(f.uid))
        .then((x) => { heroes.set(f.uid, x); }, () => { heroes.set(f.uid, 'error'); })
        .then(() => { if (picked?.uid === f.uid) paintView(); });
    }
  }

  function paintView(): void {
    preview?.dispose();
    preview = null;
    if (!picked) {
      view.replaceChildren(h('div.fr-empty', null, h('span.sock', null, icon('friends')), h('p.muted', null, 'Pick a friend to see their hero and gear.')));
      return;
    }
    const f = picked;
    const back = h('button.btn.sm.fr-back', { onclick: () => { sfx.play('back'); pick(null); } }, icon('back'), h('span', null, 'Friends'));
    const remove = h<HTMLButtonElement>('button.btn.sm.fr-remove', {
      onclick: () => {
        if (!removeArmed) { removeArmed = true; sfx.play('select'); remove.replaceChildren(icon('close'), h('span', null, 'Tap again to remove')); remove.classList.add('armed'); return; }
        sfx.play('back');
        void act(async () => { await (await social()).remove(me()!, f.uid); say(`${f.name} is no longer your friend.`); pick(null); });
      },
    }, icon('close'), h('span', null, 'Remove friend'));
    const duel = cb.onInvite && h('button.btn.sm.primary.go.fr-duel', {
      title: `Invite ${f.name} to an online duel`, onclick: () => { sfx.play('confirm'); cb.onInvite!(f); },
    }, icon('swords'), h('span', null, 'Invite to duel'));
    const foot = h('div.fr-foot', null, back, remove, duel);
    const got = heroes.get(f.uid);
    const hero = got && got !== 'error' ? parseCharacter(got.hero) : null;
    if (!hero) {
      const text = got === undefined ? 'Loading their hero…'
        : got === 'error' ? OFFLINE
        : `${f.name} hasn't shared a hero yet. It shows up here after they next play while signed in.`;
      view.replaceChildren(h('div.fr-empty', null, h('span.sock', null, icon('user')), h('b', null, f.name), h('p.muted', null, text)), foot);
      return;
    }
    const card = heroCard(hero, got as SharedHero, f.name);
    preview = card.preview;
    view.replaceChildren(card.el, foot);
  }

  /** Guests (and a sign-in still being checked) get a prompt instead of the list. */
  const render = () => {
    const s = accountStatus();
    if (s.restoring) { body.replaceChildren(h('p.muted.fr-note.pad', null, 'Checking your account…')); return; }
    if (!s.name) {
      body.replaceChildren(h('div.fr-guest', null,
        h('span.sock', null, icon('friends')),
        h('p', null, 'Sign in to add friends and see their heroes.'),
        h('button.btn.primary', { onclick: () => cb.onAccount() }, icon('user'), h('span', null, 'Sign in'))));
      return;
    }
    body.replaceChildren(side, view);
    paintSide();
    paintView();
    if (!data) void refresh();
  };
  // Sync status changes every few seconds; only signing in or out redraws the sheet.
  const who = (s: AccountStatus) => (s.restoring ? '…' : s.name ? `in:${s.name}` : 'out');
  let shown = who(accountStatus());
  const off = onAccount((s) => {
    if (who(s) === shown) return;
    shown = who(s);
    data = null; picked = null; body.classList.remove('viewing');
    render();
  });
  render();
  const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, REFRESH_EVERY);

  const close = () => { sfx.play('ui'); cb.onClose(); };
  // Keys stay inside the sheet: Enter sends the request, not a fight.
  const onKey = (e: KeyboardEvent) => { e.stopImmediatePropagation(); if (e.key === 'Escape') { if (picked && matchMedia(NARROW).matches) pick(null); else close(); } };
  window.addEventListener('keydown', onKey, true);
  const wrap: HTMLElement = h('div.sheet-wrap.fr-wrap', { onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div.sheet.plate.fr-sheet', { role: 'dialog', 'aria-label': 'Friends' },
      h('div.sheet-head', null, h('h2', null, 'Friends'),
        h('div.fr-head-btns', null,
          h('button.btn.icon', { title: 'Refresh', 'aria-label': 'Refresh', onclick: () => { sfx.play('ui'); void refresh(); } }, icon('refresh')),
          h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: close }, icon('close')))),
      body));
  return {
    el: wrap,
    dispose: () => { off(); clearInterval(timer); preview?.dispose(); window.removeEventListener('keydown', onKey, true); },
  };
}
