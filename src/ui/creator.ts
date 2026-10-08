import { sfx } from '../audio/sfx';
import {
  ACCENT_COLORS, EYE_COLORS, HAIR_COLORS, HAIR_STYLES, OUTFIT_COLORS, randomAppearance, SPECIES, SPECIES_IDS, type Appearance, type SpeciesId,
} from '../character/appearance';
import { cleanName, NAME_MAX, randomName, type PlayerCharacter } from '../character/profile';
import { css } from '../render/pixel/color';
import { FORMS, FORM_IDS } from '../sim/forms';
import type { CharacterBuild } from '../sim/loadout';
import type { FormId, Stats } from '../sim/types';
import { h, hex } from './dom';
import { icon, type IconName } from './icons';
import { Preview } from './preview';

export interface CreatorCallbacks {
  onDone(c: PlayerCharacter): void;
  /** Absent on first launch (there is nothing to go back to). */
  onCancel?(): void;
}

const STEPS: { label: string; icon: IconName; title: string; sub: string }[] = [
  { label: 'Species', icon: 'paw', title: 'Choose your species', sub: 'Looks only: every species fights the same. Pick the one you like.' },
  { label: 'Body', icon: 'body', title: 'Pick a body form', sub: 'Your body sets your base stats and how your fighter moves.' },
  { label: 'Style', icon: 'palette', title: 'Make it yours', sub: 'A name, colours and hair. You can change all of this later.' },
];

/** Form stats shown as bars, scaled between the lowest and highest form. */
const FORM_STATS: [keyof Stats, string, (v: number) => string][] = [
  ['maxHp', 'Health', (v) => String(Math.round(v))],
  ['power', 'Power', (v) => String(Math.round(v))],
  ['armor', 'Armor', (v) => String(Math.round(v))],
  ['resist', 'Magic resist', (v) => String(Math.round(v))],
  ['moveSpeed', 'Speed', (v) => v.toFixed(1)],
  ['attackSpeed', 'Attack speed', (v) => `${Math.round(v * 100)}%`],
  ['critChance', 'Crit', (v) => `${Math.round(v * 100)}%`],
];
const RANGE = new Map(FORM_STATS.map(([k]) => {
  const vs = FORM_IDS.map((id) => FORMS[id].base[k] as number);
  return [k, [Math.min(...vs), Math.max(...vs)]] as const;
}));

/** The character in plain clothes with just their weapon, so species and colours read clearly. */
const bare = (c: CharacterBuild): CharacterBuild => ({ ...c, gear: { main: c.gear.main }, skins: {} });

/**
 * Character creator, a full screen in three steps: species, then body form,
 * then name, colours and hair together. The fighter stands on a dais on the
 * left and updates live; picks play a move. Editing an existing fighter
 * unlocks every step and can save from any of them.
 */
