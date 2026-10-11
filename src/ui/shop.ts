import { sfx } from '../audio/sfx';
import { buySkins, gems, onCollection, owns } from '../character/collection';
import type { PlayerCharacter } from '../character/profile';
import { dailyPicks, featuredSet, msToRotation, setOffer, shopDay, SKIN_PRICE, type SetOffer } from '../character/shop';
import { RARITY_NAME, SKIN_SETS, type SkinDef, type SkinSetId } from '../character/skins';
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
import {
  buyFinisher, buyPose, FINISHER_IDS, finisherOf, FINISHERS, ownsFinisher, ownsPose, POSE_IDS, poseOf, POSES, type FinaleDef, type FinisherId, type PoseId,
} from '../character/finales';
import { FINISHER_ICON, POSE_ICON } from './finaleUi';
import type { IconName } from './icons';

export interface ShopCallbacks {
  onClose(): void;
  onChests(tab: 'chests' | 'forge'): void;
  /** Wears a bought skin (equipping its item). */
  onEquip(skin: SkinDef): void;
  /** Wears a whole bought set. */
  onEquipSet(set: SkinSetId): void;
  /** Makes an owned entrance the hero's. */
  onEntrance(id: EntranceId): void;
  /** Makes an owned finisher or victory pose the hero's. */
  onFinisher(id: FinisherId): void;
  onPose(id: PoseId): void;
  player(): PlayerCharacter | null;
}

const TIER = RARITY_NAME;

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
type Shelf = 'daily' | 'ent' | 'fin' | 'pose' | 'sets';
const SHELVES: [Shelf, string, string][] = [
  ['daily', 'Daily skins', 'New ones every day.'],
  ['ent', 'Entrances', 'Tap one to watch it on the stage.'],
  ['fin', 'Finishers', 'Tap one to watch it on the stage.'],
  ['pose', 'Poses', 'Victory poses: tap one to watch it on the stage.'],
  ['sets', 'Mythic sets', 'Pay only for the pieces you miss.'],
];
/** The shelf the shop opens on: the one the player last looked at (this session). */
let lastShelf: Shelf = 'daily';

