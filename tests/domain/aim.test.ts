import { describe, expect, it } from 'vitest';
import {
  type AimDirection,
  aimDirection,
  cloneRun,
  createRun,
  hashRun,
  tick,
} from '../../src/domain';
import { flyingRun, makeBall, makeEnemy, quietConfig } from './fixtures';

const MIN = 0.2;
const dir = (ox: number, oy: number, tx: number, ty: number): AimDirection =>
  aimDirection(ox, oy, tx, ty, MIN, { x: 0, y: 0 });

describe('aimDirection', () => {
  it('points straight at a target above the launcher with a unit vector', () => {
    const d = dir(240, 680, 240, 100);
    expect(d.x).toBeCloseTo(0, 12);
    expect(d.y).toBeCloseTo(-1, 12);
    const diagonal = dir(240, 680, 340, 580);
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(diagonal.y).toBeCloseTo(-Math.SQRT1_2, 12);
  });

  it('always returns a unit vector', () => {
    for (const [tx, ty] of [
      [0, 0],
      [480, 0],
      [100, 600],
      [240, 680],
      [400, 700],
    ] as const) {
      const d = dir(240, 680, tx, ty);
      expect(Math.sqrt(d.x * d.x + d.y * d.y)).toBeCloseTo(1, 12);
    }
  });

  it('never leaves flatter than the minimum vertical ratio, on either side', () => {
    const right = dir(240, 680, 480, 670); // almost horizontal to the right
    expect(right.y).toBeCloseTo(-MIN, 12);
    expect(right.x).toBeCloseTo(Math.sqrt(1 - MIN * MIN), 12);
    const left = dir(240, 680, 0, 675);
    expect(left.y).toBeCloseTo(-MIN, 12);
    expect(left.x).toBeCloseTo(-Math.sqrt(1 - MIN * MIN), 12);
  });

  it('leaves a target below the launcher as the flattest shot towards its side', () => {
    const below = dir(240, 680, 100, 719);
    expect(below.y).toBeCloseTo(-MIN, 12);
    expect(below.x).toBeLessThan(0);
  });

  it('keeps a shot exactly at the limit untouched', () => {
    const d = dir(0, 0, Math.sqrt(1 - MIN * MIN), -MIN);
    expect(d.y).toBeCloseTo(-MIN, 12);
    expect(d.x).toBeCloseTo(Math.sqrt(1 - MIN * MIN), 12);
  });

  it('aiming at the launcher itself shoots straight up', () => {
    expect(dir(240, 680, 240, 680)).toEqual({ x: 0, y: -1 });
  });

  it('writes into the object it is given and returns it', () => {
    const out = { x: 9, y: 9 };
    expect(aimDirection(0, 10, 0, 0, MIN, out)).toBe(out);
    expect(out).toEqual({ x: 0, y: -1 });
  });
});

describe('the aim command', () => {
  const idle = { moveX: 0 } as const;

  it('starts straight up in manual mode', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    expect(run.autoAim).toBe(false);
    expect(run.aimX).toBe(quietConfig.arena.width / 2);
    expect(run.aimY).toBe(0);
  });

  it('stores the aim rounded to whole pixels and clamped to the arena', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    tick(run, { moveX: 0, aimX: 100.4, aimY: 200.6 }, quietConfig);
    expect([run.aimX, run.aimY]).toEqual([100, 201]);
    tick(run, { moveX: 0, aimX: 100.5, aimY: 200.5 }, quietConfig);
    expect([run.aimX, run.aimY]).toEqual([101, 201]); // half rounds up
    tick(run, { moveX: 0, aimX: -50, aimY: 9999 }, quietConfig);
    expect([run.aimX, run.aimY]).toEqual([0, quietConfig.arena.height]);
    tick(run, { moveX: 0, aimX: 9999, aimY: -5 }, quietConfig);
    expect([run.aimX, run.aimY]).toEqual([quietConfig.arena.width, 0]);
  });

  it('keeps the last aim when a command carries none, and switches the assist only when told', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    tick(run, { moveX: 0, aimX: 50, aimY: 60, autoAim: true }, quietConfig);
    tick(run, idle, quietConfig);
    expect([run.aimX, run.aimY, run.autoAim]).toEqual([50, 60, true]);
    tick(run, { moveX: 0, autoAim: false }, quietConfig);
    expect(run.autoAim).toBe(false);
    expect([run.aimX, run.aimY]).toEqual([50, 60]);
  });

  it('aim values and the assist flag are part of the state hash and of the clone', () => {
    const a = createRun(quietConfig, 1, 'charmander');
    const base = hashRun(a);
    const b = cloneRun(a);
    expect(hashRun(b)).toBe(base);
    b.aimX += 1;
    expect(hashRun(b)).not.toBe(base);
    const c = cloneRun(a);
    c.aimY += 1;
    expect(hashRun(c)).not.toBe(base);
    const d = cloneRun(a);
    d.autoAim = true;
    expect(hashRun(d)).not.toBe(base);
    expect(cloneRun(d).autoAim).toBe(true);
  });

  it('does not change anything while the run is paused for a card', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.phase = 'levelup';
    run.offers = [{ kind: 'team' }];
    tick(run, { moveX: 0, aimX: 10, aimY: 10, autoAim: true }, quietConfig);
    expect([run.aimX, run.aimY, run.autoAim]).toEqual([quietConfig.arena.width / 2, 0, false]);
  });
});

