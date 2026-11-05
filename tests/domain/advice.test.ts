import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { createRun, matchup, type Run, typeAdvice, waveAdvice } from '../../src/domain';

const fresh = (): Run => createRun(gameConfig, 1, 'charmander');
const WAVE = gameConfig.waves[0]?.durationTicks ?? 0;

describe('matchup: the mean effectiveness of an attack type against a list of types (ADR-050)', () => {
  it('reads the chart, and is neutral against nothing', () => {
    expect(matchup(gameConfig, 'water', ['fire'])).toBe(2);
    expect(matchup(gameConfig, 'fire', ['water'])).toBe(0.5);
    expect(matchup(gameConfig, 'electric', ['water', 'grass'])).toBe(1.25);
    expect(matchup(gameConfig, 'fire', [])).toBe(1);
  });
});

describe('waveAdvice: what the player is told about the wave and the next boss (ADR-050)', () => {
  it('at the start: wave 1 of 7, its whole length left, and the first boss two waves away', () => {
    const advice = waveAdvice(fresh(), gameConfig);
    expect(advice.index).toBe(0);
    expect(advice.total).toBe(7);
    expect(advice.ticksLeft).toBe(WAVE);
    expect(advice.ticksTotal).toBe(WAVE); // what a progress bar divides by
    expect(advice.boss).toEqual({ number: 1, interludes: 3, final: false, ticks: 2 * WAVE });
  });

  it('counts down with the wave clock', () => {
    const run = fresh();
    run.wave.index = 1;
    run.wave.tick = 700;
    const advice = waveAdvice(run, gameConfig);
    expect(advice.index).toBe(1);
    expect(advice.ticksLeft).toBe(WAVE - 700);
    expect(advice.boss?.ticks).toBe(WAVE - 700); // boss 1 comes after wave index 1 ends
  });

  it('orders the types by how much they beat or fall short, ties in the order of the types', () => {
    // Against water + fire: electric 1.5, water and grass 1.25, fire 0.5 (mean of the two cells).
    const both = typeAdvice(gameConfig, ['water', 'fire']);
    expect(both.effective).toEqual(['electric', 'water', 'grass']);
    expect(both.resisted).toEqual(['fire']);
    // Against grass + electric: electric 0.5 falls shortest, then water and grass 0.75.
    const other = typeAdvice(gameConfig, ['grass', 'electric']);
    expect(other.resisted).toEqual(['electric', 'water', 'grass']);
    expect(other.effective).toEqual(['fire']);
  });

  it('says 0 once the wave that brings the boss has started (the boss is about to appear)', () => {
    const run = fresh();
    run.wave.index = 2;
    expect(waveAdvice(run, gameConfig).boss).toMatchObject({ number: 1, ticks: 0 });
  });

  it('points at the next boss after one was met, and at the final one after the last', () => {
    const run = fresh();
    run.boss.next = 2; // two bosses have appeared
    run.wave.index = 5;
    run.wave.tick = 0;
    expect(waveAdvice(run, gameConfig).boss).toEqual({
      number: 3,
      interludes: 3,
      final: false,
      ticks: WAVE, // boss 3 comes after wave index 5
    });
    run.boss.next = 3;
    run.wave.index = 5;
    run.wave.tick = 100;
    expect(waveAdvice(run, gameConfig).boss).toEqual({
      number: 4,
      interludes: 3,
      final: true,
      ticks: 2 * WAVE - 100, // the end of the last wave (index 6)
    });
  });

  it('has no next boss while one is on the field or after the final one has appeared', () => {
    const run = fresh();
    run.enemies.push({
      id: 9,
      species: 'gyarados',
      type: 'water',
      hp: 50,
      x: 100,
      y: 100,
      speed: 0,
      radius: 20,
      threat: 1,
      xp: 1,
      burnTicks: 0,
      burnDps: 0,
      slowTicks: 0,
      slow: 0,
    });
    run.boss.id = 9;
    expect(waveAdvice(run, gameConfig).boss).toBeNull();
    run.boss.id = 0;
    run.boss.spawned = true;
    run.boss.next = 3;
    expect(waveAdvice(run, gameConfig).boss).toBeNull();
  });

  it('stays on the last wave, with nothing left of it, once every wave has been spawned', () => {
    const run = fresh();
    run.wave.index = 7;
    run.wave.tick = 0;
    run.boss.next = 3;
    const advice = waveAdvice(run, gameConfig);
    expect(advice.index).toBe(6);
    expect(advice.ticksLeft).toBe(0);
    expect(advice.boss).toMatchObject({ final: true, ticks: 0 });
  });

  it('lists the attack types that beat the wave and the ones that fall short, strongest first', () => {
    const run = fresh();
    run.waveThemes[0] = 'fire-pack';
    const advice = waveAdvice(run, gameConfig);
    expect(advice.types).toEqual(['fire']);
    expect(advice.effective).toEqual(['water']);
    expect(advice.resisted).toEqual(['fire', 'grass']);
    run.waveThemes[0] = 'electric-storm';
    const electric = waveAdvice(run, gameConfig);
    expect(electric.effective).toEqual([]);
    // Nothing beats the electric wave on the 4×4 chart and only electric falls short: the very
    // hole the eighth playtest found ("Electric is broken"); the 18×18 chart of the 4H-B2 fills it.
    expect(electric.resisted).toEqual(['electric']);
  });

  it('has no types, and nothing effective, for a wave without a theme', () => {
    const run = fresh();
    run.waveThemes[0] = '';
    const advice = waveAdvice(run, gameConfig);
    expect(advice.types).toEqual([]);
    expect(advice.effective).toEqual([]);
    expect(advice.resisted).toEqual([]);
  });
});
