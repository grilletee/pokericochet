import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  createRun,
  deriveRng,
  formAt,
  formOfMember,
  joinTeam,
  nextInt,
  type Run,
  resolveReplace,
  stageForLevel,
  trainMember,
} from '../../src/domain';

const cfg = gameConfig;

function stageEvents(run: Run) {
  return run.events.filter((e) => e.type === 'stage');
}

describe('a Pokémon never skips a form (12th playtest, Bagon -> Salamence)', () => {
  it('the case: a Bagon from a minion and a Salamence from the boss in a row goes through Shelgon', () => {
    const run = createRun(cfg, 1, 'charmander');
    // A Bagon (stage 1) joins first, then the Salamence the boss dropped (stage 3, worth level 6).
    joinTeam(run, cfg, 'bagon', 1, 240, false);
    expect(run.team.find((m) => m.species === 'bagon')?.level).toBe(1);
    run.events.length = 0;
    joinTeam(run, cfg, 'bagon', 3, 240, false);
    const steps = stageEvents(run);
    // Before the fix: ONE event bagon -> salamence. Now: bagon -> shelgon, shelgon -> salamence.
    expect(steps.map((e) => (e.type === 'stage' ? [e.stage, e.from, e.to] : []))).toEqual([
      [2, 'bagon', 'shelgon'],
      [3, 'shelgon', 'salamence'],
    ]);
  });

  it('a card that gives one level only ever gives one stage event', () => {
    const run = createRun(cfg, 1, 'charmander');
    for (let i = 0; i < 6; i++) {
      run.events.length = 0;
      trainMember(run, cfg, 0, 'card');
      expect(stageEvents(run).length).toBeLessThanOrEqual(1);
    }
  });
});

describe('property: form always follows level, and stage events chain without gaps', () => {
  const bases = Object.keys(gameConfig.lines ?? {}).filter(
    (id) => gameConfig.species[id] !== undefined,
  );

  it('over random captures, duplicates, level cards and replacements on every line of the roster', () => {
    expect(bases.length).toBeGreaterThan(100);
    const rng = deriveRng(20261107, 'property');
    let checkedSteps = 0;
    /** 4W: the branch each Pokémon took, to check it never changes. */
    const branchOf = new WeakMap<object, string>();
    for (let game = 0; game < 120; game++) {
      const run = createRun(cfg, game + 1, 'charmander');
      for (let step = 0; step < 40; step++) {
        const base = bases[nextInt(rng, bases.length)] ?? 'bagon';
        const stage = 1 + nextInt(rng, 3);
        run.events.length = 0;
        const action = nextInt(rng, 4);
        if (run.phase === 'replace') {
          resolveReplace(
            run,
            cfg,
            nextInt(rng, 3) === 0
              ? { type: 'release' }
              : { type: 'replace', slot: nextInt(rng, run.team.length) },
          );
        } else if (action === 0 && run.team.length > 0) {
          trainMember(run, cfg, nextInt(rng, run.team.length), 'card');
        } else {
          joinTeam(run, cfg, base, stage, 240, nextInt(rng, 5) === 0);
        }
        // The events of the step: per member, stages go up one by one, from -> to follow the line.
        const lastStage = new Map<number, number>();
        for (const e of run.events) {
          if (e.type !== 'stage') continue;
          const previous = lastStage.get(e.member);
          if (previous !== undefined) expect(e.stage).toBe(previous + 1);
          lastStage.set(e.member, e.stage);
          const member = run.team[e.member];
          expect(member).toBeDefined();
          // 4W, block 7: a split line follows the branch its Pokémon took.
          expect(e.from).toBe(formAt(cfg, e.species, e.stage - 1, member?.branch));
          expect(e.to).toBe(formAt(cfg, e.species, e.stage, member?.branch));
          checkedSteps += 1;
        }
        for (const [i, m] of run.team.entries()) {
          const stageNow = stageForLevel(cfg, m.level, m.species);
          expect(formOfMember(cfg, m), `${m.species} Nv${m.level}`).toBe(
            formAt(cfg, m.species, stageNow, m.branch),
          );
          // The form is never below the one its level earns, and never above it.
          if (stageNow >= 2) {
            expect(formOfMember(cfg, m)).toBe(formAt(cfg, m.species, stageNow, m.branch));
          }
          // A branch is taken once, at the split, and kept: never before the stage of the split.
          const split = cfg.branches?.[m.species];
          if (split !== undefined && stageNow >= split.at) expect(m.branch).toBeDefined();
          if (m.branch !== undefined) {
            const seen = branchOf.get(m);
            if (seen !== undefined) expect(m.branch, `${m.species} kept its branch`).toBe(seen);
            branchOf.set(m, m.branch);
          }
          expect(i).toBeLessThan(cfg.team.maxMembers);
        }
      }
    }
    expect(checkedSteps).toBeGreaterThan(50);
    // 30 s (4V): with the 425 lines of 4G-J it takes ~3 s alone and ~6 s beside the other test
    // files, over the default 5 s; it failed now and then for that reason only.
  }, 30_000);
});
