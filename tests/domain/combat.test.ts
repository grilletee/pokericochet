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
    expect(hitDamage(config, { ...charmander, level: 2 }, 'electric')).toBeCloseTo(7.8);
    expect(hitDamage(config, { ...charmander, level: 3 }, 'electric')).toBeCloseTo(11.7);
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
    expect(hitDamage(config, hybrid, 'grass')).toBeCloseTo(5.2 * 1.5 * 2);
  });

  it('builds a level 1 ball from a species, with the effect of its type', () => {
    expect(createBall(config, 'pikachu', 7)).toEqual({
      id: 7,
      species: 'pikachu',
      type: 'electric',
      level: 1,
      hybrid: false,
      effects: [config.typeEffects.electric],
    });
  });

  it('fails loudly on an unknown species', () => {
    expect(() => createBall(config, 'missingno', 1)).toThrow(/missingno/);
  });
});
