import { describe, expect, it } from 'vitest';
import {
  applyCard,
  applyHybrid,
  type Ball,
  type Command,
  cloneRun,
  createRun,
  drawOffers,
  evolveTeam,
  fuse,
  hashRun,
  previewHybrid,
  type Run,
  tick,
} from '../../src/domain';
import { deepFreeze, makeBall, makeEnemy, quietConfig } from './fixtures';

const still: Command = { moveX: 0 };

function runWith(balls: Ball[]): Run {
  const run = createRun(quietConfig, 1, 'charmander');
  run.loadout = balls;
  run.cooldowns = balls.map(() => 0);
  run.nextBallId = 100;
  return run;
}

const fire = (id: number, level = 1) => makeBall({ id, level });
const water = (id: number, level = 1) =>
  makeBall({
    id,
    species: 'squirtle',
    type: 'water',
    level,
    effects: [{ kind: 'pierce', strength: 1 }],
  });

describe('automatic evolution (ADR-024)', () => {
  it('two equal balls become one of the next level at the start of the next tick, with no pause', () => {
    const run = runWith([fire(1), fire(2), water(3)]);
    run.enemies = [makeEnemy({ id: 1, y: 100, speed: 1 })];
    const out = tick(run, still, quietConfig);
    expect(run.phase).toBe('playing');
    expect(run.tickCount).toBe(1);
    expect(run.enemies[0]?.y).toBe(101);
    expect(run.loadout.map((b) => [b.id, b.level])).toEqual([
      [1, 2],
      [3, 1],
    ]);
    expect(out.events).toContainEqual({
      type: 'evolve',
      ballId: 1,
      species: 'charmander',
      level: 2,
    });
    expect(run.cooldowns).toHaveLength(2);
  });

  it('picks the pair with the lowest first slot, then the lowest second slot', () => {
    const run = runWith([water(1), fire(2), fire(3), fire(4)]);
    tick(run, still, quietConfig);
    expect(run.loadout.map((b) => [b.id, b.level])).toEqual([
      [1, 1],
      [2, 2],
      [4, 1],
    ]);
  });

  it('evolves one pair per tick: a chain of four resolves over three ticks', () => {
    const run = runWith([fire(1), fire(2), fire(3), fire(4)]);
    tick(run, still, quietConfig);
    expect(run.loadout.map((b) => b.level)).toEqual([2, 1, 1]);
    tick(run, still, quietConfig);
    expect(run.loadout.map((b) => b.level)).toEqual([2, 2]);
    tick(run, still, quietConfig);
    expect(run.loadout.map((b) => [b.id, b.level])).toEqual([[1, 3]]);
    tick(run, still, quietConfig);
    expect(run.loadout).toHaveLength(1);
  });

  it('does nothing with different levels, different species, the maximum level or two hybrids', () => {
    const hybrid = (id: number) => makeBall({ id, level: 2, hybrid: true });
    const cases: Ball[][] = [
      [fire(1), fire(2, 2)],
      [fire(1), water(2)],
      [fire(1, 3), fire(2, 3)],
      [fire(1, 2), water(2, 2)], // same level, other species: only a hybrid card may merge them
      [hybrid(1), hybrid(2)],
    ];
    for (const balls of cases) {
      const run = runWith(balls);
      const out = tick(run, still, quietConfig);
      expect(run.loadout).toEqual(balls);
      expect(out.events.some((e) => e.type === 'evolve')).toBe(false);
    }
  });

  it('a maximum-level ball does not stop the ones after it from evolving', () => {
    const run = runWith([fire(1, 3), fire(2), fire(3)]);
    tick(run, still, quietConfig);
    expect(run.loadout.map((b) => [b.id, b.level])).toEqual([
      [1, 3],
      [2, 2],
    ]);
  });

  it('a hybrid keeps evolving with a normal ball of its line (ADR-026) and stays a hybrid', () => {
    const hybrid = {
      ...makeBall({ id: 1, level: 2, hybrid: true }),
      secondSpecies: 'squirtle',
      secondType: 'water' as const,
      effects: [
        { kind: 'burn' as const, strength: 2 },
        { kind: 'pierce' as const, strength: 0.5 },
      ],
    };
    for (const balls of [
      [hybrid, fire(2, 2)],
      [fire(2, 2), hybrid],
    ]) {
      const run = runWith([...balls]);
      const out = tick(run, still, quietConfig);
      expect(run.loadout).toHaveLength(1);
      const result = run.loadout[0];
      expect(result).toMatchObject({
        id: 1,
        level: 3,
        hybrid: true,
        secondSpecies: 'squirtle',
        effects: hybrid.effects,
      });
      expect(out.events).toContainEqual({
        type: 'evolve',
        ballId: 1,
        species: 'charmander',
        level: 3,
      });
    }
  });

  it('two hybrids do not evolve, and a hybrid does not evolve with another species', () => {
    const hybrid = (id: number) => makeBall({ id, level: 2, hybrid: true });
    const run = runWith([hybrid(1), hybrid(2), water(3, 2)]);
    tick(run, still, quietConfig);
    expect(run.loadout).toHaveLength(3);
  });

  it('waits while the run waits for a card, then happens on the next playing tick', () => {
    const run = runWith([fire(1), fire(2)]);
    run.phase = 'levelup';
    run.offers = [{ kind: 'damage' }];
    tick(run, still, quietConfig);
    expect(run.loadout).toHaveLength(2);
    tick(run, { moveX: 0, action: { type: 'pick', index: 0 } }, quietConfig);
    expect(run.loadout).toHaveLength(2);
    tick(run, still, quietConfig);
    expect(run.loadout).toHaveLength(1);
  });

  it('a slot above the removed one shifts down, and bodies and pickups follow their slots', () => {
    const run = runWith([fire(1), water(2), fire(3), water(4)]);
    run.cooldowns = [0, 0, -1, -1];
    run.bodies = [
      { slot: 2, x: 100, y: 300, vx: 0, vy: -1, pierce: 0, skipId: 0 },
      { slot: 3, x: 200, y: 300, vx: 0, vy: -1, pierce: 0, skipId: 0 },
    ];
    run.pickups = [{ slot: 1, species: '', type: 'water', x: 60, y: 680, level: 1, ticks: 100 }];
    evolveTeam(run); // slots 0 and 2 merge
    expect(run.loadout.map((b) => b.id)).toEqual([1, 2, 4]);
    expect(run.loadout[0]?.level).toBe(2);
    // The body of the consumed slot is gone; the body of slot 3 is now slot 2.
    expect(run.bodies.map((b) => b.slot)).toEqual([2]);
    expect(run.bodies[0]?.x).toBeCloseTo(200, 0);
    expect(run.pickups.map((p) => p.slot)).toEqual([1]);
    expect(run.cooldowns).toEqual([0, 0, -1]);
  });

  it('removes the floor pickups of both merged balls and shifts the later ones', () => {
    const run = runWith([fire(1), fire(2), water(3)]);
    run.pickups = [
      { slot: 0, species: '', type: 'fire', x: 50, y: 680, level: 1, ticks: 100 },
      { slot: 1, species: '', type: 'fire', x: 100, y: 680, level: 1, ticks: 100 },
      { slot: 2, species: '', type: 'water', x: 150, y: 680, level: 1, ticks: 100 },
    ];
    evolveTeam(run);
    expect(run.pickups.map((p) => [p.slot, p.x])).toEqual([[1, 150]]);
  });

  it('the result waits the longer cooldown of the two, and never the in-flight marker', () => {
    const run = runWith([fire(1), fire(2)]);
    run.cooldowns = [-1, 9];
    run.bodies = [{ slot: 0, x: 100, y: 300, vx: 0, vy: -1, pierce: 0, skipId: 0 }];
    evolveTeam(run);
    expect(run.bodies).toHaveLength(0);
    expect(run.cooldowns).toEqual([9]);
    const both = runWith([fire(1), fire(2)]);
    both.cooldowns = [-1, -1];
    evolveTeam(both);
    expect(both.cooldowns).toEqual([0]);
  });

  it('is deterministic and clone-safe', () => {
    const a = runWith([fire(1), fire(2), fire(3), water(4)]);
    const b = cloneRun(a);
    for (const run of [a, b]) for (let i = 0; i < 30; i++) tick(run, { moveX: 1 }, quietConfig);
    expect(hashRun(a)).toBe(hashRun(b));
  });

  it('allocates no event when there is nothing to evolve', () => {
    const run = runWith([fire(1), water(2), fire(3, 2)]);
    evolveTeam(run);
    expect(run.events).toHaveLength(0);
  });
});

