import type { EntranceId, EntranceTier } from '../character/entrances';
import type { IconName } from './icons';

/** The glyph shown for each entrance on tiles and shop offers. */
export const ENTRANCE_ICON: Record<EntranceId, IconName> = {
  stride: 'boot', skyfall: 'down', smoke: 'cloud', shadow: 'moon', thunder: 'bolt', inferno: 'flame', frost: 'snow', meteor: 'meteor', divine: 'crown',
  whirlwind: 'tornado', cannon: 'bomb', bats: 'bat', jackpot: 'coin', blade: 'blade', quake: 'rock', rift: 'portal', starborn: 'constellation', phoenix: 'phoenix',
};

export const ENTRANCE_TIER: Record<EntranceTier, string> = { common: 'Free', rare: 'Rare', mythic: 'Mythic', legendary: 'Legendary' };
