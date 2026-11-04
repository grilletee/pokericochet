import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import type { Ball, Card } from '../../src/domain';
import { fuse } from '../../src/domain';
import { describeCard, speciesName, typeName } from '../../src/ui';

const ball = (overrides: Partial<Ball>): Ball => ({
  id: 1,
  species: 'charmander',
  type: 'fire',
  level: 2,
  hybrid: false,
  effects: [{ kind: 'burn', strength: 2 }],
  ...overrides,
});
const water = ball({
  id: 2,
  species: 'squirtle',
  type: 'water',
  effects: [{ kind: 'pierce', strength: 1 }],
});
const team = [ball({}), water];

const context = {
  typeOf: (species: string) => gameConfig.species[species]?.type,
  ballAt: (slot: number) => team[slot],
  previewHybrid: (a: number, b: number) => {
    const first = team[a];
    const second = team[b];
    const result = first && second ? fuse(first, second) : null;
    return result?.ok ? result.ball : null;
  },
  evolvesWith: (species: string) => species === 'charmander',
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

  it('says that a new ball evolves with the one the player already has', () => {
    const detail = describeCard({ kind: 'newBall', species: 'charmander' }, context).detail;
    expect(detail).toContain('Tipo Fuego');
    expect(detail).toContain('Evoluciona');
  });

  it('names the two ingredients of a hybrid and says what it becomes', () => {
    expect(describeCard({ kind: 'hybrid', a: 0, b: 1 }, context)).toEqual({
      title: 'Híbrida: Charmander + Squirtle',
      detail: 'Tipo Fuego · Quemar 2 · Atravesar 0,5',
    });
    // The first ingredient lends the type.
    expect(describeCard({ kind: 'hybrid', a: 1, b: 0 }, context).detail).toContain('Tipo Agua');
  });

  it('survives a hybrid whose balls are gone', () => {
    expect(describeCard({ kind: 'hybrid', a: 5, b: 6 }, context).detail).toContain('Ya no');
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
      { kind: 'hybrid', a: 0, b: 1 },
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
