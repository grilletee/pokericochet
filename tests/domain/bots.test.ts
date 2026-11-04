import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { createRun, tick } from '../../src/domain';
import {
  activeAutoPolicy,
  activePolicy,
  chaserPolicy,
  commandFor,
  playRun,
  randomPolicy,
  standStillPolicy,
} from '../bench/bots';
import { makeEnemy } from './fixtures';

/**
 * The fun metrics are only worth something if the bots really use the 4B mechanics (the user's
 * rule). These tests pin what each policy does with aim, movement and the floor.
 */
describe('bots use the new mechanics', () => {
  it('the active bot aims by hand at the lowest enemy and keeps the assist off', () => {
    const run = createRun(gameConfig, 1, 'charmander');
    run.enemies = [makeEnemy({ id: 1, x: 100, y: 200 }), makeEnemy({ id: 2, x: 400, y: 500 })];
    const cmd = commandFor(activePolicy, run, gameConfig);
    expect(cmd.autoAim).toBe(false);
    expect(cmd.aimX).toBeCloseTo(400, 6);
    expect(cmd.aimY).toBeGreaterThanOrEqual(500);
  });

  it('the active bot leads a moving target', () => {
    const run = createRun(gameConfig, 1, 'charmander');
    run.enemies = [makeEnemy({ id: 1, x: 240, y: 300, speed: 0.5 })];
    const still = commandFor(
      activePolicy,
      { ...run, enemies: [makeEnemy({ x: 240, y: 300, speed: 0 })] },
      gameConfig,
    );
    const moving = commandFor(activePolicy, run, gameConfig);
    expect(moving.aimY).toBeGreaterThan(still.aimY ?? 0);
  });

  it('the active bot walks to a ball on the floor before anything else', () => {
    const run = createRun(gameConfig, 1, 'charmander');
    run.enemies = [makeEnemy({ id: 1, x: 460, y: 500 })];
    run.pickups = [{ slot: 0, species: '', type: 'fire', x: 60, y: 680, level: 1, ticks: 100 }];
    expect(commandFor(activePolicy, run, gameConfig).moveX).toBe(-1);
    run.pickups = [{ slot: 0, species: '', type: 'fire', x: 440, y: 680, level: 1, ticks: 100 }];
    expect(commandFor(activePolicy, run, gameConfig).moveX).toBe(1);
    run.pickups = [{ slot: 0, species: '', type: 'fire', x: 241, y: 680, level: 1, ticks: 100 }];
    expect(commandFor(activePolicy, run, gameConfig).moveX).toBe(0);
  });

  it('the active-auto bot moves like the active one but uses the assisted aim and sends no aim', () => {
    const run = createRun(gameConfig, 1, 'charmander');
    run.enemies = [makeEnemy({ id: 1, x: 460, y: 500 })];
    run.pickups = [{ slot: 0, species: '', type: 'fire', x: 60, y: 680, level: 1, ticks: 100 }];
    const cmd = commandFor(activeAutoPolicy, run, gameConfig);
    expect(cmd.autoAim).toBe(true);
    expect(cmd.aimX).toBeUndefined();
    expect(cmd.moveX).toBe(commandFor(activePolicy, run, gameConfig).moveX);
  });

  it('the still bot neither moves nor aims', () => {
    const run = createRun(gameConfig, 1, 'charmander');
    run.enemies = [makeEnemy({ id: 1, x: 460, y: 500 })];
    run.pickups = [{ slot: 0, species: '', type: 'fire', x: 60, y: 680, level: 1, ticks: 100 }];
    const cmd = commandFor(standStillPolicy, run, gameConfig);
    expect(cmd).toEqual({ moveX: 0, autoAim: false });
  });

  it('the pre-4B chaser keeps the assisted aim and ignores the floor', () => {
    const run = createRun(gameConfig, 1, 'charmander');
    run.enemies = [makeEnemy({ id: 1, x: 460, y: 500 })];
    run.pickups = [{ slot: 0, species: '', type: 'fire', x: 20, y: 680, level: 1, ticks: 100 }];
    const cmd = commandFor(chaserPolicy, run, gameConfig);
    expect(cmd.autoAim).toBe(true);
    expect(cmd.moveX).toBe(1); // towards the enemy, not the ball
  });

  it('the random bot aims at random points inside the upper half', () => {
    const run = createRun(gameConfig, 1, 'charmander');
    const policy = randomPolicy(3);
    const points = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const cmd = commandFor(policy, run, gameConfig);
      expect(cmd.aimX).toBeGreaterThanOrEqual(0);
      expect(cmd.aimX).toBeLessThan(gameConfig.arena.width);
      expect(cmd.aimY).toBeLessThan(gameConfig.arena.height / 2);
      points.add(`${cmd.aimX},${cmd.aimY}`);
    }
    expect(points.size).toBeGreaterThan(20);
  });

  it('a level-up gets a card pick and nothing else', () => {
    const run = createRun(gameConfig, 1, 'charmander');
    run.phase = 'levelup';
    run.offers = [{ kind: 'damage' }, { kind: 'newBall', species: 'pikachu' }];
    const cmd = commandFor(activePolicy, run, gameConfig);
    expect(cmd).toEqual({ moveX: 0, action: { type: 'pick', index: 1 } });
  });
});

describe('the bots actually collect and capture in a whole run', () => {
  it('the active bot collects balls and captures new ones; the still bot barely does', () => {
    const active = playRun(gameConfig, 32, 'pikachu', activePolicy, 7200);
    const still = playRun(gameConfig, 32, 'pikachu', standStillPolicy, 7200);
    expect(active.collected).toBeGreaterThan(30);
    expect(active.captures).toBeGreaterThan(0);
    expect(active.newBalls).toBeGreaterThanOrEqual(active.captures);
    expect(active.firstBallTicks).toBeLessThan(active.ticks);
    expect(still.collected).toBeLessThan(active.collected);
  });

  it('a run without any new ball reports its whole length as the first-ball time and drought', () => {
    const run = createRun(gameConfig, 1, 'charmander');
    for (let i = 0; i < 10; i++) tick(run, { moveX: 0 }, gameConfig);
    const out = playRun({ ...gameConfig, waves: [] }, 1, 'charmander', standStillPolicy, 300);
    expect(out.newBalls).toBe(0);
    expect(out.firstBallTicks).toBe(out.ticks);
    expect(out.maxDroughtTicks).toBe(out.ticks);
  });
});
