import { EVADE } from './abilities';
import type { AbilityDef, GearId, GearSlot, GearSlotIds, Stats } from './types';

/**
 * Gear catalog. Eight slots, and everything a fighter can do comes from here:
 *  - main weapon: basic attack + weapon skill, and the fighting distance.
 *    One-handed or two-handed.
 *  - secondary: a one-handed weapon or tool with one more skill. It is drawn
 *    each time it is used: with a one-handed main the free hand just grabs it;
 *    a two-handed main has to be put away first and taken back after.
 *  - special: an item that works on its own (aura, familiar, or an attack the
 *    item performs itself while the body keeps fighting).
 *  - usable: a potion or bomb on the belt, used a few times per battle. The
 *    free hand grabs it; a two-handed main is held in one hand meanwhile.
 *  - head, chest, legs: passives and stats; some chest pieces grant a defensive skill.
 *  - boots: movement and the evade itself.
 *
 * Passive effects are implemented in the sim by checking `fighter.has.has(id)`.
 */

export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Coarse descriptors the AI and UI can reason about without knowing every id. */
export type GearTag =
  | 'melee' | 'ranged' | 'physical' | 'magic' | 'heavy' | 'fast' | 'mobility'
  | 'guard' | 'parry' | 'reflect' | 'sustain' | 'burst' | 'control' | 'dot' | 'tank' | 'crit' | 'revive';

export interface WeaponInfo {
  /** Hands the main weapon needs. Secondary weapons are always one-handed. */
  hands: 1 | 2;
  /** Fights from range (kites) instead of trading up close. */
  ranged: boolean;
  /** Ideal fighting distance, centre to centre. */
  preferredRange: number;
}

export interface GearDef<S extends GearSlot = GearSlot> {
  id: GearSlotIds[S];
  slot: S;
  name: string;
  rarity: ItemRarity;
  /** Hex colour for UI, icon tint and renderer glow. */
  color: number;
  desc: string;
  /** Short name of the passive effect, if any (described in `desc`). */
  passive?: string;
  /** Flat additions. */
  add?: Partial<Stats>;
  /** Multipliers (applied after all additions). */
  mul?: Partial<Stats>;
  /** Abilities this piece grants, in order. */
  abilities?: AbilityDef[];
  /** Boots only: replaces the default evade. */
  evade?: AbilityDef;
  /** Main weapon only. */
  weapon?: WeaponInfo;
  tags: GearTag[];
}

type Catalog = { [S in GearSlot]: { [K in GearSlotIds[S]]: GearDef<S> } };

// -----------------------------------------------------------------------------
// Main weapons
// -----------------------------------------------------------------------------

