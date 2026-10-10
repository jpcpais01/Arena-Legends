import { sfx } from '../audio/sfx';
import { buySkins, gems, onCollection, owns } from '../character/collection';
import type { PlayerCharacter } from '../character/profile';
import { dailyPicks, featuredSet, msToRotation, setOffer, shopDay, SKIN_PRICE, type SetOffer } from '../character/shop';
import { SKIN_SETS, type SkinDef, type SkinSetId } from '../character/skins';
import { iconCanvas } from '../render/icons';
import { gearOf, SLOT_NAMES } from '../sim/gear';
import { DEFAULT_BUILDS, withGear } from '../sim/loadout';
import { confirmBox } from './confirm';
import { h } from './dom';
import { fmtInt } from './format';
import { gemTag, shopTabs } from './gacha';
import { icon } from './icons';
import { Preview } from './preview';
import { buyEntrance, entranceOf, ENTRANCE_IDS, ENTRANCES, ownsEntrance, type EntranceDef, type EntranceId } from '../character/entrances';
import { css } from '../render/pixel/color';
import { ENTRANCE_ICON, ENTRANCE_TIER } from './entranceUi';

export interface ShopCallbacks {
  onClose(): void;
  onChests(tab: 'chests' | 'forge'): void;
  /** Wears a bought skin (equipping its item). */
  onEquip(skin: SkinDef): void;
  /** Wears a whole bought set. */
  onEquipSet(set: SkinSetId): void;
  /** Makes an owned entrance the hero's. */
  onEntrance(id: EntranceId): void;
  player(): PlayerCharacter | null;
}

const TIER: Record<SkinDef['rarity'], string> = { rare: 'Rare', mythic: 'Mythic', legendary: 'Legendary', epic: 'Epic' };

function skinIcon(s: SkinDef, px = 48): HTMLCanvasElement {
  const c = iconCanvas(s.gear, px, s.id);
  c.className = 'icon';
  return c;
}

