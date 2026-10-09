import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/pixelify-sans/700.css';
import './ui/styles.css';
import { music } from './audio/music';
import { sfx } from './audio/sfx';
import { sanitizeAppearance } from './character/appearance';
import { generateRival, loadCharacter, newCharacter, saveCharacter, type PlayerCharacter } from './character/profile';
import { BattleView, CAM_MODES, type CamMode } from './render/battleView';
import { THEMES, type Theme } from './render/arenaArt';
import { Screen } from './render/screen';
import { Battle } from './sim/battle';
import { hpRatio } from './sim/fighter';
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
import { GuestSession, HostSession, savedMatch, type OnlineSession } from './net/session';
import { matchWinner, normalizeCode, scoreOf, CODE_LENGTH, type RoundResult, type Snapshot } from './net/protocol';
import { confirmLeave, Lobby, NetBanner, openOnlineSheet } from './ui/online';
import { PickScreen, type PickInfo } from './ui/pick';
import { onlineResultsSheet, type OnlineOutcome } from './ui/results';
import type { CharacterBuild } from './sim/loadout';
import { MATCH_TIME } from './sim/constants';

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
let musicOn = store<boolean>('al.music', true) !== false;
let quotesOn = store<boolean>('al.quotes', true) !== false;
let camMode = store<string>('al.camera', 'classic') as CamMode;
if (!CAM_MODES.some((m) => m.id === camMode)) camMode = 'classic';
const camName = () => CAM_MODES.find((m) => m.id === camMode)!.name;
// Arena for every fight and the menu backdrop: Skygrove Isle unless the player picks another (or random).
let arenaPick = store<string>('al.arena', 'isle');
if (arenaPick !== 'random' && !THEMES.some((t) => t.id === arenaPick)) arenaPick = 'isle';
const arenaFor = (seed: number): Theme => THEMES.find((t) => t.id === arenaPick) ?? THEMES[seed % THEMES.length];
sfx.setMuted(!soundOn);
music.setEnabled(soundOn, musicOn);

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
/** A full screen (creator, gear) hides the arena: skip drawing it until it closes. */
let covered = false;
let resultsEl: HTMLElement | null = null;

const hud = new Hud({
  onSpeed: (s) => { speed = s; save('al.speed', s); view.speed = s; hud.setSpeed(s); sfx.play('ui'); },
  onPause: () => togglePause(),
  onExit: () => { sfx.play('ui'); if (session) askLeave(); else toMenu(); },
  onSettings: () => openSettings(),
  onCamera: () => cycleCamera(),
}, view);
hud.show(false);
hud.setCamera(camName());

/** Next battle camera mode: applies at once and is remembered. */
function cycleCamera(): void {
  camMode = CAM_MODES[(CAM_MODES.findIndex((m) => m.id === camMode) + 1) % CAM_MODES.length].id;
  save('al.camera', camMode);
  if (view.battle && !view.quiet) view.camMode = camMode;
  hud.setCamera(camName(), true);
  sfx.play('ui');
}
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
  onOnline: () => {
    sfx.play('ui');
    if (!player) { openCreator(true); return; }
    openOnlineSheet(ui, { onHost: () => startOnline('host'), onJoin: (code) => startOnline('guest', code) });
  },
});

function setSound(on: boolean): void {
  soundOn = on;
  save('al.sound', on);
  sfx.setMuted(!on);
  music.setEnabled(soundOn, musicOn);
  menu.setSound(on);
}

function openSettings(): void {
  closeSheet();
  sfx.play('ui');
  const arenas = THEMES.map((t) => ({ id: t.id, name: t.name, sky: t.sky, floor: t.floor }));
  sheet = settingsSheet({ quotes: quotesOn, sound: soundOn, music: musicOn, arena: arenaPick }, arenas, (s) => {
    if (s.quotes !== quotesOn) {
      quotesOn = s.quotes;
      save('al.quotes', quotesOn);
      hud.setBubbles(quotesOn);
    }
    if (s.sound !== soundOn) setSound(s.sound);
    if (s.music !== musicOn) {
      musicOn = s.music;
      save('al.music', musicOn);
      music.setEnabled(soundOn, musicOn);
      if (musicOn && state === 'battle') { music.intro(); music.fight(); }
    }
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
const pick = new PickScreen({
  onGear: () => openDraftGear(),
  onReady: () => { if (session) session.lock(session.draft); },
  onUnready: () => session?.unlock(),
  onLeave: () => askLeave(),
});
const lobby = new Lobby({ onCancel: () => endOnline(true), onRetry: () => (session as HostSession | GuestSession | null)?.retry() });
const netBanner = new NetBanner();
ui.append(menu.el, pick.el, hud.el, badge, lobby.el, netBanner.el);

function refreshMenu(): void {
  if (player) menu.set(player, rival, record);
}

function closeSheet(): void {
  sheet?.dispose();
  sheet?.el.remove();
  sheet = null;
  covered = false;
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
      // Opened from an invite link before there was a character.
      if (pendingRoom) { const code = pendingRoom; pendingRoom = ''; startOnline('guest', code); }
    },
    onCancel: first ? undefined : () => closeSheet(),
  });
  ui.append(sheet.el);
  covered = true;
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
  covered = true;
}

