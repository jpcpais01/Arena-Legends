// Arena Cup screens: the start sheet (solo or with friends), the lobby where
// friends gather, and the cup itself: the round track, your next match and the
// whole 32-fighter bracket.
import { sfx } from '../audio/sfx';
import { DEFAULT_LOOK, SPECIES } from '../character/appearance';
import { cupWinXp, CHAMPION_GEMS } from '../character/progress';
import { winGems } from '../character/collection';
import { champion, entrantAt, matchCount, openRound, ROUND_COUNT, ROUNDS, statusOf, type Cup, type Entrant } from '../cup/cup';
import type { LobbyMember } from '../net/cupLobby';
import { applyBackdrop, BH, BW } from '../render/backdrops';
import { FORMS } from '../sim/forms';
import { h } from './dom';
import { fmtInt } from './format';
import { gemTag } from './gacha';
import { icon } from './icons';
import { gearIcons } from './menu';
import { copy, inviteLink } from './online';
import { Preview } from './preview';
import { levelBadge } from './xp';

// --- Start sheet -------------------------------------------------------------------------------

export interface CupStartCallbacks {
  onSolo(): void;
  onFriends(): void;
}

/** "Arena Cup": what it is, and two ways in. */
export function openCupStart(parent: HTMLElement, cb: CupStartCallbacks): void {
  const onKey = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { sfx.play('ui'); close(); }
  };
  const close = () => { window.removeEventListener('keydown', onKey, true); wrap.remove(); };
  const go = (f: () => void) => () => { sfx.play('confirm'); close(); f(); };
  const track = h('div.cs-track', null, ...ROUNDS.flatMap((r, i) => [
    i ? h('i.cs-line') : null,
    h(`span.cs-node${i === ROUND_COUNT - 1 ? '.final' : ''}`, null, h('b', null, i === ROUND_COUNT - 1 ? icon('trophy') : String(i + 1)), h('small', null, r.short)),
  ]));
  const wrap: HTMLDivElement = h<HTMLDivElement>('div.sheet-wrap', { onclick: (e: Event) => { if (e.target === wrap) { sfx.play('ui'); close(); } } },
    h('div.sheet.plate.cup-start', { role: 'dialog', 'aria-label': 'Arena Cup', style: { width: 'min(640px, 100%)' } },
      h('div.sheet-head', null, h('h2', null, icon('trophy'), 'Arena Cup'),
        h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: () => { sfx.play('ui'); close(); } }, icon('close'))),
      h('div.sheet-body.cs-body', null,
        h('p.muted.cs-intro', null, '32 fighters, five knockout rounds. Lose once and you are out; win five in a row to lift the cup. Every win pays gems and XP, more the deeper you go and the more health you keep.'),
        track,
        h('div.cs-opts', null,
          h('section.online-opt.host', null,
            h('b', null, 'Solo'),
            h('p.muted', null, 'You and 31 challengers. Change your gear and spend stat points between rounds.'),
            h('button.btn.primary.go', { onclick: go(cb.onSolo) }, icon('trophy'), 'Enter the cup')),
          h('section.online-opt', null,
            h('b', null, 'With friends'),
            h('p.muted', null, 'Invite up to 7 friends into one bracket. Builds lock when the cup starts.'),
            h('button.btn', { onclick: go(cb.onFriends) }, icon('friends'), 'Open a lobby'))))));
  window.addEventListener('keydown', onKey, true);
  parent.appendChild(wrap);
}

// --- The cup screen ------------------------------------------------------------------------------

export interface CupScreenCallbacks {
  onFight(): void;
  onMenu(): void;
  /** Gives the cup up (asks first). */
  onLeave(): void;
  onGear(): void;
  onHero(): void;
  onNewCup(): void;
  /** Knocked out: settle the rest of the bracket to see who wins. */
  onFinish(): void;
}

