import type { Snapshot } from '../domain';

/**
 * Interpolation between two consecutive snapshots, without allocating. Pure functions over
 * typed arrays: they do not touch PixiJS, so they run (and are tested) in Node.
 */

/** Balls are matched by loadout slot. A ball that was not in flight before is not blended. */
export function interpolateBalls(
  prev: Snapshot,
  curr: Snapshot,
  alpha: number,
  outX: Float32Array,
  outY: Float32Array,
): void {
  for (let slot = 0; slot < curr.slotCount; slot++) {
    const x1 = curr.ballX[slot] ?? 0;
    const y1 = curr.ballY[slot] ?? 0;
    if (prev.ballActive[slot] === 1 && slot < prev.slotCount) {
      const x0 = prev.ballX[slot] ?? 0;
      const y0 = prev.ballY[slot] ?? 0;
      outX[slot] = x0 + (x1 - x0) * alpha;
      outY[slot] = y0 + (y1 - y0) * alpha;
    } else {
      outX[slot] = x1;
      outY[slot] = y1;
    }
  }
}

/**
 * Enemies are matched by id. Both lists are in ascending id order, so one forward pass over
 * `prev` finds every match. An enemy that did not exist in `prev` is not blended.
 */
export function interpolateEnemies(
  prev: Snapshot,
  curr: Snapshot,
  alpha: number,
  outX: Float32Array,
  outY: Float32Array,
): void {
  let j = 0;
  for (let i = 0; i < curr.enemyCount; i++) {
    const id = curr.enemyId[i] ?? 0;
    while (j < prev.enemyCount && (prev.enemyId[j] ?? 0) < id) j += 1;
    const x1 = curr.enemyX[i] ?? 0;
    const y1 = curr.enemyY[i] ?? 0;
    if (j < prev.enemyCount && prev.enemyId[j] === id) {
      const x0 = prev.enemyX[j] ?? 0;
      const y0 = prev.enemyY[j] ?? 0;
      outX[i] = x0 + (x1 - x0) * alpha;
      outY[i] = y0 + (y1 - y0) * alpha;
    } else {
      outX[i] = x1;
      outY[i] = y1;
    }
  }
}
