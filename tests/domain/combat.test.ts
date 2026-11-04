import { describe, expect, it } from 'vitest';
import { createBall, effectiveness, hitDamage } from '../../src/domain';
import { config, makeBall } from './fixtures';

describe('combat', () => {
  it('reads the multiplier from the type chart', () => {
    expect(effectiveness(config, 'fire', 'grass')).toBe(2);
    expect(effectiveness(config, 'fire', 'water')).toBe(0.5);
    expect(effectiveness(config, 'fire', 'electric')).toBe(1);
  });

  it('damage = attack / 10 x level multiplier x effectiveness', () => {
    const charmander = makeBall({ species: 'charmander', type: 'fire' }); // attack 52
    expect(hitDamage(config, charmander, 'electric')).toBeCloseTo(5.2);
    expect(hitDamage(config, charmander, 'grass')).toBeCloseTo(10.4);
    expect(hitDamage(config, charmander, 'water')).toBeCloseTo(2.6);
    const levels = config.stats.levelMultiplier;
    expect(levels).toHaveLength(config.team.maxLevel);
    expect(hitDamage(config, { ...charmander, level: 2 }, 'electric')).toBeCloseTo(
      5.2 * (levels[1] ?? 0),
    );
    expect(hitDamage(config, { ...charmander, level: 8 }, 'electric')).toBeCloseTo(
      5.2 * (levels[7] ?? 0),
    );
  });

  it('typeDamage scales the base damage of a type', () => {
    const boosted = {
      ...config,
      stats: { ...config.stats, typeDamage: { ...config.stats.typeDamage, fire: 2 } },
    };
    const fire = makeBall({ species: 'charmander', type: 'fire' });
    expect(hitDamage(boosted, fire, 'electric')).toBeCloseTo(
      2 * hitDamage(config, fire, 'electric'),
    );
    const grass = makeBall({ species: 'bulbasaur', type: 'grass' });
    expect(hitDamage(boosted, grass, 'electric')).toBeCloseTo(hitDamage(config, grass, 'electric'));
  });

  it('a hybrid uses the type of its first ingredient only', () => {
    const hybrid = makeBall({ type: 'fire', hybrid: true, level: 2 });
    expect(hitDamage(config, hybrid, 'grass')).toBeCloseTo(
      5.2 * (config.stats.levelMultiplier[1] ?? 0) * 2,
    );
  });

  it('builds a ball for a Pokémon from a species, with the effects of its type and stage', () => {
    expect(createBall(config, 'pikachu', 7)).toEqual({
      id: 7,
      owner: 0,
      stage: 1,
      species: 'pikachu',
      type: 'electric',
      level: 1,
      hybrid: false,
      effects: config.abilities.byType.electric?.[0],
    });
    const evolved = createBall(config, 'pikachu', 8, 2, config.team.stageLevels[0]);
    expect(evolved).toMatchObject({ owner: 2, stage: 2, level: config.team.stageLevels[0] });
    expect(evolved.effects).toEqual(config.abilities.byType.electric?.[1]);
  });

  it('fails loudly on an unknown species', () => {
    expect(() => createBall(config, 'missingno', 1)).toThrow(/missingno/);
  });
});