export interface CupView {
  cup: Cup;
  /** Other fights are being settled. */
  busy?: boolean;
  /** Matches decided since the screen last showed ("round:match"): they light up in turn. */
  fresh?: Set<string>;
  /** The hero has stat points to spend. */
  points?: number;
}

const mk = (r: number, m: number) => `${r}:${m}`;
/** Drops the nulls of optional pieces. */
const some = (a: (HTMLElement | null | undefined)[]) => a.filter((x): x is HTMLElement => !!x);

export class CupScreen {
  readonly el: HTMLElement;
  private previews: Preview[] = [];
  private track = h('nav.cup-track', { 'aria-label': 'Rounds' });
  private main = h('section.cup-main.frame');
  private bracket = h('section.cup-bracket.frame');
  private leave = h<HTMLButtonElement>('button.btn.sm.cup-leave', { title: 'Give up this cup', onclick: () => this.cb.onLeave() }, icon('exit'), h('span', null, 'Give up'));
  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'Escape') { sfx.play('back'); this.cb.onMenu(); }
  };

  constructor(private readonly cb: CupScreenCallbacks) {
    this.el = h('div.scr.cup', { role: 'dialog', 'aria-label': 'Arena Cup' },
      h('header.scr-head', null,
        h('div.scr-title', null, h('h1', null, 'Arena Cup')),
        this.track,
        this.leave,
        h('button.btn.icon.close', { title: 'Menu', 'aria-label': 'Back to the menu', onclick: () => { sfx.play('back'); cb.onMenu(); } }, icon('home'))),
      this.main,
      this.bracket);
    window.addEventListener('keydown', this.onKey);
  }

  set(v: CupView): void {
    this.disposePreviews();
    const { cup } = v;
    const st = statusOf(cup);
    this.leave.hidden = st.kind !== 'play';
    const now = st.kind === 'play' ? st.round : st.kind === 'out' ? st.round : ROUND_COUNT;
    this.track.replaceChildren(...some(ROUNDS.flatMap((r, i) => [
      i ? h(`i.ct-line${i <= now ? '.done' : ''}`) : null,
      h(`span.ct-node${i < now || st.kind === 'champion' ? '.done' : i === now ? (st.kind === 'out' ? '.lost' : '.on') : ''}${i === ROUND_COUNT - 1 ? '.final' : ''}`,
        { title: `${r.name} · ${r.sub}` },
        h('b', null, i === ROUND_COUNT - 1 ? icon('trophy') : st.kind === 'out' && i === now ? icon('close') : i < now || st.kind === 'champion' ? icon('check') : String(i + 1)),
        h('small', null, r.short)),
    ])));
    this.main.replaceChildren(...some(this.panel(v)));
    const keep = { top: this.bracket.scrollTop, left: this.bracket.scrollLeft };
    this.bracket.replaceChildren(bracketView(cup, v.fresh));
    // Keep the view on your path: your next match (or where you went out).
    requestAnimationFrame(() => {
      const t = this.bracket.querySelector<HTMLElement>('.bk-match.next') ?? this.bracket.querySelector<HTMLElement>('.bk-champ.me')
        ?? [...this.bracket.querySelectorAll<HTMLElement>('.bk-match.mine')].pop();
      if (!t) { this.bracket.scrollTop = keep.top; this.bracket.scrollLeft = keep.left; return; }
      const b = this.bracket.getBoundingClientRect(), r = t.getBoundingClientRect();
      this.bracket.scrollTop += r.top - b.top - (b.height - r.height) / 2;
      this.bracket.scrollLeft += r.left - b.left - Math.max(8, (b.width - r.width) / 2 - r.width * 0.6);
    });
  }

  private panel(v: CupView): (HTMLElement | null)[] {
    const { cup } = v;
    const st = statusOf(cup);
    const summary = h('div.cup-sum', null,
      h('span', null, h('small', null, 'This cup'), h('b', null, `+${fmtInt(cup.xp)} XP`)),
      h('span', null, h('small', null, 'Gems won'), gemTag(`+${fmtInt(cup.gems)}`)));
    if (st.kind === 'play') {
      const r = ROUNDS[st.round];
      const youI = cup.me;
      const themI = entrantAt(cup, st.round, st.match, st.side === 0 ? 1 : 0);
      const head = [
        h('div.ribbon.cup-ribbon', null, h('span', null, r.name)),
        h('p.cup-round', null, `Round ${st.round + 1} of ${ROUND_COUNT} · ${r.sub}`),
      ];
      if (themI < 0 || v.busy) {
        return [...head, h('div.cup-wait', null, h('span.spinner'), h('span', null, 'The other fights are on. Your opponent is coming…')), summary];
      }
      const you = cup.entrants[youI], them = cup.entrants[themI];
      const pay = `Win: +${cupWinXp(st.round, 0)}–${cupWinXp(st.round, 1)} XP · +${winGems(0)}–${winGems(1)} gems${st.round === ROUND_COUNT - 1 ? ` · +${CHAMPION_GEMS} champion bonus` : ''}`;
      const tools = cup.shared
        ? h('p.cup-lock', null, icon('lock'), 'Builds are locked for this cup')
        : h('div.cup-tools', null,
          h('button.btn.sm', { onclick: () => { sfx.play('ui'); this.cb.onGear(); } }, icon('bag'), 'Armory'),
          h(`button.btn.sm${v.points ? '.unseen' : ''}`, { title: v.points ? `${v.points} stat points to spend` : 'Stats', onclick: () => { sfx.play('ui'); this.cb.onHero(); } }, icon('star'), 'Stats'));
      return [
        ...head,
        h('div.cup-vs', null, this.fighter(you, 0, 'You'), h('b.cup-vs-mark', null, 'VS'), this.fighter(them, 1, them.human ? 'Friend' : 'Rival')),
        h('p.cup-pay', null, pay),
        h('div.cup-foot', null, tools,
          h('button.btn.primary.big.fight.go', { onclick: () => this.cb.onFight() }, icon('swords'), h('span', null, 'Fight'))),
      ];
    }
    const decided = openRound(cup) >= ROUND_COUNT;
    const champ = decided ? cup.entrants[champion(cup)] : null;
    if (st.kind === 'champion') {
      return [
        h('div.cup-champ', null,
          h('div.cc-rays'),
          h('div.cc-cup', null, icon('trophy')),
          h('div.ribbon.cup-ribbon', null, h('span', null, 'Champion!')),
          h('p.cup-round', null, `${cup.entrants[cup.me].build.name} wins the Arena Cup`)),
        summary,
        h('div.cup-foot', null, h('button.btn', { onclick: () => { sfx.play('ui'); this.cb.onMenu(); } }, icon('home'), 'Menu'),
          h('button.btn.primary.go', { onclick: () => { sfx.play('confirm'); this.cb.onNewCup(); } }, icon('trophy'), 'New cup')),
      ];
    }
    // Knocked out.
    const r = ROUNDS[st.kind === 'out' ? st.round : 0];
    return [
      h('div.ribbon.cup-ribbon.out', null, h('span', null, 'Knocked out')),
      h('p.cup-round', null, `You fell in the ${r.name}.`),
      champ
        ? h('div.cup-winner', null, h('small', null, 'Champion'), this.fighter(champ, 0, champ.human ? 'Friend' : 'Winner'))
        : v.busy ? h('div.cup-wait', null, h('span.spinner'), h('span', null, 'Playing out the rest of the cup…'))
          : h('p.muted.cup-note', null, 'The cup goes on without you. See who takes it, or start a new one.'),
      summary,
      h('div.cup-foot', null,
        !champ && !v.busy ? h('button.btn', { onclick: () => { sfx.play('ui'); this.cb.onFinish(); } }, icon('eye'), 'See who wins') : null,
        h('button.btn.primary.go', { onclick: () => { sfx.play('confirm'); this.cb.onNewCup(); } }, icon('trophy'), 'New cup')),
    ];
  }

  /** A fighter's card in the match panel: portrait, name, level, species and form, gear. */
  private fighter(e: Entrant, side: 0 | 1, tag: string): HTMLElement {
    const c = e.build;
    const look = c.look ?? DEFAULT_LOOK;
    const p = new Preview(c, BW, BH, { autoplay: true, flip: side === 1, ground: -18 });
    this.previews.push(p);
    const art = h('div.cf-art', null, p.el);
    applyBackdrop(art, look.backdrop);
    p.fitTo(art);
    return h(`div.cup-fighter${side ? '.right' : ''}${e.human ? '.human' : ''}`, null,
      art,
      h('div.cf-info', null,
        h('div.cf-tag', null, h('span.side-tag', null, tag), levelBadge(e.level)),
        h('div.cf-name', null, c.name),
        h('div.cf-sub', null, `${SPECIES[look.species].name} · ${FORMS[c.form].name}`),
        h('div.cf-gear', null, ...gearIcons(c).map((g) => h('span.sock', null, g)))));
  }

  private disposePreviews(): void {
    for (const p of this.previews) p.dispose();
    this.previews = [];
  }

  dispose(): void {
    this.disposePreviews();
    window.removeEventListener('keydown', this.onKey);
  }
}