/** "5h 12m" until the shop turns over. */
function countdown(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/**
 * The shop: today's featured epic set (worn by your fighter, at a deep
 * discount), a row of single skins that changes every day, and every epic set
 * as a bundle priced by the pieces you still miss. The Chests tab opens the
 * gacha. Everything costs gems. A buy button asks once more before paying.
 */
export function shopScreen(cb: ShopCallbacks): { el: HTMLElement; dispose(): void } {
  let day = shopDay();
  let previews: Preview[] = [];
  let armed: HTMLElement | null = null;
  let armT = 0;
  /** The entrance last tapped (it plays on the featured stage). */
  let peek: EntranceId | null = null;

  // Gem counter.
  const gemNum = h('b', null, fmtInt(gems()));
  const gemChip = h('div.gem-chip', { title: 'Gems' }, icon('gem'), gemNum);

  const feat = h('section.shop-feat.frame');
  const shelves = h('section.shop-shelves.scr-panel.frame');
  const got = h('div.shop-got-wrap');
  const timer = h('span.shop-timer');

  const close = () => { sfx.play('back'); cb.onClose(); };
  const el = h('div.scr.shop', { role: 'dialog', 'aria-label': 'Shop' },
    h('header.scr-head', null,
      h('div.scr-title', null, h('h1', null, 'Shop')),
      shopTabs('offers', (t) => { sfx.play('select'); cb.onChests(t === 'forge' ? 'forge' : 'chests'); }),
      h('div.grow'), gemChip,
      h('button.btn.primary.done', { onclick: close }, icon('check'), 'Done')),
    feat, shelves, got);

  /** The build a set is shown on: your fighter (or a default one) wearing every piece. */
  function wearing(o: SetOffer): PlayerCharacter {
    const base = (cb.player() ?? { ...DEFAULT_BUILDS[0], look: DEFAULT_BUILDS[0].look }) as PlayerCharacter;
    let b = { ...base, skins: { ...base.skins } } as PlayerCharacter;
    for (const p of o.pieces) {
      b = { ...b, ...withGear(b, gearOf(p.gear).slot, p.gear) } as PlayerCharacter;
      b.skins![p.gear] = p.id;
    }
    return b;
  }

  /** A price button: first tap arms it ("Buy?"), the second pays. */
  function buyBtn(price: number, label: string, onBuy: () => void, big = false): HTMLElement {
    const can = gems() >= price;
    const b = h<HTMLButtonElement>(`button.btn.buy-btn${big ? '.go.primary' : ''}${can ? '' : '.short'}`, {
      title: can ? `${label} for ${price} gems` : 'Not enough gems yet: win fights to earn more',
      onclick: (e: MouseEvent) => {
        e.stopPropagation();
        if (!can) { sfx.play('back'); b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); return; }
        if (armed !== b) {
          disarm();
          armed = b;
          b.classList.add('armed');
          b.replaceChildren(h('span', null, 'Buy?'), ...(label ? [gemTag(price)] : []));
          sfx.play('select');
          armT = window.setTimeout(disarm, 2600);
          return;
        }
        disarm();
        onBuy();
      },
    }, label ? h('span', null, label) : null, gemTag(price));
    return b;
  }

  function disarm(): void {
    clearTimeout(armT);
    if (armed) { armed.classList.remove('armed'); armed = null; render(); }
  }

  function buySet(o: SetOffer): void {
    if (!buySkins(o.missing.map((p) => p.id), o.price)) return;
    celebrate(o.pieces, o.set.name, (done) => askEquip(o, done), 'Equip set');
  }

  function buyOne(s: SkinDef): void {
    if (!buySkins([s.id], SKIN_PRICE[s.rarity])) return;
    celebrate([s], s.name, (done) => { cb.onEquip(s); done(); }, 'Equip');
  }

  /** The "unlocked" pop-up: the new skins pop in with sparkles. */
  /** Equipping a set swaps every piece of the build, so it asks first. `done` runs once it is worn. */
  function askEquip(o: SetOffer, done?: () => void): void {
    confirmBox(el, 'Equip set?', `Swap your items for the ${o.set.name} pieces and wear their set skins? It replaces the gear you have on now.`, 'Equip set', () => {
      cb.onEquipSet(o.set.id); if (done) done(); else sfx.play('equip');
    }, 'bag');
  }

  /** `equip` calls its `done` once the item is really worn (a set asks first). */
  function celebrate(skins: SkinDef[], title: string, equip: (done: () => void) => void, equipLabel: string): void {
    const top = skins.some((s) => s.rarity === 'epic') ? 'epic' : skins.some((s) => s.rarity === 'legendary') ? 'legendary' : skins.some((s) => s.rarity === 'mythic') ? 'mythic' : 'rare';
    sfx.play(top === 'epic' ? 'revealEpic' : top === 'legendary' ? 'revealLegendary' : top === 'mythic' ? 'revealMythic' : 'revealRare');
    const eq = h<HTMLButtonElement>('button.btn.primary', {
      onclick: () => equip(() => { sfx.play('equip'); eq.disabled = true; eq.replaceChildren(icon('check'), 'Equipped'); }),
    }, icon('bag'), equipLabel);
    got.replaceChildren(h('div.shop-got', { onclick: (e: MouseEvent) => { if (e.target === e.currentTarget) dismiss(); } },
      h(`div.shop-got-card.frame.r-${top}`, null,
        h('div.shop-got-rays'),
        h('div.ribbon', null, h('span', null, 'Unlocked!')),
        h('b.shop-got-name', null, title),
        h('div.shop-got-icons', null, ...skins.map((s, i) => h(`span.sock.r-${s.rarity}`, { style: { '--d': `${120 + i * 70}ms` } }, skinIcon(s, 48)))),
        h('div.shop-got-foot', null, h('button.btn', { onclick: () => dismiss() }, 'Nice'), eq))));
    got.classList.add('on');
  }

  function dismiss(): void {
    sfx.play('back');
    got.classList.remove('on');
    got.replaceChildren();
  }

  function buyEnt(e: EntranceDef): void {
    if (!buyEntrance(e.id)) return;
    sfx.play(e.tier === 'legendary' ? 'revealLegendary' : e.tier === 'mythic' ? 'revealMythic' : 'revealRare');
    const eq = h<HTMLButtonElement>('button.btn.primary', {
      onclick: () => { cb.onEntrance(e.id); sfx.play('equip'); eq.disabled = true; eq.replaceChildren(icon('check'), 'In use'); render(); },
    }, icon('boot'), 'Use it');
    got.replaceChildren(h('div.shop-got', { onclick: (ev: MouseEvent) => { if (ev.target === ev.currentTarget) dismiss(); } },
      h(`div.shop-got-card.frame.r-${e.tier}`, null,
        h('div.shop-got-rays'),
        h('div.ribbon', null, h('span', null, 'Unlocked!')),
        h('b.shop-got-name', null, e.name),
        h('div.shop-got-icons', null, h(`span.sock.r-${e.tier}`, { style: { '--d': '120ms', color: css(e.color) } }, icon(ENTRANCE_ICON[e.id]))),
        h('div.shop-got-foot', null, h('button.btn', { onclick: () => dismiss() }, 'Nice'), eq))));
    got.classList.add('on');
  }

  /** Plays an entrance on the featured stage. */
  function watch(id: EntranceId): void {
    peek = id;
    previews[0]?.playEntrance(id);
    for (const t of shelves.querySelectorAll<HTMLElement>('.offer.ent')) t.classList.toggle('peek', t.dataset.ent === id);
  }

  function featured(): void {
    for (const p of previews) p.dispose();
    previews = [];
    const o = setOffer(featuredSet(day), true);
    const stage = h('div.feat-stage');
    const pv = new Preview(wearing(o), 72, 78, { pedestal: true, autoplay: true, fit: stage });
    previews.push(pv);
    stage.append(pv.el);
    const have = o.pieces.length - o.missing.length;
    const off = o.full ? Math.round((1 - o.price / o.full) * 100) : 0;
    feat.replaceChildren(
      h('div.feat-top', null, h('div.ribbon', null, h('span', null, 'Featured set')), timer),
      stage,
      h('div.feat-info', null,
        h('b.feat-name', null, o.set.name),
        h('p.feat-blurb', null, o.set.blurb),
        h('div.feat-pieces', null, ...o.pieces.map((p) => h(`span.sock${owns(p.id) ? '.have' : ''}`, { title: `${p.name} (${SLOT_NAMES[gearOf(p.gear).slot]})${owns(p.id) ? ', owned' : ''}` }, skinIcon(p, 40)))),
        o.missing.length
          ? h('div.feat-buy', null,
            off > 0 ? h('span.feat-off', null, `-${off}%`) : null,
            h('s.feat-was', null, gemTag(o.full)),
            buyBtn(o.price, have ? `Last ${o.missing.length}` : 'Buy set', () => buySet(o), true))
          : h('div.feat-buy', null, h('span.owned-tag', null, icon('check'), 'Set owned'),
            h('button.btn.primary', { onclick: () => askEquip(o) }, icon('bag'), 'Equip set'))));
    tick();
  }

  function render(): void {
    const picks = dailyPicks(day);
    const featId = featuredSet(day).id;
    const sets = SKIN_SETS.filter((s) => s.id !== featId).map((s) => setOffer(s));
    // Sets you can still complete first, owned ones last.
    sets.sort((a, b) => (a.missing.length ? 0 : 1) - (b.missing.length ? 0 : 1));
    const scroll = shelves.scrollTop;
    shelves.replaceChildren(
      h('div.shelf-head', null, h('div.ribbon', null, h('span', null, 'Daily skins')), h('small', null, 'New ones every day')),
      h('div.shelf-picks', null, ...picks.map((s) => {
        const mine = owns(s.id);
        return h(`div.offer.r-${s.rarity}${mine ? '.mine' : ''}`, null,
          h('span.offer-tier', null, TIER[s.rarity]),
          h('span.sock', null, skinIcon(s, 48)),
          h('b.offer-name', null, s.name),
          h('small.offer-item', null, gearOf(s.gear).name),
          mine ? h('span.owned-tag', null, icon('check'), 'Owned') : buyBtn(SKIN_PRICE[s.rarity], '', () => buyOne(s)));
      })),
      h('div.shelf-head', null, h('div.ribbon', null, h('span', null, 'Entrances')), h('small', null, 'Tap one to watch it')),
      h('div.shelf-picks', null, ...ENTRANCE_IDS.filter((id) => ENTRANCES[id].price > 0).map((id) => {
        const e = ENTRANCES[id];
        const mine = ownsEntrance(id);
        const using = mine && entranceOf(cb.player()?.look, true) === id;
        return h(`div.offer.ent.r-${e.tier}${mine ? '.mine' : ''}${peek === id ? '.peek' : ''}`, {
          'data-ent': id, title: e.blurb, style: { '--ent': css(e.color) },
          onclick: () => { sfx.play('select'); watch(id); },
        },
          h('span.offer-tier', null, ENTRANCE_TIER[e.tier]),
          h('span.sock', null, icon(ENTRANCE_ICON[id])),
          h('b.offer-name', null, e.name),
          h('small.offer-item', null, 'Entrance'),
          !mine ? buyBtn(e.price, '', () => buyEnt(e))
            : using ? h('span.owned-tag', null, icon('check'), 'In use')
              : h('button.btn.sm', { onclick: (ev: MouseEvent) => { ev.stopPropagation(); cb.onEntrance(id); sfx.play('equip'); render(); } }, icon('boot'), 'Use'));
      })),
      h('div.shelf-head', null, h('div.ribbon', null, h('span', null, 'Epic sets')), h('small', null, 'Pay only for the pieces you miss')),
      h('div.shelf-sets', null, ...sets.map((o) => {
        const have = o.pieces.length - o.missing.length;
        return h(`div.offer-set${o.missing.length ? '' : '.mine'}`, null,
          h('b.set-name', null, o.set.name),
          h('div.set-icons', null, ...o.pieces.map((p) => h(`span.sock${owns(p.id) ? '.have' : ''}`, null, skinIcon(p, 40)))),
          h('div.set-foot', null,
            h('small', null, `${have}/${o.pieces.length} owned`),
            o.missing.length
              ? buyBtn(o.price, have ? `Last ${o.missing.length}` : 'Set', () => buySet(o))
              : h('button.btn.sm', { onclick: () => askEquip(o) }, icon('bag'), 'Equip')));
      })),
    );
    shelves.scrollTop = scroll;
  }

  function tick(): void {
    if (shopDay() !== day) { day = shopDay(); featured(); render(); return; }
    timer.title = 'New offers in';
    timer.replaceChildren(icon('replay'), ` ${countdown(msToRotation())}`);
  }

  featured();
  render();
  const clock = window.setInterval(tick, 30000);
  const unlisten = onCollection(() => { gemNum.textContent = fmtInt(gems()); gemChip.classList.remove('bump'); void gemChip.offsetWidth; gemChip.classList.add('bump'); featured(); render(); });
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (got.classList.contains('on')) dismiss(); else close(); } };
  window.addEventListener('keydown', onKey);
  return {
    el,
    dispose: () => {
      for (const p of previews) p.dispose();
      clearInterval(clock);
      clearTimeout(armT);
      unlisten();
      window.removeEventListener('keydown', onKey);
    },
  };
}
