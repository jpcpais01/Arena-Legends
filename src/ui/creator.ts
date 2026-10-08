import { sfx } from '../audio/sfx';
import {
  ACCENT_COLORS, EYE_COLORS, HAIR_COLORS, HAIR_STYLES, OUTFIT_COLORS, randomAppearance, SPECIES, SPECIES_IDS, type Appearance,
} from '../character/appearance';
import { cleanName, NAME_MAX, randomName, type PlayerCharacter } from '../character/profile';
import { FORMS, FORM_IDS } from '../sim/forms';
import { h, hex } from './dom';
import { icon } from './icons';
import { Preview } from './preview';
import { statLines } from './stats';

export interface CreatorCallbacks {
  onDone(c: PlayerCharacter): void;
  /** Absent on first launch (there is nothing to go back to). */
  onCancel?(): void;
}

type Tab = 'body' | 'colors';

/**
 * Character creator: name, species, body form and colours, with the fighter
 * standing on a little stage that updates live (tap it to see a move).
 */
export function creatorSheet(start: PlayerCharacter, cb: CreatorCallbacks): { el: HTMLElement; dispose(): void } {
  let c: PlayerCharacter = { ...start, look: { ...start.look } };
  let tab: Tab = 'body';
  const preview = new Preview(c, 100, 90, { autoplay: true });
  const stats = h('div.statline');
  const name = h<HTMLInputElement>('input.name', {
    value: c.name, maxlength: String(NAME_MAX), placeholder: 'Name your fighter', autocomplete: 'off', spellcheck: 'false',
    oninput: () => { c.name = name.value; done.disabled = !cleanName(name.value); },
  });
  const body = h('div.panel-scroll');
  const tabs = h('div.tabs');
  const done = h<HTMLButtonElement>('button.btn.primary', { onclick: finish }, icon('check'), 'Done');

  function finish(): void {
    const n = cleanName(name.value);
    if (!n) { name.focus(); return; }
    sfx.play('ui');
    cb.onDone({ ...c, name: n });
  }

  const refresh = (showcase = false) => {
    preview.set(c);
    if (showcase) preview.showcase();
    stats.replaceChildren(...statLines(c.form, c.gear));
  };

  const setLook = (patch: Partial<Appearance>) => {
    c = { ...c, look: { ...c.look, ...patch } };
    sfx.play('ui');
    refresh();
    render();
  };

  const opts = <T>(label: string, items: T[], on: (v: T) => boolean, text: (v: T) => string, pick: (v: T) => void) =>
    h('div.field', null, h('div.label', null, label),
      h('div.opts', null, ...items.map((v) => h(`button.opt${on(v) ? '.on' : ''}`, { onclick: () => pick(v) }, text(v)))));

  const swatches = (label: string, colors: number[], cur: number, pick: (i: number) => void) =>
    h('div.field', null, h('div.label', null, label),
      h('div.opts', null, ...colors.map((col, i) => h(`button.swatch${i === cur ? '.on' : ''}`, {
        style: { background: hex(col) }, 'aria-label': `${label} ${i + 1}`, onclick: () => pick(i),
      }))));

  function render(): void {
    tabs.replaceChildren(...(['body', 'colors'] as Tab[]).map((t) =>
      h(`button.btn${t === tab ? '.on' : ''}`, { onclick: () => { tab = t; sfx.play('ui'); render(); } }, t === 'body' ? 'Body' : 'Colours')));
    const L = c.look;
    const sp = SPECIES[L.species];
    if (tab === 'body') {
      body.replaceChildren(tabs,
        h('div.field', null, h('label', null, 'Name'),
          h('div.opts', null, name, h('button.btn.icon', { title: 'Random name', 'aria-label': 'Random name', onclick: () => {
            name.value = randomName(); c.name = name.value; done.disabled = false; sfx.play('ui');
          } }, icon('dice')))),
        h('div.field', null, h('div.label', null, 'Species'),
          h('div.opts', null, ...SPECIES_IDS.map((id) => h(`button.opt.opt-card${id === L.species ? '.on' : ''}`, {
            onclick: () => setLook({ species: id, skin: Math.min(L.skin, SPECIES[id].skins.length - 1) }),
          }, h('b', null, SPECIES[id].name), h('span', null, SPECIES[id].blurb))))),
        h('div.field', null, h('div.label', null, 'Body form (sets your stats)'),
          h('div.opts', null, ...FORM_IDS.map((id) => h(`button.opt.opt-card${id === c.form ? '.on' : ''}`, {
            onclick: () => { c = { ...c, form: id }; sfx.play('ui'); refresh(true); render(); },
          }, h('b', null, FORMS[id].name), h('span', null, FORMS[id].blurb))))),
      );
    } else {
      body.replaceChildren(tabs,
        swatches(L.species === 'golem' ? 'Stone' : L.species === 'wisp' ? 'Spirit' : 'Skin', sp.skins, L.skin, (i) => setLook({ skin: i })),
        ...(sp.hair ? [opts('Hair', [...HAIR_STYLES.keys()], (i) => i === L.hair, (i) => HAIR_STYLES[i], (i) => setLook({ hair: i }))] : []),
        swatches(sp.hair ? 'Hair colour' : 'Crystals', HAIR_COLORS, L.hairColor, (i) => setLook({ hairColor: i })),
        swatches('Eyes', EYE_COLORS, L.eyes, (i) => setLook({ eyes: i })),
        swatches('Outfit', OUTFIT_COLORS, L.outfit, (i) => setLook({ outfit: i })),
        swatches('Accent', ACCENT_COLORS, L.accent, (i) => setLook({ accent: i })),
        h('button.btn', { onclick: () => setLook(randomAppearance()) }, icon('dice'), 'Random look'),
      );
    }
  }

  refresh();
  render();
  done.disabled = !cleanName(c.name);
  const el = h('div.sheet-wrap', null,
    h('div.sheet.plate', { role: 'dialog', 'aria-label': 'Your fighter' },
      h('div.sheet-head', null, h('h2', null, 'Your fighter'),
        cb.onCancel ? h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: () => { sfx.play('ui'); cb.onCancel!(); } }, icon('close')) : null),
      h('div.sheet-body.split', null,
        h('div.stage', null, preview.el, h('div.hint', null, 'Tap to see a move'), stats),
        body),
      h('div.sheet-foot', null, done),
    ),
  );
  return { el, dispose: () => preview.dispose() };
}
