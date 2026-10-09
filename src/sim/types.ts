export type FighterId = 0 | 1;
export type DamageType = 'physical' | 'magic' | 'true';

/**
 * Body forms. A form is only a body: size, build and base attributes. What a
 * fighter can *do* comes entirely from the gear it carries.
 */
export type FormId = 'robust' | 'agile' | 'balanced' | 'slender' | 'mighty' | 'ethereal';

/**
 * The six equipment slots every character has:
 *  - main: the main weapon, one- or two-handed
 *  - secondary: a one-handed weapon or tool, drawn when used
 *  - special: an item that works on its own (auras, familiars, item ultimates)
 *  - head, chest, boots: armour pieces
 */
export type GearSlot = 'main' | 'secondary' | 'special' | 'head' | 'chest' | 'boots';

export type MainWeaponId =
  | 'longsword' | 'katana' | 'mace' | 'dagger' | 'ember_wand'
  | 'warhammer' | 'spear' | 'greataxe' | 'arcane_staff' | 'longbow';
export type SecondaryId =
  | 'kite_shield' | 'parrying_dagger' | 'buckler' | 'throwing_knives' | 'hand_crossbow'
  | 'wind_chakram' | 'frost_wand' | 'war_horn';
export type SpecialId =
  | 'meteor_sigil' | 'phantom_blade' | 'wisp_lantern' | 'phoenix_feather' | 'echo_stone'
  | 'vampiric_fang' | 'ember_core' | 'frost_core';
export type HeadId =
  | 'berserker_mask' | 'iron_helm' | 'chrono_circlet' | 'executioner_hood' | 'storm_crown' | 'duelist_band';
export type ChestId =
  | 'plate_armor' | 'phase_cloak' | 'thornmail' | 'mirror_mail' | 'leather_jerkin' | 'mage_robe';
export type BootsId =
  | 'leather_boots' | 'zephyr_boots' | 'iron_greaves' | 'shadow_treads' | 'colossus_boots' | 'leaping_boots';

export type GearId = MainWeaponId | SecondaryId | SpecialId | HeadId | ChestId | BootsId;

/** Gear id type allowed in each slot. */
export interface GearSlotIds {
  main: MainWeaponId;
  secondary: SecondaryId;
  special: SpecialId;
  head: HeadId;
  chest: ChestId;
  boots: BootsId;
}

/** What a character has equipped. `main` is required; every other slot may be empty. */
export type GearSet = { main: MainWeaponId } & { [S in Exclude<GearSlot, 'main'>]?: GearSlotIds[S] };

export type StatusId =
  | 'burn' | 'poison' | 'chill' | 'frozen' | 'stun'
  | 'rage' | 'haste' | 'mark' | 'ironskin' | 'vulnerable';

/**
 * Animation the renderer plays for an ability. The sim never reads it; the
 * renderer picks the variant for the weapon actually in hand.
 */
export type AnimKey =
  | 'slash' | 'thrust' | 'overhead' | 'bash' | 'spin' | 'cast' | 'castBig'
  | 'guard' | 'counter' | 'dash' | 'evade' | 'roll' | 'blink' | 'leap' | 'roar'
  | 'flurry' | 'slam' | 'throw' | 'shoot' | 'crossbow' | 'horn' | 'harden' | 'barrier' | 'item';

export type ProjectileStyle =
  | 'arcane' | 'hex' | 'wave' | 'groundwave' | 'meteor' | 'arrow' | 'knife' | 'bolt' | 'fire' | 'flamewave' | 'chakram' | 'wisp';