// --- Background duel behind the menu -------------------------------------------------------
let demoWait = 0;
let demoRunning = false;
function startDemo(): void {
  demoRunning = true;
  const a = generateRival(), b = generateRival(a.name);
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const battle = new Battle({ seed, fighters: [a, b] });
  view.quiet = true;
  view.camMode = 'classic';
  view.hold = false;
  view.paused = false;
  view.speed = 1;
  view.listener = { onEnd: () => { demoWait = 1.5; } };
  view.start(battle, arenaFor(seed));
}

function toMenu(): void {
  state = 'menu';
  music.stop();
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
  beginBattle((Math.random() * 2 ** 32) >>> 0, [player, rival]);
}

/** Loads a battle and runs the intro (names, warm-up, 3-2-1). */
function beginBattle(seed: number, fighters: [CharacterBuild, CharacterBuild]): void {
  closeSheet();
  resultsEl?.remove();
  resultsEl = null;
  menu.dispose();
  menu.el.hidden = true;
  badge.hidden = true;
  demoRunning = false;
  battle = new Battle({ seed, fighters: [{ ...fighters[0] }, { ...fighters[1] }] });
  const theme = arenaFor(seed);
  view.quiet = false;
  view.camMode = camMode;
  view.focus = session?.you ?? 0;
  view.hold = true;
  view.paused = false;
  view.speed = speed;
  view.listener = { onEvent: onBattleEvent, onEnd: onBattleEnd };
  view.start(battle, theme);
  hud.setup(battle, speed);
  hud.setPaused(false);
  hud.show(true);
  hud.showBanner(`${fighters[0].name} VS ${fighters[1].name}`, theme.name, 0);
  state = 'intro';
  introT = 0;
  countdown = -1;
  music.intro();
}

function onBattleEvent(e: BattleEvent): void {
  hud.onEvent(e);
  if (e.type === 'end') music.end();
}

function onBattleEnd(b: Battle): void {
  if (state !== 'battle') return;
  state = 'results';
  if (session) {
    const won = session.snap?.results.find((r) => r.round === netRound)?.winner ?? b.winner;
    if (won === session.you) sfx.play('win');
    resultsKey = '';
    showOnlineResults();
    return;
  }
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
  // Online fights run on both devices at once: no pausing.
  if (state !== 'battle' || session) return;
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
      music.fight();
      view.hold = false;
      state = 'battle';
    }
  }
}


// --- Online matches ----------------------------------------------------------------------------
// Best of five against a friend. Both devices run the same fights from the
// host's seed and the locked builds; this side only follows the session's state.

let session: OnlineSession | null = null;
/** Invite code waiting for the first character to be made. */
let pendingRoom = '';
/** The match and round whose fight is loaded here, and the round being picked. */
let netMatch = '';
let netRound = 0;
let netPick = '';
let resultsKey = '';

function startOnline(role: 'host' | 'guest', code = '', resume?: ReturnType<typeof savedMatch>): void {
  if (!player) { pendingRoom = role === 'guest' ? code : ''; openCreator(true); return; }
  endOnline(false, false);
  sfx.unlock();
  const me: CharacterBuild = { name: player.name, form: player.form, gear: { ...player.gear }, look: { ...player.look }, skins: { ...player.skins } };
  const s: OnlineSession = role === 'host' ? new HostSession(me, resume ?? undefined) : new GuestSession(code, me, resume ?? undefined);
  session = s;
  netMatch = ''; netRound = 0; netPick = ''; resultsKey = '';
  music.stop();
  s.onChange = () => { if (session === s) syncOnline(); };
  // The background duel keeps going behind the lobby and the pick screen.
  state = 'menu';
  closeSheet();
  resultsEl?.remove();
  resultsEl = null;
  hud.show(false);
  menu.dispose();
  menu.el.hidden = true;
  badge.hidden = true;
  if (!demoRunning) startDemo();
  syncOnline();
  void (s as HostSession | GuestSession).start();
}

