import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  attackTypeOf,
  effectiveness,
  effectivenessOn,
  GAME_TYPES,
  type GameConfig,
  hitDamage,
} from '../../src/domain';
import { makeBall, makeEnemy, quietConfig } from './fixtures';

describe('effectiveness on the 18 x 18 chart (ADR-047)', () => {
  it('reads the cells of the games for a single type', () => {
    expect(effectiveness(gameConfig, 'fire', 'grass')).toBe(2);
    expect(effectiveness(gameConfig, 'water', 'fire')).toBe(2);
    expect(effectiveness(gameConfig, 'fairy', 'dragon')).toBe(2);
    expect(effectiveness(gameConfig, 'ground', 'electric')).toBe(2);
    expect(effectiveness(gameConfig, 'fire', 'water')).toBe(0.5);
  });

  it('softens an immunity to x0.25 instead of zero (a deliberate departure from the games)', () => {
    expect(effectiveness(gameConfig, 'electric', 'ground')).toBe(0.25);
    expect(effectiveness(gameConfig, 'normal', 'ghost')).toBe(0.25);
    expect(effectiveness(gameConfig, 'dragon', 'fairy')).toBe(0.25);
    expect(effectiveness(gameConfig, 'psychic', 'dark')).toBe(0.25);
  });

  it('multiplies the two types of a defender and keeps the result between x0.25 and x3', () => {
    // Fire against Grass + Bug is x2 x x2 = 4 -> 3; Water against Ground + Rock too.
    expect(effectiveness(gameConfig, 'fire', 'grass', 'bug')).toBe(3);
    expect(effectiveness(gameConfig, 'water', 'ground', 'rock')).toBe(3);
    // Grass against Fire + Flying is 0.5 x 0.5 -> 0.25; Electric against Ground + Rock is 0.25 x 1.
    expect(effectiveness(gameConfig, 'grass', 'fire', 'flying')).toBe(0.25);
    // Fire against Water + Rock is 0.5 x 0.5 = 0.25 and against Fire + Rock 0.5 x 1.
    expect(effectiveness(gameConfig, 'fire', 'water', 'rock')).toBe(0.25);
    expect(effectiveness(gameConfig, 'electric', 'water', 'flying')).toBe(3);
    // An immunity and a weakness: Ground against Flying + Fire is 0.25 x 2 = 0.5.
    expect(effectiveness(gameConfig, 'ground', 'flying', 'fire')).toBe(0.5);
  });

  it('stays inside [0.25, 3] for every attacker and every single or double defender', () => {
    let pairs = 0;
    for (const attacker of GAME_TYPES) {
      for (const first of GAME_TYPES) {
        const single = effectiveness(gameConfig, attacker, first);
        expect(single).toBeGreaterThanOrEqual(0.25);
        expect(single).toBeLessThanOrEqual(3);
        pairs += 1;
        for (const second of GAME_TYPES) {
          const value = effectiveness(gameConfig, attacker, first, second);
          expect(value, `${attacker} > ${first}/${second}`).toBeGreaterThanOrEqual(0.25);
          expect(value, `${attacker} > ${first}/${second}`).toBeLessThanOrEqual(3);
          pairs += 1;
        }
      }
    }
    expect(pairs).toBe(18 * 18 + 18 * 18 * 18);
  });

  it('is pure: the scale is data, not a constant (a config without it reads the same numbers)', () => {
    const { typeScale: _scale, ...stats } = gameConfig.stats;
    const without: GameConfig = { ...gameConfig, stats };
    expect(effectiveness(without, 'electric', 'ground')).toBe(0.25);
    const harsh: GameConfig = {
      ...gameConfig,
      stats: { ...gameConfig.stats, typeScale: { immune: 0.1, min: 0.1, max: 2 } },
    };
    expect(effectiveness(harsh, 'electric', 'ground')).toBe(0.1);
    expect(effectiveness(harsh, 'fire', 'grass', 'bug')).toBe(2);
  });

  it('reads the second type of an enemy, and the damage of a hit follows', () => {
    const grassBug = makeEnemy({ type: 'grass', type2: 'bug' });
    expect(effectivenessOn(quietConfig, 'fire', grassBug)).toBe(3);
    const single = makeEnemy({ type: 'grass' });
    expect(effectivenessOn(quietConfig, 'fire', single)).toBe(2);
    const ball = makeBall({ type: 'fire' });
    const one = hitDamage(quietConfig, ball, 'grass');
    const two = hitDamage(quietConfig, ball, 'grass', 'bug');
    expect(two / one).toBeCloseTo(1.5, 12);
  });
});

describe('the attack type of a Pokémon is the type of its move (ADR-047)', () => {
  it('Charizard keeps attacking with Fire, and a Water/Flying line may use either', () => {
    expect(attackTypeOf(gameConfig, 'charmander', 3, 'fire')).toBe('fire');
    // Every line: the attack type at every stage is one of the types of the species at that stage.
    for (const base of gameConfig.enemySpecies) {
      for (const stage of [1, 2, 3]) {
        const own = gameConfig.species[base];
        if (own === undefined) continue;
        const type = attackTypeOf(gameConfig, base, stage, own.type);
        expect(GAME_TYPES as readonly string[], `${base} stage ${stage}`).toContain(type);
      }
    }
  });

  it('brings coverage: some dual types attack with their second type', () => {
    let secondary = 0;
    for (const base of gameConfig.enemySpecies) {
      const own = gameConfig.species[base];
      if (own === undefined) continue;
      for (const stage of [1, 2, 3]) {
        if (attackTypeOf(gameConfig, base, stage, own.type) !== own.type) secondary += 1;
      }
    }
    expect(secondary).toBeGreaterThan(20);
  });

  it('falls back to the species type without a move table', () => {
    expect(attackTypeOf(quietConfig, 'psyduck', 2, 'water')).toBe('water');
  });
});
