import type { FinisherId, PoseId } from '../character/finales';
import type { IconName } from './icons';

/** The glyph shown for each finisher and victory pose on tiles and shop offers (tiers use ENTRANCE_TIER). */
export const FINISHER_ICON: Record<FinisherId, IconName> = {
  clean: 'impact', frost: 'shatter', thunder: 'verdict', blossom: 'blossom', inferno: 'pyre',
  eclipse: 'eclipse', delayed: 'cut', starfall: 'starfall', dragon: 'dragon', judgement: 'greatsword',
};

export const POSE_ICON: Record<PoseId, IconName> = {
  cheer: 'cheer', salute: 'salute', flex: 'flex', bow: 'bowing', twirl: 'twirl', hips: 'akimbo', meditate: 'lotus', skyward: 'skyward', champion: 'laurel',
};
