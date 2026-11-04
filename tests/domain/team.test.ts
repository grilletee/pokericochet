import { describe, expect, it } from 'vitest';
import {
  abilitiesFor,
  addMember,
  advancePickups,
  ballRadius,
  ballsFor,
  cadenceMult,
  captureLevel,
  cloneRun,
  createRun,
  damageEnemy,
  dropCapture,
  hashRun,
  joinTeam,
  type Member,
  memberIndexOf,
  powerMult,
  type Run,
  resolveReplace,
  stageOf,
  syncMember,
  teamIsFull,
  tick,
  trainMember,
} from '../../src/domain';
import { makeEnemy, quietConfig, withConfig } from './fixtures';

const t = quietConfig.team;
const floorY = quietConfig.player.y;

/** A run whose team is the starter plus these species, at level 1. */
function teamRun(cfg = quietConfig, ...species: string[]): Run {
  const run = createRun(cfg, 1, 'charmander');
  for (const id of species) addMember(run, cfg, id, 1);
  return run;
}

const member = (run: Run, i: number): Member => run.team[i] as Member;

describe('the rules of the team (ADR-030, ADR-031)', () => {
  it('stageOf: one more stage for each threshold reached', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((l) => stageOf(quietConfig, l))).toEqual([
      1, 1, 2, 2, 2, 3, 3, 3,
    ]);
    const late = withConfig({ team: { ...t, stageLevels: [5] } });
    expect([4, 5, 8].map((l) => stageOf(late, l))).toEqual([1, 2, 2]); // a two-stage line
  });

  it('ballsFor reads the table by level and repeats the last value', () => {
    expect([1, 2, 3, 5, 6, 8].map((l) => ballsFor(quietConfig, l))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(ballsFor(quietConfig, 20)).toBe(3);
    expect(ballsFor(withConfig({ team: { ...t, ballsByLevel: [] } }), 3)).toBe(1);
  });

  it('captureLevel is the level a captured enemy joins with, by its stage', () => {
    expect([1, 2, 3].map((s) => captureLevel(quietConfig, s))).toEqual(t.captureLevels);
    expect(captureLevel(quietConfig, 9)).toBe(1);
  });

  it('ballRadius grows with the stage and falls back to the base radius', () => {
    const ball = (stage: number) => ({
      ...createRun(quietConfig, 1, 'charmander').loadout[0],
      stage,
    });
    expect([1, 2, 3].map((s) => ballRadius(quietConfig, ball(s) as never))).toEqual(
      t.ballRadiusByStage,
    );
    expect(ballRadius(quietConfig, ball(9) as never)).toBe(quietConfig.ball.radius);
  });

  it('powerMult: power cards add up and the starter has its bonus; a missing Pokémon has none', () => {
    const run = teamRun(quietConfig, 'squirtle');
    const cfg = withConfig({ team: { ...t, starterBonus: 0.5 } });
    const starter = member(run, 0);
    expect(starter.starter).toBe(true);
    expect(powerMult(cfg, starter)).toBeCloseTo(1.5, 12);
    starter.damageUps = 2;
    expect(powerMult(cfg, starter)).toBeCloseTo((1 + 2 * quietConfig.cards.powerStep) * 1.5, 12);
    expect(powerMult(cfg, member(run, 1))).toBe(1); // not the starter
    expect(powerMult(cfg, undefined)).toBe(1);
  });

  it('cadenceMult compounds per card and stops at the floor', () => {
    const run = teamRun();
    const m = member(run, 0);
    expect(cadenceMult(quietConfig, m)).toBe(1);
    m.cadenceUps = 2;
    expect(cadenceMult(quietConfig, m)).toBeCloseTo(quietConfig.cards.cadenceFactor ** 2, 12);
    m.cadenceUps = 99;
    expect(cadenceMult(quietConfig, m)).toBe(quietConfig.cards.cadenceFloor);
    expect(cadenceMult(quietConfig, undefined)).toBe(1);
  });
});

