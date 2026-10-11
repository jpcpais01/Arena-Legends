// The world: regions shown as big painted maps, each with places to fight.
// Every battle place is tied to one arena (its fights always play there) and
// one tournament: how big the bracket is, how strong the field, what it pays.
// Only the first region exists so far; more regions just add to REGIONS.

export interface Tournament {
  id: string;
  name: string;
  /** Arena theme id (THEMES in render/arenaArt) every fight of this tournament plays in. */
  arena: string;
  /** Fighters in the bracket: 8, 16 or 32. */
  size: 8 | 16 | 32;
  /** Generated rivals' levels, relative to the host's: the weakest and the strongest. */
  lo: number;
  hi: number;
  /** Gems and XP paid, as a multiple of the classic Arena Cup. */
  pay: number;
  /** Difficulty, 1 to 4. */
  stars: number;
  blurb: string;
}

export const TOURNAMENTS: Tournament[] = [
  {
    id: 'cup', name: 'Arena Cup', arena: 'isle', size: 32, lo: -2, hi: 6, pay: 1, stars: 2,
    blurb: 'The classic. 32 fighters on the floating isle over the bay, five knockout rounds.',
  },
  {
    id: 'blossom', name: 'Blossom Trials', arena: 'shrine', size: 16, lo: -3, hi: 2, pay: 0.8, stars: 1,
    blurb: 'A calm cup under the cherry trees. A smaller field near your level: a good first title.',
  },
  {
    id: 'gauntlet', name: 'Sandstorm Gauntlet', arena: 'mesa', size: 32, lo: 1, hi: 9, pay: 1.6, stars: 3,
    blurb: 'Veterans of the wastes. Every rival is above your level and the purse is bigger.',
  },
  {
    id: 'crown', name: 'Starfall Crown', arena: 'astral', size: 8, lo: 6, hi: 12, pay: 2.5, stars: 4,
    blurb: 'Eight legends meet under the stars. Brutal rivals, the richest prize in the region.',
  },
];

export const tournamentOf = (id: string | undefined): Tournament =>
  TOURNAMENTS.find((t) => t.id === id) ?? TOURNAMENTS[0];

export interface Place {
  id: string;
  name: string;
  /** Where its banner's stem touches the map (art pixels): just above the place, so the banner doesn't hide it. */
  x: number;
  y: number;
  tournament: string;
}

/** A plain map label (towns, bays, woods). */
export interface MapLabel { text: string; x: number; y: number; size?: 'big' | 'small'; sea?: boolean }

export interface Region {
  id: string;
  name: string;
  /** Map size in art pixels. */
  w: number;
  h: number;
  /** Where the view opens (art pixels). */
  home: { x: number; y: number };
  places: Place[];
  labels: MapLabel[];
}

export const REGIONS: Region[] = [
  {
    id: 'sunhaven', name: 'Sunhaven Coast', w: 1280, h: 800,
    home: { x: 600, y: 420 },
    places: [
      { id: 'skygrove', name: 'Skygrove Isle', x: 600, y: 534, tournament: 'cup' },
      { id: 'shrine', name: 'Cherry Blossom Shrine', x: 1038, y: 250, tournament: 'blossom' },
      { id: 'mesa', name: 'Desert Mesa', x: 205, y: 344, tournament: 'gauntlet' },
      { id: 'astral', name: 'Astral Sanctum', x: 760, y: 70, tournament: 'crown' },
    ],
    labels: [
      { text: 'Sunhaven', x: 470, y: 300, size: 'big' },
      { text: 'Sunhaven Bay', x: 470, y: 690, sea: true },
      { text: 'Ember Wastes', x: 150, y: 560, size: 'small' },
      { text: 'Lighthouse Point', x: 960, y: 690, size: 'small' },
      { text: 'Whitecap Peaks', x: 1050, y: 150, size: 'small' },
      { text: 'Gull Rock', x: 175, y: 755, size: 'small', sea: true },
    ],
  },
];

export const placeOfTournament = (tid: string): Place | null => {
  for (const r of REGIONS) for (const p of r.places) if (p.tournament === tid) return p;
  return null;
};
