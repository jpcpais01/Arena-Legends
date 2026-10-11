import './creator.css';
import { sfx } from '../audio/sfx';
import {
  ACCENT_COLORS, BACKDROPS, EYE_COLORS, fitForm, HAIR_COLORS, HAIR_STYLES, OUTFIT_COLORS, randomAppearance, SPECIES, SPECIES_IDS, type Appearance, type SpeciesId,
} from '../character/appearance';
import { cleanName, NAME_MAX, randomName, type PlayerCharacter } from '../character/profile';
import { applyBackdrop } from '../render/backdrops';
import { css } from '../render/pixel/color';
import { FORMS, FORM_IDS } from '../sim/forms';
import { gearOf } from '../sim/gear';
import type { CharacterBuild } from '../sim/loadout';
import { FIGHT_STYLE_IDS, FIGHT_STYLES, type FightStyleId } from '../sim/styles';
import type { FormId, Stats } from '../sim/types';
import { h, hex } from './dom';
import { icon, type IconName } from './icons';
import { Preview } from './preview';
import { buyEntrance, entranceOf, ENTRANCE_IDS, ENTRANCES, ownsEntrance, type EntranceId } from '../character/entrances';
import { gems } from '../character/collection';
import { ENTRANCE_ICON, ENTRANCE_TIER } from './entranceUi';
import { gemTag } from './gacha';
import { heroLevel, levelOf, pointsAt, progress, POINTS_PER_LEVEL } from '../character/progress';
import { applyTraining, nextPointWorth, spentPoints, TRAIN, TRAIN_IDS, type TrainId } from '../sim/training';
import { BACKDROP_LINES, FORM_LINE, LOOK_LINES, pickLine, SPECIES_LINE, STAT_LINES, STYLE_LINE } from './heroLines';

export interface CreatorCallbacks {
  onDone(c: PlayerCharacter): void;
  /** Absent on first launch (there is nothing to go back to). */
  onCancel?(): void;
  /** Open straight on the Stats step (there are points to spend). */
  stats?: boolean;
}

interface StepDef { label: string; icon: IconName; title: string; sub: string }
const STEPS: StepDef[] = [
  { label: 'Species', icon: 'paw', title: 'Who are you?', sub: 'Pick your kind. Looks only: every species fights the same.' },
  { label: 'Body', icon: 'body', title: 'Shape your body', sub: 'Your body sets your stats and how you move.' },
  { label: 'Style', icon: 'swords', title: 'How do you fight?', sub: 'Your habits and temper in a fight. No stats, just attitude.' },
  { label: 'Look', icon: 'palette', title: 'Make it yours', sub: 'Colours, hair and trims. Change them any time.' },
  { label: 'Name', icon: 'edit', title: 'Name your legend', sub: 'The crowd will chant it.' },
  { label: 'Scene', icon: 'star', title: 'Set your scene', sub: 'The backdrop behind your portrait, wherever you show up.' },
  { label: 'Entrance', icon: 'boot', title: 'Make an entrance', sub: 'How you step into the arena before every fight. More in the Shop.' },
];
/** Only when editing a hero: spend the points levels give. */
const STATS_STEP: StepDef = { label: 'Stats', icon: 'trophy', title: 'Train your stats', sub: 'Every level gives stat points. Spend them on your base stats; take them back any time.' };
const SPECIES_STEP = 0;
const BODY = 1;
const STYLE = 2;
const LOOK = 3;
const NAME = 4;
const BACKDROP = 5;
const ENTRANCE = 6;

export const STYLE_ICON: Record<FightStyleId, IconName> = {
  balanced: 'scale', relentless: 'flame', tactician: 'eye', skirmisher: 'fast', guardian: 'shield',
};
const STYLE_BARS = ['Aggression', 'Defense', 'Trickery', 'Stamina'];

/** A colour for each species in the UI: card glows and the stage tag. */
const SPECIES_TINT: Record<SpeciesId, number> = {
  human: 0xe8a858, imp: 0xe85a4a, myco: 0xc07ae0, ogrin: 0x7ac050, wisp: 0x6ad8ff, golem: 0x5ad0b0,
};

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
/** The stat each training line shows, its label and format. */
const TRAIN_VIEW: Record<TrainId, [keyof Stats, string, (v: number) => string]> = {
  health: ['maxHp', 'Health', (v) => String(Math.round(v))],
  power: ['power', 'Power', (v) => v.toFixed(1).replace(/\.0$/, '')],
  armor: ['armor', 'Armor', (v) => v.toFixed(1).replace(/\.0$/, '')],
  resist: ['resist', 'Resist', (v) => v.toFixed(1).replace(/\.0$/, '')],
  speed: ['attackSpeed', 'Attack speed', (v) => `${(v * 100).toFixed(1).replace(/\.0$/, '')}%`],
  crit: ['critChance', 'Crit', (v) => `${(v * 100).toFixed(1).replace(/\.0$/, '')}%`],
};
const trim = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
/** What a stat's trained points added, e.g. "60" or "2.4%". */
function fmtGain(stat: keyof Stats, v: number): string {
  return stat === 'attackSpeed' || stat === 'critChance' ? `${trim(v * 100)}%` : stat === 'maxHp' ? String(Math.round(v)) : trim(v);
}
/** "+20 per point", scaled down once a stat tapers. */
function perPoint(id: TrainId, worth: number): string {
  const a = TRAIN[id].add;
  const tag = worth < 1 ? ` (${Math.round(worth * 100)}%)` : '';
  switch (id) {
    case 'health': return `+${Math.round(a.maxHp! * worth)} per point${tag}`;
    case 'power': return `+${trim(a.power! * worth)} per point${tag}`;
    case 'armor': return `+${trim(a.armor! * worth)} per point${tag}`;
    case 'resist': return `+${trim(a.resist! * worth)} per point${tag}`;
    case 'speed': return `+${trim(a.attackSpeed! * 100 * worth)}% per point${tag}`;
    case 'crit': return `+${trim(a.critChance! * 100 * worth)}% per point${tag}`;
  }
}

