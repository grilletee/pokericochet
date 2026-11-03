import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { type Command, createRun, tick } from '../../src/domain';
import { chaserPolicy } from './bots';

/**
 * Cost of a tick during complete, realistic runs (waves, all four type effects, XP, cards),
 * as opposed to the static 40-ball / 150-enemy scene of physics.bench.ts. Run: pnpm bench:run
 */
const SEEDS = 12;
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];

function percentile(sorted: Float64Array, p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

describe('complete runs', () => {
  it('measures the cost of one tick', () => {
    const times: number[] = [];
    let peakEnemies = 0;
    let peakBodies = 0;
    let ticks = 0;
    let wins = 0;
    for (let i = 0; i < SEEDS; i++) {
      const run = createRun(gameConfig, 500 + i, STARTERS[i % STARTERS.length] ?? 'charmander');
      while (run.phase !== 'lost' && run.phase !== 'won' && run.tickCount < 40_000) {
        const cmd: Command =
          run.phase === 'levelup'
            ? {
                moveX: 0,
                action: { type: 'pick', index: chaserPolicy.pick(run, run.offers) },
              }
            : { moveX: chaserPolicy.move(run, gameConfig) };
        const t0 = performance.now();
        tick(run, cmd, gameConfig);
        times.push(performance.now() - t0);
        peakEnemies = Math.max(peakEnemies, run.enemies.length);
        peakBodies = Math.max(peakBodies, run.bodies.length);
      }
      ticks += run.tickCount;
      if (run.phase === 'won') wins += 1;
    }
    const sorted = Float64Array.from(times).sort();
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(
      [
        '',
        `COMPLETE RUNS  ${SEEDS} runs, ${ticks} ticks (${wins} won) with the chaser bot`,
        `node ${process.version}, ${process.platform}/${process.arch}`,
        `tick mean ${mean.toFixed(4)} ms | p50 ${percentile(sorted, 0.5).toFixed(4)} | p95 ${percentile(sorted, 0.95).toFixed(4)} | p99 ${percentile(sorted, 0.99).toFixed(4)} | max ${(sorted[sorted.length - 1] ?? 0).toFixed(4)}`,
        `peak enemies alive ${peakEnemies} | peak balls in flight ${peakBodies}`,
        '',
      ].join('\n'),
    );
    expect(times.length).toBeGreaterThan(1000);
  }, 300_000);
});
