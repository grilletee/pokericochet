import type { SpatialGrid } from './grid';
import type { BallBody, Enemy } from './types';

/**
 * Index (into `enemies`) of the living enemy that the ball overlaps most closely, or -1.
 * Ties on distance go to the lower id, so the result never depends on cell or array order.
 * `enemies` must be in the state the grid was last built from (hp may have changed).
 */
export function findNearestOverlap(
  grid: SpatialGrid,
  enemies: readonly Enemy[],
  x: number,
  y: number,
  radius: number,
): number {
  const col0 = grid.colOf(x - grid.pad);
  const col1 = grid.colOf(x + grid.pad);
  const row0 = grid.rowOf(y - grid.pad);
  const row1 = grid.rowOf(y + grid.pad);
  let best = -1;
  let bestD2 = Number.POSITIVE_INFINITY;
  let bestId = 0;
  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      const cell = row * grid.cols + col;
      const end = grid.cellStart[cell + 1] ?? 0;
      for (let k = grid.cellStart[cell] ?? 0; k < end; k++) {
        const index = grid.items[k] ?? 0;
        const e = enemies[index];
        if (e === undefined || e.hp <= 0) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        const d2 = dx * dx + dy * dy;
        const reach = radius + e.radius;
        if (d2 >= reach * reach) continue;
        if (d2 < bestD2 || (d2 === bestD2 && e.id < bestId)) {
          best = index;
          bestD2 = d2;
          bestId = e.id;
        }
      }
    }
  }
  return best;
}

/** Left, right and top walls (AABB sides). The bottom is open: balls leave there. */
export function bounceOffWalls(body: BallBody, radius: number, width: number): boolean {
  let bounced = false;
  if (body.x < radius) {
    body.x = radius;
    if (body.vx < 0) body.vx = -body.vx;
    bounced = true;
  } else if (body.x > width - radius) {
    body.x = width - radius;
    if (body.vx > 0) body.vx = -body.vx;
    bounced = true;
  }
  if (body.y < radius) {
    body.y = radius;
    if (body.vy < 0) body.vy = -body.vy;
    bounced = true;
  }
  return bounced;
}

/**
 * Anti-stall rule: keeps the speed but guarantees |vy| >= ratio * speed, so a ball that keeps
 * bouncing sideways still makes vertical progress and eventually leaves through the bottom.
 * The sign of vy is kept; a perfectly horizontal ball is sent downwards. Deterministic: it
 * uses no random numbers, so it cannot disturb any PRNG stream.
 */
export function enforceMinVertical(body: BallBody, ratio: number): void {
  const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
  if (speed === 0) return;
  const minVy = speed * ratio;
  if (Math.abs(body.vy) >= minVy) return;
  body.vy = body.vy < 0 ? -minVy : minVy;
  const vx = Math.sqrt(speed * speed - minVy * minVy);
  body.vx = body.vx < 0 ? -vx : vx;
}

/** Reflects the ball around the contact normal and pushes it out of the enemy. */
export function reflectOffEnemy(body: BallBody, radius: number, enemy: Enemy): void {
  const dx = body.x - enemy.x;
  const dy = body.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Coincident centres have no normal; pick "up" so the result stays deterministic.
  const nx = dist === 0 ? 0 : dx / dist;
  const ny = dist === 0 ? -1 : dy / dist;
  const vn = body.vx * nx + body.vy * ny;
  if (vn < 0) {
    body.vx -= 2 * vn * nx;
    body.vy -= 2 * vn * ny;
  }
  const reach = radius + enemy.radius;
  body.x = enemy.x + nx * reach;
  body.y = enemy.y + ny * reach;
}
