import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  addMember,
  baseOf,
  createRun,
  formOfMember,
  joinTeam,
  onBossDefeated,
  type Run,
  resolveReplace,
  stageOf,
} from '../../src/domain';
import { makeEnemy } from './fixtures';

/**
 * "You capture what you beat" for EVERY species of the roster (4F-E). A boss that dies drops its
 * own form; whatever way the ball reaches the team (a free place, a duplicate, the replace screen)
 * the Pokémon that joins shows that same form, at the first level of its stage. The 4F-D fix was
 * tested only with one hand-picked case; the real cause (a Kingdra joining as a Seadra) hid in the
 * capture-level table, which no test compared with the stage thresholds.
 */
const ROSTER = Object.keys(gameConfig.species).sort();

/** A real run whose next interlude boss is the given species, defeated on the spot. */
function defeat(species: string): Run {
  // The starter must not be of the line under test: a copy of it would be a duplicate, not a join.
  const starter = baseOf(gameConfig, species).base === 'pikachu' ? 'squirtle' : 'pikachu';
  const run = createRun(gameConfig, 1, starter);
  run.boss.next = 1; // an interlude boss between waves (the next one is the first)
  run.boss.spawned = false;
  const boss = makeEnemy({
    id: 99,
    species,
    type: gameConfig.species[species]?.type ?? 'fire',
    hp: 0,
    x: 240,
    y: 200,
  });
  run.events.length = 0;
  onBossDefeated(run, gameConfig, boss);
  return run;
}

/** The lowest level of a stage: the level at which that stage starts. */
function firstLevelOf(stage: number): number {
  return stage <= 1 ? 1 : (gameConfig.team.stageLevels[stage - 2] ?? 1);
}

describe('capturing what you beat, for every species of the roster (4F-E)', () => {
  it('the roster is not empty and every species is its own line or part of one', () => {
    expect(ROSTER.length).toBeGreaterThan(40);
  });

  it.each(ROSTER)(
    '%s: the boss drops its own form and it joins as that form at the first level of its stage',
    (species) => {
      const { base, level: stage } = baseOf(gameConfig, species);
      // 1. The drop on the floor.
      const dropped = defeat(species);
      const drop = dropped.events.find((e) => e.type === 'captureDrop');
      expect(drop, 'a boss drops a ball').toBeDefined();
      if (drop?.type !== 'captureDrop') return;
      expect(drop.form).toBe(species);
      expect(drop.species).toBe(base);
      const pickup = dropped.pickups[0];
      expect(pickup?.level).toBe(stage);

      // 2. A free place: it joins as that form, at the first level of the stage.
      const free = defeat(species);
      const arrive = (run: Run): number => {
        run.events.length = 0;
        joinTeam(run, gameConfig, pickup?.species ?? base, pickup?.level ?? 1, 240, false);
        return run.team.findIndex((m) => m.species === base);
      };
      const freeIndex = arrive(free);
      const joined = free.team[freeIndex];
      expect(joined, 'it joined the team').toBeDefined();
      if (joined === undefined) return;
      expect(formOfMember(gameConfig, joined)).toBe(species);
      expect(joined.level).toBe(firstLevelOf(stage));
      expect(stageOf(gameConfig, joined.level)).toBe(stage);

      // 3. A duplicate of a lower level of the same line: it is lifted to that form.
      const dup = defeat(species);
      const own = addMember(dup, gameConfig, base, 1);
      arrive(dup);
      const lifted = dup.team[own];
      expect(lifted).toBeDefined();
      if (lifted === undefined) return;
      expect(formOfMember(gameConfig, lifted)).toBe(species);
      expect(lifted.level).toBeGreaterThanOrEqual(firstLevelOf(stage));

      // 4. With the team full: the replace screen offers that form and replacing brings it in.
      const full = defeat(species);
      for (const id of ROSTER) {
        if (full.team.length >= gameConfig.team.maxMembers) break;
        const line = baseOf(gameConfig, id);
        if (line.level === 1 && line.base !== base && !full.team.some((m) => m.species === id)) {
          addMember(full, gameConfig, id, 1);
        }
      }
      expect(full.team).toHaveLength(gameConfig.team.maxMembers);
      full.events.length = 0;
      joinTeam(full, gameConfig, base, pickup?.level ?? 1, 240, false);
      expect(full.events.find((e) => e.type === 'replaceOpen')).toMatchObject({ form: species });
      resolveReplace(full, gameConfig, { type: 'replace', slot: 5 });
      const swapped = full.team[5];
      expect(swapped?.species).toBe(base);
      if (swapped === undefined) return;
      expect(formOfMember(gameConfig, swapped)).toBe(species);
      expect(swapped.level).toBe(firstLevelOf(stage));
    },
  );
});
