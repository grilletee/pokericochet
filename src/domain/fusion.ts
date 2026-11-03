import type { Ball, Effect } from './types';

export const MAX_BALL_LEVEL = 3;
/** Both ingredients of a hybrid must have at least this level. */
export const HYBRID_MIN_LEVEL = 2;
/** The second ingredient of a hybrid contributes its effects at this fraction. */
export const SECONDARY_EFFECT_SCALE = 0.5;

export type FuseError =
  | 'same-ball'
  | 'hybrid-input'
  | 'max-level'
  | 'level-mismatch'
  | 'same-type-different-species'
  | 'level-too-low';

export type FuseResult =
  | { readonly ok: true; readonly ball: Ball }
  | { readonly ok: false; readonly error: FuseError };

const fail = (error: FuseError): FuseResult => ({ ok: false, error });

function mergeEffects(primary: readonly Effect[], secondary: readonly Effect[]): Effect[] {
  const merged: Effect[] = primary.map((e) => ({ kind: e.kind, strength: e.strength }));
  for (const effect of secondary) {
    const scaled = effect.strength * SECONDARY_EFFECT_SCALE;
    const index = merged.findIndex((m) => m.kind === effect.kind);
    const existing = merged[index];
    if (existing === undefined) merged.push({ kind: effect.kind, strength: scaled });
    else merged[index] = { kind: existing.kind, strength: existing.strength + scaled };
  }
  return merged;
}

/**
 * Pure fusion of two balls (ADR-003, rules in GDD-v0). The order matters: `a` is the first
 * ingredient and the result keeps its id, species and type. Inputs are never modified.
 *
 * F1, same species and same level: level + 1, up to MAX_BALL_LEVEL.
 * F2, different types, both at least HYBRID_MIN_LEVEL: a hybrid with the effects of `a` plus
 * those of `b` at half strength and the lower of the two levels. A hybrid is never fused again.
 */
export function fuse(a: Ball, b: Ball): FuseResult {
  if (a.id === b.id) return fail('same-ball');
  if (a.hybrid || b.hybrid) return fail('hybrid-input');

  if (a.species === b.species) {
    if (a.level !== b.level) return fail('level-mismatch');
    if (a.level >= MAX_BALL_LEVEL) return fail('max-level');
    return {
      ok: true,
      ball: { ...a, level: a.level + 1, effects: mergeEffects(a.effects, []) },
    };
  }

  if (a.type === b.type) return fail('same-type-different-species');
  if (a.level < HYBRID_MIN_LEVEL || b.level < HYBRID_MIN_LEVEL) return fail('level-too-low');

  return {
    ok: true,
    ball: {
      ...a,
      level: Math.min(a.level, b.level),
      hybrid: true,
      effects: mergeEffects(a.effects, b.effects),
    },
  };
}