const MAIN: Catalog['main'] = {
  longsword: {
    id: 'longsword', slot: 'main', name: 'Longsword', rarity: 'common', color: 0xd8e2f0,
    desc: 'One-handed. Dependable steel: quick cuts and a telegraphed rising cleave that launches.',
    weapon: { hands: 1, ranged: false, preferredRange: 1.75 },
    tags: ['melee', 'physical'],
    abilities: [
      {
        id: 'slash', name: 'Slash', slot: 'basic', kind: 'melee',
        range: 1.95, cost: 0, cooldown: 0.15,
        windup: 0.22, active: 0.1, recovery: 0.3,
        power: 1.5, damageType: 'physical', stagger: 0.22, knockback: 1.2, lunge: 0.3,
        anim: 'slash', desc: 'Reliable sword cut.',
      },
      {
        id: 'rising_cleave', name: 'Rising Cleave', slot: 'skill', kind: 'melee',
        range: 2.25, cost: 15, cooldown: 6,
        windup: 0.58, active: 0.14, recovery: 0.48,
        power: 3.2, damageType: 'physical', heavy: true, knockback: 8, lunge: 0.9, stagger: 0.5,
        anim: 'overhead', desc: 'Telegraphed heavy cleave with big knockback.',
      },
    ],
  },
  katana: {
    id: 'katana', slot: 'main', name: 'Katana', rarity: 'rare', color: 0xf5f0e6,
    desc: 'One-handed. +8% crit. Lightning-fast cuts and a dash that slices straight through.',
    add: { critChance: 0.08 },
    weapon: { hands: 1, ranged: false, preferredRange: 1.7 },
    tags: ['melee', 'physical', 'fast', 'crit', 'mobility'],
    abilities: [
      {
        id: 'swift_cut', name: 'Swift Cut', slot: 'basic', kind: 'melee',
        range: 1.85, cost: 0, cooldown: 0.1,
        windup: 0.15, active: 0.08, recovery: 0.22,
        power: 0.7, damageType: 'physical', stagger: 0.18, knockback: 0.8, lunge: 0.35,
        anim: 'slash', desc: 'Lightning-fast katana cut.',
      },
      {
        id: 'iaido', name: 'Iaido Dash', slot: 'skill', kind: 'dash',
        range: 4.4, cost: 15, cooldown: 6,
        windup: 0.3, active: 0.18, recovery: 0.32,
        power: 1.7, damageType: 'physical', heavy: true,
        dash: { distance: 5.2, through: true, iframes: 0.18, strike: true },
        stagger: 0.4,
        anim: 'dash', desc: 'Dash straight through the enemy with a drawn cut.',
      },
    ],
  },
  mace: {
    id: 'mace', slot: 'main', name: 'Flanged Mace', rarity: 'rare', color: 0xc7b07a,
    desc: 'One-handed. +0.05 poise. Heavy blows that rattle, and a skull-cracking overhead that stuns.',
    add: { poise: 0.05 },
    weapon: { hands: 1, ranged: false, preferredRange: 1.65 },
    tags: ['melee', 'physical', 'heavy', 'control'],
    abilities: [
      {
        id: 'mace_blow', name: 'Mace Blow', slot: 'basic', kind: 'melee',
        range: 1.8, cost: 0, cooldown: 0.18,
        windup: 0.3, active: 0.1, recovery: 0.36,
        power: 1.75, damageType: 'physical', stagger: 0.3, knockback: 2.2, lunge: 0.3,
        anim: 'slash', desc: 'Heavy mace blow that rattles the target.',
      },
      {
        id: 'skull_crack', name: 'Skull Crack', slot: 'skill', kind: 'melee',
        range: 1.95, cost: 15, cooldown: 7,
        windup: 0.5, active: 0.12, recovery: 0.46,
        power: 2.4, damageType: 'physical', heavy: true, stun: 0.9, knockback: 3, lunge: 0.6,
        anim: 'overhead', desc: 'Overhead smash that stuns.',
      },
    ],
  },
  dagger: {
    id: 'dagger', slot: 'main', name: 'Venom Dagger', rarity: 'epic', color: 0x8cff3a,
    desc: 'One-handed. +8% crit, +6% attack speed. Every stab poisons; the flurry stacks venom fast.',
    add: { critChance: 0.08 }, mul: { attackSpeed: 1.06 },
    weapon: { hands: 1, ranged: false, preferredRange: 1.45 },
    tags: ['melee', 'physical', 'fast', 'dot'],
    abilities: [
      {
        id: 'stab', name: 'Stab', slot: 'basic', kind: 'melee',
        range: 1.65, cost: 0, cooldown: 0.1,
        windup: 0.13, active: 0.08, recovery: 0.22,
        power: 0.66, damageType: 'physical', stagger: 0.14, knockback: 0.6, lunge: 0.35,
        applies: [{ status: 'poison', duration: 3 }],
        anim: 'thrust', desc: 'Quick stab that poisons.',
      },
      {
        id: 'venom_flurry', name: 'Venom Flurry', slot: 'skill', kind: 'melee',
        range: 1.85, cost: 15, cooldown: 7,
        windup: 0.22, active: 0.4, recovery: 0.36,
        power: 0.42, damageType: 'physical', hits: 4, stagger: 0.2, knockback: 0.5, lunge: 0.8,
        applies: [{ status: 'poison', duration: 4 }],
        anim: 'flurry', desc: 'Four-hit flurry that piles on poison.',
      },
    ],
  },
  ember_wand: {
    id: 'ember_wand', slot: 'main', name: 'Ember Wand', rarity: 'rare', color: 0xff7a2a,
    desc: 'One-handed. Fire from range: firebolts that burn, and a wave of flame along the ground.',
    weapon: { hands: 1, ranged: true, preferredRange: 6 },
    tags: ['ranged', 'magic', 'dot'],
    abilities: [
      {
        id: 'firebolt', name: 'Firebolt', slot: 'basic', kind: 'projectile',
        range: 10, cost: 0, cooldown: 0.4,
        windup: 0.24, active: 0.05, recovery: 0.26,
        power: 0.38, damageType: 'magic', stagger: 0.12,
        applies: [{ status: 'burn', duration: 1.5 }],
        projectile: { speed: 16, radius: 0.3, style: 'fire' },
        anim: 'cast', desc: 'Quick firebolt that burns.',
      },
      {
        id: 'flame_wave', name: 'Flame Wave', slot: 'skill', kind: 'projectile',
        range: 9, cost: 15, cooldown: 7,
        windup: 0.45, active: 0.1, recovery: 0.38,
        power: 1.1, damageType: 'magic', heavy: true, knockback: 3,
        applies: [{ status: 'burn', duration: 3, stacks: 2 }],
        projectile: { speed: 10, radius: 0.6, style: 'flamewave', ground: true },
        anim: 'castBig', desc: 'A wave of flame rolls along the ground.',
      },
    ],
  },
  warhammer: {
    id: 'warhammer', slot: 'main', name: 'Warhammer', rarity: 'rare', color: 0xff8a2a,
    desc: 'Two-handed. +0.06 poise. Slow, crushing swings that can\'t be interrupted, and an unblockable ground shockwave.',
    add: { poise: 0.06 },
    weapon: { hands: 2, ranged: false, preferredRange: 1.9 },
    tags: ['melee', 'physical', 'heavy', 'control'],
    abilities: [
      {
        id: 'hammer', name: 'Hammer Swing', slot: 'basic', kind: 'melee',
        range: 2.05, cost: 0, cooldown: 0.2,
        windup: 0.4, active: 0.12, recovery: 0.42,
        power: 1.8, damageType: 'physical', stagger: 0.38, knockback: 3.5, lunge: 0.35, hyperArmor: true,
        anim: 'slash', desc: 'Heavy swing with hyper armor.',
      },
      {
        id: 'ground_slam', name: 'Ground Slam', slot: 'skill', kind: 'projectile',
        range: 9, cost: 15, cooldown: 7,
        windup: 0.5, active: 0.1, recovery: 0.4,
        power: 1.6, damageType: 'physical', heavy: true, stun: 0.6, unblockable: true,
        projectile: { speed: 11, radius: 0.6, style: 'groundwave', ground: true },
        anim: 'slam', desc: 'Sends an unblockable shockwave along the ground.',
      },
    ],
  },
  spear: {
    id: 'spear', slot: 'main', name: 'War Spear', rarity: 'rare', color: 0xc9d27a,
    desc: 'Two-handed. The longest melee reach. Keeps enemies at the tip, then skewers them across the arena.',
    weapon: { hands: 2, ranged: false, preferredRange: 2.2 },
    tags: ['melee', 'physical', 'control'],
    abilities: [
      {
        id: 'thrust', name: 'Thrust', slot: 'basic', kind: 'melee',
        range: 2.55, cost: 0, cooldown: 0.15,
        windup: 0.24, active: 0.1, recovery: 0.3,
        power: 1.42, damageType: 'physical', stagger: 0.2, knockback: 1.6, lunge: 0.35,
        anim: 'thrust', desc: 'Long-reaching jab.',
      },
      {
        id: 'skewer', name: 'Skewering Lunge', slot: 'skill', kind: 'melee',
        range: 2.6, cost: 15, cooldown: 6.5,
        windup: 0.42, active: 0.14, recovery: 0.45,
        power: 2.9, damageType: 'physical', heavy: true, knockback: 6.5, lunge: 1.8, stagger: 0.45,
        anim: 'thrust', desc: 'Covers ground in one lunge and drives the enemy back.',
      },
    ],
  },
  greataxe: {
    id: 'greataxe', slot: 'main', name: 'Greataxe', rarity: 'epic', color: 0xd04a3a,
    desc: 'Two-handed. Heals for 6% of damage dealt. Wide cleaves and a whirlwind that ploughs forward.',
    add: { lifesteal: 0.06 },
    weapon: { hands: 2, ranged: false, preferredRange: 1.85 },
    tags: ['melee', 'physical', 'heavy', 'sustain'],
    abilities: [
      {
        id: 'cleave', name: 'Cleave', slot: 'basic', kind: 'melee',
        range: 2.1, cost: 0, cooldown: 0.2,
        windup: 0.34, active: 0.12, recovery: 0.4,
        power: 2.0, damageType: 'physical', stagger: 0.34, knockback: 3, lunge: 0.35,
        anim: 'slash', desc: 'Wide, heavy cleave.',
      },
      {
        id: 'whirlwind', name: 'Whirlwind', slot: 'skill', kind: 'melee',
        range: 2.2, cost: 15, cooldown: 7,
        windup: 0.32, active: 0.5, recovery: 0.45,
        power: 1.2, damageType: 'physical', hits: 3, stagger: 0.3, knockback: 2, lunge: 1.6, hyperArmor: true,
        anim: 'spin', desc: 'Spins forward with the axe, three hits with hyper armor.',
      },
    ],
  },
  arcane_staff: {
    id: 'arcane_staff', slot: 'main', name: 'Arcane Staff', rarity: 'epic', color: 0x9b5cff,
    desc: 'Two-handed. Magic from range: steady bolts and a slow cursed orb that marks and burns.',
    weapon: { hands: 2, ranged: true, preferredRange: 6.5 },
    tags: ['ranged', 'magic', 'dot'],
    abilities: [
      {
        id: 'arcane_bolt', name: 'Arcane Bolt', slot: 'basic', kind: 'projectile',
        range: 11, cost: 0, cooldown: 0.35,
        windup: 0.28, active: 0.05, recovery: 0.28,
        power: 0.63, damageType: 'magic', stagger: 0.15,
        projectile: { speed: 17, radius: 0.32, style: 'arcane' },
        anim: 'cast', desc: 'Quick arcane missile.',
      },
      {
        id: 'hex_orb', name: 'Hex Orb', slot: 'skill', kind: 'projectile',
        range: 11, cost: 20, cooldown: 8,
        windup: 0.4, active: 0.05, recovery: 0.32,
        power: 1.3, damageType: 'magic', stagger: 0.3,
        applies: [{ status: 'mark', duration: 4 }, { status: 'burn', duration: 3, stacks: 2 }],
        projectile: { speed: 8, radius: 0.55, style: 'hex' },
        anim: 'castBig', desc: 'Slow cursed orb: marks (+15% damage taken) and burns.',
      },
    ],
  },
  longbow: {
    id: 'longbow', slot: 'main', name: 'Longbow', rarity: 'rare', color: 0xb98a4a,
    desc: 'Two-handed. Physical damage from range. Fast arrows and a heavy power shot that marks and knocks back.',
    weapon: { hands: 2, ranged: true, preferredRange: 7 },
    tags: ['ranged', 'physical'],
    abilities: [
      {
        id: 'arrow', name: 'Arrow', slot: 'basic', kind: 'projectile',
        range: 12, cost: 0, cooldown: 0.3,
        windup: 0.32, active: 0.05, recovery: 0.3,
        power: 0.8, damageType: 'physical', stagger: 0.15,
        projectile: { speed: 22, radius: 0.25, style: 'arrow' },
        anim: 'shoot', desc: 'Fast arrow.',
      },
      {
        id: 'power_shot', name: 'Power Shot', slot: 'skill', kind: 'projectile',
        range: 12, cost: 15, cooldown: 6.5,
        windup: 0.55, active: 0.05, recovery: 0.36,
        power: 1.8, damageType: 'physical', heavy: true, knockback: 5, stagger: 0.4,
        applies: [{ status: 'mark', duration: 4 }],
        projectile: { speed: 26, radius: 0.32, style: 'arrow' },
        anim: 'shoot', desc: 'Fully drawn shot: heavy hit, knockback and a mark.',
      },
    ],
  },
  chain_sickle: {
    id: 'chain_sickle', slot: 'main', name: 'Chain Sickle', rarity: 'epic', color: 0x9fb4bc,
    desc: 'One-handed. Quick hooked cuts, and a weighted chain thrown out to drag the enemy right in front of you.',
    weapon: { hands: 1, ranged: false, preferredRange: 1.7 },
    tags: ['melee', 'physical', 'control'],
    abilities: [
      {
        id: 'sickle_cut', name: 'Sickle Cut', slot: 'basic', kind: 'melee',
        range: 1.85, cost: 0, cooldown: 0.12,
        windup: 0.19, active: 0.09, recovery: 0.27,
        power: 1.25, damageType: 'physical', stagger: 0.2, knockback: 0.8, lunge: 0.3,
        anim: 'slash', desc: 'Quick hooked cut.',
      },
      {
        id: 'chain_hook', name: 'Chain Hook', slot: 'skill', kind: 'projectile',
        range: 7.5, cost: 15, cooldown: 6,
        windup: 0.3, active: 0.06, recovery: 0.34,
        power: 0.6, damageType: 'physical', stagger: 0.45, pull: true,
        projectile: { speed: 20, radius: 0.3, style: 'hook' },
        anim: 'thrust', desc: 'Throws the weighted chain: on a hit, drags the enemy right in front of you.',
      },
    ],
  },
  soul_scythe: {
    id: 'soul_scythe', slot: 'main', name: 'Soul Scythe', rarity: 'legendary', color: 0x7affc8,
    desc: 'Two-handed. Every reap steals the enemy\'s energy; Grave Harvest silences them: no skills, secondary, items or potions for 2.5s.',
    weapon: { hands: 2, ranged: false, preferredRange: 2.0 },
    tags: ['melee', 'physical', 'heavy', 'control'],
    abilities: [
      {
        id: 'reap', name: 'Reap', slot: 'basic', kind: 'melee',
        range: 2.3, cost: 0, cooldown: 0.2,
        windup: 0.36, active: 0.12, recovery: 0.4,
        power: 1.75, damageType: 'physical', stagger: 0.32, knockback: 2, lunge: 0.35, drainEnergy: 8,
        anim: 'slash', desc: 'Wide reaping cut that steals 8 energy.',
      },
      {
        id: 'grave_harvest', name: 'Grave Harvest', slot: 'skill', kind: 'melee',
        range: 2.4, cost: 15, cooldown: 8,
        windup: 0.52, active: 0.14, recovery: 0.46,
        power: 2.6, damageType: 'physical', heavy: true, stagger: 0.45, knockback: 3, lunge: 0.7, drainEnergy: 25,
        applies: [{ status: 'silence', duration: 2.5 }],
        anim: 'overhead', desc: 'Harvests the soul: steals 25 energy and silences for 2.5s.',
      },
    ],
  },
  rapier: {
    id: 'rapier', slot: 'main', name: 'Duelist Rapier', rarity: 'rare', color: 0xe8e0c8,
    desc: 'One-handed. +6% crit, +5% attack speed. Long, needle-fast thrusts, and a lunging fleche that ignores armour.',
    add: { critChance: 0.06 }, mul: { attackSpeed: 1.05 },
    weapon: { hands: 1, ranged: false, preferredRange: 1.85 },
    tags: ['melee', 'physical', 'fast', 'crit'],
    abilities: [
      {
        id: 'pierce', name: 'Pierce', slot: 'basic', kind: 'melee',
        range: 2.1, cost: 0, cooldown: 0.1,
        windup: 0.16, active: 0.08, recovery: 0.25,
        power: 0.95, damageType: 'physical', stagger: 0.16, knockback: 0.6, lunge: 0.4,
        anim: 'thrust', desc: 'Long, quick thrust.',
      },
      {
        id: 'fleche', name: 'Fleche', slot: 'skill', kind: 'melee',
        range: 2.2, cost: 15, cooldown: 6,
        windup: 0.34, active: 0.12, recovery: 0.42,
        power: 2.2, damageType: 'true', heavy: true, stagger: 0.4, knockback: 2.5, lunge: 2.0,
        anim: 'thrust', desc: 'Flying lunge that pierces straight through armour (true damage).',
      },
    ],
  },
  storm_rod: {
    id: 'storm_rod', slot: 'main', name: 'Storm Rod', rarity: 'rare', color: 0x8fd8ff,
    desc: 'One-handed. Crackling sparks from mid range, and a thunderclap that stuns and blasts back anyone who gets close.',
    weapon: { hands: 1, ranged: true, preferredRange: 5 },
    tags: ['ranged', 'magic', 'control'],
    abilities: [
      {
        id: 'spark', name: 'Spark', slot: 'basic', kind: 'projectile',
        range: 7.5, cost: 0, cooldown: 0.3,
        windup: 0.2, active: 0.05, recovery: 0.24,
        power: 0.5, damageType: 'magic', stagger: 0.1,
        projectile: { speed: 24, radius: 0.28, style: 'spark' },
        anim: 'cast', desc: 'Fast spark of lightning.',
      },
      {
        id: 'thunderclap', name: 'Thunderclap', slot: 'skill', kind: 'aoe',
        range: 2.6, cost: 15, cooldown: 7,
        windup: 0.3, active: 0.1, recovery: 0.36,
        power: 1.2, damageType: 'magic', stun: 0.6, knockback: 6,
        anim: 'castBig', desc: 'Thunder bursts around you: stuns and blasts back.',
      },
    ],
  },
  halberd: {
    id: 'halberd', slot: 'main', name: 'Halberd', rarity: 'rare', color: 0xb8c0cc,
    desc: 'Two-handed. +0.04 poise. Long chopping reach between a sword and a spear, and a crescent chop that knocks the enemy off their feet.',
    add: { poise: 0.04 },
    weapon: { hands: 2, ranged: false, preferredRange: 2.15 },
    tags: ['melee', 'physical', 'heavy', 'control'],
    abilities: [
      {
        id: 'halberd_chop', name: 'Chop', slot: 'basic', kind: 'melee',
        range: 2.45, cost: 0, cooldown: 0.2,
        windup: 0.34, active: 0.12, recovery: 0.4,
        power: 1.7, damageType: 'physical', stagger: 0.3, knockback: 2.6, lunge: 0.35,
        anim: 'slash', desc: 'Long chopping swing.',
      },
      {
        id: 'crescent_chop', name: 'Crescent Chop', slot: 'skill', kind: 'melee',
        range: 2.7, cost: 15, cooldown: 7,
        windup: 0.55, active: 0.14, recovery: 0.48,
        power: 2.7, damageType: 'physical', heavy: true, stun: 0.5, knockback: 5, stagger: 0.5, lunge: 0.6,
        anim: 'overhead', desc: 'Huge overhead chop at the very tip: knocks down (stun) and back.',
      },
    ],
  },
  grave_staff: {
    id: 'grave_staff', slot: 'main', name: 'Grave Staff', rarity: 'epic', color: 0xc8f0a0,
    desc: 'Two-handed. Soul bolts that heal you for a third of their damage, and bone spikes along the ground that root the enemy in place.',
    weapon: { hands: 2, ranged: true, preferredRange: 6 },
    tags: ['ranged', 'magic', 'sustain', 'control'],
    abilities: [
      {
        id: 'soul_bolt', name: 'Soul Bolt', slot: 'basic', kind: 'projectile',
        range: 10, cost: 0, cooldown: 0.38,
        windup: 0.28, active: 0.05, recovery: 0.28,
        power: 0.55, damageType: 'magic', stagger: 0.12, drainLife: 0.35,
        projectile: { speed: 15, radius: 0.32, style: 'soul' },
        anim: 'cast', desc: 'Soul bolt: heals you for 35% of its damage.',
      },
      {
        id: 'bone_spikes', name: 'Bone Spikes', slot: 'skill', kind: 'projectile',
        range: 9, cost: 15, cooldown: 7,
        windup: 0.42, active: 0.08, recovery: 0.36,
        power: 1.1, damageType: 'magic', heavy: true, stagger: 0.3,
        applies: [{ status: 'root', duration: 1.6 }],
        projectile: { speed: 12, radius: 0.55, style: 'bonespike', ground: true },
        anim: 'castBig', desc: 'Bone spikes burst along the ground: root for 1.6s.',
      },
    ],
  },
};

