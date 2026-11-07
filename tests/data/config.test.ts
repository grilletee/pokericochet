import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { baseConfig } from '../../src/data/config';
import { GAME_TYPES, type GameType, typesOfLine } from '../../src/domain';

describe('type chart (ADR-047)', () => {
  const chart = baseConfig.typeChart;

  it('is the raw 18 x 18 table of the games: every pair is 0, 0.5, 1 or 2', () => {
    for (const attacker of GAME_TYPES) {
      for (const defender of GAME_TYPES) {
        expect([0, 0.5, 1, 2]).toContain(chart[attacker][defender]);
      }
    }
  });

  it('keeps the four classic relations of the vertical slice', () => {
    const cells: Array<[GameType, GameType, number]> = [
      ['fire', 'grass', 2],
      ['water', 'fire', 2],
      ['grass', 'water', 2],
      ['electric', 'water', 2],
      ['fire', 'water', 0.5],
      ['water', 'grass', 0.5],
      ['grass', 'fire', 0.5],
      ['electric', 'grass', 0.5],
      ['electric', 'electric', 0.5],
    ];
    for (const [a, d, value] of cells) expect(chart[a][d], `${a} > ${d}`).toBe(value);
  });

  it('answers what was missing: Ground stops Electric and Electric cannot hurt Ground (8th playtest)', () => {
    expect(chart.ground.electric).toBe(2);
    expect(chart.electric.ground).toBe(0); // the raw immunity; the game reads it as x0.25
    expect(chart.electric.flying).toBe(2);
    expect(chart.electric.dragon).toBe(0.5);
    expect(baseConfig.stats.typeScale).toEqual({ immune: 0.25, min: 0.25, max: 3 });
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

  it('documents the deviations from damage = attack / 10: fire x1.05, water x1.15, grass x1.95, electric x1.3 for the four starters (ADR-015, 4F-B..4F-E)', () => {
    const damage = baseConfig.stats.typeDamage;
    expect(damage.fire).toBe(1.05);
    expect(damage.water).toBe(1.15);
    expect(damage.grass).toBe(1.95);
    expect(damage.electric).toBe(1.3);
  });

  it('gives each of the 18 types a base damage in a sane band (4H-B2, calibrated by T2)', () => {
    for (const type of GAME_TYPES) {
      const value = baseConfig.stats.typeDamage[type];
      expect(value, type).toBeGreaterThan(0.8);
      expect(value, type).toBeLessThanOrEqual(2);
    }
  });

  it('exposes the enemy hp multiplier as the named, provisional parameter enemy.hpScale', () => {
    // 1.55 x 0.8 (9th playtest, ADR-052): the author is the difficulty reference, not the bot.
    expect(baseConfig.enemy.hpScale).toBeCloseTo(1.24, 12);
  });

  it('slows the enemies by 10 % over the 4H-B1 values (9th playtest, ADR-052)', () => {
    expect(baseConfig.enemy.speedMin).toBeCloseTo(0.18, 12);
    expect(baseConfig.enemy.speedMax).toBeCloseTo(0.45, 12);
  });

  it('keeps the assisted aim a weaker aid than the manual one (ADR-021; an accessibility setting, no balance metric)', () => {
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
    // The status of a move (burn or slow of its type): the four of the slice plus Ice, Poison, Ghost.
    expect(Object.keys(moves.status).sort()).toEqual([
      'electric',
      'fire',
      'ghost',
      'grass',
      'ice',
      'poison',
      'water',
    ]);
  });

  it('pins the provisional boss hp multiplier, so changing it is a conscious decision', () => {
    // 4G-C (ADR-053): 3.2 / 7 / 16 and 26 before; the fight lasts through the core, and the final boss
    // is clearly above the third in between.
    expect(baseConfig.boss?.hpScale).toBe(105);
    expect((baseConfig.interludes ?? []).map((b) => b.hpScale)).toEqual([6.5, 28, 56]);
  });

  it('gives every type an effect at each of the three stages, and the first stage is the old one', () => {
    const { byType } = baseConfig.abilities;
    expect(byType.fire?.[0]?.[0]?.kind).toBe('burn');
    expect(byType.water?.[0]?.[0]?.kind).toBe('pierce');
    expect(byType.grass?.[0]?.[0]?.kind).toBe('drain');
    expect(byType.electric?.[0]?.[0]?.kind).toBe('chain');
    for (const type of GAME_TYPES) expect(byType[type], type).toHaveLength(3);
    expect(baseConfig.abilities.generic).toHaveLength(3);
  });

  it('files the 18 types in the seven families of effects (ADR-047)', () => {
    const FAMILY: Record<string, string> = {
      burn: 'dot',
      poison: 'dot',
      curse: 'dot',
      chain: 'chain',
      pierce: 'pierce',
      blast: 'blast',
      splash: 'blast',
      quake: 'blast',
      push: 'blast',
      drain: 'drain',
      guard: 'drain',
      slow: 'control',
      freeze: 'control',
      stun: 'control',
      mark: 'control',
    };
    const first = (type: GameType): string => {
      const kind = baseConfig.abilities.byType[type]?.[2]?.[0]?.kind;
      return kind === undefined ? 'direct' : (FAMILY[kind] ?? kind);
    };
    const families = new Set(GAME_TYPES.map(first));
    expect([...families].sort()).toEqual(
      ['blast', 'chain', 'control', 'direct', 'dot', 'drain', 'pierce'].sort(),
    );
    // Normal and Dragon are the direct ones: no effect, more base damage instead.
    expect(first('normal')).toBe('direct');
    expect(first('dragon')).toBe('direct');
    expect(baseConfig.stats.typeDamage.dragon ?? 0).toBeGreaterThan(
      baseConfig.stats.typeDamage.fire ?? 0,
    );
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

  it('keeps hybrids off by configuration (ADR-033); bosses that hurt give back some health (4G-C)', () => {
    expect(baseConfig.hybrid.enabled).toBe(false);
    expect(baseConfig.cards.weights.hybrid).toBe(0);
    // ADR-032 had no heal; the bosses of ADR-053 hurt, so the three between waves heal a little.
    expect((baseConfig.interludes ?? []).map((boss) => boss.healHp)).toEqual([3, 3, 4]);
  });
});

describe('wave table (GDD-v0)', () => {
  const waves = gameConfig.waves;

  it('has 7 waves of 45 s, about 5 minutes in total (the bosses add the rest; 4H-B1)', () => {
    expect(waves).toHaveLength(7);
    expect(waves.every((w) => w.durationTicks === 2700)).toBe(true);
  });

  it('every wave has a general pool of all 18 types and the 14 biomes to draw from (ADR-049)', () => {
    for (const w of waves) {
      expect(new Set(w.types)).toEqual(new Set(GAME_TYPES));
      expect(w.themes?.length).toBe(14);
      for (const id of w.themes ?? []) expect(gameConfig.themes?.[id]).toBeDefined();
    }
  });

  it('has 14 biomes of 2 or 3 types, every one of the 18 types in at least one (ADR-049)', () => {
    const biomes = Object.values(gameConfig.themes ?? {});
    expect(biomes).toHaveLength(14);
    const seen = new Set<string>();
    for (const biome of biomes) {
      const types = biome.types ?? [];
      expect(types.length, biome.id).toBeGreaterThanOrEqual(2);
      expect(types.length, biome.id).toBeLessThanOrEqual(3);
      expect(biome.type, biome.id).toBe(types[0]?.type);
      expect(new Set(types.map((t) => t.type)).size, biome.id).toBe(types.length);
      expect(
        biome.species,
        `${biome.id} lists no species: they come from the pool`,
      ).toBeUndefined();
      expect(biome.purity).toBeGreaterThan(0);
      expect(biome.purity).toBeLessThanOrEqual(1);
      for (const t of types) seen.add(t.type);
    }
    expect([...seen].sort()).toEqual([...GAME_TYPES].sort());
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

  it('every wave has at least one enemy line of each of its types', () => {
    for (const w of waves) {
      for (const type of w.types) {
        const lines = gameConfig.enemySpecies.filter((id) =>
          typesOfLine(gameConfig, id).includes(type),
        );
        expect(lines.length, type).toBeGreaterThan(0);
      }
    }
  });

  it('the species lists are consistent: 214 lines by rule, every form maps back to its line', () => {
    expect(gameConfig.enemySpecies).toHaveLength(214);
    expect(gameConfig.ballSpecies).toHaveLength(214);
    for (const [form, info] of Object.entries(gameConfig.forms ?? {})) {
      expect(gameConfig.lines?.[info.base]?.[info.level - 2]).toBe(form);
    }
    for (const id of [...gameConfig.enemySpecies, ...gameConfig.ballSpecies]) {
      expect(gameConfig.species[id]).toBeDefined();
    }
    expect(gameConfig.pool?.always.every((id) => gameConfig.enemySpecies.includes(id))).toBe(true);
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
    expect(gameConfig.effects).toMatchObject({
      burnTicks: 180,
      drainPerHp: 30,
      chainRadius: 80,
      slowTicks: 120,
    });
    expect(gameConfig.abilities.byType.fire?.[0]?.[0]?.strength).toBe(2);
    expect(gameConfig.abilities.byType.electric?.[0]?.[0]?.strength).toBe(0.5);
  });
});