export interface Stats {
  maxHp: number;
  power: number;
  armor: number;
  resist: number;
  /** Multiplier on action speed (higher = faster windups and recoveries). */
  attackSpeed: number;
  moveSpeed: number;
  critChance: number;
  critMult: number;
  lifesteal: number;
  /** Fraction of cooldown removed (0..0.6). */
  cdr: number;
  energyRegen: number;
  /** Fraction of crowd-control duration removed. */
  tenacity: number;
  /** Fraction of melee damage taken that is reflected. */
  thorns: number;
  healMult: number;
  /** Multiplier on all outgoing damage (berserker, rage...). */
  damageMult: number;
  /** Multiplier on incoming damage (mark, iron skin...). */
  damageTakenMult: number;
  /** Light hits with less stagger than this don't interrupt windups. */
  poise: number;
  /** Multiplier on melee and AoE reach (long limbs). */
  reach: number;
  /** Multiplier on knockback dealt and on stagger when checked against poise. */
  force: number;
  /** Multiplier on knockback received. */
  knockbackTaken: number;
}

export interface StatusApply {
  status: StatusId;
  duration: number;
  stacks?: number;
}

/**
 * `item` abilities belong to the special item: the item performs them on its
 * own, so the fighter's body stays free to keep fighting.
 */
export type AbilitySlot = 'basic' | 'skill' | 'secondary' | 'defense' | 'item' | 'evade';
export type AbilityKind =
  | 'melee' | 'projectile' | 'guard' | 'dash' | 'buff' | 'blink' | 'aoe' | 'meteor' | 'blade';

export interface AbilityDef {
  id: string;
  name: string;
  slot: AbilitySlot;
  kind: AbilityKind;
  /** Effective reach, center to center (melee/aoe) or max sensible distance (projectiles). */
  range: number;
  cost: number;
  cooldown: number;
  /** Seconds before the ability takes effect, including any weapon draw (see `draw`). */
  windup: number;
  active: number;
  /** Seconds after the effect, including any weapon stow (see `stow`). */
  recovery: number;
  /** Damage multiplier applied to the user's power. */
  power: number;
  damageType: DamageType;
  hits?: number;
  knockback?: number;
  /** Metres moved forward over windup+active. */
  lunge?: number;
  /** Hit-stun applied on hit (seconds). Interrupts windups. */
  stagger?: number;
  stun?: number;
  applies?: StatusApply[];
  /** Telegraphed big attack: causes hitstop, can be parried. */
  heavy?: boolean;
  unblockable?: boolean;
  /** Can't be interrupted by staggers during windup. */
  hyperArmor?: boolean;
  projectile?: {
    speed: number; radius: number; style: ProjectileStyle; ground?: boolean;
    /** Flies out and comes back to the thrower, able to hit on the way back. */
    returns?: boolean;
  };
  guard?: { reduction: number; parryWindow: number; counterPower?: number; reflectProjectiles?: boolean };
  /**
   * `through`: attacks pass through the enemy. On an evade it means "roll through
   * the enemy when they are within reach" instead of backstepping.
   */
  dash?: { distance: number; through?: boolean; iframes: number; strike?: boolean };
  buff?: StatusApply[];
  heal?: number;
  /** Shield granted on activation, as a fraction of max HP. */
  shieldGain?: number;
  /** Seconds of invulnerability starting with the active phase. */
  iframes?: number;
  /** Airborne during the windup (leaping attacks) or the dash itself (leaping evades). */
  airborne?: boolean;
  anim: AnimKey;
  /** Short description for the UI. */
  desc: string;
  /** Gear slot the ability comes from (set when a build's abilities are assembled). */
  from?: GearSlot;
  /**
   * Secondary weapons only: seconds at the start of the windup spent getting
   * the weapon out (stowing a two-handed main first), and at the end of the
   * recovery putting it away again. Already included in windup/recovery.
   */
  draw?: number;
  stow?: number;
}

export type Phase = 'windup' | 'active' | 'recovery';

export interface ActionState {
  ability: number;
  phase: Phase;
  /** Elapsed seconds inside the current phase. */
  t: number;
  /** Total elapsed seconds since the action began. */
  total: number;
  windup: number;
  active: number;
  recovery: number;
  /** Seconds of the windup spent drawing, and of the recovery spent stowing (already scaled). */
  draw: number;
  stow: number;
  hitsDone: number;
  /** For dash strikes: whether the pass-through hit landed. */
  connected: boolean;
  /** Cancelled windup (feint). */
  feint: boolean;
  /** Target x captured at cast (meteor, blink). */
  targetX: number;
  startX: number;
  /** Counter-attack triggered by a parry. */
  isCounter: boolean;
  /** World direction of travel for dashes/lunges. */
  dir: number;
  /** Dash crosses through the opponent. */
  through: boolean;
}