/** The whole bracket: a column per round, matches paired with connector lines, the trophy at the end. */
function bracketView(cup: Cup, fresh?: Set<string>): HTMLElement {
  const st = statusOf(cup);
  // Your path: every match you are in.
  const mine = new Set<string>();
  for (let r = 0; r < ROUND_COUNT; r++) {
    const m = cup.me >> (r + 1);
    if (entrantAt(cup, r, m, ((cup.me >> r) & 1) as 0 | 1) === cup.me) mine.add(mk(r, m));
  }
  let order = 0;
  const row = (r: number, m: number, side: 0 | 1) => {
    const i = entrantAt(cup, r, m, side);
    const res = cup.results[r][m];
    if (i < 0) return h('div.bk-row.tbd', null, h('span.bk-name', null, '—'));
    const e = cup.entrants[i];
    const cls = [res ? (res.w === side ? 'won' : 'lost') : '', i === cup.me ? 'me' : e.human ? 'friend' : ''].filter(Boolean).map((x) => '.' + x).join('');
    return h(`div.bk-row${cls}`, { title: `${e.build.name} · Lv ${e.level}` },
      h('span.bk-lv', null, String(e.level)),
      h('span.bk-name', null, e.build.name),
      res && res.w === side ? h('span.bk-hp', { title: `${Math.round(res.hp * 100)}% health left` }, res.ko ? 'KO' : `${Math.round(res.hp * 100)}%`) : null);
  };
  const match = (r: number, m: number) => {
    const key = mk(r, m);
    const isNext = st.kind === 'play' && st.round === r && st.match === m;
    const isFresh = fresh?.has(key);
    return h(`div.bk-match${mine.has(key) ? '.mine' : ''}${isNext ? '.next' : ''}${isFresh ? '.fresh' : ''}`,
      isFresh ? { style: { '--d': `${Math.min(order++, 24) * 45}ms` } } : null,
      row(r, m, 0), row(r, m, 1));
  };
  const cols: HTMLElement[] = [];
  for (let r = 0; r < ROUND_COUNT; r++) {
    const n = matchCount(r);
    const body: HTMLElement[] = [];
    if (n === 1) body.push(h('div.bk-pair.solo', null, match(r, 0)));
    else for (let m = 0; m < n; m += 2) body.push(h('div.bk-pair', null, match(r, m), match(r, m + 1)));
    cols.push(h(`div.bk-col${r === ROUND_COUNT - 1 ? '.last' : ''}`, null,
      h('div.bk-head', null, ROUNDS[r].name), h('div.bk-body', null, ...body)));
  }
  const ci = openRound(cup) >= ROUND_COUNT ? champion(cup) : -1;
  const won = ci >= 0 ? cup.entrants[ci] : null;
  cols.push(h('div.bk-col.trophy', null, h('div.bk-head', null, 'Champion'),
    h('div.bk-body', null, h(`div.bk-champ${won ? '.won' : ''}${ci === cup.me ? '.me' : ''}${fresh?.has(mk(ROUND_COUNT - 1, 0)) ? '.fresh' : ''}`, null,
      icon('trophy'), h('b', null, won ? won.build.name : '?')))));
  return h('div.bk', null, ...cols);
}

