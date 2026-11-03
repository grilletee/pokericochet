import { describe, expect, it } from 'vitest';
import { type BallBody, createRun, type Enemy, enforceMinVertical, tick } from '../../src/domain';
import { quietConfig } from './fixtures';

const RATIO = quietConfig.ball.minVerticalRatio;
const speedOf = (b: BallBody) => Math.sqrt(b.vx * b.vx + b.vy * b.vy);

describe('enforceMinVertical', () => {
  it('raises |vy| to ratio x speed while preserving the speed and the horizontal direction', () => {
    const b: BallBody = { slot: 0, x: 0, y: 0, vx: -5.99, vy: -0.05, pierce: 0, skipId: 0 };
    const before = speedOf(b);
    enforceMinVertical(b, RATIO);
    expect(speedOf(b)).toBeCloseTo(before, 9);
    expect(Math.abs(b.vy) / speedOf(b)).toBeCloseTo(RATIO, 9);
    expect(b.vy).toBeLessThan(0); // keeps going up
    expect(b.vx).toBeLessThan(0); // keeps going left
  });

  it('sends a perfectly horizontal ball downwards', () => {
    const b: BallBody = { slot: 0, x: 0, y: 0, vx: 6, vy: 0, pierce: 0, skipId: 0 };
    enforceMinVertical(b, RATIO);
    expect(b.vy).toBeGreaterThan(0);
    expect(b.vx).toBeGreaterThan(0);
  });

  it('leaves a ball that already satisfies the ratio untouched', () => {
    const b: BallBody = { slot: 0, x: 0, y: 0, vx: 3, vy: -5, pierce: 0, skipId: 0 };
    enforceMinVertical(b, RATIO);
    expect(b).toMatchObject({ vx: 3, vy: -5 });
  });

  it('does nothing (and makes no NaN) for a stationary ball', () => {
    const b: BallBody = { slot: 0, x: 0, y: 0, vx: 0, vy: 0, pierce: 0, skipId: 0 };
    enforceMinVertical(b, RATIO);
    expect(b).toMatchObject({ vx: 0, vy: 0 });
  });
});

function runWithFlyingBall(body: BallBody, enemies: Enemy[] = []) {
  const run = createRun(quietConfig, 1, 'charmander');
  run.bodies = [body];
  run.cooldowns = [-1]; // in flight: no new launches
  run.enemies = enemies;
  run.nextEnemyId = 100;
  return run;
}

describe('anti-stall inside tick', () => {
  it('a nearly horizontal ball still leaves through the bottom in bounded time', () => {
    // Without the rule: vy = 0.01 px/tick -> over 30 000 ticks to come down.
    const run = runWithFlyingBall({
      slot: 0,
      x: 240,
      y: 300,
      vx: 5.99,
      vy: 0.01,
      pierce: 0,
      skipId: 0,
    });
    let ticks = 0;
    while (run.bodies.length > 0 && ticks < 3000) {
      tick(run, { moveX: 0 }, quietConfig);
      ticks += 1;
    }
    expect(run.bodies.length).toBe(0);
    expect(ticks).toBeLessThan(1000);
    expect(run.cooldowns[0]).toBe(quietConfig.ball.cooldownTicks); // it re-arms after leaving
  });

  it('after bouncing off the side of an enemy the ball cannot stay horizontal', () => {
    const enemy: Enemy = {
      id: 1,
      species: 'vulpix',
      type: 'water',
      hp: 1000,
      x: 300,
      y: 300,
      speed: 0,
      radius: quietConfig.enemy.radius,
      threat: 1,
      xp: 1,
      burnTicks: 0,
      burnDps: 0,
    };
    const run = runWithFlyingBall({ slot: 0, x: 275, y: 300, vx: 6, vy: 0, pierce: 0, skipId: 0 }, [
      enemy,
    ]);
    tick(run, { moveX: 0 }, quietConfig);
    const b = run.bodies[0];
    expect(b).toBeDefined();
    if (b) {
      expect(b.vx).toBeLessThan(0); // bounced back
      expect(Math.abs(b.vy) / speedOf(b)).toBeGreaterThanOrEqual(RATIO - 1e-9);
      expect(speedOf(b)).toBeCloseTo(6, 9);
    }
  });

  it('does not consume random numbers (other streams are untouched)', () => {
    const run = runWithFlyingBall({
      slot: 0,
      x: 240,
      y: 300,
      vx: 5.99,
      vy: 0.01,
      pierce: 0,
      skipId: 0,
    });
    const aim = { ...run.rng.aim };
    const spawn = { ...run.rng.spawn };
    for (let i = 0; i < 200; i++) tick(run, { moveX: 0 }, quietConfig);
    expect(run.rng.aim).toEqual(aim);
    expect(run.rng.spawn).toEqual(spawn);
  });
});