// -----------------------------------------------------------------------------
// Secondary weapons (always one-handed, drawn when used)
// -----------------------------------------------------------------------------

const SECONDARY: Catalog['secondary'] = {
  kite_shield: {
    id: 'kite_shield', slot: 'secondary', name: 'Kite Shield', rarity: 'rare', color: 0x3d7bff,
    desc: '+10 armor. Raise the shield to block 70%; perfect timing parries and reflects projectiles.',
    add: { armor: 10, poise: 0.04 },
    tags: ['guard', 'parry', 'reflect', 'tank'],
    abilities: [{
      id: 'bulwark', name: 'Bulwark', slot: 'secondary', kind: 'guard',
      range: 0, cost: 0, cooldown: 4,
      windup: 0.05, active: 1.1, recovery: 0.2,
      power: 0, damageType: 'physical',
      guard: { reduction: 0.7, parryWindow: 0.22, reflectProjectiles: true },
      anim: 'guard', desc: 'Raise the shield. Perfect timing parries and reflects projectiles.',
    }],
  },
  parrying_dagger: {
    id: 'parrying_dagger', slot: 'secondary', name: 'Parrying Dagger', rarity: 'epic', color: 0xe0404a,
    desc: '+4% crit. A wide parry window; a parry triggers an instant riposte.',
    add: { critChance: 0.04 },
    tags: ['parry', 'burst'],
    abilities: [{
      id: 'counter', name: 'Counter Stance', slot: 'secondary', kind: 'guard',
      range: 0, cost: 0, cooldown: 4.5,
      windup: 0.04, active: 0.75, recovery: 0.28,
      power: 0, damageType: 'physical',
      guard: { reduction: 0.35, parryWindow: 0.5, counterPower: 2.2 },
      anim: 'counter', desc: 'Wide parry window; a parry triggers an instant riposte.',
    }],
  },
  buckler: {
    id: 'buckler', slot: 'secondary', name: 'Spiked Buckler', rarity: 'rare', color: 0xa0a8b8,
    desc: '+6 armor. A fast shield bash that stuns: the answer to anyone winding up.',
    add: { armor: 6 },
    tags: ['melee', 'physical', 'control'],
    abilities: [{
      id: 'shield_bash', name: 'Shield Bash', slot: 'secondary', kind: 'melee',
      range: 1.7, cost: 10, cooldown: 7,
      windup: 0.2, active: 0.1, recovery: 0.38,
      power: 0.65, damageType: 'physical', stun: 0.9, knockback: 4.5, lunge: 0.5,
      anim: 'bash', desc: 'Fast bash that stuns.',
    }],
  },
  throwing_knives: {
    id: 'throwing_knives', slot: 'secondary', name: 'Throwing Knives', rarity: 'common', color: 0xcfd6e0,
    desc: 'A cheap, fast knife toss to poke, interrupt or finish.',
    tags: ['ranged', 'physical', 'fast'],
    abilities: [{
      id: 'knife_toss', name: 'Knife Toss', slot: 'secondary', kind: 'projectile',
      range: 9, cost: 5, cooldown: 3,
      windup: 0.16, active: 0.05, recovery: 0.22,
      power: 0.55, damageType: 'physical', stagger: 0.12,
      projectile: { speed: 20, radius: 0.25, style: 'knife' },
      anim: 'throw', desc: 'Quick thrown knife.',
    }],
  },
  hand_crossbow: {
    id: 'hand_crossbow', slot: 'secondary', name: 'Hand Crossbow', rarity: 'rare', color: 0x8a6a4a,
    desc: 'A hard-hitting bolt that marks the target (+15% damage taken).',
    tags: ['ranged', 'physical'],
    abilities: [{
      id: 'crossbow_bolt', name: 'Crossbow Bolt', slot: 'secondary', kind: 'projectile',
      range: 11, cost: 10, cooldown: 5,
      windup: 0.3, active: 0.05, recovery: 0.28,
      power: 1.15, damageType: 'physical', stagger: 0.25,
      applies: [{ status: 'mark', duration: 3 }],
      projectile: { speed: 24, radius: 0.28, style: 'bolt' },
      anim: 'crossbow', desc: 'Bolt that marks.',
    }],
  },
  wind_chakram: {
    id: 'wind_chakram', slot: 'secondary', name: 'Wind Chakram', rarity: 'rare', color: 0xbff0ff,
    desc: 'A bladed ring that flies out and comes back, cutting on the way out and on the way back.',
    tags: ['ranged', 'physical'],
    abilities: [{
      id: 'chakram', name: 'Chakram', slot: 'secondary', kind: 'projectile',
      range: 7.5, cost: 10, cooldown: 5,
      windup: 0.24, active: 0.06, recovery: 0.3,
      power: 0.72, damageType: 'physical', stagger: 0.2,
      projectile: { speed: 14, radius: 0.42, style: 'chakram', returns: true },
      anim: 'throw', desc: 'Thrown ring that returns to the hand.',
    }],
  },
  frost_wand: {
    id: 'frost_wand', slot: 'secondary', name: 'Frost Wand', rarity: 'epic', color: 0x7fe0ff,
    desc: 'A burst of frost around you: chills and repels anyone too close.',
    tags: ['magic', 'control'],
    abilities: [{
      id: 'frost_nova', name: 'Frost Nova', slot: 'secondary', kind: 'aoe',
      range: 2.5, cost: 15, cooldown: 6,
      windup: 0.3, active: 0.1, recovery: 0.36,
      power: 1.1, damageType: 'magic', knockback: 7,
      applies: [{ status: 'chill', duration: 3, stacks: 2 }],
      anim: 'castBig', desc: 'Burst of frost around you. Chills and repels.',
    }],
  },
  war_horn: {
    id: 'war_horn', slot: 'secondary', name: 'War Horn', rarity: 'epic', color: 0xd12020,
    desc: 'Sound the horn: enrage (+25% damage, +15% speed) and heal a little.',
    tags: ['sustain', 'burst'],
    abilities: [{
      id: 'war_cry', name: 'War Cry', slot: 'secondary', kind: 'buff',
      range: 0, cost: 20, cooldown: 14,
      windup: 0.36, active: 0.1, recovery: 0.3,
      power: 0, damageType: 'physical', heal: 0.06,
      buff: [{ status: 'rage', duration: 6 }],
      anim: 'horn', desc: 'Enrage (+25% damage, +15% speed) and heal.',
    }],
  },
  bolas: {
    id: 'bolas', slot: 'secondary', name: 'Hunter\'s Bolas', rarity: 'rare', color: 0xc89a5a,
    desc: 'Whirled and thrown: wraps the legs, rooting the enemy for 2s. Rooted, they can\'t walk, dash or evade, only fight where they stand.',
    tags: ['ranged', 'physical', 'control'],
    abilities: [{
      id: 'bolas_throw', name: 'Bolas', slot: 'secondary', kind: 'projectile',
      range: 8, cost: 10, cooldown: 8,
      windup: 0.24, active: 0.06, recovery: 0.3,
      power: 0.35, damageType: 'physical', stagger: 0.2,
      applies: [{ status: 'root', duration: 2 }],
      projectile: { speed: 16, radius: 0.4, style: 'bolas' },
      anim: 'throw', desc: 'Wraps the legs: root for 2s.',
    }],
  },
  trickster_talisman: {
    id: 'trickster_talisman', slot: 'secondary', name: 'Trickster Talisman', rarity: 'legendary', color: 0xffc84a,
    desc: 'A two-faced charm: trade places with the enemy in a flash. Put them in your corner, slip out of theirs, or leave their windup swinging at nothing.',
    tags: ['magic', 'mobility'],
    abilities: [{
      id: 'switcheroo', name: 'Switcheroo', slot: 'secondary', kind: 'swap',
      range: 7, cost: 15, cooldown: 9,
      windup: 0.2, active: 0.08, recovery: 0.24,
      power: 0, damageType: 'magic', iframes: 0.3,
      anim: 'castBig', desc: 'Trade places with the enemy; their windup is thrown off.',
    }],
  },
  tower_shield: {
    id: 'tower_shield', slot: 'secondary', name: 'Tower Shield', rarity: 'rare', color: 0x8a96a8,
    desc: '+18 armor, 20% less knockback, −5% move. A wall of iron: blocks 88% from the front for a long time, but the parry window is tight.',
    add: { armor: 18, poise: 0.05 }, mul: { moveSpeed: 0.95, knockbackTaken: 0.8 },
    tags: ['guard', 'tank'],
    abilities: [{
      id: 'shield_wall', name: 'Shield Wall', slot: 'secondary', kind: 'guard',
      range: 0, cost: 0, cooldown: 3.5,
      windup: 0.06, active: 1.4, recovery: 0.24,
      power: 0, damageType: 'physical',
      guard: { reduction: 0.88, parryWindow: 0.1 },
      anim: 'guard', desc: 'Plant the tower shield: blocks 88%. Tight parry window.',
    }],
  },
  javelin: {
    id: 'javelin', slot: 'secondary', name: 'Javelins', rarity: 'common', color: 0xc8a878,
    desc: 'A heavy throwing spear: big damage and knockback from far away, slamming them into the wall when they\'re close to it.',
    tags: ['ranged', 'physical'],
    abilities: [{
      id: 'javelin_throw', name: 'Javelin', slot: 'secondary', kind: 'projectile',
      range: 10, cost: 15, cooldown: 7,
      windup: 0.32, active: 0.06, recovery: 0.3,
      power: 1.3, damageType: 'physical', heavy: true, stagger: 0.35, knockback: 5,
      projectile: { speed: 18, radius: 0.3, style: 'javelin' },
      anim: 'throw', desc: 'Heavy javelin with big knockback.',
    }],
  },
  iron_cestus: {
    id: 'iron_cestus', slot: 'secondary', name: 'Iron Cestus', rarity: 'rare', color: 0x9aa0a8,
    desc: '+3 power, +6 armor. A fast iron-knuckle uppercut that launches the enemy into the air, helpless until they land.',
    add: { power: 3, armor: 6 },
    tags: ['melee', 'physical', 'control'],
    abilities: [{
      id: 'uppercut', name: 'Uppercut', slot: 'secondary', kind: 'melee',
      range: 1.6, cost: 10, cooldown: 7,
      windup: 0.18, active: 0.1, recovery: 0.4,
      power: 0.9, damageType: 'physical', stagger: 0.3, launch: 9, lunge: 0.4,
      anim: 'bash', desc: 'Uppercut that launches the enemy into the air.',
    }],
  },
};