// --- Lobby ---------------------------------------------------------------------------------------

export type InviteState = 'sending' | 'open' | 'declined' | 'expired' | 'failed';
export interface LobbyFriend { uid: string; name: string; online: boolean; invite?: InviteState }

export interface CupLobbyView {
  role: 'host' | 'guest';
  /** opening/joining: connecting; open/in: in the room; error: see `error`. */
  state: 'opening' | 'open' | 'joining' | 'in' | 'error';
  error?: string;
  code: string;
  members: LobbyMember[];
  /** Host only: friends to invite (null while loading), or why there are none to show. */
  friends?: LobbyFriend[] | null | 'signed-out' | 'error';
}

export interface CupLobbyCallbacks {
  onStart(): void;
  onClose(): void;
  onInvite(f: LobbyFriend): void;
  onSignIn(): void;
  onRetry(): void;
}

/** Where friends gather before a cup: the party (up to 8), friends to invite, the room code, Start. */
export class CupLobbyScreen {
  readonly el: HTMLElement;
  private previews: Preview[] = [];
  private party = h('section.cl-party.frame');
  private side = h('section.cl-side.frame');
  private foot = h('footer.cl-foot');
  private key = '';

  constructor(private readonly cb: CupLobbyCallbacks) {
    this.el = h('div.scr.cup-lobby', { role: 'dialog', 'aria-label': 'Cup lobby' },
      h('header.scr-head', null,
        h('div.scr-title', null, h('h1', null, 'Cup lobby')),
        h('div.grow'),
        h('button.btn.icon.close', { title: 'Leave the lobby', 'aria-label': 'Leave the lobby', onclick: () => { sfx.play('back'); cb.onClose(); } }, icon('close'))),
      this.party, this.side, this.foot);
  }

