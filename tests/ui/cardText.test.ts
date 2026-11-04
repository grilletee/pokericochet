import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import type { Ball, Card, Member } from '../../src/domain';
import { ballsFor, fuse, stageOf } from '../../src/domain';
import { describeCard, speciesName, typeName } from '../../src/ui';

const ball = (overrides: Partial<Ball>): Ball => ({
  id: 1,
  owner: 0,
  stage: 1,
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
const balls = [ball({}), water];
const team: Member[] = [
  { species: 'charmander', type: 'fire', level: 2, starter: false, damageUps: 0, cadenceUps: 0 },
  { species: 'squirtle', type: 'water', level: 5, starter: false, damageUps: 1, cadenceUps: 0 },
];

const context = {
  typeOf: (species: string) => gameConfig.species[species]?.type,
  ballAt: (slot: number) => balls[slot],
  previewHybrid: (a: number, b: number) => {
    const first = balls[a];
    const second = balls[b];
    const result = first && second ? fuse(first, second) : null;
    return result?.ok ? result.ball : null;
  },
  memberAt: (index: number) => team[index],
  ballsAt: (level: number) => ballsFor(gameConfig, level),
  stageAt: (level: number) => stageOf(gameConfig, level),
  powerStep: gameConfig.cards.powerStep,
  damageStep: gameConfig.cards.damageStep,
  cadenceFactor: gameConfig.cards.cadenceFactor,
  vitalityHp: gameConfig.cards.vitalityHp,
};

describe('card text', () => {
  it('names the Pokémon to recruit and its type', () => {
    expect(describeCard({ kind: 'newBall', species: 'pikachu' }, context)).toEqual({
      title: 'Fichar a Pikachu',
      detail: 'Tipo Eléctrico',
    });
  });

  it('copes with a species it does not know', () => {
    expect(describeCard({ kind: 'newBall', species: 'missingno' }, context).detail).toBe(
      'Un Pokémon más para el equipo',
    );
  });

  it('says what a level gives: the next level, a new ball, an evolution', () => {
    // Charmander Nv2 -> Nv3 reaches the second stage (and a second ball) with the real rules.
    expect(describeCard({ kind: 'train', member: 0 }, context)).toEqual({
      title: 'Entrenar a Charmander',
      detail: 'Nv 2 → 3 · +1 bola · ¡evoluciona!',
    });
    // Squirtle Nv5 -> Nv6: a third ball and the last stage.
    expect(describeCard({ kind: 'train', member: 1 }, context).detail).toBe(
      'Nv 5 → 6 · +1 bola · ¡evoluciona!',
    );
    // Nv3 -> Nv4 only changes the level.
    const mid = { ...context, memberAt: () => ({ ...(team[0] as Member), level: 3 }) };
    expect(describeCard({ kind: 'train', member: 0 }, mid).detail).toBe('Nv 3 → 4');
  });

  it('survives a card about a Pokémon that is no longer in the team', () => {
    expect(describeCard({ kind: 'train', member: 9 }, context).detail).toContain('Ya no');
  });

  it('names the Pokémon in the power and cadence cards and reads the numbers from the rules', () => {
    const power = describeCard({ kind: 'power', member: 1 }, context);
    expect(power.title).toBe('Potencia de Squirtle');
    expect(power.detail).toBe(
      `+${Math.round(gameConfig.cards.powerStep * 100)} % de daño de Squirtle`,
    );
    const cadence = describeCard({ kind: 'cadence', member: 0 }, context);
    expect(cadence.title).toBe('Cadencia de Charmander');
    expect(cadence.detail).toBe(
      `−${Math.round((1 - gameConfig.cards.cadenceFactor) * 100)} % de recarga de Charmander`,
    );
    expect(describeCard({ kind: 'team' }, context).detail).toContain('8 %');
    expect(describeCard({ kind: 'vitality' }, context).detail).toContain('+2 PV');
    const other = { ...context, powerStep: 0.3, damageStep: 0.3 };
    expect(describeCard({ kind: 'power', member: 1 }, other).detail).toContain('30 %');
    expect(describeCard({ kind: 'team' }, other).detail).toContain('30 %');
  });

  it('names the two ingredients of a hybrid and says what it becomes (hybrids are off, the text stays)', () => {
    expect(describeCard({ kind: 'hybrid', a: 0, b: 1 }, context)).toEqual({
      title: 'Híbrida: Charmander + Squirtle',
      detail: 'Tipo Fuego · Quemar 2 · Atravesar 0,5 · sigue evolucionando como Charmander',
    });
    expect(describeCard({ kind: 'hybrid', a: 1, b: 0 }, context).detail).toContain('Tipo Agua');
    expect(describeCard({ kind: 'hybrid', a: 5, b: 6 }, context).detail).toContain('Ya no');
  });

  it('describes every kind of card with a non-empty title and detail', () => {
    const cards: Card[] = [
      { kind: 'newBall', species: 'charmander' },
      { kind: 'train', member: 0 },
      { kind: 'power', member: 0 },
      { kind: 'cadence', member: 0 },
      { kind: 'team' },
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
