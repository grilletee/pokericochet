import { bossDamage } from './bossFight';
import { effectivenessOn } from './combat';
import type { GameConfig } from './config';
import { baseOf } from './forms';
import { dropCapture, MAX_PICKUPS } from './pickups';
import { awardKill } from './progression';
import { nextFloat } from './rng';
import type { Run } from './run';
import { memberIndexOf, powerMult, teamIsFull } from './team';
import type { Ball, Enemy } from './types';
import { onBossDefeated } from './waves';

/**
 * Damages an enemy and, if that kills it, emits the kill and grants the experience. A dead
 * enemy takes no further damage, so a kill is reported exactly once. Returns true if it died now.
 */
export function damageEnemy(run: Run, config: GameConfig, enemy: Enemy, amount: number): boolean {
  if (enemy.hp <= 0) return false;
  // A marked enemy takes more from every hit and every tick of damage (Dark, ADR-047).
  const marked = (enemy.markTicks ?? 0) > 0 ? amount * (1 + (enemy.markBonus ?? 0)) : amount;
  // A boss with a shield, a stun or a phase line to hold at takes what its fight lets through (ADR-046).
  enemy.hp -= enemy.id === run.boss.id ? bossDamage(run, config, enemy, marked) : marked;
  if (enemy.hp > 0) return false;
  run.kills += 1;
  run.events.push({ type: 'kill', enemyId: enemy.id, x: enemy.x, y: enemy.y });
  awardKill(run, config, enemy);
  // The `capture` stream is drawn on every kill, so it advances the same whatever the chance is.
  const roll = nextFloat(run.rng.capture);
  if (enemy.id === run.boss.id) {
    onBossDefeated(run, config, enemy); // a boss has its own reward, not the capture roll
    return true;
  }
  // A tougher form drops the ball of its line at the stage of that form (ADR-027).
  const { base, level } = baseOf(config, enemy.species);
  // A full team makes a capture a decision (ADR-030), so a new species is rarer; one the team
  // already has is a free level and keeps the normal chance.
  const asksToReplace = teamIsFull(run, config) && memberIndexOf(run, base) < 0;
  const chance =
    (config.capture.chance + run.captureMisses * config.capture.pityStep) *
    (asksToReplace ? config.capture.fullTeamChanceMult : 1);
  if (roll < chance && run.pickups.length < MAX_PICKUPS) {
    run.captureMisses = 0;
    dropCapture(run, config, base, enemy.type, enemy.x, enemy.y, level);
  } else {
    run.captureMisses += 1;
  }
  return true;
}

/** How many enemies a ball launched now can pass through (type effect "pierce"). */
export function pierceCount(run: Run, ball: Ball): number {
  let strength = 0;
  for (const effect of ball.effects) if (effect.kind === 'pierce') strength += effect.strength;
  const whole = Math.floor(strength);
  const fraction = strength - whole;
  // A fractional strength (the second ingredient of a hybrid) is a seeded chance of one more.
  // The `aim` stream is only touched when there is a fraction.
  return fraction > 0 && nextFloat(run.rng.aim) < fraction ? whole + 1 : whole;
}

/** Nearest living enemy to `from` within `maxDistance` that is not in `seen`; ties go to the lower id. */
export function nearestOther(
  enemies: readonly Enemy[],
  from: Enemy,
  maxDistance: number,
  seen: readonly number[],
): Enemy | null {
  let best: Enemy | null = null;
  let bestD2 = maxDistance * maxDistance;
  for (const e of enemies) {
    if (e.hp <= 0 || seen.includes(e.id)) continue;
    const d2 = (e.x - from.x) * (e.x - from.x) + (e.y - from.y) * (e.y - from.y);
    if (d2 < bestD2 || (d2 === bestD2 && best !== null && e.id < best.id)) {
      best = e;
      bestD2 = d2;
    }
  }
  return best;
}

/** Calls `fn` for every living enemy other than `centre` within `radius` of it, in id order. */
function forEachNear(
  enemies: readonly Enemy[],
  centre: Enemy,
  radius: number,
  fn: (enemy: Enemy) => void,
): void {
  const r2 = radius * radius;
  for (const e of enemies) {
    if (e === centre || e.hp <= 0) continue;
    const d2 = (e.x - centre.x) * (e.x - centre.x) + (e.y - centre.y) * (e.y - centre.y);
    if (d2 <= r2) fn(e);
  }
}

