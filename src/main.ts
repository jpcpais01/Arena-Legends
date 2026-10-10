import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/latin-700.css';
import './ui/styles.css';
import { music } from './audio/music';
import { sfx } from './audio/sfx';
import { sanitizeAppearance } from './character/appearance';
import { setAllSkins, addGems, gems, loadCollection, onCollection, payRound, PULL_COST, winGems } from './character/collection';
import { entranceOf } from './character/entrances';
import { generateRival, loadCharacter, newCharacter, saveCharacter, type PlayerCharacter } from './character/profile';
import { BattleView, CAM_MODES, type CamMode } from './render/battleView';
import { THEMES, type Theme } from './render/arenaArt';
import { Screen } from './render/screen';
import { Battle } from './sim/battle';
import { hpRatio } from './sim/fighter';
import { DEFAULT_BUILDS, sanitizeBuild } from './sim/loadout';
import type { BattleEvent } from './sim/types';
import { creatorSheet } from './ui/creator';
import { installFrames } from './ui/frames';
import { TitleScreen } from './ui/title';
import { h, save, store } from './ui/dom';
import { icon } from './ui/icons';
import { setupPhoneFullscreen } from './ui/fullscreen';
import { chestScreen } from './ui/gacha';
import { forgeScreen } from './ui/forge';
import { shopScreen } from './ui/shop';
import { gearSheet } from './ui/gear';
import { Hud } from './ui/hud';
import { Menu, type Record as WinLoss } from './ui/menu';
import { versionBadge } from './ui/patchNotes';
import { resultsSheet, type WinReward } from './ui/results';
import { settingsSheet, type Volume } from './ui/settings';
import { GuestSession, HostSession, savedMatch, type OnlineSession } from './net/session';
import { matchWinner, normalizeCode, scoreOf, CODE_LENGTH, type RoundResult, type Snapshot } from './net/protocol';
import { confirmLeave, Lobby, NetBanner, openOnlineSheet } from './ui/online';
import { PickScreen, type PickInfo } from './ui/pick';
import { onlineResultsSheet, type OnlineOutcome } from './ui/results';
import { withGear, type CharacterBuild } from './sim/loadout';
import { MATCH_TIME } from './sim/constants';
import { gearOf } from './sim/gear';
import { setPieces, type SkinDef } from './character/skins';
import { accountStatus, accountsEnabled, consumeResume, me, onAccount, poke, restoreAccount, setReloadGate, social } from './account/account';
import { accountSheet } from './ui/account';
import { friendsSheet } from './ui/friends';
import { FIGHT_STYLE_IDS } from './sim/styles';
import { invitePopup, type InvitePopup } from './ui/invite';
import { addXp, CHAMPION_GEMS, CHAMPION_XP, cupLossXp, cupWinXp, FINALIST_GEMS, heroLevel, pointsAt, quickXp } from './character/progress';
import { autoTraining, spentPoints, strHash } from './sim/training';
import {
  entrantAt, fromBattle, loadCup, matchSeed, newCup, parseCup, ROUND_COUNT, ROUNDS, saveCup, settleRound, statusOf, type Cup, type Judge,
} from './cup/cup';
import { CupGuest, CupHost, type CupLobbyError, type LobbyMember } from './net/cupLobby';
import { CupLobbyScreen, CupScreen, openCupStart, type CupLobbyView, type InviteState, type LobbyFriend } from './ui/cup';
import { cupResultsSheet } from './ui/results';
import { judgeRound } from './net/judge';
import { confirmBox } from './ui/confirm';
import { isCupCode } from './net/protocol';
import { isOnline } from './account/presence';

type State = 'menu' | 'intro' | 'battle' | 'results';

installFrames();
const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const screen = new Screen(app);
const view = new BattleView(screen);

// --- Saved state -------------------------------------------------------------------
let player: PlayerCharacter | null = loadCharacter();
let rival: PlayerCharacter = loadRival() ?? generateRival(player?.name);
// Gems and owned skins. Whatever the hero already wears stays owned.
loadCollection(player?.skins);
// The owners' accounts (João, Tiago, Batuca) always own every skin and entrance, including ones added later.
const ownsAll = () => /^(joao|tiago|batuca)$/i.test(accountStatus().name ?? '');
setAllSkins(ownsAll);
onAccount(() => setAllSkins(ownsAll));
let record = store<WinLoss>('al.record', { w: 0, l: 0 });

/** Keeps the saved hero's level in step with its XP (friends and cup brackets show it). */
function syncLevel(): void {
  if (!player) return;
  const lv = heroLevel();
  if ((player.level ?? 1) === lv) return;
  const next = { ...player };
  if (lv > 1) next.level = lv; else delete next.level;
  player = next;
  saveCharacter(next);
}
syncLevel();
/** Stat points earned and not spent yet. */
const freePoints = () => (player ? Math.max(0, pointsAt(heroLevel()) - spentPoints(player.train)) : 0);
let speed = [1, 2, 4].includes(store<number>('al.speed', 1)) ? store<number>('al.speed', 1) : 1;
let soundOn = store<boolean>('al.sound', true);
// Volume sliders (0..1). Older saves had a Music on/off switch: off becomes 0.
let volume: Volume = { master: 1, music: store<boolean>('al.music', true) === false ? 0 : 1, sfx: 1, ...store<Partial<Volume>>('al.volume', {}) };
let quotesOn = store<boolean>('al.quotes', true) !== false;
let hideSmall = store<boolean>('al.hideSmallNumbers', true) !== false;
let camMode = store<string>('al.camera', 'classic') as CamMode;
if (!CAM_MODES.some((m) => m.id === camMode)) camMode = 'classic';
const camName = () => CAM_MODES.find((m) => m.id === camMode)!.name;
// Arena for every fight and the menu backdrop: Random unless the player picks one.
// A pick of an arena that no longer exists (Emberforge Caldera) falls back to Random.
let arenaPick = store<string>('al.arena', 'random');
if (arenaPick !== 'random' && !THEMES.some((t) => t.id === arenaPick)) arenaPick = 'random';
const arenaFor = (seed: number): Theme => THEMES.find((t) => t.id === arenaPick) ?? THEMES[seed % THEMES.length];
applyVolume();