describe('the run starts with its starter', () => {
  it('has one Pokémon, flagged as the starter, with one ready ball that belongs to it', () => {
    const run = createRun(quietConfig, 5, 'bulbasaur');
    expect(run.team).toEqual([
      { species: 'bulbasaur', type: 'grass', level: 1, starter: true, damageUps: 0, cadenceUps: 0 },
    ]);
    expect(run.loadout).toHaveLength(1);
    expect(run.loadout[0]).toMatchObject({
      id: 1,
      owner: 0,
      stage: 1,
      level: 1,
      species: 'bulbasaur',
    });
    expect(run.cooldowns).toEqual([0]);
    expect(run.nextBallId).toBe(2);
    expect(run.pendingCapture).toBeNull();
  });

  it('a team of up to six: teamIsFull and memberIndexOf', () => {
    const run = teamRun(quietConfig, 'squirtle', 'bulbasaur', 'pikachu', 'vulpix');
    expect(teamIsFull(run, quietConfig)).toBe(false);
    addMember(run, quietConfig, 'psyduck', 1);
    expect(teamIsFull(run, quietConfig)).toBe(true);
    expect(memberIndexOf(run, 'pikachu')).toBe(3);
    expect(memberIndexOf(run, 'gyarados')).toBe(-1);
  });
});

describe('levels give balls, stages and effects (syncMember, trainMember)', () => {
  it('a Pokémon fires as many balls as its level allows, each ready and with its own id', () => {
    const run = teamRun();
    run.cooldowns = [-1];
    for (let level = 2; level <= 8; level++) trainMember(run, quietConfig, 0, 'card');
    expect(run.loadout.filter((b) => b.owner === 0)).toHaveLength(ballsFor(quietConfig, 8));
    expect(new Set(run.loadout.map((b) => b.id)).size).toBe(run.loadout.length);
    expect(run.cooldowns).toHaveLength(run.loadout.length);
    // The balls added by the levels are ready; the one that was in flight keeps its marker.
    expect(run.cooldowns[0]).toBe(-1);
    expect(run.cooldowns.slice(1).every((c) => c === 0)).toBe(true);
  });

  it('keeps the id and the place of the balls that exist, and updates their stage and effects', () => {
    const run = teamRun();
    const before = run.loadout[0];
    trainMember(run, quietConfig, 0, 'card');
    trainMember(run, quietConfig, 0, 'card'); // level 3: the second stage and a second ball
    expect(run.loadout[0]?.id).toBe(before?.id);
    expect(run.loadout.map((b) => [b.level, b.stage])).toEqual([
      [3, 2],
      [3, 2],
    ]);
    expect(run.loadout[0]?.effects).toEqual(abilitiesFor(quietConfig, 'charmander', 'fire', 2));
  });

  it('every level reaches the balls that exist, also when the stage does not change', () => {
    const run = teamRun();
    trainMember(run, quietConfig, 0, 'card'); // level 2: still stage 1, still one ball
    expect(run.loadout).toHaveLength(1);
    expect(run.loadout[0]).toMatchObject({ level: 2, stage: 1 });
    for (let i = 0; i < 3; i++) trainMember(run, quietConfig, 0, 'card'); // level 5: stage 2
    expect(run.loadout.map((b) => [b.level, b.stage])).toEqual([
      [5, 2],
      [5, 2],
    ]);
  });

  it('reports each level, and an evolution only when a stage is crossed', () => {
    const run = teamRun();
    const types: string[] = [];
    for (let i = 0; i < 6; i++) {
      run.events.length = 0;
      trainMember(run, quietConfig, 0, 'card');
      types.push(run.events.map((e) => e.type).join('+'));
    }
    // levels 2, 3 (stage 2), 4, 5, 6 (stage 3), 7
    expect(types).toEqual(['train', 'train+evolve', 'train', 'train', 'train+evolve', 'train']);
    run.events.length = 0;
    trainMember(run, quietConfig, 0, 'card');
    expect(run.events).toEqual([
      { type: 'train', member: 0, species: 'charmander', level: 8, source: 'card' },
    ]);
    expect(trainMember(run, quietConfig, 0, 'card')).toBe(false); // the maximum
    expect(run.events).toHaveLength(1);
  });

  it('the evolve event carries the stage reached and a ball of that Pokémon', () => {
    const run = teamRun();
    trainMember(run, quietConfig, 0, 'card');
    run.events.length = 0;
    trainMember(run, quietConfig, 0, 'card');
    expect(run.events).toContainEqual({
      type: 'evolve',
      ballId: run.loadout[0]?.id,
      species: 'charmander',
      level: 2,
    });
  });

  it('trainMember does nothing for a Pokémon that is not there', () => {
    const run = teamRun();
    expect(trainMember(run, quietConfig, 4, 'card')).toBe(false);
    expect(run.events).toEqual([]);
  });

  it('syncMember ignores a place that is not in the team', () => {
    const run = teamRun();
    const hash = hashRun(run);
    syncMember(run, quietConfig, 7);
    expect(hashRun(run)).toBe(hash);
  });
});

