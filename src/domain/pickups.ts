import { createBall } from './combat';
import type { GameConfig } from './config';
import type { Run } from './run';
import type { Pickup } from './types';

/** Never more than this many pickups at once (the render buffers are sized for it). */
export const MAX_PICKUPS = 48;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Reload after a ball is back, in ticks: the assisted aim is slower on purpose (ADR-021). */
export function reloadTicks(run: Run, config: GameConfig): number {
  const mult = run.player.cooldownMult * (run.autoAim ? config.ball.autoCooldownMult : 1);
  return Math.max(1, Math.floor(config.ball.cooldownTicks * mult + 0.5));
}

/** A ball of slot `slot` left the arena at `x`: it waits on the floor for the player (ADR-022). */
export function dropBall(run: Run, config: GameConfig, slot: number, x: number): void {
  const ball = run.loadout[slot];
  if (ball === undefined) return;
  const at = clamp(x, config.player.margin, config.arena.width - config.player.margin);
  run.pickups.push({
    slot,
    species: '',
    type: ball.type,
    x: at,
    y: config.player.y,
    ticks: config.pickup.returnTicks,
  });
  run.events.push({ type: 'drop', ballId: ball.id, x: at });
}

/** A defeated enemy lets its ball fall from where it died (ADR-023). */
export function dropCapture(
  run: Run,
  config: GameConfig,
  species: string,
  type: Pickup['type'],
  x: number,
  y: number,
): void {
  if (run.pickups.length >= MAX_PICKUPS) return;
  const at = clamp(x, config.player.margin, config.arena.width - config.player.margin);
  const from = Math.min(y, config.player.y);
  run.pickups.push({
    slot: -1,
    species,
    type,
    x: at,
    y: from,
    ticks: config.pickup.captureTtlTicks,
  });
  run.events.push({ type: 'captureDrop', species, x: at, y: from });
}

function collect(run: Run, config: GameConfig, pickup: Pickup, late: boolean): void {
  const penalty = late ? config.pickup.returnPenaltyTicks : 0;
  if (pickup.slot >= 0) {
    const ball = run.loadout[pickup.slot];
    if (ball === undefined) return;
    run.cooldowns[pickup.slot] = reloadTicks(run, config) + penalty;
    run.events.push({ type: 'collect', ballId: ball.id, x: pickup.x, late });
    return;
  }
  if (run.loadout.length < config.cards.maxBalls) {
    const ball = createBall(config, pickup.species, run.nextBallId);
    run.nextBallId += 1;
    run.loadout.push(ball);
    run.cooldowns.push(penalty);
    run.events.push({
      type: 'capture',
      ballId: ball.id,
      species: pickup.species,
      x: pickup.x,
      late,
    });
  } else {
    // The team is at the safety valve: the capture is not lost, it makes everyone hit harder.
    run.player.damageMult += config.capture.overflowDamageStep;
    run.events.push({ type: 'capture', ballId: 0, species: pickup.species, x: pickup.x, late });
  }
}

/**
 * One tick of the floor: captured balls fall, the launcher collects what is within reach, and what
 * waited too long joins on its own with an extra reload. Order is the order of appearance.
 */
export function advancePickups(run: Run, config: GameConfig): void {
  const { pickup } = config;
  const floor = config.player.y;
  const reach2 = pickup.radius * pickup.radius;
  let kept = 0;
  for (const p of run.pickups) {
    if (p.y < floor) p.y = Math.min(floor, p.y + pickup.dropSpeed);
    else p.ticks -= 1;
    const dx = p.x - run.player.x;
    const dy = p.y - floor;
    if (dx * dx + dy * dy <= reach2) {
      collect(run, config, p, false);
    } else if (p.ticks <= 0) {
      collect(run, config, p, true);
    } else {
      run.pickups[kept] = p;
      kept += 1;
    }
  }
  run.pickups.length = kept;
}
