import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  addMember,
  baseOf,
  captureView,
  createRun,
  createSnapshot,
  dropCapture,
  formOfMember,
  joinTeam,
  type Run,
  writeSnapshot,
} from '../../src/domain';

/**
 * 4G-I, block 2 (16th playtest: "maté al jefe Togekiss y soltó una bola con Togetic dentro; al
 * cogerla me dio Togekiss"): what a ball shows comes from the same rules as what it is. For every
 * species of the game, at every stage, the form drawn on the floor is the form you get.
 */
const config = gameConfig;
const ids = Object.keys(config.species);
const codes = new Map(ids.map((id, code) => [id, code]));
const nameOf = (code: number | undefined): string => ids[code ?? -1] ?? '?';

/** The species that start a line (the ones captures and boss drops are made of). */
const bases = ids.filter((id) => baseOf(config, id).base === id);

function fresh(): Run {
  const run = createRun(config, 3, 'charmander');
  run.team = [];
  run.loadout = [];
  run.cooldowns = [];
  run.bodies = [];
  run.pickups = [];
  return run;
}

describe('a capture on the floor shows the form you get when you collect it (all species)', () => {
  it('every line, every stage', () => {
    let checked = 0;
    for (const base of bases) {
      for (const stage of [1, 2, 3]) {
        const run = fresh();
        run.pickups = [
          { slot: -1, species: base, type: 'normal', x: 100, y: 600, level: stage, ticks: 100 },
        ];
        const snap = createSnapshot(8, 8);
        writeSnapshot(run, snap, codes, config);
        const drawn = nameOf(snap.pickupForm[0]);
        joinTeam(run, config, base, stage, 100, false);
        const member = run.team[0];
        expect(member, `${base} ${stage}`).toBeDefined();
        const got = formOfMember(config, member as NonNullable<typeof member>);
        expect(drawn, `${base} at stage ${stage}`).toBe(got);
        checked += 1;
      }
    }
    expect(checked).toBe(bases.length * 3);
    expect(bases.length).toBeGreaterThan(100);
  }, 60_000);

  it('a stage beyond the last of the line is shown as the last one, as it joins', () => {
    const last = 1 + config.team.stageLevels.length;
    for (const stage of [0, last + 1, last + 5]) {
      const view = captureView(config, 'charmander', stage);
      expect(view.stage).toBeGreaterThanOrEqual(1);
      expect(view.stage).toBeLessThanOrEqual(last);
    }
  });

  it('the Togekiss case: the boss drops its own form, and that is what joins', () => {
    const run = fresh();
    // In the data the line starts at Togetic (Togepi is not in the roster): the boss drops a ball of
    // Togetic at stage 2, which joins as Togekiss. The 4G-H read the stage (2) as a level, gave stage 1
    // and drew Togetic.
    const { base, level } = baseOf(config, 'togekiss');
    expect(base).toBe('togetic');
    expect(level).toBe(2);
    dropCapture(run, config, base, 'fairy', 240, 300, level);
    const snap = createSnapshot(8, 8);
    writeSnapshot(run, snap, codes, config);
    expect(nameOf(snap.pickupForm[0])).toBe('togekiss');
    joinTeam(run, config, base, run.pickups[0]?.level ?? 0, 240, false);
    const member = run.team[0];
    expect(member && formOfMember(config, member)).toBe('togekiss');
  });
});

describe('a ball of the team shows the form of its Pokémon, in flight and on the floor', () => {
  it('every line, at the level of each stage: the same form as on the team bar', () => {
    for (const base of bases) {
      for (const level of [1, ...config.team.stageLevels]) {
        const run = fresh();
        addMember(run, config, base, level);
        const member = run.team[0];
        if (member === undefined) continue;
        run.bodies = [{ slot: 0, x: 100, y: 300, vx: 0, vy: -1, pierce: 0, skipId: 0 }];
        run.pickups = [
          { slot: 0, species: '', type: 'normal', x: 100, y: 680, level: 1, ticks: 50 },
        ];
        const snap = createSnapshot(8, 8);
        writeSnapshot(run, snap, codes, config);
        const bar = formOfMember(config, member);
        expect(nameOf(snap.ballForm[0]), `${base} lv${level} in flight`).toBe(bar);
        expect(nameOf(snap.pickupForm[0]), `${base} lv${level} on the floor`).toBe(bar);
      }
    }
  }, 60_000);
});