// -----------------------------------------------------------------------------
// Special items: they work on their own, no hands involved
// -----------------------------------------------------------------------------

const SPECIAL: Catalog['special'] = {
  meteor_sigil: {
    id: 'meteor_sigil', slot: 'special', name: 'Meteor Sigil', rarity: 'legendary', color: 0xff6a1a,
    desc: '+5 power. A floating sigil. With a full energy bar it calls a meteor on the predicted enemy position, while you keep fighting.',
    add: { power: 5 },
    tags: ['magic', 'burst', 'ranged'],
    abilities: [{
      id: 'meteor', name: 'Meteor', slot: 'item', kind: 'meteor',
      range: 14, cost: 100, cooldown: 10,
      windup: 0.7, active: 0.1, recovery: 0,
      power: 6.0, damageType: 'magic', heavy: true, knockback: 6, stun: 0.5,
      applies: [{ status: 'burn', duration: 4, stacks: 3 }],
      projectile: { speed: 14, radius: 2.5, style: 'meteor' },
      anim: 'item', desc: 'The sigil calls a meteor on the predicted enemy position.',
    }],
  },
  phantom_blade: {
    id: 'phantom_blade', slot: 'special', name: 'Phantom Blade', rarity: 'legendary', color: 0xb0c8ff,
    desc: '+5 power. A ghostly sword hovers at your back. With a full energy bar it flies at the enemy and cuts eight times on its own.',
    add: { power: 5 },
    tags: ['melee', 'burst'],
    abilities: [{
      id: 'phantom_flurry', name: 'Phantom Flurry', slot: 'item', kind: 'blade',
      range: 7, cost: 100, cooldown: 10,
      windup: 0.4, active: 0.95, recovery: 0,
      power: 0.4, damageType: 'physical', hits: 8, stagger: 0.22, knockback: 0.4,
      anim: 'item', desc: 'The blade flies at the enemy and strikes eight times.',
    }],
  },
  wisp_lantern: {
    id: 'wisp_lantern', slot: 'special', name: 'Wisp Lantern', rarity: 'epic', color: 0x9effd8,
    desc: 'A lantern spirit floats beside you and shoots a small spirit bolt at the enemy every few seconds.',
    passive: 'Familiar',
    tags: ['magic', 'ranged'],
  },
  phoenix_feather: {
    id: 'phoenix_feather', slot: 'special', name: 'Phoenix Feather', rarity: 'legendary', color: 0xff9a2e,
    desc: 'Once per battle, revive at 15% HP in a burst of flame.',
    passive: 'Rebirth',
    tags: ['revive'],
  },
  echo_stone: {
    id: 'echo_stone', slot: 'special', name: 'Echo Stone', rarity: 'legendary', color: 0x6b8cff,
    desc: 'An orbiting stone. Hits have a 35% chance to echo for 60% damage a moment later.',
    passive: 'Echo',
    tags: ['burst'],
  },
  vampiric_fang: {
    id: 'vampiric_fang', slot: 'special', name: 'Vampiric Fang', rarity: 'epic', color: 0xff2e55,
    desc: 'Heal for 21% of damage dealt.',
    passive: 'Lifesteal',
    add: { lifesteal: 0.21 },
    tags: ['sustain'],
  },
  ember_core: {
    id: 'ember_core', slot: 'special', name: 'Ember Core', rarity: 'epic', color: 0xff6a1a,
    desc: 'Wreathes you in embers. Hits have a 50% chance to ignite (stacking burn).',
    passive: 'Ignite',
    tags: ['dot', 'magic'],
  },
  frost_core: {
    id: 'frost_core', slot: 'special', name: 'Frost Core', rarity: 'epic', color: 0x7fe0ff,
    desc: 'A cold aura. Hits have a 50% chance to chill (−8% speed per stack). 5 stacks freeze solid.',
    passive: 'Chill',
    tags: ['control', 'magic'],
  },
  thunder_totem: {
    id: 'thunder_totem', slot: 'special', name: 'Thunder Totem', rarity: 'epic', color: 0x9fd8ff,
    desc: 'At half an energy bar, plants a totem beside you for 7s. Lightning strikes anyone inside its circle every 0.9s, chilling them. Fight on your ground.',
    tags: ['magic', 'control'],
    abilities: [{
      id: 'thunder_totem', name: 'Thunder Totem', slot: 'item', kind: 'totem',
      range: 4, cost: 50, cooldown: 12,
      windup: 0.4, active: 0.1, recovery: 0,
      power: 0.5, damageType: 'magic', stagger: 0.12,
      applies: [{ status: 'chill', duration: 2 }],
      totem: { life: 7, radius: 3, every: 0.9 },
      anim: 'item', desc: 'Plants a totem that zaps the enemy in its circle.',
    }],
  },
  hourglass: {
    id: 'hourglass', slot: 'special', name: 'Sands of Time', rarity: 'legendary', color: 0xf0d080,
    desc: '+8 resist. Once per battle, a blow that would drop you under 25% HP turns time back 3s: health and position return, harmful effects wash off.',
    passive: 'Rewind',
    add: { resist: 8 },
    tags: ['revive', 'sustain'],
  },
  ward_stone: {
    id: 'ward_stone', slot: 'special', name: 'Ward Stone', rarity: 'rare', color: 0x8ac8ff,
    desc: '+8 resist. Whenever you have no shield, every 10s the stone wraps you in one worth 8% of max HP.',
    passive: 'Ward',
    add: { resist: 8 },
    tags: ['sustain', 'tank'],
  },
  hunter_hawk: {
    id: 'hunter_hawk', slot: 'special', name: 'Hunting Hawk', rarity: 'epic', color: 0xc8925a,
    desc: 'A hawk rides your shoulder. Every 4.5s it dives at the enemy, marking them (+15% damage taken).',
    passive: 'Familiar',
    tags: ['physical', 'ranged'],
  },
  dragon_whelp: {
    id: 'dragon_whelp', slot: 'special', name: 'Dragon Whelp', rarity: 'epic', color: 0xff7a3a,
    desc: 'A whelp perches on your shoulder. When the enemy comes within 4.5m, it breathes fire on them every 5s (2 stacks of burn).',
    passive: 'Familiar',
    tags: ['magic', 'dot'],
  },
};