const RANGE = new Map(FORM_STATS.map(([k]) => {
  const vs = FORM_IDS.map((id) => FORMS[id].base[k] as number);
  return [k, [Math.min(...vs), Math.max(...vs)]] as const;
}));

const SKIN_LABEL: Partial<Record<SpeciesId, string>> = { golem: 'Stone', wisp: 'Spirit' };

/** The character in plain clothes with just their weapon, so species and colours read clearly. */
const bare = (c: CharacterBuild): CharacterBuild => ({ ...c, gear: { main: c.gear.main }, skins: {} });

/** Segmented bar row for the stat lists: label, ten cells, value. */
const segRow = (label: string, n: number, value: string) =>
  [h('span', null, label), h('div.segs', null, ...Array.from({ length: 10 }, (_, i) => h(i < n ? 'i.on' : 'i'))), h('em', null, value)];

/** Look editor categories. `face` ones zoom the stage camera in on the head. */
type LookCat = 'skin' | 'eyes' | 'hair' | 'hairColor' | 'outfit' | 'accent';
const FACE: ReadonlySet<LookCat> = new Set(['skin', 'eyes', 'hair', 'hairColor']);

/**
 * Hero creation and editing: a dressing room. Your hero stands big on a lit
 * dais inside their own portrait card (their backdrop behind them, their name
 * and tags under them), reacts to every pick with a line and a burst of
 * sparks, and the camera leans in on the face while you style it. Chapters
 * run along the top; on a new hero they unlock one by one and end on a
 * "new legend" reveal that plays the chosen entrance.
 */
