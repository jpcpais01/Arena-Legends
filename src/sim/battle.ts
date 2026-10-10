import { Rng } from '../core/rng';
import { clamp, dsin } from '../core/math';
import { Brain, type FighterBrain } from './ai/brain';
import {
  ARENA_HALF_WIDTH, BASE_ENERGY_REGEN, BODY_GAP, DT, ENERGY_ON_DEAL, ENERGY_ON_TAKE, MAX_ENERGY,
  MATCH_TIME, OVERTIME_DAMAGE, ROUND_TIME, START_GAP, WALL_SPLAT_SPEED,
} from './constants';
import {
  createFighter, getStatus, isDisabled, isSilenced, isUnstoppable, reachOf, refreshStats, type Fighter, type FighterConfig,
} from './fighter';
import type {
  AbilityDef, BattleEvent, DamageType, Familiar, FighterId, Projectile, StatusApply, StatusId, Zone, ZoneKind,
} from './types';

/** The wisp lantern's spirit bolt (familiar shots carry ability index -1). */
export const WISP_BOLT: AbilityDef = {
  id: 'wisp_bolt', name: 'Spirit Bolt', slot: 'item', kind: 'projectile',
  range: 9, cost: 0, cooldown: 3.2, windup: 0.35, active: 0, recovery: 0,
  power: 0.5, damageType: 'magic', stagger: 0.1,
  projectile: { speed: 12, radius: 0.3, style: 'wisp' },
  anim: 'item', desc: 'The lantern spirit shoots a small bolt.',
};
/** The hunting hawk's dive: marks whoever it strikes. */
export const HAWK_DIVE: AbilityDef = {
  id: 'hawk_dive', name: 'Hawk Dive', slot: 'item', kind: 'projectile',
  range: 9, cost: 0, cooldown: 4.5, windup: 0.3, active: 0, recovery: 0,
  power: 0.55, damageType: 'physical', stagger: 0.1,
  applies: [{ status: 'mark', duration: 3 }],
  projectile: { speed: 15, radius: 0.35, style: 'hawk' },
  anim: 'item', desc: 'The hawk dives and marks.',
};
/** The dragon whelp's breath: a short cone of fire. */
export const WHELP_BREATH: AbilityDef = {
  id: 'whelp_breath', name: 'Whelp Breath', slot: 'item', kind: 'projectile',
  range: 4.5, cost: 0, cooldown: 5, windup: 0.4, active: 0, recovery: 0,
  power: 0.45, damageType: 'magic', stagger: 0.08,
  applies: [{ status: 'burn', duration: 2.5, stacks: 2 }],
  projectile: { speed: 11, radius: 0.55, style: 'breath' },
  anim: 'item', desc: 'The whelp breathes fire.',
};
const FAMILIAR_SHOT: Record<Familiar['kind'], AbilityDef> = { wisp: WISP_BOLT, hawk: HAWK_DIVE, whelp: WHELP_BREATH };
const FAMILIAR_RANGE = 9;
/** Gravity on lobbed flasks (m/s²): a lazy, readable arc. */
const LOB_GRAVITY = 16;
/** Statuses a cleanse (or a rewind) washes off. */
const HARMFUL: StatusId[] = ['burn', 'poison', 'chill', 'mark', 'vulnerable', 'silence', 'root', 'fear'];
/** Crowd control: interrupts what the target was doing. */
const CC: StatusId[] = ['stun', 'frozen', 'fear'];
/** Sands of Time: the past it remembers (seconds per sample, samples). */
const HISTORY_STEP = 0.25;
const HISTORY_SIZE = 12;
/** Caltrops patch: radius, seconds, seconds between cuts, damage per cut (× power). */
const CALTROPS = { radius: 1.6, life: 8, every: 0.5, power: 0.16 };
/** Savate Boots: the push kick that opens the evade. */
const SAVATE_KICK: AbilityDef = {
  id: 'savate_kick', name: 'Push Kick', slot: 'evade', kind: 'melee',
  range: 1.9, cost: 0, cooldown: 0, windup: 0, active: 0, recovery: 0,
  power: 0.6, damageType: 'physical', knockback: 5, stagger: 0.25,
  anim: 'evade', desc: 'Push kick.',
};

export interface BattleConfig {
  seed: number;
  fighters: [FighterConfig, FighterConfig];
  /** Overrides the AI controller per side (benchmarks against older AIs). */
  brains?: [BrainFactory?, BrainFactory?];
}

export type BrainFactory = (f: Fighter, variance: number) => FighterBrain;

interface HitOptions {
  mult?: number;
  isCounter?: boolean;
  fromProjectile?: Projectile;
  /** Hit came from an AoE, so facing does not matter for guards. */
  aoe?: boolean;
  /** Overrides the ability's heavy flag (multi-hit flurries). */
  heavyOverride?: boolean;
}

const BODY_HEIGHT = 1.9;
const GRAVITY = 30;

/**
 * Deterministic battle simulation. Pure data in, events out; it knows nothing
 * about rendering. Advance with `step()` at a fixed DT.
 */
export class Battle {
  readonly rng: Rng;
  readonly seed: number;
  readonly fighters: [Fighter, Fighter];
  readonly brains: [FighterBrain, FighterBrain];
  readonly projectiles: Projectile[] = [];
  /** Totems and caltrops on the ground. */
  readonly zones: Zone[] = [];
  /** Events produced since the consumer last drained them. */
  events: BattleEvent[] = [];
  tick = 0;
  time = 0;
  hitstop = 0;
  over = false;
  winner: FighterId | -1 = -1;
  /** Seconds since the battle ended (physics keeps running for the KO). */
  endTime = 0;
  private nextProjectileId = 1;
  private nextZoneId = 1;

  constructor(cfg: BattleConfig) {
    this.seed = cfg.seed >>> 0;
    this.rng = new Rng(this.seed);
    const a = createFighter(0, cfg.fighters[0]);
    const b = createFighter(1, cfg.fighters[1]);
    a.x = a.px = -START_GAP;
    b.x = b.px = START_GAP;
    this.fighters = [a, b];
    const make = (i: 0 | 1, f: Fighter, v: number): FighterBrain => cfg.brains?.[i]?.(f, v) ?? new Brain(f, v);
    this.brains = [make(0, a, this.rng.next()), make(1, b, this.rng.next())];
    for (const f of this.fighters) refreshStats(f);
  }

  emit(e: BattleEvent): void {
    if (!this.sandbox) this.events.push(e);
  }

  /** True for look-ahead copies made by `fork`: their events are dropped. */
  sandbox = false;

  /**
   * Independent copy of the whole battle for AI look-ahead. The copy draws
   * from its own RNG (`seed`) so it can't peek at the real battle's future
   * rolls, drops its events, and is driven by the brains `brains` returns.
   */
  fork(seed: number, brains: (copy: Battle) => [FighterBrain, FighterBrain]): Battle {
    const c = Object.create(Battle.prototype) as Battle;
    const w = c as unknown as Record<string, unknown>;
    for (const k of Object.keys(this)) w[k] = cloneValue((this as unknown as Record<string, unknown>)[k]);
    w.rng = new Rng(seed);
    w.fighters = [cloneFighter(this.fighters[0]), cloneFighter(this.fighters[1])];
    w.events = [];
    c.sandbox = true;
    w.brains = brains(c);
    return c;
  }

  /** Remove and return all pending events. */
  drainEvents(): BattleEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  other(f: Fighter): Fighter {
    return this.fighters[f.id === 0 ? 1 : 0];
  }

  // ---------------------------------------------------------------------------
  // Main step
  // ---------------------------------------------------------------------------

  step(): void {
    for (const f of this.fighters) { f.px = f.x; f.py = f.y; }
    for (const p of this.projectiles) { p.px = p.x; p.py = p.y; }

    if (this.hitstop > 0) {
      this.hitstop -= DT;
      return;
    }
    this.tick++;

    if (this.over) {
      this.endTime += DT;
      for (const f of this.fighters) {
        this.updateStatuses(f, false);
        if (f.action && f.alive) this.updateAction(f);
        this.physics(f);
      }
      this.updateProjectiles();
      return;
    }

    this.time += DT;
    const [a, b] = this.fighters;
    if (this.time >= ROUND_TIME && !a.empowered) {
      a.empowered = b.empowered = true;
      this.emit({ type: 'overtime' });
    }

    for (const f of this.fighters) {
      this.updateTimers(f);
      refreshStats(f);
    }

    // Alternate think order every tick so neither side gets a systematic edge.
    const first = (this.tick & 1) === 0 ? 0 : 1;
    this.brains[first].think(this);
    this.brains[1 - first].think(this);

    if ((this.tick & 1) === 0) { this.updateAction(a); this.updateAction(b); }
    else { this.updateAction(b); this.updateAction(a); }
    this.updateItem(a);
    this.updateItem(b);

    this.physics(a);
    this.physics(b);
    this.resolveBodies();
    this.updateFacing(a);
    this.updateFacing(b);
    this.updateProjectiles();
    this.updateZones();
    this.checkEnd();
  }