const chainSeen: number[] = [];

/** Damage multiplier of a ball: the whole team's cards times its own Pokémon's power cards. */
export function ballPower(run: Run, config: GameConfig, ball: Ball): number {
  return run.player.damageMult * powerMult(config, run.team[ball.owner]);
}

/**
 * Applies the on-hit effects of a ball (ADR-013, ADR-031): burn and its spread, drain, chain with
 * several jumps, splash, slow and, if the hit killed, blast. Every effect uses the ball's own type
 * for effectiveness, so a hybrid keeps the second ingredient's effect at reduced strength but the
 * first ingredient's type. `killed` says whether this very hit defeated the target.
 */
export function applyHitEffects(
  run: Run,
  config: GameConfig,
  ball: Ball,
  target: Enemy,
  damage: number,
  killed = false,
): void {
  const power = ballPower(run, config, ball);
  for (const effect of ball.effects) {
    switch (effect.kind) {
      case 'burn': {
        if (target.hp <= 0) break;
        const dps = effect.strength * effectivenessOn(config, ball.type, target) * power;
        target.burnTicks = config.effects.burnTicks;
        target.burnDps = Math.max(target.burnDps, dps);
        break;
      }
      case 'burnArea': {
        // The burn of the same ball, at a fraction of its strength, on whoever stands close.
        const burn = ball.effects.find((e) => e.kind === 'burn');
        if (burn === undefined) break;
        forEachNear(run.enemies, target, effect.radius ?? 0, (other) => {
          const dps =
            burn.strength * effect.strength * effectivenessOn(config, ball.type, other) * power;
          other.burnTicks = config.effects.burnTicks;
          other.burnDps = Math.max(other.burnDps, dps);
        });
        break;
      }
      case 'drain': {
        run.player.drain += effect.strength;
        if (run.player.drain >= config.effects.drainPerHp) {
          if (run.player.hp < run.player.maxHp) {
            run.player.hp = Math.min(run.player.maxHp, run.player.hp + 1);
            run.player.drain -= config.effects.drainPerHp;
            run.events.push({ type: 'heal', amount: 1 });
          } else {
            run.player.drain = config.effects.drainPerHp; // full health: hold, do not bank more
          }
        }
        break;
      }
      case 'chain': {
        let from = target;
        chainSeen.length = 0;
        chainSeen.push(target.id);
        for (let jump = 0; jump < (effect.count ?? 1); jump++) {
          const other = nearestOther(run.enemies, from, config.effects.chainRadius, chainSeen);
          if (other === null) break;
          chainSeen.push(other.id);
          run.events.push({
            type: 'chain',
            fromX: from.x,
            fromY: from.y,
            toX: other.x,
            toY: other.y,
          });
          damageEnemy(
            run,
            config,
            other,
            damage * effect.strength * effectivenessOn(config, ball.type, other),
          );
          from = other;
        }
        break;
      }
      case 'splash':
        forEachNear(run.enemies, target, effect.radius ?? 0, (other) => {
          damageEnemy(
            run,
            config,
            other,
            damage * effect.strength * effectivenessOn(config, ball.type, other),
          );
        });
        break;
      case 'blast':
        if (!killed) break;
        forEachNear(run.enemies, target, effect.radius ?? 0, (other) => {
          damageEnemy(
            run,
            config,
            other,
            damage * effect.strength * effectivenessOn(config, ball.type, other),
          );
        });
        break;
      case 'slow':
        if (target.hp <= 0) break;
        target.slow = Math.max(effect.strength, target.slowTicks > 0 ? target.slow : 0);
        target.slowTicks = config.effects.slowTicks;
        break;
      case 'pierce':
        break; // decided at launch
      case 'poison': {
        // Layers add up to a cap, each one a damage over time; the clock restarts on every hit.
        if (target.hp <= 0) break;
        const layers = Math.min(
          config.effects.poisonMaxStacks ?? 5,
          (target.poisonStacks ?? 0) + 1,
        );
        const perLayer = effect.strength * effectivenessOn(config, ball.type, target) * power;
        target.poisonStacks = layers;
        target.poisonTicks = config.effects.poisonTicks ?? 360;
        target.poisonDps = Math.max(target.poisonDps ?? 0, perLayer);
        break;
      }
      case 'curse': {
        // The damage is held back and lands all at once, whatever slows or stops the enemy. The
        // clock starts with the first hit; the hits it carries are capped.
        if (target.hp <= 0) break;
        const cap = damage * effect.strength * (config.effects.curseMaxHits ?? 3);
        target.curseDamage = Math.min(cap, (target.curseDamage ?? 0) + damage * effect.strength);
        if ((target.curseTicks ?? 0) <= 0) target.curseTicks = config.effects.curseTicks ?? 120;
        break;
      }
      case 'quake': {
        // A wave that climbs the column of the impact: whoever is above it in the same lane.
        const half = effect.radius ?? 0;
        for (const other of run.enemies) {
          if (other === target || other.hp <= 0 || other.y > target.y) continue;
          if (Math.abs(other.x - target.x) > half) continue;
          damageEnemy(
            run,
            config,
            other,
            damage * effect.strength * effectivenessOn(config, ball.type, other),
          );
        }
        break;
      }
      case 'push':
        // Pushes the target back up the arena; a boss does not move.
        if (target.hp <= 0 || target.id === run.boss.id) break;
        target.y = Math.max(-target.radius, target.y - effect.strength);
        break;
      case 'guard':
        run.guardTicks = config.effects.guardTicks ?? 180;
        break;
      case 'freeze': {
        // Every n-th hit stops the enemy for a moment (a boss is only slowed by other effects).
        if (target.hp <= 0 || target.id === run.boss.id) break;
        const hits = (target.chill ?? 0) + 1;
        if (hits >= (config.effects.freezeEvery ?? 3)) {
          target.chill = 0;
          target.haltTicks = Math.max(target.haltTicks ?? 0, config.effects.freezeTicks ?? 90);
        } else {
          target.chill = hits;
        }
        break;
      }
      case 'stun': {
        // A short stop that cannot be chained: after it the enemy is immune for twice as long.
        if (target.hp <= 0 || target.id === run.boss.id) break;
        if ((target.chill ?? 0) < 0 || (target.haltTicks ?? 0) > 0) break;
        const ticks = config.effects.stunTicks ?? 30;
        target.haltTicks = ticks;
        target.chill = -2 * ticks;
        break;
      }
      case 'mark': {
        if (target.hp <= 0) break;
        target.markTicks = config.effects.markTicks ?? 300;
        target.markBonus = Math.min(
          config.effects.markMax ?? 0.5,
          (target.markBonus ?? 0) + effect.strength,
        );
        break;
      }
    }
  }
}

