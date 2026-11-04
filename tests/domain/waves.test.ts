import { describe, expect, it } from 'vitest';
import {
  advanceWave,
  createRun,
  deriveRng,
  type GameConfig,
  laneX,
  nextU32,
  type Run,
  tick,
  type WaveDef,
} from '../../src/domain';
import { autoCommand, config, makeEnemy, quietConfig, withConfig } from './fixtures';

const wave = (overrides: Partial<WaveDef> = {}): WaveDef => ({
  durationTicks: 1000,
  spawnIntervalTicks: 100,
  speedScale: 1,
  hpScale: 1,
  types: ['fire', 'water', 'grass', 'electric'],
  ...overrides,
});

interface Spawned {
  readonly id: number;
  readonly species: string;
  readonly type: string;
  readonly x: number;
  readonly speed: number;
  readonly hp: number;
}

/** Runs `ticks` ticks and records every enemy at the moment it spawns. */
function recordSpawns(run: Run, cfg: GameConfig, ticks: number): Spawned[] {
  const spawned: Spawned[] = [];
  for (let i = 0; i < ticks; i++) {
    const out = tick(run, autoCommand(run), cfg);
    for (const e of out.events) {
      if (e.type !== 'spawn') continue;
      const enemy = run.enemies.find((x) => x.id === e.enemyId);
      if (enemy) {
        spawned.push({
          id: enemy.id,
          species: enemy.species,
          type: enemy.type,
          x: enemy.x,
          speed: enemy.speed,
          hp: enemy.hp,
        });
      }
    }
  }
  return spawned;
}

describe('waves: schedule', () => {
  it('spawns one enemy every spawnIntervalTicks', () => {
    const cfg = withConfig({ waves: [wave({ durationTicks: 1000, spawnIntervalTicks: 100 })] });
    const spawned = recordSpawns(createRun(cfg, 1, 'charmander'), cfg, 999);
    expect(spawned.length).toBe(9); // ticks 100, 200, ... 900
    const run = createRun(cfg, 1, 'charmander');
    recordSpawns(run, cfg, 1000);
    expect(run.nextEnemyId).toBe(11); // the 10th spawn is at tick 1000
  });

  it('moves to the next wave when its duration ends: index, tick and event', () => {
    const cfg = withConfig({
      waves: [wave({ durationTicks: 50, spawnIntervalTicks: 1000 }), wave({ durationTicks: 80 })],
    });
    const run = createRun(cfg, 1, 'charmander');
    for (let i = 0; i < 49; i++) tick(run, { moveX: 0 }, cfg);
    expect(run.wave).toEqual({ index: 0, tick: 49 });
    const out = tick(run, { moveX: 0 }, cfg);
    expect(run.wave).toEqual({ index: 1, tick: 0 });
    expect(out.events).toContainEqual({ type: 'waveStart', index: 1 });
  });

  it('uses the interval and the types of the wave in progress', () => {
    const cfg = withConfig({
      waves: [
        wave({ durationTicks: 300, spawnIntervalTicks: 100, types: ['fire'] }),
        wave({ durationTicks: 300, spawnIntervalTicks: 50, types: ['water'] }),
      ],
    });
    const spawned = recordSpawns(createRun(cfg, 3, 'charmander'), cfg, 600);
    const first = spawned.slice(0, 3);
    const second = spawned.slice(3);
    expect(first.every((s) => s.type === 'fire')).toBe(true);
    expect(second.length).toBe(6);
    expect(second.every((s) => s.type === 'water')).toBe(true);
  });

  it('stops spawning after the last wave', () => {
    const cfg = withConfig({ waves: [wave({ durationTicks: 200, spawnIntervalTicks: 100 })] });
    const run = createRun(cfg, 1, 'charmander');
    const spawned = recordSpawns(run, cfg, 1500);
    expect(spawned.length).toBe(2);
    expect(run.wave.index).toBe(1);
  });

  it('an empty wave table never spawns and cannot be won', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    expect(recordSpawns(run, quietConfig, 600)).toEqual([]);
    expect(run.phase).toBe('playing');
  });

  it('advanceWave does nothing once every wave is over', () => {
    const cfg = withConfig({ waves: [wave({ durationTicks: 5, spawnIntervalTicks: 100 })] });
    const run = createRun(cfg, 1, 'charmander');
    for (let i = 0; i < 5; i++) advanceWave(run, cfg);
    const state = JSON.stringify([run.wave, run.nextEnemyId]);
    advanceWave(run, cfg);
    expect(JSON.stringify([run.wave, run.nextEnemyId])).toBe(state);
  });
});

describe('waves: victory', () => {
  const shortWaves = withConfig({ waves: [wave({ durationTicks: 10, spawnIntervalTicks: 1000 })] });

  it('is won when the last wave is over and the field is clear', () => {
    const run = createRun(shortWaves, 1, 'charmander');
    let events: readonly { type: string }[] = [];
    for (let i = 0; i < 10; i++) events = tick(run, { moveX: 0 }, shortWaves).events;
    expect(run.phase).toBe('won');
    expect(events.some((e) => e.type === 'won')).toBe(true);
    const frozen = run.tickCount;
    tick(run, { moveX: 1 }, shortWaves);
    expect(run.tickCount).toBe(frozen);
  });

  it('is not won while an enemy is still alive, and is won as soon as it is gone', () => {
    const run = createRun(shortWaves, 1, 'charmander');
    run.enemies = [makeEnemy({ hp: 1e9, y: 100, x: 30 })];
    run.nextEnemyId = 50;
    for (let i = 0; i < 40; i++) tick(run, { moveX: 0 }, shortWaves);
    expect(run.phase).toBe('playing');
    run.enemies = [];
    tick(run, { moveX: 0 }, shortWaves);
    expect(run.phase).toBe('won');
  });

  it('is lost, not won, if the player dies on the same tick', () => {
    const run = createRun(shortWaves, 1, 'charmander');
    run.wave = { index: 1, tick: 0 }; // all waves done
    run.player.hp = 1;
    run.enemies = [makeEnemy({ y: shortWaves.arena.defenseLineY - 0.1, speed: 1 })];
    tick(run, { moveX: 0 }, shortWaves);
    expect(run.phase).toBe('lost');
  });
});

