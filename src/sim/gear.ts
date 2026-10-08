import { EVADE } from './abilities';
import type { AbilityDef, GearId, GearSlot, GearSlotIds, Stats } from './types';

/**
 * Gear catalog. Six slots, and everything a fighter can do comes from here:
 *  - main weapon: basic attack + weapon skill, and the fighting distance.
 *    One-handed or two-handed.
 *  - secondary: a one-handed weapon or tool with one more skill. It is drawn
 *    each time it is used: with a one-handed main the free hand just grabs it;
 *    a two-handed main has to be put away first and taken back after.
 *  - special: an item that works on its own (aura, familiar, or an attack the
 *    item performs itself while the body keeps fighting).
 *  - head, chest: passives and stats; some chest pieces grant a defensive skill.
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
        power: 1.42, damageType: 'physical', stagger: 0.22, knockback: 1.2, lunge: 0.3,
        anim: 'slash', desc: 'Reliable sword cut.',
      },
      {
        id: 'rising_cleave', name: 'Rising Cleave', slot: 'skill', kind: 'melee',
        range: 2.25, cost: 15, cooldown: 6,
        windup: 0.58, active: 0.14, recovery: 0.48,
        power: 3.0, damageType: 'physical', heavy: true, knockback: 8, lunge: 0.9, stagger: 0.5,
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
        power: 0.44, damageType: 'magic', stagger: 0.12,
        applies: [{ status: 'burn', duration: 1.5 }],
        projectile: { speed: 16, radius: 0.3, style: 'fire' },
        anim: 'cast', desc: 'Quick firebolt that burns.',
      },
      {
        id: 'flame_wave', name: 'Flame Wave', slot: 'skill', kind: 'projectile',
        range: 9, cost: 15, cooldown: 7,
        windup: 0.45, active: 0.1, recovery: 0.38,
        power: 1.2, damageType: 'magic', heavy: true, knockback: 3,
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
        power: 1.32, damageType: 'physical', stagger: 0.2, knockback: 1.6, lunge: 0.35,
        anim: 'thrust', desc: 'Long-reaching jab.',
      },
      {
        id: 'skewer', name: 'Skewering Lunge', slot: 'skill', kind: 'melee',
        range: 2.6, cost: 15, cooldown: 6.5,
        windup: 0.42, active: 0.14, recovery: 0.45,
        power: 2.7, damageType: 'physical', heavy: true, knockback: 6.5, lunge: 1.8, stagger: 0.45,
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
        power: 1.9, damageType: 'physical', stagger: 0.34, knockback: 3, lunge: 0.35,
        anim: 'slash', desc: 'Wide, heavy cleave.',
      },
      {
        id: 'whirlwind', name: 'Whirlwind', slot: 'skill', kind: 'melee',
        range: 2.2, cost: 15, cooldown: 7,
        windup: 0.32, active: 0.5, recovery: 0.45,
        power: 1.1, damageType: 'physical', hits: 3, stagger: 0.3, knockback: 2, lunge: 1.6, hyperArmor: true,
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
      power: 6.8, damageType: 'magic', heavy: true, knockback: 6, stun: 0.5,
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
      power: 0.6, damageType: 'physical', hits: 8, stagger: 0.22, knockback: 0.4,
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
    desc: '+8 armor, +7% move speed, +6% attack speed, +5% crit. Light and free.',
    add: { armor: 8, critChance: 0.05 }, mul: { moveSpeed: 1.07, attackSpeed: 1.06 },
    tags: ['fast'],
  },
  mage_robe: {
    id: 'mage_robe', slot: 'chest', name: 'Mage Robe', rarity: 'rare', color: 0x5a4ac8,
    desc: '+4 power, +30 resist, +50% energy regen, 15% cooldown reduction.',
    add: { power: 4, resist: 30, energyRegen: 0.5, cdr: 0.15 },
    tags: ['magic'],
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
};

export const GEAR: Catalog = {
  main: MAIN, secondary: SECONDARY, special: SPECIAL, head: HEAD, chest: CHEST, boots: BOOTS,
};

export const GEAR_SLOTS: GearSlot[] = ['main', 'secondary', 'special', 'head', 'chest', 'boots'];

export const SLOT_NAMES: Record<GearSlot, string> = {
  main: 'Main weapon', secondary: 'Secondary', special: 'Special item', head: 'Head', chest: 'Chest', boots: 'Boots',
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
