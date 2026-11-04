import { effectiveness } from './combat';
import type { GameConfig } from './config';
import { dropCapture, MAX_PICKUPS } from './pickups';
import { awardKill } from './progression';
import { nextFloat } from './rng';
import type { Run } from './run';
import type { Ball, Enemy } from './types';

/**
 * Damages an enemy and, if that kills it, emits the kill and grants the experience. A dead
 * enemy takes no further damage, so a kill is reported exactly once. Returns true if it died now.
 */
export function damageEnemy(run: Run, config: GameConfig, enemy: Enemy, amount: number): boolean {
  if (enemy.hp <= 0) return false;
  enemy.hp -= amount;
  if (enemy.hp > 0) return false;
  run.kills += 1;
  run.events.push({ type: 'kill', enemyId: enemy.id, x: enemy.x, y: enemy.y });
  awardKill(run, config, enemy);
  // The `capture` stream is drawn on every kill, so it advances the same whatever the chance is.
  const roll = nextFloat(run.rng.capture);
  if (enemy.id === run.boss.id) return true; // the boss drops nothing
  const chance = config.capture.chance + run.captureMisses * config.capture.pityStep;
  if (roll < chance && run.pickups.length < MAX_PICKUPS) {
    run.captureMisses = 0;
    dropCapture(run, config, enemy.species, enemy.type, enemy.x, enemy.y);
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

function nearestOther(enemies: readonly Enemy[], from: Enemy, maxDistance: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD2 = maxDistance * maxDistance;
  for (const e of enemies) {
    if (e === from || e.hp <= 0) continue;
    const d2 = (e.x - from.x) * (e.x - from.x) + (e.y - from.y) * (e.y - from.y);
    if (d2 < bestD2 || (d2 === bestD2 && best !== null && e.id < best.id)) {
      best = e;
      bestD2 = d2;
    }
  }
  return best;
}

/**
 * Applies the on-hit effects of a ball: burn, drain and chain. Every effect uses the ball's own
 * type for effectiveness, so a hybrid keeps the second ingredient's effect at reduced strength
 * but the first ingredient's type.
 */
export function applyHitEffects(
  run: Run,
  config: GameConfig,
  ball: Ball,
  target: Enemy,
  damage: number,
): void {
  for (const effect of ball.effects) {
    switch (effect.kind) {
      case 'burn': {
        if (target.hp <= 0) break;
        const dps =
          effect.strength * effectiveness(config, ball.type, target.type) * run.player.damageMult;
        target.burnTicks = config.effects.burnTicks;
        target.burnDps = Math.max(target.burnDps, dps);
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
        const other = nearestOther(run.enemies, target, config.effects.chainRadius);
        if (other === null) break;
        run.events.push({
          type: 'chain',
          fromX: target.x,
          fromY: target.y,
          toX: other.x,
          toY: other.y,
        });
        damageEnemy(
          run,
          config,
          other,
          damage * effect.strength * effectiveness(config, ball.type, other.type),
        );
        break;
      }
      case 'pierce':
        break; // decided at launch
    }
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
