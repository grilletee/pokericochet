import type { Ball, Card, GameType } from '../domain';
import { describeEffects } from './ballText';

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
  /** True if the team has a base ball of this species that a new copy would evolve. */
  evolvesWith(species: string): boolean;
  readonly damageStep: number;
  readonly cadenceFactor: number;
  readonly vitalityHp: number;
}

export function typeName(type: GameType): string {
  return TYPE_NAMES[type];
}

export function speciesName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** Title and one-line description of a card, in the language of the game (Spanish). */
export function describeCard(
  card: Card,
  context: CardTextContext,
): { title: string; detail: string } {
  switch (card.kind) {
    case 'newBall': {
      const type = context.typeOf(card.species);
      const kind = type === undefined ? 'Una bola más' : `Tipo ${typeName(type)}`;
      return {
        title: `Nueva bola: ${speciesName(card.species)}`,
        detail: context.evolvesWith(card.species)
          ? `${kind} · ¡Evoluciona con la que ya tienes!`
          : kind,
      };
    }
    case 'damage':
      return {
        title: 'Más daño',
        detail: `+${Math.round(context.damageStep * 100)} % de daño en todas las bolas`,
      };
    case 'cadence':
      return {
        title: 'Recarga rápida',
        detail: `−${Math.round((1 - context.cadenceFactor) * 100)} % de tiempo de recarga`,
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
        title: `Híbrida: ${speciesName(first.species)} + ${speciesName(second.species)}`,
        detail: `Tipo ${typeName(result.type)} · ${describeEffects(result)}`,
      };
    }
  }
}