describe('launching with a manual aim', () => {
  it('fires towards the aimed point, with no enemy anywhere', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    tick(run, { moveX: 0, aimX: 340, aimY: 580 }, quietConfig); // 100 right, 100 up
    const body = run.bodies[0];
    expect(body).toBeDefined();
    expect(body?.vx).toBeGreaterThan(0);
    expect(Math.abs((body?.vx ?? 0) + (body?.vy ?? 0))).toBeLessThan(1e-9); // 45 degrees
    expect(run.events.some((e) => e.type === 'launch')).toBe(true);
  });

  it('ignores the nearest enemy: the player decides', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [makeEnemy({ id: 1, x: 100, y: 300 })]; // up-left
    run.nextEnemyId = 100;
    tick(run, { moveX: 0, aimX: 400, aimY: 300 }, quietConfig); // aims up-right
    expect(run.bodies[0]?.vx).toBeGreaterThan(0);
  });

  it('launches from the launcher position, where the player moved to this tick', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    tick(run, { moveX: 1, aimX: 400, aimY: 100 }, quietConfig);
    // The launcher moved to 245 first and the ball already advanced one step to the right.
    expect(run.bodies[0]?.x).toBeGreaterThan(240 + quietConfig.player.speed);
  });

  it('applies the manual spread, not the assisted one', () => {
    const cfg = {
      ...quietConfig,
      ball: { ...quietConfig.ball, manualAimJitter: 0.1, aimJitter: 0 },
    };
    const run = createRun(cfg, 5, 'charmander');
    run.cooldowns = [0];
    const xs = new Set<number>();
    for (let i = 0; i < 30; i++) {
      run.bodies = [];
      run.cooldowns = [0];
      tick(run, { moveX: 0, aimX: 240, aimY: 0 }, cfg);
      const vx = run.bodies[0]?.vx ?? 0;
      xs.add(vx);
      expect(Math.abs(vx / (run.bodies[0]?.vy ?? 1))).toBeLessThanOrEqual(0.1 + 1e-9);
    }
    expect(xs.size).toBeGreaterThan(5);
    const assisted = { ...cfg, ball: { ...cfg.ball, manualAimJitter: 0, aimJitter: 0.1 } };
    const manualOnly = createRun(assisted, 5, 'charmander');
    tick(manualOnly, { moveX: 0, aimX: 240, aimY: 0 }, assisted);
    expect(manualOnly.bodies[0]?.vx).toBe(0); // the assisted spread is not used in manual mode
  });

  it('draws exactly one number from the aim stream per launch in either mode', () => {
    const manual = createRun(quietConfig, 3, 'charmander');
    const auto = createRun(quietConfig, 3, 'charmander');
    auto.enemies = [makeEnemy({ id: 1 })];
    auto.nextEnemyId = 100;
    tick(manual, { moveX: 0 }, quietConfig);
    tick(auto, { moveX: 0, autoAim: true }, quietConfig);
    expect(manual.rng.aim).toEqual(auto.rng.aim);
    const idleRun = createRun(quietConfig, 3, 'charmander');
    idleRun.cooldowns = [5];
    tick(idleRun, { moveX: 0 }, quietConfig);
    expect(idleRun.rng.aim.a).not.toBe(manual.rng.aim.a); // nothing launched, nothing drawn
  });

  it('a very flat aim is lifted to the minimum vertical ratio', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    tick(run, { moveX: 0, aimX: 480, aimY: 679 }, quietConfig);
    const body = run.bodies[0];
    const speed = Math.sqrt((body?.vx ?? 0) ** 2 + (body?.vy ?? 0) ** 2);
    expect(Math.abs((body?.vy ?? 0) / speed)).toBeGreaterThanOrEqual(
      quietConfig.ball.minVerticalRatio - 1e-9,
    );
  });
});

describe('assisted aim', () => {
  it('still needs an enemy: with none it waits and keeps the ball ready', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    tick(run, { moveX: 0, autoAim: true }, quietConfig);
    expect(run.bodies).toEqual([]);
    expect(run.cooldowns).toEqual([0]);
  });

  it('uses the assisted spread', () => {
    const cfg = {
      ...quietConfig,
      ball: { ...quietConfig.ball, manualAimJitter: 0, aimJitter: 0.3 },
    };
    const xs = new Set<number>();
    for (let seed = 1; seed < 20; seed++) {
      const run = createRun(cfg, seed, 'charmander');
      run.enemies = [makeEnemy({ id: 1, x: 240, y: 200 })];
      run.nextEnemyId = 100;
      tick(run, { moveX: 0, autoAim: true }, cfg);
      xs.add(run.bodies[0]?.vx ?? 0);
    }
    expect(xs.size).toBeGreaterThan(5);
  });
});

describe('flyingRun fixtures stay valid with the new fields', () => {
  it('a ball in flight does not need any aim', () => {
    const run = flyingRun(makeBall(), []);
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.pickups).toEqual([]);
  });
});
