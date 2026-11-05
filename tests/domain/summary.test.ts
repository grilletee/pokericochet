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

  it('says the wave the run was in (what the HUD showed) and how many bosses there are (4F-E)', () => {
    const run = createRun(config, 1, 'charmander');
    // The third boss comes after wave 6: the HUD says wave 7 and the summary must say 7, not 6.
    run.wave.index = 6;
    expect(summarizeRun(run, config)).toMatchObject({ wavesCleared: 6, waveReached: 7 });
    run.wave.index = 0;
    expect(summarizeRun(run, config).waveReached).toBe(1);
    run.wave.index = 99; // the final boss: never more than the waves there are
    expect(summarizeRun(run, config).waveReached).toBe(7);
    run.boss.defeated = 2;
    const { bossesTotal, bossesDefeated } = summarizeRun(run, config);
    expect(bossesDefeated).toBe(2);
    expect(bossesTotal).toBe(
      (config.interludes ?? []).length + (config.boss === undefined ? 0 : 1),
    );
    const { boss: _boss, ...noBoss } = config;
    expect(summarizeRun(run, { ...noBoss, interludes: [] }).bossesTotal).toBe(0);
  });

  it('a run in progress is "ongoing"', () => {
    expect(summarizeRun(createRun(config, 1, 'charmander'), config).result).toBe('ongoing');
  });
});
