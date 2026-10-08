import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/pixelify-sans/700.css';
import './ui/styles.css';
import { sfx } from './audio/sfx';
import { sanitizeAppearance } from './character/appearance';
import { generateRival, loadCharacter, newCharacter, saveCharacter, type PlayerCharacter } from './character/profile';
import { BattleView } from './render/battleView';
import { THEMES, type Theme } from './render/arenaArt';
import { Screen } from './render/screen';
import { Battle } from './sim/battle';
import { DEFAULT_BUILDS, sanitizeBuild } from './sim/loadout';
import type { BattleEvent } from './sim/types';
import { creatorSheet } from './ui/creator';
import { save, store } from './ui/dom';
import { setupPhoneFullscreen } from './ui/fullscreen';
import { gearSheet } from './ui/gear';
import { Hud } from './ui/hud';
import { Menu, type Record as WinLoss } from './ui/menu';
import { versionBadge } from './ui/patchNotes';
import { resultsSheet } from './ui/results';
import { settingsSheet } from './ui/settings';

type State = 'menu' | 'intro' | 'battle' | 'results';

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const screen = new Screen(app);
const view = new BattleView(screen);

// --- Saved state -------------------------------------------------------------------
let player: PlayerCharacter | null = loadCharacter();
let rival: PlayerCharacter = loadRival() ?? generateRival(player?.name);
let record = store<WinLoss>('al.record', { w: 0, l: 0 });
let speed = [1, 2, 4].includes(store<number>('al.speed', 1)) ? store<number>('al.speed', 1) : 1;
let soundOn = store<boolean>('al.sound', true);
let quotesOn = store<boolean>('al.quotes', true) !== false;
// Arena for every fight and the menu backdrop: Skygrove Isle unless the player picks another (or random).
let arenaPick = store<string>('al.arena', 'isle');
if (arenaPick !== 'random' && !THEMES.some((t) => t.id === arenaPick)) arenaPick = 'isle';
const arenaFor = (seed: number): Theme => THEMES.find((t) => t.id === arenaPick) ?? THEMES[seed % THEMES.length];
sfx.setMuted(!soundOn);

function loadRival(): PlayerCharacter | null {
  const raw = store<Record<string, unknown> | null>('al.rival', null);
  if (!raw || typeof raw.name !== 'string') return null;
  const b = sanitizeBuild(raw, DEFAULT_BUILDS[1]);
  return { ...b, look: sanitizeAppearance(raw.look) };
}
function setRival(r: PlayerCharacter): void {
  rival = r;
  save('al.rival', r);
}
save('al.rival', rival);

// --- UI pieces ---------------------------------------------------------------------------
let state: State = 'menu';
let sheet: { el: HTMLElement; dispose(): void } | null = null;
let resultsEl: HTMLElement | null = null;

const hud = new Hud({
  onSpeed: (s) => { speed = s; save('al.speed', s); view.speed = s; hud.setSpeed(s); sfx.play('ui'); },
  onPause: () => togglePause(),
  onExit: () => { sfx.play('ui'); toMenu(); },
  onSettings: () => openSettings(),
}, view);
hud.show(false);
hud.setBubbles(quotesOn);

const menu = new Menu({
  onFight: () => startFight(),
  onEditLook: () => openCreator(),
  onGear: () => openGear(),
  onNewRival: () => { sfx.play('ui'); setRival(generateRival(player?.name)); refreshMenu(); },
  onSound: () => {
    setSound(!soundOn);
    sfx.play('ui');
  },
  onSettings: () => openSettings(),
});

function setSound(on: boolean): void {
  soundOn = on;
  save('al.sound', on);
  sfx.setMuted(!on);
  menu.setSound(on);
}

function openSettings(): void {
  closeSheet();
  sfx.play('ui');
  const arenas = THEMES.map((t) => ({ id: t.id, name: t.name, sky: t.sky, floor: t.floor }));
  sheet = settingsSheet({ quotes: quotesOn, sound: soundOn, arena: arenaPick }, arenas, (s) => {
    if (s.quotes !== quotesOn) {
      quotesOn = s.quotes;
      save('al.quotes', quotesOn);
      hud.setBubbles(quotesOn);
    }
    if (s.sound !== soundOn) setSound(s.sound);
    if (s.arena !== arenaPick) {
      arenaPick = s.arena;
      save('al.arena', arenaPick);
      if (view.battle) view.setTheme(arenaFor(view.battle.seed));
    }
  }, () => closeSheet());
  ui.append(sheet.el);
}
menu.setSound(soundOn);
const badge = versionBadge(__APP_VERSION__, () => ui);
ui.append(menu.el, hud.el, badge);

function refreshMenu(): void {
  if (player) menu.set(player, rival, record);
}

function closeSheet(): void {
  sheet?.dispose();
  sheet?.el.remove();
  sheet = null;
}

function openCreator(first = false): void {
  closeSheet();
  sfx.play('ui');
  sheet = creatorSheet(player ?? newCharacter(), {
    onDone: (c) => {
      player = c;
      saveCharacter(c);
      closeSheet();
      refreshMenu();
    },
    onCancel: first ? undefined : () => closeSheet(),
  });
  ui.append(sheet.el);
}

