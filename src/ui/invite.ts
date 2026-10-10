// The duel invite popup: a friend challenges you to an online best of five.
// Shows their hero, a shrinking timer, and Accept / Decline.
import { sfx } from '../audio/sfx';
import { SPECIES } from '../character/appearance';
import { parseCharacter } from '../character/profile';
import { applyBackdrop } from '../render/backdrops';
import { FORMS } from '../sim/forms';
import type { SharedHero } from '../account/social';
import { h } from './dom';
import { icon } from './icons';
import { Preview } from './preview';

export interface InvitePopup {
  el: HTMLElement;
  /** Fills in the inviter's hero once it has loaded. */
  setHero(s: SharedHero | null): void;
  dispose(): void;
}

/** `seconds` is how long the invite has left; it closes itself (as `onExpire`) when time runs out. `cup`: an Arena Cup invite, not a duel. */
export function invitePopup(fromName: string, seconds: number, cb: { onAccept(): void; onDecline(): void; onExpire(): void }, cup = false): InvitePopup {
  let preview: Preview | null = null;
  let done = false;
  const finish = (f: () => void) => { if (done) return; done = true; f(); };
  const stage = h('div.inv-stage', null, h('span.sock', null, icon(cup ? 'trophy' : 'swords')));
  const sub = h('div.inv-sub');
  const bar = h('i', { style: { animationDuration: `${seconds}s` } });
  const timer = window.setTimeout(() => finish(cb.onExpire), seconds * 1000);
  const accept = h<HTMLButtonElement>('button.btn.primary.big.go.inv-accept', {
    onclick: () => { sfx.play('confirm'); finish(cb.onAccept); },
  }, icon(cup ? 'trophy' : 'swords'), h('span', null, cup ? 'Join' : 'Accept'));
  const decline = h<HTMLButtonElement>('button.btn.inv-decline', {
    onclick: () => { sfx.play('back'); finish(cb.onDecline); },
  }, icon('close'), h('span', null, 'Decline'));
  const el = h('div.inv-wrap', null,
    h('div.inv-pop', { role: 'alertdialog', 'aria-label': cup ? `${fromName} invites you to an Arena Cup` : `${fromName} challenges you to a duel` },
      h('div.ribbon.inv-ribbon', null, h('span', null, cup ? 'Cup invite!' : 'Duel challenge!')),
      h('div.inv-main', null,
        stage,
        h('div.inv-text', null,
          h('div.inv-name', null, fromName),
          sub,
          h('p', null, cup ? 'invites you to an Arena Cup: one bracket, 32 fighters, five rounds.' : 'challenges you to an online best of five.'))),
      h('div.inv-timer', null, bar),
      h('div.inv-btns', null, decline, accept)));
  sfx.play('tierUp');
  return {
    el,
    setHero(s) {
      const c = s ? parseCharacter(s.hero) : null;
      if (!c || done) return;
      preview?.dispose();
      preview = new Preview(c, 56, 60, { autoplay: true, ground: 3 });
      stage.replaceChildren(preview.el);
      applyBackdrop(stage, c.look.backdrop);
      preview.fitTo(stage);
      sub.textContent = `${c.name} · ${SPECIES[c.look.species].name} · ${FORMS[c.form].name} · ${s!.w}W ${s!.l}L`;
    },
    dispose() { done = true; clearTimeout(timer); preview?.dispose(); el.remove(); },
  };
}
