import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  type Command,
  createRun,
  type GameConfig,
  hashRun,
  motionDirection,
  type Run,
  reloadTicks,
  smartTarget,
  tick,
} from '../../src/domain';
import { makeEnemy, quietConfig } from './fixtures';

/**
 * 4G-G, part 2: the schemes of the touch controls as deterministic commands. A phone has one thumb:
 * it moves, or it aims, not both, so the launcher either chooses what to shoot at (`smart`), leans with
 * the movement (`motion`, an Arkanoid) or waits for the release (`sling`).
 */

const controls = gameConfig.controls;
if (controls === undefined) throw new Error('no controls table');
const cfg: GameConfig = { ...quietConfig, controls };

function base(): Run {
  const run = createRun(cfg, 7, 'charmander');
  run.enemies = [];
  run.events.length = 0;
  return run;
}

/** The first ball in flight after `ticks` ticks of `cmd`, or undefined. */
function launched(run: Run, cmd: Command, ticks = 3) {
  for (let i = 0; i < ticks; i++) tick(run, cmd, cfg);
  return run.bodies[0];
}

describe('smartTarget: what the launcher shoots at when the thumb only moves', () => {
  it('goes by priority: tapped enemy, boss, enemy nearest the line', () => {
    const run = base();
    const far = makeEnemy({ id: 1, x: 100, y: 200, speed: 0 });
    const near = makeEnemy({ id: 2, x: 300, y: 500, speed: 0 });
    run.enemies = [far, near];
    // 3. The enemy nearest to the defence line.
    expect(smartTarget(run, cfg)).toMatchObject({ id: 2, x: 300, y: 500 });
    // 2. A boss beats ordinary enemies, at its centre also while it charges (4G-H: no weak point).
    const boss = makeEnemy({ id: 9, x: 240, y: 120, hp: 1e6, radius: 40, speed: 0 });
    run.enemies.push(boss);
    run.boss.id = 9;
    expect(smartTarget(run, cfg)).toMatchObject({ id: 9, x: 240, y: 120 });
    run.boss.coreOpen = 50;
    expect(smartTarget(run, cfg)).toMatchObject({ id: 9, x: 240, y: 120 });
    // 1. The enemy the player tapped beats everything while it lives.
    run.lockId = 1;
    expect(smartTarget(run, cfg)).toMatchObject({ id: 1 });
    run.enemies = run.enemies.filter((e) => e.id !== 1); // it died: the lock is ignored
    expect(smartTarget(run, cfg)).toMatchObject({ id: 9 });
  });

  it('a locked enemy that is dead (hp 0, not yet removed) does not hold the aim', () => {
    const run = base();
    run.enemies = [
      makeEnemy({ id: 1, x: 100, y: 200, speed: 0 }),
      makeEnemy({ id: 2, x: 400, y: 450, speed: 0, hp: 0 }),
    ];
    run.lockId = 2;
    expect(smartTarget(run, cfg)).toMatchObject({ id: 1 });
  });

  it('nothing alive, or only enemies past the line: no target; ties go to the lowest id', () => {
    const run = base();
    expect(smartTarget(run, cfg)).toBeNull();
    run.enemies = [makeEnemy({ id: 5, y: cfg.arena.defenseLineY + 10 })];
    expect(smartTarget(run, cfg)).toBeNull();
    run.enemies = [makeEnemy({ id: 8, x: 50, y: 300 }), makeEnemy({ id: 6, x: 400, y: 300 })];
    expect(smartTarget(run, cfg)?.id).toBe(6);
  });
});

describe('motionDirection: the launch leans with the speed of the launcher', () => {
  it('straight up when still, leaning with the sign of the speed, always a unit vector', () => {
    const out = { x: 0, y: 0 };
    expect(motionDirection(0, 5, 0.9, out)).toEqual({ x: 0, y: -1 });
    const right = { ...motionDirection(5, 5, 0.9, out) };
    const left = { ...motionDirection(-5, 5, 0.9, out) };
    expect(right.x).toBeGreaterThan(0.5);
    expect(left.x).toBe(-right.x);
    expect(right.y).toBeLessThan(0);
    expect(Math.hypot(right.x, right.y)).toBeCloseTo(1, 12);
    // Faster than the player can go: capped at full lean.
    const capped = { ...motionDirection(50, 5, 0.9, out) };
    expect(capped.x).toBeCloseTo(right.x, 12);
  });
});

