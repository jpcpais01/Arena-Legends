import { DEFAULT_BUILDS, randomBuild, sanitizeBuild, type CharacterBuild } from '../sim/loadout';
import { randomAppearance, sanitizeAppearance, type Appearance } from './appearance';

/**
 * The player's one persistent character: name, body form, look and the gear
 * it carries. Stored locally.
 */
export interface PlayerCharacter extends CharacterBuild {
  look: Appearance;
}

const KEY = 'al.character';
export const NAME_MAX = 16;

/** Trims, collapses whitespace and drops control characters and markup. */
export function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function loadCharacter(): PlayerCharacter | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof o?.name === 'string' ? cleanName(o.name) : '';
    if (!name) return null;
    const b = sanitizeBuild(o, { ...DEFAULT_BUILDS[0], name });
    return { ...b, name, look: sanitizeAppearance(o.look) };
  } catch {
    return null;
  }
}

export function saveCharacter(c: PlayerCharacter): void {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode: lives for this session only */ }
}

export function newCharacter(): PlayerCharacter {
  const base = DEFAULT_BUILDS[0];
  return { name: '', form: 'balanced', gear: { ...base.gear }, look: randomAppearance() };
}

const FIRST = [
  'Kael', 'Brisa', 'Vex', 'Ícaro', 'Nara', 'Orin', 'Selene', 'Draven', 'Lúcia', 'Thorne', 'Mara', 'Rui',
  'Zara', 'Bento', 'Irina', 'Kato', 'Leona', 'Duarte', 'Yara', 'Sven', 'Inês', 'Rook', 'Talia', 'Gil',
];
const EPITHET = ['Ironhide', 'Ashfall', 'Stormborn', 'the Quick', 'Emberfang', 'Frostjaw', 'Duskblade', 'Stonefist', 'the Bold', 'Wildheart'];

export function randomName(r: () => number = Math.random): string {
  const f = FIRST[Math.floor(r() * FIRST.length)];
  return r() < 0.4 ? cleanName(`${f} ${EPITHET[Math.floor(r() * EPITHET.length)]}`) : f;
}

/** A generated rival: random name, form, gear and look. */
export function generateRival(avoidName?: string): PlayerCharacter {
  let name = randomName();
  for (let i = 0; i < 4 && name === avoidName; i++) name = randomName();
  const build = randomBuild();
  return { ...build, name, look: randomAppearance() };
}
