import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { createBall, createRun, type GameConfig, landHit, tick } from '../../src/domain';
import { makeEnemy, withConfig } from './fixtures';

/**
 * 4W, block 2 (18th playtest: "el primer jefe duró ~2 s; el tercero es imposible"): the health of a
 * boss is fixed by its place, and one move never takes more than a share of it.
 */
function burstConfig(cap: number | undefined): GameConfig {
  const { bossMoveCap: _shipped, ...enemy } = gameConfig.enemy;
  return withConfig({
    enemy: { ...enemy, ...(cap === undefined ? {} : { bossMoveCap: cap }) },
    moves: {
      chargeByStage: [1, 1, 1],
      // A move far stronger than any of the game, to see the cap.
      tiers: [
        { kind: 'nova', radius: 500, power: 400 },
        { kind: 'nova', radius: 500, power: 400 },
        { kind: 'nova', radius: 500, power: 400 },
      ],
      byBase: { charmander: ['ember', 'ember', 'ember'] },
      signatures: {},
      status: {},
    },
  });
}

function castOnBoss(config: GameConfig): { boss: number; other: number } {
  const run = createRun(config, 1, 'charmander');
  // A boss of little health (100), so the cast is far more than its cap.
  const boss = makeEnemy({ id: 7, x: 240, y: 300, hp: 100 });
  const other = makeEnemy({ id: 8, x: 250, y: 310, hp: 1_000_000 });
  run.enemies = [boss, other];
  run.boss.id = boss.id;
  run.boss.maxHp = 100;
  const member = run.team[0];
  if (member !== undefined) member.charge = 0;
  landHit(run, config, createBall(config, 'charmander', 1), boss);
  return { boss: 100 - boss.hp, other: 1_000_000 - other.hp };
}

describe('one move never decides a boss', () => {
  it('a cast takes at most the cap of the boss health; other enemies take it all', () => {
    const capped = castOnBoss(burstConfig(0.12));
    expect(capped.boss).toBeGreaterThan(0);
    expect(capped.boss).toBeLessThanOrEqual(12 + 1e-9);
    expect(capped.other).toBeGreaterThan(12);
    // Without a cap the same cast takes much more.
    const free = castOnBoss(burstConfig(undefined));
    expect(free.boss).toBeGreaterThan(capped.boss);
  });

  it('the game ships a cap: about one eighth of a boss per cast', () => {
    expect(gameConfig.enemy.bossMoveCap).toBeGreaterThan(0.05);
    expect(gameConfig.enemy.bossMoveCap).toBeLessThanOrEqual(0.2);
  });
});

describe('the health of a boss is fixed by its place, not by its species', () => {
  it('every first boss has the same health, whatever the champion of its biome is', () => {
    const first = gameConfig.interludes?.[0];
    if (first === undefined) throw new Error('no boss between waves');
    const expected = (gameConfig.enemy.bossHpStat ?? 0) * gameConfig.enemy.hpScale * first.hpScale;
    const species = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const run = createRun(gameConfig, seed, 'pikachu');
      run.wave.index = first.after;
      run.boss.next = 0;
      for (let t = 0; t < 4000 && run.boss.maxHp === 0; t++) tick(run, { moveX: 0 }, gameConfig);
      expect(run.boss.maxHp, `seed ${seed}`).toBeCloseTo(expected, 6);
      const boss = run.enemies.find((e) => e.id === run.boss.id);
      if (boss !== undefined) species.add(boss.species);
    }
    // Several champions were met, and all had the same health.
    expect(species.size).toBeGreaterThan(1);
  });

  it('the bosses grow in health along the run, and the legendary is the summit', () => {
    const scales = (gameConfig.interludes ?? []).map((b) => b.hpScale);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i] ?? 0).toBeGreaterThan(scales[i - 1] ?? 0);
    }
    expect(gameConfig.boss?.hpScale ?? 0).toBeGreaterThan(Math.max(...scales));
  });
});