describe('a capture reaches the team (joinTeam)', () => {
  it('a new species takes a free place at the level its form gives, and says what it shows', () => {
    const run = teamRun();
    joinTeam(run, quietConfig, 'psyduck', 2, 240, false);
    const added = member(run, 1);
    expect(added).toMatchObject({
      species: 'psyduck',
      level: captureLevel(quietConfig, 2),
      starter: false,
    });
    expect(run.captured).toEqual([{ species: 'psyduck', level: 2 }]);
    expect(run.events).toContainEqual({
      type: 'capture',
      ballId: run.loadout.find((b) => b.owner === 1)?.id,
      species: 'psyduck',
      level: stageOf(quietConfig, captureLevel(quietConfig, 2)),
      x: 240,
      late: false,
    });
  });

  it('the capture of a stage 3 enemy shows the form of the level it joins with, not its own', () => {
    const run = teamRun();
    joinTeam(run, quietConfig, 'psyduck', 3, 240, false);
    const level = captureLevel(quietConfig, 3);
    expect(stageOf(quietConfig, level)).toBeLessThan(3); // the real rules: it arrives trained, not finished
    expect(run.events).toContainEqual(
      expect.objectContaining({ type: 'capture', level: stageOf(quietConfig, level) }),
    );
  });

  it('one that waited too long joins with the extra reload on all its balls', () => {
    const run = teamRun();
    joinTeam(run, quietConfig, 'psyduck', 3, 100, true);
    const mine = run.loadout.flatMap((b, slot) => (b.owner === 1 ? [slot] : []));
    expect(mine.length).toBe(ballsFor(quietConfig, captureLevel(quietConfig, 3)));
    for (const slot of mine)
      expect(run.cooldowns[slot]).toBe(quietConfig.pickup.returnPenaltyTicks);
    expect(run.cooldowns[0]).toBe(0); // the others are untouched
  });

  it('a species the team has gains a level instead, even with a full team', () => {
    const run = teamRun(quietConfig, 'squirtle', 'bulbasaur', 'pikachu', 'vulpix', 'psyduck');
    joinTeam(run, quietConfig, 'vulpix', 1, 10, false);
    expect(run.team).toHaveLength(6);
    expect(member(run, 4).level).toBe(2);
    expect(run.phase).toBe('playing');
    expect(run.captured).toEqual([{ species: 'vulpix', level: 1 }]);
    expect(run.events).toContainEqual(
      expect.objectContaining({ type: 'train', species: 'vulpix', source: 'capture' }),
    );
  });

  it('with the team full it opens the replace screen, or lets go of what waited too long', () => {
    const run = teamRun(quietConfig, 'squirtle', 'bulbasaur', 'pikachu', 'vulpix', 'psyduck');
    joinTeam(run, quietConfig, 'gyarados', 2, 10, true);
    expect(run.phase).toBe('playing');
    expect(run.events).toEqual([{ type: 'release', species: 'gyarados' }]);
    run.events.length = 0;
    joinTeam(run, quietConfig, 'gyarados', 2, 10, false);
    expect(run.phase).toBe('replace');
    expect(run.pendingCapture).toEqual({ species: 'gyarados', stage: 2 });
    expect(run.events).toEqual([{ type: 'replaceOpen', species: 'gyarados', stage: 2 }]);
    expect(run.team).toHaveLength(6);
    expect(run.captured).toEqual([]); // nothing was caught yet: it waits for the answer
  });
});