export function creatorSheet(start: PlayerCharacter, cb: CreatorCallbacks): { el: HTMLElement; dispose(): void } {
  const editing = !!cb.onCancel;
  const steps = editing ? [...STEPS, STATS_STEP] : STEPS;
  const LAST = steps.length - 1;
  const STATS = editing ? STEPS.length : -1;
  let c: PlayerCharacter = { ...start, look: { ...start.look } };
  let step = editing && cb.stats ? STATS : 0;
  let reached = editing ? LAST : 0;
  let showGear = true;
  let cards: Preview[] = [];
  let lookCat: LookCat = 'skin';
  /** Updates the open step after a pick made outside it (stage arrows). */
  let refresh: () => void = () => {};
  /** What the stage arrows do on the open step (null hides them). */
  let cycler: ((dir: 1 | -1) => void) | null = null;
  /** A button the open step puts beside its title (Look: Surprise me). */
  let headTool: HTMLElement | null = null;
  let finale: { el: HTMLElement; preview: Preview } | null = null;

  // --- Stage: the hero inside their portrait card ---------------------------------------------
  const box = h('div.stage-box.hc-box');
  const preview = new Preview(showGear ? c : bare(c), 100, 90, { autoplay: true, pedestal: true, fit: box });
  box.append(preview.el);
  const sky = h('div.hc-sky');
  const bubble = h('div.hc-bubble', { 'aria-live': 'polite' });
  const burstEl = h('div.hc-burst');
  const plateName = h('b.hc-pname');
  const plateTags = h('div.hc-ptags');
  const gearBtn = h<HTMLButtonElement>('button.btn.sm.icon.hc-tool', {
    onclick: () => { showGear = !showGear; sfx.play('select'); syncStage(); preview.showcase(); say(showGear ? 'Armed and ready.' : 'Just me.'); },
  }, icon('bag'));
  const poseBtn = h<HTMLButtonElement>('button.btn.sm.icon.hc-tool', {
    title: 'Strike a pose', 'aria-label': 'Strike a pose', onclick: () => { sfx.play('whoosh'); preview.showcase(); burst(); },
  }, icon('replay'));
  const prev = h<HTMLButtonElement>('button.arrow.l', { title: 'Previous', 'aria-label': 'Previous', onclick: () => cycle(-1) }, icon('play', 'flip'));
  const nextPick = h<HTMLButtonElement>('button.arrow.r', { title: 'Next', 'aria-label': 'Next', onclick: () => cycle(1) }, icon('play'));
  const scene = h('div.hc-scene',
    null, sky, h('i.hc-shade'), h('i.hc-rays'), box, burstEl, bubble, prev, nextPick,
    h('div.hc-tools', null, poseBtn, gearBtn),
    h('div.hc-plate', null, plateName, plateTags));

  const back = h<HTMLButtonElement>('button.btn.back', { title: 'Back', 'aria-label': 'Back', onclick: () => { sfx.play('back'); go(step - 1); } }, icon('back'));
  const next = h<HTMLButtonElement>('button.btn.primary.next', { onclick: () => advance() });
  const save = h<HTMLButtonElement>('button.btn.save', { title: 'Save', 'aria-label': 'Save', onclick: () => finish() }, icon('check'), h('span.lbl', null, 'Save'));
  const stage = h('section.hc-stage', null, scene, h('footer.hc-nav', null, back, save, next));

  // --- Chapters along the top and the panel ---------------------------------------------------
  const tabs = h('nav.hc-tabs', { 'aria-label': 'Steps' });
  const panelHead = h('div.hc-head');
  const panelBody = h('div.hc-body');
  const panel = h('section.hc-panel.frame', null, panelHead, panelBody);

  const name = h<HTMLInputElement>('input.name.hc-name-in', {
    value: c.name, maxlength: String(NAME_MAX), placeholder: 'Your name', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done',
    'aria-label': 'Name',
    oninput: () => { c.name = name.value; name.classList.remove('shake'); syncPlate(); },
    onchange: () => { if (cleanName(name.value)) say(`${cleanName(name.value)}! Remember it.`); },
    onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); advance(); } },
  });

  // --- Stage helpers ---------------------------------------------------------------------------
  let sayTimer = 0;
  let lastSay = 0;
  /** A speech bubble over the hero. `soft` lines skip if one was said a moment ago (rapid swatch taps). */
  function say(text: string, soft = false): void {
    const now = performance.now();
    if (soft && now - lastSay < 2600) return;
    lastSay = now;
    bubble.textContent = text;
    bubble.classList.remove('pop');
    void bubble.offsetWidth;
    bubble.classList.add('pop');
    clearTimeout(sayTimer);
    sayTimer = window.setTimeout(() => bubble.classList.remove('pop'), 2600);
  }

  /** A ring of pixel sparks bursting off the hero. */
  function burst(col = 0xffe58f): void {
    burstEl.style.setProperty('--bc', css(col));
    burstEl.classList.remove('go');
    void burstEl.offsetWidth;
    burstEl.classList.add('go');
  }

  /** Species, body and style as coloured tags with their icons (body and style can share a name). */
  function heroTags(): HTMLElement[] {
    const sp = SPECIES[c.look.species], f = FORMS[c.form], s = FIGHT_STYLES[styleOf()];
    const tag = (col: number, ic: IconName, label: string) => h('span', { style: { '--tc': css(col) } }, icon(ic), label);
    return [tag(SPECIES_TINT[sp.id], 'paw', sp.name), tag(f.color, 'body', f.name), tag(s.color, STYLE_ICON[s.id], s.name)];
  }

  function syncPlate(): void {
    const n = cleanName(c.name);
    plateName.textContent = n || 'Your legend';
    plateName.classList.toggle('empty', !n);
    plateTags.replaceChildren(...heroTags());
    applyBackdrop(sky, c.look.backdrop);
  }

  function syncStage(): void {
    preview.set(showGear ? c : bare(c));
    gearBtn.classList.toggle('on', showGear);
    gearBtn.setAttribute('aria-pressed', String(showGear));
    gearBtn.title = gearBtn.ariaLabel = showGear ? 'Hide gear' : 'Show gear';
    syncPlate();
  }

  /** The camera leans in on the face while styling it. */
  const zoom = (on: boolean) => scene.classList.toggle('zoom', on);

  function syncNav(): void {
    tabs.replaceChildren(...steps.map((s, i) => {
      const locked = i > reached;
      const done = !locked && i !== step && (editing || i < reached || i < step);
      return h<HTMLButtonElement>(`button.hc-tab${i === step ? '.on' : ''}${locked ? '.locked' : ''}${done ? '.done' : ''}`, {
        disabled: locked, 'aria-current': i === step ? 'step' : null, title: s.label,
        onclick: () => { if (i !== step) sfx.play('select'); go(i); },
      }, h('i', null, icon(locked ? 'lock' : s.icon)), h('span', null, s.label));
    }), cb.onCancel ? h('button.btn.icon.sm.hc-close', { title: 'Close', 'aria-label': 'Close', onclick: () => { sfx.play('back'); cb.onCancel!(); } }, icon('close')) : '');
    back.hidden = step === 0;
    const last = step === LAST;
    next.replaceChildren(...(last
      ? [icon(editing ? 'check' : 'crown'), h('span', null, editing ? 'Save' : 'Finish')]
      : [h('span', null, 'Next'), h('small', null, steps[step + 1].label), icon('next')]));
    next.classList.toggle('go', last && !editing);
    save.hidden = !editing || last;
    prev.hidden = nextPick.hidden = !cycler;
  }

  function go(i: number): void {
    if (i < 0 || i > reached || i === step) return;
    const dir = i > step ? 1 : -1;
    step = i;
    render(dir);
  }

  function advance(): void {
    if (finale) { done(); return; }
    if (step === LAST) { finish(); return; }
    if (step === NAME && !cleanName(name.value)) { nameNeeded(); return; }
    sfx.play('select');
    reached = Math.max(reached, step + 1);
    go(step + 1);
  }

  function nameNeeded(): void {
    if (step !== NAME) { reached = Math.max(reached, NAME); step = NAME; render(-1); }
    name.classList.remove('shake');
    void name.offsetWidth;
    name.classList.add('shake');
    name.focus();
    sfx.play('back');
    say('Wait, what do they call me?');
  }

  function finish(): void {
    const n = cleanName(name.value);
    if (!n) { nameNeeded(); return; }
    c = { ...c, name: n };
    if (editing) { sfx.play('confirm'); cb.onDone(c); return; }
    reveal();
  }

  const done = () => { sfx.play('confirm'); cb.onDone(c); };

  /** A brand new hero: the reveal, with their entrance played on their own backdrop. */
  function reveal(): void {
    sfx.play('revealLegendary');
    const art = h('div.hc-fin-art');
    const p = new Preview(c, 80, 90, { autoplay: true, pedestal: true, fit: art });
    art.append(p.el);
    const bg = h('div.hc-fin-card.frame', null, h('div.hc-fin-sky'), art);
    applyBackdrop(bg.firstElementChild as HTMLElement, c.look.backdrop);
    const el = h('div.hc-finale', { role: 'dialog', 'aria-label': 'A new legend' },
      h('i.hc-fin-rays'),
      bg,
      h('div.hc-fin-text', null,
        h('div.ribbon.hc-fin-rib', null, h('span', null, 'A new legend rises')),
        h('b.hc-fin-name', null, c.name),
        h('div.hc-ptags.hc-fin-tags', null, ...heroTags()),
        h('p.hc-fin-cry', null, `“${STYLE_LINE[styleOf()]}”`),
        h('button.btn.primary.big.go.hc-fin-go', { onclick: () => done() }, icon('swords'), h('span', null, 'Enter the arena'))));
    finale = { el, preview: p };
    root.append(el);
    window.setTimeout(() => { if (finale) { p.playEntrance(entranceOf(c.look, true)); } }, 650);
    window.setTimeout(() => { if (finale) sfx.play('entCheer'); }, 900);
  }

  /** Stage arrows: flip through the open step's options. */
  function cycle(dir: 1 | -1): void {
    if (!cycler) return;
    sfx.play('select');
    cycler(dir);
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
    burst(SPECIES_TINT[id]);
    say(SPECIES_LINE[id]);
  }

  function pickForm(id: FormId): void {
    if (c.form === id) return;
    c = { ...c, form: id };
    syncStage();
    preview.showcase();
    burst(FORMS[id].color);
    say(FORM_LINE[id]);
  }

  const styleOf = (): FightStyleId => c.style ?? 'balanced';

  function pickStyle(id: FightStyleId): void {
    if (styleOf() === id) return;
    c = { ...c, style: id };
    syncPlate();
    preview.showcase();
    burst(FIGHT_STYLES[id].color);
    say(STYLE_LINE[id]);
  }

  function pickBackdrop(i: number): void {
    if ((c.look.backdrop ?? 0) === i) return;
    c = { ...c, look: { ...c.look, backdrop: i } };
    syncPlate();
    burst();
    say(pickLine(BACKDROP_LINES), true);
  }

  function clearCards(): void {
    for (const p of cards) p.dispose();
    cards = [];
  }

  /** A still portrait of a build, fitted into a box. */
  function portrait(build: CharacterBuild, w: number, ht: number, ground: number, cls = 'portrait'): HTMLElement {
    const el = h(`div.${cls}`);
    const p = new Preview(build, w, ht, { still: true, ground, fit: el });
    cards.push(p);
    el.append(p.el);
    return el;
  }

  /** A pick card: art on top (tinted glow), name and a sub line under it. */
  const card = (art: HTMLElement, label: string, sub: string | Node, tint: number, pick: () => void, cls = '') =>
    h<HTMLButtonElement>(`button.hc-card${cls}`, { style: { '--tint': css(tint) }, onclick: pick },
      art, h('b', null, label), sub ? h('small', null, sub) : null);

  /** Scrolls the step body just enough to show `el` (never the page itself). */
  const show = (el: HTMLElement) => {
    const b = panelBody.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top < b.top) panelBody.scrollTop -= b.top - r.top + 4;
    else if (r.bottom > b.bottom) panelBody.scrollTop += r.bottom - b.bottom + 4;
  };

  /** Marks the picked card in a grid. */
  const mark = (tiles: Map<string, HTMLElement>, cur: string) => {
    for (const [id, t] of tiles) {
      const on = id === cur;
      t.classList.toggle('on', on);
      t.setAttribute('aria-pressed', String(on));
      if (on) show(t);
    }
  };

  /** The info strip under a grid: big name, a sub line and whatever else. */
  const info = (title: string, col: number, sub: string, ...rest: (Node | string | null)[]) =>
    h('div.hc-info', { style: { '--tint': css(col) } },
      h('div.hc-info-head', null, h('b', null, title), sub ? h('span', null, sub) : null), ...rest);

  // --- Steps -----------------------------------------------------------------------------------
  function speciesStep(): HTMLElement[] {
    const detail = h('div.hc-info-wrap');
    const tiles = new Map<string, HTMLElement>();
    const grid = h('div.hc-grid.species');
    for (const id of SPECIES_IDS) {
      const look: Appearance = { ...c.look, species: id, skin: id === c.look.species ? c.look.skin : 0 };
      const t = card(portrait({ ...bare(c), form: 'balanced', look }, 44, 64, 3), SPECIES[id].name, '', SPECIES_TINT[id], () => {
        if (c.look.species === id) return;
        sfx.play('select');
        pickSpecies(id);
        refresh();
      });
      tiles.set(id, t);
      grid.append(t);
    }
    cycler = (dir) => {
      const i = SPECIES_IDS.indexOf(c.look.species);
      pickSpecies(SPECIES_IDS[(i + dir + SPECIES_IDS.length) % SPECIES_IDS.length]);
    };
    refresh = () => {
      const sp = SPECIES[c.look.species];
      mark(tiles, c.look.species);
      detail.replaceChildren(info(sp.name, SPECIES_TINT[sp.id], '', h('p', null, sp.blurb),
        h('div.hc-chips', null, h('small', null, 'Bodies'), ...sp.forms.map((f) => h('span', { style: { '--tc': css(FORMS[f].color) } }, FORMS[f].name)))));
    };
    refresh();
    return [grid, detail];
  }

  function formStep(): HTMLElement[] {
    const detail = h('div.hc-info-wrap');
    const tiles = new Map<string, HTMLElement>();
    const grid = h('div.hc-grid.forms');
    const forms = SPECIES[c.look.species].forms;
    for (const id of forms) {
      const f = FORMS[id];
      const t = card(portrait({ ...bare(c), form: id }, 44, 64, 3), f.name, '', f.color, () => {
        if (c.form === id) return;
        sfx.play('select');
        pickForm(id);
        refresh();
      });
      tiles.set(id, t);
      grid.append(t);
    }
    grid.style.setProperty('--n', String(forms.length));
    cycler = (dir) => {
      const i = forms.indexOf(c.form);
      pickForm(forms[(i + dir + forms.length) % forms.length]);
    };
    refresh = () => {
      const f = FORMS[c.form];
      mark(tiles, c.form);
      detail.replaceChildren(info(f.name, f.color, f.title, h('p', null, f.blurb),
        h('div.bars', { style: { '--seg': css(f.color) } }, ...FORM_STATS.flatMap(([k, label, fmt]) => {
          const v = f.base[k] as number;
          const [lo, hi] = RANGE.get(k)!;
          return segRow(label, hi > lo ? 3 + Math.round(((v - lo) / (hi - lo)) * 7) : 6, fmt(v));
        }))));
    };
    refresh();
    return [grid, detail];
  }

  function styleStep(): HTMLElement[] {
    const detail = h('div.hc-info-wrap');
    const tiles = new Map<string, HTMLElement>();
    const grid = h('div.hc-grid.styles');
    for (const id of FIGHT_STYLE_IDS) {
      const s = FIGHT_STYLES[id];
      const t = card(h('div.hc-glyph', { style: { color: css(s.color) } }, icon(STYLE_ICON[id])), s.name, '', s.color, () => {
        if (styleOf() === id) return;
        sfx.play('select');
        pickStyle(id);
        refresh();
      });
      tiles.set(id, t);
      grid.append(t);
    }
    cycler = (dir) => {
      const i = FIGHT_STYLE_IDS.indexOf(styleOf());
      pickStyle(FIGHT_STYLE_IDS[(i + dir + FIGHT_STYLE_IDS.length) % FIGHT_STYLE_IDS.length]);
    };
    refresh = () => {
      const s = FIGHT_STYLES[styleOf()];
      mark(tiles, s.id);
      detail.replaceChildren(info(s.name, s.color, s.title,
        h('p.hc-cry', null, `“${STYLE_LINE[s.id]}”`),
        h('p', null, s.blurb),
        h('div.bars', { style: { '--seg': css(s.color) } }, ...STYLE_BARS.flatMap((label, k) => segRow(label, s.bars[k], String(s.bars[k]))))));
    };
    refresh();
    return [grid, detail];
  }

  /** Look: a list of what to style on the left, the options on the right. */
  function lookStep(): HTMLElement[] {
    const cats = h('div.hc-cats', { role: 'tablist' });
    const pane = h('div.hc-pane');
    const sp = SPECIES[c.look.species];
    const styles: readonly string[] | null = sp.hair ? HAIR_STYLES : sp.styles ?? null;
    type Def = { id: LookCat; label: string; colors?: number[]; names?: readonly string[]; get(): number; set(i: number): void };
    const defs: Def[] = [
      { id: 'skin', label: SKIN_LABEL[sp.id] ?? 'Skin', colors: sp.skins, get: () => c.look.skin, set: (i) => setLook({ skin: i }) },
      { id: 'eyes', label: 'Eyes', colors: EYE_COLORS, get: () => c.look.eyes, set: (i) => setLook({ eyes: i }) },
      ...(styles ? [{ id: 'hair' as const, label: sp.hair ? 'Hair' : sp.styleLabel ?? 'Style', names: styles, get: () => c.look.hair % styles.length, set: (i: number) => setLook({ hair: i }) }] : []),
      { id: 'hairColor', label: sp.hair ? 'Hair colour' : `${sp.styleLabel ?? 'Crown'} colour`, colors: HAIR_COLORS, get: () => c.look.hairColor, set: (i) => setLook({ hairColor: i }) },
      { id: 'outfit', label: 'Outfit', colors: OUTFIT_COLORS, get: () => c.look.outfit, set: (i) => setLook({ outfit: i }) },
      { id: 'accent', label: 'Trims', colors: ACCENT_COLORS, get: () => c.look.accent, set: (i) => setLook({ accent: i }) },
    ];
    if (!defs.some((d) => d.id === lookCat)) lookCat = 'skin';
    const cur = () => defs.find((d) => d.id === lookCat)!;
    const choose = (d: Def, i: number) => {
      if (i === d.get()) return;
      sfx.play('select');
      d.set(i);
      burst(d.colors ? d.colors[i] : undefined);
      say(pickLine(LOOK_LINES), true);
      refresh();
    };
    const drawCats = () => cats.replaceChildren(...defs.map((d) => h<HTMLButtonElement>(`button.hc-cat${d.id === lookCat ? '.on' : ''}`, {
      role: 'tab', 'aria-selected': String(d.id === lookCat),
      onclick: () => { if (d.id === lookCat) return; sfx.play('select'); lookCat = d.id; drawCats(); drawPane(); zoom(FACE.has(d.id)); },
    }, h('span', null, d.label), d.colors ? h('i.hc-chip', { style: { '--sw': hex(d.colors[d.get()]) } }) : h('em', null, d.names![d.get()]))));
    const drawPane = () => {
      clearCards();
      const d = cur();
      if (d.names) {
        pane.replaceChildren(h('div.hc-grid.hairs', null, ...d.names.map((label, i) => {
          const t = card(portrait({ ...bare(c), look: { ...c.look, hair: i } }, 30, 26, -36, 'portrait.bust'), label, '', HAIR_COLORS[c.look.hairColor], () => choose(d, i));
          t.classList.toggle('on', i === d.get());
          return t;
        })));
        return;
      }
      pane.replaceChildren(h('div.hc-swatches', null, ...d.colors!.map((col, i) => h(`button.swatch.hc-sw${i === d.get() ? '.on' : ''}`, {
        style: { '--sw': hex(col) }, title: `${d.label} ${i + 1}`, 'aria-label': `${d.label} ${i + 1}`, 'aria-pressed': String(i === d.get()),
        onclick: () => choose(d, i),
      }))));
    };
    cycler = (dir) => { const d = cur(); const n = d.colors?.length ?? d.names!.length; choose(d, (d.get() + dir + n) % n); };
    refresh = () => { drawCats(); drawPane(); };
    refresh();
    zoom(FACE.has(lookCat));
    headTool = h('button.btn.sm.lucky', { title: 'Random colours and hair', onclick: () => {
      const r = randomAppearance();
      sfx.play('select');
      setLook({ ...r, species: c.look.species, skin: Math.floor(Math.random() * SPECIES[c.look.species].skins.length), backdrop: c.look.backdrop, entrance: c.look.entrance }, true);
      burst();
      say('Whoa. New me!');
      refresh();
    } }, icon('dice'), h('span', null, 'Surprise me'));
    return [h('div.hc-look', null, cats, pane)];
  }

  function nameStep(): HTMLElement[] {
    const dice = h('button.btn.icon.dice', { title: 'Random name', 'aria-label': 'Random name', onclick: () => {
      name.value = randomName(); c.name = name.value; name.classList.remove('shake'); sfx.play('select');
      syncPlate();
      say(`${name.value}? ...I like it.`);
    } }, icon('dice'));
    const chant = h('button.btn.sm.hc-chant', { onclick: () => {
      const n = cleanName(name.value);
      if (!n) { nameNeeded(); return; }
      sfx.play('entCheer');
      burst();
      say(`${n.toUpperCase()}! ${n.toUpperCase()}!`);
    } }, icon('friends'), 'Hear the crowd');
    const sp = SPECIES[c.look.species], f = FORMS[c.form], s = FIGHT_STYLES[styleOf()];
    const fact = (label: string, value: string, col?: number) =>
      h('span', null, h('small', null, label), h('b', col === undefined ? null : { style: { color: css(col) } }, value));
    return [h('div.hc-name', null,
      h('div.hc-banner', null, h('div.hc-banner-in', null, name, dice)),
      h('p.hc-hint', null, `Up to ${NAME_MAX} letters, or roll the dice.`),
      chant,
      h('div.hc-facts', null,
        fact('Species', sp.name, SPECIES_TINT[sp.id]),
        fact('Body', f.name, f.color),
        fact('Style', s.name, s.color),
        fact('Fights with', gearOf(c.gear.main).name))),
    ];
  }

  function backdropStep(): HTMLElement[] {
    const tiles = new Map<string, HTMLElement>();
    const grid = h('div.hc-grid.scenes');
    BACKDROPS.forEach((label, i) => {
      const art = h('div.hc-scene-art');
      applyBackdrop(art, i);
      const t = card(art, label, '', 0xffe58f, () => {
        if ((c.look.backdrop ?? 0) === i) return;
        sfx.play('select');
        pickBackdrop(i);
        refresh();
      });
      tiles.set(String(i), t);
      grid.append(t);
    });
    cycler = (dir) => pickBackdrop(((c.look.backdrop ?? 0) + dir + BACKDROPS.length) % BACKDROPS.length);
    refresh = () => mark(tiles, String(c.look.backdrop ?? 0));
    refresh();
    return [grid];
  }

  /** Entrances: tap one to watch it on the stage; owned ones are picked, the rest can be bought here or in the Shop. */
  function entranceStep(): HTMLElement[] {
    const detail = h('div.hc-info-wrap');
    const tiles = new Map<string, HTMLElement>();
    const grid = h('div.hc-grid.entrances');
    let shown: EntranceId = entranceOf(c.look, true);
    let armed = false;
    const draw = () => {
      for (const id of ENTRANCE_IDS) {
        const e = ENTRANCES[id], mine = ownsEntrance(id);
        const t = tiles.get(id)!;
        t.classList.toggle('locked', !mine);
        t.querySelector('small')!.replaceChildren(...(mine ? [ENTRANCE_TIER[e.tier]] : [icon('lock'), ` ${e.price}`]));
      }
      const e = ENTRANCES[shown], mine = ownsEntrance(shown);
      const buy = mine ? null : h<HTMLButtonElement>(`button.btn.sm.buy-btn${gems() >= e.price ? '' : '.short'}`, {
        title: gems() >= e.price ? `Buy for ${e.price} gems` : 'Not enough gems yet: win fights to earn more',
        onclick: () => {
          if (gems() < e.price) { sfx.play('back'); return; }
          if (!armed) { armed = true; sfx.play('select'); buy!.replaceChildren(h('span', null, 'Buy?'), gemTag(e.price)); return; }
          if (!buyEntrance(shown)) return;
          sfx.play('revealMythic');
          pick(shown);
        },
      }, h('span', null, 'Unlock'), gemTag(e.price));
      detail.replaceChildren(info(e.name, e.color, mine ? ENTRANCE_TIER[e.tier] : `${ENTRANCE_TIER[e.tier]} · locked`,
        h('p', null, e.blurb),
        h('div.ent-foot', null, h('button.btn.sm', { onclick: () => { sfx.play('select'); preview.playEntrance(shown); } }, icon('replay'), 'Watch again'), buy)));
    };
    const pick = (id: EntranceId) => {
      shown = id;
      armed = false;
      if (ownsEntrance(id)) { c = { ...c, look: { ...c.look, entrance: id } }; }
      preview.playEntrance(id);
      refresh();
    };
    for (const id of ENTRANCE_IDS) {
      const e = ENTRANCES[id];
      const t = card(h('div.hc-glyph', { style: { color: css(e.color) } }, icon(ENTRANCE_ICON[id])), e.name, h('small'), e.color,
        () => { sfx.play('select'); pick(id); }, `.ent.r-${e.tier}`);
      tiles.set(id, t);
      grid.append(t);
    }
    refresh = () => {
      mark(tiles, entranceOf(c.look, true));
      for (const [id, t] of tiles) t.classList.toggle('peek', id === shown);
      draw();
    };
    refresh();
    preview.playEntrance(shown);
    return [grid, detail];
  }

  /** Level, XP and the stat points: + and - per stat, Reset gives every point back. */
  function statsStep(): HTMLElement[] {
    const box = h('div.train');
    const draw = () => {
      const lv = levelOf(progress().xp);
      const earned = pointsAt(heroLevel());
      const left = earned - spentPoints(c.train);
      const base = { ...FORMS[c.form].base };
      applyTraining(base, c.train);
      const plain = { ...FORMS[c.form].base };
      box.replaceChildren(
        h('div.train-head', null,
          h('div.lv-badge', null, h('small', null, 'LV'), h('b', null, String(lv.level))),
          h('div.train-xp', null,
            h('div.xp-bar', null, h('i', { style: { '--w': `${Math.round((lv.into / lv.need) * 100)}%` } })),
            h('small', null, `${lv.into} / ${lv.need} XP to level ${lv.level + 1} · +${POINTS_PER_LEVEL} points per level`)),
          h(`div.train-left${left > 0 ? '.has' : ''}`, null, h('b', null, String(Math.max(0, left))), h('small', null, left === 1 ? 'point' : 'points'))),
        h('div.train-rows', null, ...TRAIN_IDS.map((id) => {
          const n = c.train?.[id] ?? 0;
          const worth = nextPointWorth(n);
          const [stat, , fmt] = TRAIN_VIEW[id];
          const gain = (base[stat] as number) - (plain[stat] as number);
          const add = (d: 1 | -1) => {
            const now = c.train?.[id] ?? 0;
            if (d > 0 && left <= 0) { sfx.play('back'); return; }
            if (d < 0 && now <= 0) return;
            sfx.play(d > 0 ? 'equip' : 'select');
            const t = { ...c.train, [id]: now + d };
            if (!t[id]) delete t[id];
            c = { ...c, train: Object.keys(t).length ? t : undefined };
            if (d > 0) { burst(0x62d47a); say(pickLine(STAT_LINES), true); }
            draw();
          };
          return h(`div.train-row${n ? '.on' : ''}`, { title: TRAIN[id].blurb },
            h('div.train-name', null, h('b', null, TRAIN[id].name), h('small', null, perPoint(id, worth))),
            h('div.train-val', null, h('b', null, fmt(base[stat] as number)), gain ? h('small', null, `+${fmtGain(stat, gain)}`) : null),
            h('div.train-n', null,
              h<HTMLButtonElement>('button.btn.icon.sm', { 'aria-label': `Take a point from ${TRAIN[id].name}`, disabled: n <= 0, onclick: () => add(-1) }, h('span', null, '−')),
              h('b', null, String(n)),
              h<HTMLButtonElement>(`button.btn.icon.sm${left > 0 ? '.primary' : ''}`, { 'aria-label': `Add a point to ${TRAIN[id].name}`, disabled: left <= 0, onclick: () => add(1) }, h('span', null, '+'))));
        })),
        earned ? '' : h('p.train-hint', null, 'Win fights to earn XP. The Arena Cup pays the most.'));
    };
    draw();
    headTool = h('button.btn.sm', { title: 'Take every point back', onclick: () => {
      if (!spentPoints(c.train)) return;
      sfx.play('back');
      c = { ...c, train: undefined };
      draw();
    } }, icon('undo'), 'Reset');
    return [box];
  }

  function render(dir = 0): void {
    clearCards();
    refresh = () => {};
    cycler = null;
    headTool = null;
    zoom(false);
    const s = steps[step];
    const body = step === SPECIES_STEP ? speciesStep() : step === BODY ? formStep() : step === STYLE ? styleStep()
      : step === LOOK ? lookStep() : step === NAME ? nameStep() : step === BACKDROP ? backdropStep() : step === ENTRANCE ? entranceStep() : statsStep();
    panelBody.replaceChildren(...body);
    panelBody.dataset.step = s.label.toLowerCase();
    panelHead.replaceChildren(
      h('div.hc-title', null,
        h('div.hc-kicker', null, h('i', null, icon(s.icon)), editing ? null : h('small', null, `Step ${step + 1} of ${steps.length}`)),
        h('div.ribbon', null, h('span', null, s.title)),
        headTool),
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
    if (finale) { if (e.key === 'Enter') { e.preventDefault(); done(); } return; }
    if (e.key === 'ArrowLeft' && cycler) { e.preventDefault(); cycle(-1); return; }
    if (e.key === 'ArrowRight' && cycler) { e.preventDefault(); cycle(1); return; }
    if (e.target instanceof HTMLButtonElement) return;
    if (e.key === 'Enter') { e.preventDefault(); advance(); }
    else if (e.key === 'Escape' && cb.onCancel) { sfx.play('back'); cb.onCancel(); }
  };
  window.addEventListener('keydown', onKey);

  const root = h('div.scr.hc', { role: 'dialog', 'aria-label': editing ? 'Edit your hero' : 'Create your hero' }, tabs, stage, panel);
  syncStage();
  render();
  // A hello from the hero when the room opens.
  window.setTimeout(() => say(editing ? 'Back for a new look?' : 'Hey! Let’s make me a legend.'), 450);
  return {
    el: root,
    dispose: () => {
      preview.dispose();
      finale?.preview.dispose();
      clearCards();
      clearTimeout(sayTimer);
      window.removeEventListener('keydown', onKey);
    },
  };
}