  // ---------------------------------------------------------------------------
  // Timers, statuses, energy
  // ---------------------------------------------------------------------------

  private updateTimers(f: Fighter): void {
    if (!f.alive) return;
    for (let i = 0; i < f.cooldowns.length; i++) if (f.cooldowns[i] > 0) f.cooldowns[i] -= DT;
    if (f.stagger > 0) f.stagger -= DT;
    if (f.invuln > 0) f.invuln -= DT;
    if (f.mirrorCd > 0) f.mirrorCd -= DT;
    if (f.ironWillCd > 0) f.ironWillCd -= DT;
    if (f.dreadCd > 0) f.dreadCd -= DT;
    if (f.foresightCd > 0) f.foresightCd -= DT;
    if (f.garbT > 0) f.garbT -= DT;
    f.sinceHurt += DT;
    f.sinceHit += DT;
    this.updatePassives(f);

    f.energy = Math.min(MAX_ENERGY, f.energy + BASE_ENERGY_REGEN * f.stats.energyRegen * DT);

    if (f.familiar) this.updateFamiliar(f);

    for (let i = f.echoQueue.length - 1; i >= 0; i--) {
      const e = f.echoQueue[i];
      e.delay -= DT;
      if (e.delay <= 0) {
        f.echoQueue.splice(i, 1);
        const t = this.other(f);
        if (t.alive && t.invuln <= 0) {
          const dealt = this.applyDamage(f, t, e.amount, 'true');
          this.emit({ type: 'hit', attacker: f.id, target: t.id, amount: dealt, crit: false, dtype: e.dtype,
            blocked: false, heavy: false, ability: 'echo', x: t.x, y: t.y + 1.2, killing: !t.alive, echo: true });
        }
      }
    }

    this.updateStatuses(f, true);
  }

