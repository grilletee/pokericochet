import { createBall, createRng, createRun, type GameConfig, nextFloat, type Run } from '../domain';

export const BENCH_BALLS = 40;
export const BENCH_ENEMIES = 150;

/**
 * The load the performance budget talks about (ADR-008): 40 balls in flight (they relaunch at
 * once) against 150 static, unkillable enemies. Same scenario as `pnpm bench` in Node, so the
 * browser and Node numbers can be compared.
 */
export function benchScenario(config: GameConfig, seed: number): { run: Run; config: GameConfig } {
  const benchConfig: GameConfig = {
    ...config,
    ball: { ...config.ball, cooldownTicks: 1 },
    enemy: { ...config.enemy, spawnIntervalTicks: 0 },
  };
  const run = createRun(benchConfig, seed, 'charmander');
  const starters = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];
  run.loadout = Array.from({ length: BENCH_BALLS }, (_, i) =>
    createBall(benchConfig, starters[i % starters.length] ?? 'charmander', i + 1),
  );
  run.cooldowns = Array.from({ length: BENCH_BALLS }, () => 0);
  run.player.hp = 1e9;
  const rng = createRng(seed);
  run.enemies = Array.from({ length: BENCH_ENEMIES }, (_, i) => ({
    id: i + 1,
    species: 'growlithe',
    type: 'fire' as const,
    hp: 1e9,
    x: 16 + nextFloat(rng) * 448,
    y: 40 + nextFloat(rng) * 520,
    speed: 0,
    radius: benchConfig.enemy.radius,
    threat: 1,
  }));
  run.nextEnemyId = BENCH_ENEMIES + 1;
  return { run, config: benchConfig };
}