export function shopScreen(cb: ShopCallbacks): { el: HTMLElement; dispose(): void } {
  let day = shopDay();
  let previews: Preview[] = [];
  let armed: HTMLElement | null = null;
  let armT = 0;
  /** The entrance last tapped (it plays on the featured stage). */
  let peek: EntranceId | null = null;
  /** The finisher or pose last tapped ("fin:frost", "pose:flex"). */
  let peekFin: string | null = null;

  // Gem counter.
  const gemNum = h('b', null, fmtInt(gems()));
  const gemChip = h('div.gem-chip', { title: 'Gems' }, icon('gem'), gemNum);

  const feat = h('section.shop-feat.frame');
  let shelf: Shelf = lastShelf;
  /** The shelf on screen at the last render (its scroll is kept across re-renders). */
  let shownShelf = '';
  const shelfTabs = h('nav.shelf-tabs', { role: 'tablist', 'aria-label': 'Offers' });
  const shelfBody = h('div.shelf-body');
  const shelves = h('section.shop-shelves.frame', null, shelfTabs, shelfBody);
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
    unlocked(e, ENTRANCE_ICON[e.id], 'boot', () => cb.onEntrance(e.id));
  }

  /** The "unlocked" pop-up for an entrance, finisher or pose, with a button to use it. */
  function unlocked(e: { name: string; tier: EntranceDef['tier']; color: number }, glyph: IconName, useGlyph: IconName, use: () => void): void {
    sfx.play(e.tier === 'legendary' ? 'revealLegendary' : e.tier === 'mythic' ? 'revealMythic' : 'revealRare');
    const eq = h<HTMLButtonElement>('button.btn.primary', {
      onclick: () => { use(); sfx.play('equip'); eq.disabled = true; eq.replaceChildren(icon('check'), 'In use'); render(); },
    }, icon(useGlyph), 'Use it');
    got.replaceChildren(h('div.shop-got', { onclick: (ev: MouseEvent) => { if (ev.target === ev.currentTarget) dismiss(); } },
      h(`div.shop-got-card.frame.r-${e.tier}`, null,
        h('div.shop-got-rays'),
        h('div.ribbon', null, h('span', null, 'Unlocked!')),
        h('b.shop-got-name', null, e.name),
        h('div.shop-got-icons', null, h(`span.sock.r-${e.tier}`, { style: { '--d': '120ms', color: css(e.color) } }, icon(glyph))),
        h('div.shop-got-foot', null, h('button.btn', { onclick: () => dismiss() }, 'Nice'), eq))));
    got.classList.add('on');
  }

  /** Plays an entrance on the featured stage. */
  function watch(id: EntranceId): void {
    peek = id;
    peekFin = null;
    previews[0]?.playEntrance(id);
    for (const t of shelves.querySelectorAll<HTMLElement>('.offer.ent')) t.classList.toggle('peek', t.dataset.ent === id);
  }

  /** The finisher and pose shelves: like the entrances, tap to watch on the featured stage. */
  interface FinaleShelf { key: string; title: string; item: string; ids: readonly string[]; def(id: string): FinaleDef; owns(id: string): boolean; buy(id: string): boolean; glyph(id: string): IconName; using(id: string): boolean; use(id: string): void; play(id: string): void }
  const finales: FinaleShelf[] = [
    {
      key: 'fin', title: 'Finishers', item: 'Finisher', ids: FINISHER_IDS, def: (id) => FINISHERS[id as FinisherId], owns: (id) => ownsFinisher(id as FinisherId),
      buy: (id) => buyFinisher(id as FinisherId), glyph: (id) => FINISHER_ICON[id as FinisherId], using: (id) => finisherOf(cb.player()?.look, true) === id,
      use: (id) => cb.onFinisher(id as FinisherId), play: (id) => previews[0]?.playFinisher(id as FinisherId, poseOf(cb.player()?.look, true)),
    },
    {
      key: 'pose', title: 'Victory poses', item: 'Pose', ids: POSE_IDS, def: (id) => POSES[id as PoseId], owns: (id) => ownsPose(id as PoseId),
      buy: (id) => buyPose(id as PoseId), glyph: (id) => POSE_ICON[id as PoseId], using: (id) => poseOf(cb.player()?.look, true) === id,
      use: (id) => cb.onPose(id as PoseId), play: (id) => previews[0]?.playPose(id as PoseId),
    },
  ];

  function watchFinale(s: FinaleShelf, id: string): void {
    peek = null;
    peekFin = `${s.key}:${id}`;
    s.play(id);
    for (const t of shelves.querySelectorAll<HTMLElement>('.offer.ent')) t.classList.toggle('peek', t.dataset.ent === peekFin);
  }

  function finaleShelf(s: FinaleShelf): HTMLElement {
    return h('div.shelf-picks', null, ...s.ids.filter((id) => s.def(id).price > 0).map((id) => {
        const e = s.def(id), key = `${s.key}:${id}`;
        const mine = s.owns(id);
        const using = mine && s.using(id);
        return h(`div.offer.ent.r-${e.tier}${mine ? '.mine' : ''}${peekFin === key ? '.peek' : ''}`, {
          'data-ent': key, title: e.blurb, style: { '--ent': css(e.color) },
          onclick: () => { sfx.play('select'); watchFinale(s, id); },
        },
          h('span.offer-tier', null, ENTRANCE_TIER[e.tier]),
          h('span.sock', null, icon(s.glyph(id))),
          h('b.offer-name', null, e.name),
          h('small.offer-item', null, s.item),
          !mine ? buyBtn(e.price, '', () => { if (s.buy(id)) unlocked(e, s.glyph(id), 'trophy', () => s.use(id)); })
            : using ? h('span.owned-tag', null, icon('check'), 'In use')
              : h('button.btn.sm', { onclick: (ev: MouseEvent) => { ev.stopPropagation(); s.use(id); sfx.play('equip'); render(); } }, icon('trophy'), 'Use'));
      }));
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
    const ents = ENTRANCE_IDS.filter((id) => ENTRANCES[id].price > 0);
    const priced = (f: FinaleShelf) => f.ids.filter((id) => f.def(id).price > 0).length;
    const counts: Record<Shelf, number> = { daily: picks.length, ent: ents.length, fin: priced(finales[0]), pose: priced(finales[1]), sets: sets.length };
    const scroll = shelfBody.scrollTop;
    // One shelf at a time, picked on the tabs: less to take in, and every card gets room for its full name.
    shelfTabs.replaceChildren(...SHELVES.map(([id, label]) => h(`button.shelf-tab${shelf === id ? '.on' : ''}`, {
      role: 'tab', 'aria-selected': String(shelf === id),
      onclick: () => { if (shelf === id) return; shelf = lastShelf = id; sfx.play('select'); shownShelf = ''; render(); },
    }, h('span', null, label), h('small', null, String(counts[id])))));
    const hint = SHELVES.find(([id]) => id === shelf)![2];
    const daily = () => h('div.shelf-picks.daily', null, ...picks.map((s) => {
        const mine = owns(s.id);
        return h(`div.offer.r-${s.rarity}${mine ? '.mine' : ''}`, null,
          h('span.offer-tier', null, TIER[s.rarity]),
          h('span.sock', null, skinIcon(s, 48)),
          h('b.offer-name', null, s.name),
          h('small.offer-item', null, gearOf(s.gear).name),
          mine ? h('span.owned-tag', null, icon('check'), 'Owned') : buyBtn(SKIN_PRICE[s.rarity], '', () => buyOne(s)));
      }));
    const entrances = () => h('div.shelf-picks', null, ...ents.map((id) => {
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
      }));
    const setList = () => h('div.shelf-sets', null, ...sets.map((o) => {
        const have = o.pieces.length - o.missing.length;
        return h(`div.offer-set${o.missing.length ? '' : '.mine'}`, null,
          h('b.set-name', null, o.set.name),
          h('div.set-icons', null, ...o.pieces.map((p) => h(`span.sock${owns(p.id) ? '.have' : ''}`, null, skinIcon(p, 40)))),
          h('div.set-foot', null,
            h('small', null, `${have}/${o.pieces.length} owned`),
            o.missing.length
              ? buyBtn(o.price, have ? `Last ${o.missing.length}` : 'Set', () => buySet(o))
              : h('button.btn.sm', { onclick: () => askEquip(o) }, icon('bag'), 'Equip')));
      }));
    shelfBody.replaceChildren(h('p.shelf-hint', null, hint), shelf === 'daily' ? daily() : shelf === 'ent' ? entrances()
      : shelf === 'fin' ? finaleShelf(finales[0]) : shelf === 'pose' ? finaleShelf(finales[1]) : setList());
    shelfBody.scrollTop = shownShelf === shelf ? scroll : 0;
    shownShelf = shelf;
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
