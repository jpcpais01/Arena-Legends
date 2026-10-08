// Online play screens: the "Play online" sheet, the room lobby, the connection
// banner, the leave confirmation and the score pips used by the pick screen,
// the HUD and the results.
import { sfx } from '../audio/sfx';
import { CODE_LENGTH, normalizeCode, WINS_NEEDED, type Side } from '../net/protocol';
import type { SessionError } from '../net/session';
import { h } from './dom';
import { icon, type IconName } from './icons';

/** First-to-three pips for one side, filled from the outside in. */
export function pips(side: Side, wins: number): HTMLElement {
  const dots = Array.from({ length: WINS_NEEDED }, (_, i) => h('i' + (i < wins ? '.on' : '')));
  if (side === 1) dots.reverse();
  return h(`span.pips.side-${side}`, { 'aria-label': `${wins} of ${WINS_NEEDED} wins` }, ...dots);
}

/** Blue pips, "2 - 1", red pips. */
export function scoreLine(score: [number, number]): HTMLElement {
  return h('div.score-line', null,
    pips(0, score[0]),
    h('b.score', null, h('span.side-0', null, String(score[0])), ' - ', h('span.side-1', null, String(score[1]))),
    pips(1, score[1]));
}

/** A small sheet over the screen. Keys stay inside it (Enter would start a fight). Returns its close function. */
function sheet(parent: HTMLElement, title: string, body: HTMLElement, onClose?: () => void, width = 480): () => void {
  const onKey = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { sfx.play('ui'); close(); }
  };
  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    wrap.remove();
    onClose?.();
  };
  const wrap: HTMLDivElement = h<HTMLDivElement>('div.sheet-wrap', { onclick: (e: Event) => { if (e.target === wrap) { sfx.play('ui'); close(); } } },
    h('div.sheet.plate', { role: 'dialog', 'aria-label': title, style: { width: `min(${width}px, 100%)` } },
      h('div.sheet-head', null, h('h2', null, title),
        h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: () => { sfx.play('ui'); close(); } }, icon('close'))),
      body));
  window.addEventListener('keydown', onKey, true);
  parent.appendChild(wrap);
  return close;
}

export interface OnlineSheetCallbacks {
  onHost(): void;
  onJoin(code: string): void;
}

/** "Play online": host a room or join one with a code. */
export function openOnlineSheet(parent: HTMLElement, cb: OnlineSheetCallbacks, prefill = ''): void {
  const input = h<HTMLInputElement>('input.name.code-input', {
    type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    maxlength: String(CODE_LENGTH + 2), placeholder: 'CODE', 'aria-label': 'Room code',
  });
  input.value = normalizeCode(prefill);
  const join = h<HTMLButtonElement>('button.btn.primary', { onclick: () => submit() }, icon('swords'), 'Join');
  const sync = () => {
    const v = normalizeCode(input.value);
    if (v !== input.value) input.value = v;
    join.disabled = v.length !== CODE_LENGTH;
  };
  const submit = () => {
    sync();
    if (join.disabled) return;
    sfx.play('ui');
    close();
    cb.onJoin(input.value);
  };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  sync();
  const body = h('div.sheet-body.online-body', null,
    h('p.muted', null, 'Duel a friend. Best of five: the first to three victories takes the match. You both pick a new build before every round.'),
    h('section.online-opt', null,
      h('b', null, 'Host a match'),
      h('p.muted', null, 'Get a room code and a link to send to your friend.'),
      h('button.btn.primary', { onclick: () => { sfx.play('ui'); close(); cb.onHost(); } }, icon('globe'), 'Create room')),
    h('section.online-opt', null,
      h('b', null, 'Join a friend'),
      h('p.muted', null, 'Type the code from their screen.'),
      h('div.opts', null, input, join)),
  );
  const close = sheet(parent, 'Play online', body);
  if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => input.focus(), 50);
}

/** Asks before quitting a match. */
export function confirmLeave(parent: HTMLElement, onLeave: () => void): void {
  const body = h('div.sheet-body.online-body', null,
    h('p', null, 'The match ends for both of you.'),
    h('div.opts', null,
      h('button.btn', { onclick: () => { sfx.play('ui'); close(); } }, 'Stay'),
      h('button.btn.primary', { onclick: () => { sfx.play('ui'); close(); onLeave(); } }, icon('exit'), 'Leave match')));
  const close = sheet(parent, 'Leave the match?', body, undefined, 380);
}

const ERRORS: Record<SessionError, string> = {
  offline: "Couldn't reach the match server. Check your internet connection and try again.",
  taken: "Couldn't reach the match server. Check your internet connection and try again.",
  browser: "This browser can't make direct connections. Try an up-to-date Chrome, Edge, Firefox or Safari.",
  'no-room': 'No open room with that code. Check it with your friend: a room closes when its host leaves.',
  full: 'That room already has a match going.',
  version: 'You and your friend are on different versions of the game. Both of you reload the game, then try again.',
};

export type LobbyView =
  | { kind: 'opening' }
  | { kind: 'waiting'; code: string }
  | { kind: 'joining'; code: string }
  | { kind: 'error'; code: string; error: SessionError; canRetry: boolean };

