import { sfx } from '../audio/sfx';
import { forge, FORGE_COST, forgeInto, forgePick, gems, onCollection, spares, type Pull } from '../character/collection';
import type { PlayerCharacter } from '../character/profile';
import { SKIN_BY_ID, SKIN_RARITIES, type SkinDef, type SkinRarity } from '../character/skins';
import { gearOf } from '../sim/gear';
import { withGear } from '../sim/loadout';
import { h } from './dom';
import { ForgeFx } from './forgeFx';
import { fmtInt } from './format';
import { card, REVEAL, shopTabs, skinArt, slamBanner, TIER_NAME } from './gacha';
import { icon } from './icons';
import { Preview } from './preview';

export interface ForgeCallbacks {
  onClose(): void;
  onShop(): void;
  onChests(): void;
  onEquip(skin: SkinDef): void;
  player(): PlayerCharacter | null;
}

const rank = (r: SkinRarity) => SKIN_RARITIES.indexOf(r);

/**
 * The forge: three spare copies of one rarity are melted down and beaten into
 * one skin of the next rarity. The furnace and anvil stand on the left with
 * your spares beside them. Forging plays the whole smithing: the spares drop
 * into the fire, molten metal leaps onto the anvil, three hammer blows shape
 * it, and the quench reveals the new skin. Tap to skip ahead.
 */
