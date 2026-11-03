import { fuse } from './fusion';
import type { Run } from './run';
import type { Ball, FuseFailure } from './types';

export type FusionPreview =
  | { readonly ok: true; readonly ball: Ball }
  /** `ball` is what the fusion would give, when the only thing missing is a token. */
  | { readonly ok: false; readonly error: FuseFailure; readonly ball?: Ball };

/**
 * What fusing loadout slots `a` (first ingredient) and `b` would do, without changing anything.
 * The rules of `fuse` come first: if the balls cannot be fused, that is the reason shown even
 * when there is no token either.
 */
export function previewFusion(run: Run, a: number, b: number): FusionPreview {
  const first = run.loadout[a];
  const second = run.loadout[b];
  if (first === undefined || second === undefined) return { ok: false, error: 'bad-slot' };
  const result = fuse(first, second);
  if (!result.ok) return { ok: false, error: result.error };
  if (run.tokens < 1) return { ok: false, error: 'no-token', ball: result.ball };
  return { ok: true, ball: result.ball };
}

/**
 * Plays a `fuse` command (ADR-016): spends one token, puts the result in slot `a` and removes
 * slot `b`. Both balls leave the arena if they were in flight and the result starts with the
 * longer of the two cooldowns, so fusing is never a free relaunch. A refused fusion costs
 * nothing and only emits `fuseFailed`.
 */
export function applyFusion(run: Run, a: number, b: number): void {
  const preview = previewFusion(run, a, b);
  if (!preview.ok) {
    run.events.push({ type: 'fuseFailed', error: preview.error });
    return;
  }
  const cooldown = Math.max(0, run.cooldowns[a] ?? 0, run.cooldowns[b] ?? 0);
  run.tokens -= 1;
  run.loadout[a] = preview.ball;
  run.cooldowns[a] = cooldown;

  let kept = 0;
  for (const body of run.bodies) {
    if (body.slot === a || body.slot === b) continue;
    if (body.slot > b) body.slot -= 1;
    run.bodies[kept] = body;
    kept += 1;
  }
  run.bodies.length = kept;
  run.loadout.splice(b, 1);
  run.cooldowns.splice(b, 1);
  run.events.push({
    type: 'fuse',
    ballId: preview.ball.id,
    level: preview.ball.level,
    hybrid: preview.ball.hybrid,
  });
}
