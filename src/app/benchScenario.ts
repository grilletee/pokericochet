import { createBall, createRng, createRun, type GameConfig, nextFloat, type Run } from '../domain';

export interface BenchLoad {
  readonly balls: number;
  readonly enemies: number;
}

/**
 * `stress` is the regression stress test (ADR-008). `real` is the performance budget: the peak
 * load measured in complete runs (24 balls in flight, 30 enemies alive in 4B; it was 4 and 20 in 3B, ADR-015).
 */
export const BENCH_LOADS = {
  stress: { balls: 40, enemies: 150 },
  real: { balls: 24, enemies: 30 },
} as const satisfies Record<string, BenchLoad>;

/**
 * A scene of `load.balls` balls in flight (they relaunch at once) against `load.enemies` static,
 * unkillable enemies. Same scenario as `pnpm bench` in Node, so the
 * browser and Node numbers can be compared.
 */
export function benchScenario(
  config: GameConfig,
  seed: number,
  load: BenchLoad,
): { run: Run; config: GameConfig } {
  const benchConfig: GameConfig = {
    ...config,
    ball: { ...config.ball, cooldownTicks: 1 },
    waves: [],
  };
  const run = createRun(benchConfig, seed, 'charmander');
  const starters = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];
  run.loadout = Array.from({ length: load.balls }, (_, i) =>
    createBall(benchConfig, starters[i % starters.length] ?? 'charmander', i + 1),
  );
  run.cooldowns = Array.from({ length: load.balls }, () => 0);
  run.player.hp = 1e9;
  const rng = createRng(seed);
  run.enemies = Array.from({ length: load.enemies }, (_, i) => ({
    id: i + 1,
    species: 'growlithe',
    type: 'fire' as const,
    hp: 1e9,
    x: 16 + nextFloat(rng) * 448,
    y: 40 + nextFloat(rng) * 520,
    speed: 0,
    radius: benchConfig.enemy.radius,
    threat: 1,
    xp: 1,
    burnTicks: 0,
    burnDps: 0,
    slowTicks: 0,
    slow: 0,
  }));
  run.nextEnemyId = load.enemies + 1;
  return { run, config: benchConfig };
}