  set(v: CupLobbyView): void {
    const key = JSON.stringify({ ...v, members: v.members.map((m) => [m.pid, m.level, m.build.name]) });
    if (key === this.key) return;
    this.key = key;
    for (const p of this.previews) p.dispose();
    this.previews = [];
    const host = v.role === 'host';
    const slots = Array.from({ length: 8 }, (_, i) => {
      const m = v.members[i];
      if (!m) return h('div.cl-slot.empty', null, h('span.sock', null, icon('addUser')), h('small', null, 'Open slot'));
      const c = m.build;
      const p = new Preview(c, BW, BH, { still: true, ground: -18 });
      this.previews.push(p);
      const art = h('div.cl-art', null, p.el);
      applyBackdrop(art, c.look.backdrop);
      p.fitTo(art);
      return h(`div.cl-slot${i === 0 ? '.host' : ''}`, null, art,
        h('div.cl-info', null, h('b', null, c.name), h('small', null, i === 0 ? 'Host' : `${SPECIES[c.look.species].name} · ${FORMS[c.form].name}`)),
        levelBadge(m.level));
    });
    const n = v.members.length;
    this.party.replaceChildren(
      h('div.ribbon', null, h('span', null, `Party ${n}/8`)),
      h('div.cl-slots', null, ...slots),
      h('p.muted.cl-note', null, `${32 - n} challengers fill the rest of the bracket. Friends are spread out, so you meet as late as possible.`));

    // Right side: the room code, and (host) friends to invite.
    const status = (t: string) => h('div.lobby-status', null, h('span.spinner'), t);
    const codeTiles = v.code ? v.code.split('').map((c) => h('span', null, c)) : [];
    const codeBox = v.code && (v.state === 'open' || v.state === 'in')
      ? h('div.cl-code', null,
        h('small', null, 'Room code'),
        h('button.room-code', { title: 'Copy the link', onclick: () => { sfx.play('ui'); void copy(inviteLink(v.code)); } }, ...codeTiles),
        h('small.muted', null, 'Friends can also join with this code in Online → Join.'))
      : null;
    const side: (HTMLElement | null)[] = [];
    if (v.state === 'error') side.push(h('p', null, v.error ?? "Couldn't connect."), host ? h('button.btn.primary', { onclick: () => { sfx.play('ui'); this.cb.onRetry(); } }, icon('replay'), 'Try again') : null);
    else if (v.state === 'opening') side.push(status('Opening the lobby'));
    else if (v.state === 'joining') side.push(status('Joining the lobby'));
    else if (!host) side.push(codeBox, status(`Waiting for ${v.members[0]?.build.name ?? 'the host'} to start the cup`), h('p.muted', null, 'Your build is locked as it is now for the whole cup.'));
    else {
      side.push(h('div.ribbon', null, h('span', null, 'Invite friends')));
      const f = v.friends;
      if (f === 'signed-out') side.push(h('p.muted', null, 'Sign in to invite your friends here, or send them the room code.'), h('button.btn', { onclick: () => this.cb.onSignIn() }, icon('user'), 'Sign in'));
      else if (f === 'error') side.push(h('p.muted', null, "Couldn't load your friends. Send them the room code instead."));
      else if (!f) side.push(status('Loading friends'));
      else if (!f.length) side.push(h('p.muted', null, 'No friends yet: add some from the friends button on the menu, or send the room code.'));
      else {
        const inRoom = new Set(v.members.map((m) => m.pid));
        side.push(h('div.cl-friends', null, ...f.map((fr) => {
          const joined = inRoom.has(fr.uid);
          const st = joined ? 'joined' : fr.invite;
          const label = st === 'joined' ? 'In the party' : st === 'sending' ? 'Sending…' : st === 'open' ? 'Invited' : st === 'declined' ? 'Declined' : st === 'expired' ? 'No answer' : st === 'failed' ? "Couldn't send" : '';
          const can = !joined && st !== 'sending' && st !== 'open' && n < 8;
          return h(`div.cl-friend${fr.online ? '.online' : ''}${joined ? '.joined' : ''}`, null,
            h('i.dot', { title: fr.online ? 'Online' : 'Offline' }),
            h('b', null, fr.name),
            label ? h(`small.st-${st}`, null, label) : null,
            can ? h('button.btn.sm', { onclick: () => { sfx.play('ui'); this.cb.onInvite(fr); } }, icon('trophy'), st ? 'Again' : 'Invite') : null);
        })));
      }
      side.push(codeBox);
    }
    this.side.replaceChildren(...some(side));
    this.foot.replaceChildren(...some([
      h('button.btn', { onclick: () => { sfx.play('back'); this.cb.onClose(); } }, icon('exit'), 'Leave'),
      h('div.grow'),
      host ? h<HTMLButtonElement>('button.btn.primary.big.go.cl-start', {
        disabled: v.state !== 'open',
        onclick: () => { sfx.play('confirm'); this.cb.onStart(); },
      }, icon('trophy'), h('span', null, n > 1 ? `Start with ${n} players` : 'Start the cup')) : null]));
  }

  dispose(): void {
    for (const p of this.previews) p.dispose();
    this.previews = [];
  }
}
