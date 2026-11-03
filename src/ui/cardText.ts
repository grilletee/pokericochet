import type { Card, GameType } from '../domain';

const TYPE_NAMES: Record<GameType, string> = {
  fire: 'Fuego',
  water: 'Agua',
  grass: 'Planta',
  electric: 'Eléctrico',
};

/** What the text of a card needs to know about the rules in force. */
export interface CardTextContext {
  typeOf(species: string): GameType | undefined;
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
      return {
        title: `Nueva bola: ${speciesName(card.species)}`,
        detail: type === undefined ? 'Una bola más' : `Tipo ${typeName(type)}`,
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
    case 'token':
      return { title: 'Ficha de fusión', detail: '+1 ficha para fusionar bolas' };
  }
}