describe('waves: lanes, species and speeds', () => {
  const cfg = withConfig({ waves: [wave({ durationTicks: 100_000, spawnIntervalTicks: 10 })] });
  const sample = recordSpawns(createRun(cfg, 11, 'charmander'), cfg, 3000);

  it('places every enemy in a lane centre, and uses all lanes', () => {
    const centres = Array.from({ length: cfg.enemy.lanes }, (_, i) => laneX(cfg, i));
    expect(sample.length).toBeGreaterThan(100);
    expect(sample.every((s) => centres.some((c) => Math.abs(c - s.x) < 1e-9))).toBe(true);
    const used = new Set(sample.map((s) => Math.round(s.x)));
    expect(used.size).toBe(cfg.enemy.lanes);
  });

  it('keeps lane centres inside the arena and evenly spaced', () => {
    const xs = Array.from({ length: cfg.enemy.lanes }, (_, i) => laneX(cfg, i));
    expect(xs[0]).toBeGreaterThanOrEqual(cfg.enemy.radius);
    expect(xs[xs.length - 1]).toBeLessThanOrEqual(cfg.arena.width - cfg.enemy.radius);
    const gaps = xs.slice(1).map((x, i) => x - (xs[i] ?? 0));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-9);
  });

  it('spawns only species of the wave types', () => {
    const waterOnly = withConfig({ waves: [wave({ spawnIntervalTicks: 10, types: ['water'] })] });
    const spawned = recordSpawns(createRun(waterOnly, 4, 'charmander'), waterOnly, 800);
    expect(spawned.length).toBeGreaterThan(10);
    expect(new Set(spawned.map((s) => s.species))).toEqual(new Set(['psyduck']));
  });

  it('gives different speeds: by species, by wave scale and by a seeded variation', () => {
    const bySpecies = new Map<string, number[]>();
    for (const s of sample)
      bySpecies.set(s.species, [...(bySpecies.get(s.species) ?? []), s.speed]);
    expect(bySpecies.size).toBeGreaterThan(1);
    const speeds = bySpecies.get('psyduck') ?? [];
    expect(new Set(speeds).size).toBeGreaterThan(5); // same species, different speeds
    const spread = (Math.max(...speeds) - Math.min(...speeds)) / Math.min(...speeds);
    expect(spread).toBeGreaterThan(0.1);
    expect(spread).toBeLessThan(2 * cfg.enemy.speedVariation + 0.05);

    const fast = withConfig({ waves: [wave({ spawnIntervalTicks: 10, speedScale: 2 })] });
    const fastSample = recordSpawns(createRun(fast, 11, 'charmander'), fast, 3000);
    // same seed and same draws: exactly twice as fast
    expect(fastSample[5]?.speed).toBeCloseTo((sample[5]?.speed ?? 0) * 2, 9);
  });

  it('scales hp by the wave', () => {
    const tough = withConfig({ waves: [wave({ spawnIntervalTicks: 10, hpScale: 2 })] });
    const toughSample = recordSpawns(createRun(tough, 11, 'charmander'), tough, 3000);
    expect(toughSample[5]?.hp).toBeCloseTo((sample[5]?.hp ?? 0) * 2, 9);
  });
});

describe('waves: the spawn stream', () => {
  it('draws exactly three numbers per spawn (species, lane, speed)', () => {
    const cfg = withConfig({ waves: [wave({ spawnIntervalTicks: 1 })] });
    const run = createRun(cfg, 21, 'charmander');
    tick(run, { moveX: 0 }, cfg);
    const reference = deriveRng(21, 'spawn');
    for (let i = 0; i < 3; i++) nextU32(reference);
    expect(run.rng.spawn).toEqual(reference);
  });

  it('what spawns does not depend on the combat, the commands or the cards picked', () => {
    const play = (moveOf: (i: number) => -1 | 0 | 1, pickIndex: number) => {
      const run = createRun(config, 77, 'charmander');
      const spawned: Spawned[] = [];
      for (let i = 0; i < 6000; i++) {
        const cmd =
          run.phase === 'levelup'
            ? { moveX: moveOf(i), action: { type: 'pick' as const, index: pickIndex } }
            : { moveX: moveOf(i) };
        for (const e of tick(run, cmd, config).events) {
          if (e.type !== 'spawn') continue;
          const enemy = run.enemies.find((x) => x.id === e.enemyId);
          if (enemy) {
            spawned.push({
              id: enemy.id,
              species: enemy.species,
              type: enemy.type,
              x: enemy.x,
              speed: enemy.speed,
              hp: enemy.hp,
            });
          }
        }
        if (run.phase === 'lost') break;
      }
      return spawned;
    };
    const a = play((i) => (i % 120 < 60 ? 1 : -1), 0);
    const b = play(() => 0, 2);
    const n = Math.min(a.length, b.length);
    expect(n).toBeGreaterThan(20);
    expect(a.slice(0, n)).toEqual(b.slice(0, n));
  });
});
