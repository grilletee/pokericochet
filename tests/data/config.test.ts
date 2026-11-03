import { describe, expect, it } from 'vitest';
import { baseConfig } from '../../src/data/config';
import { GAME_TYPES, type GameType } from '../../src/domain';

describe('type chart (GDD-v0)', () => {
  const chart = baseConfig.typeChart;

  it('has an entry for every attacker/defender pair, valued 0.5, 1 or 2', () => {
    for (const attacker of GAME_TYPES) {
      for (const defender of GAME_TYPES) {
        expect([0.5, 1, 2]).toContain(chart[attacker][defender]);
      }
    }
  });

  it('is x2 exactly for fire>grass, water>fire, grass>water, electric>water', () => {
    const doubled: Array<[GameType, GameType]> = [];
    for (const a of GAME_TYPES)
      for (const d of GAME_TYPES) if (chart[a][d] === 2) doubled.push([a, d]);
    expect(doubled).toEqual([
      ['fire', 'grass'],
      ['water', 'fire'],
      ['grass', 'water'],
      ['electric', 'water'],
    ]);
  });

  it('is x0.5 exactly for same type, fire>water, water>grass, grass>fire, electric>grass', () => {
    const halved: Array<[GameType, GameType]> = [];
    for (const a of GAME_TYPES)
      for (const d of GAME_TYPES) if (chart[a][d] === 0.5) halved.push([a, d]);
    expect(halved).toEqual([
      ['fire', 'fire'],
      ['fire', 'water'],
      ['water', 'water'],
      ['water', 'grass'],
      ['grass', 'fire'],
      ['grass', 'grass'],
      ['electric', 'grass'],
      ['electric', 'electric'],
    ]);
  });
});

describe('stat mapping', () => {
  it('uses damage = attack / 10 and a level multiplier of 1, 1.5, 2.25', () => {
    expect(baseConfig.stats.damageDivisor).toBe(10);
    expect(baseConfig.stats.levelMultiplier).toEqual([1, 1.5, 2.25]);
  });

  it('keeps the ball speed below the smallest enemy radius (no tunnelling)', () => {
    expect(baseConfig.ball.speedMax).toBeLessThan(baseConfig.enemy.radius);
  });

  it('maps each type to one effect kind', () => {
    expect(baseConfig.typeEffects.fire.kind).toBe('burn');
    expect(baseConfig.typeEffects.water.kind).toBe('pierce');
    expect(baseConfig.typeEffects.grass.kind).toBe('drain');
    expect(baseConfig.typeEffects.electric.kind).toBe('chain');
  });
});
