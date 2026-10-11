/**
 * Dev-only finale lab (open /finlab.html in `npm run dev`).
 * - ?mode=sheet&pose=salute: every frame of a victory pose, one row per weapon family.
 */
import { DEFAULT_BUILDS, type CharacterBuild } from '../sim/loadout';
import type { GearSet } from '../sim/types';
import { isPose, type PoseId } from '../character/finales';
import { clipLength, clipsFor } from '../render/sprite/anims';
import { SpriteBank } from '../render/sprite/bank';
import { makeArt } from '../render/sprite/look';
import { ensurePose } from '../render/sprite/winPoses';

const q = new URLSearchParams(location.search);
const app = document.getElementById('app')!;

const KITS: Partial<GearSet>[] = [
  { main: 'longsword', secondary: 'kite_shield' }, { main: 'katana' }, { main: 'warhammer' }, { main: 'greataxe' },
  { main: 'spear' }, { main: 'arcane_staff', secondary: 'frost_wand' }, { main: 'longbow', secondary: 'throwing_knives' }, { main: 'ember_wand', secondary: 'buckler' },
];

function build(i: number, gear: Partial<GearSet>): CharacterBuild {
  const b = DEFAULT_BUILDS[i % 2];
  return { ...b, form: i % 3 === 2 ? 'mighty' : b.form, gear: { ...b.gear, secondary: undefined, ...gear } as GearSet };
}

function sheet(id: PoseId): void {
  const S = 2, CW = 52, CH = 78;
  const rows = KITS.map((g, i) => {
    const art = makeArt(build(i, g));
    const set = clipsFor(art);
    const k = ensurePose(set, art, id);
    return { bank: new SpriteBank(art, set), k, n: clipLength(set.clips.get(k)!) };
  });
  const cols = Math.max(...rows.map((r) => r.n));
  const c = document.createElement('canvas');
  c.className = 'sheet';
  c.width = cols * CW; c.height = rows.length * CH;
  c.style.width = c.width * S / devicePixelRatio + 'px';
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a2238'; g.fillRect(0, 0, c.width, c.height);
  rows.forEach((r, y) => {
    for (let f = 0; f < r.n; f++) {
      const s = r.bank.get({ clip: r.k, frame: f, face: null, secOut: false, useOut: false, jitter: 0, hop: 0, key: `${r.k}.${f}.` });
      const gx = f * CW + CW / 2, gy = y * CH + CH - 8;
      g.fillStyle = '#3a3050'; g.fillRect(f * CW, gy, CW - 1, 1);
      g.drawImage(s.img, gx - s.ox, gy - s.oy);
    }
  });
  app.append(c);
}

const pose = q.get('pose');
if ((q.get('mode') ?? 'sheet') === 'sheet') sheet(isPose(pose) ? pose : 'salute');
