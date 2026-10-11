import { allUnlocked, gems, spendGems } from './collection';
import { ENTRANCE_PRICE, type EntranceTier } from './entrances';

/**
 * The payoff after a win: a finisher (the cinematic played when a KO ends
 * the round, by whoever scored it) and a victory pose (what the winner does
 * after any win). Every hero has the free ones; the rest are bought with
 * gems in the Shop and picked in hero creation, on the same tiers and prices
 * as the entrances. Purely cosmetic: the fight ends the same either way.
 *
 * Owned ones are saved on their own (`al.finishers`, `al.poses`), next to the entrances.
 */

export const FINISHER_IDS = ['clean', 'frost', 'thunder', 'blossom', 'inferno', 'eclipse', 'delayed', 'starfall', 'dragon', 'judgement'] as const;
export type FinisherId = (typeof FINISHER_IDS)[number];

export const POSE_IDS = ['cheer', 'salute', 'flex', 'bow', 'twirl', 'hips', 'meditate', 'skyward', 'champion'] as const;
export type PoseId = (typeof POSE_IDS)[number];

export interface FinaleDef<Id extends string = string> {
  id: Id;
  name: string;
  blurb: string;
  tier: EntranceTier;
  /** Gems; 0 for the free one. */
  price: number;
  /** Signature colour (UI accents). */
  color: number;
}

const defs = <Id extends string>(list: [Id, string, EntranceTier, number, string][]): Record<Id, FinaleDef<Id>> =>
  Object.fromEntries(list.map(([id, name, tier, color, blurb]) => [id, { id, name, tier, color, blurb, price: ENTRANCE_PRICE[tier] }])) as Record<Id, FinaleDef<Id>>;

export const FINISHERS = defs<FinisherId>([
  ['clean', 'Clean Finish', 'common', 0xfff0c0, 'The classic: a ringing blow, a flash of white and the crowd on its feet.'],
  ['frost', 'Frost Shatter', 'rare', 0xbff0ff, 'The fallen freezes solid in mid-air, then bursts into a spray of ice shards.'],
  ['thunder', 'Thunder Verdict', 'rare', 0x7ac8ff, 'The sky passes judgement: a bolt of lightning strikes right where they fall.'],
  ['blossom', 'Blossom Storm', 'rare', 0xffb0d0, 'Time slows to a crawl as a gust of cherry petals sweeps across the arena.'],
  ['inferno', 'Inferno Pyre', 'mythic', 0xff8030, 'A roaring pillar of flame bursts out of the sand where the fallen lands.'],
  ['eclipse', 'Eclipse', 'mythic', 0xff3040, 'The world turns black and red for one heartbeat, cut by a single white line.'],
  ['delayed', 'Delayed Cut', 'mythic', 0xe8e0d0, 'The winner lowers their weapon. Silence. Then the air splits and the fallen drops.'],
  ['starfall', 'Starfall', 'legendary', 0xc8d8ff, 'Night falls on the arena and the stars come raining down on the fallen.'],
  ['dragon', 'Spirit Dragon', 'legendary', 0x60e0c0, 'A glowing spirit dragon coils around the winner and roars at the fallen.'],
  ['judgement', 'Judgement', 'legendary', 0xffd860, 'A giant golden sword falls from the heavens and plants itself behind the fallen.'],
]);

export const POSES = defs<PoseId>([
  ['cheer', 'Cheer', 'common', 0xd8c8a8, 'Weapon up and a shout to the crowd.'],
  ['salute', 'Salute', 'rare', 0x9ad8ff, 'Brings the weapon up before the face in a crisp, proud salute.'],
  ['flex', 'Flex', 'rare', 0xffa060, 'Weapon away, both arms up: just look at these muscles.'],
  ['bow', 'Bow', 'rare', 0xd8c8f0, 'A deep, respectful bow to a worthy rival.'],
  ['twirl', 'Weapon Twirl', 'mythic', 0x9ad8ff, 'Spins the weapon round in a flashy flourish, then plants it.'],
  ['hips', 'Hands on Hips', 'mythic', 0xffd060, 'Fists on the hips, chin up, laughing the whole fight off.'],
  ['meditate', 'Meditate', 'mythic', 0xa0e0c0, 'Kneels and closes their eyes, calm as a still pond.'],
  ['skyward', 'Skyward', 'legendary', 0xfff0b0, 'Raises the weapon to the sky as a pillar of light rises around them.'],
  ['champion', 'Champion', 'legendary', 0xffd040, 'One foot up, weapon on the shoulder, cape in the wind and confetti in the air.'],
]);

/** One kind of finale: its catalogue and the owned list saved under `key`. */
class Shelf<Id extends string> {
  private owned: Id[] | null = null;

  constructor(private readonly key: string, readonly ids: readonly Id[], readonly defs: Record<Id, FinaleDef<Id>>, readonly free: Id) {}

  is = (v: unknown): v is Id => typeof v === 'string' && (this.ids as readonly string[]).includes(v);

  private load(): Id[] {
    if (this.owned) return this.owned;
    let raw: unknown = null;
    try { raw = JSON.parse(localStorage.getItem(this.key) ?? 'null'); } catch { raw = null; }
    this.owned = Array.isArray(raw) ? [...new Set(raw.filter(this.is))] : [];
    return this.owned;
  }

  owns(id: Id): boolean {
    return this.defs[id].price === 0 || allUnlocked() || this.load().includes(id);
  }

  buy(id: Id): boolean {
    const price = this.defs[id].price;
    if (this.owns(id) || gems() < price) return false;
    this.owned = [...this.load(), id];
    try { localStorage.setItem(this.key, JSON.stringify(this.owned)); } catch { /* private mode */ }
    // Paid last: the gem change tells every listener, and by then it is owned.
    return spendGems(price);
  }

  /** The one a hero actually plays: theirs if they own it (or it is not yours), else the free one. */
  of(v: unknown, mine: boolean): Id {
    const id = this.is(v) ? v : this.free;
    return mine && !this.owns(id) ? this.free : id;
  }

  /** A rival's pick: about half keep it plain, the rest show off something fancier. */
  random(r: () => number): Id {
    return r() < 0.45 ? this.free : this.ids[1 + Math.floor(r() * (this.ids.length - 1))];
  }

  reset(): void {
    this.owned = null;
  }
}

const fin = new Shelf('al.finishers', FINISHER_IDS, FINISHERS, 'clean');
const pose = new Shelf('al.poses', POSE_IDS, POSES, 'cheer');

export const FREE_FINISHER: FinisherId = fin.free;
export const FREE_POSE: PoseId = pose.free;

export const isFinisher = fin.is;
export const isPose = pose.is;
export const ownsFinisher = (id: FinisherId): boolean => fin.owns(id);
export const ownsPose = (id: PoseId): boolean => pose.owns(id);
/** Buys with gems. False when short of gems (or already owned). */
export const buyFinisher = (id: FinisherId): boolean => fin.buy(id);
export const buyPose = (id: PoseId): boolean => pose.buy(id);
export const finisherOf = (look: { finisher?: string } | undefined, mine = false): FinisherId => fin.of(look?.finisher, mine);
export const poseOf = (look: { pose?: string } | undefined, mine = false): PoseId => pose.of(look?.pose, mine);
export const randomFinisher = (r: () => number = Math.random): FinisherId => fin.random(r);
export const randomPose = (r: () => number = Math.random): PoseId => pose.random(r);

/** Test hook: forget the loaded state. */
export function resetFinalesForTests(): void {
  fin.reset();
  pose.reset();
}
