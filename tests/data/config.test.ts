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
  it('uses damage = attack / 10 and a level multiplier that grows with every one of the 8 levels', () => {
    expect(baseConfig.stats.damageDivisor).toBe(10);
    const levels = baseConfig.stats.levelMultiplier;
    expect(levels).toHaveLength(baseConfig.team.maxLevel);
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++)
      expect(levels[i] ?? 0).toBeGreaterThan(levels[i - 1] ?? 0);
  });

  it('keeps the ball speed below the smallest enemy radius (no tunnelling)', () => {
    expect(baseConfig.ball.speedMax).toBeLessThan(baseConfig.enemy.radius);
  });

  it('documents the deviations from damage = attack / 10: fire x1.05, water x1, grass x2.1, electric x1.35 (ADR-015, 4F-B, 4F-C, 4F-D)', () => {
    expect(baseConfig.stats.typeDamage).toEqual({
      fire: 1.05,
      water: 1.0,
      grass: 2.1,
      electric: 1.35,
    });
  });

  it('exposes the enemy hp multiplier as the named, provisional parameter enemy.hpScale', () => {
    expect(baseConfig.enemy.hpScale).toBe(1.55);
  });

  it('keeps the assisted aim a weaker aid than the manual one, but a usable one (ADR-021, M4)', () => {
    expect(baseConfig.ball.autoCooldownMult).toBeGreaterThan(1);
    expect(baseConfig.ball.aimJitter).toBeGreaterThan(baseConfig.ball.manualAimJitter);
    expect(baseConfig.ball.autoCooldownMult).toBe(1.25);
    expect(baseConfig.ball.aimJitter).toBe(0.2);
  });

  it('maps the real stats of the form onto the damage, the guard and the stage growth (ADR-037, ADR-038)', () => {
    const { stats, team, ball } = baseConfig;
    // Charmander (best attack 60) must hit as it did before the stats (attack 52 / 10 = 5.2).
    const charmander =
      (stats.powerRef / stats.damageDivisor) *
      (stats.powerMultMin +
        ((60 - stats.powerStatMin) / (stats.powerStatMax - stats.powerStatMin)) *
          (stats.powerMultMax - stats.powerMultMin));
    expect(charmander).toBeGreaterThan(5);
    expect(charmander).toBeLessThan(5.6);
    expect(stats.powerMultMin).toBeLessThan(1);
    expect(stats.powerMultMax).toBeGreaterThan(1);
    expect(stats.guardMax).toBeGreaterThan(0);
    expect(stats.guardMax).toBeLessThan(0.5);
    expect(team.stageGrowth[0]).toBe(1);
    expect(team.stageGrowth).toHaveLength(3);
    expect(team.stageGrowth[1] ?? 0).toBeGreaterThan(1);
    expect(team.stageGrowth[2] ?? 0).toBeGreaterThan(team.stageGrowth[1] ?? 0);
    expect(ball.speedCap).toBeLessThanOrEqual(ball.speedMax);
    expect(ball.speedCap).toBeGreaterThan(ball.speedMin);
  });

  it('pins the moves: three tiers that grow, a charge that falls with the stage (ADR-039)', () => {
    const { moves } = baseConfig;
    expect(moves.tiers).toHaveLength(3);
    const powers = moves.tiers.map((t) => t.power);
    expect(powers[1] ?? 0).toBeGreaterThan(powers[0] ?? 0);
    expect(powers[2] ?? 0).toBeGreaterThan(powers[1] ?? 0);
    expect(moves.tiers.map((t) => t.kind)).toEqual(['burst', 'beam', 'nova']);
    const charge = moves.chargeByStage;
    expect(charge[0] ?? 0).toBeGreaterThan(charge[1] ?? 0);
    expect(charge[1] ?? 0).toBeGreaterThan(charge[2] ?? 0);
    expect(Object.keys(moves.status).sort()).toEqual(['electric', 'fire', 'grass', 'water']);
  });

  it('pins the provisional boss hp multiplier, so changing it is a conscious decision', () => {
    expect(baseConfig.boss?.hpScale).toBe(44);
  });

  it('gives every type an effect at each of the three stages, and the first stage is the old one', () => {
    const { byType } = baseConfig.abilities;
    expect(byType.fire?.[0]?.[0]?.kind).toBe('burn');
    expect(byType.water?.[0]?.[0]?.kind).toBe('pierce');
    expect(byType.grass?.[0]?.[0]?.kind).toBe('drain');
    expect(byType.electric?.[0]?.[0]?.kind).toBe('chain');
    for (const type of ['fire', 'water', 'grass', 'electric']) {
      expect(byType[type]).toHaveLength(3);
    }
    expect(baseConfig.abilities.generic).toHaveLength(3);
  });

  it('each stage adds to the one before: later stages have at least as many effects', () => {
    for (const stages of Object.values(baseConfig.abilities.byType)) {
      expect(stages[1]?.length ?? 0).toBeGreaterThanOrEqual(stages[0]?.length ?? 0);
      expect(stages[2]?.length ?? 0).toBeGreaterThanOrEqual(stages[1]?.length ?? 0);
    }
  });

  it('keeps the team small and its levels coherent (ADR-030, ADR-031)', () => {
    const t = baseConfig.team;
    expect(t.maxMembers).toBe(6);
    expect(t.maxLevel).toBe(8);
    expect(t.ballsByLevel).toHaveLength(t.maxLevel);
    for (let i = 1; i < t.ballsByLevel.length; i++) {
      expect(t.ballsByLevel[i] ?? 0).toBeGreaterThanOrEqual(t.ballsByLevel[i - 1] ?? 0);
    }
    expect(t.stageLevels).toEqual([3, 6]);
    expect(Math.max(...t.ballRadiusByStage)).toBeLessThan(baseConfig.enemy.radius);
    expect(t.ballRadiusByStage[0]).toBe(baseConfig.ball.radius);
  });

  it('keeps hybrids off by configuration (ADR-033) and bosses without a heal (ADR-032)', () => {
    expect(baseConfig.hybrid.enabled).toBe(false);
    expect(baseConfig.cards.weights.hybrid).toBe(0);
    for (const boss of baseConfig.interludes ?? []) expect(boss.healHp).toBe(0);
  });
});

