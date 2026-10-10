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
    version: '0.38.0',
    date: '2026-10-10',
    title: 'The Shop',
    notes: [
      'The Chests button is now the Shop: a proper store where you spend gems on exactly the skins you want.',
      'Featured set: one epic set a day, worn by your own fighter with its aura, at 40% off.',
      'Daily skins: six single skins that change every day, with at least one mythic or better.',
      'Epic sets: every set, the five new ones included, as a bundle at 25% off. You only pay for the pieces you are missing.',
      'Tap a price once to arm it and again to buy, so nothing gets bought by accident. New skins pop up with an Equip button.',
      'Skin chests are still here, under the Chests tab at the top of the Shop.',
    ],
  },
  {
    version: '0.37.0',
    date: '2026-10-09',
    title: 'Five new epic sets',
    notes: [
      'Jade Dragon Emperor: crimson lacquer, gold and jade, with a dragon guandao, a repeating crossbow and a flaming pearl. Wear it all and a golden dragon swims around you.',
      'Seraphic Choir: white and pale gold, a winged sword, a herald\'s trumpet, a floating halo and great feathered wings. Its aura raises a pillar of light with feathers drifting down.',
      'Lichborne: bone, grave-black rags and green soulfire, with a skull staff, wailing ghost blades and a crown of bone. Skeletal hands claw out of the ground around you.',
      'Feathered Serpent: turquoise, gold and obsidian, with a macuahuitl, obsidian darts, a plumed headdress and a little feathered serpent familiar that spirals around you.',
      'Prismheart: living crystal that throws rainbows, with a geode maul, a crystal heart and crystal shards orbiting you.',
      'All 35 pieces are in the chest pool as epic drops, and each glints only on its gems and accents at night.',
    ],
  },
  {
    version: '0.36.0',
    date: '2026-10-09',
    title: 'Circling fighters still fight',
    notes: [
      'A fighter catching their breath now backs off and won\'t chase you, but anything in reach still gets hit. No more standing right next to the enemy without swinging.',
      'Heat also cools down during quiet moments up close, not only when the fighters are far apart, so a standoff ends the breather naturally.',
    ],
  },
  {
    version: '0.35.1',
    date: '2026-10-09',
    title: 'Fighter box gear in Armory order',
    notes: [
      'The gear in the home fighter boxes now reads like the Armory: weapons, special and usable down the left column, head, chest, legs and boots down the right.',
    ],
  },
  {
    version: '0.35.0',
    date: '2026-10-09',
    title: 'Heat meter (temporary debug)',
    notes: [
      'For now, each fighter shows a small heat bar under their energy. It fills during close exchanges, the white tick marks how much heat that fighter can take, and the bar turns blue while they back off and circle to catch their breath.',
    ],
  },
  {
    version: '0.34.3',
    date: '2026-10-09',
    title: 'Full-screen UI on phones',
    notes: [
      'The menus and the battle HUD now use the top strip of the screen under the phone\'s status bar too, like the game already did.',
      'The UI keeps an even margin of 3% of the screen width on the left and right.',
    ],
  },
  {
    version: '0.34.2',
    date: '2026-10-09',
    title: 'Skin collection fixes',
    notes: [
      'Skin ownership now updates right away when you sign in or out of an account.',
    ],
  },
  {
    version: '0.34.1',
    date: '2026-10-09',
    title: 'Accounts are on',
    notes: [
      'Creating an account and signing in now work for everyone.',
    ],
  },
  {
    version: '0.34.0',
    date: '2026-10-09',
    title: 'Portrait backdrops',
    notes: [
      'Hero creation has a new last step after Name: pick the backdrop behind your portrait on the home screen.',
      'Five backdrops to choose from: Twilight, Sunset Peaks, Wildwood, Ember Forge and Frostlight. Change yours any time from Hero.',
      'Rivals show up with a random backdrop of their own.',
    ],
  },
  {
    version: '0.33.1',
    date: '2026-10-09',
    title: 'Bigger chests button',
    notes: [
      'The Chests button on the home screen is now big and purple, with a hopping chest and your gems.',
      'When you open one chest, your fighter wearing the new skin now stands as tall as the skin card.',
    ],
  },
  {
    version: '0.33.0',
    date: '2026-10-09',
    title: 'Gear that shines at night',
    notes: [
      'The bright outline around fighters at night is gone. Instead, as night falls on Skygrove Isle, only the parts of your gear meant to catch the light start to shine: gems, runes, embers, glowing veins and the glints on polished metal.',
      'How much it shines depends on the item: plain gear only glints a little, rare and mythic skins glow more, and legendary and epic skins shine the most and twinkle now and then.',
      'Your body and clothes stay dark, so the glow shows the gear without lighting up the whole fighter.',
    ],
  },
  {
    version: '0.32.3',
    date: '2026-10-09',
    title: 'Clearer account errors',
    notes: [
      'When signing in or creating an account fails, the message now also shows the exact reason, so problems are easy to report.',
    ],
  },
  {
    version: '0.32.2',
    date: '2026-10-09',
    title: 'Fighter boxes show everything',
    notes: [
      'The fighter boxes on the home screen are always open now, on phones and on PC. No more tapping to see the gear.',
      'Gear sits two items to a row with bigger icons, and the fighter portrait at the top is bigger too.',
    ],
  },
  {
    version: '0.32.1',
    date: '2026-10-09',
    title: 'Accounts work',
    notes: [
      'Creating an account no longer fails with "Accounts aren\'t switched on for this game yet".',
    ],
  },
  {
    version: '0.32.0',
    date: '2026-10-09',
    title: 'Five new epic sets, and legs for every set',
    notes: [
      'Bloodmoon Court is a vampire lord in crimson, black and moonlit silver: Sanguine Kiss, Nightwing, the Fang of the Blood Moon (a little bat flies at your shoulder), The Count\'s Tricorn, Vampire Lord\'s Mantle, Bloodmoon Breeches and Bloodmoon Riders. Its aura is crimson mist with bats circling.',
      'Starweaver wears the night sky: the Starfall Wand shoots falling stars, the Crescent Moon spins through the air, and the Comet Sigil calls down a comet. The rest is the Circlet of the Moon, Robe of the Night Sky, Constellation Leggings and Comet Striders, with a ring of twinkling stars and an orbiting moon for its aura.',
      'Frostbound Jarl is a northern warlord in rimed iron, white fur and glacier ice: Winterfist, Rimeguard, the Heart of Winter (a cluster of ice shards turning at your shoulder), Helm of the Frost Jarl, Frostbound Plate, Frostbound Chausses and Glacier Greaves. Snow falls around you when you wear it all.',
      'Stormcaller is thunder and lightning: Thunderstring (a bow strung with a lightning bolt), Tempest Aegis, the Stormheart (ball lightning in a gold cage), Crown of the Thunder King, Stormcaller Mail, Thunderstride Leggings and Galewalkers. Lightning arcs crackle round your feet.',
      'Voidborn comes from between the stars, all black chitin, violet light and far too many eyes: Voidreaver, the Eldritch Repeater, The Watcher (your familiar becomes a floating eyeball), Hood of a Thousand Eyes, Tendril Carapace, Chitin Cuisses and Voidwalkers. A void rift opens under you, with tendrils rising out of it.',
      'Every epic set now has a legs piece, the six older sets too: Shendyt of the Sun, Magma-Seamed Cuisses, Foxfire Hakama, Vinebound Leggings, Coral Scale Leggings and Piston Cuisses. A full set is now seven pieces, so you need the legs piece too to get its aura.',
      'Shots from epic weapons now trail and burst in their skin\'s colours instead of the stock ones.',
    ],
  },
  {
    version: '0.31.0',
    date: '2026-10-09',
    title: 'Skin chests and gems',
    notes: [
      'Skins are now collectibles. Open skin chests to get them: one chest costs 100 gems, and ten cost 900 and always hold a mythic or better.',
      'Everyone starts with 1000 gems. Skins you were already wearing stay yours.',
      'Win fights to earn gems: 25 for the win, plus up to 75 more for the health you have left. Online round wins pay too.',
      'Opening a chest is a show: it rattles, its light climbs from rare to mythic to legendary to epic, the lid blows off and your skins flip out on cards. Tap to skip ahead.',
      'Odds: rare 70%, mythic 22%, legendary 7%, epic 1%. An epic is guaranteed within 60 chests, and skins you already own give gems back.',
      'In the Armory, skins you have not found yet show a lock. Tap one to see where to get it.',
    ],
  },
  {
    version: '0.30.0',
    date: '2026-10-09',
    title: 'Accounts',
    notes: [
      'Make an account with just a name and a password, from the new Account button next to sound and settings or Sign in on the title screen.',
      'Your hero, gear, item skins, wins and settings are saved to your account and come with you to any device.',
      'Signing in for the first time keeps what you already have on this device. Playing without an account works like before.',
    ],
  },
  {
    version: '0.29.1',
    date: '2026-10-09',
    title: 'A cleaner home screen',
    notes: [
      'The home screen now gets out of the way of the duel behind it. The big fighter cards are now slim nameplates in the top corners. Tap one to see that fighter\'s gear.',
      'All the buttons sit together in the bottom-right corner: Armory, Hero and Rival above, Online and Fight below. Sound and settings moved to the bottom-left.',
    ],
  },
  {
    version: '0.29.0',
    date: '2026-10-09',
    title: 'Fighters glow softly at night',
    notes: [
      'As night falls on Skygrove Isle, the fighters and their weapons, armour and summoned items pick up a faint moonlit glow: a soft pale rim around them and a little of their own colour back, so they stay easy to read in the dark.',
      'It creeps in at dusk and is at its strongest under the full night sky. It stays subtle and never looks like the violet overtime power-up.',
    ],
  },
  {
    version: '0.28.0',
    date: '2026-10-09',
    title: 'Legs and usable gear',
    notes: [
      'Two new gear slots: Legs (between Chest and Boots) and Usable (under Special). The Armory and the battle card now show all eight.',
      'Six leggings: Leather, Chain, Stonehide Tassets, Windrunner, Runed and Bloodrite Wraps. Bloodrite Wraps give Second Wind: the first time you drop low, you heal a bit and get a burst of speed.',
      'Six usables with limited uses per fight: Healing Potion, Swiftness Draught, Fury Tonic, Stoneskin Elixir (washes off burns, poison and curses), Energy Tonic and Fire Bomb.',
      'Using one has its own animation: your fighter grabs the flask from the belt, pops the cork, drinks it down and tosses the empty bottle away, or lobs the Fire Bomb in an arc. Two-handed fighters lower their weapon to do it.',
      'The AI knows when to drink: it saves potions for when they matter and throws bombs when they will land.',
    ],
  },
  {
    version: '0.27.2',
    date: '2026-10-09',
    title: 'Armour icons show just the armour',
    notes: [
      'Head, chest and boots icons now show only the piece itself, with no body under it, and fill their slot.',
    ],
  },
  {
    version: '0.27.1',
    date: '2026-10-09',
    title: 'Menus fit phones held sideways',
    notes: [
      'On a phone held sideways, the hero steps now fit the screen. You see every species with its description, every body with all its stats, and the whole Look step without scrolling.',
      'Surprise me now sits next to the Look title.',
      'Settings on a sideways phone are side by side: volume and quotes on the left, the arena picker on the right.',
    ],
  },
  {
    version: '0.27.0',
    date: '2026-10-09',
    title: 'A real game menu',
    notes: [
      'New title screen: the Arena Legends logo over the live arena. Tap to start.',
      'Creating your hero is now a four-step character select: Species, Body, Look and Name. Your fighter stands big under a spotlight, and the arrows beside them flip through species and bodies.',
      'The gear screen is now the Armory, with item sockets and a gold cursor on what you have equipped.',
      'Every menu got a new pixel-art look: gold and iron framed panels, red ribbon titles, chunky buttons that press down, new menu sounds and smooth transitions.',
    ],
  },
  {
    version: '0.26.0',
    date: '2026-10-09',
    title: 'Three new epic sets',
    notes: [
      'Wildwood, a set of living wood and emerald with fireflies drifting around it. Elderheart is a longsword with an emerald blade and a crossguard of branches in bloom. The rest of the set is the Horn of the Wild Hunt, Dryad\'s Spirit Blade, Hood of the Stag King, Wildwood Mantle and Rootwalkers. Its aura is a ring of grass and blossoms with fireflies blinking around you.',
      'Abyssal Tide, a set of scale, coral and pearl lit by glowing sea life. It has the Trident of the Deep, the Nautilus Disc, the Leviathan Helm, Abyssal Scale, Tidewalkers and the Pearl of the Abyss, a little clam that floats at your shoulder and opens around a glowing pearl. Its aura is water ripples and rising bubbles.',
      'Clockwork Titan, a set of brass and steam with turning gears, pumping pistons and an arcane core. It has the Steamforge Hammer, Cogwheel Aegis, Automaton Visage, Titan Frame, Piston Stompers and the Clockwork Heart, which floats at your shoulder and beats. Its aura is a turning gear ring that vents steam.',
    ],
  },
  {
    version: '0.25.1',
    date: '2026-10-09',
    title: 'Item cards open where you tap',
    notes: [
      'In the gear screen, an item card now grows from the tile you tapped and starts on that tile\'s row. Tap a tile in the middle and it grows one tile to each side. Tap the first tile in a row and it grows to the right, or the last one and it grows to the left.',
    ],
  },
  {
    version: '0.25.0',
    date: '2026-10-09',
    title: 'Epic skins: three full sets',
    notes: [
      'A new top skin tier, Epic, above Legendary. Epic skins are the most detailed versions of their items, with animated parts and their own particles and hit effects in battle.',
      'They come in sets of six, one for each gear slot. Sunborn Dynasty: Scepter of Ra, Wings of Horus, Feather of Ma\'at, Nemes of the Sun King, Pharaoh\'s Regalia and Sandals of the Sun.',
      'Hellforged: Hellmaw, Brimstone Fangs, Doomcaller Sigil, Crown of Brimstone, Hellforged Carapace and Hellstriders. The sigil calls down a burning skull, and the fangs fly as hellfire.',
      'Foxfire Shrine: Kitsunebi, Shrine Gohei, Foxfire Lantern, Kitsune Mask, Nine-Tails Haori and Foxfire Geta. The lantern familiar and its shots become fox flames.',
      'Wear all six pieces of a set to get its aura: a turning sun ring, a ring of hellfire, or fox flames circling you.',
      'Epic skins have their own animated frame in the skin picker, which shows the set name and how many pieces you wear. Equip set puts on all six items in their set skins at once.',
    ],
  },
  {
    version: '0.24.0',
    date: '2026-10-09',
    title: 'New arena: Emberforge Caldera',
    notes: [
      'A brand new arena: duel on a platform of basalt columns standing in a lava lake, inside a volcano, in front of an ancient giants\' forge. Lavafalls pour down the cliffs, embers rise around the fighters and everything glows from the lava below.',
      'The volcano gets angrier as the round goes on: more lava bombs, lightning in the ash plume, more embers. In overtime it erupts.',
      'Sunset Colosseum, Moonlit Keep and Jade Temple are gone. The arena picker in Settings now offers Skygrove Isle, Emberforge Caldera and Random. If you had picked one of the removed arenas, you are back on Skygrove Isle.',
    ],
  },
  {
    version: '0.23.0',
    date: '2026-10-09',
    title: 'Fights with a rhythm',
    notes: [
      'Fighters now feel each other out at the start: quick, safe pokes to test reactions before they commit to big moves. The better they read you, the bolder they get.',
      'After a hot exchange, fighters break off and circle to catch their breath before the next clash. Hot-headed fighters barely pause and may chase you down, while patient ones take their time. They still punish any opening.',
      'The clock now matters more and more as the end approaches: a fighter who is behind stops resting and pushes hard, and one who is ahead plays it safe.',
      'A new "Circling" stance shows up on the battle HUD while a fighter is catching their breath.',
    ],
  },
  {
    version: '0.22.0',
    date: '2026-10-09',
    title: 'Smoother, more natural fighters',
    notes: [
      'Attacks have extra in-between frames: weapons travel in smooth arcs, the wind-up holds a moment before the strike, and fighters ease back into their stance instead of snapping.',
      'Capes, scarves, hair and tails now trail behind the body and keep swinging after a lunge or a dodge.',
      'Smoother run and back-pedal cycles with arm pumping and a steadier head. Fighters catch their weight when they stop running and crouch to absorb a landing.',
      'Idle fighters breathe and shift their weight, each on their own rhythm.',
      'Hits knock the fighter back a touch, and knocked-out fighters bounce once when they hit the ground.',
    ],
  },
  {
    version: '0.21.1',
    date: '2026-10-09',
    title: 'Tap an item card again to close it',
    notes: [
      'In the gear screen, tapping an open item card anywhere closes it. The skin icons and the Equip button still work as before.',
      'The X button on the item card is gone.',
    ],
  },
  {
    version: '0.21.0',
    date: '2026-10-09',
    title: 'Volume sliders',
    notes: [
      'Settings now has three volume sliders instead of on/off switches: Master, Music and Sound effects. Changes apply while you drag.',
      'Setting Music to 0 turns the battle soundtrack off. If you had turned Music off before, it stays off. The sound button on the menu still mutes everything at once.',
    ],
  },
  {
    version: '0.20.0',
    date: '2026-10-09',
    title: 'Three new bodies, three new species',
    notes: [
      'New body form Stout: short legs and a big round belly. Hard to knock over and heals more, but slow with short reach.',
      'New body form Feral: hunched and coiled with long arms. Fast, relentless strikes that drink a little life, but thin hide.',
      'New body form Titan: a towering giant with huge health, long reach and crushing force, but the slowest swings in the arena.',
      'New species Saurin (lizard-folk with a snout, a spiny crest and a sweeping tail), Myco (mushroom-folk under a spotted cap that glows at night) and Ursin (bear-folk with round ears and a broad muzzle).',
      'Each species now has its own set of body forms: no Titan imps or Feral golems. The creator shows the forms each species can take.',
      'If your fighter had a form their species no longer takes, they moved to the closest one it does.',
    ],
  },
  {
    version: '0.19.1',
    date: '2026-10-09',
    title: 'Roomier item cards in the gear screen',
    notes: [
      'The item card in the gear screen is now three tiles wide and two tall, so everything fits comfortably.',
      'Every item shows its full description and every skill\'s full text, never cut off. Item names wrap instead of being shortened.',
      'Items with a passive now show its name, like "Passive: Echo".',
      'Under the skin icons you can read the skin you picked, its rarity and what that rarity changes. With no skin picked, it tells you how many skins the item has.',
    ],
  },
  {
    version: '0.19.0',
    date: '2026-10-09',
    title: 'A battle soundtrack that builds',
    notes: [
      'Fights now have music, and it reacts to the fight: the lower the weaker fighter\'s health, the more intense it gets. It starts with a calm groove, then drums, a driving bass, arpeggios and a full theme come in, the chords darken and the tempo speeds up.',
      'When someone is one or two hits from defeat, a heartbeat, trembling strings and rising swells take over. Heals let the music settle back down.',
      'Night overtime lifts the whole song a step higher and adds war drums. A knockout ends it on a final chord.',
      'Pausing muffles the music. Turn it off any time with the new Music switch in Settings.',
    ],
  },
  {
    version: '0.18.0',
    date: '2026-10-09',
    title: 'Steadier screen shake',
    notes: [
      'Big hits now shake only the arena itself: the island, the fighters and the effects. The sky, the sun and the floating islands in the distance stay still, so heavy blows feel like they hit the ground instead of the whole screen.',
      'The same goes for every arena: the stands and floor jolt, the sky and mountains behind them stay put.',
    ],
  },
  {
    version: '0.17.0',
    date: '2026-10-09',
    title: 'Less health for every body',
    notes: [
      'Every body form now starts with 30% less health (Balanced goes from 3,040 to 2,128), so fights are quicker and knockouts come sooner.',
      'Items are unchanged. Night overtime still kicks in after 60 seconds if both fighters are standing.',
    ],
  },
  {
    version: '0.16.0',
    date: '2026-10-09',
    title: '30 more item skins, and skins for special items',
    notes: [
      'Special items get skins for the first time, and they change colour in battle too: Frostfall Sigil (an ice meteor), Crimson Phantom, Firefly Lantern, Bluefire Plume (revive in blue flames), Amber Echo, Moonsilver Fang, Soulfire Core and Amethyst Core.',
      'Two more Rare skins: Royal Guard for the Longsword and Bone Mask for the Berserker Mask.',
      '10 new Mythic skins that reshape the item: Raven Feathers, Lotus Chakram, Hourglass Crown, Thunderbird Crest, Musketeer Hat, Wraith Shroud, Rosethorn Mail, Ranger Mantle, Buccaneer Boots and Gothic Sabatons.',
      '10 new Legendary skins with living animations and sparkles: Tidecaller, Everbloom (a blossom that turns), Venomspitter, Horn of the Aurora, Bloodfury Visage, Seraph Helm (beating wings and a halo), Soulbound Plate (skull pauldrons and climbing soul runes), Prism Mail (floating crystal shards), Earthshakers (glowing magma cracks) and Umbral Treads (shadow smoke).',
      'Chest pieces and boots can now really change shape: capes, mantles, quivers, roses, cuffs, pointed sabatons and more.',
      'Boot patterns now stay on the boot as the leg moves.',
    ],
  },
  {
    version: '0.15.0',
    date: '2026-10-09',
    title: 'Night overtime',
    notes: [
      'If both fighters are still standing after 60 seconds, the round goes into 30 seconds of overtime instead of ending.',
      'Overtime happens at night: both fighters glow violet and deal double damage until someone falls or time runs out.',
      'The clock shows OT and counts down the 30 extra seconds. If nobody is knocked out by the end, the round still goes to remaining health.',
      'Fighters play the clock in the last seconds of overtime: whoever is ahead plays it safe and whoever is behind goes all in.',
    ],
  },
  {
    version: '0.14.1',
    date: '2026-10-09',
    title: 'Refresh for updates',
    notes: [
      'A new refresh button sits next to the patch notes button. Tap it to grab the latest version of the game right away, even from the installed app.',
    ],
  },
  {
    version: '0.14.0',
    date: '2026-10-09',
    title: 'Double health for every body',
    notes: [
      'Every body form now starts with twice the health (Balanced goes from 1,520 to 3,040), so fights last longer and comebacks are more likely.',
      'Items that raise health by a percentage scale with the new totals. Shields and heals that are a share of max health grow with it too.',
    ],
  },
  {
    version: '0.13.0',
    date: '2026-10-09',
    title: 'Camera modes',
    notes: [
      'A new camera button sits next to the settings cog during battles. Tap it (or press C) to cycle through four cameras; your pick is remembered.',
      'Classic shows the whole arena, as before.',
      'Action frames the duel a little closer, punches in on crits, heavy hits, parries and wall splats, and goes in tight on the knockout.',
      'Close-up stays as close as it can while keeping both fighters in view, and pulls back when they split apart.',
      'Follow stays on your own fighter, leaning toward your rival.',
      'Every camera zooms in whole pixel steps, so the pixel art stays sharp.',
    ],
  },
  {
    version: '0.12.0',
    date: '2026-10-08',
    title: 'Faster rounds: 60 seconds',
    notes: [
      'Battles now last 60 seconds instead of 99. If nobody is knocked out by then, the round goes to time as before.',
      'On Skygrove Isle the sun now crosses the sky, sets and gives way to night within those 60 seconds.',
      'Fighters still play the clock in the last few seconds: whoever is ahead plays it safe and whoever is behind goes all in.',
    ],
  },
  {
    version: '0.11.1',
    date: '2026-10-08',
    title: 'Item details open right in the gear grid',
    notes: [
      'Tapping an item in the gear screen no longer opens a big pop-up. The item grows in place into a small card the size of four tiles, with the rest of the grid moving around it.',
      'The card is compact: a short description, the skills with cooldowns, how your stats would change, a row of skin icons to pick from, and the Equip button.',
      'Long item names now wrap onto two lines instead of being cut off.',
    ],
  },
  {
    version: '0.11.0',
    date: '2026-10-08',
    title: 'Skygrove: real sun shafts and softer shadows',
    notes: [
      'Sun shafts on Skygrove Isle now come from the sun itself and get blocked by whatever is in the way: floating islands, tree crowns, the arch, even the fighters. At sunset the light streams out between the tree trunks.',
      'Once night falls the moon casts faint shafts of its own.',
      'Fighters and the standing stones cast a shadow away from the sun that grows longer as it sets.',
      'Soft ambient shadows everywhere: under the tree crowns, at the foot of bushes and trunks, where the meadow meets the grove and under the island\'s grassy lip.',
      'In the golden hour the side facing the sun glows warm and the far side cools down.',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-10-08',
    title: 'A new gear screen built around your fighter',
    notes: [
      'Your fighter now stands big in the middle of the gear screen, with the six gear slots around them: what you hold on the left, what you wear on the right.',
      'Items are shown as a clean grid of icons and names. Tap one to open its card with the description, skills and cooldowns, its stats, how your stats would change, and its skins. Equip it from there.',
      'On phones, a Stats button shows your full stats over the stage, and Done sits at the top so the list has more room.',
      'The character creator shows your fighter much larger on phones, with the name and tags tucked into the corner of the stage.',
      'Creator buttons on phones are smaller and cleaner, and Next stays centred.',
    ],
  },
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