// -----------------------------------------------------------------------------
// Usable items: potions and bombs on the belt, a few uses per battle
// -----------------------------------------------------------------------------

/** Drinking: uncork, gulp, toss the empty bottle. Effects land as the gulp starts. */
const DRINK = {
  slot: 'usable', kind: 'buff', range: 0, cost: 0, power: 0, damageType: 'magic',
  windup: 0.3, active: 0.22, recovery: 0.3, anim: 'drink',
} as const;

const USABLE: Catalog['usable'] = {
  healing_potion: {
    id: 'healing_potion', slot: 'usable', name: 'Healing Potion', rarity: 'common', color: 0xff4a5a,
    desc: 'Two per battle. Drink to heal 12% of max HP.',
    tags: ['sustain'],
    abilities: [{ ...DRINK, id: 'healing_potion', name: 'Healing Potion', cooldown: 6, uses: 2, heal: 0.12, desc: 'Heal 12% of max HP. Two per battle.' }],
  },
  swiftness_draught: {
    id: 'swiftness_draught', slot: 'usable', name: 'Swiftness Draught', rarity: 'rare', color: 0x5ef0e0,
    desc: 'Two per battle. Drink for haste: +30% move speed and +20% attack speed for 6s.',
    tags: ['fast', 'mobility'],
    abilities: [{ ...DRINK, id: 'swiftness_draught', name: 'Swiftness Draught', cooldown: 10, uses: 2, buff: [{ status: 'haste', duration: 6 }], desc: 'Haste for 6s. Two per battle.' }],
  },
  fury_tonic: {
    id: 'fury_tonic', slot: 'usable', name: 'Fury Tonic', rarity: 'rare', color: 0xff6a2a,
    desc: 'Two per battle. Drink to enrage: +25% damage and +15% attack speed for 6s.',
    tags: ['burst'],
    abilities: [{ ...DRINK, id: 'fury_tonic', name: 'Fury Tonic', cooldown: 12, uses: 2, buff: [{ status: 'rage', duration: 6 }], desc: 'Enrage for 6s. Two per battle.' }],
  },
  stoneskin_elixir: {
    id: 'stoneskin_elixir', slot: 'usable', name: 'Stoneskin Elixir', rarity: 'epic', color: 0xb0a890,
    desc: 'Two per battle. Drink to wash off burns, poison, chill and marks, and harden: 50% less damage and unstoppable for 3s.',
    tags: ['tank'],
    abilities: [{ ...DRINK, id: 'stoneskin_elixir', name: 'Stoneskin Elixir', cooldown: 10, uses: 2, cleanse: true, buff: [{ status: 'ironskin', duration: 3 }], desc: 'Cleanse and harden for 3s. Two per battle.' }],
  },
  energy_tonic: {
    id: 'energy_tonic', slot: 'usable', name: 'Energy Tonic', rarity: 'rare', color: 0xffd040,
    desc: 'Two per battle. Drink to restore 60 energy: brings an item ultimate or a big skill much sooner.',
    tags: ['magic'],
    abilities: [{ ...DRINK, id: 'energy_tonic', name: 'Energy Tonic', cooldown: 8, uses: 2, energyGain: 60, desc: 'Restore 60 energy. Two per battle.' }],
  },
  fire_bomb: {
    id: 'fire_bomb', slot: 'usable', name: 'Fire Bomb', rarity: 'epic', color: 0xff8a2a,
    desc: 'Three per battle. Lob a flask of alchemist fire at where the enemy is heading; it bursts on impact and sets them ablaze.',
    tags: ['magic', 'dot', 'ranged'],
    abilities: [{
      id: 'fire_bomb', name: 'Fire Bomb', slot: 'usable', kind: 'projectile',
      range: 8, cost: 0, cooldown: 5, uses: 3,
      windup: 0.3, active: 0.06, recovery: 0.3,
      power: 1.2, damageType: 'magic', stagger: 0.25, knockback: 2.5,
      applies: [{ status: 'burn', duration: 4, stacks: 3 }],
      projectile: { speed: 11, radius: 0.3, style: 'flask', lob: 1.5 },
      anim: 'toss', desc: 'Lobbed flask that bursts in flames. Three per battle.',
    }],
  },
  smoke_bomb: {
    id: 'smoke_bomb', slot: 'usable', name: 'Smoke Bomb', rarity: 'epic', color: 0x9a9aaa,
    desc: 'Two per battle. Smash it at your feet: hidden for 2.5s. The enemy can\'t read your moves, their familiars lose you, and your first hit out of the smoke deals +40%.',
    tags: ['mobility', 'burst'],
    abilities: [{
      id: 'smoke_bomb', name: 'Smoke Bomb', slot: 'usable', kind: 'buff',
      range: 0, cost: 0, cooldown: 8, uses: 2,
      windup: 0.22, active: 0.1, recovery: 0.22,
      power: 0, damageType: 'physical',
      buff: [{ status: 'hidden', duration: 2.5 }],
      anim: 'toss', desc: 'Vanish in smoke for 2.5s; the first hit out of it lands harder. Two per battle.',
    }],
  },
  caltrops: {
    id: 'caltrops', slot: 'usable', name: 'Caltrops', rarity: 'rare', color: 0x8a8f96,
    desc: 'Two per battle. Scatter iron spikes where the enemy is heading: for 8s, anyone on the patch gets cut and slowed.',
    tags: ['physical', 'control', 'ranged'],
    abilities: [{
      id: 'caltrops', name: 'Caltrops', slot: 'usable', kind: 'projectile',
      range: 7, cost: 0, cooldown: 6, uses: 2,
      windup: 0.26, active: 0.06, recovery: 0.28,
      power: 0.3, damageType: 'physical', stagger: 0.1,
      applies: [{ status: 'chill', duration: 2 }],
      projectile: { speed: 11, radius: 0.3, style: 'caltrops', lob: 1.2, zone: 'caltrops' },
      anim: 'toss', desc: 'Scatters a patch of spikes that cuts and slows. Two per battle.',
    }],
  },
  frost_bomb: {
    id: 'frost_bomb', slot: 'usable', name: 'Frost Bomb', rarity: 'rare', color: 0x9fe8ff,
    desc: 'Three per battle. A flask of liquid frost: bursts in a cloud that chills hard (3 stacks; 5 freeze solid).',
    tags: ['magic', 'control', 'ranged'],
    abilities: [{
      id: 'frost_bomb', name: 'Frost Bomb', slot: 'usable', kind: 'projectile',
      range: 8, cost: 0, cooldown: 5, uses: 3,
      windup: 0.3, active: 0.06, recovery: 0.3,
      power: 0.8, damageType: 'magic', stagger: 0.2, knockback: 1.5,
      applies: [{ status: 'chill', duration: 3, stacks: 3 }],
      projectile: { speed: 11, radius: 0.3, style: 'frostflask', lob: 1.6 },
      anim: 'toss', desc: 'Lobbed flask of frost: 3 stacks of chill. Three per battle.',
    }],
  },
  troll_tonic: {
    id: 'troll_tonic', slot: 'usable', name: 'Troll Tonic', rarity: 'rare', color: 0x7ac85a,
    desc: 'Two per battle. Drink troll blood: regenerate 2.5% of max HP every second for 8s (20% in all).',
    tags: ['sustain'],
    abilities: [{ ...DRINK, id: 'troll_tonic', name: 'Troll Tonic', cooldown: 10, uses: 2, buff: [{ status: 'regen', duration: 8 }], desc: 'Regenerate 20% of max HP over 8s. Two per battle.' }],
  },
};

