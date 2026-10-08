import { it } from 'vitest';
import { DEFAULT_LOOK, type Appearance } from '../src/character/appearance';
import type { CharacterBuild } from '../src/sim/loadout';
import type { FormId } from '../src/sim/types';
import { Raster } from '../src/render/pixel/raster';
import { pack } from '../src/render/pixel/color';
import { drawFigure } from '../src/render/sprite/draw';
import { makeArt } from '../src/render/sprite/look';
import { clipLength, clipsFor, frameSpec } from '../src/render/sprite/anims';
import { Sheet, writePng } from './png';

const OUT = process.env.OUT ?? '/tmp/anims.png';

const BUILDS: [FormId, Partial<Appearance>, CharacterBuild['gear']][] = [
  ['balanced', { species: 'kitsu' }, { main: 'longsword', secondary: 'kite_shield', chest: 'plate_armor', boots: 'leather_boots', head: 'duelist_band' }],
  ['mighty', { species: 'ogrin', hair: 3 }, { main: 'warhammer', secondary: 'parrying_dagger', chest: 'thornmail', boots: 'iron_greaves' }],
  ['agile', { species: 'lop', hair: 2 }, { main: 'longbow', secondary: 'throwing_knives', chest: 'leather_jerkin', boots: 'zephyr_boots' }],
  ['slender', { species: 'imp', hair: 1 }, { main: 'spear', secondary: 'hand_crossbow', chest: 'phase_cloak', boots: 'shadow_treads' }],
  ['ethereal', { species: 'wisp', hair: 5 }, { main: 'arcane_staff', secondary: 'war_horn', chest: 'mage_robe', head: 'chrono_circlet' }],
  ['robust', { species: 'golem' }, { main: 'greataxe', secondary: 'buckler', chest: 'mirror_mail', boots: 'colossus_boots', head: 'iron_helm' }],
  ['agile', { species: 'kitsu', hair: 0 }, { main: 'dagger', secondary: 'frost_wand', head: 'executioner_hood', boots: 'leaping_boots' }],
  ['balanced', { species: 'imp', hair: 4 }, { main: 'katana', secondary: 'wind_chakram', head: 'berserker_mask' }],
  ['slender', { species: 'lop', hair: 1 }, { main: 'ember_wand', secondary: 'kite_shield', chest: 'mage_robe' }],
];

/** Dev preview: every clip of one build, one clip per row (`BUILD=0 OUT=... npm run ...`). */
it('animation sheet', () => {
  const [form, look, gear] = BUILDS[Number(process.env.BUILD ?? 0)];
  const art = makeArt({ name: 'x', form, gear, look: { ...DEFAULT_LOOK, ...look } });
  const set = clipsFor(art);
  const only = process.env.CLIPS?.split(',');
  const ids = [...set.clips.keys()].filter((k) => !only || only.includes(k));
  const cw = 84, ch = 92;
  const cols = Math.max(...ids.map((k) => clipLength(set.clips.get(k)!)));
  const sheet = new Sheet(cols * cw, ids.length * ch, pack(0x6a7a8a));
  const r = new Raster(160, 140);
  ids.forEach((id, row) => {
    const c = set.clips.get(id)!;
    for (let i = 0; i < clipLength(c); i++) {
      r.clear();
      drawFigure(r, art, frameSpec(c, i, null, false), 80, 110);
      const f = r.compose(80, 110);
      const cx = i * cw + cw / 2, cy = row * ch + ch - 14;
      sheet.blit(f.data, f.w, f.h, cx - f.ox, cy - f.oy);
      // Ground tick.
      for (let x = -12; x <= 12; x++) sheet.data[(cy + 1) * sheet.w + cx + x] = pack(0x404a56);
    }
  });
  writePng(OUT, sheet.w, sheet.h, sheet.data, 2);
  console.log(ids.join(' '));
});