describe('the schemes through the tick', () => {
  it('smart: the balls leave towards the target, and wait while there is none', () => {
    const run = base();
    run.enemies = [makeEnemy({ id: 1, x: 400, y: 300, speed: 0, hp: 1e6 })];
    const body = launched(run, { moveX: 0, aimMode: 'smart' });
    expect(body).toBeDefined();
    expect(body?.vx ?? 0).toBeGreaterThan(0); // the target is to the right of the launcher
    expect(run.aimX).toBe(400);
    expect(run.aimY).toBe(300);
    const empty = base();
    expect(launched(empty, { moveX: 0, aimMode: 'smart' })).toBeUndefined();
  });

  it('smart: a tap (`lock`) fixes the target; 0 frees it', () => {
    const run = base();
    run.enemies = [
      makeEnemy({ id: 1, x: 60, y: 500, speed: 0, hp: 1e6 }),
      makeEnemy({ id: 2, x: 420, y: 200, speed: 0, hp: 1e6 }),
    ];
    tick(run, { moveX: 0, aimMode: 'smart', lock: 2 }, cfg);
    expect(run.aimX).toBe(420);
    tick(run, { moveX: 0, lock: 0 }, cfg);
    expect(run.aimX).toBe(60);
  });

  it('motion: still = straight up; after moving right the balls lean right (and left, left)', () => {
    const still = base();
    const straight = launched(still, { moveX: 0, aimMode: 'motion' }, 3);
    // Straight up but for the small seeded spread of the scheme (at most jitter x speed).
    expect(Math.abs(straight?.vx ?? 9)).toBeLessThan(controls.motion.jitter * 9 + 1e-9);
    const right = base();
    for (let i = 0; i < 20; i++) tick(right, { moveX: 1, aimMode: 'motion' }, cfg);
    expect(right.bodies[0]?.vx ?? 0).toBeGreaterThan(0.5);
    const left = base();
    for (let i = 0; i < 20; i++) tick(left, { moveX: -1, aimMode: 'motion' }, cfg);
    expect(left.bodies[0]?.vx ?? 0).toBeLessThan(-0.5);
  });

  it('sling: the balls stay until the release (`fire`), then leave towards the aim point', () => {
    const run = base();
    const held: Command = { moveX: 0, aimMode: 'sling', aimX: 60, aimY: 100 };
    for (let i = 0; i < 10; i++) tick(run, held, cfg);
    expect(run.bodies).toHaveLength(0);
    expect(run.cooldowns[0]).toBe(0); // ready and waiting
    tick(run, { ...held, fire: true }, cfg);
    expect(run.bodies).toHaveLength(1);
    expect(run.bodies[0]?.vx ?? 0).toBeLessThan(0); // towards the upper left
    expect(run.fireNow).toBe(true);
    tick(run, held, cfg);
    expect(run.fireNow).toBe(false);
  });

  it('the schemes reload as the table says: the smart aim is slower than the hand', () => {
    const manual = base();
    const smart = base();
    smart.aimMode = 'smart';
    expect(reloadTicks(smart, cfg)).toBeGreaterThan(reloadTicks(manual, cfg));
    expect(reloadTicks(smart, cfg)).toBe(
      Math.floor(cfg.ball.cooldownTicks * controls.smart.reloadMult + 0.5),
    );
  });

  it('is deterministic: the same commands give the same run, and mode, lock and speed are hashed', () => {
    const play = (): Run => {
      const run = base();
      run.enemies = [makeEnemy({ id: 1, x: 300, y: 300, speed: 0, hp: 1e6 })];
      for (let i = 0; i < 90; i++) {
        tick(run, { moveX: i % 40 < 20 ? 1 : -1, aimMode: 'smart', lock: i > 30 ? 1 : 0 }, cfg);
      }
      return run;
    };
    expect(hashRun(play())).toBe(hashRun(play()));
    const a = base();
    const b = base();
    b.aimMode = 'sling';
    expect(hashRun(a)).not.toBe(hashRun(b));
    const c = base();
    c.lockId = 4;
    expect(hashRun(a)).not.toBe(hashRun(c));
    const d = base();
    d.player.vel = 2;
    expect(hashRun(a)).not.toBe(hashRun(d));
  });

  it('the assisted aim still wins over a mode, and the manual aim is untouched by the new fields', () => {
    const run = base();
    run.enemies = [makeEnemy({ id: 1, x: 400, y: 300, speed: 0, hp: 1e6 })];
    run.aimX = 20;
    run.aimY = 20;
    for (let i = 0; i < 3; i++) tick(run, { moveX: 0, aimMode: 'sling', autoAim: true }, cfg);
    expect(run.bodies[0]?.vx ?? 0).toBeGreaterThan(0); // the nearest enemy, to the right
    const manual = base();
    manual.aimX = 20;
    manual.aimY = 20;
    for (let i = 0; i < 3; i++) tick(manual, { moveX: 0 }, cfg);
    expect(manual.bodies[0]?.vx ?? 0).toBeLessThan(0); // the aim point, to the left
  });
});
