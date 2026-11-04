import { describe, expect, it } from 'vitest';
import {
  createRun,
  damageEnemy,
  KILL_SCORE,
  summarizeRun,
  WAVE_SCORE,
  WIN_SCORE,
} from '../../src/domain';
import { config, makeEnemy, quietConfig } from './fixtures';

describe('run summary and score', () => {
  it('counts every kill exactly once', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    const enemy = makeEnemy({ id: 1, hp: 5 });
    run.enemies = [enemy];
    expect(damageEnemy(run, quietConfig, enemy, 2)).toBe(false);
    expect(run.kills).toBe(0);
    expect(damageEnemy(run, quietConfig, enemy, 10)).toBe(true);
    expect(damageEnemy(run, quietConfig, enemy, 10)).toBe(false); // already dead
    expect(run.kills).toBe(1);
  });

  it('summarizes a lost and a won run, with the right score', () => {
    const run = createRun(config, 42, 'bulbasaur');
    run.kills = 12;
    run.wave.index = 3;
    run.phase = 'lost';
    const lost = summarizeRun(run, config);
    expect(lost).toMatchObject({
      seed: 42,
      starter: 'bulbasaur',
      result: 'lost',
      wavesCleared: 3,
      wavesTotal: 7,
      bossReached: false,
      kills: 12,
      level: 1,
      ticks: 0,
    });
    expect(lost.score).toBe(3 * WAVE_SCORE + 12 * KILL_SCORE);
    expect(lost.team).toEqual([{ species: 'bulbasaur', form: 'bulbasaur', level: 1, stage: 1 }]);
    run.team[0] = { ...(run.team[0] as NonNullable<(typeof run.team)[number]>), level: 6 };
    // The form is what the screens name (ADR-036): the fixture has no lines, so it is the base.
    expect(summarizeRun(run, config).team).toEqual([
      { species: 'bulbasaur', form: 'bulbasaur', level: 6, stage: 3 },
    ]);

    run.phase = 'won';
    run.wave.index = 7;
    run.boss.spawned = true;
    const won = summarizeRun(run, config);
    expect(won.result).toBe('won');
    expect(won.bossReached).toBe(true);
    expect(won.score).toBe(WIN_SCORE + 7 * WAVE_SCORE + 12 * KILL_SCORE);
  });

  it('wavesCleared never exceeds the number of waves, and a win outranks any defeat', () => {
    const run = createRun(config, 1, 'charmander');
    run.wave.index = 99;
    run.kills = 400;
    run.phase = 'lost';
    const lost = summarizeRun(run, config);
    expect(lost.wavesCleared).toBe(7);
    run.phase = 'won';
    run.kills = 0;
    expect(summarizeRun(run, config).score).toBeGreaterThan(lost.score);
  });

  it('a run in progress is "ongoing"', () => {
    expect(summarizeRun(createRun(config, 1, 'charmander'), config).result).toBe('ongoing');
  });
});
