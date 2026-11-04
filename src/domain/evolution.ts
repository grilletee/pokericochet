import { fuse, MAX_BALL_LEVEL } from './fusion';
import type { Run } from './run';
import type { Ball } from './types';

/**
 * Replaces loadout slot `a` with `ball` and removes slot `b` (ADR-024). Both balls leave the
 * arena if they were in flight or waiting on the floor, the later slots shift down, and the
 * result starts with the longer of the two cooldowns, so merging is never a free relaunch.
 */
export function mergeBalls(run: Run, a: number, b: number, ball: Ball): void {
  const cooldown = Math.max(0, run.cooldowns[a] ?? 0, run.cooldowns[b] ?? 0);
  run.loadout[a] = ball;
  run.cooldowns[a] = cooldown;

  let kept = 0;
  for (const body of run.bodies) {
    if (body.slot === a || body.slot === b) continue;
    if (body.slot > b) body.slot -= 1;
    run.bodies[kept] = body;
    kept += 1;
  }
  run.bodies.length = kept;
  let waiting = 0;
  for (const pickup of run.pickups) {
    if (pickup.slot === a || pickup.slot === b) continue;
    if (pickup.slot > b) pickup.slot -= 1;
    run.pickups[waiting] = pickup;
    waiting += 1;
  }
  run.pickups.length = waiting;
  run.loadout.splice(b, 1);
  run.cooldowns.splice(b, 1);
}

/**
 * Automatic evolution (ADR-024, ADR-026, rule F1 of `fuse`): if two balls of the team have the same
 * species and level, below the maximum, and at most one is a hybrid, they merge into one of the
 * next level (a hybrid stays a hybrid). The pair is the one with
 * the lowest first slot and then the lowest second slot, so the choice is deterministic. One
 * evolution per tick: a chain (two level-2 balls appearing together) resolves on the next ticks.
 * Allocates nothing when there is nothing to evolve.
 */
export function evolveTeam(run: Run): void {
  const team = run.loadout;
  for (let a = 0; a < team.length; a++) {
    const first = team[a];
    if (first === undefined || first.level >= MAX_BALL_LEVEL) continue;
    for (let b = a + 1; b < team.length; b++) {
      const second = team[b];
      if (
        second === undefined ||
        second.species !== first.species ||
        second.level !== first.level
      ) {
        continue;
      }
      const result = fuse(first, second);
      if (!result.ok) continue; // two hybrids
      mergeBalls(run, a, b, result.ball);
      run.events.push({
        type: 'evolve',
        ballId: result.ball.id,
        species: result.ball.species,
        level: result.ball.level,
      });
      return;
    }
  }
}

/** Outcome of a hybrid of loadout slots `a` (first ingredient) and `b`, or null if it is not allowed. */
export function previewHybrid(run: Run, a: number, b: number): Ball | null {
  const first = run.loadout[a];
  const second = run.loadout[b];
  if (first === undefined || second === undefined) return null;
  if (first.species === second.species) return null; // that is an evolution, not a hybrid
  const result = fuse(first, second);
  return result.ok ? result.ball : null;
}

/** Plays a hybrid card (ADR-024). A pair that stopped being valid does nothing. */
export function applyHybrid(run: Run, a: number, b: number): void {
  const ball = previewHybrid(run, a, b);
  const second = run.loadout[b];
  if (ball === null || second === undefined) return;
  mergeBalls(run, a, b, ball);
  run.events.push({
    type: 'hybrid',
    ballId: ball.id,
    species: ball.species,
    withSpecies: second.species,
    level: ball.level,
  });
}
