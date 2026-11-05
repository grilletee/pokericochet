import { beforeAll, describe, expect, it } from 'vitest';
import { gameConfig, MOVE_NAMES, POKEMON_NAMES } from '../../src/data';
import type { Ball, Card, Member } from '../../src/domain';
import { ballsFor, formOfMember, fuse, nextStep, stageForLevel } from '../../src/domain';
import { cardStep, describeCard, pokemonName, setNames, typeName } from '../../src/ui';

beforeAll(() => setNames(POKEMON_NAMES, MOVE_NAMES));

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
const member = (species: string, type: Member['type'], level: number, damageUps = 0): Member => ({
  species,
  type,
  level,
  starter: false,
  damageUps,
  cadenceUps: 0,
  charge: 0,
});
const team: Member[] = [member('charmander', 'fire', 2), member('squirtle', 'water', 5, 1)];

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
  formOf: (m: Member) => formOfMember(gameConfig, m),
  nextStep: (m: Member) => nextStep(gameConfig, m),
  ballsAt: (level: number) => ballsFor(gameConfig, level),
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

  it('says what a level gives: the next level, a new ball, an evolution into a named form', () => {
    // Charmander Nv2 -> Nv3 reaches the second stage (and a second ball): Charmeleon.
    // The card is the announcement (4F-D): the title names both forms.
    expect(describeCard({ kind: 'train', member: 0 }, context)).toEqual({
      title: '¡Charmander evolucionará a Charmeleon!',
      detail: 'Nv 2 → 3 · +1 bola',
    });
    // Squirtle Nv5 is Wartortle: Nv6 gives a third ball and the last form, Blastoise.
    expect(describeCard({ kind: 'train', member: 1 }, context)).toEqual({
      title: '¡Wartortle evolucionará a Blastoise!',
      detail: 'Nv 5 → 6 · +1 bola',
    });
    // Nv3 -> Nv4 only changes the level.
    const mid = { ...context, memberAt: () => member('charmander', 'fire', 3) };
    expect(describeCard({ kind: 'train', member: 0 }, mid)).toEqual({
      title: 'Entrenar a Charmeleon',
      detail: 'Nv 3 → 4',
    });
  });

  it('cardStep: only a training card one level from a stage carries a step (4F-D)', () => {
    expect(cardStep({ kind: 'train', member: 0 }, context)).toEqual({
      kind: 'evolve',
      to: 'charmeleon',
    });
    const mid = { ...context, memberAt: () => member('charmander', 'fire', 3) };
    expect(cardStep({ kind: 'train', member: 0 }, mid)).toBeNull();
    // Power and cadence never level a Pokémon up, and a member that left has no step.
    expect(cardStep({ kind: 'power', member: 0 }, context)).toBeNull();
    expect(cardStep({ kind: 'cadence', member: 0 }, context)).toBeNull();
    expect(cardStep({ kind: 'train', member: 9 }, context)).toBeNull();
  });

  it('calls the step of a line that does not change form by what it is (ADR-037)', () => {
    // Exeggcute evolves at Nv3 and only reaches its maximum power at Nv6: no "Exeggutor into Exeggutor".
    const egg = (level: number) => ({
      ...context,
      memberAt: () => member('exeggcute', 'grass', level),
    });
    expect(describeCard({ kind: 'train', member: 0 }, egg(2)).title).toBe(
      '¡Exeggcute evolucionará a Exeggutor!',
    );
    const peak = describeCard({ kind: 'train', member: 0 }, egg(5));
    expect(peak.title).toBe('¡Exeggutor alcanzará su máximo poder!');
    expect(peak.title).not.toContain('evolucion');
  });

  it('says "awakens" for a species that does not evolve, never "evolves"', () => {
    const quiet = {
      ...context,
      memberAt: () => member('tangela', 'grass', 2),
      formOf: () => 'tangela',
      nextStep: () => ({ kind: 'awaken' as const, to: 'tangela' }),
    };
    const awaken = describeCard({ kind: 'train', member: 0 }, quiet);
    expect(awaken.title).toBe('¡Tangela despertará su poder!');
    expect(awaken.title).not.toContain('evolucion');
  });

  it('survives a card about a Pokémon that is no longer in the team', () => {
    expect(describeCard({ kind: 'train', member: 9 }, context).detail).toContain('Ya no');
  });

  it('names the CURRENT form in the power and cadence cards and reads the numbers from the rules', () => {
    // Squirtle at Nv5 shows as Wartortle; Charmander at Nv2 is still Charmander.
    const power = describeCard({ kind: 'power', member: 1 }, context);
    expect(power.title).toBe('Potencia de Wartortle');
    expect(power.detail).toBe(
      `+${Math.round(gameConfig.cards.powerStep * 100)} % de daño de Wartortle`,
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

  it('never names the base species of a Pokémon that has evolved (the "Charmander for Charizard" bug)', () => {
    // Every species of the roster, at every stage: the cards say the form it shows, not its base.
    for (const base of Object.keys(gameConfig.lines ?? {})) {
      const type = gameConfig.species[base]?.type;
      if (type === undefined) continue;
      for (const level of [1, 3, 6]) {
        const m = member(base, type, level);
        const form = formOfMember(gameConfig, m);
        const name = pokemonName(form);
        const ctx = { ...context, memberAt: () => m };
        for (const kind of ['train', 'power', 'cadence'] as const) {
          const { title } = describeCard({ kind, member: 0 }, ctx);
          expect(title, `${base} Nv${level} ${kind}`).toContain(name);
          if (form !== base) expect(title).not.toContain(pokemonName(base));
        }
        expect(stageForLevel(gameConfig, level)).toBeGreaterThan(0);
      }
    }
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
  });
});