export interface LobbyCallbacks {
  onCancel(): void;
  onRetry(): void;
}

/** The room screen: the code to share while waiting, or progress and errors while joining. */
export class Lobby {
  readonly el: HTMLDivElement;
  private key = '';

  constructor(private readonly cb: LobbyCallbacks) {
    this.el = h<HTMLDivElement>('div.sheet-wrap.lobby');
    this.el.hidden = true;
  }

  show(v: LobbyView): void {
    this.el.hidden = false;
    const key = JSON.stringify(v);
    if (key === this.key) return;
    this.key = key;
    const cancel = h('button.btn', { onclick: () => { sfx.play('ui'); this.cb.onCancel(); } }, icon('close'), v.kind === 'error' ? 'Back' : 'Cancel');
    const status = (text: string) => h('div.lobby-status', null, h('span.spinner'), text);
    const codeTiles = (code: string) => code.split('').map((c) => h('span', null, c));
    let title = 'Online match';
    let content: (HTMLElement | null)[];
    switch (v.kind) {
      case 'opening':
        title = 'Host a match';
        content = [status('Opening a room'), h('div.opts', null, cancel)];
        break;
      case 'waiting': {
        title = 'Room code';
        const link = inviteLink(v.code);
        const copyBtn: HTMLElement = h('button.btn', {
          onclick: () => {
            sfx.play('ui');
            void copy(link).then((ok) => {
              if (!ok) return;
              copyBtn.classList.add('on');
              copyBtn.lastChild!.textContent = 'Copied';
              setTimeout(() => { copyBtn.classList.remove('on'); copyBtn.lastChild!.textContent = 'Copy link'; }, 1600);
            });
          },
        }, icon('link'), 'Copy link');
        const shareBtn = typeof navigator.share === 'function'
          ? h('button.btn', {
            onclick: () => {
              sfx.play('ui');
              navigator.share({ title: 'Arena Legends duel', text: `Duel me in Arena Legends! Room code ${v.code}`, url: link }).catch(() => {});
            },
          }, icon('share'), 'Share')
          : null;
        content = [
          h('button.room-code', { title: 'Copy the code', 'aria-label': `Room code ${v.code.split('').join(' ')}`, onclick: () => { sfx.play('ui'); void copy(v.code); } }, ...codeTiles(v.code)),
          h('p.muted', null, 'Send the code or the link to a friend. The match starts as soon as they join.'),
          h('div.opts', null, copyBtn, shareBtn),
          status('Waiting for your rival'),
          h('div.opts', null, cancel),
        ];
        break;
      }
      case 'joining':
        title = 'Joining room';
        content = [h('div.room-code.static', null, ...codeTiles(v.code)), status('Connecting to your rival'), h('div.opts', null, cancel)];
        break;
      case 'error':
        title = "Can't connect";
        content = [
          h('p', null, ERRORS[v.error]),
          h('div.opts', null, cancel,
            v.canRetry ? h('button.btn.primary', { onclick: () => { sfx.play('ui'); this.cb.onRetry(); } }, icon('replay'), 'Try again') : null),
        ];
        break;
    }
    this.el.replaceChildren(h('div.sheet.plate', { role: 'dialog', 'aria-label': title, style: { width: 'min(440px, 100%)' } },
      h('div.sheet-head', null, h('h2', null, title)),
      h('div.sheet-body.online-body.lobby-body', null, ...content)));
  }

  hide(): void {
    this.el.hidden = true;
    this.key = '';
  }
}

export function inviteLink(code: string): string {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', code);
  // Keep a custom match server (local testing) in the link.
  const peer = new URLSearchParams(location.search).get('peer');
  if (peer) u.searchParams.set('peer', peer);
  return u.toString();
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older WebViews: a hidden textarea and execCommand.
    const t = h<HTMLTextAreaElement>('textarea', { style: { position: 'fixed', opacity: '0' } });
    t.value = text;
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* nothing else to try */ }
    t.remove();
    return ok;
  }
}

export interface BannerAction { label: string; icon?: IconName; primary?: boolean; onClick(): void }

/** A plaque across the top of the screen for connection trouble. */
export class NetBanner {
  readonly el: HTMLDivElement;
  private key = '';

  constructor() {
    this.el = h<HTMLDivElement>('div.net-banner');
    this.el.hidden = true;
  }

  show(text: string, sub: string, actions: BannerAction[], busy: boolean): void {
    this.el.hidden = false;
    const key = text + sub + actions.map((a) => a.label).join() + busy;
    if (key === this.key) return;
    this.key = key;
    this.el.replaceChildren(h('div.net-card.plate', null,
      busy ? h('span.spinner') : icon('wifiOff'),
      h('div.net-text', null, h('b', null, text), sub ? h('small.muted', null, sub) : null),
      ...actions.map((a) => h('button.btn' + (a.primary ? '.primary' : ''), { onclick: () => { sfx.play('ui'); a.onClick(); } }, a.icon ? icon(a.icon) : null, a.label)),
    ));
  }

  hide(): void {
    this.el.hidden = true;
    this.key = '';
  }
}
