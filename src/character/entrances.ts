import { allUnlocked, gems, spendGems } from './collection';

/**
 * Entrances: how a hero walks onto the sand before the countdown. Every hero
 * has the free one; the rest are bought with gems in the Shop and picked in
 * hero creation. Purely cosmetic: the fight starts the same either way.
 *
 * Owned entrances are saved on their own (`al.entrances`), next to the skins.
 */

export const ENTRANCE_IDS = [
  'stride', 'skyfall', 'smoke', 'shadow', 'whirlwind', 'cannon', 'bats',
  'thunder', 'inferno', 'frost', 'jackpot', 'blade', 'quake',
  'meteor', 'divine', 'rift', 'starborn', 'phoenix',
] as const;
export type EntranceId = (typeof ENTRANCE_IDS)[number];
export type EntranceTier = 'common' | 'rare' | 'mythic' | 'legendary';

export interface EntranceDef {
  id: EntranceId;
  name: string;
  blurb: string;
  tier: EntranceTier;
  /** Gems; 0 for the free one. */
  price: number;
  /** Signature colour (UI accents). */
  color: number;
}

export const FREE_ENTRANCE: EntranceId = 'stride';
export const ENTRANCE_PRICE: Record<EntranceTier, number> = { common: 0, rare: 300, mythic: 600, legendary: 1200 };

const def = (id: EntranceId, name: string, tier: EntranceTier, color: number, blurb: string): EntranceDef =>
  ({ id, name, tier, color, blurb, price: ENTRANCE_PRICE[tier] });

export const ENTRANCES: Record<EntranceId, EntranceDef> = {
  stride: def('stride', 'Stride In', 'common', 0xd8c8a8, 'Walks out of the tunnel kicking up dust and raises a fist to the crowd.'),
  skyfall: def('skyfall', 'Skyfall', 'rare', 0x9ad8ff, 'Drops out of the sky and slams into the sand, cracking the ground.'),
  smoke: def('smoke', 'Smoke Bomb', 'rare', 0xb8b0c8, 'A bang, a cloud of smoke, and there they are, sparks still falling.'),
  shadow: def('shadow', 'Shadow Rise', 'rare', 0x9a50e0, 'A pool of shadow spreads on the ground and the hero rises out of it.'),
  thunder: def('thunder', 'Thunderclap', 'mythic', 0x7ac8ff, 'A bolt of lightning strikes the arena and leaves the hero crouched in its sparks.'),
  inferno: def('inferno', 'Inferno', 'mythic', 0xff8030, 'A column of fire erupts from the sand and burns away to reveal the hero.'),
  frost: def('frost', 'Glacier', 'mythic', 0xbff0ff, 'Ice spikes burst out of the ground; the hero breaks free of a frozen shell.'),
  whirlwind: def('whirlwind', 'Whirlwind', 'rare', 0xd8d0b0, 'A spinning tornado tears across the sand and spits the hero out, still twirling.'),
  cannon: def('cannon', 'Human Cannonball', 'rare', 0xe0a050, 'Boom! Fired from a cannon offstage, tumbling through the air, landing in a skid.'),
  bats: def('bats', 'Bat Swarm', 'rare', 0xc04060, 'A shrieking swarm of bats gathers into a dark cloud, then scatters to reveal the hero.'),
  jackpot: def('jackpot', 'Jackpot', 'mythic', 0xffd040, 'Coins rain down on a golden statue of the hero, who shakes off the gold with a grin.'),
  blade: def('blade', 'Blade Dance', 'mythic', 0x9ad8ff, 'Dashes through in a blur of afterimages, comes back to the spot, and the air splits a beat later.'),
  quake: def('quake', 'Earthshaker', 'mythic', 0xb08a5a, 'The ground rumbles, a rock pillar bursts up with the hero on top, and they leap down.'),
  rift: def('rift', 'Rift Walker', 'legendary', 0x9a70ff, 'A starry rift tears open in the air; the hero steps out of it before it implodes.'),
  starborn: def('starborn', 'Starborn', 'legendary', 0xc8e0ff, 'Night falls, stars draw the hero as a constellation, and it flares into flesh.'),
  phoenix: def('phoenix', 'Phoenix Rebirth', 'legendary', 0xff6020, 'Embers flare into a phoenix that spreads its burning wings and is reborn as the hero.'),
  meteor: def('meteor', 'Meteor Strike', 'legendary', 0xffb040, 'Rides a blazing meteor down into the arena. The ground shakes, the crowd roars.'),
  divine: def('divine', 'Divine Descent', 'legendary', 0xffe070, 'A golden beam parts the sky and the hero floats down in it, light raining around them.'),
};

export const isEntrance = (v: unknown): v is EntranceId => typeof v === 'string' && (ENTRANCE_IDS as readonly string[]).includes(v);

const KEY = 'al.entrances';
let owned: EntranceId[] | null = null;

function load(): EntranceId[] {
  if (owned) return owned;
  let raw: unknown = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { raw = null; }
  owned = Array.isArray(raw) ? [...new Set(raw.filter(isEntrance))] : [];
  return owned;
}

export function ownsEntrance(id: EntranceId): boolean {
  return ENTRANCES[id].price === 0 || allUnlocked() || load().includes(id);
}

/** Buys an entrance with gems. False when short of gems (or already owned). */
export function buyEntrance(id: EntranceId): boolean {
  const price = ENTRANCES[id].price;
  if (ownsEntrance(id) || gems() < price) return false;
  owned = [...load(), id];
  try { localStorage.setItem(KEY, JSON.stringify(owned)); } catch { /* private mode */ }
  // Paid last: the gem change tells every listener, and by then the entrance is owned.
  return spendGems(price);
}

/** The entrance a hero actually plays: theirs if they own it, else the free one. */
export function entranceOf(look: { entrance?: string } | undefined, mine = false): EntranceId {
  const id = isEntrance(look?.entrance) ? look.entrance : FREE_ENTRANCE;
  return mine && !ownsEntrance(id) ? FREE_ENTRANCE : id;
}

/** A rival's entrance: about half walk in, the rest show off something fancier. */
export function randomEntrance(r: () => number = Math.random): EntranceId {
  return r() < 0.45 ? FREE_ENTRANCE : ENTRANCE_IDS[1 + Math.floor(r() * (ENTRANCE_IDS.length - 1))];
}

/** Test hook: forget the loaded state. */
export function resetEntrancesForTests(): void {
  owned = null;
}