export function forgeScreen(cb: ForgeCallbacks): { el: HTMLElement; dispose(): void } {
  const fx = new ForgeFx();
  let dead = false;
  let busy = false;
  let skipping = false;
  let wake: (() => void) | null = null;
  let previews: Preview[] = [];

  const wait = (s: number) => new Promise<void>((res) => {
    if (skipping || dead) { res(); return; }
    const done = () => { clearTimeout(id); if (wake === done) wake = null; res(); };
    const id = setTimeout(done, s * 1000);
    wake = done;
  });
  const skip = () => { if (!busy) return; skipping = true; wake?.(); };

  const gemNum = h('b', null, fmtInt(gems()));
  const gemChip = h('div.gem-chip', { title: 'Gems' }, icon('gem'), gemNum);

  // --- Spares: one row per rarity, three of a kind forge one of the next ----------------------
  const panel = h('section.scr-panel.frame.chest-panel.forge-panel');
  function render(): void {
    const all = spares();
    const rows = SKIN_RARITIES.slice().reverse().map((r) => {
      const mine = all.filter(([s]) => s.rarity === r);
      const n = mine.reduce((k, [, c]) => k + c, 0);
      const into = forgeInto(r);
      const strip = h('div.forge-strip', null, ...(mine.length
        ? mine.map(([s, c]) => h(`span.sock.r-${r}`, { title: `${s.name} (${gearOf(s.gear).name}) x${c}`, 'data-id': s.id }, skinArt(s, 40), c > 1 ? h('i.forge-x', null, `x${c}`) : null))
        : [h('small.forge-none', null, 'No spares')]));
      const pips = into ? h('span.forge-pips', null, ...Array.from({ length: FORGE_COST }, (_, i) => h(`i${i < n ? '.on' : ''}`))) : null;
      const btn = into
        ? h<HTMLButtonElement>(`button.btn.forge-btn${n >= FORGE_COST ? '.primary' : ''}`, {
          disabled: n < FORGE_COST, title: `Forge ${FORGE_COST} ${TIER_NAME[r]} spares into one random ${TIER_NAME[into]} skin`,
          onclick: () => void smith(r),
        }, icon('anvil'), h('span', null, `${FORGE_COST}`), icon('play'), h(`b.r-${into}`, null, TIER_NAME[into]))
        : h('small.forge-top', null, 'Top tier');
      return h(`div.forge-row.${r}`, null,
        h('div.forge-tier', null, h(`b.tier.r-${r}`, null, TIER_NAME[r]), h('small', null, `${n} spare${n === 1 ? '' : 's'}`), pips),
        strip, btn);
    });
    panel.replaceChildren(
      h('div.ribbon', null, h('span', null, 'Forge')),
      h('p.chest-blurb', null, `Duplicates from chests wait here as spares. Forge ${FORGE_COST} of one rarity into a random skin of the next rarity up.`),
      h('div.forge-rows', null, ...rows),
    );
  }

  const spot = h('div.chest-spot.forge-spot', { 'aria-hidden': 'true' });
  const stage = h('section.scr-stage.chest-stage', null, spot);
  const reveal = h('div.gacha-reveal', { onclick: (e: MouseEvent) => { if (!(e.target as Element).closest('button')) skip(); } });
  const banner = h('div.tier-banner', { 'aria-hidden': 'true' });
  const done = h('button.btn.primary.done', { onclick: () => close() }, icon('check'), 'Done');
  const el = h('div.scr.gacha.forge-scr', { role: 'dialog', 'aria-label': 'Forge' },
    fx.canvas,
    h('header.scr-head', null, h('div.scr-title', null, h('h1', null, 'Shop')),
      shopTabs('forge', (t) => { if (busy) return; sfx.play('select'); if (t === 'offers') cb.onShop(); else if (t === 'chests') cb.onChests(); }),
      h('div.grow'), gemChip, done),
    stage, panel, reveal, banner,
  );
  fx.canvas.addEventListener('click', skip);
  fx.onLand = (n) => { if (!dead) sfx.play('clang', 0, n + 1); };

  const unlisten = onCollection(() => { gemNum.textContent = fmtInt(gems()); if (!busy) render(); });
  render();

  const layout = () => { fx.resize(); fx.anchor(spot); };
  window.addEventListener('resize', layout);
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
    fx.setHalo(null);
    for (const p of previews) p.dispose();
    previews = [];
    reveal.replaceChildren();
  }

  function backToForge(): void {
    clearReveal();
    el.classList.remove('opening', 'revealed');
    fx.setCentered(false);
    fx.reset();
    render();
  }

  // --- Smithing ----------------------------------------------------------------------------------
  async function smith(r: SkinRarity): Promise<void> {
    if (busy) return;
    const pick = forgePick(r);
    const into = forgeInto(r);
    if (!pick || !into) return;
    // Where the spares sit, before the list redraws and the panel steps aside.
    const host = el.getBoundingClientRect();
    const socks = [...panel.querySelectorAll<HTMLElement>(`.forge-row.${r} .forge-strip .sock`)];
    const from = pick.map((id, i) => (socks.find((x) => x.dataset.id === id) ?? socks[i] ?? socks[0])?.getBoundingClientRect());
    const pull = forge(pick);
    if (!pull) return;
    busy = true;
    skipping = false;
    clearReveal();
    el.classList.remove('revealed');
    el.classList.add('opening');
    sfx.play('confirm');
    fx.reset();
    fx.setCentered(true);
    const flyers = pick.map((id, i) => {
      const b = from[i] ?? { left: host.width / 2, top: host.height / 2, width: 40, height: 40 };
      // Copies of the same skin fan out a little so all three show.
      const dup = pick.slice(0, i).filter((x) => x === id).length * 8;
      const f = h(`div.forge-fly.sock.r-${r}`, { style: { left: `${b.left - host.left + dup}px`, top: `${b.top - host.top - dup}px`, width: `${b.width}px`, height: `${b.height}px` } },
        skinArt(SKIN_BY_ID.get(id)!, 40));
      el.append(f);
      return f;
    });
    try {
      await wait(0.5);
      // Into the fire, one after another.
      const m = fx.mouthPx, cr = fx.canvas.getBoundingClientRect();
      flyers.forEach((f, i) => {
        const b = f.getBoundingClientRect();
        f.style.transitionDelay = `${i * 120}ms`;
        f.style.transform = `translate(${m.x + cr.left - (b.left + b.width / 2)}px, ${m.y + cr.top - (b.top + b.height / 2)}px) scale(0.3) rotate(${(i - 1) * 120}deg)`;
        f.style.opacity = '0.3';
      });
      sfx.play('meld');
      await wait(0.85);
      for (const f of flyers) f.remove();
      if (dead) return;
      // The fire roars in their colour and melts them down.
      fx.feed(r);
      sfx.play('fire');
      await wait(1);
      if (dead) return;
      // Molten metal onto the anvil.
      fx.pour(into);
      sfx.play('whoosh');
      await wait(0.75);
      if (dead) return;
      // Three blows, each harder.
      for (let i = 0; i < 3 && !dead && !skipping; i++) {
        fx.strike(i);
        await wait(i < 2 ? 0.6 : 0.8);
      }
      if (dead) return;
      // A legendary or epic: darkness, a pillar of light out of the metal, and its name.
      if (rank(into) >= rank('legendary') && !skipping) {
        fx.omen(into);
        sfx.play('omen', 0, into === 'epic' ? 2 : 1);
        await wait(into === 'epic' ? 1.2 : 0.9);
        if (!dead && !skipping) {
          slamBanner(banner, el, into);
          fx.slam(into);
          await wait(into === 'epic' ? 1.5 : 1.1);
        }
      }
      if (dead) return;
      // Quench.
      fx.quench(into);
      sfx.play('steam');
      await wait(0.35);
      banner.classList.remove('on');
      if (dead) return;
      el.classList.add('revealed');
      showResult(pull, r);
    } finally {
      for (const f of flyers) f.remove();
      if (!dead) { busy = false; skipping = false; }
    }
  }

  function showResult(p: Pull, from: SkinRarity): void {
    const s = p.skin;
    sfx.play(REVEAL[s.rarity]);
    const pl = cb.player();
    let stageEl: HTMLElement | null = null;
    if (pl) {
      const g = gearOf(s.gear);
      const tryOn = { ...pl, ...withGear(pl, g.slot, s.gear), skins: { ...pl.skins, [s.gear]: s.id } } as PlayerCharacter;
      const box = h('div.reveal-fighter');
      const pv = new Preview(tryOn, 72, 78, { pedestal: true, fit: box });
      previews.push(pv);
      box.append(pv.el);
      const use = g.slot === 'usable' ? g.abilities?.[0]?.anim : undefined;
      setTimeout(() => { if (!dead) pv.showcase(use ? `use.${use}` : undefined); }, 500);
      stageEl = box;
    }
    const equip = h<HTMLButtonElement>('button.btn', {
      onclick: () => { cb.onEquip(s); sfx.play('equip'); equip.disabled = true; equip.replaceChildren(icon('check'), 'Equipped'); },
    }, icon('bag'), 'Equip');
    const again = forgePick(from)
      ? h<HTMLButtonElement>('button.btn.primary.go.buy', { onclick: () => { backToForge(); void smith(from); } }, h('span.buy-l', null, icon('anvil'), 'Forge again'))
      : null;
    const big = card(p, true);
    setTimeout(() => {
      if (dead) return;
      big.classList.add('flipped');
      const at = fx.pointOf(big);
      fx.pop(at.x, at.y, s.rarity, 40);
      if (rank(s.rarity) >= rank('legendary')) setTimeout(() => { if (!dead && big.isConnected) fx.setHalo(big, s.rarity); }, 520);
    }, 60);
    reveal.replaceChildren(
      h('div.reveal-one', null, stageEl, big),
      h('div.reveal-foot', null, h('button.btn', { onclick: () => { sfx.play('back'); backToForge(); } }, icon('back'), 'Back'), pl ? equip : null, again));
  }

  return {
    el,
    dispose: () => {
      dead = true;
      wake?.();
      fx.stop();
      unlisten();
      clearReveal();
      window.removeEventListener('resize', layout);
      window.removeEventListener('keydown', onKey);
    },
  };
}