function loadRival(): PlayerCharacter | null {
  const raw = store<Record<string, unknown> | null>('al.rival', null);
  if (!raw || typeof raw.name !== 'string') return null;
  const b = sanitizeBuild(raw, DEFAULT_BUILDS[1]);
  // Rivals always fight Balanced, including ones saved before that rule.
  return { ...b, look: sanitizeAppearance(raw.look), style: 'balanced' };
}
/** The rival as they fight: as many stat points as the hero has earned, spent their own way. */
function rivalNow(): PlayerCharacter {
  const lv = heroLevel();
  const r: PlayerCharacter = { ...rival };
  const train = autoTraining(pointsAt(lv), strHash(rival.name));
  if (train) r.train = train; else delete r.train;
  if (lv > 1) r.level = lv; else delete r.level;
  return r;
}
function setRival(r: PlayerCharacter): void {
  rival = r;
  save('al.rival', r);
}
save('al.rival', rival);

// --- UI pieces ---------------------------------------------------------------------------
let state: State = 'menu';
let sheet: { el: HTMLElement; dispose(): void } | null = null;
/** A full screen (creator, gear) hides the arena: it stays frozen behind it, so skip drawing it until it closes. */
let covered = false;
/** The arena has been drawn at least once (so a full screen opened at boot has a backdrop). */
let painted = false;
/** The title screen is up (before the first tap). */
let title: TitleScreen | null = null;
let resultsEl: HTMLElement | null = null;

