import { sfx, type Sfx } from '../audio/sfx';
import {
  DUPE_GEMS, EPIC_PITY, gems, ODDS, onCollection, openChest, owns, pity, progress, PULL_COST, TEN_COST, WIN_BASE, WIN_HP_BONUS, type Pull,
} from '../character/collection';
import type { PlayerCharacter } from '../character/profile';
import { setPieces, SKIN_RARITIES, SKIN_SET_BY_ID, type SkinDef, type SkinRarity } from '../character/skins';
import { iconCanvas } from '../render/icons';
import { gearOf, SLOT_NAMES } from '../sim/gear';
import { withGear } from '../sim/loadout';
import { ChestFx } from './chestFx';
import { h } from './dom';
import { fmtInt } from './format';
import { icon } from './icons';
import { Preview } from './preview';

export interface ChestCallbacks {
  onClose(): void;
  /** Wears a pulled skin, equipping its item too. */
  onEquip(skin: SkinDef): void;
  /** The player's fighter, to show a pulled skin on. */
  player(): PlayerCharacter | null;
}

const REVEAL: Record<SkinRarity, Sfx> = { rare: 'revealRare', mythic: 'revealMythic', legendary: 'revealLegendary', epic: 'revealEpic' };
const TIER_NAME: Record<SkinRarity, string> = { rare: 'Rare', mythic: 'Mythic', legendary: 'Legendary', epic: 'Epic' };
const rank = (r: SkinRarity) => SKIN_RARITIES.indexOf(r);

/** A gem amount with the gem glyph. */
export function gemTag(n: number | string, cls = ''): HTMLElement {
  return h(`span.gem-tag${cls ? '.' + cls : ''}`, null, icon('gem'), h('b', null, typeof n === 'number' ? fmtInt(n) : n));
}

/**
 * Skin chests: spend gems to pull item skins. The chest stands on the left
 * with the odds and buttons beside it. Opening one plays the whole show: the
 * chest shakes and its light climbs through the tiers up to the best skin
 * inside, the lid blows off, and the skins are revealed on cards (ten flip
 * one by one, the rare ones teased first). Tap to skip ahead.
 */