/**
 * An attack the special item performs on its own (meteor, phantom blade),
 * running alongside whatever the fighter's body is doing.
 */
export interface ItemAction {
  ability: number;
  /** windup: the item charges; travel: it flies to the target; active: it strikes; return: it comes back. */
  phase: 'windup' | 'travel' | 'active' | 'return';
  t: number;
  /** Item position in the world (blade items move; others stay on the owner). */
  x: number;
  y: number;
  targetX: number;
  hitsDone: number;
}

/** A familiar that fires on its own (wisp lantern). */
export interface Familiar {
  /** Seconds until it can fire again. */
  cd: number;
  /** Seconds left in the current charge-up, or 0 when idle. */
  charge: number;
}

export interface StatusInstance {
  id: StatusId;
  remaining: number;
  stacks: number;
  /** Power of the source, used by DoTs. */
  sourcePower: number;
  source: FighterId;
  /** DoT damage accumulated since the last damage event. */
  acc: number;
  tickT: number;
}

export interface Projectile {
  id: number;
  px: number;
  py: number;
  owner: FighterId;
  style: ProjectileStyle;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  /** Ability index on the thrower, or -1 for familiar shots. */
  ability: number;
  /** The ability that fired it (kept when the projectile is reflected). */
  def: AbilityDef;
  power: number;
  ground: boolean;
  reflected: boolean;
  /** Meteor: x where it lands. */
  targetX: number;
  alive: boolean;
  /** Returning projectiles: true once on the way back. */
  back: boolean;
  /** Returning projectiles: already hit on the way out / on the way back. */
  hitOut: boolean;
  hitBack: boolean;
}

export interface FighterTotals {
  damageDealt: number;
  damageTaken: number;
  hits: number;
  crits: number;
  parries: number;
  blocks: number;
  evades: number;
  feints: number;
  biggestHit: number;
  healed: number;
}

export type BattleEvent =
  | { type: 'actionStart'; f: FighterId; ability: number }
  | { type: 'actionActive'; f: FighterId; ability: number }
  | { type: 'itemStart'; f: FighterId; ability: number }
  | { type: 'feint'; f: FighterId }
  | { type: 'hit'; attacker: FighterId; target: FighterId; amount: number; crit: boolean; dtype: DamageType;
      blocked: boolean; heavy: boolean; ability: string; x: number; y: number; killing: boolean; dot?: boolean; echo?: boolean }
  | { type: 'parry'; defender: FighterId; attacker: FighterId; x: number; y: number }
  | { type: 'evade'; f: FighterId }
  | { type: 'heal'; f: FighterId; amount: number }
  | { type: 'shield'; f: FighterId; amount: number }
  | { type: 'shieldBreak'; f: FighterId }
  | { type: 'status'; f: FighterId; status: StatusId; stacks: number }
  | { type: 'wallSplat'; f: FighterId; x: number }
  | { type: 'revive'; f: FighterId }
  | { type: 'lightning'; f: FighterId; x: number }
  | { type: 'reflect'; f: FighterId; x: number; y: number }
  | { type: 'shockwave'; x: number; radius: number; f: FighterId; style: 'slam' | 'nova' | 'meteor' | 'whirl' }
  | { type: 'projectileEnd'; id: number; x: number; y: number; style: ProjectileStyle; hit: boolean }
  | { type: 'blink'; f: FighterId; from: number; to: number }
  | { type: 'familiar'; f: FighterId }
  | { type: 'thought'; f: FighterId; text: string }
  | { type: 'plan'; f: FighterId; plan: string }
  | { type: 'ko'; f: FighterId }
  /** Regular time is up: night falls and both fighters deal double damage. */
  | { type: 'overtime' }
  | { type: 'end'; winner: FighterId | -1; reason: 'ko' | 'time' };
