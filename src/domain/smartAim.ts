import { liveBoss } from './bossFight';
import type { GameConfig } from './config';
import type { Run } from './run';
import type { Enemy } from './types';

/**
 * The smart aim of the touch controls (4G-G, scheme A: "arrastrar para moverse + apuntado
 * inteligente"). One thumb cannot move and aim at once, so the launcher chooses WHAT to shoot at, in
 * this order, and the thumb only chooses where to stand:
 *
 *  1. the enemy the player tapped (`run.lockId`), while it lives;
 *  2. the boss (4G-H: it has no exposed point, and the marked enemies are gone);
 *  3. the enemy nearest to the defence line (the one that will hurt first).
 *
 * Pure and deterministic: ties go to the lowest id. Returns null when nothing is alive.
 */
export function smartTarget(
  run: Run,
  config: GameConfig,
): { readonly x: number; readonly y: number; readonly id: number } | null {
  if (run.lockId > 0) {
    const locked = run.enemies.find((e) => e.id === run.lockId && e.hp > 0);
    if (locked !== undefined) return { x: locked.x, y: locked.y, id: locked.id };
  }
  const boss = liveBoss(run);
  if (boss !== undefined) return { x: boss.x, y: boss.y, id: boss.id };
  const line = config.arena.defenseLineY;
  let best: Enemy | undefined;
  for (const e of run.enemies) {
    if (e.hp <= 0 || e.y >= line) continue;
    if (best === undefined || e.y > best.y || (e.y === best.y && e.id < best.id)) best = e;
  }
  return best === undefined ? null : { x: best.x, y: best.y, id: best.id };
}

/**
 * The launch direction of scheme B (an Arkanoid): the faster the launcher is moving sideways when the
 * balls leave, the more they lean the same way; standing still they go straight up. `vel` is the
 * smoothed sideways speed in pixels per tick, `maxSpeed` the player's speed and `maxSlope` how many
 * pixels sideways per pixel up at full speed. Writes the unit direction into `out`.
 */
export function motionDirection(
  vel: number,
  maxSpeed: number,
  maxSlope: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  const lean = Math.max(-1, Math.min(1, vel / Math.max(1e-9, maxSpeed)));
  const sx = lean * maxSlope;
  const length = Math.sqrt(1 + sx * sx);
  out.x = sx / length;
  out.y = -1 / length;
  return out;
}