describe('the replace screen (ADR-030)', () => {
  /** A full team whose Pokémon 2 (pikachu) has two balls in flight and one waiting on the floor. */
  function full(): Run {
    const run = teamRun(quietConfig, 'squirtle', 'pikachu', 'bulbasaur', 'vulpix', 'psyduck');
    const m = member(run, 2);
    m.level = 3; // two balls
    m.damageUps = 2;
    syncMember(run, quietConfig, 2);
    run.cooldowns = run.loadout.map(() => -1);
    run.bodies = run.loadout.map((_, slot) => ({
      slot,
      x: 10 + slot,
      y: 300,
      vx: 0,
      vy: -1,
      pierce: 0,
      skipId: 0,
    }));
    run.pickups = [{ slot: 5, species: '', type: 'water', x: 60, y: floorY, level: 1, ticks: 100 }];
    joinTeam(run, quietConfig, 'gyarados', 3, 0, false);
    run.events.length = 0;
    return run;
  }

  it('swaps the Pokémon at the chosen place: its balls, level and cards go, the newcomer starts fresh', () => {
    const run = full();
    const ownedBefore = run.loadout.filter((b) => b.owner === 2).length;
    expect(ownedBefore).toBe(2);
    resolveReplace(run, quietConfig, { type: 'replace', slot: 2 });
    expect(run.phase).toBe('playing');
    expect(run.pendingCapture).toBeNull();
    expect(member(run, 2)).toEqual({
      species: 'gyarados',
      type: 'water',
      level: captureLevel(quietConfig, 3),
      starter: false,
      damageUps: 0,
      cadenceUps: 0,
    });
    expect(run.team).toHaveLength(6);
    expect(run.loadout.filter((b) => b.owner === 2).every((b) => b.species === 'gyarados')).toBe(
      true,
    );
    expect(run.events).toEqual([
      { type: 'replaced', slot: 2, out: 'pikachu', species: 'gyarados' },
    ]);
    expect(run.captured).toEqual([{ species: 'gyarados', level: 3 }]);
  });

  it('the balls of the Pokémon that left disappear wherever they were, and the others keep their places', () => {
    const run = full();
    const gone = run.loadout.flatMap((b, slot) => (b.owner === 2 ? [slot] : []));
    const survivors = run.loadout.filter((b) => b.owner !== 2).map((b) => b.id);
    run.pickups.push({
      slot: gone[0] ?? 0,
      species: '',
      type: 'electric',
      x: 80,
      y: floorY,
      level: 1,
      ticks: 9,
    });
    resolveReplace(run, quietConfig, { type: 'replace', slot: 2 });
    // The new Pokémon's balls are appended; everyone else is still there, in order.
    const kept = run.loadout.filter((b) => survivors.includes(b.id)).map((b) => b.id);
    expect(kept).toEqual(survivors);
    expect(run.bodies.every((b) => run.loadout[b.slot] !== undefined)).toBe(true);
    expect(run.bodies).toHaveLength(survivors.length); // the new balls have not been launched
    // No pickup refers to a ball that is gone, and the one of another Pokémon follows its slot.
    for (const p of run.pickups) {
      if (p.slot >= 0) expect(run.loadout[p.slot]).toBeDefined();
    }
    expect(run.pickups).toHaveLength(1);
    expect(run.loadout[run.pickups[0]?.slot ?? -1]?.species).toBe('psyduck');
    expect(run.cooldowns).toHaveLength(run.loadout.length);
  });

  it('a ball of the Pokémon that leaves waiting on the floor in slot 0 is gone too', () => {
    const run = full();
    run.pickups = [{ slot: 0, species: '', type: 'fire', x: 80, y: floorY, level: 1, ticks: 9 }];
    resolveReplace(run, quietConfig, { type: 'replace', slot: 0 });
    expect(run.pickups).toEqual([]);
  });

  it('replacing the starter takes its bonus away', () => {
    const run = full();
    resolveReplace(run, quietConfig, { type: 'replace', slot: 0 });
    expect(run.team.some((m) => m.starter)).toBe(false);
  });

  it('releasing keeps the team as it is and counts nothing as caught', () => {
    const run = full();
    const team = JSON.stringify(run.team);
    resolveReplace(run, quietConfig, { type: 'release' });
    expect(run.phase).toBe('playing');
    expect(run.pendingCapture).toBeNull();
    expect(JSON.stringify(run.team)).toBe(team);
    expect(run.events).toEqual([{ type: 'release', species: 'gyarados' }]);
    expect(run.captured).toEqual([]);
  });

  it('a place that does not exist, or no capture waiting, changes nothing and keeps waiting', () => {
    const run = full();
    const hash = hashRun(run);
    resolveReplace(run, quietConfig, { type: 'replace', slot: 9 });
    expect(hashRun(run)).toBe(hash);
    expect(run.phase).toBe('replace');
    const idle = teamRun();
    const idleHash = hashRun(idle);
    resolveReplace(idle, quietConfig, { type: 'release' });
    expect(hashRun(idle)).toBe(idleHash);
  });

  it('the run is frozen while it waits: only a valid answer does anything', () => {
    const run = full();
    run.enemies = [makeEnemy({ id: 1, y: 100, speed: 1 })];
    const frozen = hashRun(run);
    for (const cmd of [
      { moveX: 1 as const },
      { moveX: 0 as const, action: { type: 'pick' as const, index: 0 } },
      { moveX: 0 as const, action: { type: 'replace' as const, slot: 12 } },
    ]) {
      tick(run, cmd, quietConfig);
      expect(hashRun(run)).toBe(frozen);
    }
    tick(run, { moveX: 0, action: { type: 'release' } }, quietConfig);
    expect(run.phase).toBe('playing');
    expect(run.tickCount).toBe(0); // answering takes no time
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.tickCount).toBe(1);
  });

  it('a level-up that is due waits for the answer and comes right after it', () => {
    const run = full();
    run.pendingCapture = null;
    run.phase = 'playing';
    run.player.xp = run.player.xpNext;
    run.pickups = [];
    dropCapture(run, quietConfig, 'gyarados', 'water', run.player.x, floorY, 3);
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.phase).toBe('replace'); // the capture goes first
    tick(run, { moveX: 0, action: { type: 'release' } }, quietConfig);
    expect(run.phase).toBe('playing');
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.phase).toBe('levelup'); // and the level-up is not lost
  });

  it('clone and hash cover the team and the capture that waits', () => {
    const run = full();
    const copy = cloneRun(run);
    expect(hashRun(copy)).toBe(hashRun(run));
    (copy.team[1] as Member).level += 1;
    expect(hashRun(copy)).not.toBe(hashRun(run));
    expect(member(run, 1).level).toBe(1); // the original did not change
    const other = cloneRun(run);
    (other.pendingCapture as NonNullable<Run['pendingCapture']>).stage = 1;
    expect(hashRun(other)).not.toBe(hashRun(run));
    expect(run.pendingCapture?.stage).toBe(3);
    const starter = cloneRun(run);
    (starter.team[0] as Member & { starter: boolean }).starter = false;
    expect(hashRun(starter)).not.toBe(hashRun(run));
  });
});

