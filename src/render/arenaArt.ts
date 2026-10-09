import type { Pix } from './pixel/paint';
import { buildCaldera } from './calderaArt';
import { buildIsle } from './isleArt';

/**
 * Hand-painted (procedurally) arena backdrops. Everything is built as plain
 * pixel buffers so it can be previewed headless; `ArenaView` turns them into
 * canvases and scrolls them with parallax.
 *
 * Each arena is the same scheme: far layers with parallax, a back edge at
 * `wallFactor`, a perspective floor from `floorTop` down to `floorEnd`, and
 * `front` layers below the floor's front lip.
 */

export interface Theme {
  id: string;
  name: string;
  /** Which painter builds it. */
  kind: 'isle' | 'caldera';
  /** Sky swatch (top to horizon), also used by the arena picker. */
  sky: number[];
  /** Where the main light sits (fractions of the screen) and the sun's radius. */
  body: { x: number; y: number; r: number };
  mountFar: number;
  snow: number | null;
  /** Floor swatch for the arena picker. */
  floor: number;
  /** Colour of the flames on braziers and torches. */
  fire: number;
}

export const THEMES: Theme[] = [
  {
    id: 'isle', name: 'Skygrove Isle', kind: 'isle',
    sky: [0x3672cc, 0x4a8cdc, 0x66a8e8, 0x8cc6f0, 0xb8e0f4, 0xe4f4f2],
    body: { r: 15, x: 0.74, y: 0.26 },
    mountFar: 0x8eaed6, snow: 0xf2f8ff,
    floor: 0x58a84a,
    fire: 0x8ef0d6,
  },
  {
    id: 'caldera', name: 'Emberforge Caldera', kind: 'caldera',
    sky: [0x140a1e, 0x3a1026, 0x6e1c22, 0xb03a1a, 0xf07a28],
    body: { r: 0, x: 0.62, y: 0.7 },
    mountFar: 0x3a2030, snow: null,
    floor: 0x3a2c36,
    fire: 0xff8a2a,
  },
];

export interface Layer {
  pix: Pix;
  /** Parallax factor (0 = fixed, 1 = moves with the world). */
  factor: number;
  /** Screen y of the layer's top. */
  y: number;
  /** Slow wind drift in px/s (the layer must tile horizontally). */
  drift?: number;
  /** Ambient things drawn right after this layer. */
  after?: 'birds' | 'floaters' | 'falls';
}

/** A rock floating near the arena, bobbing gently. */
export interface Floater {
  pix: Pix;
  /** Screen x of its centre at camera 0, and screen y of its top. */
  x: number;
  y: number;
  factor: number;
  /** In front of the floor (else behind the grove). */
  front: boolean;
  phase: number;
}

/** One moment of the day: sky gradient (top → horizon), sun glow and the light over the world. */
export interface SkyKey {
  at: number;
  sky: [number, number, number, number];
  glow: number;
  glowA: number;
  /** Warm band along the horizon under the sun (sunset afterglow). */
  band: number;
  bandA: number;
  /** Colour the whole world is pulled toward, and how far. */
  tint: number;
  tintA: number;
}

/** A sky drawn live, moving from day through sunset to night over one round. */
export interface DayCycle {
  /** Screen y of the horizon. */
  hz: number;
  keys: SkyKey[];
  sunR: number;
  stars: Pix;
  rainbow: Pix;
  moon: Pix;
  /** Spots that glow at night: screen x at camera 0, screen y, parallax factor, radius. */
  lamps: { x: number; y: number; factor: number; r: number }[];
  lampColor: number;
}

/** Living details over a nature arena. */
export interface Ambience {
  /** Petals and leaves tumbling across. */
  petals: number[];
  /** Wing colour of each butterfly. */
  butterflies: number[];
  /** Twinkling pollen. */
  sparkle: number;
  /** Distant birds. */
  bird: number;
}

/** A lavafall pouring down a cliff, in the coordinates of the layer whose `after` is 'falls'. */
export interface Fall {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A molten arena: what moves and glows at runtime, growing angrier as the round goes on. */
export interface Heat {
  /** Scrolling lava texture for the falls (tiles vertically every `tile` rows). */
  fallTex: Pix;
  tile: number;
  falls: Fall[];
  /** Pulsing glows: screen x at camera 0, screen y, parallax factor, radius. */
  glows: { x: number; y: number; factor: number; r: number }[];
  /** The distant volcano's crater, where lava bombs and lightning come from. */
  crater: { x: number; y: number; factor: number };
  /** Volcanic lightning bolts that flash in the ash plume. */
  bolts: Pix[];
  /** Colour of the light thrown up by the lava. */
  glow: number;
}

export interface ArenaArt {
  theme: Theme;
  gy: number;
  /** Screen y of the vanishing line used by the floor. */
  hy: number;
  floorTop: number;
  wallFactor: number;
  layers: Layer[];
  /** Two frames of the back edge's living details (swaying grass, shimmering magma), same placement as the wall layer. */
  crowd: [Pix, Pix];
  crowdLayer: Layer;
  /** Floor texture: u = world px (centre at w/2), v = depth row. */
  floor: Pix;
  /** Small flames (torches, forge coals) in the crowd layer's coordinates. */
  torches: [number, number][];
  /** World-anchored pillar sprite drawn at the arena bounds. */
  pillar: Pix;
  /** Layers drawn over the floor (the isle's underside). */
  front: Layer[];
  /** Screen row where the floor stops (the isle's front lip). */
  floorEnd: number;
  /** Floating crystal over each pillar; without one the pillars carry burning braziers. */
  crystal: Pix | null;
  /** Live sky and day-to-night lighting; when set, `layers` has no sky of its own. */
  cycle: DayCycle | null;
  floaters: Floater[];
  ambience: Ambience | null;
  /** Lava, embers and the volcano's moods; arenas without one ignore it. */
  heat: Heat | null;
}

/** `travel`: how far (px) the camera can travel from centre. */
export function buildArena(theme: Theme, W: number, H: number, gy: number, travel: number, seed = 7): ArenaArt {
  return theme.kind === 'caldera' ? buildCaldera(theme, W, H, gy, travel, seed) : buildIsle(theme, W, H, gy, travel, seed);
}

/** Floor row mapping: perspective scale and texture row for screen row `y`. */
export function floorRow(a: ArenaArt, y: number): { s: number; v: number } {
  const s = (y + 0.5 - a.hy) / (a.gy - a.hy);
  return { s, v: Math.min(a.floor.h - 1, Math.max(0, Math.round((a.gy - a.hy) / s))) };
}
