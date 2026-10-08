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
    version: '0.9.1',
    date: '2026-10-08',
    title: 'Bigger creator buttons on phones',
    notes: [
      'On phones, the Next and Back buttons in the character creator are bigger, fill the bottom of the screen and stay centred on every step.',
      'Back and Save turn into square icon buttons when space is tight, so the Next button always has room for its label.',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-10-08',
    title: 'A fresh look for every menu, and a new character creator',
    notes: [
      'Brand new character creator in three steps: pick your species, then your body form, then your name, colours and hair all on one screen.',
      'Every species and body form shows your own fighter on its card, and body forms come with stat bars so you can compare them at a glance.',
      'Your fighter stands on a stage while you create them and plays a move whenever you change something. Tap the Gear button to see them with or without their equipment.',
      'New title screen: your fighter and the rival sit on cards with all six gear slots, and Fight and Online duel are always one tap away. On phones the cards move out of the way of the duel behind them.',
      'The gear screen is now full screen with a big view of your fighter and their stats next to the item list.',
      'Settings use simple on/off switches, and the results screen shows each stat as a tug-of-war bar between the two fighters.',
      'Every screen was resized for phones in landscape and portrait and for PC screens, so nothing is too big, too small or cut off.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-10-08',
    title: '30 new item skins',
    notes: [
      '10 new Rare skins for helmets, chest pieces and boots, like the Rose Gold Circlet, Crimson Cowl, Ember Cloak, Obsidian Mirror and Jade Leapers.',
      '10 new Mythic skins that reshape the item: Morningstar, Skullcrusher, Lionheart, Swordbreaker, Wyrm Repeater, Kraken Conch, Icicle Scepter, Oni Mask, Raven Hood and Dragonknight Plate.',
      '10 new Legendary skins with living animations and sparkles: Kagutsuchi (a burning katana), Voidfang, Geode Heart, Frostreaver, Winter\'s Heart, Solar Disc, the Eternity Circlet with a ticking clock, Phoenix Band, Nebula Robe and Stormstriders.',
      'Legendary helmets, chest pieces and boots now sparkle in battle too, and legendary off-hand weapons leave sparkles and coloured hit bursts.',
      'Pick them in the Skins row of the Gear screen. Skins are cosmetic only and never change a fight.',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-10-08',
    title: 'Day turns to night on Skygrove Isle',
    notes: [
      'On Skygrove Isle the sun now crosses the sky during each round: bright day, a warm golden hour, a fiery sunset, then a purple dusk and finally a starry night with the moon rising.',
      'The light changes with it: everything on the island, the fighters included, warms up at sunset and turns cool and blue at night. Sunbeams fade out as the sun goes down, and the rainbow fades away in the afternoon.',
      'When night falls, the lanterns, the crystals on the standing stones and the crystals in the rock below light up, and fireflies drift over the meadow. Butterflies and birds go to rest.',
    ],
  },
  {
    version: '0.6.1',
    date: '2026-10-08',
    title: 'A clear blue sky over Skygrove',
    notes: [
      'The Skygrove Isle sky is now a smooth, clean blue that fades softly toward the horizon, with no grainy texture.',
      'The sun glows softly, the rainbow blends in gently, and the sunbeams fade smoothly instead of looking speckled.',
      'Clouds are cleaner too.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-08',
    title: 'Skygrove Isle gets a glow-up, and you pick the arena',
    notes: [
      'Skygrove Isle is now the default arena: it is what you see when you open the game, and where fights take place.',
      'New arena picker in Settings: choose any arena, or Random for the old rotation. The view behind the menu switches right away.',
      'Skygrove Isle is rounder and wilder: its edges wobble and curve away, the front lip is ragged with grass hanging over it, and on tall screens you can see its rocky underside end above the clouds.',
      'Sunbeams slowly shift across the grove, pollen twinkles, butterflies flutter by, birds glide in the distance, and a faint rainbow arcs over the far isles.',
      'Small rocks float and bob around the island. The spectators have left; the tall grass and flowers sway in the wind instead, harder when the fight heats up.',
      'Stone lanterns with glowing crystals now flank the old arch, and the meadow has clover patches and more mushrooms.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-08',
    title: 'Online duels against a friend',
    notes: [
      'New Online button on the title screen: create a room and send the code or the invite link to a friend, or type their code to join.',
      'Matches are best of five: the first to three round wins takes it. Rematch straight from the end screen.',
      'Before every round you both pick a build: body form and all six gear slots, then Ready. Your saved fighter is not changed by online picks.',
      'Both players watch the same fight. Speed it up if you like; pausing is off online.',
      'If someone drops, the match waits for them and the pick clock stops. Reloading the page puts you back into your match.',
      'Your item skins come with you online, and you can change them along with your build between rounds.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-08',
    title: 'Item skins: rare, mythic and legendary',
    notes: [
      'Gear can now wear skins. Open Gear, pick a slot, and choose a look for the item from the new Skins row. Skins are looks only: they never change a fight.',
      'Rare skins give an item new colours and a new finish, like patina, folded steel, wood grain or scales.',
      'Mythic skins also reshape the item: a serrated bone blade, a twin-crescent axe, a dragon glaive, a recurve bow, a horned warhelm and more.',
      'Legendary skins go further: surfaces that move (light running up Dawnbreaker, lightning crawling through Thunderfall, a galaxy turning in the Staff of the Cosmos), brighter swing trails, sparkles from the weapon and bursts of colour on every hit.',
      'Every main weapon type has at least one skin of each rarity: 43 skins in all, across weapons, shields, helmets, crowns, armour and boots.',
      'Your skin choice is kept per item, so swapping gear and back keeps it. Rivals now show up wearing skins too.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-08',
    title: 'A new species: Humans',
    notes: [
      'Humans join the roster as a seventh species, first in the list in the character creator.',
      'Every human wears a long scarf in their accent colour that streams behind them as they run, leap and swing.',
      'Humans show their mood on their brows, have five skin tones, and work with every body form, hairstyle and piece of gear.',
      'Like every species, Humans are looks only: your body form still sets your stats.',
    ],
  },
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
