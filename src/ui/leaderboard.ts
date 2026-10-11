// Global leaderboard: the top players by wins or by level. The top 25 can be
// tapped to see their hero with the gear and skins they have equipped. Guests
// can look too; only signed-in players are on the board.
import { sfx } from '../audio/sfx';
import { accountStatus, me, onAccount, social, syncRank, type AccountStatus } from '../account/account';
import { parseCharacter } from '../character/profile';
import type { Rank, RankBy, SharedHero } from '../account/social';
import { h } from './dom';
import { heroCard } from './heroCard';
import { icon } from './icons';
import type { Preview } from './preview';
import { levelBadge } from './xp';

export interface LeaderboardCallbacks {
  onClose(): void;
  /** Opens the account sheet (guests sign in there to join the board). */
  onAccount(): void;
}

/** Rows whose hero can be opened. */
export const TOP_HEROES = 25;
/** A board read stays fresh this long (reopening the sheet doesn't read it again). */
const FRESH_FOR = 60_000;
/** Matches styles.css: portrait phones show the list or the picked hero, not both. */
const NARROW = '(orientation: portrait) and (max-width: 720px)';
const OFFLINE = "Couldn't reach the server. Check your internet connection and try again.";
const failed = (e: unknown) => (String((e as { code?: string })?.code ?? '').includes('permission-denied')
  ? "The leaderboard isn't switched on on the server yet." : OFFLINE);

const TABS: { id: RankBy; label: string }[] = [{ id: 'w', label: 'Wins' }, { id: 'lv', label: 'Level' }];

/** Board reads kept across openings, per tab. */
const cache = new Map<RankBy, { rows: Rank[]; at: number }>();

