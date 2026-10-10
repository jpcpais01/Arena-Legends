import { sfx } from '../audio/sfx';
import {
  ACCENT_COLORS, BACKDROPS, EYE_COLORS, fitForm, HAIR_COLORS, HAIR_STYLES, OUTFIT_COLORS, randomAppearance, SPECIES, SPECIES_IDS, type Appearance, type SpeciesId,
} from '../character/appearance';
import { cleanName, NAME_MAX, randomName, type PlayerCharacter } from '../character/profile';
import { applyBackdrop, BH, BW } from '../render/backdrops';
import { css } from '../render/pixel/color';
import { FORMS, FORM_IDS } from '../sim/forms';
import { gearOf } from '../sim/gear';
import type { CharacterBuild } from '../sim/loadout';
import { FIGHT_STYLE_IDS, FIGHT_STYLES, type FightStyleId } from '../sim/styles';
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
  { label: 'Species', icon: 'paw', title: 'Choose your species', sub: 'Looks only: every species fights the same.' },
  { label: 'Body', icon: 'body', title: 'Choose your body', sub: 'Your body sets your stats and how you move.' },
  { label: 'Style', icon: 'swords', title: 'Choose your fighting style', sub: 'How your hero likes to fight. No stats: just habits and temper.' },
  { label: 'Look', icon: 'palette', title: 'Choose your look', sub: 'Colours and hair. Change them any time.' },
  { label: 'Name', icon: 'edit', title: 'Name your legend', sub: 'The crowd will chant it.' },
  { label: 'Backdrop', icon: 'star', title: 'Choose your backdrop', sub: 'The scene behind your portrait on the home screen.' },
];
const STYLE = 2;
const LOOK = 3;
const NAME = 4;
const LAST = STEPS.length - 1;
/** Steps whose pick the stage arrows flip through. */
const ARROWS = 3;

const STYLE_ICON: Record<FightStyleId, IconName> = {
  balanced: 'scale', relentless: 'flame', tactician: 'eye', skirmisher: 'fast', guardian: 'shield',
};
const STYLE_BARS = ['Aggression', 'Defense', 'Trickery', 'Stamina'];

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

const SKIN_LABEL: Partial<Record<SpeciesId, string>> = { golem: 'Stone', wisp: 'Spirit' };

/** The character in plain clothes with just their weapon, so species and colours read clearly. */
const bare = (c: CharacterBuild): CharacterBuild => ({ ...c, gear: { main: c.gear.main }, skins: {} });

/**
 * Character creation, a full screen in six steps like a game's character
 * select: species, body, fighting style, look, the name, then the portrait backdrop. The fighter stands big on a lit
 * dais and updates live; arrows beside them flip through species or bodies.
 * Editing an existing fighter unlocks every step and can save from any of them.
 */