describe('a full team makes a new species rarer (ADR-030, M10)', () => {
  const dropsFor = (cfg: typeof quietConfig, species: string, kills = 400): number => {
    const run = teamRun(cfg, 'squirtle', 'bulbasaur', 'pikachu', 'vulpix', 'psyduck');
    let drops = 0;
    for (let i = 0; i < kills; i++) {
      const enemy = makeEnemy({ id: i + 1, species, type: 'water', hp: 1 });
      run.enemies = [enemy];
      run.pickups = [];
      run.events.length = 0;
      damageEnemy(run, cfg, enemy, 5);
      if (run.pickups.length > 0) drops += 1;
    }
    return drops;
  };
  const base = withConfig({
    capture: { ...quietConfig.capture, chance: 0.3, pityStep: 0, fullTeamChanceMult: 0.2 },
  });

  it('a species the team lacks drops about fullTeamChanceMult times as often', () => {
    const fresh = dropsFor(base, 'gyarados');
    const normal = dropsFor(
      withConfig({ capture: { ...base.capture, fullTeamChanceMult: 1 } }),
      'gyarados',
    );
    expect(normal).toBeGreaterThan(80);
    expect(fresh).toBeLessThan(normal / 2);
    expect(fresh).toBeGreaterThan(0);
  });

  it('one the team already has keeps the normal chance, because it is a free level', () => {
    const owned = dropsFor(base, 'psyduck');
    const normal = dropsFor(
      withConfig({ capture: { ...base.capture, fullTeamChanceMult: 1 } }),
      'psyduck',
    );
    expect(owned).toBe(normal);
  });

  it('with room in the team nothing changes', () => {
    const run = createRun(base, 1, 'charmander');
    const calm = createRun(
      withConfig({ capture: { ...base.capture, fullTeamChanceMult: 1 } }),
      1,
      'charmander',
    );
    let a = 0;
    let b = 0;
    for (let i = 0; i < 300; i++) {
      for (const [r, cfg, add] of [
        [run, base, () => a++],
        [calm, withConfig({ capture: { ...base.capture, fullTeamChanceMult: 1 } }), () => b++],
      ] as const) {
        const enemy = makeEnemy({ id: i + 1, species: 'gyarados', type: 'water', hp: 1 });
        r.enemies = [enemy];
        r.pickups = [];
        damageEnemy(r, cfg, enemy, 5);
        if (r.pickups.length > 0) add();
      }
    }
    expect(a).toBe(b);
  });

  it('advancePickups is not what decides it: a capture on the floor is collected as usual', () => {
    const run = teamRun();
    dropCapture(run, base, 'gyarados', 'water', 240, floorY, 1);
    advancePickups(run, base);
    expect(run.team).toHaveLength(2);
  });
});

