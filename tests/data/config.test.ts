import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
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

  it('documents the only deviation from damage = attack / 10: grass base damage x2 (ADR-015)', () => {
    expect(baseConfig.stats.typeDamage).toEqual({ fire: 1, water: 1, grass: 2, electric: 1 });
  });

  it('exposes the enemy hp multiplier as the named, provisional parameter enemy.hpScale', () => {
    expect(baseConfig.enemy.hpScale).toBe(0.45);
  });

  it('pins the provisional boss hp multiplier, so changing it is a conscious decision', () => {
    expect(baseConfig.boss?.hpScale).toBe(30);
  });

  it('maps each type to one effect kind', () => {
    expect(baseConfig.typeEffects.fire.kind).toBe('burn');
    expect(baseConfig.typeEffects.water.kind).toBe('pierce');
    expect(baseConfig.typeEffects.grass.kind).toBe('drain');
    expect(baseConfig.typeEffects.electric.kind).toBe('chain');
  });
});

describe('wave table (GDD-v0)', () => {
  const waves = gameConfig.waves;

  it('has 7 waves of 60 s, 7 minutes in total (the boss adds about one more)', () => {
    expect(waves).toHaveLength(7);
    expect(waves.every((w) => w.durationTicks === 3600)).toBe(true);
  });

  it('waves 1-3 bring one type each and waves 4-7 mix all four', () => {
    expect(waves.slice(0, 3).map((w) => w.types.length)).toEqual([1, 1, 1]);
    expect(new Set(waves.slice(0, 3).map((w) => w.types[0])).size).toBe(3);
    for (const w of waves.slice(3)) expect(new Set(w.types)).toEqual(new Set(GAME_TYPES));
  });

  it('only gets harder: faster spawns, faster and tougher enemies', () => {
    for (let i = 1; i < waves.length; i++) {
      const prev = waves[i - 1];
      const w = waves[i];
      expect(w?.spawnIntervalTicks ?? 0).toBeLessThan(prev?.spawnIntervalTicks ?? 0);
      expect(w?.speedScale ?? 0).toBeGreaterThanOrEqual(prev?.speedScale ?? 0);
      expect(w?.hpScale ?? 0).toBeGreaterThanOrEqual(prev?.hpScale ?? 0);
    }
  });

  it('every wave has at least one enemy species of each of its types', () => {
    for (const w of waves) {
      for (const type of w.types) {
        const species = gameConfig.enemySpecies.filter(
          (id) => gameConfig.species[id]?.type === type,
        );
        expect(species.length).toBeGreaterThan(0);
      }
    }
  });

  it('the species lists are consistent', () => {
    expect(gameConfig.enemySpecies).toHaveLength(8);
    expect(gameConfig.ballSpecies).toHaveLength(8);
    for (const id of [...gameConfig.enemySpecies, ...gameConfig.ballSpecies]) {
      expect(gameConfig.species[id]).toBeDefined();
    }
    for (const type of GAME_TYPES) {
      expect(
        gameConfig.ballSpecies.filter((id) => gameConfig.species[id]?.type === type),
      ).toHaveLength(2);
    }
  });
});

describe('progression and card tables', () => {
  it('level costs grow', () => {
    const costs = gameConfig.progression.levelCosts;
    for (let i = 1; i < costs.length; i++) expect(costs[i] ?? 0).toBeGreaterThan(costs[i - 1] ?? 0);
  });

  it('has sane card settings', () => {
    const c = gameConfig.cards;
    expect(c.maxBalls).toBe(4);
    expect(c.offerCount).toBe(3);
    expect(c.cadenceFactor).toBeLessThan(1);
    expect(c.cadenceFloor).toBeGreaterThan(0);
    expect(c.weights.newBall + c.weights.upgrade + c.weights.token).toBeGreaterThan(0);
  });

  it('effects match GDD-v0: burn 2/s for 3 s, drain 1 hp per 15, chain at 80 px for 50 %', () => {
    expect(gameConfig.effects).toEqual({ burnTicks: 180, drainPerHp: 15, chainRadius: 80 });
    expect(gameConfig.typeEffects.fire.strength).toBe(2);
    expect(gameConfig.typeEffects.electric.strength).toBe(0.5);
  });
});
