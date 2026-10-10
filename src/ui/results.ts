import type { Battle } from '../sim/battle';
import type { FighterTotals } from '../sim/types';
import { h } from './dom';
import { fmtInt } from './format';
import { gemTag } from './gacha';
import { icon } from './icons';
import { scoreLine } from './online';
import { xpLine, type XpGain } from './xp';

export interface ResultsCallbacks {
  onRematch(): void;
  onNewRival(): void;
  onMenu(): void;
}

/** Gems a won fight paid: the total and the winner's health left (0..1). */
export interface WinReward { gems: number; hp: number }

function rewardLine(r: WinReward | null | undefined): HTMLElement | null {
  if (!r || r.gems <= 0) return null;
  return h('div.res-gems', null, gemTag(`+${r.gems}`), h('span', null, `Victory with ${Math.round(r.hp * 100)}% health left`));
}

const ROWS: [keyof FighterTotals, string][] = [
  ['damageDealt', 'Damage'], ['hits', 'Hits'], ['biggestHit', 'Biggest hit'], ['crits', 'Crits'],
  ['parries', 'Parries'], ['blocks', 'Blocks'], ['evades', 'Evades'], ['feints', 'Feints'], ['healed', 'Healed'],
];
/** Always shown; the rest only when someone did it. */
const KEEP = new Set<keyof FighterTotals>(['damageDealt', 'hits', 'biggestHit']);

/** End-of-fight sheet: who won and how, and a side-by-side stat table. */
export function resultsSheet(b: Battle, reason: 'ko' | 'time', you: boolean, cb: ResultsCallbacks, reward?: WinReward | null, xp?: XpGain | null): HTMLElement {
  const w = b.winner;
  const head = w === -1 ? 'Draw' : you ? (w === 0 ? 'Victory!' : 'Defeat') : `${b.fighters[w].name} wins`;
  const sub = w === -1
    ? 'Time ran out with both fighters level'
    : reason === 'ko' ? `${b.fighters[w].name} wins by K.O. at ${b.time.toFixed(1)}s` : `${b.fighters[w].name} wins on remaining health`;
  const mood = w === -1 ? 'draw' : !you || w === 0 ? 'win' : 'lose';
  return h('div.sheet-wrap', null,
    h(`div.sheet.plate.results.${mood}`, { role: 'dialog', 'aria-label': 'Results' },
      h('div.res-banner', null, h('b', null, head), h('span', null, sub), rewardLine(reward), xpLine(xp)),
      h('div.sheet-body.res-body', null, statTable(b)),
      h('div.sheet-foot', null,
        h('button.btn', { onclick: cb.onMenu }, icon('home'), 'Menu'),
        h('button.btn', { onclick: cb.onNewRival }, icon('dice'), 'New rival'),
        h('button.btn.primary', { onclick: cb.onRematch }, icon('replay'), 'Rematch')),
    ),
  );
}

/** What a cup fight decided, for its results sheet. */
export interface CupOutcome {
  /** Your side in the battle. */
  you: 0 | 1;
  won: boolean;
  /** The round's name, e.g. "Quarter-finals". */
  round: string;
  ko: boolean;
  /** Won the final. */
  champion: boolean;
  /** Lost the final. */
  finalist: boolean;
  /** Cup bonus gems on top of the win's (champion or finalist). */
  bonus: number;
}

/** After a cup fight: through to the next round, knocked out, or champion. One button back to the bracket. */
export function cupResultsSheet(b: Battle, o: CupOutcome, onBracket: () => void, reward?: WinReward | null, xp?: XpGain | null): HTMLElement {
  const head = o.champion ? 'Champion!' : o.won ? 'Victory!' : 'Knocked out';
  const rival = b.fighters[o.you === 0 ? 1 : 0].name;
  const sub = o.champion ? `You won the Arena Cup${o.ko ? ' by K.O.' : ''}!`
    : o.won ? `${o.round} won ${o.ko ? 'by K.O.!' : 'on remaining health.'} On to the next round.`
    : `${rival} knocks you out of the ${o.round}${o.finalist ? ': runner-up!' : '.'}`;
  return h('div.sheet-wrap', null,
    h(`div.sheet.plate.results.${o.won ? 'win' : 'lose'}${o.champion ? '.champ' : ''}`, { role: 'dialog', 'aria-label': 'Cup results' },
      h('div.res-banner', null,
        h('small.chip', null, icon('trophy'), o.round),
        h('b', null, head), h('span', null, sub),
        rewardLine(reward),
        o.bonus ? h('div.res-gems', null, gemTag(`+${o.bonus}`), h('span', null, o.champion ? 'Champion bonus' : 'Finalist bonus')) : null,
        xpLine(xp)),
      h('div.sheet-body.res-body', null, statTable(b)),
      h('div.sheet-foot', null,
        h('button.btn.primary', { onclick: onBracket }, icon('trophy'), o.won && !o.champion ? 'Next round' : 'Bracket')),
    ),
  );
}

