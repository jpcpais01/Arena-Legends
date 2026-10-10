import { computeBaseStats } from '../sim/loadout';
import type { Training } from '../sim/training';
import type { FormId, GearSet, Stats } from '../sim/types';
import { h } from './dom';

const LINES: [keyof Stats, string, (v: number) => string][] = [
  ['maxHp', 'Health', (v) => String(Math.round(v))],
  ['power', 'Power', (v) => String(Math.round(v))],
  ['armor', 'Armor', (v) => String(Math.round(v))],
  ['resist', 'Resist', (v) => String(Math.round(v))],
  ['attackSpeed', 'Attack speed', (v) => `${Math.round(v * 100)}%`],
  ['moveSpeed', 'Move speed', (v) => v.toFixed(1)],
  ['critChance', 'Crit', (v) => `${Math.round(v * 100)}%`],
];

/** Label/value pairs for a build's stats (for a `.statline` grid). */
export function statLines(form: FormId, gear: GearSet, train?: Training): HTMLElement[] {
  const s = computeBaseStats(form, gear, train);
  return LINES.flatMap(([k, label, f]) => [h('span', null, label), h('b', null, f(s[k] as number))]);
}

/** One-line summary of a gear piece's stat changes, e.g. "+10 armor · +6% attack speed". */
export function modText(add?: Partial<Stats>, mul?: Partial<Stats>): string {
  const names: Partial<Record<keyof Stats, string>> = {
    maxHp: 'health', power: 'power', armor: 'armor', resist: 'resist', attackSpeed: 'attack speed', moveSpeed: 'move speed',
    critChance: 'crit', critMult: 'crit damage', lifesteal: 'lifesteal', cdr: 'cooldowns', energyRegen: 'energy regen',
    tenacity: 'tenacity', poise: 'poise',
  };
  const pct = new Set<keyof Stats>(['critChance', 'critMult', 'lifesteal', 'cdr', 'tenacity', 'poise']);
  const out: string[] = [];
  for (const [k, v] of Object.entries(add ?? {}) as [keyof Stats, number][]) {
    if (!names[k]) continue;
    out.push(pct.has(k) ? `${v >= 0 ? '+' : ''}${Math.round(v * 100)}% ${names[k]}` : `${v >= 0 ? '+' : ''}${Math.round(v)} ${names[k]}`);
  }
  for (const [k, v] of Object.entries(mul ?? {}) as [keyof Stats, number][]) {
    if (!names[k]) continue;
    const d = Math.round((v - 1) * 100);
    if (d) out.push(`${d > 0 ? '+' : ''}${d}% ${names[k]}`);
  }
  return out.join(' · ');
}

/**
 * Every stat of a build as an inspector cell: the value with `to`, and how far
 * it moved from `from` (for an `.ins-stats` grid). Unchanged stats are dimmed.
 */
export function statCompare(form: FormId, from: GearSet, to: GearSet, train?: Training): HTMLElement[] {
  const a = computeBaseStats(form, from, train), b = computeBaseStats(form, to, train);
  return LINES.map(([k, label, f]) => {
    const x = a[k] as number, y = b[k] as number;
    const same = f(x) === f(y);
    const pct = f(y).endsWith('%');
    const d = pct ? Math.round(y * 100) - Math.round(x * 100) : k === 'moveSpeed' ? Math.round((y - x) * 10) / 10 : Math.round(y) - Math.round(x);
    return h(`div.st${same ? '.same' : y > x ? '.up' : '.down'}`, { title: same ? `${label}: ${f(y)}` : `${label}: ${f(x)} to ${f(y)}` },
      h('span', null, label),
      h('b', null, f(y)),
      same ? null : h('i', null, `${d > 0 ? '+' : ''}${d}${pct ? '%' : ''}`));
  });
}
