import { DEFAULT_BUILDS, randomBuild, sanitizeBuild, type CharacterBuild } from '../sim/loadout';
import { BACKDROPS, fitForm, randomAppearance, sanitizeAppearance, type Appearance } from './appearance';
import { randomSkins } from './skins';

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
    return raw ? parseCharacter(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** A strict copy of a saved character (this device's, or a friend's shared hero); null if it has no name. */
export function parseCharacter(raw: unknown): PlayerCharacter | null {
  const o = raw as Record<string, unknown> | null;
  const name = typeof o?.name === 'string' ? cleanName(o.name) : '';
  if (!name) return null;
  const b = sanitizeBuild(o, { ...DEFAULT_BUILDS[0], name });
  const look = sanitizeAppearance(o!.look);
  return { ...b, name, form: fitForm(look.species, b.form), look };
}

export function saveCharacter(c: PlayerCharacter): void {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode: lives for this session only */ }
}

export function newCharacter(): PlayerCharacter {
  const base = DEFAULT_BUILDS[0];
  const look = randomAppearance();
  return { name: '', form: fitForm(look.species, 'balanced'), gear: { ...base.gear }, look, skins: {}, style: 'balanced' };
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

/** A generated rival: random name, form, gear, look and item skins. Rivals always fight Balanced. */
export function generateRival(avoidName?: string): PlayerCharacter {
  let name = randomName();
  for (let i = 0; i < 4 && name === avoidName; i++) name = randomName();
  const build = randomBuild();
  // The backdrop is rolled here, not in randomBuild, so seeded builds keep their sequence.
  const look = { ...(build.look ?? randomAppearance(Math.random, build.form)), backdrop: Math.floor(Math.random() * BACKDROPS.length) };
  return { ...build, name, look, skins: randomSkins(build.gear), style: 'balanced' };
}