export function creatorSheet(start: PlayerCharacter, cb: CreatorCallbacks): { el: HTMLElement; dispose(): void } {
  const editing = !!cb.onCancel;
  let c: PlayerCharacter = { ...start, look: { ...start.look } };
  let step = 0;
  let reached = editing ? 2 : 0;
  let showGear = false;
  let cards: Preview[] = [];

  const stageBox = h('div.stage-box');
  const preview = new Preview(bare(c), 100, 90, { autoplay: true, pedestal: true, fit: stageBox });
  const gearBtn = h<HTMLButtonElement>('button.btn.sm', {
    title: 'Show gear', 'aria-label': 'Show gear', 'aria-pressed': 'false',
    onclick: () => { showGear = !showGear; sfx.play('ui'); syncStage(); preview.showcase(); },
  }, icon('bag'), 'Gear');
  stageBox.append(preview.el, h('div.stage-tools', null, gearBtn), h('span.stage-hint', null, 'Tap for a move'));

  const plateName = h('b');
  const plateTags = h('div.tags');
  const stepsEl = h('nav.steps', { 'aria-label': 'Steps' });
  const panel = h('section.scr-panel');
  const back = h<HTMLButtonElement>('button.btn.ghost', { onclick: () => go(step - 1) }, icon('back'), 'Back');
  const next = h<HTMLButtonElement>('button.btn.primary', { onclick: () => advance() });
  const save = h<HTMLButtonElement>('button.btn', { onclick: () => finish() }, icon('check'), 'Save');

  const name = h<HTMLInputElement>('input.name', {
    value: c.name, maxlength: String(NAME_MAX), placeholder: 'Name your fighter', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done',
    'aria-label': 'Name',
    oninput: () => { c.name = name.value; name.classList.remove('shake'); syncPlate(); },
    onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); finish(); } },
  });

  function syncStage(): void {
    preview.set(showGear ? c : bare(c));
    gearBtn.classList.toggle('on', showGear);
    gearBtn.setAttribute('aria-pressed', String(showGear));
    gearBtn.title = showGear ? 'Hide gear' : 'Show gear';
  }

  function syncPlate(): void {
    const n = cleanName(c.name);
    plateName.textContent = n || 'Your fighter';
    plateName.classList.toggle('empty', !n);
    plateTags.replaceChildren(
      h('span.chip', null, SPECIES[c.look.species].name),
      h('span.chip', { style: { color: css(FORMS[c.form].color) } }, FORMS[c.form].name));
  }

  function syncNav(): void {
    stepsEl.replaceChildren(...STEPS.flatMap((s, i) => [
      ...(i ? [h(`i.step-line${i <= reached ? '.done' : ''}`)] : []),
      h<HTMLButtonElement>(`button.step${i === step ? '.on' : i <= reached ? '.done' : ''}`, {
        disabled: i > reached, 'aria-current': i === step ? 'step' : null,
        onclick: () => go(i),
      }, h('i', null, String(i + 1)), h('span', null, s.label)),
    ]));
    back.style.visibility = step > 0 ? '' : 'hidden';
    const last = step === STEPS.length - 1;
    next.replaceChildren(...(last
      ? [icon(editing ? 'check' : 'swords'), editing ? 'Save' : 'Enter the arena']
      : [`Next: ${STEPS[step + 1].label}`, icon('next')]));
    save.hidden = !editing || last;
  }

  function go(i: number): void {
    if (i < 0 || i > reached || i === step) return;
    sfx.play('ui');
    step = i;
    render();
  }

  function advance(): void {
    if (step === STEPS.length - 1) { finish(); return; }
    reached = Math.max(reached, step + 1);
    go(step + 1);
  }

  function finish(): void {
    const n = cleanName(name.value);
    if (!n) {
      if (step !== 2) { reached = 2; step = 2; render(); }
      name.classList.remove('shake');
      void name.offsetWidth;
      name.classList.add('shake');
      name.focus();
      sfx.play('ui');
      return;
    }
    sfx.play('ui');
    cb.onDone({ ...c, name: n });
  }

  const setLook = (patch: Partial<Appearance>, move = false) => {
    c = { ...c, look: { ...c.look, ...patch } };
    sfx.play('ui');
    syncStage();
    if (move) preview.showcase();
    syncPlate();
  };

  const head = (i: number, tool?: HTMLElement) => h('div.step-head', null,
    h('small', null, `Step ${i + 1} of ${STEPS.length}`),
    h('div.step-title', null, h('h2', null, STEPS[i].title), tool ?? null),
    h('p', null, STEPS[i].sub));

  function clearCards(): void {
    for (const p of cards) p.dispose();
    cards = [];
  }

  /** A pick tile with a still portrait of the fighter. */
  function tile(build: CharacterBuild, w: number, ht: number, ground: number, label: string, sub: string, on: boolean, pick: () => void): HTMLButtonElement {
    const box = h('div.portrait');
    const p = new Preview(build, w, ht, { still: true, ground, fit: box });
    cards.push(p);
    box.append(p.el);
    return h<HTMLButtonElement>(`button.card-tile${on ? '.on' : ''}`, { 'aria-pressed': String(on), onclick: pick },
      box, h('b', null, label), sub ? h('small', null, sub) : null);
  }

  const select = (grid: HTMLElement, el: HTMLElement) => {
    for (const t of grid.children) { t.classList.toggle('on', t === el); t.setAttribute('aria-pressed', String(t === el)); }
  };

  function speciesStep(): HTMLElement[] {
    const detail = h('div.detail');
    const showDetail = (id: SpeciesId) => detail.replaceChildren(
      h('div.detail-head', null, h('b', null, SPECIES[id].name)), h('p', null, SPECIES[id].blurb));
    const grid = h('div.card-grid.species');
    for (const id of SPECIES_IDS) {
      const sp = SPECIES[id];
      const look: Appearance = { ...c.look, species: id, skin: id === c.look.species ? c.look.skin : 0 };
      const t: HTMLButtonElement = tile({ ...bare(c), form: 'balanced', look }, 40, 38, -24, sp.name, '', id === c.look.species, () => {
        if (c.look.species === id) return;
        select(grid, t);
        showDetail(id);
        setLook({ species: id, skin: Math.min(c.look.skin, sp.skins.length - 1) }, true);
      });
      grid.append(t);
    }
    showDetail(c.look.species);
    return [head(0), grid, detail];
  }

  function formStep(): HTMLElement[] {
    const detail = h('div.detail');
    const showDetail = (id: FormId) => {
      const f = FORMS[id];
      detail.replaceChildren(
        h('div.detail-head', null, h('b', null, f.name), h('span', null, f.title)),
        h('p', null, f.blurb),
        h('div.bars', { style: { '--seg': css(f.color) } }, ...FORM_STATS.flatMap(([k, label, fmt]) => {
          const v = f.base[k] as number;
          const [lo, hi] = RANGE.get(k)!;
          const n = hi > lo ? 3 + Math.round(((v - lo) / (hi - lo)) * 7) : 6;
          return [h('span', null, label), h('div.segs', null, ...Array.from({ length: 10 }, (_, i) => h(i < n ? 'i.on' : 'i'))), h('em', null, fmt(v))];
        })));
    };
    const grid = h('div.card-grid.forms');
    for (const id of FORM_IDS) {
      const f = FORMS[id];
      const t: HTMLButtonElement = tile({ ...bare(c), form: id }, 44, 62, 2, f.name, f.title, id === c.form, () => {
        if (c.form === id) return;
        select(grid, t);
        showDetail(id);
        c = { ...c, form: id };
        sfx.play('ui');
        syncStage();
        preview.showcase();
        syncPlate();
      });
      grid.append(t);
    }
    showDetail(c.form);
    return [head(1), grid, detail];
  }

  function styleStep(): HTMLElement[] {
    const body = h('div.style-grid');
    const swatches = (label: string, colors: number[], cur: () => number, pick: (i: number) => void) => {
      const row = h('div.swatches');
      const draw = () => row.replaceChildren(...colors.map((col, i) => h(`button.swatch${i === cur() ? '.on' : ''}`, {
        style: { background: hex(col) }, title: `${label} ${i + 1}`, 'aria-label': `${label} ${i + 1}`, 'aria-pressed': String(i === cur()),
        onclick: () => { if (i !== cur()) { pick(i); draw(); } },
      })));
      draw();
      return h('div.field', null, h('div.label', null, label), row);
    };
    const draw = () => {
      const L = c.look;
      const sp = SPECIES[L.species];
      const hairOpts = h('div.opts');
      const drawHair = () => hairOpts.replaceChildren(...HAIR_STYLES.map((s, i) => h(`button.opt${i === c.look.hair ? '.on' : ''}`, {
        'aria-pressed': String(i === c.look.hair),
        onclick: () => { if (i !== c.look.hair) { setLook({ hair: i }); drawHair(); } },
      }, s)));
      drawHair();
      body.replaceChildren(
        h('div.field.wide', null,
          h('div.label', null, 'Name'),
          h('div.field-row', null, name,
            h('button.btn.icon', { title: 'Random name', 'aria-label': 'Random name', onclick: () => {
              name.value = randomName(); c.name = name.value; name.classList.remove('shake'); sfx.play('ui'); syncPlate();
            } }, icon('dice')))),
        swatches(L.species === 'golem' ? 'Stone' : L.species === 'wisp' ? 'Spirit' : 'Skin', sp.skins, () => c.look.skin, (i) => setLook({ skin: i })),
        swatches('Eyes', EYE_COLORS, () => c.look.eyes, (i) => setLook({ eyes: i })),
        sp.hair ? h('div.field.wide', null, h('div.label', null, 'Hair'), hairOpts) : '',
        swatches(sp.hair ? 'Hair colour' : 'Crystals', HAIR_COLORS, () => c.look.hairColor, (i) => setLook({ hairColor: i })),
        swatches('Outfit', OUTFIT_COLORS, () => c.look.outfit, (i) => setLook({ outfit: i })),
        swatches('Accent', ACCENT_COLORS, () => c.look.accent, (i) => setLook({ accent: i })),
      );
    };
    draw();
    const lucky = h('button.btn.sm', { title: 'Random colours and hair', onclick: () => {
      const r = randomAppearance();
      setLook({ ...r, species: c.look.species, skin: Math.floor(Math.random() * SPECIES[c.look.species].skins.length) }, true);
      draw();
    } }, icon('dice'), 'Random look');
    return [head(2, lucky), body];
  }

  function render(): void {
    clearCards();
    panel.replaceChildren(...(step === 0 ? speciesStep() : step === 1 ? formStep() : styleStep()));
    panel.scrollTop = 0;
    syncNav();
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
    if (e.key === 'Enter') { e.preventDefault(); advance(); }
    else if (e.key === 'Escape' && cb.onCancel) { sfx.play('ui'); cb.onCancel(); }
  };
  window.addEventListener('keydown', onKey);

  syncPlate();
  render();
  const el = h('div.scr.creator', { role: 'dialog', 'aria-label': editing ? 'Edit your fighter' : 'Create your fighter' },
    h('header.scr-head', null,
      h('div.scr-title', null, h('h1', null, editing ? 'Edit fighter' : 'New fighter'), h('small', null, 'Species and colours are looks only')),
      h('div.grow'),
      stepsEl,
      h('div.grow'),
      cb.onCancel ? h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: () => { sfx.play('ui'); cb.onCancel!(); } }, icon('close')) : null),
    h('section.scr-stage', null, stageBox, h('div.nameplate', null, plateName, plateTags)),
    panel,
    h('footer.scr-nav', null, back, h('div.grow'), save, next),
  );
  return {
    el,
    dispose: () => { preview.dispose(); clearCards(); window.removeEventListener('keydown', onKey); },
  };
}
