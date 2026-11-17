import type { Particle, ParticleContainer } from 'pixi.js';

/**
 * Helpers for the particle containers of PixiJS (4V, performance). The small things that move by
 * the hundred every frame are particles on the one sheet of the effects: no scene-graph node each
 * and one draw call per layer.
 */

/** Everything of a particle may change from frame to frame but its rotation. */
export const PARTICLE_DYNAMIC = {
  position: true,
  vertex: true,
  rotation: false,
  uvs: true,
  color: true,
};

/**
 * Makes the first `used` particles of a pool the ones a container draws. A particle container
 * uploads every particle it holds on every frame, so it holds only the ones in use: the pool is
 * filled in order, and the list of the container is that pool cut to `used`.
 */
export function liveParticles(
  container: ParticleContainer,
  pool: readonly Particle[],
  used: number,
): void {
  const live = container.particleChildren;
  const want = Math.min(used, pool.length);
  for (let i = live.length; i < want; i++) {
    const next = pool[i];
    if (next !== undefined) live.push(next);
  }
  if (live.length > want) live.length = want;
}

/** Places a particle; its tint is only touched when it changes (setting one converts colours). */
export function placeParticle(
  p: Particle,
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
  tint: number,
  alpha: number,
): void {
  p.x = x;
  p.y = y;
  p.scaleX = scaleX;
  p.scaleY = scaleY;
  if (p.tint !== tint) p.tint = tint;
  p.alpha = alpha;
}