export function chestScreen(cb: ChestCallbacks): { el: HTMLElement; dispose(): void } {
  const fx = new ChestFx();
  let dead = false;
  let busy = false;
  let skipping = false;
  let wake: (() => void) | null = null;
  let rattle = 0;
  let previews: Preview[] = [];

  /** Waits `s` seconds, or less when the player taps to skip. */
  const wait = (s: number) => new Promise<void>((res) => {
    if (skipping || dead) { res(); return; }
    const done = () => { clearTimeout(id); if (wake === done) wake = null; res(); };
    const id = setTimeout(done, s * 1000);
    wake = done;
  });
  const skip = () => { if (!busy) return; skipping = true; wake?.(); };

  // --- Gem counter (counts up and down to the new amount) ---------------------------------------
  const gemNum = h('b');
  const gemChip = h('div.gem-chip', { title: 'Gems' }, icon('gem'), gemNum);
  let shown = gems();
  let countRaf = 0;
  gemNum.textContent = fmtInt(shown);
  const countTo = (n: number) => {
    cancelAnimationFrame(countRaf);
    const from = shown, t0 = performance.now();
    gemChip.classList.remove('bump'); void gemChip.offsetWidth; gemChip.classList.add('bump');
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 450);
      shown = Math.round(from + (n - from) * (1 - (1 - k) ** 3));
      gemNum.textContent = fmtInt(shown);
      if (k < 1) countRaf = requestAnimationFrame(step);
    };
    countRaf = requestAnimationFrame(step);
  };

  // --- Shop panel -------------------------------------------------------------------------------
  const odds = h('div.chest-odds');
  const pityLine = h('p.chest-pity');
  const buy1 = h<HTMLButtonElement>('button.btn.buy', { onclick: () => void open(1) },
    h('span.buy-l', null, icon('chest'), 'Open 1'), gemTag(PULL_COST));
  const buy10 = h<HTMLButtonElement>('button.btn.primary.go.buy', { onclick: () => void open(10) },
    h('span.buy-l', null, icon('chest'), 'Open 10'), gemTag(TEN_COST));
  const panel = h('section.scr-panel.frame.chest-panel', null,
    h('div.ribbon', null, h('span', null, 'Skin chest')),
    h('p.chest-blurb', null, 'Every chest holds one item skin. Skins change how your gear looks, never how it fights.'),
    odds,
    pityLine,
    h('div.chest-buy', null, buy1, buy10),
    h('p.chest-note', null, h('b', null, 'Open 10'), ' costs one chest less and always holds a mythic or better.'),
    h('p.chest-note', null, 'Already own a skin? You get gems back: ',
      ...SKIN_RARITIES.flatMap((r, i) => [h(`b.r-${r}`, null, `${DUPE_GEMS[r]}`), i < SKIN_RARITIES.length - 1 ? ' / ' : '.'])),
    h('p.chest-note.earn', null, icon('swords'), ` Win fights to earn gems: ${WIN_BASE} per win, plus up to ${WIN_HP_BONUS} more for the health you keep.`),
  );

  function renderShop(): void {
    const prog = progress();
    odds.replaceChildren(...SKIN_RARITIES.slice().reverse().map((r) => {
      const [got, all] = prog[r];
      return h(`div.odds-row.${r}`, null,
        h(`b.tier.r-${r}`, null, TIER_NAME[r]),
        h('span.pct', null, `${Math.round(ODDS[r] * 1000) / 10}%`),
        h('span.own-bar', { title: `${got} of ${all} owned` }, h('i', { style: { width: `${(got / Math.max(1, all)) * 100}%` } })),
        h('small', null, `${got}/${all}`));
    }));
    const left = EPIC_PITY - pity();
    pityLine.replaceChildren(icon('star'), ' Epic guaranteed within ', h('b', null, `${left}`), left === 1 ? ' chest' : ' chests');
    const g = gems();
    buy1.disabled = g < PULL_COST;
    buy10.disabled = g < TEN_COST;
  }

  // --- Stage: the chest itself ---------------------------------------------------------------
  const spot = h('div.chest-spot', { title: 'Open a chest', onclick: () => void open(1) });
  const stage = h('section.scr-stage.chest-stage', null, spot, h('div.chest-hint', null, h('span', null, 'Tap the chest')));

  const reveal = h('div.gacha-reveal', { onclick: (e: MouseEvent) => { if (!(e.target as Element).closest('button')) skip(); } });
  const done = h('button.btn.primary.done', { onclick: () => close() }, icon('check'), 'Done');
  const el = h('div.scr.gacha', { role: 'dialog', 'aria-label': 'Skin chests' },
    fx.canvas,
    h('header.scr-head', null, h('div.scr-title', null, h('h1', null, 'Skin Chests')), h('div.grow'), gemChip, done),
    stage, panel, reveal,
  );
  // Taps on the darkened screen skip the opening too.
  fx.canvas.addEventListener('click', skip);

  const unlisten = onCollection(() => { countTo(gems()); if (!busy) renderShop(); });
  renderShop();

  const layout = () => { fx.resize(); fx.anchor(spot); };
  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => { if (dead) return; layout(); fx.start(); });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { if (busy) skip(); else close(); }
    else if ((e.key === 'Enter' || e.key === ' ') && busy) { e.preventDefault(); skip(); }
  };
  window.addEventListener('keydown', onKey);

  function close(): void {
    if (busy) return;
    sfx.play('back');
    cb.onClose();
  }

  function clearReveal(): void {
    for (const p of previews) p.dispose();
    previews = [];
    reveal.replaceChildren();
  }

  /** Back to the shop after a reveal. */
  function backToShop(): void {
    clearReveal();
    el.classList.remove('opening', 'revealed');
    fx.setCentered(false);
    fx.reset();
    renderShop();
  }

  // --- The opening ---------------------------------------------------------------------------
  async function open(count: 1 | 10): Promise<void> {
    if (busy) return;
    const pulls = openChest(count);
    if (!pulls) {
      sfx.play('back');
      (count === 10 ? buy10 : buy1).classList.add('nope');
      setTimeout(() => (count === 10 ? buy10 : buy1).classList.remove('nope'), 400);
      return;
    }
    busy = true;
    skipping = false;
    clearReveal();
    el.classList.remove('revealed');
    el.classList.add('opening');
    sfx.play('confirm');
    fx.reset();
    fx.setCentered(true);
    const top = pulls.reduce((m, p) => Math.max(m, rank(p.skin.rarity)), 0);
    const topTier = SKIN_RARITIES[top];

    // Charge: the chest rattles and its light climbs one tier at a time.
    await wait(0.45);
    rattle = window.setInterval(() => sfx.play('rattle', (Math.random() - 0.5) * 0.6), 150);
    for (let i = 0; i <= top && !dead; i++) {
      if (skipping) { fx.tier = topTier; fx.glow = 1; break; }
      fx.pulse(SKIN_RARITIES[i]);
      fx.glow = 0.45 + i * 0.18;
      fx.shake = 0.6 + i * 0.5;
      if (i > 0) sfx.play('tierUp', 0, i);
      await wait(i < top ? 0.8 : 0.75);
    }
    clearInterval(rattle);
    if (dead) return;

    // Burst.
    fx.burst(topTier);
    fx.rays = 1;
    sfx.play('chestOpen');
    await wait(0.3);
    if (dead) return;
    el.classList.add('revealed');
    if (count === 1) showOne(pulls[0]);
    else await showTen(pulls);
    if (dead) return;
    busy = false;
    skipping = false;
  }

  function showOne(p: Pull): void {
    const s = p.skin;
    sfx.play(REVEAL[s.rarity]);
    const pl = cb.player();
    let stageEl: HTMLElement | null = null;
    if (pl) {
      // Your fighter wearing it.
      const g = gearOf(s.gear);
      const tryOn = { ...pl, ...withGear(pl, g.slot, s.gear), skins: { ...pl.skins, [s.gear]: s.id } } as PlayerCharacter;
      const box = h('div.reveal-fighter');
      const pv = new Preview(tryOn, 72, 78, { pedestal: true, fit: box });
      previews.push(pv);
      box.append(pv.el);
      setTimeout(() => { if (!dead) pv.showcase(); }, 500);
      stageEl = box;
    }
    const equip = h<HTMLButtonElement>('button.btn', {
      onclick: () => { cb.onEquip(s); sfx.play('equip'); equip.disabled = true; equip.replaceChildren(icon('check'), 'Equipped'); },
    }, icon('bag'), 'Equip');
    const again = h<HTMLButtonElement>('button.btn.primary.go.buy', { disabled: gems() < PULL_COST, onclick: () => void open(1) },
      h('span.buy-l', null, 'Open another'), gemTag(PULL_COST));
    const big = card(p, true);
    setTimeout(() => {
      if (dead) return;
      big.classList.add('flipped');
      const at = fx.pointOf(big);
      fx.pop(at.x, at.y, s.rarity, 40);
    }, 60);
    reveal.replaceChildren(
      h('div.reveal-one', null, stageEl, big),
      h('div.reveal-foot', null, h('button.btn', { onclick: () => { sfx.play('back'); backToShop(); } }, icon('back'), 'Back'), pl ? equip : null, again),
    );
  }

  async function showTen(pulls: Pull[]): Promise<void> {
    const m = fx.mouth;
    const grid = h('div.reveal-ten');
    const cards = pulls.map((p, i) => {
      const c = card(p, false);
      c.style.setProperty('--d', `${i * 45}ms`);
      return c;
    });
    grid.append(...cards);
    const foot = h('div.reveal-foot');
    reveal.replaceChildren(grid, foot);
    // Deal: every card flies out of the chest to its place, face down.
    const cr = fx.canvas.getBoundingClientRect();
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--dx', `${m.x * fx.k + cr.left - (r.left + r.width / 2)}px`);
      c.style.setProperty('--dy', `${m.y * fx.k + cr.top - (r.top + r.height / 2)}px`);
    }
    void grid.offsetWidth;
    grid.classList.add('dealt');
    sfx.play('whoosh');
    await wait(0.85);
    // Flip one by one; anything better than rare shakes first.
    for (let i = 0; i < cards.length && !dead; i++) {
      if (skipping) break;
      const p = pulls[i], c = cards[i];
      if (p.skin.rarity !== 'rare') {
        c.classList.add('tease');
        sfx.play('rattle');
        await wait(p.skin.rarity === 'epic' ? 0.7 : 0.4);
        if (skipping) break;
      }
      flip(c, p, true);
      await wait(p.skin.rarity === 'rare' ? 0.14 : p.skin.rarity === 'epic' ? 1 : 0.45);
    }
    if (dead) return;
    // Skipped: everything left turns over at once, with the best one's sound.
    const left = cards.map((c, i) => [c, pulls[i]] as const).filter(([c]) => !c.classList.contains('flipped'));
    if (left.length) {
      for (const [c, p] of left) flip(c, p, false);
      const best = left.reduce((a, b) => (rank(b[1].skin.rarity) > rank(a[1].skin.rarity) ? b : a))[1];
      sfx.play(REVEAL[best.skin.rarity]);
    }
    const fresh = pulls.filter((p) => p.fresh).length;
    const back = pulls.reduce((n, p) => n + p.refund, 0);
    const again = h<HTMLButtonElement>('button.btn.primary.go.buy', { disabled: gems() < TEN_COST, onclick: () => void open(10) },
      h('span.buy-l', null, 'Open 10 more'), gemTag(TEN_COST));
    foot.replaceChildren(
      h('p.reveal-sum', null, h('b', null, `${fresh} new`),
        fresh < pulls.length ? ` · ${pulls.length - fresh} owned already ` : '', fresh < pulls.length ? gemTag(`+${back}`) : ''),
      h('button.btn', { onclick: () => { sfx.play('back'); backToShop(); } }, icon('back'), 'Back'),
      again);
  }

  function flip(c: HTMLElement, p: Pull, loud: boolean): void {
    c.classList.remove('tease');
    c.classList.add('flipped');
    const r = p.skin.rarity;
    if (loud) {
      sfx.play(r === 'rare' ? 'flip' : REVEAL[r]);
      const at = fx.pointOf(c);
      fx.pop(at.x, at.y, r, r === 'rare' ? 10 : 30);
      if (r === 'epic') { fx.rayTier = 'epic'; }
    }
  }

  return {
    el,
    dispose: () => {
      dead = true;
      wake?.();
      clearInterval(rattle);
      cancelAnimationFrame(countRaf);
      fx.stop();
      unlisten();
      clearReveal();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    },
  };
}