const hud = new Hud({
  onSpeed: (s) => { speed = s; save('al.speed', s); view.speed = s; hud.setSpeed(s); sfx.play('ui'); },
  onPause: () => togglePause(),
  onExit: () => { sfx.play('ui'); if (session) askLeave(); else if (cupMatch) backToCup(); else toMenu(); },
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
view.minNumber = hideSmall ? 50 : 0;

const menu = new Menu({
  onFight: () => startFight(),
  onEditLook: () => openCreator(false, freePoints() > 0),
  onGear: () => openGear(),
  onNewRival: () => { sfx.play('ui'); setRival(generateRival(player?.name)); refreshMenu(); },
  onSound: () => {
    setSound(!soundOn);
    sfx.play('ui');
  },
  onSettings: () => openSettings(),
  onChests: () => openShop(),
  onOnline: () => {
    sfx.play('ui');
    if (!player) { openCreator(true); return; }
    openOnlineSheet(ui, { onHost: () => startOnline('host'), onJoin: (code) => (isCupCode(code) ? joinCup(code) : startOnline('guest', code)) });
  },
  onAccount: accountsEnabled ? () => openAccount() : undefined,
  onFriends: accountsEnabled ? () => openFriends() : undefined,
  onCup: () => openCup(),
});

function openFriends(): void {
  closeSheet();
  sfx.play('ui');
  sheet = friendsSheet({
    onClose: () => closeSheet(),
    onAccount: () => openAccount(),
    onIncoming: (n) => { requestsAt = Date.now(); menu.setFriendRequests(n); },
    onInvite: (f) => inviteFriend(f.uid, f.name),
  });
  ui.append(sheet.el);
}

// --- Duel invites between friends --------------------------------------------------------------
// The inviter hosts an online room and leaves an invite naming its code; the
// friend's game checks for invites while on the menu and pops up a challenge.

/** How long an invite stands, from when it was sent. */
const INVITE_SECONDS = 60;
/** The friend we invited to the room we host, and how they answered. */
let sentInvite: { to: string; name: string; code: string; state: 'sending' | 'open' | 'declined' | 'expired' | 'failed'; at: number; error?: string } | null = null;
let invitePoll = 0;

function inviteFriend(uid: string, name: string): void {
  if (!me()) return;
  startOnline('host');
  if (!session) return; // no hero yet: the creator opened instead
  sentInvite = { to: uid, name, code: '', state: 'sending', at: 0 };
  syncOnline();
}

/** Host side, after every session change: send the invite once the room is open, then watch for the answer. */
function syncInvite(s: OnlineSession): void {
  const inv = sentInvite;
  const who = me();
  if (!inv || !who) return;
  // They joined (or the room closed): the invite has done its job.
  if (s.snap || s.conn === 'error' || s.conn === 'left') { endInvite(); return; }
  if (s.conn !== 'waiting' || inv.code === s.code) return;
  inv.code = s.code;
  inv.state = 'sending';
  social().then((m) => m.invite(who, inv.to, s.code)).then(() => {
    if (sentInvite !== inv) return;
    inv.state = 'open';
    inv.at = Date.now();
    syncOnline();
    clearInterval(invitePoll);
    invitePoll = window.setInterval(() => void watchInvite(inv), 3000);
  }, (e) => {
    console.warn('[invite]', e);
    if (sentInvite === inv) { inv.state = 'failed'; inv.error = String((e as { code?: string })?.code ?? (e as Error)?.message ?? e); syncOnline(); }
  });
}

async function watchInvite(inv: NonNullable<typeof sentInvite>): Promise<void> {
  if (sentInvite !== inv || inv.state !== 'open') return;
  if (Date.now() - inv.at > INVITE_SECONDS * 1000) {
    inv.state = 'expired';
    clearInterval(invitePoll);
    void social().then((m) => m.dropInvite(me()?.uid ?? '', inv.to)).catch(() => {});
    syncOnline();
    return;
  }
  const got = await social().then((m) => m.inviteState(me()?.uid ?? '', inv.to)).catch(() => undefined);
  if (sentInvite !== inv || !got) return;
  if (got.state === 'declined') {
    inv.state = 'declined';
    clearInterval(invitePoll);
    sfx.play('back');
    void social().then((m) => m.dropInvite(got.from, got.to)).catch(() => {});
    syncOnline();
  }
}

/** Forgets the invite we sent and takes it down. */
function endInvite(): void {
  const inv = sentInvite;
  sentInvite = null;
  clearInterval(invitePoll);
  const who = me();
  if (inv && who && inv.code) void social().then((m) => m.dropInvite(who.uid, inv.to)).catch(() => {});
}

/** Friend side: the popup on screen, and invites already answered or let lapse (by sender and time). */
let invitePop: InvitePopup | null = null;
let shownInvite = '';
const seenInvites = new Set<string>();

/** Checks for duel invites while this player sits on the menu, signed in. */
async function checkInvites(): Promise<void> {
  const who = me();
  if (!who || document.visibilityState !== 'visible') return;
  const idle = state === 'menu' && !session && !title && !cupRoom;
  if (!idle) { closeInvite(); return; }
  const list = await social().then((m) => m.invites(who.uid)).catch(() => null);
  if (!list || me()?.uid !== who.uid) return;
  const now = Date.now();
  // Generous on age: the two clocks can disagree a little.
  const live = list.filter((i) => now - i.at < (INVITE_SECONDS + 15) * 1000 && !seenInvites.has(`${i.from}:${i.at}`));
  if (invitePop && !live.some((i) => `${i.from}:${i.at}` === shownInvite)) closeInvite(); // they cancelled
  if (invitePop || !live.length || !(state === 'menu' && !session && !title && !cupRoom)) return;
  const inv = live.sort((a, b) => b.at - a.at)[0];
  const key = `${inv.from}:${inv.at}`;
  const left = Math.max(10, Math.min(INVITE_SECONDS, INVITE_SECONDS - (now - inv.at) / 1000));
  const answer = (yes: boolean) => social().then((m) => m.answerInvite(inv, yes)).catch(() => {});
  shownInvite = key;
  const toCup = isCupCode(inv.code);
  invitePop = invitePopup(inv.fromName, left, {
    onAccept: () => {
      seenInvites.add(key); closeInvite();
      void answer(true);
      if (toCup) joinCup(inv.code); else startOnline('guest', inv.code);
    },
    onDecline: () => { seenInvites.add(key); closeInvite(); void answer(false); },
    onExpire: () => { seenInvites.add(key); closeInvite(); },
  }, toCup);
  ui.append(invitePop.el);
  social().then((m) => m.hero(inv.from)).then((x) => invitePop?.setHero(x), () => {});
}

function closeInvite(): void {
  invitePop?.dispose();
  invitePop = null;
  shownInvite = '';
}
window.setInterval(() => void checkInvites(), 5000);

/** Checks for friend requests now and then (the dot on the menu's friends button). */
let requestsAt = 0;
function checkFriendRequests(): void {
  const who = me();
  if (!who) { menu.setFriendRequests(0); return; }
  if (Date.now() - requestsAt < 60_000) return;
  requestsAt = Date.now();
  social().then((m) => m.incomingCount(who.uid)).then((n) => menu.setFriendRequests(n), () => {});
}
onAccount((s) => { if (!s.name) requestsAt = 0; if (!s.restoring) checkFriendRequests(); });

function openAccount(): void {
  closeSheet();
  sfx.play('ui');
  sheet = accountSheet(() => closeSheet());
  ui.append(sheet.el);
}
// A save pulled from the account reloads the game, so only on the menu, outside online matches.
setReloadGate(() => state === 'menu' && !session && !covered);

function applyVolume(): void {
  sfx.setVolume(volume.master * volume.sfx);
  sfx.setMuted(!soundOn);
  music.setEnabled(soundOn, volume.master * volume.music);
}

function setSound(on: boolean): void {
  soundOn = on;
  save('al.sound', on);
  applyVolume();
  menu.setSound(on);
}

function openSettings(): void {
  closeSheet();
  sfx.play('ui');
  const arenas = THEMES.map((t) => ({ id: t.id, name: t.name, sky: t.sky, floor: t.floor }));
  sheet = settingsSheet({ quotes: quotesOn, smallNumbers: hideSmall, volume, arena: arenaPick }, arenas, (s) => {
    if (s.quotes !== quotesOn) {
      quotesOn = s.quotes;
      save('al.quotes', quotesOn);
      hud.setBubbles(quotesOn);
    }
    if (s.smallNumbers !== hideSmall) {
      hideSmall = s.smallNumbers;
      save('al.hideSmallNumbers', hideSmall);
      view.minNumber = hideSmall ? 50 : 0;
    }
    if (s.volume !== volume) {
      const wasMusic = volume.master * volume.music > 0;
      volume = s.volume;
      save('al.volume', volume);
      // Raising a slider while muted from the menu switch unmutes.
      if (!soundOn && volume.master > 0) setSound(true); else applyVolume();
      if (!wasMusic && volume.master * volume.music > 0 && state === 'battle') { music.intro(); music.fight(); }
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
  onStyle: () => {
    const s = session;
    if (!s?.snap || s.snap.phase !== 'pick' || s.snap.ready[s.you]) return;
    const i = FIGHT_STYLE_IDS.indexOf(s.draft.style ?? 'balanced');
    s.draft = { ...s.draft, style: FIGHT_STYLE_IDS[(i + 1) % FIGHT_STYLE_IDS.length] };
    pick.show(pickInfo(s, s.snap));
    refreshDemo();
  },
  onReady: () => { if (session) session.lock(session.draft); },
  onUnready: () => session?.unlock(),
  onLeave: () => askLeave(),
});
const lobby = new Lobby({ onCancel: () => endOnline(true), onRetry: () => (session as HostSession | GuestSession | null)?.retry() });
const netBanner = new NetBanner();
ui.append(menu.el, pick.el, hud.el, badge, lobby.el, netBanner.el);

function refreshMenu(): void {
  if (!player) return;
  syncLevel();
  menu.set(player, rivalNow(), record);
  menu.setPoints(freePoints());
  const st = cup && statusOf(cup);
  menu.setCup(st?.kind === 'play' ? ROUNDS[st.round].short : null);
}

function closeSheet(): void {
  sheet?.dispose();
  sheet?.el.remove();
  sheet = null;
  cupScreen = null;
  setCovered(!!cupRoom);
  poke();
  checkFriendRequests();
}

/** A full screen is up: the arena freezes behind it and the menu and version label step aside. */
function setCovered(on: boolean): void {
  covered = on;
  ui.classList.toggle('covered', on);
}

/** `stats`: open on the Stats step. `back`: where to go when it closes (the cup screen). */
function openCreator(first = false, stats = false, back?: () => void): void {
  closeSheet();
  sfx.play('ui');
  sheet = creatorSheet(player ?? newCharacter(), {
    onDone: (c) => {
      player = c;
      saveCharacter(c);
      syncLevel();
      closeSheet();
      refreshMenu();
      if (back) { back(); return; }
      // Opened from an invite link before there was a character.
      if (pendingRoom) { const code = pendingRoom; pendingRoom = ''; if (isCupCode(code)) joinCup(code); else startOnline('guest', code); }
    },
    onCancel: first ? undefined : () => { closeSheet(); back?.(); },
    stats,
  });
  ui.append(sheet.el);
  setCovered(true);
}

function openGear(back?: () => void): void {
  if (!player) return;
  closeSheet();
  sfx.play('ui');
  sheet = gearSheet(player, {
    onChange: (c) => { player = c; saveCharacter(c); },
    onClose: () => { closeSheet(); refreshMenu(); back?.(); },
    onChests: () => openShop(),
  });
  ui.append(sheet.el);
  setCovered(true);
}

/** The shop: featured set, daily skins and set bundles, all for gems. Chests are its second tab. */
function openShop(): void {
  closeSheet();
  sfx.unlock();
  sfx.play('ui');
  sheet = shopScreen({
    onClose: () => { closeSheet(); refreshMenu(); },
    onChests: (t) => openChests(t),
    onEquip: (s: SkinDef) => wearPulled(s),
    onEquipSet: (id) => { for (const s of setPieces(id)) wearPulled(s); },
    onEntrance: (id) => {
      if (!player) return;
      player = { ...player, look: { ...player.look, entrance: id } };
      saveCharacter(player);
    },
    player: () => player,
  });
  ui.append(sheet.el);
  setCovered(true);
}

/** Skin chests and the forge (the shop's other tabs): spend gems on random skins, melt spares. */
function openChests(tab: 'chests' | 'forge' = 'chests'): void {
  if (tab === 'forge') { openForge(); return; }
  closeSheet();
  sfx.play('ui');
  sheet = chestScreen({
    onClose: () => { closeSheet(); refreshMenu(); },
    onShop: () => openShop(),
    onForge: () => openForge(),
    onEquip: (s: SkinDef) => wearPulled(s),
    player: () => player,
  });
  ui.append(sheet.el);
  setCovered(true);
}

/** The forge (the shop's third tab): melt three spares into a skin of the next rarity. */
function openForge(): void {
  closeSheet();
  sfx.play('ui');
  sheet = forgeScreen({
    onClose: () => { closeSheet(); refreshMenu(); },
    onShop: () => openShop(),
    onChests: () => openChests(),
    onEquip: (s: SkinDef) => wearPulled(s),
    player: () => player,
  });
  ui.append(sheet.el);
  setCovered(true);
}

/** Wears a skin fresh out of a chest, equipping its item in its slot. */
function wearPulled(s: SkinDef): void {
  if (!player) return;
  const next = { ...player, ...withGear(player, gearOf(s.gear).slot, s.gear), skins: { ...player.skins, [s.gear]: s.id } } as PlayerCharacter;
  player = next;
  saveCharacter(next);
}

const showGems = () => menu.setGems(gems(), gems() >= PULL_COST);
onCollection(showGems);
showGems();

// --- Background duel behind the menu -------------------------------------------------------
let demoWait = 0;
let demoRunning = false;
/** The builds the background duel shows: during an online pick, both players' current picks; otherwise random fighters (null). */
function demoBuilds(): [CharacterBuild, CharacterBuild] | null {
  const s = session, snap = s?.snap;
  if (!s || !snap || snap.phase !== 'pick') return null;
  return pickInfo(s, snap).builds;
}
/** Which builds the running background duel was started with ('' for random fighters). */
let demoKey = '';

/** Restarts the background duel when the builds it should show changed (a pick began, or someone changed their build). */
function refreshDemo(): void {
  const pair = demoBuilds();
  if (!demoRunning || (pair ? JSON.stringify(pair) : '') !== demoKey) startDemo();
}

function startDemo(): void {
  demoRunning = true;
  demoWait = 0;
  const pair = demoBuilds();
  demoKey = pair ? JSON.stringify(pair) : '';
  const a = pair?.[0] ?? generateRival(), b = pair?.[1] ?? generateRival(a.name);
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
  music.menu();
  closeSheet();
  resultsEl?.remove();
  resultsEl = null;
  hud.show(false);
  menu.el.hidden = false;
  badge.hidden = false;
  refreshMenu();
  startDemo();
  poke();
}

// --- A fight -----------------------------------------------------------------------------------
let introT = 0;
/** Seconds the entrances take before the countdown can start. */
let introLen = 0;
let countdown = -1;
let battle: Battle | null = null;

function startFight(): void {
  if (!player) { openCreator(true); return; }
  sfx.unlock();
  sfx.play('ui');
  beginBattle((Math.random() * 2 ** 32) >>> 0, [player, rivalNow()]);
}

/** This device's side in the battle on screen. */
const yourSide = (): 0 | 1 => session?.you ?? cupMatch?.side ?? 0;

/** Loads a battle and runs the intro (names, warm-up, 3-2-1). `sub` replaces the arena name under the VS banner. */
function beginBattle(seed: number, fighters: [CharacterBuild, CharacterBuild], sub?: string): void {
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
  view.focus = yourSide();
  view.hold = true;
  view.paused = false;
  view.speed = speed;
  view.listener = { onEvent: onBattleEvent, onEnd: onBattleEnd };
  view.start(battle, theme);
  hud.setup(battle, speed);
  hud.setPaused(false);
  hud.show(true);
  hud.showBanner(`${fighters[0].name} VS ${fighters[1].name}`, sub ?? theme.name, 0);
  // Each hero walks on their own way (yours only if you own it); the countdown waits for both.
  const me = yourSide();
  introLen = view.playEntrances([entranceOf(fighters[0].look, me === 0), entranceOf(fighters[1].look, me === 1)]);
  state = 'intro';
  introT = 0;
  countdown = -1;
  music.intro(theme.id);
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
  if (cupMatch && cup) { endCupFight(b, cupMatch, cup); return; }
  if (b.winner === 0) record = { ...record, w: record.w + 1 };
  else if (b.winner === 1) record = { ...record, l: record.l + 1 };
  save('al.record', record);
  let reward: WinReward | null = null;
  if (b.winner === 0) {
    sfx.play('win');
    // Gems for the win: more the more health was kept.
    const hp = Math.max(0, hpRatio(b.fighters[0]));
    reward = { gems: winGems(hp), hp };
    addGems(reward.gems);
    setTimeout(() => sfx.play('gems'), 450);
  }
  const reason = b.fighters.some((f) => !f.alive) ? 'ko' : 'time';
  const xp = addXp(quickXp(b.winner === 0, b.winner === -1, Math.max(0, hpRatio(b.fighters[0]))));
  syncLevel();
  resultsEl = resultsSheet(b, reason, true, {
    onRematch: () => startFight(),
    onNewRival: () => { setRival(generateRival(player?.name)); startFight(); },
    onMenu: () => { sfx.play('ui'); toMenu(); },
  }, reward, xp);
  ui.append(resultsEl);
}

function togglePause(): void {
  // Online fights run on both devices at once: no pausing.
  if (state !== 'battle' || session) return;
  view.paused = !view.paused;
  hud.setPaused(view.paused);
  sfx.play('ui');
}

/** Intro: names and entrances, sprite warm-up, then 3-2-1. The sim holds until FIGHT. */
function intro(dt: number): void {
  introT += dt;
  const ready = view.warm(6);
  if (countdown < 0) {
    if (introT > Math.max(1.3, introLen + 0.15) && ready) { countdown = 3; introT = 0; hud.showBanner('3', '', 0); sfx.play('ui'); }
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
/** Gems paid for the round on screen (paid once, when the host's result says you won it). */
let netReward: { key: string; r: WinReward } | null = null;

function startOnline(role: 'host' | 'guest', code = '', resume?: ReturnType<typeof savedMatch>): void {
  if (!player) { pendingRoom = role === 'guest' ? code : ''; openCreator(true); return; }
  endOnline(false, false);
  sfx.unlock();
  // The hero exactly as it is now (gear, skins, form, style, look): the match starts from it and never writes back.
  const me: CharacterBuild = { ...player, gear: { ...player.gear }, look: { ...player.look }, skins: { ...player.skins }, style: player.style ?? 'balanced' };
  const s: OnlineSession = role === 'host' ? new HostSession(me, resume ?? undefined) : new GuestSession(code, me, resume ?? undefined);
  session = s;
  netMatch = ''; netRound = 0; netPick = ''; resultsKey = '';
  music.menu();
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
  endInvite();
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
    else if (s.role === 'host') {
      syncInvite(s);
      const inv = sentInvite;
      lobby.show(s.conn === 'starting' ? { kind: 'opening' } : { kind: 'waiting', code: s.code, invited: inv ? { name: inv.name, state: inv.state, error: inv.error } : undefined });
    }
    else lobby.show({ kind: 'joining', code: s.code });
    return;
  }
  lobby.hide();
  if (sentInvite) endInvite();
  syncBanner(s, snap);
  if (snap.phase === 'pick') {
    const key = `${snap.id}:${snap.round}`;
    if (netPick !== key) enterPick(s, snap, key);
    else { pick.show(pickInfo(s, snap)); if (!covered) refreshDemo(); }
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
  music.menu();
  closeSheet();
  resultsEl?.remove();
  resultsEl = null;
  hud.show(false);
  menu.el.hidden = true;
  refreshDemo();
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
    onClose: () => { closeSheet(); if (session === s) refreshDemo(); },
  }, { forms: true, title: `Round ${s.snap.round} build` });
  ui.append(sheet.el);
  setCovered(true);
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
  const official = s.snap.results.find((r) => r.round === netRound);
  const roundKey = `${netMatch}:${netRound}`;
  if (official && official.winner === s.you && netReward?.key !== roundKey) {
    const hp = Math.max(0, hpRatio(battle.fighters[s.you]));
    const paid = payRound(roundKey, winGems(hp));
    netReward = { key: roundKey, r: { gems: paid, hp } };
    if (paid) setTimeout(() => sfx.play('gems'), 450);
  }
  const reward = netReward?.key === roundKey ? netReward.r : null;
  const key = JSON.stringify(o) + (reward?.gems ?? 0);
  if (key === resultsKey && resultsEl) return;
  resultsKey = key;
  resultsEl?.remove();
  resultsEl = onlineResultsSheet(battle, o, {
    onNext: () => { sfx.play('ui'); s.finishedWatching(netRound); },
    onRematch: () => { sfx.play('ui'); s.rematch(); },
    onLeave: () => { sfx.play('ui'); askLeave(); },
  }, reward);
  ui.append(resultsEl);
}

// --- Arena Cup -----------------------------------------------------------------------------------
// A 32-fighter knockout bracket, solo or with friends. The cup lives in `al.cup`;
// fights with a player in them are real battles, the rest settle on their own.

let cup: Cup | null = loadCup();
/** The cup screen while it is the open full screen. */
let cupScreen: CupScreen | null = null;
/** The cup fight on screen: round, match and your side. */
let cupMatch: { r: number; m: number; side: 0 | 1 } | null = null;
/** Other fights are being settled; and the matches decided since the screen last showed. */
let cupBusy = false;
let cupFresh = new Set<string>();

/** Who this player is in cup lobbies: their account, or this device. */
function myPid(): string {
  const who = me();
  if (who) return who.uid;
  let id = store<string>('al.pid', '');
  if (!id) { id = 'd' + Math.random().toString(36).slice(2, 12); save('al.pid', id); }
  return id;
}

function openCup(): void {
  if (!player) { openCreator(true); return; }
  sfx.unlock();
  if (cup) { sfx.play('ui'); showCup(); return; }
  sfx.play('ui');
  openCupStart(ui, { onSolo: () => startSoloCup(), onFriends: () => openCupLobby('host') });
}

function startSoloCup(): void {
  if (!player) return;
  const lv = heroLevel();
  setCup(newCup([{ build: player, level: lv, pid: myPid() }], lv, false));
  showCup();
}

function setCup(c: Cup | null): void {
  cup = c;
  cupFresh = new Set();
  saveCup(c);
}

/** In a solo cup your slot always shows (and fights with) your hero as it is now. */
function refreshMySlot(c: Cup): void {
  if (!c.shared && player) c.entrants[c.me] = { ...c.entrants[c.me], build: player, level: heroLevel() };
}

function showCup(): void {
  const c = cup;
  if (!c) return;
  refreshMySlot(c);
  closeSheet();
  const scr = new CupScreen({
    onFight: () => startCupFight(),
    onMenu: () => { closeSheet(); refreshMenu(); },
    onLeave: () => confirmBox(ui, 'Give up the cup?', 'You leave the bracket. The XP and gems you already won stay yours.', 'Give up', () => {
      setCup(null); closeSheet(); refreshMenu();
    }, 'exit'),
    onGear: () => openGear(() => showCup()),
    onHero: () => openCreator(false, true, () => showCup()),
    onNewCup: () => { setCup(null); closeSheet(); refreshMenu(); openCup(); },
    onFinish: () => void settleCup(ROUND_COUNT - 1),
  });
  sheet = { el: scr.el, dispose: () => scr.dispose() };
  cupScreen = scr;
  ui.append(scr.el);
  setCovered(true);
  renderCup();
  // Fights that should be settled by now (a reload mid-cup, or knocked out): settle them.
  const st = statusOf(c);
  const upto = st.kind === 'play' ? st.round - 1 : st.kind === 'out' ? st.round : ROUND_COUNT - 1;
  if (upto >= 0 && c.results.slice(0, upto + 1).some((row) => row.some((x) => !x))) void settleCup(upto);
}

function renderCup(): void {
  if (!cup || !cupScreen) return;
  cupScreen.set({ cup, busy: cupBusy, fresh: cupFresh, points: cup.shared ? 0 : freePoints() });
  cupFresh = new Set();
}

/** Friends' fights run as headless battles (in a worker), exactly as they play on their devices. */
const judgeCup: Judge = (seed, builds) => judgeRound(seed, builds).then((v) => ({ winner: v.winner, reason: v.reason, hp: v.hp, dmg: v.dmg }));

/** Settles every round up to `upto` that can be settled without you, then lights up what changed. */
async function settleCup(upto: number): Promise<void> {
  const c = cup;
  if (!c || cupBusy) return;
  cupBusy = true;
  renderCup();
  const known = new Set<string>();
  c.results.forEach((row, r) => row.forEach((x, m) => { if (x) known.add(`${r}:${m}`); }));
  try {
    for (let r = 0; r <= Math.min(upto, ROUND_COUNT - 1); r++) await settleRound(c, r, judgeCup);
  } catch (e) {
    console.warn('[cup]', e);
  }
  cupBusy = false;
  if (cup !== c) return;
  c.results.forEach((row, r) => row.forEach((x, m) => { if (x && !known.has(`${r}:${m}`)) cupFresh.add(`${r}:${m}`); }));
  saveCup(c);
  renderCup();
  if (!cupScreen && !covered && state === 'menu') refreshMenu();
}

function startCupFight(): void {
  const c = cup;
  if (!c || !player) return;
  const st = statusOf(c);
  if (st.kind !== 'play') return;
  const a = entrantAt(c, st.round, st.match, 0), b = entrantAt(c, st.round, st.match, 1);
  if (a < 0 || b < 0) return;
  refreshMySlot(c);
  cupMatch = { r: st.round, m: st.match, side: st.side };
  sfx.unlock();
  sfx.play('ui');
  // The upper slot is always the left corner, so every device plays this match the same way.
  beginBattle(matchSeed(c, st.round, st.match), [c.entrants[a].build, c.entrants[b].build], ROUNDS[st.round].name);
}

/** A cup fight ended: record it, pay gems and XP, and show how it went. */
function endCupFight(b: Battle, cm: NonNullable<typeof cupMatch>, c: Cup): void {
  const ko = b.fighters.some((f) => !f.alive);
  const [f0, f1] = b.fighters;
  const res = fromBattle(b.winner, [Math.max(0, hpRatio(f0)), Math.max(0, hpRatio(f1))], [f0.totals.damageDealt, f1.totals.damageDealt], ko);
  c.results[cm.r][cm.m] = res;
  const won = res.w === cm.side;
  record = won ? { ...record, w: record.w + 1 } : { ...record, l: record.l + 1 };
  save('al.record', record);
  const final = cm.r === ROUND_COUNT - 1;
  const reward: WinReward | null = won ? { gems: winGems(res.hp), hp: res.hp } : null;
  const bonus = final ? (won ? CHAMPION_GEMS : FINALIST_GEMS) : 0;
  const gemsWon = (reward?.gems ?? 0) + bonus;
  if (gemsWon) addGems(gemsWon);
  const xp = addXp((won ? cupWinXp(cm.r, res.hp) : cupLossXp(cm.r)) + (final && won ? CHAMPION_XP : 0));
  c.gems += gemsWon;
  c.xp += xp.gained;
  saveCup(c);
  syncLevel();
  if (won) sfx.play(final ? 'revealLegendary' : 'win');
  if (gemsWon) setTimeout(() => sfx.play('gems'), 450);
  cupFresh.add(`${cm.r}:${cm.m}`);
  // The rest of the round plays out while the results are up.
  void settleCup(cm.r);
  resultsEl = cupResultsSheet(b, {
    you: cm.side, won, round: ROUNDS[cm.r].name, ko, champion: final && won, finalist: final && !won, bonus,
  }, () => { sfx.play('ui'); backToCup(); }, reward, xp);
  ui.append(resultsEl);
}

/** From a cup fight (finished or left) back to the bracket. */
function backToCup(): void {
  cupMatch = null;
  toMenu();
  showCup();
}

// --- Cup lobby (with friends) ---------------------------------------------------------------------

interface CupRoom {
  screen: CupLobbyScreen;
  host: CupHost | null;
  guest: CupGuest | null;
  friends: LobbyFriend[] | null | 'signed-out' | 'error';
  invites: Map<string, { state: InviteState; at: number }>;
  poll: number;
}
let cupRoom: CupRoom | null = null;

const LOBBY_ERRORS: Record<CupLobbyError, string> = {
  offline: "Couldn't reach the match server. Check your internet connection and try again.",
  browser: "This browser can't make direct connections. Try an up-to-date Chrome, Edge, Firefox or Safari.",
  'no-room': 'No open cup lobby with that code. It closes when its host leaves or starts the cup.',
  full: 'That cup lobby is full.',
  version: 'You and the host are on different versions of the game. Both of you reload the game, then try again.',
  started: 'That cup has already started.',
  closed: 'The host closed the lobby.',
};

function lobbyMember(): LobbyMember {
  const lv = heroLevel();
  return { pid: myPid(), build: { ...player! }, level: lv };
}

/** Joins a friend's cup lobby, after asking when it would end a cup in progress. */
function joinCup(code: string): void {
  if (!player) { pendingRoom = code; openCreator(true); return; }
  const st = cup && statusOf(cup);
  if (st?.kind === 'play') {
    confirmBox(ui, 'Join a new cup?', `You are in the ${ROUNDS[st.round].name} of your cup. Joining this one ends it.`, 'Join', () => openCupLobby('guest', code), 'trophy');
    return;
  }
  openCupLobby('guest', code);
}

function openCupLobby(role: 'host' | 'guest', code = ''): void {
  if (!player || session) return;
  closeCupRoom();
  closeSheet();
  sfx.unlock();
  const screen = new CupLobbyScreen({
    onStart: () => beginSharedCup(),
    onClose: () => { closeCupRoom(); refreshMenu(); },
    onInvite: (f) => inviteToCup(f),
    onSignIn: () => { closeCupRoom(); openAccount(); },
    onRetry: () => { const h = cupRoom?.host; if (h) void h.start(); },
  });
  const room: CupRoom = { screen, host: null, guest: null, friends: null, invites: new Map(), poll: 0 };
  cupRoom = room;
  if (role === 'host') {
    const host = new CupHost(lobbyMember());
    room.host = host;
    host.onChange = () => { if (cupRoom === room) syncCupRoom(); };
    void host.start();
    void loadLobbyFriends(room);
    room.poll = window.setInterval(() => void watchCupInvites(room), 3000);
  } else {
    const guest = new CupGuest(code, lobbyMember());
    room.guest = guest;
    guest.onChange = () => { if (cupRoom === room) syncCupRoom(); };
    guest.onStart = (c) => {
      if (cupRoom !== room) return;
      closeCupRoom();
      setCup(c);
      sfx.play('confirm');
      showCup();
    };
    guest.start();
  }
  ui.append(screen.el);
  setCovered(true);
  syncCupRoom();
}

function syncCupRoom(): void {
  const r = cupRoom;
  if (!r) return;
  let v: CupLobbyView;
  if (r.host) {
    const h = r.host;
    const friends = Array.isArray(r.friends) ? r.friends.map((f) => ({ ...f, invite: r.invites.get(f.uid)?.state })) : r.friends;
    v = { role: 'host', state: h.state, error: h.error ? LOBBY_ERRORS[h.error] : undefined, code: h.code, members: h.members, friends };
  } else {
    const g = r.guest!;
    v = { role: 'guest', state: g.state === 'in' ? 'in' : g.state === 'error' ? 'error' : 'joining', error: g.error ? LOBBY_ERRORS[g.error] : undefined, code: g.code, members: g.members };
  }
  r.screen.set(v);
}

async function loadLobbyFriends(room: CupRoom): Promise<void> {
  const who = me();
  if (!who) { room.friends = 'signed-out'; syncCupRoom(); return; }
  try {
    const d = await social().then((m) => m.load(who));
    const now = Date.now();
    room.friends = d.friends.map((f) => ({ uid: f.uid, name: f.name, online: isOnline(f.seen, now) }));
  } catch {
    room.friends = 'error';
  }
  if (cupRoom === room) syncCupRoom();
}

function inviteToCup(f: LobbyFriend): void {
  const room = cupRoom, who = me(), host = room?.host;
  if (!room || !who || !host || host.state !== 'open') return;
  const code = host.code;
  room.invites.set(f.uid, { state: 'sending', at: Date.now() });
  syncCupRoom();
  social().then((m) => m.invite(who, f.uid, code)).then(() => {
    room.invites.set(f.uid, { state: 'open', at: Date.now() });
    if (cupRoom === room) syncCupRoom();
  }, (e) => {
    console.warn('[cup invite]', e);
    room.invites.set(f.uid, { state: 'failed', at: Date.now() });
    if (cupRoom === room) syncCupRoom();
  });
}

/** Host side: notices answers to invites, and lets unanswered ones lapse. */
async function watchCupInvites(room: CupRoom): Promise<void> {
  const who = me();
  if (!who || cupRoom !== room) return;
  const inRoom = new Set(room.host?.members.map((m) => m.pid) ?? []);
  for (const [uid, inv] of room.invites) {
    if (inv.state !== 'open') continue;
    const drop = () => social().then((m) => m.dropInvite(who.uid, uid)).catch(() => {});
    if (inRoom.has(uid)) { room.invites.delete(uid); void drop(); continue; }
    if (Date.now() - inv.at > INVITE_SECONDS * 1000) { inv.state = 'expired'; void drop(); continue; }
    const got = await social().then((m) => m.inviteState(who.uid, uid)).catch(() => undefined);
    if (got?.state === 'declined') { inv.state = 'declined'; sfx.play('back'); void drop(); }
  }
  if (cupRoom === room) syncCupRoom();
}

/** Host: draws the cup with everyone in the party and sends it to them. */
function beginSharedCup(): void {
  const room = cupRoom, host = room?.host;
  if (!room || !host || host.state !== 'open') return;
  const members = host.members;
  const drawn = newCup(members.map((m) => ({ build: m.build, level: m.level, pid: m.pid })), members[0].level, members.length > 1);
  // Keep exactly what the others will read back, so every device fights the same builds.
  const c = parseCup(JSON.parse(JSON.stringify(drawn))) ?? drawn;
  host.begin(c);
  closeCupRoom();
  setCup(c);
  showCup();
}

/** Leaves the lobby (a started cup's room closes itself once everyone has it). */
function closeCupRoom(): void {
  const r = cupRoom;
  if (!r) return;
  cupRoom = null;
  clearInterval(r.poll);
  if (r.host && !r.host.isStarted) r.host.close();
  r.guest?.close();
  const who = me();
  if (who) for (const [uid, inv] of r.invites) if (inv.state === 'open' || inv.state === 'sending') void social().then((m) => m.dropInvite(who.uid, uid)).catch(() => {});
  r.screen.dispose();
  r.screen.el.remove();
  setCovered(!!sheet);
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
  if (!covered || !painted) { view.frame(dt); painted = true; }
  if (state !== 'menu') hud.update(view.paused ? 0 : dt * speed);
  if (state === 'battle' && battle) {
    const [a, b] = battle.fighters;
    music.update(Math.min(hpRatio(a), hpRatio(b)), a.empowered, view.paused);
  }
  requestAnimationFrame(loop);
}

// --- Input -----------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || sheet || title || cupRoom) return;
  if (state === 'menu' && e.key === 'Enter' && !session) startFight();
  else if (state === 'battle') {
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'Escape') { if (session) askLeave(); else if (cupMatch) backToCup(); else toMenu(); }
    else if (e.key === 'c' || e.key === 'C') cycleCamera();
    else if (e.key === '1' || e.key === '2' || e.key === '3') {
      speed = [1, 2, 4][Number(e.key) - 1];
      save('al.speed', speed);
      view.speed = speed;
      hud.setSpeed(speed);
    }
  } else if (state === 'results' && e.key === 'Enter' && !session) { if (cupMatch) backToCup(); else startFight(); }
});
// Browsers only start audio after a gesture.
window.addEventListener('pointerdown', () => { sfx.unlock(); music.unlocked(); }, { capture: true });
window.addEventListener('keydown', () => { sfx.unlock(); music.unlocked(); }, { capture: true, once: true });
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
  if (code.length === CODE_LENGTH && isCupCode(code)) joinCup(code);
  else if (code.length === CODE_LENGTH) startOnline('guest', code);
  else if (saved && player) startOnline(saved.role, saved.code, saved);
  // Back from a reload after signing in: straight to the menu.
  else if (consumeResume()) { if (!player) openCreator(true); }
  else showTitle();
  restoreAccount();
}

/** The title over the live arena; the first tap opens the menu, or character creation for a new player. */
function showTitle(): void {
  menu.el.hidden = true;
  title = new TitleScreen(() => {
    title = null;
    sfx.unlock();
    sfx.play('confirm');
    if (!player) { openCreator(true); menu.el.hidden = false; return; }
    menu.el.hidden = false;
    menu.el.classList.remove('enter');
    void menu.el.offsetWidth;
    menu.el.classList.add('enter');
  });
  ui.append(title.el);
  // Players coming back on a new device sign in before making a hero.
  if (accountsEnabled && !accountStatus().name) {
    const btn = h('button.btn.sm.title-acct', {
      onclick: (e: Event) => { e.stopPropagation(); openAccount(); },
    }, icon('user'), 'Sign in');
    const off = onAccount((s) => { if (s.name) { btn.remove(); off(); } });
    title.el.append(btn);
  }
}
requestAnimationFrame((t) => {
  last = t;
  document.getElementById('boot')?.remove();
  requestAnimationFrame(loop);
});

// Handle for poking at the running game from the console.
(window as unknown as { game?: unknown }).game = { view, get battle() { return battle; } };