describe('wave table (GDD-v0)', () => {
  const waves = gameConfig.waves;

  it('has 7 waves of 60 s, 7 minutes in total (the boss adds about one more)', () => {
    expect(waves).toHaveLength(7);
    expect(waves.every((w) => w.durationTicks === 3600)).toBe(true);
  });

  it('every wave has a general pool of all four types and at least three themes to draw from (ADR-027)', () => {
    for (const w of waves) {
      expect(new Set(w.types)).toEqual(new Set(GAME_TYPES));
      expect(w.themes?.length ?? 0).toBeGreaterThanOrEqual(3);
      for (const id of w.themes ?? []) expect(gameConfig.themes?.[id]).toBeDefined();
    }
  });

  it('every theme names real enemy species of its own type, and purity is a share', () => {
    for (const theme of Object.values(gameConfig.themes ?? {})) {
      expect(theme.species.length).toBeGreaterThan(0);
      expect(theme.purity).toBeGreaterThan(0);
      expect(theme.purity).toBeLessThanOrEqual(1);
      for (const id of theme.species) {
        expect(gameConfig.enemySpecies, id).toContain(id);
        expect(gameConfig.species[id]?.type, id).toBe(theme.type);
      }
    }
  });

  it('the tier never goes down, and only the base form is used in the first waves', () => {
    const tiers = waves.map((w) => w.tier ?? 1);
    for (let i = 1; i < tiers.length; i++)
      expect(tiers[i]).toBeGreaterThanOrEqual(tiers[i - 1] ?? 1);
    expect(tiers[0]).toBe(1);
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
    expect(gameConfig.enemySpecies).toHaveLength(31);
    // Every ball and enemy has an evolution line, and every form maps back to it.
    for (const id of [...gameConfig.enemySpecies, ...gameConfig.ballSpecies]) {
      expect(gameConfig.lines?.[id]?.length, id).toBeGreaterThanOrEqual(1);
    }
    for (const [form, info] of Object.entries(gameConfig.forms ?? {})) {
      expect(gameConfig.lines?.[info.base]?.[info.level - 2]).toBe(form);
    }
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
    expect(c.offerCount).toBe(3);
    expect(c.cadenceFactor).toBeLessThan(1);
    expect(c.cadenceFloor).toBeGreaterThan(0);
    expect(c.upgradeCap).toBeGreaterThan(0);
    const w = c.weights;
    expect(w.newBall + w.train + w.power + w.cadence + w.vitality + w.team).toBeGreaterThan(0);
    expect(w.team).toBeLessThan(w.train); // the global card is the rare one (ADR-032)
  });

  it('effects: burn 2/s for 3 s, chain at 80 px for 50 %, and drain that costs twice as much as in 4D', () => {
    expect(gameConfig.effects).toEqual({
      burnTicks: 180,
      drainPerHp: 30,
      chainRadius: 80,
      slowTicks: 120,
    });
    expect(gameConfig.abilities.byType.fire?.[0]?.[0]?.strength).toBe(2);
    expect(gameConfig.abilities.byType.electric?.[0]?.[0]?.strength).toBe(0.5);
  });
});
