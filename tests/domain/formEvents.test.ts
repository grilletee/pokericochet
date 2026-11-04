import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  addMember,
  captureForm,
  captureLevel,
  createRun,
  dropCapture,
  joinTeam,
  type Run,
  resolveReplace,
  trainMember,
} from '../../src/domain';

/** The real roster, where lines have forms: the events must carry the form, not the base species. */
function run(starter = 'squirtle'): Run {
  return createRun(gameConfig, 1, starter);
}

const last = <T>(list: readonly T[]): T | undefined => list[list.length - 1];

describe('events carry the form the Pokémon shows (ADR-036), with the real lines', () => {
  it('a train event names the form after the level, and the stage event says from and to', () => {
    const r = run('charmander');
    trainMember(r, gameConfig, 0, 'card'); // level 2: still Charmander
    expect(r.events.find((e) => e.type === 'train')).toMatchObject({ form: 'charmander' });
    r.events.length = 0;
    trainMember(r, gameConfig, 0, 'card'); // level 3: Charmeleon
    expect(r.events.find((e) => e.type === 'train')).toMatchObject({
      level: 3,
      form: 'charmeleon',
    });
    expect(r.events.find((e) => e.type === 'stage')).toMatchObject({
      kind: 'evolve',
      stage: 2,
      from: 'charmander',
      to: 'charmeleon',
    });
    for (let i = 0; i < 3; i++) trainMember(r, gameConfig, 0, 'card');
    const stage3 = r.events.filter((e) => e.type === 'stage').at(-1);
    expect(stage3).toMatchObject({ kind: 'evolve', stage: 3, from: 'charmeleon', to: 'charizard' });
  });

  it('a line of one evolution is announced as an evolution and then as its maximum power', () => {
    const r = run('pikachu');
    for (let i = 0; i < 5; i++) trainMember(r, gameConfig, 0, 'card'); // level 6
    const stages = r.events.filter((e) => e.type === 'stage');
    expect(stages.map((e) => (e.type === 'stage' ? [e.kind, e.from, e.to] : []))).toEqual([
      ['evolve', 'pikachu', 'raichu'],
      ['peak', 'raichu', 'raichu'],
    ]);
  });

  it('a capture joins as the form of the level it joins with, not of the enemy it came from', () => {
    // A stage 3 Charmander arrives at its capture level (4): stage 2, Charmeleon, not Charizard.
    expect(captureLevel(gameConfig, 3)).toBe(gameConfig.team.captureLevels[2]);
    expect(captureForm(gameConfig, 'charmander', 3)).toBe('charmeleon');
    expect(captureForm(gameConfig, 'charmander', 1)).toBe('charmander');
    const r = run('squirtle');
    joinTeam(r, gameConfig, 'charmander', 3, 100, false);
    expect(r.events.find((e) => e.type === 'capture')).toMatchObject({ form: 'charmeleon' });
  });

  it('the replace screen events name the form of the capture and of the Pokémon that leaves', () => {
    const r = run('squirtle');
    for (const id of ['bulbasaur', 'pikachu', 'vulpix', 'psyduck', 'oddish']) {
      addMember(r, gameConfig, id, 1);
    }
    (r.team[0] as { level: number }).level = 3; // Squirtle shows as Wartortle now
    joinTeam(r, gameConfig, 'charmander', 3, 10, false);
    expect(r.events.find((e) => e.type === 'replaceOpen')).toMatchObject({
      species: 'charmander',
      form: 'charmeleon',
    });
    r.events.length = 0;
    resolveReplace(r, gameConfig, { type: 'replace', slot: 0 });
    expect(r.events.find((e) => e.type === 'replaced')).toMatchObject({
      out: 'squirtle',
      outForm: 'wartortle',
      species: 'charmander',
      form: 'charmeleon',
    });
  });

  it('letting a capture go from the screen, or on the floor, names its form', () => {
    const r = run('squirtle');
    for (const id of ['bulbasaur', 'pikachu', 'vulpix', 'psyduck', 'oddish']) {
      addMember(r, gameConfig, id, 1);
    }
    joinTeam(r, gameConfig, 'charmander', 3, 10, true);
    expect(last(r.events)).toEqual({ type: 'release', species: 'charmander', form: 'charmeleon' });
    r.events.length = 0;
    joinTeam(r, gameConfig, 'charmander', 3, 10, false);
    r.events.length = 0;
    resolveReplace(r, gameConfig, { type: 'release' });
    expect(last(r.events)).toEqual({ type: 'release', species: 'charmander', form: 'charmeleon' });
  });

  it('a dropped capture is named by the form of the enemy that dropped it', () => {
    const r = run('squirtle');
    dropCapture(r, gameConfig, 'charmander', 'fire', 100, 200, 2);
    expect(last(r.events)).toMatchObject({
      type: 'captureDrop',
      species: 'charmander',
      level: 2,
      form: 'charmeleon',
    });
    r.events.length = 0;
    dropCapture(r, gameConfig, 'charmander', 'fire', 100, 200, 1);
    expect(last(r.events)).toMatchObject({ form: 'charmander' });
  });
});