/** Ends the online session (telling the rival when `bye`) and, unless `menu` is false, goes back to the menu. */
function endOnline(bye: boolean, toTitle = true): void {
  const s = session;
  if (!s) return;
  session = null;
  if (bye) s.leave(); else s.close();
  lobby.hide();
  netBanner.hide();
  pick.hide();
  hud.setMatch(null);
  if (toTitle) toMenu();
}

function askLeave(): void {
  if (!session) return;
  // Nothing left to lose: leave straight away.
  if (!session.snap || session.conn === 'left' || session.conn === 'error') { endOnline(true); return; }
  confirmLeave(ui, () => endOnline(true));
}

/** Brings the screens in line with the session after every change. */
function syncOnline(): void {
  const s = session;
  if (!s) return;
  const snap = s.snap;
  if (!snap) {
    netBanner.hide();
    if (s.conn === 'error') lobby.show({ kind: 'error', code: s.code, error: s.error ?? 'offline', canRetry: true });
    else if (s.role === 'host') lobby.show(s.conn === 'starting' ? { kind: 'opening' } : { kind: 'waiting', code: s.code });
    else lobby.show({ kind: 'joining', code: s.code });
    return;
  }
  lobby.hide();
  syncBanner(s, snap);
  if (snap.phase === 'pick') {
    const key = `${snap.id}:${snap.round}`;
    if (netPick !== key) enterPick(s, snap, key);
    else pick.show(pickInfo(s, snap));
  } else if (netMatch !== snap.id || netRound !== snap.round) {
    // A new fight (or the last one, when coming back to a finished match).
    startNetFight(snap);
  } else if (state === 'results') {
    showOnlineResults();
  }
}

function syncBanner(s: OnlineSession, snap: Snapshot): void {
  const rivalName = snap.builds[s.rival].name;
  const leave = { label: 'Leave', icon: 'exit' as const, onClick: () => askLeave() };
  const back = { label: 'Back to menu', primary: true, onClick: () => endOnline(false) };
  if (s.conn === 'lost') {
    netBanner.show(
      s.role === 'host' ? `${rivalName} disconnected` : 'Connection lost',
      s.role === 'host' ? 'Waiting for them to come back. The pick clock is paused.' : 'Getting you back into the match',
      [leave], true);
  } else if (s.conn === 'left') {
    netBanner.show(`${rivalName} left the match`, '', [back], false);
  } else if (s.conn === 'error') {
    netBanner.show("Can't get back into the match", s.error === 'version' ? 'Your versions differ: both reload the game.' : '', [back], false);
  } else {
    netBanner.hide();
  }
}

function pickInfo(s: OnlineSession, snap: Snapshot): PickInfo {
  const builds: [CharacterBuild, CharacterBuild] = s.you === 0 ? [s.draft, snap.builds[1]] : [snap.builds[0], s.draft];
  return { you: s.you, round: snap.round, score: scoreOf(snap.results), ready: [snap.ready[0], snap.ready[1]], deadline: s.pickDeadline, builds };
}

/** A new round: both pick a build, starting from what they fought with last. */
function enterPick(s: OnlineSession, snap: Snapshot, key: string): void {
  netPick = key;
  state = 'menu';
  music.stop();
  closeSheet();
  resultsEl?.remove();
  resultsEl = null;
  hud.show(false);
  menu.el.hidden = true;
  if (!demoRunning) startDemo();
  pick.show(pickInfo(s, snap));
}

/** Edits this round's build (form and gear). The saved character stays as it is. */
function openDraftGear(): void {
  const s = session;
  if (!s?.snap || s.snap.phase !== 'pick' || s.snap.ready[s.you]) return;
  closeSheet();
  sfx.play('ui');
  const draft = { ...s.draft, look: s.draft.look ?? player!.look } as PlayerCharacter;
  sheet = gearSheet(draft, {
    onChange: (c) => { s.draft = c; if (s.snap) pick.show(pickInfo(s, s.snap)); },
    onClose: () => closeSheet(),
  }, { forms: true, title: `Round ${s.snap.round} build` });
  ui.append(sheet.el);
  covered = true;
}

