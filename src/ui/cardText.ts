import type { Ball, Card, GameType, Member, StageKind } from '../domain';
import { describeEffects } from './ballText';
import { pokemonName } from './names';

const TYPE_NAMES: Record<GameType, string> = {
  fire: 'Fuego',
  water: 'Agua',
  grass: 'Planta',
  electric: 'Eléctrico',
};

/** What the text of a card needs to know about the rules in force and the team. */
export interface CardTextContext {
  typeOf(species: string): GameType | undefined;
  /** The ball of a loadout slot (a hybrid card names its ingredients by slot). */
  ballAt(slot: number): Ball | undefined;
  /** What a hybrid of the two slots would be, or null if it is not allowed. */
  previewHybrid(a: number, b: number): Ball | null;
  /** The Pokémon at a place of the team (the cards of 4F name them by place). */
  memberAt(index: number): Member | undefined;
  /** The species a Pokémon shows now: what to call and draw it (ADR-036). */
  formOf(member: Member): string;
  /** What one more level brings in evolution terms: a new form, an awakening or maximum power. */
  nextStep(member: Member): { readonly kind: StageKind; readonly to: string } | null;
  /** Balls a Pokémon of this level fires. */
  ballsAt(level: number): number;
  readonly powerStep: number;
  readonly damageStep: number;
  readonly cadenceFactor: number;
  readonly vitalityHp: number;
}

export function typeName(type: GameType): string {
  return TYPE_NAMES[type];
}

/** What the card says about the step the next level brings. */
function stepText(step: { kind: StageKind; to: string }): string {
  switch (step.kind) {
    case 'evolve':
      return `¡evoluciona a ${pokemonName(step.to)}!`;
    case 'awaken':
      return '¡despierta su poder!';
    case 'peak':
      return '¡alcanza su máximo poder!';
  }
}

/** Title and one-line description of a card, in the language of the game (Spanish). */
export function describeCard(
  card: Card,
  context: CardTextContext,
): { title: string; detail: string } {
  switch (card.kind) {
    case 'newBall': {
      const type = context.typeOf(card.species);
      return {
        title: `Fichar a ${pokemonName(card.species)}`,
        detail: type === undefined ? 'Un Pokémon más para el equipo' : `Tipo ${typeName(type)}`,
      };
    }
    case 'train': {
      const member = context.memberAt(card.member);
      if (member === undefined) return { title: 'Entrenar', detail: 'Ya no está en el equipo' };
      const next = member.level + 1;
      const parts = [`Nv ${member.level} → ${next}`];
      if (context.ballsAt(next) > context.ballsAt(member.level)) parts.push('+1 bola');
      const step = context.nextStep(member);
      if (step !== null) parts.push(stepText(step));
      return {
        title: `Entrenar a ${pokemonName(context.formOf(member))}`,
        detail: parts.join(' · '),
      };
    }
    case 'power': {
      const member = context.memberAt(card.member);
      const name = member === undefined ? '' : pokemonName(context.formOf(member));
      return {
        title: `Potencia de ${name}`,
        detail: `+${Math.round(context.powerStep * 100)} % de daño de ${name}`,
      };
    }
    case 'cadence': {
      const member = context.memberAt(card.member);
      const name = member === undefined ? '' : pokemonName(context.formOf(member));
      return {
        title: `Cadencia de ${name}`,
        detail: `−${Math.round((1 - context.cadenceFactor) * 100)} % de recarga de ${name}`,
      };
    }
    case 'team':
      return {
        title: 'Entrenamiento de equipo',
        detail: `+${Math.round(context.damageStep * 100)} % de daño en todo el equipo`,
      };
    case 'vitality':
      return { title: 'Vitalidad', detail: `+${context.vitalityHp} PV máximos y curación` };
    case 'hybrid': {
      const first = context.ballAt(card.a);
      const second = context.ballAt(card.b);
      const result = context.previewHybrid(card.a, card.b);
      if (first === undefined || second === undefined || result === null) {
        return { title: 'Híbrida', detail: 'Ya no se puede fusionar' };
      }
      return {
        title: `Híbrida: ${pokemonName(first.species)} + ${pokemonName(second.species)}`,
        detail: `Tipo ${typeName(result.type)} · ${describeEffects(result)} · sigue evolucionando como ${pokemonName(first.species)}`,
      };
    }
  }
}
