import type { Ball, EffectKind, FuseFailure, FusionPreview } from '../domain';
import { speciesName, typeName } from './cardText';

const EFFECT_NAMES: Record<EffectKind, string> = {
  burn: 'Quemar',
  pierce: 'Atravesar',
  drain: 'Drenar',
  chain: 'Encadenar',
};

const FAILURES: Record<FuseFailure, string> = {
  'same-ball': 'Elige dos bolas distintas.',
  'hybrid-input': 'Una híbrida no se puede volver a fusionar.',
  'max-level': 'Esa bola ya está en el nivel máximo (3).',
  'level-mismatch': 'Para subir de nivel, las dos bolas deben ser de la misma especie y nivel.',
  'same-type-different-species': 'Mismo tipo y distinta especie: no se pueden fusionar.',
  'level-too-low': 'Para una híbrida, las dos bolas deben ser de nivel 2 o más.',
  'no-token': 'Te falta una ficha de fusión (una por oleada o en las cartas).',
  'bad-slot': 'Esa bola ya no está en tu equipo.',
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

export function describeFailure(error: FuseFailure): string {
  return FAILURES[error];
}

/** What the fusion panel shows once two balls are selected: what it gives, or why not. */
export function describePreview(preview: FusionPreview): { ok: boolean; text: string } {
  if (preview.ok) return { ok: true, text: describeResult(preview.ball) };
  const reason = describeFailure(preview.error);
  return {
    ok: false,
    text: preview.ball ? `${describeResult(preview.ball)}\n${reason}` : reason,
  };
}

function describeResult(ball: Ball): string {
  if (!ball.hybrid) {
    return `Resultado: ${speciesName(ball.species)} sube a nivel ${ball.level}.`;
  }
  return (
    `Resultado: ${speciesName(ball.species)} híbrida, tipo ${typeName(ball.type)}, ` +
    `nivel ${ball.level}. Efectos: ${describeEffects(ball)}.`
  );
}