describe('hybrids (the F2 rule, now a card)', () => {
  it('a hybrid takes the first ingredient and half the effect of the second; order matters', () => {
    const forward = runWith([fire(1, 2), water(2, 2)]);
    applyHybrid(forward, 0, 1);
    const reverse = runWith([fire(1, 2), water(2, 2)]);
    applyHybrid(reverse, 1, 0);
    const f = forward.loadout[0];
    const r = reverse.loadout[0];
    expect(forward.loadout).toHaveLength(1);
    expect(f?.type).toBe('fire');
    expect(f?.hybrid).toBe(true);
    expect(f?.effects).toEqual([
      { kind: 'burn', strength: 2 },
      { kind: 'pierce', strength: 0.5 },
    ]);
    expect(r?.type).toBe('water');
    expect(r?.id).toBe(2);
  });

  it('says what happened in a `hybrid` event', () => {
    const run = runWith([fire(1, 2), water(2, 3)]);
    applyHybrid(run, 0, 1);
    expect(run.events).toContainEqual({
      type: 'hybrid',
      ballId: 1,
      species: 'charmander',
      withSpecies: 'squirtle',
      level: 2,
    });
  });

  it('the kept ball may come after the removed one, and bodies follow their slots', () => {
    const run = runWith([fire(1, 2), fire(2, 2), water(3, 2)]);
    run.cooldowns = [0, -1, 5];
    run.bodies = [{ slot: 1, x: 50, y: 300, vx: 0, vy: -1, pierce: 0, skipId: 0 }];
    applyHybrid(run, 2, 1); // a = slot 2 (kept), b = slot 1 (removed): needs different types
    expect(run.loadout.map((b) => b.id)).toEqual([1, 3]);
    expect(run.bodies).toHaveLength(0);
    expect(run.cooldowns).toEqual([0, 5]);
  });

  it('is refused, changing nothing, when the rules of fuse refuse it', () => {
    const hybrid = makeBall({ id: 3, level: 2, hybrid: true });
    const cases: Array<[Ball[], number, number]> = [
      [[fire(1), water(2)], 0, 1], // level too low
      [[fire(1, 2), fire(2, 2)], 0, 1], // same species: that is an evolution
      [[fire(1, 2), fire(2, 2)], 0, 0],
      [[fire(1, 2), water(2, 2)], 0, 5], // bad slot
      [[fire(1, 2), hybrid], 0, 1], // a hybrid is never fused again
      [
        [fire(1, 2), makeBall({ id: 2, species: 'vulpix', level: 2 })], // same type, other species
        0,
        1,
      ],
    ];
    for (const [balls, a, b] of cases) {
      const run = runWith(balls);
      applyHybrid(run, a, b);
      expect(run.loadout).toEqual(balls);
      expect(run.events).toHaveLength(0);
      expect(previewHybrid(run, a, b)).toBeNull();
    }
  });

  it('previewHybrid changes nothing and matches what the card does', () => {
    const run = runWith([fire(1, 2), water(2, 2)]);
    deepFreeze(run.loadout);
    const before = hashRun(run);
    const preview = previewHybrid(run, 0, 1);
    expect(hashRun(run)).toBe(before);
    const direct = fuse(fire(1, 2), water(2, 2));
    expect(preview).toEqual(direct.ok ? direct.ball : null);
    const live = runWith([fire(1, 2), water(2, 2)]);
    applyHybrid(live, 0, 1);
    expect(live.loadout[0]).toEqual(preview);
  });
});

