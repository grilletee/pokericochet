import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import type { Card } from '../../src/domain';
import { describeCard, speciesName, typeName } from '../../src/ui';

const context = {
  typeOf: (species: string) => gameConfig.species[species]?.type,
  damageStep: gameConfig.cards.damageStep,
  cadenceFactor: gameConfig.cards.cadenceFactor,
  vitalityHp: gameConfig.cards.vitalityHp,
};

describe('card text', () => {
  it('names the new ball and its type', () => {
    expect(describeCard({ kind: 'newBall', species: 'pikachu' }, context)).toEqual({
      title: 'Nueva bola: Pikachu',
      detail: 'Tipo Eléctrico',
    });
  });

  it('copes with a species it does not know', () => {
    expect(describeCard({ kind: 'newBall', species: 'missingno' }, context).detail).toBe(
      'Una bola más',
    );
  });

  it('reads the numbers from the rules, not from constants in the text', () => {
    expect(describeCard({ kind: 'damage' }, context).detail).toContain('15 %');
    expect(describeCard({ kind: 'cadence' }, context).detail).toContain('10 %');
    expect(describeCard({ kind: 'vitality' }, context).detail).toContain('+2 PV');
    const other = { ...context, damageStep: 0.3 };
    expect(describeCard({ kind: 'damage' }, other).detail).toContain('30 %');
  });

  it('describes every kind of card with a non-empty title and detail', () => {
    const cards: Card[] = [
      { kind: 'newBall', species: 'charmander' },
      { kind: 'damage' },
      { kind: 'cadence' },
      { kind: 'vitality' },
      { kind: 'token' },
    ];
    for (const card of cards) {
      const { title, detail } = describeCard(card, context);
      expect(title.length).toBeGreaterThan(0);
      expect(detail.length).toBeGreaterThan(0);
    }
  });

  it('has a Spanish name for each of the four types', () => {
    expect((['fire', 'water', 'grass', 'electric'] as const).map(typeName)).toEqual([
      'Fuego',
      'Agua',
      'Planta',
      'Eléctrico',
    ]);
    expect(speciesName('charmander')).toBe('Charmander');
  });
});
