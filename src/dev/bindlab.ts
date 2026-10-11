import '../ui/styles.css';
import { Battle } from '../sim/battle';
import { DEFAULT_BUILDS } from '../sim/loadout';
import type { FighterBrain } from '../sim/ai/brain';
import type { Fighter } from '../sim/fighter';
import type { MainWeaponId } from '../sim/types';
import { Screen } from '../render/screen';
import { BattleView } from '../render/battleView';
import { THEMES } from '../render/arenaArt';

const q = new URLSearchParams(location.search);
const screen = new Screen(document.getElementById('app')!);
const view = new BattleView(screen);
class SyncBrain implements FighterBrain {
  plan = 'pressure' as FighterBrain['plan'];
  constructor(private f: Fighter) {}
  think(b: Battle): void {
    const f = this.f, e = b.other(f);
    f.move = 0;
    if (f.action || b.lock) return;
    const d = Math.abs(e.x - f.x);
    if (d > 1.7) { f.move = Math.sign(e.x - f.x); return; }
    f.cooldowns[0] = 0;
    b.startAction(f, 0);
  }
}
const w = (q.get('w') ?? 'longsword') as MainWeaponId, w2 = (q.get('w2') ?? w) as MainWeaponId;
const a = { ...DEFAULT_BUILDS[0], gear: { main: w } };
const d = { ...DEFAULT_BUILDS[1], gear: { main: w2 } };
const b = new Battle({ seed: Number(q.get('seed') ?? 3), fighters: [a, d], brains: [(f) => new SyncBrain(f), (f) => new SyncBrain(f)] });
for (const f of b.fighters) f.base.maxHp = f.stats.maxHp = f.hp = 1e6;
view.camMode = 'action';
view.start(b, THEMES[Number(q.get('arena') ?? 0) % THEMES.length]);
(window as unknown as { lab: unknown }).lab = { view, b, step(n = 1) { for (let i = 0; i < n; i++) view.frame(1 / 60); } };