describe('the hybrid card', () => {
  const hybridOnly = {
    ...quietConfig,
    cards: { ...quietConfig.cards, weights: { newBall: 0, upgrade: 0, hybrid: 1 } },
  };

  it('is offered only when two balls of level 2 or more with different types exist', () => {
    const none = runWith([fire(1, 2), fire(2, 2), water(3, 1)]);
    expect(drawOffers(none, hybridOnly).some((c) => c.kind === 'hybrid')).toBe(false);
    const some = runWith([fire(1, 2), water(2, 2)]);
    expect(drawOffers(some, hybridOnly)).toEqual([expect.objectContaining({ kind: 'hybrid' })]);
  });

  it('names its two ingredients by slot, and the order is drawn from the cards stream', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const run = runWith([fire(1, 2), water(2, 2)]);
      run.rng.cards = createRun(quietConfig, seed, 'charmander').rng.cards;
      const card = drawOffers(run, hybridOnly)[0];
      if (card?.kind === 'hybrid') seen.add(`${card.a}>${card.b}`);
    }
    expect([...seen].sort()).toEqual(['0>1', '1>0']);
  });

  it('offers at most one hybrid, whatever the number of pairs', () => {
    const run = runWith([
      fire(1, 2),
      water(2, 2),
      makeBall({ id: 3, species: 'bulbasaur', type: 'grass', level: 2 }),
    ]);
    const config = {
      ...hybridOnly,
      cards: { ...hybridOnly.cards, weights: { newBall: 0, upgrade: 1, hybrid: 5 } },
    };
    for (let i = 0; i < 20; i++) {
      expect(drawOffers(run, config).filter((c) => c.kind === 'hybrid').length).toBeLessThanOrEqual(
        1,
      );
    }
  });

  it('applying it merges the two balls', () => {
    const run = runWith([fire(1, 2), water(2, 2)]);
    applyCard(run, quietConfig, { kind: 'hybrid', a: 0, b: 1 });
    expect(run.loadout).toHaveLength(1);
    expect(run.loadout[0]?.hybrid).toBe(true);
  });

  it('picking it in the level-up phase applies it and goes back to playing', () => {
    const run = runWith([fire(1, 2), water(2, 2)]);
    run.phase = 'levelup';
    run.offers = [{ kind: 'hybrid', a: 0, b: 1 }];
    const out = tick(run, { moveX: 0, action: { type: 'pick', index: 0 } }, quietConfig);
    expect(run.phase).toBe('playing');
    expect(run.loadout).toHaveLength(1);
    expect(out.events.map((e) => e.type)).toEqual(['hybrid', 'pick']);
  });

  it('hashRun tells two hybrid offers with different slots apart', () => {
    const a = runWith([fire(1, 2), water(2, 2)]);
    const b = cloneRun(a);
    a.offers = [{ kind: 'hybrid', a: 0, b: 1 }];
    b.offers = [{ kind: 'hybrid', a: 1, b: 0 }];
    expect(hashRun(a)).not.toBe(hashRun(b));
  });
});

