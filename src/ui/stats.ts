import { computeBaseStats } from '../sim/loadout';
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
export function statLines(form: FormId, gear: GearSet): HTMLElement[] {
  const s = computeBaseStats(form, gear);
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

/** The stats that change between two gear sets, as "label · old → new" rows (for a `.diff` grid). */
export function statDiff(form: FormId, from: GearSet, to: GearSet): HTMLElement[] {
  const a = computeBaseStats(form, from), b = computeBaseStats(form, to);
  return LINES.flatMap(([k, label, f]) => {
    const x = a[k] as number, y = b[k] as number;
    if (f(x) === f(y)) return [];
    return [h('span', null, label), h('s', null, f(x)), h(`b.${y > x ? 'up' : 'down'}`, null, f(y))];
  });
}
