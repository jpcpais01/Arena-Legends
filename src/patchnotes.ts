// Player-facing patch notes, newest first. Every change merged to main bumps
// package.json's version and adds an entry here (patchnotes.test.ts checks the
// top entry matches package.json). Write for players: what changed in the game,
// not how the code changed.

export interface PatchNote {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  notes: string[];
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: '0.2.0',
    date: '2026-10-08',
    title: 'New arena: Skygrove Isle',
    notes: [
      'A fourth arena: Skygrove Isle, a grassy island floating high above a sea of clouds. Fight on a meadow trail with a fairy ring of mushrooms, an old ruined arch and a grove of green and blossom trees behind you.',
      'Look around: other islands drift in the sky with waterfalls pouring off their edges, the clouds roll by slowly and petals blow across the fight.',
      'The island ends past each side of the arena, marked by mossy standing stones with floating crystals. On wide screens you can see its edges and the roots hanging from underneath.',
    ],
  },
  {
    version: '0.1.1',
    date: '2026-10-08',
    title: 'Settings: battle quotes on or off',
    notes: [
      'New Settings menu, from the cog button on the title screen or during a battle.',
      'Battle quotes can be switched off: no more speech bubbles over the fighters mid-fight. Your choice is remembered.',
      'Sound can also be switched on or off from Settings.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-08',
    title: 'Arena Legends: the pixel arena opens',
    notes: [
      'A brand new game, drawn entirely in pixel art. Fully automatic 1v1 duels: build your fighter, then watch them think, feint, parry and punish on their own.',
      'Six creature species (Kitsu, Lop, Imp, Ogrin, Wisp, Golem) and six body forms. Species are looks only; your form sets your stats.',
      'Six gear slots: main weapon, secondary, special item, head, chest and boots. Everything your fighter can do comes from what they carry.',
      'Every move is animated: draws and stows, swings with motion trails, thrusts, slams, spins, bow draws, shield bashes, rolls and back leaps.',
      'Two-handed weapons go on the back when your fighter needs their secondary, and come back out after. One-handed fighters just grab it with the free hand.',
      'Special items act on their own: the phantom blade strikes by itself, the meteor sigil calls fire from the sky, the wisp lantern shoots its own bolts.',
      'Three arenas with layered parallax backgrounds and a cheering crowd: the Sunset Colosseum, the Moonlit Keep and the Jade Temple.',
      'The adaptive AI from the old game came along: it reads your habits, changes plans mid-fight and tells you what it is thinking.',
    ],
  },
];
