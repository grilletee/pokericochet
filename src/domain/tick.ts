import { type AimDirection, aimDirection } from './aim';
import { applyCard } from './cards';
import { ballSpeed, damagePlayer, hitDamage, leakDamage } from './combat';
import type { GameConfig } from './config';
import { applyHitEffects, ballPower, damageEnemy, pierceCount, tickBurning } from './effects';
import { castSignature, landHit } from './moves';
import { bounceOffWalls, enforceMinVertical, findNearestOverlap, reflectOffEnemy } from './physics';
import { advancePickups, dropBall } from './pickups';
import { checkLevelUp } from './progression';
import { nextFloat } from './rng';
import type { Run } from './run';
import { ballRadius, resolveReplace } from './team';
import type { BallBody, Command, Enemy, GameEvent } from './types';
import { advanceBoss, advanceWave, isBossAlive } from './waves';

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

const scratchDirection: AimDirection = { x: 0, y: -1 };

/**
 * Launches every ball that is ready. Manual aim (the default) goes towards the point the player
 * aims at and fires even with nothing to shoot at; the assisted aim picks the nearest enemy and
 * waits while there is none (ADR-021). Either way each launch draws exactly one number from the
 * `aim` stream, so the stream advances the same whatever the mode.
 */
function launchBalls(run: Run, config: GameConfig): void {
  const originX = run.player.x;
  const originY = config.player.y;
  let ux = 0;
  let uy = -1;
  let canAim = true;
  if (run.autoAim) {
    const target = nearestEnemy(run.enemies, originX, originY);
    canAim = target !== null;
    if (target !== null) {
      const dx = target.x - originX;
      const dy = target.y - originY;
      const length = Math.sqrt(dx * dx + dy * dy);
      ux = length === 0 ? 0 : dx / length;
      uy = length === 0 ? -1 : dy / length;
    }
  } else {
    aimDirection(
      originX,
      originY,
      run.aimX,
      run.aimY,
      config.ball.minVerticalRatio,
      scratchDirection,
    );
    ux = scratchDirection.x;
    uy = scratchDirection.y;
  }
  const spread = run.autoAim ? config.ball.aimJitter : config.ball.manualAimJitter;
  for (let slot = 0; slot < run.loadout.length; slot++) {
    let cooldown = run.cooldowns[slot] ?? 0;
    if (cooldown > 0) {
      cooldown -= 1;
      run.cooldowns[slot] = cooldown;
    }
    const ball = run.loadout[slot];
    if (cooldown !== 0 || ball === undefined || !canAim) continue;

    // The direction is deviated sideways by a seeded amount. No trigonometry: the deviation is
    // added along the perpendicular and the vector is renormalised.
    const jitter = (nextFloat(run.rng.aim) * 2 - 1) * spread;
    const vx = ux - uy * jitter;
    const vy = uy + ux * jitter;
    const norm = Math.sqrt(vx * vx + vy * vy);
    const speed = ballSpeed(config, ball);
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

/** Plays the answer to the replace screen while the run waits in the replace phase (ADR-030). */
function resolveCapture(run: Run, cmd: Command, config: GameConfig): void {
  const action = cmd.action;
  if (action === undefined || action.type === 'pick') return;
  resolveReplace(run, config, action);
}

/** Victory: the boss is dead, or, in a run without boss, the last wave is gone and nothing lives. */
function isWon(run: Run, config: GameConfig, alive: number): boolean {
  if (config.waves.length === 0 || run.wave.index < config.waves.length) return false;
  if (config.boss === undefined) return alive === 0;
  return run.boss.spawned && !isBossAlive(run);
}

/**
 * Advances the run by one 1/60 s step (ADR-004, ADR-007). Mutates `run` in place and returns the
 * events of this tick. While the run waits for a card choice time does not pass and only `pick`
 * does anything; a finished run does not advance.
 */
export function tick(run: Run, cmd: Command, config: GameConfig): TickOutput {
  run.events.length = 0;
  if (run.phase === 'levelup') {
    resolveLevelUp(run, cmd, config);
    return { events: run.events };
  }
  if (run.phase === 'replace') {
    resolveCapture(run, cmd, config);
    return { events: run.events };
  }
  if (run.phase !== 'playing') return { events: run.events };

  const { arena, ball: ballConfig } = config;

  run.player.x = clamp(
    run.player.x + cmd.moveX * config.player.speed,
    config.player.margin,
    arena.width - config.player.margin,
  );
  // The aim is part of the command (ADR-021): whole pixels inside the arena, so two recordings
  // that mean the same aim hash the same.
  if (cmd.aimX !== undefined) run.aimX = clamp(Math.floor(cmd.aimX + 0.5), 0, arena.width);
  if (cmd.aimY !== undefined) run.aimY = clamp(Math.floor(cmd.aimY + 0.5), 0, arena.height);
  if (cmd.autoAim !== undefined) run.autoAim = cmd.autoAim;
  // The signature of the starter is thrown by the player (4F-D); it needs the aim of this tick.
  if (cmd.cast !== undefined) castSignature(run, config, cmd.cast);

  // The wave clock stops while a boss lives (ADR-028).
  if (!isBossAlive(run)) advanceWave(run, config);
  advanceBoss(run, config);

  // Enemies advance; those that reach the defence line hurt the player and are removed.
  let kept = 0;
  for (const e of run.enemies) {
    e.y += e.speed * (e.slowTicks > 0 ? 1 - e.slow : 1);
    if (e.slowTicks > 0) e.slowTicks -= 1;
    if (e.y >= arena.defenseLineY) {
      // The boss reaching the line ends the run whatever the player's health (ADR-016); any other
      // leak costs what the guard of the team lets through (ADR-038).
      const cost = e.id === run.boss.id ? run.player.hp : leakDamage(config, run.team, e.threat);
      damagePlayer(run, cost);
      run.events.push({ type: 'leak', enemyId: e.id, damage: cost });
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
    const ball = run.loadout[body.slot];
    const radius = ball === undefined ? ballConfig.radius : ballRadius(config, ball);
    body.x += body.vx;
    body.y += body.vy;
    if (bounceOffWalls(body, radius, arena.width)) {
      enforceMinVertical(body, ballConfig.minVerticalRatio);
    }
    if (body.y - radius > arena.height) {
      // The ball does not come back by itself: it waits on the floor for the player (ADR-022).
      dropBall(run, config, body.slot, body.x);
      continue;
    }
    if (ball === undefined) continue;

    if (body.skipId !== 0 && !stillInside(run.enemies, body, radius)) body.skipId = 0;
    const hitIndex = findNearestOverlap(run.grid, run.enemies, body.x, body.y, radius, body.skipId);
    const target = hitIndex >= 0 ? run.enemies[hitIndex] : undefined;
    if (target !== undefined) {
      const damage = hitDamage(config, ball, target.type) * ballPower(run, config, ball);
      run.events.push({
        type: 'hit',
        ballId: ball.id,
        enemyId: target.id,
        damage,
        effectiveness: config.typeChart[ball.type][target.type],
        x: target.x,
        y: target.y,
      });
      const killed = damageEnemy(run, config, target, damage);
      applyHitEffects(run, config, ball, target, damage, killed);
      landHit(run, config, ball, target);
      if (body.pierce > 0) {
        body.pierce -= 1;
        body.skipId = target.id;
      } else {
        reflectOffEnemy(body, radius, target);
        enforceMinVertical(body, ballConfig.minVerticalRatio);
      }
    }
    run.bodies[flying] = body;
    flying += 1;
  }
  run.bodies.length = flying;
  // After the balls: a ball that dropped or an enemy that died this tick is already on the floor.
  advancePickups(run, config);

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
  } else if (isWon(run, config, alive)) {
    run.phase = 'won';
    run.events.push({ type: 'won' });
  } else if (run.phase === 'playing') {
    // A capture that opened the replace screen this tick goes first; the level-up waits its turn.
    checkLevelUp(run, config);
  }
  return { events: run.events };
}