/**
 * A pulled skin's card. Big: the single reveal (pops in face up). Small: one
 * of ten, dealt face down with its back glowing in its tier's colour.
 */
function card(p: Pull, big: boolean): HTMLElement {
  const s = p.skin;
  const g = gearOf(s.gear);
  const art = iconCanvas(s.gear, big ? 96 : 48, s.id);
  art.className = 'icon';
  const set = s.set ? SKIN_SET_BY_ID.get(s.set)! : null;
  const pieces = set ? setPieces(set.id) : [];
  const setOwned = pieces.filter((x) => owns(x.id)).length;
  const front = h('div.gc-face.gc-front', null,
    h('div.gc-tier', null, h('span', null, TIER_NAME[s.rarity])),
    h('div.gc-art', null, art),
    h('b.gc-name', null, s.name),
    h('small.gc-item', null, big ? `${g.name} · ${SLOT_NAMES[g.slot]}` : g.name),
    big && set ? h('div.gc-set', null, h('span', null, set.name),
      h(`span.sk-pips${setOwned === pieces.length ? '.full' : ''}`, { title: `${setOwned} of ${pieces.length} pieces owned` }, ...pieces.map((x) => h(`i${owns(x.id) ? '.on' : ''}`))),
      h('small', null, setOwned === pieces.length ? 'Set complete!' : `${setOwned}/${pieces.length} owned`)) : null,
    p.fresh ? h('span.gc-new', null, 'New!') : h('span.gc-dupe', null, big ? 'Owned · ' : '', gemTag(`+${p.refund}`)),
  );
  const backFace = h('div.gc-face.gc-back', null, icon('chest'));
  return h(`div.gcard.r-${s.rarity}${big ? '.big' : ''}`, { title: `${s.name} (${s.rarity}) for ${g.name}` },
    h('div.gc-inner', null, backFace, front));
}
