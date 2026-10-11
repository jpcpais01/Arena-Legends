/**
 * Dev-only finale lab (open /finlab.html in `npm run dev`).
 * - ?mode=sheet&pose=salute: every frame of a victory pose, one row per weapon family.
 * - ?mode=battle&fin=frost&pose=flex&w=katana&skin=katana.sakura&cam=action&auto=0: a fighter
 *   walks up and knocks a one-hit dummy out, so the finisher and pose play (step by hand via window.lab).
 */
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/latin-900-italic.css';
import '../ui/styles.css';
import { Battle } from '../sim/battle';
import type { FighterBrain } from '../sim/ai/brain';
import type { Fighter } from '../sim/fighter';
import type { MainWeaponId } from '../sim/types';
import { Screen } from '../render/screen';
import { BattleView, type CamMode } from '../render/battleView';
import { THEMES } from '../render/arenaArt';
import { Hud } from '../ui/hud';
import { isFinisher, type FinisherId } from '../character/finales';
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

/** Walks up and swings (or shoots) until the other one drops; the other side stands still. */
class KoBrain implements FighterBrain {
  plan = 'pressure' as FighterBrain['plan'];
  constructor(private f: Fighter, private on: boolean) {}
  think(b: Battle): void {
    const f = this.f, e = b.other(f);
    f.move = 0;
    if (!this.on || f.action || b.over) return;
    const idx = f.abilities.findIndex((a) => a.slot === 'basic');
    const ab = f.abilities[idx];
    if (Math.abs(e.x - f.x) > ab.range * 0.8) { f.move = Math.sign(e.x - f.x); return; }
    if (f.cooldowns[idx] > 0) return;
    b.startAction(f, idx);
  }
}

function battle(): void {
  const screen = new Screen(app);
  const view = new BattleView(screen);
  const noop = () => {};
  const hud = new Hud({ onSpeed: noop, onPause: noop, onExit: noop, onSettings: noop, onCamera: noop }, view);
  document.getElementById('ui')!.append(hud.el);
  let b!: Battle;
  const start = (fin: FinisherId, pose: PoseId, w: string, skin: string | null, flip = false) => {
    const a: CharacterBuild = { ...DEFAULT_BUILDS[0], gear: { ...DEFAULT_BUILDS[0].gear, main: w as MainWeaponId }, skins: skin ? { [w]: skin } : {} };
    const d: CharacterBuild = { ...DEFAULT_BUILDS[1] };
    const pair: [CharacterBuild, CharacterBuild] = flip ? [d, a] : [a, d];
    const me = flip ? 1 : 0;
    b = new Battle({ seed: 7, fighters: pair, brains: [(f) => new KoBrain(f, f.id === me), (f) => new KoBrain(f, f.id === me)] });
    b.fighters[1 - me].hp = 1;
    view.quiet = q.get('quiet') === '1';
    view.camMode = (q.get('cam') as CamMode) ?? 'action';
    view.start(b, THEMES[Number(q.get('arena') ?? 0) % THEMES.length]);
    view.setFinales([fin, fin], [pose, pose]);
    hud.setup(b, 1);
    hud.show(true);
    view.listener = { onEvent: (e) => hud.onEvent(e) };
  };
  const fin = q.get('fin'), pose = q.get('pose');
  start(isFinisher(fin) ? fin : 'clean', isPose(pose) ? pose : 'cheer', q.get('w') ?? 'longsword', q.get('skin'), q.get('flip') === '1');
  const auto = q.get('auto') !== '0';
  let last = performance.now();
  const loop = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (auto) { view.frame(dt); hud.update(dt); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const step = (n = 1) => { for (let i = 0; i < n; i++) { view.frame(1 / 60); hud.update(1 / 60); } };
  (window as unknown as { lab: unknown }).lab = {
    view, hud, start, step,
    get battle() { return b; },
    /** Steps until the knockout (at most 20 s); returns the frames it took. */
    untilKo() { let n = 0; while (!b.over && n < 1200) { step(); n++; } return n; },
  };
}

const pose = q.get('pose');
if ((q.get('mode') ?? 'sheet') === 'sheet') sheet(isPose(pose) ? pose : 'salute');
else battle();