// -----------------------------------------------------------------------------
// Head
// -----------------------------------------------------------------------------

const HEAD: Catalog['head'] = {
  berserker_mask: {
    id: 'berserker_mask', slot: 'head', name: 'Berserker Mask', rarity: 'epic', color: 0xd12020,
    desc: 'Up to +40% damage as HP drops. Faster attacks below 40% HP.',
    passive: 'Berserk',
    tags: ['burst'],
  },
  iron_helm: {
    id: 'iron_helm', slot: 'head', name: 'Iron Helm', rarity: 'rare', color: 0xa0a8b8,
    desc: '+15 resist, +6 armor, 35% tenacity. Every 10s, shrug off a stun.',
    passive: 'Iron Will',
    add: { resist: 15, armor: 6, tenacity: 0.35 },
    tags: ['tank'],
  },
  chrono_circlet: {
    id: 'chrono_circlet', slot: 'head', name: 'Chrono Circlet', rarity: 'epic', color: 0xc8a2ff,
    desc: '30% cooldown reduction, +50% energy regen, +6% attack speed.',
    add: { cdr: 0.3, energyRegen: 0.5 }, mul: { attackSpeed: 1.06 },
    tags: ['fast'],
  },
  executioner_hood: {
    id: 'executioner_hood', slot: 'head', name: "Executioner's Hood", rarity: 'epic', color: 0x3a3a46,
    desc: '+15% crit, +30% crit damage. Crits on targets under 30% HP deal +50%.',
    passive: 'Execute',
    add: { critChance: 0.15, critMult: 0.3 },
    tags: ['crit', 'burst'],
  },
  storm_crown: {
    id: 'storm_crown', slot: 'head', name: 'Storm Crown', rarity: 'epic', color: 0x9fd8ff,
    desc: 'Every 4th hit calls lightning: bonus magic damage and a brief stun.',
    passive: 'Storm',
    tags: ['magic', 'control'],
  },
  duelist_band: {
    id: 'duelist_band', slot: 'head', name: "Duelist's Band", rarity: 'rare', color: 0xf3c24f,
    desc: '+8 armor, +8% attack speed. Parry windows 40% wider; parries restore 10 extra energy.',
    passive: 'Duelist',
    add: { armor: 8 }, mul: { attackSpeed: 1.08 },
    tags: ['parry'],
  },
  seer_blindfold: {
    id: 'seer_blindfold', slot: 'head', name: 'Seer\'s Blindfold', rarity: 'legendary', color: 0xd8c8ff,
    desc: '+6 resist. Sees a moment ahead: once every 7s, a real blow that would hit you simply misses. Reacts faster to what the enemy starts.',
    passive: 'Foresight',
    add: { resist: 6 },
    tags: ['magic'],
  },
  dread_helm: {
    id: 'dread_helm', slot: 'head', name: 'Dread Helm', rarity: 'epic', color: 0x5a4a5a,
    desc: '+8 armor, +2 power. Heavy blows that land strike terror: the enemy flees in fear for 0.9s (once every 7s).',
    passive: 'Dread',
    add: { armor: 8, power: 2 },
    tags: ['control', 'tank'],
  },
  hawkeye_hood: {
    id: 'hawkeye_hood', slot: 'head', name: 'Hawkeye Hood', rarity: 'rare', color: 0x6a8a4a,
    desc: '+5% crit. Your projectiles fly 20% faster and deal 18% more damage.',
    passive: 'Hawkeye',
    add: { critChance: 0.05 },
    tags: ['ranged', 'crit'],
  },
  gladiator_helm: {
    id: 'gladiator_helm', slot: 'head', name: 'Gladiator Helm', rarity: 'rare', color: 0xd8a040,
    desc: '+6 armor. Every hit you land builds momentum: +4% damage per stack, up to 5. It fades 4s after your last hit.',
    passive: 'Momentum',
    add: { armor: 6 },
    tags: ['burst'],
  },
};

