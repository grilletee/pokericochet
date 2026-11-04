import { describe, expect, it } from 'vitest';
import {
  type BallBody,
  bounceOffWalls,
  createRng,
  type Enemy,
  findNearestOverlap,
  nextFloat,
  reflectOffEnemy,
  SpatialGrid,
} from '../../src/domain';
import { config } from './fixtures';

const R_BALL = config.ball.radius;
const R_ENEMY = config.enemy.radius;

function enemy(id: number, x: number, y: number): Enemy {
  return {
    id,
    species: 'vulpix',
    type: 'fire',
    hp: 10,
    x,
    y,
    speed: 0,
    radius: R_ENEMY,
    threat: 1,
    xp: 1,
    burnTicks: 0,
    burnDps: 0,
    slowTicks: 0,
    slow: 0,
  };
}

function body(x: number, y: number, vx: number, vy: number): BallBody {
  return { slot: 0, x, y, vx, vy, pierce: 0, skipId: 0 };
}

function makeGrid(): SpatialGrid {
  return new SpatialGrid(
    config.arena.width,
    config.arena.height,
    config.grid.cellSize,
    R_BALL + R_ENEMY,
  );
}

/** Brute-force reference: nearest overlapping living enemy, tie broken by lower id. */
function bruteNearest(enemies: readonly Enemy[], x: number, y: number): number {
  let best = -1;
  let bestD2 = Number.POSITIVE_INFINITY;
  enemies.forEach((e, i) => {
    if (e.hp <= 0) return;
    const d2 = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    const reach = R_BALL + e.radius;
    if (d2 >= reach * reach) return;
    const current = enemies[best];
    if (d2 < bestD2 || (d2 === bestD2 && current !== undefined && e.id < current.id)) {
      best = i;
      bestD2 = d2;
    }
  });
  return best;
}

describe('spatial grid', () => {
  it('finds the same enemy as brute force on 300 random queries over 150 enemies', () => {
    const rng = createRng(31337);
    const enemies = Array.from({ length: 150 }, (_, i) =>
      enemy(i + 1, R_ENEMY + nextFloat(rng) * 440, -R_ENEMY + nextFloat(rng) * 700),
    );
    const grid = makeGrid();
    grid.build(enemies);
    for (let q = 0; q < 300; q++) {
      const x = nextFloat(rng) * 480;
      const y = nextFloat(rng) * 720;
      expect(findNearestOverlap(grid, enemies, x, y, R_BALL)).toBe(bruteNearest(enemies, x, y));
    }
  });

  it('finds enemies that are partly above the arena', () => {
    const enemies = [enemy(1, 100, -R_ENEMY)];
    const grid = makeGrid();
    grid.build(enemies);
    expect(findNearestOverlap(grid, enemies, 100, 2, R_BALL)).toBe(0);
  });

  it('breaks distance ties by lower id, whatever the array order or cell visiting order', () => {
    // Two enemies equidistant from the ball, in different grid cells. Try every combination of
    // which id is on the left and which comes first in the array.
    for (const leftId of [4, 9]) {
      for (const leftFirst of [true, false]) {
        const left = enemy(leftId, 220, 300);
        const right = enemy(leftId === 4 ? 9 : 4, 260, 300);
        const enemies = leftFirst ? [left, right] : [right, left];
        const grid = makeGrid();
        grid.build(enemies);
        const hit = findNearestOverlap(grid, enemies, 240, 300, R_BALL);
        expect(enemies[hit]?.id).toBe(4);
      }
    }
  });

  it('ignores dead enemies', () => {
    const dead = { ...enemy(1, 100, 100), hp: 0 };
    const grid = makeGrid();
    grid.build([dead]);
    expect(findNearestOverlap(grid, [dead], 100, 100, R_BALL)).toBe(-1);
  });

  it('can be rebuilt with more enemies than its initial capacity', () => {
    const many = Array.from({ length: 2000 }, (_, i) =>
      enemy(i + 1, 50 + (i % 380), 50 + (i % 600)),
    );
    const grid = makeGrid();
    grid.build(many);
    expect(
      findNearestOverlap(grid, many, many[0]?.x ?? 0, many[0]?.y ?? 0, R_BALL),
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('walls and reflection', () => {
  const { width } = config.arena;

  it('bounces off the left, right and top walls and keeps the ball inside', () => {
    const left = body(3, 300, -5, 2);
    bounceOffWalls(left, R_BALL, width);
    expect(left).toMatchObject({ x: R_BALL, vx: 5, vy: 2 });

    const right = body(width - 3, 300, 5, 2);
    bounceOffWalls(right, R_BALL, width);
    expect(right).toMatchObject({ x: width - R_BALL, vx: -5 });

    const top = body(200, 2, 1, -6);
    bounceOffWalls(top, R_BALL, width);
    expect(top).toMatchObject({ y: R_BALL, vy: 6, vx: 1 });
  });

  it('does not bounce off the bottom (balls leave there)', () => {
    const low = body(200, 800, 1, 5);
    bounceOffWalls(low, R_BALL, width);
    expect(low).toMatchObject({ y: 800, vy: 5 });
  });

  it('reflects around the contact normal, preserves speed and separates the circles', () => {
    const b = body(100, 100 + R_BALL + R_ENEMY - 4, 0, -6); // overlapping the enemy from below
    reflectOffEnemy(b, R_BALL, enemy(1, 100, 100));
    expect(b.vy).toBeCloseTo(6);
    expect(b.vx).toBeCloseTo(0);
    expect(b.y).toBeCloseTo(100 + R_BALL + R_ENEMY);
  });

  it('does not reflect a ball that is already moving away', () => {
    const b = body(100, 100 + R_BALL + R_ENEMY - 4, 0, 6);
    reflectOffEnemy(b, R_BALL, enemy(1, 100, 100));
    expect(b.vy).toBe(6);
  });

  it('handles perfectly coincident centres without NaN', () => {
    const b = body(100, 100, 3, -4);
    reflectOffEnemy(b, R_BALL, enemy(1, 100, 100));
    expect(Number.isFinite(b.x + b.y + b.vx + b.vy)).toBe(true);
  });

  it('never tunnels through an enemy at maximum speed', () => {
    const e = enemy(1, 240, 300);
    const grid = makeGrid();
    grid.build([e]);
    // Sweep the ball across the enemy at the maximum speed in sub-pixel offsets.
    for (let offset = -R_ENEMY; offset <= R_ENEMY; offset += 0.5) {
      let hit = false;
      let y = 300 + 60;
      const x = 240 + offset;
      while (y > 300 - 60) {
        if (findNearestOverlap(grid, [e], x, y, R_BALL) >= 0) hit = true;
        y -= config.ball.speedMax;
      }
      expect(hit).toBe(true);
    }
  });
});
