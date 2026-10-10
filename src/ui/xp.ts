import { POINTS_PER_LEVEL, type LevelInfo } from '../character/progress';
import { h } from './dom';

/** XP a fight paid, and the hero's level before and after. */
export interface XpGain { gained: number; from: LevelInfo; to: LevelInfo }

/** The hero's level as a small gold badge. */
export function levelBadge(level: number, cls = ''): HTMLElement {
  return h(`span.lv-chip${cls ? '.' + cls : ''}`, { title: `Level ${level}` }, h('small', null, 'Lv'), String(level));
}

/**
 * "+65 XP" with the level bar filling up from where it was. A level up flashes
 * and says how many stat points it gave.
 */
export function xpLine(g: XpGain | null | undefined): HTMLElement | null {
  if (!g || g.gained <= 0) return null;
  const ups = g.to.level - g.from.level;
  const start = ups ? 0 : g.from.into / g.from.need;
  const end = g.to.into / g.to.need;
  const fill = h('i', { style: { '--w': `${Math.round(start * 100)}%` } });
  // Fill after the sheet has popped in.
  requestAnimationFrame(() => requestAnimationFrame(() => fill.style.setProperty('--w', `${Math.round(end * 100)}%`)));
  return h(`div.res-xp${ups ? '.up' : ''}`, null,
    h('b.xp-tag', null, `+${g.gained} XP`),
    levelBadge(g.to.level),
    h('div.xp-bar', null, fill),
    ups ? h('span.lvup', null, `Level up! +${ups * POINTS_PER_LEVEL} stat points`) : null);
}