/** Both fighters' totals side by side with tug-of-war bars; the better number is gold. */
function statTable(b: Battle): HTMLElement {
  const [a, c] = b.fighters;
  const rows = ROWS.filter(([k]) => KEEP.has(k) || a.totals[k] > 0 || c.totals[k] > 0).map(([k, label]) => {
    const x = a.totals[k], y = c.totals[k];
    const m = Math.max(x, y) || 1;
    const pct = (v: number) => `${Math.round((v / m) * 100)}%`;
    return h('div.res-row', null,
      h(`b${x > y ? '.best' : ''}`, null, fmtInt(x)),
      h('div.res-mid', null, h('span', null, label),
        h('div.res-bar', null, h('i', { style: { '--w': pct(x) } }), h('i', { style: { '--w': pct(y) } }))),
      h(`b${y > x ? '.best' : ''}`, null, fmtInt(y)));
  });
  return h('div.res-stats', null,
    h('div.res-names', null, h('span', null, a.name), h('i', null, 'VS'), h('span', null, c.name)),
    h('div.res-rows', null, ...rows));
}

/** How an online round stands, from the host's official result (or this device's own until it arrives). */
export interface OnlineOutcome {
  you: 0 | 1;
  round: number;
  winner: 0 | 1 | -1;
  reason: 'ko' | 'time';
  /** Score after this round. */
  score: [number, number];
  /** Someone reached three wins. */
  matchWinner: 0 | 1 | -1;
  /** The two devices simulated this round differently (the host's result counts). */
  desync: boolean;
  /** You already pressed Next round / Rematch. */
  waiting: boolean;
  rivalRematch: boolean;
  /** Connection trouble: hold the buttons that need the rival. */
  offline: boolean;
}

export interface OnlineResultsCallbacks {
  onNext(): void;
  onRematch(): void;
  onLeave(): void;
}

/** Results of an online round: who took it, the match score, and what comes next. */
export function onlineResultsSheet(b: Battle, o: OnlineOutcome, cb: OnlineResultsCallbacks, reward?: WinReward | null): HTMLElement {
  const rival = b.fighters[o.you === 0 ? 1 : 0].name;
  const over = o.matchWinner !== -1;
  const head = over
    ? (o.matchWinner === o.you ? 'Match won!' : 'Match lost')
    : o.winner === -1 ? 'Draw' : o.winner === o.you ? 'Round won!' : 'Round lost';
  const who = o.winner === -1 ? 'Time ran out with both fighters level' : `${b.fighters[o.winner].name} takes round ${o.round}${o.reason === 'ko' ? ' by K.O.' : ' on remaining health'}`;
  let main: HTMLElement;
  if (over) {
    main = o.waiting
      ? h('button.btn.primary', { disabled: true }, `Waiting for ${rival}`)
      : h('button.btn.primary', { disabled: o.offline, onclick: cb.onRematch }, icon('replay'), o.rivalRematch ? 'Accept rematch' : 'Rematch');
  } else {
    main = o.waiting
      ? h('button.btn.primary', { disabled: true }, `Waiting for ${rival}`)
      : h('button.btn.primary', { disabled: o.offline, onclick: cb.onNext }, icon('play'), 'Next round');
  }
  const won = over ? o.matchWinner === o.you : o.winner === o.you;
  const mood = !over && o.winner === -1 ? 'draw' : won ? 'win' : 'lose';
  return h('div.sheet-wrap', null,
    h(`div.sheet.plate.results.${mood}`, { role: 'dialog', 'aria-label': 'Round results' },
      h('div.res-banner', null, h('small.chip', null, over ? 'Match over' : `Round ${o.round}`), h('b', null, head), h('span', null, who), rewardLine(reward)),
      h('div.sheet-body.res-body', null,
        scoreLine(o.score),
        over && o.rivalRematch && !o.waiting ? h('p.res-note', null, `${rival} wants a rematch.`) : null,
        o.desync ? h('p.res-note.muted', null, "Your devices saw this round slightly differently; the host's result counts.") : null,
        statTable(b)),
      h('div.sheet-foot', null, h('button.btn', { onclick: cb.onLeave }, icon('exit'), 'Leave'), main),
    ),
  );
}
