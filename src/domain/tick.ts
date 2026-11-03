import { applyCard } from './cards';
import { getSpecies, hitDamage, mapStat } from './combat';
import type { GameConfig } from './config';
import { applyHitEffects, damageEnemy, pierceCount, tickBurning } from './effects';
import { bounceOffWalls, enforceMinVertical, findNearestOverlap, reflectOffEnemy } from './physics';
import { checkLevelUp } from './progression';
import { nextFloat } from './rng';
import type { Run } from './run';
import type { BallBody, Command, Enemy, GameEvent } from './types';
import { advanceWave } from './waves';

export interface TickOutput {
  /** Valid until the next tick: it is the run's own transient array. */
  readonly events: readonly GameEvent[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Nearest living enemy to a point; ties go to the lower id. Returns null if none. */
function nearestEnemy(enemies: readonly Enemy[], x: number, y: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const d2 = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    if (d2 < bestD2 || (d2 === bestD2 && best !== null && e.id < best.id)) {
      best = e;
      bestD2 = d2;
    }
  }
  return best;
}

function launchBalls(run: Run, config: GameConfig): void {
  const originX = run.player.x;
  const originY = config.player.y;
  const target = nearestEnemy(run.enemies, originX, originY);
  for (let slot = 0; slot < run.loadout.length; slot++) {
    let cooldown = run.cooldowns[slot] ?? 0;
    if (cooldown > 0) {
      cooldown -= 1;
      run.cooldowns[slot] = cooldown;
    }
    const ball = run.loadout[slot];
    if (cooldown !== 0 || ball === undefined || target === null) continue;

    // Direction to the target, deviated sideways by a seeded amount. No trigonometry: the
    // deviation is added along the perpendicular and the vector is renormalised.
    const dx = target.x - originX;
    const dy = target.y - originY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const ux = length === 0 ? 0 : dx / length;
    const uy = length === 0 ? -1 : dy / length;
    const jitter = (nextFloat(run.rng.aim) * 2 - 1) * config.ball.aimJitter;
    const vx = ux - uy * jitter;
    const vy = uy + ux * jitter;
    const norm = Math.sqrt(vx * vx + vy * vy);
    const stats = config.stats;
    const speed = mapStat(
      getSpecies(config, ball.species).baseStats.speed,
      stats.speedStatMin,
      stats.speedStatMax,
      config.ball.speedMin,
      config.ball.speedMax,
    );
    run.bodies.push({
      slot,
      x: originX,
      y: originY,
      vx: (vx / norm) * speed,
      vy: (vy / norm) * speed,
      pierce: pierceCount(run, ball),
      skipId: 0,
    });
    run.cooldowns[slot] = -1;
    run.events.push({ type: 'launch', ballId: ball.id });
  }
}

/** True if the ball still overlaps the enemy it just passed through. */
function stillInside(enemies: readonly Enemy[], body: BallBody, radius: number): boolean {
  for (const e of enemies) {
    if (e.id !== body.skipId) continue;
    const reach = radius + e.radius;
    return (
      e.hp > 0 && (e.x - body.x) * (e.x - body.x) + (e.y - body.y) * (e.y - body.y) < reach * reach
    );
  }
  return false;
}

/** Plays the pick of a card while the run waits in the level-up phase. */
function resolveLevelUp(run: Run, cmd: Command, config: GameConfig): void {
  const action = cmd.action;
  if (action === undefined || action.type !== 'pick') return;
  const card = run.offers[action.index];
  if (card === undefined) return; // not a valid choice: keep waiting
  applyCard(run, config, card);
  run.events.push({ type: 'pick', card });
  run.offers = [];
  run.phase = 'playing';
  checkLevelUp(run, config); // enough xp for another level straight away
}

/**
 * Advances the run by one 1/60 s step (ADR-004, ADR-007). Mutates `run` in place and returns the
 * events of this tick. While the run waits for a card choice only a `pick` command does
 * anything; a finished run does not advance.
 */
export function tick(run: Run, cmd: Command, config: GameConfig): TickOutput {
  run.events.length = 0;
  if (run.phase === 'levelup') {
    resolveLevelUp(run, cmd, config);
    return { events: run.events };
  }
  if (run.phase !== 'playing') return { events: run.events };

  const { arena, ball: ballConfig } = config;

  run.player.x = clamp(
    run.player.x + cmd.moveX * config.player.speed,
    config.player.margin,
    arena.width - config.player.margin,
  );

  advanceWave(run, config);

  // Enemies advance; those that reach the defence line hurt the player and are removed.
  let kept = 0;
  for (const e of run.enemies) {
    e.y += e.speed;
    if (e.y >= arena.defenseLineY) {
      run.player.hp -= e.threat;
      run.events.push({ type: 'leak', enemyId: e.id, damage: e.threat });
    } else {
      run.enemies[kept] = e;
      kept += 1;
    }
  }
  run.enemies.length = kept;

  run.grid.build(run.enemies);
  launchBalls(run, config);

  // Balls fly, bounce and hit.
  let flying = 0;
  for (const body of run.bodies) {
    body.x += body.vx;
    body.y += body.vy;
    if (bounceOffWalls(body, ballConfig.radius, arena.width)) {
      enforceMinVertical(body, ballConfig.minVerticalRatio);
    }
    if (body.y - ballConfig.radius > arena.height) {
      run.cooldowns[body.slot] = Math.max(
        1,
        Math.floor(ballConfig.cooldownTicks * run.player.cooldownMult + 0.5),
      );
      continue;
    }
    const ball = run.loadout[body.slot];
    if (ball === undefined) continue;

    if (body.skipId !== 0 && !stillInside(run.enemies, body, ballConfig.radius)) body.skipId = 0;
    const hitIndex = findNearestOverlap(
      run.grid,
      run.enemies,
      body.x,
      body.y,
      ballConfig.radius,
      body.skipId,
    );
    const target = hitIndex >= 0 ? run.enemies[hitIndex] : undefined;
    if (target !== undefined) {
      const damage = hitDamage(config, ball, target.type) * run.player.damageMult;
      run.events.push({
        type: 'hit',
        ballId: ball.id,
        enemyId: target.id,
        damage,
        effectiveness: config.typeChart[ball.type][target.type],
        x: target.x,
        y: target.y,
      });
      damageEnemy(run, config, target, damage);
      applyHitEffects(run, config, ball, target, damage);
      if (body.pierce > 0) {
        body.pierce -= 1;
        body.skipId = target.id;
      } else {
        reflectOffEnemy(body, ballConfig.radius, target);
        enforceMinVertical(body, ballConfig.minVerticalRatio);
      }
    }
    run.bodies[flying] = body;
    flying += 1;
  }
  run.bodies.length = flying;

  tickBurning(run, config);

  // Remove the dead, keeping the order by id.
  let alive = 0;
  for (const e of run.enemies) {
    if (e.hp > 0) {
      run.enemies[alive] = e;
      alive += 1;
    }
  }
  run.enemies.length = alive;

  run.tickCount += 1;
  if (run.player.hp <= 0) {
    run.phase = 'lost';
    run.events.push({ type: 'lost' });
  } else if (config.waves.length > 0 && run.wave.index >= config.waves.length && alive === 0) {
    run.phase = 'won';
    run.events.push({ type: 'won' });
  } else {
    checkLevelUp(run, config);
  }
  return { events: run.events };
}