describe('the hash sees every field of the team model', () => {
  const base = () => {
    const run = teamRun(quietConfig, 'squirtle');
    run.pendingCapture = { species: 'gyarados', stage: 2 };
    run.enemies = [makeEnemy({ id: 1, slow: 0.2, slowTicks: 5 })];
    run.offers = [{ kind: 'train', member: 0 }];
    return run;
  };
  const changes: [string, (r: Run) => void][] = [
    [
      'pending species',
      (r) => ((r.pendingCapture as NonNullable<Run['pendingCapture']>).species = 'psyduck'),
    ],
    ['pending stage', (r) => ((r.pendingCapture as NonNullable<Run['pendingCapture']>).stage = 3)],
    [
      'ball owner',
      (r) => (r.loadout[1] = { ...(r.loadout[1] as Run['loadout'][number]), owner: 0 }),
    ],
    [
      'ball stage',
      (r) => (r.loadout[1] = { ...(r.loadout[1] as Run['loadout'][number]), stage: 3 }),
    ],
    [
      'effect radius',
      (r) =>
        (r.loadout[0] = {
          ...(r.loadout[0] as Run['loadout'][number]),
          effects: [{ kind: 'splash', strength: 1, radius: 10 }],
        }),
    ],
    [
      'effect count',
      (r) =>
        (r.loadout[0] = {
          ...(r.loadout[0] as Run['loadout'][number]),
          effects: [{ kind: 'chain', strength: 1, count: 2 }],
        }),
    ],
    ['enemy slow', (r) => ((r.enemies[0] as NonNullable<Run['enemies'][number]>).slow = 0.3)],
    [
      'enemy slow ticks',
      (r) => ((r.enemies[0] as NonNullable<Run['enemies'][number]>).slowTicks = 9),
    ],
    ['card member', (r) => (r.offers = [{ kind: 'train', member: 1 }])],
    ['card kind with the same member', (r) => (r.offers = [{ kind: 'power', member: 0 }])],
  ];
  for (const [name, change] of changes) {
    it(`tells apart a change in: ${name}`, () => {
      const a = base();
      const b = base();
      expect(hashRun(a)).toBe(hashRun(b));
      change(b);
      expect(hashRun(b)).not.toBe(hashRun(a));
    });
  }

  it('effects that differ only in radius, or only in count, hash differently from one another', () => {
    const a = base();
    const b = base();
    a.loadout[0] = {
      ...(a.loadout[0] as Run['loadout'][number]),
      effects: [{ kind: 'splash', strength: 1, radius: 10 }],
    };
    b.loadout[0] = {
      ...(b.loadout[0] as Run['loadout'][number]),
      effects: [{ kind: 'splash', strength: 1, radius: 20 }],
    };
    expect(hashRun(a)).not.toBe(hashRun(b));
    a.loadout[0] = {
      ...(a.loadout[0] as Run['loadout'][number]),
      effects: [{ kind: 'chain', strength: 1, count: 2 }],
    };
    b.loadout[0] = {
      ...(b.loadout[0] as Run['loadout'][number]),
      effects: [{ kind: 'chain', strength: 1, count: 3 }],
    };
    expect(hashRun(a)).not.toBe(hashRun(b));
  });
});

describe('the size of the ball counts in the physics (ADR-031)', () => {
  it('a last-stage ball touches an enemy that a first-stage ball misses', () => {
    const reach = (stage: number): boolean => {
      const enemy = makeEnemy({ id: 1, x: 240 + 24, y: 400, hp: 1e6 });
      const run = createRun(quietConfig, 1, 'charmander');
      run.loadout = [{ ...(run.loadout[0] as Run['loadout'][number]), stage }];
      run.cooldowns = [-1];
      run.bodies = [{ slot: 0, x: 240, y: 400, vx: 0, vy: 0, pierce: 0, skipId: 0 }];
      run.enemies = [enemy];
      return tick(run, { moveX: 0 }, quietConfig).events.some((e) => e.type === 'hit');
    };
    expect(reach(1)).toBe(false); // 6 + 16 = 22 < 24
    expect(reach(3)).toBe(true); // 9 + 16 = 25 > 24
  });
});
