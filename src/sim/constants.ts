/** Fixed simulation step. Rendering interpolates between steps. */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const ARENA_HALF_WIDTH = 9;
export const START_GAP = 4.2;
/** Minimum centre-to-centre distance; fighters push each other apart below this. */
export const BODY_GAP = 1.0;
/** Regular time: the day on Skygrove runs over these seconds. */
export const ROUND_TIME = 60;
/** Night overtime after regular time, when both fighters are empowered. */
export const OVERTIME = 30;
/** Hard end of a round; still standing here, it goes to remaining health. */
export const MATCH_TIME = ROUND_TIME + OVERTIME;
/** Damage multiplier for both fighters during overtime. */
export const OVERTIME_DAMAGE = 2;

export const MAX_ENERGY = 100;
export const BASE_ENERGY_REGEN = 3.2;
export const ENERGY_ON_DEAL = 0.09;
export const ENERGY_ON_TAKE = 0.14;

export const WALL_SPLAT_SPEED = 6;
