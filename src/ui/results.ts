import type { Battle } from '../sim/battle';
import type { FighterTotals } from '../sim/types';
import { h } from './dom';
import { fmtInt } from './format';
import { icon } from './icons';

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
  const [a, c] = b.fighters;
  const head = w === -1 ? 'Draw' : you ? (w === 0 ? 'Victory!' : 'Defeat') : `${b.fighters[w].name} wins`;
  const sub = w === -1
    ? 'Time ran out with both fighters level'
    : reason === 'ko' ? `${b.fighters[w].name} wins by K.O. at ${b.time.toFixed(1)}s` : `${b.fighters[w].name} wins on remaining health`;
  const rows = ROWS.filter(([k]) => KEEP.has(k) || a.totals[k] > 0 || c.totals[k] > 0).map(([k, label]) => {
    const x = a.totals[k], y = c.totals[k];
    return h('tr', null,
      h(`td${x > y ? '.best' : ''}`, null, fmtInt(x)),
      h('th', null, label),
      h(`td${y > x ? '.best' : ''}`, null, fmtInt(y)));
  });
  return h('div.sheet-wrap', null,
    h('div.sheet.plate.results', { role: 'dialog', 'aria-label': 'Results' },
      h('div.sheet-head', null, h('h2', null, 'Results')),
      h('div.sheet-body', null,
        h('div.res-head', null, h('b', null, head), h('span', null, sub)),
        h('table.res-table', null,
          h('thead', null, h('tr', null, h('th', null, a.name), h('th', null, ''), h('th', null, c.name))),
          h('tbody', null, ...rows)),
      ),
      h('div.sheet-foot', null,
        h('button.btn', { onclick: cb.onMenu }, icon('home'), 'Menu'),
        h('button.btn', { onclick: cb.onNewRival }, icon('dice'), 'New rival'),
        h('button.btn.primary', { onclick: cb.onRematch }, icon('replay'), 'Rematch')),
    ),
  );
}