export function creatorSheet(start: PlayerCharacter, cb: CreatorCallbacks): { el: HTMLElement; dispose(): void } {
  const editing = !!cb.onCancel;
  let c: PlayerCharacter = { ...start, look: { ...start.look } };
  let step = 0;
  let reached = editing ? LAST : 0;
  let showGear = true;
  let cards: Preview[] = [];
  /** Updates the open step after a pick made outside it (stage arrows). */
  let refresh: () => void = () => {};
  /** A button the open step puts beside its title (Look: Surprise me). */
  let headTool: HTMLElement | null = null;

  const stageBox = h('div.stage-box');
  const preview = new Preview(showGear ? c : bare(c), 100, 90, { autoplay: true, pedestal: true, fit: stageBox });
  const gearBtn = h<HTMLButtonElement>('button.btn.sm.icon', {
    title: 'Show gear', 'aria-label': 'Show gear', 'aria-pressed': 'false',
    onclick: () => { showGear = !showGear; sfx.play('select'); syncStage(); preview.showcase(); },
  }, icon('bag'));
  const prev = h<HTMLButtonElement>('button.arrow.l', { title: 'Previous', 'aria-label': 'Previous', onclick: () => cycle(-1) }, icon('play', 'flip'));
  const nextPick = h<HTMLButtonElement>('button.arrow.r', { title: 'Next', 'aria-label': 'Next', onclick: () => cycle(1) }, icon('play'));
  stageBox.append(preview.el, prev, nextPick, h('div.stage-tools', null, gearBtn));
  gearBtn.classList.toggle('on', showGear);
  gearBtn.setAttribute('aria-pressed', String(showGear));
  gearBtn.title = showGear ? 'Hide gear' : 'Show gear';

  const stepsEl = h('nav.steps', { 'aria-label': 'Steps' });
  const panelBody = h('div.panel-body');
  const panelHead = h('div.step-head');
  const panel = h('section.scr-panel.frame', null, panelHead, panelBody);
  const back = h<HTMLButtonElement>('button.btn.back', { title: 'Back', 'aria-label': 'Back', onclick: () => { sfx.play('back'); go(step - 1); } }, icon('back'), h('span.lbl', null, 'Back'));
  const next = h<HTMLButtonElement>('button.btn.primary.next', { onclick: () => advance() });
  const save = h<HTMLButtonElement>('button.btn.save', { title: 'Save', 'aria-label': 'Save', onclick: () => finish() }, icon('check'), h('span.lbl', null, 'Save'));

  const name = h<HTMLInputElement>('input.name', {
    value: c.name, maxlength: String(NAME_MAX), placeholder: 'Your name', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done',
    'aria-label': 'Name',
    oninput: () => { c.name = name.value; name.classList.remove('shake'); },
    onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); advance(); } },
  });

  function syncStage(): void {
    preview.set(showGear ? c : bare(c));
    gearBtn.classList.toggle('on', showGear);
    gearBtn.setAttribute('aria-pressed', String(showGear));
    gearBtn.title = showGear ? 'Hide gear' : 'Show gear';
  }

  function syncNav(): void {
    stepsEl.replaceChildren(...STEPS.flatMap((s, i) => [
      ...(i ? [h(`i.step-line${i <= reached ? '.done' : ''}`)] : []),
      h<HTMLButtonElement>(`button.step${i === step ? '.on' : i <= reached ? '.done' : ''}`, {
        disabled: i > reached, 'aria-current': i === step ? 'step' : null, title: s.label,
        onclick: () => { if (i !== step) sfx.play('select'); go(i); },
      }, h('i', null, icon(i < step || (i <= reached && i !== step) ? 'check' : s.icon)), h('span', null, s.label)),
    ]));
    back.hidden = step === 0;
    const last = step === LAST;
    next.replaceChildren(...(last
      ? [icon(editing ? 'check' : 'swords'), h('span', null, editing ? 'Save' : 'Enter the arena')]
      : [h('span', null, 'Next'), icon('next')]));
    next.classList.toggle('go', last && !editing);
    save.hidden = !editing || last;
    const arrows = step < ARROWS;
    prev.hidden = nextPick.hidden = !arrows;
  }

  function go(i: number): void {
    if (i < 0 || i > reached || i === step) return;
    const dir = i > step ? 1 : -1;
    step = i;
    render(dir);
  }

  function advance(): void {
    if (step === LAST) { finish(); return; }
    sfx.play('select');
    reached = Math.max(reached, step + 1);
    go(step + 1);
  }

  function finish(): void {
    const n = cleanName(name.value);
    if (!n) {
      if (step !== NAME) { reached = Math.max(reached, NAME); step = NAME; render(-1); }
      name.classList.remove('shake');
      void name.offsetWidth;
      name.classList.add('shake');
      name.focus();
      sfx.play('back');
      return;
    }
    sfx.play('confirm');
    cb.onDone({ ...c, name: n });
  }

  /** Stage arrows: the previous or next species, body or fighting style. */
  function cycle(dir: 1 | -1): void {
    sfx.play('select');
    if (step === 0) {
      const i = SPECIES_IDS.indexOf(c.look.species);
      const id = SPECIES_IDS[(i + dir + SPECIES_IDS.length) % SPECIES_IDS.length];
      pickSpecies(id);
    } else if (step === 1) {
      const forms = SPECIES[c.look.species].forms;
      const i = forms.indexOf(c.form);
      pickForm(forms[(i + dir + forms.length) % forms.length]);
    } else if (step === STYLE) {
      const i = FIGHT_STYLE_IDS.indexOf(styleOf());
      pickStyle(FIGHT_STYLE_IDS[(i + dir + FIGHT_STYLE_IDS.length) % FIGHT_STYLE_IDS.length]);
    }
    refresh();
  }

  const setLook = (patch: Partial<Appearance>, move = false) => {
    const look = { ...c.look, ...patch };
    // Switching species keeps the body form when it can, else takes the closest one it has.
    c = { ...c, look, form: fitForm(look.species, c.form) };
    syncStage();
    if (move) preview.showcase();
  };

  function pickSpecies(id: SpeciesId): void {
    if (c.look.species === id) return;
    setLook({ species: id, skin: Math.min(c.look.skin, SPECIES[id].skins.length - 1) }, true);
  }

  function pickForm(id: FormId): void {
    if (c.form === id) return;
    c = { ...c, form: id };
    syncStage();
    preview.showcase();
  }

  const styleOf = (): FightStyleId => c.style ?? 'balanced';

  function pickStyle(id: FightStyleId): void {
    if (styleOf() === id) return;
    c = { ...c, style: id };
    preview.showcase();
  }

  function clearCards(): void {
    for (const p of cards) p.dispose();
    cards = [];
  }

  /** A pick tile with a still portrait of the fighter. */
  function tile(build: CharacterBuild, w: number, ht: number, ground: number, label: string, sub: string, pick: () => void): HTMLButtonElement {
    const box = h('div.portrait');
    const p = new Preview(build, w, ht, { still: true, ground, fit: box });
    cards.push(p);
    box.append(p.el);
    return h<HTMLButtonElement>('button.card-tile', { onclick: pick },
      box, h('b', null, label), sub ? h('small', null, sub) : null);
  }

  /** Scrolls the step body just enough to show `el` (never the page itself). */
  const reveal = (el: HTMLElement) => {
    const b = panelBody.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top < b.top) panelBody.scrollTop -= b.top - r.top + 4;
    else if (r.bottom > b.bottom) panelBody.scrollTop += r.bottom - b.bottom + 4;
  };

  /** Marks the picked tile in a grid. */
  const mark = (tiles: Map<string, HTMLElement>, cur: string) => {
    for (const [id, t] of tiles) {
      const on = id === cur;
      t.classList.toggle('on', on);
      t.setAttribute('aria-pressed', String(on));
      if (on) reveal(t);
    }
  };

  function speciesStep(): HTMLElement[] {
    const detail = h('div.detail.frame.iron');
    const tiles = new Map<string, HTMLElement>();
    const grid = h('div.card-grid.species');
    for (const id of SPECIES_IDS) {
      const look: Appearance = { ...c.look, species: id, skin: id === c.look.species ? c.look.skin : 0 };
      const t = tile({ ...bare(c), form: 'balanced', look }, 40, 38, -24, SPECIES[id].name, '', () => {
        if (c.look.species === id) return;
        sfx.play('select');
        pickSpecies(id);
        refresh();
      });
      tiles.set(id, t);
      grid.append(t);
    }
    refresh = () => {
      const sp = SPECIES[c.look.species];
      mark(tiles, c.look.species);
      detail.replaceChildren(
        h('div.detail-head', null, h('b', null, sp.name)), h('p', null, sp.blurb),
        h('p.forms-of', null, h('span', null, 'Bodies: '), sp.forms.map((f) => FORMS[f].name).join(', ')));
    };
    refresh();
    return [grid, detail];
  }

  function formStep(): HTMLElement[] {
    const detail = h('div.detail.frame.iron');
    const tiles = new Map<string, HTMLElement>();
    const grid = h('div.card-grid.forms');
    for (const id of SPECIES[c.look.species].forms) {
      const f = FORMS[id];
      const t = tile({ ...bare(c), form: id }, 44, 62, 2, f.name, f.title, () => {
        if (c.form === id) return;
        sfx.play('select');
        pickForm(id);
        refresh();
      });
      tiles.set(id, t);
      grid.append(t);
    }
    refresh = () => {
      const f = FORMS[c.form];
      mark(tiles, c.form);
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
    refresh();
    return [grid, detail];
  }

  function styleStep(): HTMLElement[] {
    const detail = h('div.detail.frame.iron');
    const tiles = new Map<string, HTMLElement>();
    const grid = h('div.card-grid.styles');
    for (const id of FIGHT_STYLE_IDS) {
      const s = FIGHT_STYLES[id];
      const t = h<HTMLButtonElement>('button.card-tile', {
        style: { '--seg': css(s.color) },
        onclick: () => {
          if (styleOf() === id) return;
          sfx.play('select');
          pickStyle(id);
          refresh();
        },
      }, h('div.portrait.style-ic', { style: { color: css(s.color) } }, icon(STYLE_ICON[id])), h('b', null, s.name), h('small', null, s.title));
      tiles.set(id, t);
      grid.append(t);
    }
    refresh = () => {
      const s = FIGHT_STYLES[styleOf()];
      mark(tiles, s.id);
      detail.replaceChildren(
        h('div.detail-head', null, h('b', null, s.name), h('span', null, s.title)),
        h('p', null, s.blurb),
        h('div.bars', { style: { '--seg': css(s.color) } }, ...STYLE_BARS.flatMap((label, k) => {
          const n = s.bars[k];
          return [h('span', null, label), h('div.segs', null, ...Array.from({ length: 10 }, (_, i) => h(i < n ? 'i.on' : 'i'))), h('em', null, String(n))];
        })));
    };
    refresh();
    return [grid, detail];
  }

  function lookStep(): HTMLElement[] {
    const body = h('div.style-grid');
    const swatches = (label: string, colors: number[], cur: () => number, pick: (i: number) => void) => {
      const row = h('div.swatches');
      const draw = () => row.replaceChildren(...colors.map((col, i) => h(`button.swatch${i === cur() ? '.on' : ''}`, {
        style: { '--sw': hex(col) }, title: `${label} ${i + 1}`, 'aria-label': `${label} ${i + 1}`, 'aria-pressed': String(i === cur()),
        onclick: () => { if (i !== cur()) { sfx.play('select'); pick(i); draw(); } },
      })));
      draw();
      return h('div.field', null, h('div.label', null, label), row);
    };
    /** ◀ value ▶ picker for a list of names. */
    const cycler = (label: string, names: readonly string[], cur: () => number, pick: (i: number) => void) => {
      const val = h('b.cyc-val');
      const draw = () => { val.textContent = names[cur()]; };
      const step = (d: number) => { sfx.play('select'); pick((cur() + d + names.length) % names.length); draw(); };
      draw();
      return h('div.field', null, h('div.label', null, label), h('div.cycler', null,
        h('button.arrow.sm', { 'aria-label': `Previous ${label}`, onclick: () => step(-1) }, icon('play', 'flip')),
        val,
        h('button.arrow.sm', { 'aria-label': `Next ${label}`, onclick: () => step(1) }, icon('play'))));
    };
    const draw = () => {
      const L = c.look;
      const sp = SPECIES[L.species];
      body.replaceChildren(
        swatches(SKIN_LABEL[L.species] ?? 'Skin', sp.skins, () => c.look.skin, (i) => setLook({ skin: i })),
        swatches('Eyes', EYE_COLORS, () => c.look.eyes, (i) => setLook({ eyes: i })),
        sp.hair ? cycler('Hair', HAIR_STYLES, () => c.look.hair, (i) => setLook({ hair: i }))
          : sp.styles ? cycler(sp.styleLabel ?? 'Style', sp.styles, () => c.look.hair % sp.styles!.length, (i) => setLook({ hair: i })) : '',
        swatches(sp.hair ? 'Hair colour' : sp.styleLabel ?? 'Colour', HAIR_COLORS, () => c.look.hairColor, (i) => setLook({ hairColor: i })),
        swatches('Outfit', OUTFIT_COLORS, () => c.look.outfit, (i) => setLook({ outfit: i })),
        swatches('Accent', ACCENT_COLORS, () => c.look.accent, (i) => setLook({ accent: i })),
      );
    };
    draw();
    const lucky = h('button.btn.sm.lucky', { title: 'Random colours and hair', onclick: () => {
      const r = randomAppearance();
      sfx.play('select');
      setLook({ ...r, species: c.look.species, skin: Math.floor(Math.random() * SPECIES[c.look.species].skins.length) }, true);
      draw();
    } }, icon('dice'), 'Surprise me');
    headTool = lucky;
    return [body];
  }

  function nameStep(): HTMLElement[] {
    const dice = h('button.btn.icon.dice', { title: 'Random name', 'aria-label': 'Random name', onclick: () => {
      name.value = randomName(); c.name = name.value; name.classList.remove('shake'); sfx.play('select');
    } }, icon('dice'));
    const sp = SPECIES[c.look.species], f = FORMS[c.form];
    return [h('div.name-step', null,
      h('div.name-plate.frame', null, name, dice),
      h('p.name-hint', null, `Up to ${NAME_MAX} letters, or roll the dice.`),
      h('div.name-sum', null,
        h('span', null, h('small', null, 'Species'), h('b', null, sp.name)),
        h('span', null, h('small', null, 'Body'), h('b', { style: { color: css(f.color) } }, f.name)),
        h('span', null, h('small', null, 'Style'), h('b', { style: { color: css(FIGHT_STYLES[styleOf()].color) } }, FIGHT_STYLES[styleOf()].name)),
        h('span', null, h('small', null, 'Fights with'), h('b', null, gearOf(c.gear.main).name)))),
    ];
  }

  function backdropStep(): HTMLElement[] {
    const tiles = new Map<string, HTMLElement>();
    const grid = h('div.card-grid.backdrops');
    BACKDROPS.forEach((label, i) => {
      const t = tile(c, BW, BH, -18, label, '', () => {
        if ((c.look.backdrop ?? 0) === i) return;
        sfx.play('select');
        c = { ...c, look: { ...c.look, backdrop: i } };
        refresh();
      });
      applyBackdrop(t.querySelector<HTMLElement>('.portrait')!, i);
      tiles.set(String(i), t);
      grid.append(t);
    });
    refresh = () => mark(tiles, String(c.look.backdrop ?? 0));
    refresh();
    return [grid];
  }

  function render(dir = 0): void {
    clearCards();
    refresh = () => {};
    const s = STEPS[step];
    headTool = null;
    panelBody.replaceChildren(...(step === 0 ? speciesStep() : step === 1 ? formStep() : step === STYLE ? styleStep()
      : step === LOOK ? lookStep() : step === NAME ? nameStep() : backdropStep()));
    panelHead.replaceChildren(
      h('div.step-title', null, h('div.ribbon', null, h('span', null, s.title)), headTool),
      h('p', null, s.sub));
    panelBody.scrollTop = 0;
    // Slide the new step in from the side it came from.
    panel.classList.remove('in-l', 'in-r');
    if (dir) { void panel.offsetWidth; panel.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
    syncNav();
    if (step === NAME && !matchMedia('(pointer: coarse)').matches) requestAnimationFrame(() => name.focus());
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowLeft' && step < ARROWS) { e.preventDefault(); cycle(-1); return; }
    if (e.key === 'ArrowRight' && step < ARROWS) { e.preventDefault(); cycle(1); return; }
    if (e.target instanceof HTMLButtonElement) return;
    if (e.key === 'Enter') { e.preventDefault(); advance(); }
    else if (e.key === 'Escape' && cb.onCancel) { sfx.play('back'); cb.onCancel(); }
  };
  window.addEventListener('keydown', onKey);

  render();
  const el = h('div.scr.creator', { role: 'dialog', 'aria-label': editing ? 'Edit your hero' : 'Create your hero' },
    h('header.scr-head', null,
      h('div.scr-title', null, h('h1', null, editing ? 'Your hero' : 'New hero')),
      stepsEl,
      cb.onCancel ? h('button.btn.icon.close', { title: 'Close', 'aria-label': 'Close', onclick: () => { sfx.play('back'); cb.onCancel!(); } }, icon('close')) : h('i.close-pad')),
    h('section.scr-stage', null, h('div.spot'), stageBox),
    panel,
    h('footer.scr-nav', null, back, h('div.grow'), save, next),
  );
  return {
    el,
    dispose: () => { preview.dispose(); clearCards(); window.removeEventListener('keydown', onKey); },
  };
}
