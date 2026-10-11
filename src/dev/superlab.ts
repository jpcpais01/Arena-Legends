/**
 * Dev-only super attack lab (open /superlab.html in `npm run dev`): one
 * fighter keeps using its main weapon's super on a dummy, so the effects can
 * be looked at and captured frame by frame.
 * URL: ?w=katana&skin=katana.sakura&cam=classic&auto=0 (auto=0: step by hand via window.lab).
 */
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/latin-900-italic.css';
import '../ui/styles.css';
import { Battle } from '../sim/battle';
import { DEFAULT_BUILDS } from '../sim/loadout';
import type { FighterBrain } from '../sim/ai/brain';
import type { Fighter } from '../sim/fighter';
import type { CharacterBuild } from '../sim/loadout';
import type { MainWeaponId } from '../sim/types';
import { Screen } from '../render/screen';
import { BattleView, type CamMode } from '../render/battleView';
import { THEMES } from '../render/arenaArt';
import { Hud } from '../ui/hud';

const q = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const screen = new Screen(app);
const view = new BattleView(screen);
const noop = () => {};
const hud = new Hud({ onSpeed: noop, onPause: noop, onExit: noop, onSettings: noop, onCamera: noop }, view);
ui.append(hud.el);

/** Walks into range and fires the super whenever it can; the other side stands still. */
class SuperBrain implements FighterBrain {
  plan = 'pressure' as FighterBrain['plan'];
  constructor(private f: Fighter, private on: boolean) {}
  think(b: Battle): void {
    const f = this.f, e = b.other(f);
    f.move = 0;
    if (!this.on || f.action) return;
    f.energy = 100;
    const idx = f.abilities.findIndex((a) => a.slot === 'skill');
    const ab = f.abilities[idx];
    const d = Math.abs(e.x - f.x);
    if (d > ab.range * 0.85) { f.move = Math.sign(e.x - f.x); return; }
    if (f.cooldowns[idx] > 0) f.cooldowns[idx] = 0;
    b.startAction(f, idx);
  }
}

function start(w: string, skin: string | null, seed = 7): Battle {
  const a: CharacterBuild = { ...DEFAULT_BUILDS[0], gear: { ...DEFAULT_BUILDS[0].gear, main: w as MainWeaponId }, skins: skin ? { [w]: skin } : {} };
  const d: CharacterBuild = { ...DEFAULT_BUILDS[1] };
  const b = new Battle({ seed, fighters: [a, d], brains: [(f) => new SuperBrain(f, true), (f) => new SuperBrain(f, false)] });
  b.fighters[1].stats.maxHp = b.fighters[1].hp = 1e6;
  view.quiet = false;
  view.camMode = (q.get('cam') as CamMode) ?? 'classic';
  view.start(b, THEMES[Number(q.get('arena') ?? 0) % THEMES.length]);
  hud.setup(b, 1);
  hud.show(true);
  return b;
}

let battle = start(q.get('w') ?? 'longsword', q.get('skin'));
const auto = q.get('auto') !== '0';
let last = performance.now();
function loop(t: number): void {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (auto) { view.frame(dt); hud.update(dt); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

(window as unknown as { lab: unknown }).lab = {
  view, hud,
  get battle() { return battle; },
  restart(w: string, skin: string | null) { battle = start(w, skin); },
  /** Advances `n` frames of 1/60 s. */
  step(n = 1) { for (let i = 0; i < n; i++) { view.frame(1 / 60); hud.update(1 / 60); } },
};