describe('hybrid card odds and hashing', () => {
  const withWeights = (weights: { newBall: number; upgrade: number; hybrid: number }) => ({
    ...quietConfig,
    cards: { ...quietConfig.cards, weights },
  });

  it('a hybrid weight of zero never offers one, even when a pair exists', () => {
    const run = runWith([fire(1, 2), water(2, 2)]);
    const config = withWeights({ newBall: 0, upgrade: 1, hybrid: 0 });
    for (let i = 0; i < 50; i++) {
      expect(drawOffers(run, config).some((c) => c.kind === 'hybrid')).toBe(false);
    }
  });

  it('a positive hybrid weight does get the hybrid offered next to upgrades', () => {
    const config = withWeights({ newBall: 0, upgrade: 1, hybrid: 1 });
    let offered = 0;
    for (let seed = 1; seed < 40; seed++) {
      const run = runWith([fire(1, 2), water(2, 2)]);
      run.rng.cards = createRun(quietConfig, seed, 'charmander').rng.cards;
      if (drawOffers(run, config).some((c) => c.kind === 'hybrid')) offered += 1;
    }
    expect(offered).toBeGreaterThan(20);
  });

  it('with no pair the hybrid weight is ignored: the offers are the same as with weight zero', () => {
    const a = runWith([fire(1), water(2)]);
    const b = cloneRun(a);
    expect(drawOffers(a, withWeights({ newBall: 1, upgrade: 1, hybrid: 50 }))).toEqual(
      drawOffers(b, withWeights({ newBall: 1, upgrade: 1, hybrid: 0 })),
    );
  });

  it('every pair can be offered, not only the first', () => {
    const grass = makeBall({ id: 3, species: 'bulbasaur', type: 'grass', level: 2 });
    const seen = new Set<string>();
    for (let seed = 1; seed < 80; seed++) {
      const run = runWith([fire(1, 2), water(2, 2), grass]);
      run.rng.cards = createRun(quietConfig, seed, 'charmander').rng.cards;
      const card = drawOffers(run, withWeights({ newBall: 0, upgrade: 0, hybrid: 1 }))[0];
      if (card?.kind === 'hybrid') seen.add([card.a, card.b].sort().join(','));
    }
    expect([...seen].sort()).toEqual(['0,1', '0,2', '1,2']);
  });

  it('hashRun tells apart offers that differ only in one of the two slots', () => {
    const a = runWith([fire(1, 2), water(2, 2)]);
    const first = cloneRun(a);
    const second = cloneRun(a);
    first.offers = [{ kind: 'hybrid', a: 0, b: 2 }];
    second.offers = [{ kind: 'hybrid', a: 1, b: 2 }];
    expect(hashRun(first)).not.toBe(hashRun(second));
    const third = cloneRun(a);
    third.offers = [{ kind: 'hybrid', a: 0, b: 3 }];
    expect(hashRun(first)).not.toBe(hashRun(third));
  });
});
