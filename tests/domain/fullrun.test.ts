import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { type Command, cloneRun, createRun, hashRun, type Run, tick } from '../../src/domain';
import { activePolicy, commandFor } from '../bench/bots';

/**
 * A whole run with the real game data: waves, cards, evolutions, the boss and the end. The bot
 * produces the commands; the replay uses only (seed, commands).
 */
interface Recording {
  readonly commands: Command[];
  readonly checkpoints: Map<number, string>;
  readonly run: Run;
  readonly evolutions: number;
  readonly summons: number;
}

const CHECKPOINT_EVERY = 500;
const MAX_TICKS = 40_000;

function record(seed: number, starter: string): Recording {
  const run = createRun(gameConfig, seed, starter);
  const commands: Command[] = [];
  const checkpoints = new Map<number, string>();
  let evolutions = 0;
  let summons = 0;
  while (run.phase !== 'won' && run.phase !== 'lost' && run.tickCount < MAX_TICKS) {
    const cmd: Command = commandFor(activePolicy, run, gameConfig);
    commands.push(cmd);
    for (const e of tick(run, cmd, gameConfig).events) {
      if (e.type === 'stage') evolutions += 1;
      if (e.type === 'bossSummon') summons += 1;
    }
    // Paused ticks do not advance the clock: only the first tick that reaches a count is a checkpoint.
    if (run.tickCount % CHECKPOINT_EVERY === 0 && !checkpoints.has(run.tickCount)) {
      checkpoints.set(run.tickCount, hashRun(run));
    }
  }
  return { commands, checkpoints, run, evolutions, summons };
}

function replay(seed: number, starter: string, commands: readonly Command[]): Run {
  const run = createRun(gameConfig, seed, starter);
  for (const cmd of commands) tick(run, cmd, gameConfig);
  return run;
}

/** First seed (deterministic search) whose run evolves, reaches the boss and gets summons. */
function findInterestingRun(): { seed: number; starter: string; rec: Recording } {
  for (let seed = 1; seed < 60; seed++) {
    const starter = ['pikachu', 'squirtle', 'charmander', 'bulbasaur'][seed % 4] ?? 'pikachu';
    const rec = record(seed, starter);
    if (rec.evolutions > 0 && rec.run.boss.spawned && rec.summons > 0)
      return { seed, starter, rec };
  }
  throw new Error('no seed evolved and reached the boss');
}

describe('a whole run, with evolutions and the boss, is a function of (seed, commands)', () => {
  const { seed, starter, rec } = findInterestingRun();

  it('the scenario is not vacuous: it evolves, summons and ends', () => {
    expect(rec.evolutions).toBeGreaterThan(0);
    expect(rec.summons).toBeGreaterThan(0);
    expect(rec.run.boss.spawned).toBe(true);
    expect(['won', 'lost']).toContain(rec.run.phase);
    expect(rec.commands.some((c) => c.action?.type === 'pick')).toBe(true);
    expect(rec.run.kills).toBeGreaterThan(20);
  });

  it('replaying only the seed and the commands reproduces every checkpoint and the end', () => {
    const run = createRun(gameConfig, seed, starter);
    const checked = new Set<number>();
    for (const cmd of rec.commands) {
      tick(run, cmd, gameConfig);
      const expected = rec.checkpoints.get(run.tickCount);
      if (expected !== undefined && !checked.has(run.tickCount)) {
        checked.add(run.tickCount);
        expect(hashRun(run)).toBe(expected);
      }
    }
    expect(checked.size).toBe(rec.checkpoints.size);
    expect(hashRun(run)).toBe(hashRun(rec.run));
    expect(run.phase).toBe(rec.run.phase);
    expect(run.kills).toBe(rec.run.kills);
  });

  it('a clone taken mid-run follows the same future as the original', () => {
    const half = Math.floor(rec.commands.length / 2);
    const original = replay(seed, starter, rec.commands.slice(0, half));
    const copy = cloneRun(original);
    for (const cmd of rec.commands.slice(half)) {
      tick(original, cmd, gameConfig);
      tick(copy, cmd, gameConfig);
    }
    expect(hashRun(copy)).toBe(hashRun(original));
    expect(hashRun(copy)).toBe(hashRun(rec.run));
  });

  it('dropping the card choices changes the run: they are part of the recorded commands', () => {
    const withoutPicks = rec.commands.map((c) =>
      c.action?.type === 'pick' ? { moveX: c.moveX } : c,
    );
    expect(hashRun(replay(seed, starter, withoutPicks))).not.toBe(hashRun(rec.run));
  });

  it('another seed with the same commands gives another run', () => {
    expect(hashRun(replay(seed + 1, starter, rec.commands))).not.toBe(hashRun(rec.run));
  });
});
