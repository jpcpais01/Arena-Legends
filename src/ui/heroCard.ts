// A shared hero, read-only: the fighter on their backdrop (tap for a move) and
// the gear and skins they have equipped. Friends and the leaderboard show it.
import { SPECIES } from '../character/appearance';
import type { PlayerCharacter } from '../character/profile';
import { skinOn } from '../character/skins';
import { applyBackdrop } from '../render/backdrops';
import { iconCanvas } from '../render/icons';
import { FORMS } from '../sim/forms';
import { GEAR_SLOTS, gearOf, SLOT_NAMES } from '../sim/gear';
import { FIGHT_STYLES } from '../sim/styles';
import { h } from './dom';
import { Preview } from './preview';
import { levelBadge } from './xp';

/** `account`: the player's account name (the hero has its own name). The caller disposes `preview`. */
export function heroCard(c: PlayerCharacter, rec: { w: number; l: number }, account: string): { el: HTMLElement; preview: Preview } {
  const p = new Preview(c, 72, 78, { autoplay: true, ground: 4, pedestal: true });
  const stage = h('div.fr-stage', { title: 'Tap to see a move', onclick: () => p.showcase() }, p.el);
  applyBackdrop(stage, c.look.backdrop);
  p.fitTo(stage);
  const style = c.style ? FIGHT_STYLES[c.style]?.name : '';
  const gear = GEAR_SLOTS.map((slot) => {
    const id = c.gear[slot];
    if (!id) return h('li.fr-gear.empty', null, h('span.sock', null), h('div', null, h('b', null, 'Empty'), h('span.muted', null, SLOT_NAMES[slot])));
    const skin = skinOn(c.skins, id);
    const ic = iconCanvas(id, undefined, skin?.id);
    ic.classList.add('icon');
    return h('li.fr-gear', { title: SLOT_NAMES[slot] }, h('span.sock', null, ic),
      h('div', null, h('b', null, gearOf(id).name), h('span.muted', null, skin ? skin.name : SLOT_NAMES[slot])));
  });
  const el = h('div.fr-hero', null,
    stage,
    h('div.fr-info', null,
      h('div.fr-tag', null, h('span.side-tag', null, account), levelBadge(c.level ?? 1), h('span.rec', null, `${rec.w}W ${rec.l}L`)),
      h('div.fr-name', null, c.name),
      h('div.fr-sub', null, [SPECIES[c.look.species].name, FORMS[c.form].name, style].filter(Boolean).join(' · ')),
      h('ul.fr-gears', null, ...gear)));
  return { el, preview: p };
}
