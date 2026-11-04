import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  createBall,
  createRng,
  createRun,
  type GameConfig,
  hashRun,
  nextFloat,
  type Run,
  tick,
} from '../../src/domain';
import { config as gameConfig } from '../domain/fixtures';

const BALLS = 40;
const ENEMIES = 150;
const WARMUP_TICKS = 300;
const MEASURED_TICKS = 3000;
const TRIALS = 5;

/** Budget from Arquitectura-v0 (informative here: timing depends on the machine). */
const BUDGET_TICK_P95_MS = 2;

// Balls relaunch at once so that ~40 stay in flight; enemies are static and unkillable so the
// load stays constant during the whole measurement.
const benchConfig: GameConfig = {
  ...gameConfig,
  ball: { ...gameConfig.ball, cooldownTicks: 1 },
  waves: [],
};

function buildRun(seed: number, clustered: boolean): Run {
  const run = createRun(benchConfig, seed, 'charmander');
  const starters = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];
  run.loadout = Array.from({ length: BALLS }, (_, i) =>
    createBall(benchConfig, starters[i % starters.length] ?? 'charmander', i + 1),
  );
  run.cooldowns = Array.from({ length: BALLS }, () => 0);
  run.player.hp = 1e9;
  const rng = createRng(seed);
  run.enemies = Array.from({ length: ENEMIES }, (_, i) => ({
    id: i + 1,
    species: 'vulpix',
    type: 'fire' as const,
    hp: 1e9,
    x: clustered ? 190 + nextFloat(rng) * 100 : 16 + nextFloat(rng) * 448,
    y: clustered ? 300 + nextFloat(rng) * 100 : 40 + nextFloat(rng) * 520,
    speed: 0,
    radius: benchConfig.enemy.radius,
    threat: 1,
    xp: 1,
    burnTicks: 0,
    burnDps: 0,
    slowTicks: 0,
    slow: 0,
  }));
  run.nextEnemyId = ENEMIES + 1;
  return run;
}

function percentile(sorted: readonly number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index] ?? 0;
}

describe('physics benchmark (40 balls, 150 enemies)', () => {
  it.each([
    ['spread over the arena', false],
    ['worst case: all enemies piled in a 100x100 area', true],
  ] as const)(
    'measures the cost of one tick: %s',
    (scenario, clustered) => {
      const rows: string[] = [];
      const p95s: number[] = [];
      for (let trial = 0; trial < TRIALS; trial++) {
        const run = buildRun(1000 + trial, clustered);
        for (let i = 0; i < WARMUP_TICKS; i++) tick(run, { moveX: 0 }, benchConfig);

        const times: number[] = [];
        let bodiesSum = 0;
        let bodiesMax = 0;
        let hits = 0;
        for (let i = 0; i < MEASURED_TICKS; i++) {
          const t0 = performance.now();
          const out = tick(run, { moveX: i % 240 < 120 ? 1 : -1 }, benchConfig);
          times.push(performance.now() - t0);
          bodiesSum += run.bodies.length;
          bodiesMax = Math.max(bodiesMax, run.bodies.length);
          for (const e of out.events) if (e.type === 'hit') hits += 1;
        }
        const sorted = times.slice().sort((a, b) => a - b);
        const mean = times.reduce((a, b) => a + b, 0) / times.length;
        const p95 = percentile(sorted, 0.95);
        p95s.push(p95);
        rows.push(
          `trial ${trial + 1}: mean ${mean.toFixed(4)} ms | p50 ${percentile(sorted, 0.5).toFixed(4)} | ` +
            `p95 ${p95.toFixed(4)} | p99 ${percentile(sorted, 0.99).toFixed(4)} | ` +
            `max ${(sorted[sorted.length - 1] ?? 0).toFixed(4)} | balls in flight avg ` +
            `${(bodiesSum / MEASURED_TICKS).toFixed(1)} (max ${bodiesMax}) | hits/tick ${(hits / MEASURED_TICKS).toFixed(2)}`,
        );
        expect(run.enemies.length).toBe(ENEMIES); // the load did not change
        expect(run.phase).toBe('playing');
      }

      // Cost of hashing the whole state (used by tests, not by the game loop).
      const hashRunState = buildRun(1, clustered);
      const h0 = performance.now();
      for (let i = 0; i < 1000; i++) hashRun(hashRunState);
      const hashMs = (performance.now() - h0) / 1000;

      const worstP95 = Math.max(...p95s);
      console.log(
        [
          '',
          `PHYSICS BENCHMARK [${scenario}]  ${BALLS} balls, ${ENEMIES} enemies, ${MEASURED_TICKS} ticks x ${TRIALS} trials`,
          `node ${process.version}, ${process.platform}/${process.arch}`,
          ...rows,
          `hashRun on this state: ${hashMs.toFixed(4)} ms`,
          `worst p95 ${worstP95.toFixed(4)} ms vs budget ${BUDGET_TICK_P95_MS} ms -> ${
            worstP95 <= BUDGET_TICK_P95_MS ? 'WITHIN budget' : 'OVER budget'
          }`,
          '',
        ].join('\n'),
      );
      // Not asserting the budget: it depends on the machine. The number is recorded in the vault.
      expect(worstP95).toBeGreaterThan(0);
    },
    120_000,
  );
});
