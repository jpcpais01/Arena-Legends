import type { AbilityDef } from './types';

/**
 * Default evade (also what Leather Boots give): a quick backstep, or a roll
 * through when cornered. Other boots swap in their own evade (see gear.ts).
 */
export const EVADE: AbilityDef = {
  id: 'evade', name: 'Evade', slot: 'evade', kind: 'dash',
  range: 0, cost: 0, cooldown: 3.6,
  windup: 0.03, active: 0.26, recovery: 0.14,
  power: 0, damageType: 'physical',
  dash: { distance: 2.8, iframes: 0.3 },
  anim: 'evade',
  desc: 'Quick backstep with invulnerability. Rolls through the enemy when cornered.',
};

/** Storm Cloud: seconds between marks, the mark's radius and the seconds before the bolt. */
export const CLOUD = { every: 5, radius: 1.2, delay: 1.0 };

/** The storm cloud's bolt: straight down onto its mark. */
export const CLOUD_BOLT: AbilityDef = {
  id: 'cloud_bolt', name: 'Thunderhead', slot: 'item', kind: 'aoe',
  range: CLOUD.radius, cost: 0, cooldown: 0, windup: 0, active: 0, recovery: 0,
  power: 1.5, damageType: 'magic', heavy: true, unblockable: true, stun: 0.6, stagger: 0.3,
  anim: 'item', desc: 'Lightning strikes the mark.',
};