// -----------------------------------------------------------------------------
// Chest
// -----------------------------------------------------------------------------

const CHEST: Catalog['chest'] = {
  plate_armor: {
    id: 'plate_armor', slot: 'chest', name: 'Plate Armor', rarity: 'rare', color: 0x8c96a8,
    desc: '+28 armor, −5% move speed. Harden: 50% damage reduction and unstoppable for 2.4s.',
    add: { armor: 28 }, mul: { moveSpeed: 0.95 },
    tags: ['tank'],
    abilities: [{
      id: 'iron_skin', name: 'Iron Skin', slot: 'defense', kind: 'buff',
      range: 0, cost: 0, cooldown: 9,
      windup: 0.06, active: 0.06, recovery: 0.08,
      power: 0, damageType: 'physical',
      buff: [{ status: 'ironskin', duration: 2.4 }],
      anim: 'harden', desc: 'Harden: 50% damage reduction and unstoppable for 2.4s.',
    }],
  },
  phase_cloak: {
    id: 'phase_cloak', slot: 'chest', name: 'Phase Cloak', rarity: 'epic', color: 0x6ff3ff,
    desc: '+25 resist, +8% move speed. Teleport away and gain haste for 1.5s; when cornered, blink behind the enemy.',
    add: { resist: 25 }, mul: { moveSpeed: 1.08 },
    tags: ['mobility'],
    abilities: [{
      id: 'blink', name: 'Blink', slot: 'defense', kind: 'blink',
      range: 0, cost: 0, cooldown: 2.8,
      windup: 0.04, active: 0.08, recovery: 0.16,
      power: 0, damageType: 'magic', iframes: 0.35,
      dash: { distance: 4.6, iframes: 0.35 },
      buff: [{ status: 'haste', duration: 1.5 }],
      anim: 'blink', desc: 'Teleport away. When cornered, blinks behind the enemy.',
    }],
  },
  thornmail: {
    id: 'thornmail', slot: 'chest', name: 'Thornmail', rarity: 'epic', color: 0x58c46b,
    desc: '+20 armor, +0.04 poise. Reflects 25% of melee damage taken.',
    passive: 'Thorns',
    add: { armor: 20, thorns: 0.25, poise: 0.04 },
    tags: ['tank'],
  },
  mirror_mail: {
    id: 'mirror_mail', slot: 'chest', name: 'Mirror Mail', rarity: 'legendary', color: 0xaff6ff,
    desc: '+10 armor, +10 resist. Every 6s, reflects the next projectile back. Barrier: gain a 12% HP shield.',
    passive: 'Mirror',
    add: { armor: 10, resist: 10 },
    tags: ['reflect', 'sustain'],
    abilities: [{
      id: 'barrier', name: 'Barrier', slot: 'defense', kind: 'buff',
      range: 0, cost: 0, cooldown: 12,
      windup: 0.12, active: 0.06, recovery: 0.14,
      power: 0, damageType: 'magic', shieldGain: 0.12,
      anim: 'barrier', desc: 'Gain a shield worth 12% of max HP.',
    }],
  },
  leather_jerkin: {
    id: 'leather_jerkin', slot: 'chest', name: 'Leather Jerkin', rarity: 'common', color: 0x9a6a3a,
    desc: '+12 armor, +7% move speed, +6% attack speed, +5% crit. Light and free.',
    add: { armor: 12, critChance: 0.05 }, mul: { moveSpeed: 1.07, attackSpeed: 1.06 },
    tags: ['fast'],
  },
  mage_robe: {
    id: 'mage_robe', slot: 'chest', name: 'Mage Robe', rarity: 'rare', color: 0x5a4ac8,
    desc: '+8 power, +30 resist, +50% energy regen, 15% cooldown reduction.',
    add: { power: 8, resist: 30, energyRegen: 0.5, cdr: 0.15 },
    tags: ['magic'],
  },
  juggernaut_plate: {
    id: 'juggernaut_plate', slot: 'chest', name: 'Juggernaut Plate', rarity: 'legendary', color: 0x7a7a88,
    desc: '+30 armor, half knockback, −8% move. Above 50% HP nothing stops you: immune to stuns, freezes, roots, fear, silence and flinching.',
    passive: 'Unstoppable',
    add: { armor: 30 }, mul: { moveSpeed: 0.92, knockbackTaken: 0.5 },
    tags: ['tank'],
  },
  heartwood_armor: {
    id: 'heartwood_armor', slot: 'chest', name: 'Heartwood Armor', rarity: 'epic', color: 0x6a9a4a,
    desc: '+16 armor, +6% max HP. After 2.5s out of harm, the living wood mends you: 1.2% of max HP per second.',
    passive: 'Bark Mend',
    add: { armor: 16 }, mul: { maxHp: 1.06 },
    tags: ['sustain', 'tank'],
  },
  shadow_garb: {
    id: 'shadow_garb', slot: 'chest', name: 'Shadow Garb', rarity: 'rare', color: 0x4a4a6a,
    desc: '+8 armor, +6% crit, +5% move speed. Right after you evade, your next hit within 1.5s is a sure critical hit.',
    passive: 'Shadowstrike',
    add: { armor: 8, critChance: 0.06 }, mul: { moveSpeed: 1.05 },
    tags: ['crit', 'mobility'],
  },
  runic_mail: {
    id: 'runic_mail', slot: 'chest', name: 'Runic Mail', rarity: 'rare', color: 0x6a9aff,
    desc: '+14 armor, +18 resist. Harmful effects on you wear off 30% sooner (burns, poison, chill, marks, stuns, roots, silence, fear).',
    passive: 'Runeward',
    add: { armor: 14, resist: 18 },
    tags: ['tank', 'magic'],
  },
};

// -----------------------------------------------------------------------------
// Legs
// -----------------------------------------------------------------------------

const LEGS: Catalog['legs'] = {
  leather_leggings: {
    id: 'leather_leggings', slot: 'legs', name: 'Leather Leggings', rarity: 'common', color: 0x8a5a32,
    desc: '+12 armor, +6% move speed. Supple and quiet.',
    add: { armor: 12 }, mul: { moveSpeed: 1.06 },
    tags: [],
  },
  chain_leggings: {
    id: 'chain_leggings', slot: 'legs', name: 'Chain Leggings', rarity: 'rare', color: 0x9aa4b4,
    desc: '+14 armor, +6 resist, +0.03 poise.',
    add: { armor: 14, resist: 6, poise: 0.03 },
    tags: ['tank'],
  },
  stonehide_tassets: {
    id: 'stonehide_tassets', slot: 'legs', name: 'Stonehide Tassets', rarity: 'rare', color: 0x9a8a72,
    desc: '+22 armor, +0.06 poise, 25% less knockback, −5% move speed.',
    add: { armor: 22, poise: 0.06 }, mul: { knockbackTaken: 0.75, moveSpeed: 0.95 },
    tags: ['tank'],
  },
  windrunner_leggings: {
    id: 'windrunner_leggings', slot: 'legs', name: 'Windrunner Leggings', rarity: 'rare', color: 0x7ae8d0,
    desc: '+4 armor, +12% move speed, +4% attack speed.',
    add: { armor: 4 }, mul: { moveSpeed: 1.12, attackSpeed: 1.04 },
    tags: ['fast', 'mobility'],
  },
  runed_leggings: {
    id: 'runed_leggings', slot: 'legs', name: 'Runed Leggings', rarity: 'epic', color: 0x6a8aff,
    desc: '+4 power, +16 resist, 8% cooldown reduction.',
    add: { power: 4, resist: 16, cdr: 0.08 },
    tags: ['magic'],
  },
  bloodrite_wraps: {
    id: 'bloodrite_wraps', slot: 'legs', name: 'Bloodrite Wraps', rarity: 'epic', color: 0xd0203a,
    desc: '+6 armor. Once per battle, dropping under 35% HP heals 15% of max HP and grants haste for 2s.',
    passive: 'Second Wind',
    add: { armor: 6 },
    tags: ['sustain'],
  },
  ghoststep_leggings: {
    id: 'ghoststep_leggings', slot: 'legs', name: 'Ghoststep Leggings', rarity: 'epic', color: 0xa8d8e8,
    desc: '+4 armor, +6% move speed. You pass through the enemy like a ghost: no body blocking, so nobody pins you in a corner.',
    passive: 'Ghoststep',
    add: { armor: 4 }, mul: { moveSpeed: 1.06 },
    tags: ['mobility'],
  },
  charger_cuisses: {
    id: 'charger_cuisses', slot: 'legs', name: 'Charger Cuisses', rarity: 'rare', color: 0xb87a4a,
    desc: '+10 armor, +4% move speed. After 0.8s running at the enemy, your next melee hit lands 35% harder and stuns for 0.4s.',
    passive: 'Charge',
    add: { armor: 10 }, mul: { moveSpeed: 1.04 },
    tags: ['burst'],
  },
  acrobat_trousers: {
    id: 'acrobat_trousers', slot: 'legs', name: 'Acrobat Trousers', rarity: 'rare', color: 0xe86a8a,
    desc: '+4 armor, +5% move speed, +3% attack speed. Your evade recharges 28% faster.',
    passive: 'Tumbler',
    add: { armor: 4 }, mul: { moveSpeed: 1.05, attackSpeed: 1.03 },
    tags: ['fast', 'mobility'],
  },
  warlord_faulds: {
    id: 'warlord_faulds', slot: 'legs', name: 'Warlord Faulds', rarity: 'common', color: 0xa08a6a,
    desc: '+16 armor, +3 power, +0.03 poise. A heavy plated skirt for those who stand and trade.',
    add: { armor: 16, power: 3, poise: 0.03 },
    tags: ['tank'],
  },
};