  private updateStatuses(f: Fighter, dots: boolean): void {
    const list = f.statuses;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (!s) continue;
      s.remaining -= DT;
      if (dots && (s.id === 'burn' || s.id === 'poison') && f.alive) {
        const dps = s.id === 'burn' ? s.sourcePower * 0.17 * s.stacks : s.sourcePower * 0.065 * s.stacks;
        s.acc += dps * DT;
        s.tickT += DT;
        if (s.tickT >= 0.5 || s.remaining <= 0) {
          const src = this.fighters[s.source];
          const dealt = this.applyDamage(src, f, s.acc, s.id === 'burn' ? 'magic' : 'true');
          if (dealt > 0) {
            this.emit({ type: 'hit', attacker: src.id, target: f.id, amount: dealt, crit: false, dtype: 'magic',
              blocked: false, heavy: false, ability: s.id, x: f.x, y: f.y + 1.4, killing: !f.alive, dot: true });
          }
          s.acc = 0;
          s.tickT = 0;
          // A revive replaces the status list; stop iterating the stale one.
          if (f.statuses !== list) return;
        }
      }
      if (dots && s.id === 'regen' && f.alive) {
        s.acc += f.stats.maxHp * 0.02 * DT;
        s.tickT += DT;
        if (s.tickT >= 0.5 || s.remaining <= 0) {
          this.heal(f, s.acc);
          s.acc = 0;
          s.tickT = 0;
        }
      }
      if (s.remaining <= 0) list.splice(i, 1);
    }
  }

  /** Passive gear that ticks on its own: wards, mending wood, the hourglass's memory, a building charge. */
  private updatePassives(f: Fighter): void {
    const has = f.has;
    if (has.has('ward_stone')) {
      if (f.shield > 0) f.wardCd = Math.max(f.wardCd, 2);
      else if ((f.wardCd -= DT) <= 0) {
        f.wardCd = 10;
        const amount = Math.round(f.stats.maxHp * 0.08);
        f.shield = amount;
        this.emit({ type: 'shield', f: f.id, amount });
      }
    }
    if (has.has('heartwood_armor') && f.sinceHurt > 2.5 && f.hp < f.stats.maxHp) {
      f.mendAcc += f.stats.maxHp * 0.012 * DT;
      if (f.mendAcc >= f.stats.maxHp * 0.006) { this.heal(f, f.mendAcc); f.mendAcc = 0; }
    }
    if (has.has('hourglass') && !f.rewindUsed && (f.histT -= DT) <= 0) {
      f.histT = HISTORY_STEP;
      const i = f.histI % HISTORY_SIZE;
      f.hist[i * 2] = f.x;
      f.hist[i * 2 + 1] = f.hp;
      f.histI++;
    }
    if (has.has('charger_cuisses')) {
      const e = this.other(f);
      const toward = Math.sign(e.x - f.x);
      const running = !f.action && f.move === toward && f.vx * toward > f.stats.moveSpeed * 0.6;
      if (running) f.chargeT = Math.min(2, f.chargeT + DT);
      else if (!f.action) f.chargeT = Math.max(0, f.chargeT - DT * (f.chargeT >= 0.8 ? 0.6 : 2));
    }
  }

  applyStatus(target: Fighter, source: Fighter, apply: StatusApply): void {
    if (!target.alive) return;
    let dur = apply.duration;
    const cc = CC.includes(apply.status);
    const debuff = HARMFUL.includes(apply.status) || cc;
    if (debuff && target.id !== source.id) {
      if (isUnstoppable(target) && (cc || apply.status === 'root' || apply.status === 'silence')) {
        this.emit({ type: 'callout', f: target.id, text: 'Unstoppable', color: '#c8ccd8' });
        return;
      }
      dur *= 1 - target.stats.tenacity;
      if (target.has.has('runic_mail')) dur *= 0.7;
    }
    if (cc) {
      if (target.has.has('iron_helm') && target.ironWillCd <= 0) {
        target.ironWillCd = 10;
        this.emit({ type: 'thought', f: target.id, text: 'Iron Will shrugs off the stun!' });
        return;
      }
      if (target.action && !target.action.feint) target.action = null;
    }
    const maxStacks: Partial<Record<StatusId, number>> = { burn: 3, poison: 4, chill: 5, momentum: 5 };
    const existing = getStatus(target, apply.status);
    const add = apply.stacks ?? 1;
    if (existing) {
      existing.remaining = Math.max(existing.remaining, dur);
      existing.stacks = Math.min(maxStacks[apply.status] ?? 1, existing.stacks + add);
      existing.sourcePower = Math.max(existing.sourcePower, source.stats.power);
      existing.source = source.id;
    } else {
      target.statuses.push({
        id: apply.status, remaining: dur, stacks: Math.min(maxStacks[apply.status] ?? 1, add),
        sourcePower: source.stats.power, source: source.id, acc: 0, tickT: 0,
      });
    }
    const st = getStatus(target, apply.status)!;
    if (apply.status === 'chill' && st.stacks >= 5 && !isUnstoppable(target)) {
      target.statuses.splice(target.statuses.indexOf(st), 1);
      this.applyStatus(target, source, { status: 'frozen', duration: 1.0 });
      return;
    }
    this.emit({ type: 'status', f: target.id, status: apply.status, stacks: st.stacks });
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  canUse(f: Fighter, idx: number): boolean {
    const ab = f.abilities[idx];
    if (!f.alive) return false;
    // Item attacks run on their own: the body may be busy or even stunned.
    // Silence stops everything but basic attacks and the evade, the item's own attacks included.
    if (ab.slot !== 'basic' && ab.slot !== 'evade' && isSilenced(f)) return false;
    if (ab.slot === 'item') return !f.item && f.cooldowns[idx] <= 0 && f.energy >= ab.cost;
    if (f.action || isDisabled(f) || f.uses[idx] === 0 || getStatus(f, 'fear')) return false;
    // Rooted: no dashing, blinking or trading places.
    if ((ab.kind === 'dash' || ab.kind === 'blink' || ab.kind === 'swap') && getStatus(f, 'root')) return false;
    return f.cooldowns[idx] <= 0 && f.energy >= ab.cost;
  }

  /** Effective cooldown after reductions. */
  cooldownOf(f: Fighter, ab: AbilityDef): number {
    return ab.cooldown * (1 - f.stats.cdr);
  }

  startAction(f: Fighter, idx: number): boolean {
    if (!this.canUse(f, idx)) return false;
    const ab = f.abilities[idx];
    const e = this.other(f);
    const spd = f.stats.attackSpeed;
    f.cooldowns[idx] = this.cooldownOf(f, ab);
    f.energy -= ab.cost;
    if (f.uses[idx] > 0) f.uses[idx]--;

    if (ab.slot === 'item') {
      const hx = f.x - f.facing * 0.5;
      f.item = { ability: idx, phase: 'windup', t: 0, x: hx, y: 2.1, targetX: e.x, hitsDone: 0 };
      this.emit({ type: 'itemStart', f: f.id, ability: idx });
      return true;
    }

    let dir: number = f.facing;
    let through = !!ab.dash?.through;
    if (ab.slot === 'evade' && f.has.has('shadow_garb')) f.garbT = 1.5 + (ab.windup + ab.active) / spd;
    if (ab.slot === 'evade' && ab.dash && ab.kind === 'dash') {
      // Backstep by default; roll through when cornered, or whenever the enemy
      // is in reach if the boots allow it (Shadow Treads).
      dir = -f.facing;
      through = false;
      const dest = f.x + dir * ab.dash!.distance;
      const rollThrough = ab.dash!.through && Math.abs(e.x - f.x) < ab.dash!.distance - 0.6;
      if (rollThrough || Math.abs(dest) > ARENA_HALF_WIDTH - 0.6) {
        dir = f.facing;
        through = true;
      }
    }

    let targetX = e.x;
    if (ab.kind === 'meteor') {
      // Lead the target: where will they be when the meteor lands?
      const fall = 12 / ab.projectile!.speed;
      const lead = (ab.windup / spd + fall) * e.vx * 0.6;
      targetX = clamp(e.x + lead, -ARENA_HALF_WIDTH + 1, ARENA_HALF_WIDTH - 1);
    }

    f.action = {
      ability: idx, phase: 'windup', t: 0, total: 0,
      windup: ab.windup / spd,
      active: ab.hits && ab.hits > 1 ? ab.active / Math.sqrt(spd) : ab.active,
      recovery: ab.recovery / spd,
      draw: (ab.draw ?? 0) / spd,
      stow: (ab.stow ?? 0) / spd,
      hitsDone: 0, connected: false, feint: false, targetX, startX: f.x, isCounter: false,
      dir, through,
    };
    f.move = 0;
    if (ab.slot === 'evade') f.totals.evades++;
    this.emit({ type: 'actionStart', f: f.id, ability: idx });
    return true;
  }

  /** Cancel a windup (feint). Only allowed in the first part of a windup. */
  feint(f: Fighter): boolean {
    const a = f.action;
    if (!a || a.phase !== 'windup' || a.feint) return false;
    const ab = f.abilities[a.ability];
    if (a.t > a.windup * 0.7) return false;
    // A secondary being drawn still has to go back (only as far as it came out).
    a.stow = Math.min(a.stow, a.draw > 0 ? Math.min(a.t, a.draw) + 0.05 : 0);
    a.feint = true;
    a.phase = 'recovery';
    a.t = 0;
    a.recovery = 0.12 + a.stow;
    // Feinting refunds most of the cooldown so the real attack can follow.
    f.cooldowns[a.ability] = Math.min(f.cooldowns[a.ability], 0.6);
    f.energy = Math.min(MAX_ENERGY, f.energy + ab.cost);
    if (ab.uses) f.uses[a.ability]++;
    f.totals.feints++;
    this.emit({ type: 'feint', f: f.id });
    return true;
  }

  private updateAction(f: Fighter): void {
    const a = f.action;
    if (!a || !f.alive) return;
    const ab = f.abilities[a.ability];
    const e = this.other(f);
    a.t += DT;
    a.total += DT;

    if (a.phase === 'windup') {
      if (ab.lunge && !a.feint && a.t > a.draw) f.x += a.dir * (ab.lunge * 0.25) / Math.max(DT, a.windup - a.draw) * DT;
      const leapAttack = ab.airborne && ab.kind !== 'dash';
      if (leapAttack) {
        const p = a.t / a.windup;
        f.y = dsin(Math.min(1, p) * Math.PI) * 2.2;
      }
      if (a.t >= a.windup) {
        a.phase = 'active';
        a.t = 0;
        if (leapAttack) f.y = 0;
        this.emit({ type: 'actionActive', f: f.id, ability: a.ability });
        this.enterActive(f, e, ab);
      }
      return;
    }

    if (a.phase === 'active') {
      if (ab.lunge) f.x += a.dir * (ab.lunge * 0.75) / Math.max(a.active, DT) * DT;

      if (ab.kind === 'melee') {
        const hits = ab.hits ?? 1;
        // Distribute hits over the active window, first one immediately.
        const due = hits === 1 ? 1 : Math.min(hits, 1 + Math.floor((a.t / a.active) * hits));
        while (a.hitsDone < due) {
          a.hitsDone++;
          if (this.inMeleeReach(f, e, reachOf(f, ab))) {
            const last = a.hitsDone === hits;
            this.abilityHit(f, e, ab, { heavyOverride: hits > 1 && !last ? false : undefined });
          }
        }
      } else if (ab.kind === 'dash') {
        const speed = ab.dash!.distance / a.active;
        const before = Math.sign(e.x - f.x);
        f.x += a.dir * speed * DT;
        // Leaping evades arc over the ground.
        if (ab.airborne) f.y = dsin(Math.min(1, a.t / a.active) * Math.PI) * 1.3;
        if (a.through && ab.dash!.strike && !a.connected) {
          const after = Math.sign(e.x - f.x);
          if (before !== after && before !== 0 && Math.abs(e.y - f.y) < 1.5) {
            a.connected = true;
            this.abilityHit(f, e, ab, {});
          }
        }
        if (a.through) f.x = clamp(f.x, -ARENA_HALF_WIDTH, ARENA_HALF_WIDTH);
      }

      if (a.t >= a.active) {
        a.phase = 'recovery';
        a.t = 0;
        if (ab.kind === 'dash') f.vx = a.dir * 2;
      }
      return;
    }

    if (a.t >= a.recovery) {
      f.action = null;
    }
  }

  private enterActive(f: Fighter, e: Fighter, ab: AbilityDef): void {
    const a = f.action!;
    if (ab.uses) this.emit({ type: 'used', f: f.id, ability: a.ability, left: f.uses[a.ability] });
    switch (ab.kind) {
      case 'projectile':
        this.spawnProjectile(f, ab, a.ability);
        break;
      case 'meteor':
        this.spawnMeteor(f, ab, a.ability, a.targetX);
        break;
      case 'aoe': {
        const style = ab.id === 'frost_nova' ? 'nova' : ab.id === 'thunderclap' ? 'thunder' : ab.anim === 'stomp' ? 'stomp' : 'slam';
        const radius = reachOf(f, ab);
        if (ab.iframes) f.invuln = Math.max(f.invuln, ab.iframes);
        this.emit({ type: 'shockwave', x: f.x, radius, f: f.id, style });
        if (Math.abs(e.x - f.x) <= radius && e.y < 1.6) this.abilityHit(f, e, ab, { aoe: true });
        break;
      }
      case 'buff':
        if (ab.buff) for (const b of ab.buff) this.applyStatus(f, f, b);
        if (ab.cleanse) {
          f.statuses = f.statuses.filter((s) => !HARMFUL.includes(s.id));
          refreshStats(f);
          this.emit({ type: 'cleanse', f: f.id });
        }
        if (ab.heal) this.heal(f, f.stats.maxHp * ab.heal);
        if (ab.energyGain) {
          const gain = Math.min(MAX_ENERGY - f.energy, ab.energyGain);
          f.energy += gain;
          this.emit({ type: 'energy', f: f.id, amount: Math.round(gain) });
        }
        if (ab.shieldGain) {
          const amount = Math.round(f.stats.maxHp * ab.shieldGain);
          f.shield = Math.max(f.shield, amount);
          this.emit({ type: 'shield', f: f.id, amount });
        }
        break;
      case 'blink': {
        const from = f.x;
        let dest = f.x - f.facing * ab.dash!.distance;
        // Warp Step: a close enemy gets a visitor right behind them.
        const behind = ab.dash!.through && Math.abs(e.x - f.x) < 4.5 && e.alive;
        if (behind) dest = clamp(e.x + Math.sign(e.x - f.x || f.facing) * 1.3, -ARENA_HALF_WIDTH + 0.5, ARENA_HALF_WIDTH - 0.5);
        else if (Math.abs(dest) > ARENA_HALF_WIDTH - 0.5) {
          // Cornered: appear behind the enemy instead.
          dest = e.x + f.facing * 2.2;
          if (Math.abs(dest) > ARENA_HALF_WIDTH - 0.5) dest = clamp(dest, -ARENA_HALF_WIDTH + 0.5, ARENA_HALF_WIDTH - 0.5);
        }
        f.x = f.px = dest;
        f.vx = 0;
        f.invuln = Math.max(f.invuln, ab.iframes ?? 0.2);
        if (ab.buff) for (const b of ab.buff) this.applyStatus(f, f, b);
        this.emit({ type: 'blink', f: f.id, from, to: dest });
        break;
      }
      case 'dash':
        f.invuln = Math.max(f.invuln, ab.dash!.iframes);
        if (ab.slot === 'evade') this.evadeExtras(f, e);
        break;
      case 'swap':
        this.swapPlaces(f, e, ab);
        break;
      case 'guard':
      case 'melee':
        break;
    }
  }

  /** Boots whose evade does a little more than step away. */
  private evadeExtras(f: Fighter, e: Fighter): void {
    const dist = Math.abs(e.x - f.x);
    if (f.has.has('frostwalkers')) {
      this.emit({ type: 'shockwave', x: f.x, radius: 2.2, f: f.id, style: 'frost' });
      if (dist <= 2.2 && e.y < 1.6 && e.invuln <= 0) this.applyStatus(e, f, { status: 'chill', duration: 3, stacks: 2 });
    }
    if (f.has.has('savate_boots') && dist <= SAVATE_KICK.range && Math.sign(e.x - f.x) === f.facing && e.y < 1.8) {
      // A real hit: it can still be blocked or parried.
      this.abilityHit(f, e, SAVATE_KICK, {});
    }
  }

  /** Trickster Talisman: both fighters trade places; whatever the enemy was winding up is thrown off. */
  private swapPlaces(f: Fighter, e: Fighter, ab: AbilityDef): void {
    if (!e.alive || Math.abs(e.x - f.x) > ab.range + 0.5) return;
    const from = f.x, to = e.x;
    f.x = f.px = to;
    e.x = e.px = from;
    f.vx = e.vx = 0;
    f.facing = Math.sign(e.x - f.x) >= 0 ? 1 : -1;
    e.facing = f.facing === 1 ? -1 : 1;
    f.invuln = Math.max(f.invuln, ab.iframes ?? 0.2);
    const ea = e.action;
    if (ea && ea.phase === 'windup' && !e.abilities[ea.ability].hyperArmor && !isUnstoppable(e)) {
      e.action = null;
      e.stagger = Math.max(e.stagger, 0.25);
    }
    this.emit({ type: 'swap', f: f.id, from, to });
  }

  private inMeleeReach(f: Fighter, e: Fighter, range: number): boolean {
    const dx = e.x - f.x;
    const dist = Math.abs(dx);
    if (dist > range) return false;
    if (dist > 0.7 && Math.sign(dx) !== f.facing) return false;
    return e.y < 2.2;
  }

  private spawnProjectile(f: Fighter, ab: AbilityDef, idx: number): void {
    const pr = ab.projectile!;
    if (pr.lob) { this.spawnLob(f, ab, idx); return; }
    const ground = !!pr.ground;
    const y = ground ? 0.25 : 1.25;
    const speed = pr.speed * (f.has.has('hawkeye_hood') ? 1.2 : 1);
    this.projectiles.push({
      id: this.nextProjectileId++, owner: f.id, style: pr.style, def: ab,
      x: f.x + f.facing * 0.7, y, px: f.x, py: y,
      vx: f.facing * speed, vy: 0, radius: pr.radius, life: pr.returns ? 4 : 2.2, ability: idx,
      power: f.stats.power, ground, reflected: false, targetX: 0, alive: true, back: false, hitOut: false, hitBack: false,
    });
  }

  /**
   * Lobbed flask: aimed where the enemy will be when it comes down (they keep
   * their current speed for the flight), in a fixed-speed arc.
   */
  private spawnLob(f: Fighter, ab: AbilityDef, idx: number): void {
    const pr = ab.projectile!;
    const e = this.other(f);
    const x0 = f.x + f.facing * 0.4, y0 = 2.0;
    const reach = clamp(Math.abs(e.x - x0), 1.2, ab.range);
    let t = reach / pr.speed;
    const lead = e.vx * t * 0.7;
    const tx = clamp(x0 + f.facing * reach + lead, -ARENA_HALF_WIDTH + 0.5, ARENA_HALF_WIDTH - 0.5);
    t = Math.max(0.25, Math.abs(tx - x0) / pr.speed);
    const y1 = 0.3;
    // y(t) = y0 + vy·t − g·t²/2 lands at y1.
    const vy = (y1 - y0 + (LOB_GRAVITY * t * t) / 2) / t;
    this.projectiles.push({
      id: this.nextProjectileId++, owner: f.id, style: pr.style, def: ab,
      x: x0, y: y0, px: x0, py: y0,
      vx: (tx - x0) / t, vy, radius: pr.radius, life: t + 1, ability: idx,
      power: f.stats.power, ground: false, reflected: false, targetX: tx, alive: true, back: false, hitOut: false, hitBack: false,
    });
  }

  /** A lobbed flask bursts: everything within its splash is hit (no parries, but blocks soften it). */
  private burstLob(p: Projectile, owner: Fighter, target: Fighter): void {
    p.alive = false;
    const radius = p.def.projectile!.lob!;
    const y = Math.max(0.2, p.y);
    const zone = p.def.projectile!.zone;
    if (zone) this.spawnZone(owner, zone, clamp(p.x, -ARENA_HALF_WIDTH + 0.4, ARENA_HALF_WIDTH - 0.4));
    else this.emit({ type: 'shockwave', x: p.x, radius, f: owner.id, style: p.style === 'frostflask' ? 'frost' : 'flask' });
    const hit = !this.over && target.alive && target.invuln <= 0 && Math.abs(target.x - p.x) <= radius + 0.35 && target.y < 1.8;
    if (hit) {
      const g = target.action && target.abilities[target.action.ability].guard && target.action.phase === 'active';
      this.abilityHit(owner, target, p.def, { fromProjectile: p, aoe: true }, !!g);
    }
    this.emit({ type: 'projectileEnd', id: p.id, x: p.x, y, style: p.style, hit });
  }

  private spawnMeteor(f: Fighter, ab: AbilityDef, idx: number, targetX: number): void {
    const pr = ab.projectile!;
    const startX = targetX - f.facing * 4;
    const y0 = 12;
    const fall = y0 / pr.speed;
    this.projectiles.push({
      id: this.nextProjectileId++, owner: f.id, style: 'meteor', def: ab,
      x: startX, y: y0, px: startX, py: y0,
      vx: (targetX - startX) / fall, vy: -pr.speed, radius: pr.radius, life: fall + 0.5, ability: idx,
      power: f.stats.power, ground: false, reflected: false, targetX, alive: true, back: false, hitOut: false, hitBack: false,
    });
  }

  private updateProjectiles(): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const owner = this.fighters[p.owner];
      const target = this.other(owner);
      const ab = p.def;
      const returns = !!ab.projectile?.returns && !p.reflected;

      if (returns) {
        // Out to its range, then home back to the thrower's hand.
        if (!p.back && (Math.abs(p.x - owner.x) >= ab.range || p.life < 2)) p.back = true;
        if (p.back) {
          const speed = ab.projectile!.speed * 1.1;
          const dx = owner.x - p.x;
          p.vx = Math.sign(dx) * speed;
          p.vy = ((owner.y + 1.25) - p.y) * 4;
          if (Math.abs(dx) < speed * DT + 0.35 || !owner.alive) {
            p.alive = false;
            this.emit({ type: 'projectileEnd', id: p.id, x: p.x, y: p.y, style: p.style, hit: false });
            continue;
          }
        }
      }

      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.life -= DT;

      if (ab.projectile?.lob) {
        p.vy -= LOB_GRAVITY * DT;
        const touches = target.alive && Math.abs(target.x - p.x) < p.radius + 0.45 && p.y < target.y + 1.7 && p.y > target.y - 0.2;
        if (p.y <= 0.3 || (touches && target.invuln <= 0) || p.life <= 0 || Math.abs(p.x) > ARENA_HALF_WIDTH + 1) this.burstLob(p, owner, target);
        continue;
      }

      if (p.style === 'meteor') {
        if (p.y <= 0.4) {
          p.alive = false;
          this.emit({ type: 'shockwave', x: p.x, radius: p.radius, f: owner.id, style: 'meteor' });
          const hit = !this.over && target.alive && Math.abs(target.x - p.x) <= p.radius + 0.4 && target.invuln <= 0;
          if (hit) this.abilityHit(owner, target, ab, { fromProjectile: p, aoe: true });
          this.emit({ type: 'projectileEnd', id: p.id, x: p.x, y: 0.2, style: p.style, hit });
        }
        continue;
      }

      const spent = returns && (p.back ? p.hitBack : p.hitOut);
      if (!this.over && target.alive && !spent) {
        const dx = Math.abs(target.x - p.x);
        const vertical = p.ground ? target.y < 0.45 : target.y < 1.6;
        if (dx < p.radius + 0.45 && vertical) {
          if (target.invuln > 0) {
            // Phases through; keep flying.
          } else if (target.has.has('mirror_mail') && target.mirrorCd <= 0 && !p.ground) {
            target.mirrorCd = 6;
            this.reflectProjectile(p, target);
            continue;
          } else {
            const res = this.guardCheck(target, owner, ab, p);
            if (res === 'reflect') {
              this.reflectProjectile(p, target);
              continue;
            }
            if (res !== 'parry') this.abilityHit(owner, target, ab, { fromProjectile: p }, res === 'block');
            if (returns && res !== 'parry') {
              // Bounces off and heads home; it can cut again on the way back.
              if (p.back) p.hitBack = true;
              else { p.hitOut = true; p.back = true; }
              continue;
            }
            p.alive = false;
            this.emit({ type: 'projectileEnd', id: p.id, x: p.x, y: p.y, style: p.style, hit: true });
            continue;
          }
        }
      }

      if ((p.life <= 0 && !returns) || Math.abs(p.x) > ARENA_HALF_WIDTH + 2) {
        p.alive = false;
        this.emit({ type: 'projectileEnd', id: p.id, x: p.x, y: p.y, style: p.style, hit: false });
      }
    }
    // Compact dead projectiles without allocating.
    let w = 0;
    for (let r = 0; r < this.projectiles.length; r++) {
      const p = this.projectiles[r];
      if (p.alive) this.projectiles[w++] = p;
    }
    this.projectiles.length = w;
  }

  private reflectProjectile(p: Projectile, by: Fighter): void {
    p.owner = by.id;
    p.vx = -p.vx * 1.15;
    p.vy = 0;
    p.reflected = true;
    p.life = 2;
    p.power = Math.max(p.power, by.stats.power);
    this.emit({ type: 'reflect', f: by.id, x: p.x, y: p.y });
    this.emit({ type: 'thought', f: by.id, text: 'Reflected it straight back!' });
  }

  // ---------------------------------------------------------------------------
  // Special items acting on their own
  // ---------------------------------------------------------------------------

  /**
   * Familiars charge, then fire on their own whenever the enemy is in range:
   * the wisp shoots a spirit bolt, the hawk leaves the shoulder and dives,
   * the whelp breathes fire up close. None of them can find a fighter hidden in smoke.
   */
  private updateFamiliar(f: Fighter): void {
    const fam = f.familiar!;
    const e = this.other(f);
    const def = FAMILIAR_SHOT[fam.kind];
    if (fam.away > 0) fam.away -= DT;
    if (fam.charge > 0) {
      fam.charge -= DT;
      if (fam.charge <= 0) {
        fam.charge = 0;
        const dir = Math.sign(e.x - f.x) || f.facing;
        const pr = def.projectile!;
        const perch = fam.kind === 'wisp' ? -0.55 : 0.1;
        const x = f.x + f.facing * perch, y = fam.kind === 'hawk' ? 2.9 : fam.kind === 'whelp' ? 1.95 : 2.05;
        const dist = Math.max(0.5, Math.abs(e.x - x));
        const life = fam.kind === 'whelp' ? Math.min(0.55, (def.range + 0.5) / pr.speed) : 1.6;
        // Aimed down at the chest (the hawk dives steeply).
        const vy = ((e.y + 1.25) - y) / (dist / pr.speed);
        this.projectiles.push({
          id: this.nextProjectileId++, owner: f.id, style: pr.style, def,
          x, y, px: x, py: y, vx: dir * pr.speed, vy: fam.kind === 'wisp' ? -0.8 / (dist / pr.speed) : vy,
          radius: pr.radius, life, ability: -1, power: f.stats.power, ground: false, reflected: false, targetX: 0, alive: true,
          back: false, hitOut: false, hitBack: false,
        });
        if (fam.kind === 'hawk') fam.away = dist / pr.speed + 0.7;
      }
      return;
    }
    if (fam.cd > 0) { fam.cd -= DT; return; }
    const range = fam.kind === 'whelp' ? def.range : FAMILIAR_RANGE;
    if (this.over || !e.alive || Math.abs(e.x - f.x) > range || getStatus(e, 'hidden')) return;
    fam.charge = def.windup;
    fam.cd = def.cooldown;
    this.emit({ type: 'familiar', f: f.id });
  }

  /** Item attacks: the meteor sigil calls a meteor; the phantom blade flies out and cuts. */
  private updateItem(f: Fighter): void {
    const it = f.item;
    if (!it) return;
    const ab = f.abilities[it.ability];
    const e = this.other(f);
    it.t += DT;
    const homeX = f.x - f.facing * 0.5, homeY = f.y + 2.1;

    if (ab.kind === 'totem') {
      it.x = homeX; it.y = homeY;
      if (it.phase === 'windup' && it.t >= ab.windup) {
        const dir = Math.sign(e.x - f.x) || f.facing;
        const x = clamp(f.x + dir * Math.min(1.2, Math.abs(e.x - f.x) * 0.5), -ARENA_HALF_WIDTH + 0.6, ARENA_HALF_WIDTH - 0.6);
        it.targetX = x;
        this.spawnZone(f, 'totem', x, ab);
        it.phase = 'return';
        it.t = 0;
      } else if (it.phase === 'return' && it.t >= 0.4) {
        f.item = null;
      }
      return;
    }

    if (ab.kind === 'meteor') {
      it.x = homeX; it.y = homeY;
      if (it.phase === 'windup' && it.t >= ab.windup) {
        // Lead the target: where will they be when it lands?
        const fall = 12 / ab.projectile!.speed;
        const tx = clamp(e.x + e.vx * fall * 0.6, -ARENA_HALF_WIDTH + 1, ARENA_HALF_WIDTH - 1);
        it.targetX = tx;
        this.spawnMeteor(f, ab, it.ability, tx);
        it.phase = 'return';
        it.t = 0;
      } else if (it.phase === 'return' && it.t >= 0.5) {
        f.item = null;
      }
      return;
    }

    // Phantom blade.
    const speed = 11;
    switch (it.phase) {
      case 'windup':
        it.x = homeX; it.y = homeY + Math.min(1, it.t / ab.windup) * 0.4;
        if (it.t >= ab.windup || !f.alive) { it.phase = f.alive ? 'travel' : 'return'; it.t = 0; }
        break;
      case 'travel': {
        const dx = e.x - it.x;
        it.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * DT);
        it.y += (1.35 - it.y) * Math.min(1, 8 * DT);
        if (Math.abs(e.x - it.x) < 0.6 || it.t > 0.9) { it.phase = 'active'; it.t = 0; }
        break;
      }
      case 'active': {
        // Hounds the target, but slower than a running fighter.
        const dx = e.x - it.x;
        it.x += Math.sign(dx) * Math.min(Math.abs(dx), 4.6 * DT);
        const hits = ab.hits ?? 1;
        const due = Math.min(hits, 1 + Math.floor((it.t / ab.active) * hits));
        while (it.hitsDone < due) {
          it.hitsDone++;
          if (!this.over && e.alive && f.alive && Math.abs(e.x - it.x) < 1.1 && e.y < 2.2) {
            this.abilityHit(f, e, ab, { aoe: true, heavyOverride: it.hitsDone === hits ? undefined : false });
          }
        }
        if (it.t >= ab.active) { it.phase = 'return'; it.t = 0; }
        break;
      }
      case 'return': {
        const dx = homeX - it.x;
        it.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * 1.2 * DT);
        it.y += (homeY - it.y) * Math.min(1, 8 * DT);
        if (Math.abs(homeX - it.x) < 0.2 || it.t > 1.5) f.item = null;
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Zones on the ground
  // ---------------------------------------------------------------------------

  private spawnZone(f: Fighter, kind: ZoneKind, x: number, ab?: AbilityDef): void {
    const t = ab?.totem;
    const z: Zone = kind === 'totem' && t
      ? { id: this.nextZoneId++, kind, owner: f.id, x, radius: t.radius, life: t.life, span: t.life, tick: 0.5, every: t.every, power: f.stats.power * ab.power }
      : { id: this.nextZoneId++, kind, owner: f.id, x, radius: CALTROPS.radius, life: CALTROPS.life, span: CALTROPS.life, tick: 0, every: CALTROPS.every, power: f.stats.power * CALTROPS.power };
    // One of each kind per owner: a new one replaces the old.
    for (let i = this.zones.length - 1; i >= 0; i--) if (this.zones[i].owner === f.id && this.zones[i].kind === kind) this.zones.splice(i, 1);
    this.zones.push(z);
    this.emit({ type: 'zone', f: f.id, kind, x, radius: z.radius });
  }

  private updateZones(): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= DT;
      if (z.life <= 0) { this.zones.splice(i, 1); continue; }
      if ((z.tick -= DT) > 0) continue;
      const owner = this.fighters[z.owner];
      const e = this.other(owner);
      const inside = e.alive && Math.abs(e.x - z.x) <= z.radius && e.invuln <= 0;
      if (z.kind === 'totem') {
        if (!inside || e.y > 2.4 || getStatus(e, 'hidden')) { z.tick = 0.1; continue; }
        z.tick = z.every;
        this.emit({ type: 'zap', f: owner.id, from: z.x, to: e.x });
        this.zoneHit(owner, e, z.power, 'magic', 'totem');
        if (e.alive) {
          this.applyStatus(e, owner, { status: 'chill', duration: 2 });
        }
      } else {
        // Caltrops only cut feet on the ground.
        if (!inside || e.y > 0.3) { z.tick = 0.05; continue; }
        z.tick = z.every;
        this.zoneHit(owner, e, z.power, 'physical', 'caltrops');
        if (e.alive) this.applyStatus(e, owner, { status: 'chill', duration: 1.5 });
      }
    }
  }

  private zoneHit(owner: Fighter, e: Fighter, raw: number, dtype: DamageType, id: string): void {
    const dealt = this.applyDamage(owner, e, raw * owner.stats.damageMult, dtype);
    if (dealt > 0) {
      this.emit({ type: 'hit', attacker: owner.id, target: e.id, amount: dealt, crit: false, dtype, blocked: false,
        heavy: false, ability: id, x: e.x, y: e.y + (id === 'caltrops' ? 0.3 : 1.4), killing: !e.alive, dot: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Hits and damage
  // ---------------------------------------------------------------------------

  /**
   * Checks whether `defender` is guarding against `attacker`.
   * Returns 'parry', 'block', 'reflect' or null.
   */
  private guardCheck(defender: Fighter, attacker: Fighter, ab: AbilityDef, p?: Projectile, aoe = false):
    'parry' | 'block' | 'reflect' | null {
    const a = defender.action;
    if (!a || a.feint) return null;
    const g = defender.abilities[a.ability];
    if (g.kind !== 'guard' || a.phase === 'recovery') return null;
    // Not guarding yet while the shield or dagger is still coming out.
    if (a.phase === 'windup' && a.t < a.draw) return null;
    if (ab.unblockable) return null;
    const srcX = p ? p.x - Math.sign(p.vx) : attacker.x;
    const fromFront = Math.sign(srcX - defender.x) === defender.facing || Math.abs(srcX - defender.x) < 0.3;
    if (!fromFront && !aoe) return null;
    const guardTime = a.phase === 'windup' ? 0 : a.t;
    const duelist = defender.has.has('duelist_band');
    const isParry = guardTime <= g.guard!.parryWindow * (duelist ? 1.4 : 1);
    if (isParry) {
      defender.totals.parries++;
      // A parry ends the guard quickly so the defender can punish.
      a.phase = 'recovery';
      a.t = 0;
      a.recovery = 0.1 + a.stow;
      defender.energy = Math.min(MAX_ENERGY, defender.energy + (duelist ? 22 : 12));
      this.hitstop = Math.max(this.hitstop, 0.1);
      this.emit({ type: 'parry', defender: defender.id, attacker: attacker.id, x: defender.x + defender.facing * 0.6, y: 1.3 });
      if (p) {
        if (g.guard!.reflectProjectiles) return 'reflect';
        return 'parry';
      }
      // Punish the attacker.
      attacker.stagger = Math.max(attacker.stagger, 0.65);
      if (attacker.action && !attacker.abilities[attacker.action.ability].hyperArmor) attacker.action = null;
      this.applyStatus(attacker, defender, { status: 'vulnerable', duration: 1.4 });
      if (g.guard!.counterPower) {
        // Instant riposte.
        const counter: AbilityDef = {
          ...g, id: 'riposte', kind: 'melee', power: g.guard!.counterPower, stagger: 0.4, knockback: 4,
          heavy: true, range: 2.5 * defender.stats.reach,
        };
        defender.action = {
          ability: a.ability, phase: 'recovery', t: 0, total: a.total, windup: 0, active: 0,
          recovery: 0.3 + a.stow, draw: a.draw, stow: a.stow, hitsDone: 1, connected: true, feint: false, targetX: attacker.x, startX: defender.x,
          isCounter: true, dir: defender.facing, through: false,
        };
        this.abilityHit(defender, attacker, counter, { isCounter: true });
        this.emit({ type: 'thought', f: defender.id, text: 'Perfect parry — riposte!' });
      }
      return 'parry';
    }
    defender.totals.blocks++;
    return 'block';
  }

  private abilityHit(att: Fighter, tgt: Fighter, ab: AbilityDef, opts: HitOptions, blocked = false): void {
    if (!tgt.alive) return;
    if (tgt.invuln > 0) {
      if (tgt.action && tgt.abilities[tgt.action.ability].slot === 'evade') {
        this.emit({ type: 'thought', f: tgt.id, text: 'Clean dodge.' });
      }
      return;
    }
    if (!opts.fromProjectile && !opts.isCounter && !blocked) {
      const g = this.guardCheck(tgt, att, ab, undefined, !!opts.aoe);
      if (g === 'parry') return;
      if (g === 'block') blocked = true;
    }
    // Seer's Blindfold: saw it coming, and simply isn't there when it lands.
    if (tgt.has.has('seer_blindfold') && tgt.foresightCd <= 0 && !blocked
      && (ab.heavy || ab.power * att.stats.power >= tgt.stats.maxHp * 0.03)) {
      tgt.foresightCd = 9;
      this.emit({ type: 'foresight', f: tgt.id, x: tgt.x, y: tgt.y + 1.3 });
      return;
    }

    const heavy = opts.heavyOverride ?? !!ab.heavy;
    let raw = att.stats.power * ab.power * (opts.mult ?? 1) * att.stats.damageMult;
    if (opts.fromProjectile) raw = opts.fromProjectile.power * ab.power * (opts.mult ?? 1) * att.stats.damageMult;
    if (opts.fromProjectile && att.has.has('hawkeye_hood')) raw *= 1.2;
    const body = !opts.fromProjectile && (ab.kind === 'melee' || ab.kind === 'dash' || ab.kind === 'aoe') && ab.slot !== 'item';
    // Out of the smoke: the first blow is an ambush.
    const hidden = getStatus(att, 'hidden');
    if (hidden && ab.slot !== 'item') {
      raw *= 1.5;
      att.statuses.splice(att.statuses.indexOf(hidden), 1);
      this.emit({ type: 'callout', f: att.id, text: 'Ambush!', color: '#d8d8e8' });
    }
    // Charger Cuisses: a run-up adds weight to the next melee blow.
    const charged = body && ab.kind !== 'aoe' && att.chargeT >= 0.8;
    if (charged) {
      raw *= 1.35;
      att.chargeT = 0;
      this.emit({ type: 'callout', f: att.id, text: 'Charge!', color: '#ffb060' });
    }
    let crit = false;
    const sureCrit = att.garbT > 0 && ab.slot !== 'item' && ab.slot !== 'evade';
    if (ab.damageType !== 'true' && (sureCrit || this.rng.chance(att.stats.critChance))) {
      if (sureCrit) att.garbT = 0;
      crit = true;
      raw *= att.stats.critMult;
      if (att.has.has('executioner_hood') && tgt.hp / tgt.stats.maxHp < 0.3) raw *= 1.5;
    }
    if (blocked) {
      const g = tgt.abilities[tgt.action!.ability];
      raw *= 1 - (g.guard?.reduction ?? 0.5);
    }

    const hpBefore = tgt.hp;
    const dealt = this.applyDamage(att, tgt, raw, ab.damageType);
    const killing = !tgt.alive;
    att.totals.hits++;
    if (crit) att.totals.crits++;
    att.totals.biggestHit = Math.max(att.totals.biggestHit, dealt);

    this.emit({
      type: 'hit', attacker: att.id, target: tgt.id, amount: dealt, crit, dtype: ab.damageType,
      blocked, heavy, ability: ab.id, x: tgt.x, y: tgt.y + 1.2, killing,
    });

    if (heavy && !blocked) this.hitstop = Math.max(this.hitstop, crit ? 0.11 : 0.08);
    else if (crit) this.hitstop = Math.max(this.hitstop, 0.05);
    if (killing) this.hitstop = Math.max(this.hitstop, 0.22);

    // Lifesteal (reduced by poison on the attacker), and weapons that drink life on their own.
    const steal = att.stats.lifesteal + (ab.drainLife ?? 0);
    if (steal > 0 && dealt > 0) this.heal(att, dealt * steal);
    if (ab.drainEnergy && !blocked) {
      const took = Math.min(tgt.energy, ab.drainEnergy);
      tgt.energy -= took;
      att.energy = Math.min(MAX_ENERGY, att.energy + took);
    }

    // Thorns.
    if (tgt.stats.thorns > 0 && !opts.fromProjectile && ab.kind !== 'aoe' && ab.kind !== 'blade' && att.alive && dealt > 0) {
      const back = this.applyDamage(tgt, att, dealt * tgt.stats.thorns, 'true');
      if (back > 0) {
        this.emit({ type: 'hit', attacker: tgt.id, target: att.id, amount: back, crit: false, dtype: 'true',
          blocked: false, heavy: false, ability: 'thorns', x: att.x, y: att.y + 1.4, killing: !att.alive, dot: true });
      }
    }

    if (!tgt.alive && hpBefore > 0) return;
    if (!tgt.alive) return;

    // Crowd control & displacement.
    if (!blocked) {
      if (ab.stun) this.applyStatus(tgt, att, { status: 'stun', duration: ab.stun });
      if (charged) this.applyStatus(tgt, att, { status: 'stun', duration: 0.4 });
      const ironskin = !!getStatus(tgt, 'ironskin') || isUnstoppable(tgt);
      if (ab.stagger && !ironskin) {
        const ta = tgt.action;
        // Light hits only flinch fighters with low poise; strong bodies hit harder.
        if (ab.stagger * att.stats.force > tgt.stats.poise || heavy || !ta) {
          if (ta && ta.phase !== 'active' && !tgt.abilities[ta.ability].hyperArmor) tgt.action = null;
          if (!tgt.action) tgt.stagger = Math.max(tgt.stagger, ab.stagger * (1 - tgt.stats.tenacity * 0.5));
        }
      }
      if (ab.knockback) {
        const dir = Math.sign(tgt.x - att.x) || att.facing;
        const kb = ab.knockback * att.stats.force * tgt.stats.knockbackTaken * (ironskin ? 0.3 : 1);
        tgt.vx += dir * kb;
        if (heavy && kb > 5) tgt.vy = Math.max(tgt.vy, kb * 0.45);
      }
      if (ab.applies) for (const s of ab.applies) this.applyStatus(tgt, att, s);
      if (ab.launch && !ironskin) {
        // Thrown up: helpless until they land.
        tgt.vy = Math.max(tgt.vy, ab.launch * tgt.stats.knockbackTaken);
        tgt.y = Math.max(tgt.y, 0.05);
        if (tgt.action && !tgt.abilities[tgt.action.ability].hyperArmor) tgt.action = null;
        if (!tgt.action) tgt.stagger = Math.max(tgt.stagger, (2 * tgt.vy) / GRAVITY + 0.1);
      }
      if (ab.pull && !ironskin) {
        // The chain drags them to just in front of the thrower.
        const side = Math.sign(tgt.x - att.x) || att.facing;
        tgt.pullTo = clamp(att.x + side * 1.3, -ARENA_HALF_WIDTH, ARENA_HALF_WIDTH);
        tgt.pullT = Math.min(0.35, Math.abs(tgt.x - tgt.pullTo) / 16);
        tgt.vx = 0;
        if (tgt.action && !tgt.abilities[tgt.action.ability].hyperArmor) tgt.action = null;
        if (!tgt.action) tgt.stagger = Math.max(tgt.stagger, tgt.pullT + 0.2);
        this.emit({ type: 'pull', f: att.id, target: tgt.id });
      }
      // Dread Helm: a heavy blow that lands puts the fear in them.
      if (heavy && att.has.has('dread_helm') && att.dreadCd <= 0 && ab.slot !== 'item') {
        att.dreadCd = 7;
        this.applyStatus(tgt, att, { status: 'fear', duration: 1.1 });
      }
    } else {
      tgt.vx += (Math.sign(tgt.x - att.x) || att.facing) * 1.5;
    }

    // On-hit items (only for real ability hits, not DoTs/echoes).
    if (ab.slot !== 'evade' && !blocked && att.has.has('gladiator_helm') && dealt > 0) {
      this.applyStatus(att, att, { status: 'momentum', duration: 4 });
    }
    if (ab.slot !== 'evade' && !blocked) {
      if (att.has.has('frost_core') && this.rng.chance(0.5)) this.applyStatus(tgt, att, { status: 'chill', duration: 2.5 });
      if (att.has.has('ember_core') && this.rng.chance(0.5)) this.applyStatus(tgt, att, { status: 'burn', duration: 2 });
      if (att.has.has('storm_crown')) {
        att.stormCounter++;
        if (att.stormCounter >= 4) {
          att.stormCounter = 0;
          this.emit({ type: 'lightning', f: att.id, x: tgt.x });
          const zap = this.applyDamage(att, tgt, att.stats.power * 0.75, 'magic');
          this.emit({ type: 'hit', attacker: att.id, target: tgt.id, amount: zap, crit: false, dtype: 'magic',
            blocked: false, heavy: true, ability: 'lightning', x: tgt.x, y: tgt.y + 2, killing: !tgt.alive });
          if (tgt.alive) this.applyStatus(tgt, att, { status: 'stun', duration: 0.35 });
        }
      }
      if (att.has.has('echo_stone') && dealt > 0 && this.rng.chance(0.35)) {
        att.echoQueue.push({ delay: 0.35, amount: dealt * 0.6, dtype: ab.damageType });
      }
    }
  }

  /** Applies mitigation, shields, death and revive. Returns HP damage dealt. */
  applyDamage(att: Fighter, tgt: Fighter, raw: number, dtype: DamageType): number {
    if (!tgt.alive || raw <= 0) return 0;
    let dmg = att.empowered && att !== tgt ? raw * OVERTIME_DAMAGE : raw;
    if (dtype === 'physical') dmg *= 100 / (100 + Math.max(0, tgt.stats.armor));
    else if (dtype === 'magic') dmg *= 100 / (100 + Math.max(0, tgt.stats.resist));
    dmg *= tgt.stats.damageTakenMult;
    dmg = Math.round(dmg);
    if (dmg <= 0) return 0;

    tgt.sinceHurt = 0;
    att.sinceHit = 0;
    if (tgt.shield > 0) {
      const absorbed = Math.min(tgt.shield, dmg);
      tgt.shield -= absorbed;
      dmg -= absorbed;
      if (tgt.shield <= 0) this.emit({ type: 'shieldBreak', f: tgt.id });
      att.totals.damageDealt += absorbed;
      if (dmg <= 0) return absorbed;
    }

    tgt.hp -= dmg;
    att.totals.damageDealt += dmg;
    tgt.totals.damageTaken += dmg;
    att.energy = Math.min(MAX_ENERGY, att.energy + dmg * ENERGY_ON_DEAL);
    tgt.energy = Math.min(MAX_ENERGY, tgt.energy + dmg * ENERGY_ON_TAKE);

    if (tgt.has.has('hourglass') && !tgt.rewindUsed && tgt.hp < tgt.stats.maxHp * 0.25 && tgt.histI > 0) this.rewind(tgt);

    if (tgt.hp > 0 && !tgt.secondWind && tgt.has.has('bloodrite_wraps') && tgt.hp < tgt.stats.maxHp * 0.35) {
      // Second wind: the wraps drink the blood spilled and give it back.
      tgt.secondWind = true;
      this.emit({ type: 'secondWind', f: tgt.id });
      this.heal(tgt, tgt.stats.maxHp * 0.15);
      this.applyStatus(tgt, tgt, { status: 'haste', duration: 2 });
      this.emit({ type: 'thought', f: tgt.id, text: 'Second wind!' });
    }

    if (tgt.hp <= 0) {
      if (tgt.has.has('phoenix_feather') && !tgt.phoenixUsed) {
        tgt.phoenixUsed = true;
        tgt.hp = Math.round(tgt.stats.maxHp * 0.15);
        tgt.invuln = 1.3;
        tgt.action = null;
        tgt.stagger = 0;
        tgt.statuses = tgt.statuses.filter((s) => s.id === 'rage' || s.id === 'haste' || s.id === 'ironskin');
        this.emit({ type: 'revive', f: tgt.id });
        this.emit({ type: 'thought', f: tgt.id, text: 'Rises from the ashes!' });
        const e = this.other(tgt);
        if (Math.abs(e.x - tgt.x) < 3.2 && e.alive) {
          e.vx += Math.sign(e.x - tgt.x) * 9;
          this.applyStatus(e, tgt, { status: 'burn', duration: 4, stacks: 3 });
        }
        this.hitstop = Math.max(this.hitstop, 0.18);
        return dmg;
      }
      tgt.hp = 0;
      tgt.alive = false;
      tgt.action = null;
      tgt.vx += Math.sign(tgt.x - att.x || -tgt.facing) * 7;
      tgt.vy = 7;
      this.emit({ type: 'ko', f: tgt.id });
    }
    return dmg;
  }

  /** Sands of Time: back to where (and how healthy) the fighter was a few seconds ago. */
  private rewind(f: Fighter): void {
    f.rewindUsed = true;
    // Oldest sample still in the ring.
    const n = Math.min(f.histI, HISTORY_SIZE);
    const i = (f.histI - n) % HISTORY_SIZE;
    const x = f.hist[i * 2], hp = f.hist[i * 2 + 1];
    const from = f.x;
    f.hp = Math.max(f.hp, Math.min(f.stats.maxHp, hp + f.stats.maxHp * 0.1));
    f.x = f.px = clamp(x, -ARENA_HALF_WIDTH, ARENA_HALF_WIDTH);
    f.vx = 0; f.vy = 0; f.y = Math.max(0, f.y);
    f.action = null;
    f.stagger = 0;
    f.pullT = 0;
    f.invuln = Math.max(f.invuln, 0.5);
    f.statuses = f.statuses.filter((s) => !HARMFUL.includes(s.id) && s.id !== 'stun' && s.id !== 'frozen');
    this.emit({ type: 'rewind', f: f.id, from, to: f.x });
    this.emit({ type: 'thought', f: f.id, text: 'Turns back the sands!' });
    this.hitstop = Math.max(this.hitstop, 0.15);
  }

  heal(f: Fighter, amount: number): void {
    if (!f.alive) return;
    const h = Math.min(f.stats.maxHp - f.hp, amount * f.stats.healMult);
    if (h <= 0) return;
    f.hp += h;
    f.totals.healed += h;
    if (h >= 4) this.emit({ type: 'heal', f: f.id, amount: Math.round(h) });
  }

  // ---------------------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------------------

  private physics(f: Fighter): void {
    const a = f.action;
    const ab = a ? f.abilities[a.ability] : null;
    const locked = !!a || isDisabled(f) || !f.alive;
    const fear = getStatus(f, 'fear');
    if (f.pullT > 0) {
      // Dragged by a chain: slides straight to the spot.
      f.pullT -= DT;
      const dx = f.pullTo - f.x;
      const step = f.pullT <= 0 ? dx : dx * Math.min(1, DT / Math.max(DT, f.pullT));
      f.x += step;
      f.vx = 0;
    } else if (fear && f.alive && !isDisabled(f)) {
      // Fleeing from whoever scared it.
      const src = this.fighters[fear.source];
      const away = Math.sign(f.x - src.x) || -f.facing;
      const dv = away * f.stats.moveSpeed * 1.1 - f.vx;
      f.vx += clamp(dv, -28 * DT, 28 * DT);
    } else if (!locked && !getStatus(f, 'root')) {
      const target = f.move * f.stats.moveSpeed;
      const accel = 28;
      const dv = target - f.vx;
      f.vx += clamp(dv, -accel * DT, accel * DT);
    } else if (!locked) {
      // Rooted: feet stay put.
      f.vx -= f.vx * Math.min(1, 14 * DT);
    } else {
      // Friction on knockback while busy.
      const fr = f.y > 0.01 ? 2 : 10;
      f.vx -= f.vx * Math.min(1, fr * DT);
    }

    // Airborne from knockback (leaps are driven by the action).
    const leaping = !!ab?.airborne && (a!.phase === 'windup' || (ab.kind === 'dash' && a!.phase === 'active'));
    if (!leaping) {
      if (f.y > 0 || f.vy > 0) {
        f.vy -= GRAVITY * DT;
        f.y += f.vy * DT;
        if (f.y <= 0) { f.y = 0; f.vy = 0; }
      }
    }

    f.x += f.vx * DT;

    const lim = ARENA_HALF_WIDTH;
    if (f.x < -lim || f.x > lim) {
      const impact = Math.abs(f.vx);
      f.x = clamp(f.x, -lim, lim);
      if (impact > WALL_SPLAT_SPEED && f.alive && !this.over) {
        const e = this.other(f);
        const dmg = this.applyDamage(e, f, f.stats.maxHp * 0.04 + impact * 4, 'true');
        f.stagger = Math.max(f.stagger, 0.45);
        if (f.action && !f.abilities[f.action.ability].hyperArmor) f.action = null;
        this.emit({ type: 'wallSplat', f: f.id, x: f.x });
        this.emit({ type: 'hit', attacker: e.id, target: f.id, amount: dmg, crit: false, dtype: 'true',
          blocked: false, heavy: true, ability: 'wall', x: f.x, y: f.y + 1.2, killing: !f.alive });
        this.hitstop = Math.max(this.hitstop, 0.07);
      }
      f.vx = -f.vx * 0.15;
    }
  }

  private resolveBodies(): void {
    const [a, b] = this.fighters;
    if (!a.alive || !b.alive) return;
    const passing = (f: Fighter) => !!f.action && f.action.through && f.action.phase !== 'recovery';
    if (passing(a) || passing(b)) return;
    if (a.has.has('ghoststep_leggings') || b.has.has('ghoststep_leggings')) return;
    if (Math.abs(a.y - b.y) > BODY_HEIGHT * 0.8) return;
    const dx = b.x - a.x;
    const dist = Math.abs(dx);
    if (dist < BODY_GAP) {
      const push = (BODY_GAP - dist) * 0.5;
      const s = dx === 0 ? (a.facing === 1 ? 1 : -1) : Math.sign(dx);
      a.x -= s * push;
      b.x += s * push;
      // Keep inside the walls; whoever is pinned pushes the other.
      const lim = ARENA_HALF_WIDTH;
      if (Math.abs(a.x) > lim) { const o = Math.abs(a.x) - lim; a.x -= Math.sign(a.x) * o; b.x -= Math.sign(a.x) * o; }
      if (Math.abs(b.x) > lim) { const o = Math.abs(b.x) - lim; b.x -= Math.sign(b.x) * o; a.x -= Math.sign(b.x) * o; }
    }
  }

  private updateFacing(f: Fighter): void {
    if (!f.alive) return;
    const a = f.action;
    if (a && (a.phase === 'active' || (a.phase === 'recovery' && a.through))) return;
    if (a && a.phase === 'recovery' && f.abilities[a.ability].slot === 'evade') return;
    const e = this.other(f);
    const dx = e.x - f.x;
    if (Math.abs(dx) > 0.05) f.facing = dx > 0 ? 1 : -1;
  }

  private checkEnd(): void {
    const [a, b] = this.fighters;
    if (!a.alive || !b.alive) {
      this.over = true;
      this.winner = a.alive ? 0 : b.alive ? 1 : -1;
      this.emit({ type: 'end', winner: this.winner, reason: 'ko' });
      return;
    }
    if (this.time >= MATCH_TIME) {
      this.over = true;
      const ra = a.hp / a.stats.maxHp, rb = b.hp / b.stats.maxHp;
      this.winner = Math.abs(ra - rb) < 1e-6 ? -1 : ra > rb ? 0 : 1;
      this.emit({ type: 'end', winner: this.winner, reason: 'time' });
    }
  }
}

// -----------------------------------------------------------------------------
// Forking helpers
// -----------------------------------------------------------------------------

const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

/** One level deeper than a shallow copy: arrays of records and plain records are copied. */
function cloneValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => (isPlain(x) ? { ...x } : x));
  if (isPlain(v)) return { ...v };
  return v;
}

/** Fighter fields that never change during a battle and can be shared by forks. */
const SHARED_FIGHTER_KEYS = new Set(['abilities', 'has', 'base', 'gear', 'gearIds', 'look', 'skins', 'profile']);

function cloneFighter(f: Fighter): Fighter {
  const c = { ...f } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) if (!SHARED_FIGHTER_KEYS.has(k)) c[k] = cloneValue(c[k]);
  return c as unknown as Fighter;
}