export function leaderboardSheet(cb: LeaderboardCallbacks): { el: HTMLElement; dispose(): void } {
  let by: RankBy = 'w';
  let loading = false;
  let error = '';
  let picked: Rank | null = null;
  let preview: Preview | null = null;
  const heroes = new Map<string, SharedHero | null | 'error'>();

  const body = h('div.sheet-body.fr-body.lb-body');
  const side = h('div.fr-side.lb-side');
  const view = h('div.fr-view');
  const tabs = h('div.acct-tabs.lb-tabs');
  const list = h('div.lb-lists');
  side.append(tabs, list);
  body.append(side, view);

  const load = async (force = false) => {
    const tab = by;
    const hit = cache.get(tab);
    if (loading || (!force && hit && Date.now() - hit.at < FRESH_FOR)) { paintSide(); return; }
    loading = true;
    error = '';
    paintSide();
    try {
      // Our own latest record goes up first, so the board shows it.
      await syncRank();
      const rows = await (await social()).board(tab);
      cache.set(tab, { rows, at: Date.now() });
    } catch (e) {
      console.warn('[leaderboard]', e);
      error = failed(e);
    }
    loading = false;
    if (tab === by) paintSide();
  };

  const setTab = (t: RankBy) => {
    if (t === by) return;
    sfx.play('select');
    by = t;
    void load();
  };

  function paintTabs(): void {
    tabs.replaceChildren(...TABS.map((t) => h(`button.opt.acct-tab${by === t.id ? '.on' : ''}`, { onclick: () => setTab(t.id) }, t.label)));
  }

  const row = (r: Rank, i: number, mine: boolean) => {
    const place = i + 1;
    const open = place <= TOP_HEROES;
    const cls = `li.lb-row${place <= 3 ? `.p${place}` : ''}${mine ? '.me' : ''}${picked?.uid === r.uid ? '.on' : ''}${open ? '' : '.locked'}`;
    const inner = [
      h('span.lb-place', null, String(place)),
      h('b.lb-name', null, r.name),
      levelBadge(r.lv, by === 'lv' ? 'lb-key' : ''),
      h(`span.lb-rec${by === 'w' ? '.lb-key' : ''}`, null, h('b', null, String(r.w)), 'W ', h('small', null, `${r.l}L`)),
    ];
    return h(cls, null, open
      ? h('button.lb-pick', { title: `See ${r.name}'s hero`, onclick: () => { sfx.play('select'); pick(r); } }, ...inner, icon('next'))
      : h('div.lb-pick', null, ...inner));
  };

  function paintSide(): void {
    paintTabs();
    const hit = cache.get(by);
    const who = me();
    if (!hit) {
      list.replaceChildren(h('p.muted.fr-note', null, loading ? 'Loading the leaderboard…' : error));
      return;
    }
    const rows = hit.rows;
    const at = who ? rows.findIndex((r) => r.uid === who.uid) : -1;
    const s = accountStatus();
    // Below the list: where you stand, or how to get on the board.
    const you = !s.name
      ? h('div.lb-you', null, h('p.muted', null, 'Sign in to get on the board.'),
        h('button.btn.sm.primary', { onclick: () => cb.onAccount() }, icon('user'), h('span', null, 'Sign in')))
      : at < 0
        ? h('div.lb-you', null, h('p.muted', null, rows.length >= 100 ? `You're not in the top ${rows.length} yet. Keep winning!` : 'Win a fight while signed in to get on the board.'))
        : null;
    list.replaceChildren(...[
      error ? h('p.fr-msg.bad', null, error) : null,
      rows.length
        ? h('ol.lb-list', null, ...rows.map((r, i) => row(r, i, i === at)))
        : h('p.muted.fr-note', null, 'Nobody is on the board yet. Win a fight while signed in to be the first!'),
      h('p.muted.lb-hint', null, `Tap anyone in the top ${TOP_HEROES} to see their hero.`),
      you,
    ].filter((x): x is HTMLElement => !!x));
  }

  function pick(r: Rank | null): void {
    picked = r;
    body.classList.toggle('viewing', !!r);
    paintSide();
    paintView();
    if (r && !heroes.has(r.uid)) {
      social().then((m) => m.hero(r.uid))
        .then((x) => { heroes.set(r.uid, x); }, () => { heroes.set(r.uid, 'error'); })
        .then(() => { if (picked?.uid === r.uid) paintView(); });
    }
  }

  function paintView(): void {
    preview?.dispose();
    preview = null;
    if (!picked) {
      view.replaceChildren(h('div.fr-empty', null, h('span.sock', null, icon('podium')),
        h('p.muted', null, `Tap a player in the top ${TOP_HEROES} to see their hero and gear.`)));
      return;
    }
    const r = picked;
    const back = h('button.btn.sm.fr-back', { onclick: () => { sfx.play('back'); pick(null); } }, icon('back'), h('span', null, 'Leaderboard'));
    const foot = h('div.fr-foot', null, back, addButton(r));
    const got = heroes.get(r.uid);
    const hero = got && got !== 'error' ? parseCharacter(got.hero) : null;
    if (!hero) {
      const text = got === undefined ? 'Loading their hero…'
        : got === 'error' ? OFFLINE
        : `${r.name} hasn't shared a hero yet.`;
      view.replaceChildren(h('div.fr-empty', null, h('span.sock', null, icon('user')), h('b', null, r.name), h('p.muted', null, text)), foot);
      return;
    }
    // The board's record is the latest one; the shared hero may be a few seconds behind.
    const card = heroCard(hero, { w: r.w, l: r.l }, r.name);
    preview = card.preview;
    view.replaceChildren(card.el, foot);
  }

  /** Signed-in players can send a friend request to anyone on the board but themselves. */
  const sent = new Map<string, string>();
  function addButton(r: Rank): HTMLElement | null {
    const who = me();
    if (!who || who.uid === r.uid) return null;
    const done = sent.get(r.uid);
    if (done) return h('span.muted.lb-sent', null, done);
    return h('button.btn.sm.primary.lb-add', {
      title: `Send ${r.name} a friend request`,
      onclick: async (e: Event) => {
        const b = e.currentTarget as HTMLButtonElement;
        b.disabled = true;
        sfx.play('confirm');
        let text: string;
        try {
          const res = await (await social()).add(who, r.name);
          text = res === 'sent' ? 'Friend request sent' : res === 'friends' ? 'You are now friends!' : res === 'already' ? 'Already friends' : res === 'pending' ? 'Request already sent' : 'Couldn\'t send';
        } catch { text = 'Couldn\'t send'; }
        sent.set(r.uid, text);
        if (picked?.uid === r.uid) paintView();
      },
    }, icon('addUser'), h('span', null, 'Add friend'));
  }

  // Signing in or out (from the sign-in button here) redraws who "you" are.
  const who = (s: AccountStatus) => (s.restoring ? '…' : s.name ? `in:${s.name}` : 'out');
  let shown = who(accountStatus());
  const off = onAccount((s) => {
    if (who(s) === shown) return;
    shown = who(s);
    paintSide();
    paintView();
  });

  paintView();
  void load();

  const close = () => { sfx.play('ui'); cb.onClose(); };
  const onKey = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { if (picked && matchMedia(NARROW).matches) pick(null); else close(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setTab(by === 'w' ? 'lv' : 'w');
  };
  window.addEventListener('keydown', onKey, true);
  const wrap: HTMLElement = h('div.sheet-wrap.fr-wrap', { onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div.sheet.plate.fr-sheet.lb-sheet', { role: 'dialog', 'aria-label': 'Leaderboard' },
      h('div.sheet-head', null, h('h2', null, 'Leaderboard'),
        h('div.fr-head-btns', null,
          h('button.btn.icon', { title: 'Refresh', 'aria-label': 'Refresh', onclick: () => { sfx.play('ui'); void load(true); } }, icon('refresh')),
          h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: close }, icon('close')))),
      body));
  return {
    el: wrap,
    dispose: () => { off(); preview?.dispose(); window.removeEventListener('keydown', onKey, true); },
  };
}