// -----------------------------------------------------------------------------
// Boots (each pair defines the evade)
// -----------------------------------------------------------------------------

const BOOTS: Catalog['boots'] = {
  leather_boots: {
    id: 'leather_boots', slot: 'boots', name: 'Leather Boots', rarity: 'common', color: 0x8a5a2b,
    desc: '+6% move speed. Light backstep evade with a shorter cooldown.',
    mul: { moveSpeed: 1.06 },
    tags: [],
    evade: { ...EVADE, cooldown: 3.1 },
  },
  zephyr_boots: {
    id: 'zephyr_boots', slot: 'boots', name: 'Zephyr Boots', rarity: 'rare', color: 0x5effc8,
    desc: '+25% move speed, +10% attack speed. Longer evade with a much shorter cooldown.',
    mul: { moveSpeed: 1.25, attackSpeed: 1.1 },
    tags: ['fast', 'mobility'],
    evade: { ...EVADE, id: 'zephyr_step', name: 'Zephyr Step', cooldown: 2.3, dash: { distance: 3.1, iframes: 0.3 }, desc: 'Fast backstep with a short cooldown.' },
  },
  iron_greaves: {
    id: 'iron_greaves', slot: 'boots', name: 'Iron Greaves', rarity: 'rare', color: 0x6a7080,
    desc: '+12 armor, +8 resist, +0.08 poise, 40% less knockback, −5% move. Short, slow evade.',
    add: { armor: 12, resist: 8, poise: 0.08 }, mul: { knockbackTaken: 0.6, moveSpeed: 0.95 },
    tags: ['tank'],
    evade: { ...EVADE, id: 'sidestep', name: 'Sidestep', cooldown: 4.2, dash: { distance: 2.0, iframes: 0.26 }, desc: 'Short, heavy sidestep.' },
  },
  shadow_treads: {
    id: 'shadow_treads', slot: 'boots', name: 'Shadow Treads', rarity: 'epic', color: 0x4a3a7a,
    desc: '+5% crit, +8% move speed. Evade rolls through the enemy when close, with longer invulnerability.',
    add: { critChance: 0.05 }, mul: { moveSpeed: 1.08 },
    tags: ['mobility'],
    evade: { ...EVADE, id: 'shadow_roll', name: 'Shadow Roll', cooldown: 4, dash: { distance: 3.4, iframes: 0.38, through: true }, desc: 'Rolls through the enemy to get behind them.' },
  },
  colossus_boots: {
    id: 'colossus_boots', slot: 'boots', name: 'Colossus Boots', rarity: 'rare', color: 0xb98a4a,
    desc: '+18% max HP, −8% move speed. Standard evade.',
    mul: { maxHp: 1.18, moveSpeed: 0.92 },
    tags: ['tank'],
    evade: EVADE,
  },
  leaping_boots: {
    id: 'leaping_boots', slot: 'boots', name: 'Leaping Boots', rarity: 'epic', color: 0xffd36b,
    desc: '+5% move speed. Evade is a long backward leap that clears ground waves.',
    mul: { moveSpeed: 1.05 },
    tags: ['mobility'],
    evade: { ...EVADE, id: 'back_leap', name: 'Back Leap', cooldown: 3.6, active: 0.34, airborne: true, dash: { distance: 3.8, iframes: 0.34 }, anim: 'leap', desc: 'Long backward leap.' },
  },
  warp_boots: {
    id: 'warp_boots', slot: 'boots', name: 'Warp Boots', rarity: 'legendary', color: 0xb08aff,
    desc: '+6% move speed. Warp Step: when the enemy is close, teleport right behind them; otherwise blink back.',
    mul: { moveSpeed: 1.06 },
    tags: ['mobility', 'magic'],
    evade: {
      ...EVADE, id: 'warp_step', name: 'Warp Step', kind: 'blink', cooldown: 4.2,
      windup: 0.05, active: 0.08, recovery: 0.16, iframes: 0.35,
      dash: { distance: 3.2, iframes: 0.35, through: true },
      anim: 'blink', desc: 'Teleports behind a close enemy, or blinks back.',
    },
  },
  earthshaker_boots: {
    id: 'earthshaker_boots', slot: 'boots', name: 'Earthshaker Boots', rarity: 'epic', color: 0xa87a4a,
    desc: '+0.05 poise, 25% less knockback. No dodge: your evade is a quake stomp that blasts back and staggers anyone close.',
    add: { poise: 0.05 }, mul: { knockbackTaken: 0.75 },
    tags: ['tank', 'control'],
    evade: {
      id: 'quake_stomp', name: 'Quake Stomp', slot: 'evade', kind: 'aoe',
      range: 2.4, cost: 0, cooldown: 4.5,
      windup: 0.16, active: 0.08, recovery: 0.3,
      power: 0.7, damageType: 'physical', knockback: 7, stagger: 0.4, iframes: 0.1,
      anim: 'stomp', desc: 'Stamps a quake: knocks back and staggers anyone close.',
    },
  },
  frostwalkers: {
    id: 'frostwalkers', slot: 'boots', name: 'Frostwalkers', rarity: 'rare', color: 0xa8e8ff,
    desc: '+8 resist. Your evade leaves a burst of frost where you stood, chilling anyone close (2 stacks).',
    add: { resist: 8 },
    tags: ['control', 'magic'],
    evade: { ...EVADE, id: 'frost_step', name: 'Frost Step', cooldown: 3.6, desc: 'Backstep that leaves a burst of frost behind.' },
  },
  savate_boots: {
    id: 'savate_boots', slot: 'boots', name: 'Savate Boots', rarity: 'rare', color: 0x5a4a3a,
    desc: '+4% move and attack speed. Your evade opens with a push kick that shoves a close enemy away before you step back.',
    mul: { moveSpeed: 1.04, attackSpeed: 1.04 },
    tags: ['control'],
    evade: { ...EVADE, id: 'savate_kick', name: 'Savate Kick', cooldown: 3.8, desc: 'Push kick, then a backstep.' },
  },
};

export const GEAR: Catalog = {
  main: MAIN, secondary: SECONDARY, special: SPECIAL, usable: USABLE, head: HEAD, chest: CHEST, legs: LEGS, boots: BOOTS,
};

export const GEAR_SLOTS: GearSlot[] = ['main', 'secondary', 'special', 'usable', 'head', 'chest', 'legs', 'boots'];

export const SLOT_NAMES: Record<GearSlot, string> = {
  main: 'Main weapon', secondary: 'Secondary', special: 'Special item', usable: 'Usable item',
  head: 'Head', chest: 'Chest', legs: 'Legs', boots: 'Boots',
};

/** Every gear piece, keyed by id. */
export const GEAR_BY_ID = Object.fromEntries(
  GEAR_SLOTS.flatMap((s) => Object.values(GEAR[s]) as GearDef[]).map((g) => [g.id, g]),
) as Record<GearId, GearDef>;

export function gearOf(id: GearId): GearDef {
  return GEAR_BY_ID[id];
}

export function gearIdsFor<S extends GearSlot>(slot: S): GearSlotIds[S][] {
  return Object.keys(GEAR[slot]) as GearSlotIds[S][];
}

/**
 * Seconds a secondary weapon takes to come out and go back, given the main
 * weapon's hands. A free off hand just grabs it from the belt; a two-handed
 * main must be slung on the back first and taken back afterwards.
 */
export function drawTimes(mainHands: 1 | 2): { draw: number; stow: number } {
  return mainHands === 1 ? { draw: 0.1, stow: 0.12 } : { draw: 0.3, stow: 0.34 };
}

/**
 * Seconds to take a usable item off the belt and to get set again after.
 * A two-handed main isn't put away: it drops to one hand, so this is quicker
 * than drawing a secondary.
 */
export function useTimes(mainHands: 1 | 2): { draw: number; stow: number } {
  return mainHands === 1 ? { draw: 0.12, stow: 0.1 } : { draw: 0.18, stow: 0.16 };
}