/** Both builds are in: play the round from the host's seed. */
function startNetFight(snap: Snapshot): void {
  netMatch = snap.id;
  netRound = snap.round;
  netPick = '';
  resultsKey = '';
  pick.hide();
  hud.setMatch({ round: snap.round, score: scoreOf(snap.results, snap.round - 1) });
  beginBattle(snap.seed, [snap.builds[0], snap.builds[1]]);
}

/** The round's result: the host's official one, or this device's own until it arrives. */
function onlineOutcome(s: OnlineSession, snap: Snapshot): OnlineOutcome {
  const b = battle!;
  const official = snap.results.find((r) => r.round === netRound);
  const local: RoundResult = { round: netRound, winner: b.winner, reason: b.time >= MATCH_TIME ? 'time' : 'ko' };
  const r = official ?? local;
  const all = official ? snap.results : [...snap.results, local];
  const mw = matchWinner(all, netRound);
  return {
    you: s.you, round: netRound, winner: r.winner, reason: r.reason,
    score: scoreOf(all, netRound), matchWinner: mw, desync: !!r.desync,
    waiting: mw !== -1 ? snap.rematch[s.you] : snap.done[s.you] || snap.round !== netRound,
    rivalRematch: snap.rematch[s.rival],
    offline: s.conn !== 'open',
  };
}

function showOnlineResults(): void {
  const s = session;
  if (!s?.snap || !battle) return;
  const o = onlineOutcome(s, s.snap);
  const key = JSON.stringify(o);
  if (key === resultsKey && resultsEl) return;
  resultsKey = key;
  resultsEl?.remove();
  resultsEl = onlineResultsSheet(battle, o, {
    onNext: () => { sfx.play('ui'); s.finishedWatching(netRound); },
    onRematch: () => { sfx.play('ui'); s.rematch(); },
    onLeave: () => { sfx.play('ui'); askLeave(); },
  });
  ui.append(resultsEl);
}

// --- Loop ------------------------------------------------------------------------------------
let last = 0;
function loop(now: number): void {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  if (state === 'intro') intro(dt);
  if (state === 'menu') {
    view.warm(3);
    if (session) pick.tick();
    if (demoWait > 0 && (demoWait -= dt) <= 0) startDemo();
  }
  if (!covered) view.frame(dt);
  if (state !== 'menu') hud.update(view.paused ? 0 : dt * speed);
  if (state === 'battle' && battle) {
    const [a, b] = battle.fighters;
    music.update(Math.min(hpRatio(a), hpRatio(b)), a.empowered, view.paused);
  }
  requestAnimationFrame(loop);
}

// --- Input -----------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || sheet) return;
  if (state === 'menu' && e.key === 'Enter' && !session) startFight();
  else if (state === 'battle') {
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'Escape') { if (session) askLeave(); else toMenu(); }
    else if (e.key === 'c' || e.key === 'C') cycleCamera();
    else if (e.key === '1' || e.key === '2' || e.key === '3') {
      speed = [1, 2, 4][Number(e.key) - 1];
      save('al.speed', speed);
      view.speed = speed;
      hud.setSpeed(speed);
    }
  } else if (state === 'results' && e.key === 'Enter' && !session) startFight();
});
// Browsers only start audio after a gesture.
window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
window.addEventListener('keydown', () => sfx.unlock(), { capture: true, once: true });
setupPhoneFullscreen();

// --- Boot --------------------------------------------------------------------------------------
toMenu();
{
  // An invite link (?room=CODE) joins that room; a reload mid-match resumes it.
  const params = new URLSearchParams(location.search);
  const code = normalizeCode(params.get('room') ?? '');
  const saved = savedMatch();
  if (params.has('room')) {
    params.delete('room');
    const q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }
  if (code.length === CODE_LENGTH) startOnline('guest', code);
  else if (saved && player) startOnline(saved.role, saved.code, saved);
  else if (!player) openCreator(true);
}
requestAnimationFrame((t) => {
  last = t;
  document.getElementById('boot')?.remove();
  requestAnimationFrame(loop);
});

// Handle for poking at the running game from the console.
(window as unknown as { game?: unknown }).game = { view, get battle() { return battle; } };