/** One tick of poison, of the curse waiting to land and of the marks and immunities running out. */
export function tickAilments(run: Run, config: GameConfig): void {
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0) continue;
    const poison = enemy.poisonTicks ?? 0;
    if (poison > 0) {
      enemy.poisonTicks = poison - 1;
      damageEnemy(run, config, enemy, ((enemy.poisonStacks ?? 0) * (enemy.poisonDps ?? 0)) / 60);
      if (poison === 1) {
        enemy.poisonStacks = 0;
        enemy.poisonDps = 0;
      }
    }
    const curse = enemy.curseTicks ?? 0;
    if (curse > 0 && enemy.hp > 0) {
      enemy.curseTicks = curse - 1;
      if (curse === 1) {
        const owed = enemy.curseDamage ?? 0;
        enemy.curseDamage = 0;
        damageEnemy(run, config, enemy, owed);
      }
    }
    const mark = enemy.markTicks ?? 0;
    if (mark > 0) {
      enemy.markTicks = mark - 1;
      if (mark === 1) enemy.markBonus = 0;
    }
    if ((enemy.chill ?? 0) < 0) enemy.chill = (enemy.chill ?? 0) + 1;
  }
}

/** One tick of burn damage on every burning enemy. */
export function tickBurning(run: Run, config: GameConfig): void {
  for (const enemy of run.enemies) {
    if (enemy.burnTicks <= 0 || enemy.hp <= 0) continue;
    enemy.burnTicks -= 1;
    damageEnemy(run, config, enemy, enemy.burnDps / 60);
    if (enemy.burnTicks === 0) enemy.burnDps = 0;
  }
}
