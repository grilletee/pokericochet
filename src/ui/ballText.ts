import type { Ball, EffectKind } from '../domain';
import { pokemonName } from './names';

const EFFECT_NAMES: Record<EffectKind, string> = {
  burn: 'Quemar',
  pierce: 'Atravesar',
  drain: 'Drenar',
  chain: 'Encadenar',
  burnArea: 'Quemadura en área',
  splash: 'Salpicadura',
  slow: 'Ralentizar',
  blast: 'Explosión',
};

/** 1.5 -> "1,5"; at most two decimals, no trailing zeros. */
function number(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** "Quemar 2 · Atravesar 0,5" */
export function describeEffects(ball: Ball): string {
  return ball.effects.map((e) => `${EFFECT_NAMES[e.kind]} ${number(e.strength)}`).join(' · ');
}

/** "Charizard Nv6", with "híbrida" when it is one; `form` is the species the ball shows now. */
export function describeBall(ball: Ball, form: string = ball.species): string {
  return `${pokemonName(form)} Nv${ball.level}${ball.hybrid ? ' (híbrida)' : ''}`;
}
