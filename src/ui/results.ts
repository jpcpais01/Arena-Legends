import type { Battle } from '../sim/battle';
import type { FighterTotals } from '../sim/types';
import { h } from './dom';
import { fmtInt } from './format';
import { icon } from './icons';
import { scoreLine } from './online';

export interface ResultsCallbacks {
  onRematch(): void;
  onNewRival(): void;
  onMenu(): void;
}

const ROWS: [keyof FighterTotals, string][] = [
  ['damageDealt', 'Damage'], ['hits', 'Hits'], ['biggestHit', 'Biggest hit'], ['crits', 'Crits'],
  ['parries', 'Parries'], ['blocks', 'Blocks'], ['evades', 'Evades'], ['feints', 'Feints'], ['healed', 'Healed'],
];
/** Always shown; the rest only when someone did it. */
const KEEP = new Set<keyof FighterTotals>(['damageDealt', 'hits', 'biggestHit']);

/** End-of-fight sheet: who won and how, and a side-by-side stat table. */
export function resultsSheet(b: Battle, reason: 'ko' | 'time', you: boolean, cb: ResultsCallbacks): HTMLElement {
  const w = b.winner;
  const head = w === -1 ? 'Draw' : you ? (w === 0 ? 'Victory!' : 'Defeat') : `${b.fighters[w].name} wins`;
  const sub = w === -1
    ? 'Time ran out with both fighters level'
    : reason === 'ko' ? `${b.fighters[w].name} wins by K.O. at ${b.time.toFixed(1)}s` : `${b.fighters[w].name} wins on remaining health`;
  return h('div.sheet-wrap', null,
    h('div.sheet.plate.results', { role: 'dialog', 'aria-label': 'Results' },
      h('div.sheet-head', null, h('h2', null, 'Results')),
      h('div.sheet-body', null, h('div.res-head', null, h('b', null, head), h('span', null, sub)), statTable(b)),
      h('div.sheet-foot', null,
        h('button.btn', { onclick: cb.onMenu }, icon('home'), 'Menu'),
        h('button.btn', { onclick: cb.onNewRival }, icon('dice'), 'New rival'),
        h('button.btn.primary', { onclick: cb.onRematch }, icon('replay'), 'Rematch')),
    ),
  );
}

/** Both fighters' totals side by side; the better number is gold. */
function statTable(b: Battle): HTMLElement {
  const [a, c] = b.fighters;
  const rows = ROWS.filter(([k]) => KEEP.has(k) || a.totals[k] > 0 || c.totals[k] > 0).map(([k, label]) => {
    const x = a.totals[k], y = c.totals[k];
    return h('tr', null,
      h(`td${x > y ? '.best' : ''}`, null, fmtInt(x)),
      h('th', null, label),
      h(`td${y > x ? '.best' : ''}`, null, fmtInt(y)));
  });
  return h('table.res-table', null,
    h('thead', null, h('tr', null, h('th', null, a.name), h('th', null, ''), h('th', null, c.name))),
    h('tbody', null, ...rows));
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
export function onlineResultsSheet(b: Battle, o: OnlineOutcome, cb: OnlineResultsCallbacks): HTMLElement {
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
  return h('div.sheet-wrap', null,
    h('div.sheet.plate.results', { role: 'dialog', 'aria-label': 'Round results' },
      h('div.sheet-head', null, h('h2', null, over ? 'Match over' : `Round ${o.round}`)),
      h('div.sheet-body', null,
        h('div.res-head', null, h('b', null, head), h('span', null, who)),
        scoreLine(o.score),
        over && o.rivalRematch && !o.waiting ? h('p.res-note', null, `${rival} wants a rematch.`) : null,
        o.desync ? h('p.res-note.muted', null, "Your devices saw this round slightly differently; the host's result counts.") : null,
        statTable(b)),
      h('div.sheet-foot', null, h('button.btn', { onclick: cb.onLeave }, icon('exit'), 'Leave'), main),
    ),
  );
}