function openGear(): void {
  if (!player) return;
  closeSheet();
  sfx.play('ui');
  sheet = gearSheet(player, {
    onChange: (c) => { player = c; saveCharacter(c); },
    onClose: () => { closeSheet(); refreshMenu(); },
  });
  ui.append(sheet.el);
}

// --- Background duel behind the menu -------------------------------------------------------
let demoWait = 0;
function startDemo(): void {
  const a = generateRival(), b = generateRival(a.name);
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const battle = new Battle({ seed, fighters: [a, b] });
  view.quiet = true;
  view.hold = false;
  view.paused = false;
  view.speed = 1;
  view.listener = { onEnd: () => { demoWait = 1.5; } };
  view.start(battle, arenaFor(seed));
}

function toMenu(): void {
  state = 'menu';
  closeSheet();
  resultsEl?.remove();
  resultsEl = null;
  hud.show(false);
  menu.el.hidden = false;
  badge.hidden = false;
  refreshMenu();
  startDemo();
}

// --- A fight -----------------------------------------------------------------------------------
let introT = 0;
let countdown = -1;
let battle: Battle | null = null;

function startFight(): void {
  if (!player) { openCreator(true); return; }
  sfx.unlock();
  sfx.play('ui');
  closeSheet();
  resultsEl?.remove();
  resultsEl = null;
  menu.dispose();
  menu.el.hidden = true;
  badge.hidden = true;
  const seed = (Math.random() * 2 ** 32) >>> 0;
  battle = new Battle({ seed, fighters: [player, rival] });
  const theme = arenaFor(seed);
  view.quiet = false;
  view.hold = true;
  view.paused = false;
  view.speed = speed;
  view.listener = { onEvent: onBattleEvent, onEnd: onBattleEnd };
  view.start(battle, theme);
  hud.setup(battle, speed);
  hud.setPaused(false);
  hud.show(true);
  hud.showBanner(`${player.name} VS ${rival.name}`, theme.name, 0);
  state = 'intro';
  introT = 0;
  countdown = -1;
}

function onBattleEvent(e: BattleEvent): void {
  hud.onEvent(e);
}

function onBattleEnd(b: Battle): void {
  if (state !== 'battle') return;
  state = 'results';
  if (b.winner === 0) record = { ...record, w: record.w + 1 };
  else if (b.winner === 1) record = { ...record, l: record.l + 1 };
  save('al.record', record);
  if (b.winner === 0) sfx.play('win');
  const reason = b.fighters.some((f) => !f.alive) ? 'ko' : 'time';
  resultsEl = resultsSheet(b, reason, true, {
    onRematch: () => startFight(),
    onNewRival: () => { setRival(generateRival(player?.name)); startFight(); },
    onMenu: () => { sfx.play('ui'); toMenu(); },
  });
  ui.append(resultsEl);
}

function togglePause(): void {
  if (state !== 'battle') return;
  view.paused = !view.paused;
  hud.setPaused(view.paused);
  sfx.play('ui');
}

/** Intro: names, sprite warm-up, then 3-2-1. The sim holds until FIGHT. */
function intro(dt: number): void {
  introT += dt;
  const ready = view.warm(6);
  if (countdown < 0) {
    if (introT > 1.3 && ready) { countdown = 3; introT = 0; hud.showBanner('3', '', 0); sfx.play('ui'); }
    return;
  }
  if (introT >= 0.55) {
    introT = 0;
    countdown--;
    if (countdown > 0) { hud.showBanner(String(countdown), '', 0); sfx.play('ui'); }
    else {
      hud.showBanner('FIGHT!', '', 0.8);
      sfx.play('start');
      view.hold = false;
      state = 'battle';
    }
  }
}

// --- Loop ------------------------------------------------------------------------------------
let last = 0;
function loop(now: number): void {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  if (state === 'intro') intro(dt);
  if (state === 'menu') {
    view.warm(3);
    if (demoWait > 0 && (demoWait -= dt) <= 0) startDemo();
  }
  view.frame(dt);
  if (state !== 'menu') hud.update(view.paused ? 0 : dt * speed);
  requestAnimationFrame(loop);
}

// --- Input -----------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || sheet) return;
  if (state === 'menu' && e.key === 'Enter') startFight();
  else if (state === 'battle') {
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'Escape') toMenu();
    else if (e.key === '1' || e.key === '2' || e.key === '3') {
      speed = [1, 2, 4][Number(e.key) - 1];
      save('al.speed', speed);
      view.speed = speed;
      hud.setSpeed(speed);
    }
  } else if (state === 'results' && e.key === 'Enter') startFight();
});
// Browsers only start audio after a gesture.
window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
window.addEventListener('keydown', () => sfx.unlock(), { capture: true, once: true });
setupPhoneFullscreen();

// --- Boot --------------------------------------------------------------------------------------
toMenu();
if (!player) openCreator(true);
requestAnimationFrame((t) => {
  last = t;
  document.getElementById('boot')?.remove();
  requestAnimationFrame(loop);
});

// Handle for poking at the running game from the console.
(window as unknown as { game?: unknown }).game = { view, get battle() { return battle; } };
