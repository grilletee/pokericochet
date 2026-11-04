import type { Ball, EffectKind } from '../domain';
import { speciesName } from './cardText';

const EFFECT_NAMES: Record<EffectKind, string> = {
  burn: 'Quemar',
  pierce: 'Atravesar',
  drain: 'Drenar',
  chain: 'Encadenar',
};

/** 1.5 -> "1,5"; at most two decimals, no trailing zeros. */
function number(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** "Quemar 2 · Atravesar 0,5" */
export function describeEffects(ball: Ball): string {
  return ball.effects.map((e) => `${EFFECT_NAMES[e.kind]} ${number(e.strength)}`).join(' · ');
}

/** "Charmander Nv2", with "híbrida" when it is one. */
export function describeBall(ball: Ball): string {
  return `${speciesName(ball.species)} Nv${ball.level}${ball.hybrid ? ' (híbrida)' : ''}`;
}
