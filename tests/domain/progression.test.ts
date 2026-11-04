import { describe, expect, it } from 'vitest';
import {
  addMember,
  applyCard,
  type Card,
  cadenceMult,
  checkLevelUp,
  createRun,
  damageEnemy,
  deriveRng,
  drawOffers,
  enemyXp,
  hashRun,
  nextU32,
  powerMult,
  tick,
  xpCost,
} from '../../src/domain';
import { flyingRun, makeBall, makeEnemy, quietConfig, withConfig } from './fixtures';

const noLoot = withConfig({ progression: { ...quietConfig.progression, lootChance: 0 } });
const alwaysLoot = withConfig({ progression: { ...quietConfig.progression, lootChance: 1 } });
const cardKey = (c: Card) => (c.kind === 'newBall' ? `newBall:${c.species}` : c.kind);

describe('experience', () => {
  it('xpCost follows the table and repeats the last value', () => {
    const costs = quietConfig.progression.levelCosts;
    expect(xpCost(quietConfig, 1)).toBe(costs[0]);
    expect(xpCost(quietConfig, 2)).toBe(costs[1]);
    expect(xpCost(quietConfig, costs.length)).toBe(costs[costs.length - 1]);
    expect(xpCost(quietConfig, costs.length + 7)).toBe(costs[costs.length - 1]);
  });

  it('an enemy is worth hp / hpPerXp, rounded, at least 1', () => {
    expect(enemyXp(quietConfig, 39)).toBe(4);
    expect(enemyXp(quietConfig, 34)).toBe(3);
    expect(enemyXp(quietConfig, 4)).toBe(1);
    expect(enemyXp(quietConfig, 0)).toBe(1);
  });

  it('a kill grants the enemy xp; a rich kill grants lootMultiplier times that', () => {
    const plain = createRun(noLoot, 1, 'charmander');
    damageEnemy(plain, noLoot, makeEnemy({ hp: 1, xp: 5 }), 9);
    expect(plain.player.xp).toBe(5);
    const rich = createRun(alwaysLoot, 1, 'charmander');
    damageEnemy(rich, alwaysLoot, makeEnemy({ hp: 1, xp: 5 }), 9);
    expect(rich.player.xp).toBe(5 * quietConfig.progression.lootMultiplier);
  });

  it('rich kills happen at the configured rate and are reproducible per seed', () => {
    const count = (seed: number) => {
      const run = createRun(quietConfig, seed, 'charmander');
      let rich = 0;
      for (let i = 0; i < 2000; i++) {
        const before = run.player.xp;
        damageEnemy(run, quietConfig, makeEnemy({ id: i + 1, hp: 1, xp: 1 }), 9);
        if (run.player.xp - before > 1) rich += 1;
      }
      return rich;
    };
    const n = count(8);
    expect(n / 2000).toBeGreaterThan(quietConfig.progression.lootChance - 0.03);
    expect(n / 2000).toBeLessThan(quietConfig.progression.lootChance + 0.03);
    expect(count(8)).toBe(n);
  });

  it('draws a loot number on every kill even when the chance is 0 (the stream never depends on config)', () => {
    const run = createRun(noLoot, 4, 'charmander');
    for (let i = 0; i < 7; i++) damageEnemy(run, noLoot, makeEnemy({ id: i + 1, hp: 1 }), 9);
    const expected = deriveRng(4, 'loot');
    for (let i = 0; i < 7; i++) nextU32(expected);
    expect(run.rng.loot).toEqual(expected);
  });

  it('does not grant experience for damage that does not kill', () => {
    const run = createRun(noLoot, 1, 'charmander');
    damageEnemy(run, noLoot, makeEnemy({ hp: 10, xp: 5 }), 3);
    expect(run.player.xp).toBe(0);
  });
});

describe('level up', () => {
  /** A ball hits and kills a 1 hp enemy worth 5 xp, with the player 1 xp short of a level. */
  function killingRun() {
    const run = flyingRun(makeBall(), [makeEnemy({ hp: 1, xp: 5 })], undefined, noLoot);
    run.player.xp = run.player.xpNext - 1;
    return run;
  }

  it('opens the card choice when the xp threshold is crossed', () => {
    const run = killingRun();
    const cost1 = xpCost(noLoot, 1);
    const out = tick(run, { moveX: 0 }, noLoot);
    expect(run.phase).toBe('levelup');
    expect(run.player.level).toBe(2);
    expect(run.player.xp).toBe(4); // 5 gained - 1 missing: the surplus is kept
    expect(run.player.xpNext).toBe(xpCost(noLoot, 2));
    expect(cost1).not.toBe(run.player.xpNext);
    expect(run.offers).toHaveLength(noLoot.cards.offerCount);
    expect(out.events).toContainEqual({ type: 'levelup', level: 2 });
  });

  it('does not level up below the threshold', () => {
    const run = flyingRun(makeBall(), [makeEnemy({ hp: 1, xp: 5 })], undefined, noLoot);
    run.player.xp = 0;
    tick(run, { moveX: 0 }, noLoot);
    expect(run.phase).toBe('playing');
    expect(run.offers).toEqual([]);
  });

  it('pauses the simulation until a valid pick arrives', () => {
    const run = killingRun();
    run.enemies.push(makeEnemy({ id: 2, hp: 1e9, y: 100, speed: 1 }));
    tick(run, { moveX: 0 }, noLoot);
    expect(run.phase).toBe('levelup');
    const frozen = hashRun(run);
    for (const cmd of [
      { moveX: 1 as const },
      { moveX: -1 as const },
      { moveX: 0 as const, action: { type: 'pick' as const, index: 9 } },
      { moveX: 0 as const, action: { type: 'pick' as const, index: -1 } },
    ]) {
      tick(run, cmd, noLoot);
      expect(hashRun(run)).toBe(frozen);
    }
  });

  it('a valid pick applies the card, reports it and resumes play', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.phase = 'levelup';
    run.offers = [{ kind: 'team' }, { kind: 'vitality' }];
    const out = tick(run, { moveX: 0, action: { type: 'pick', index: 1 } }, quietConfig);
    expect(run.player.maxHp).toBe(quietConfig.player.maxHp + quietConfig.cards.vitalityHp);
    expect(run.phase).toBe('playing');
    expect(run.offers).toEqual([]);
    expect(out.events).toContainEqual({ type: 'pick', card: { kind: 'vitality' } });
    expect(run.player.damageMult).toBe(1);
  });

  it('chains straight into a second level-up when there is enough xp', () => {
    const run = createRun(noLoot, 1, 'charmander');
    run.player.xp = xpCost(noLoot, 1) + xpCost(noLoot, 2) + 1;
    expect(checkLevelUp(run, noLoot)).toBe(true);
    expect(run.player.level).toBe(2);
    tick(run, { moveX: 0, action: { type: 'pick', index: 0 } }, noLoot);
    expect(run.phase).toBe('levelup');
    expect(run.player.level).toBe(3);
    expect(run.player.xp).toBe(1);
  });

  it('dying on the same tick beats levelling up', () => {
    const run = killingRun();
    run.player.hp = 1;
    run.enemies.push(makeEnemy({ id: 2, x: 30, y: noLoot.arena.defenseLineY - 0.1, speed: 1 }));
    tick(run, { moveX: 0 }, noLoot);
    expect(run.phase).toBe('lost');
  });
});

describe('card offers', () => {
  const offersFor = (seed: number, cfg = quietConfig) =>
    drawOffers(createRun(cfg, seed, 'charmander'), cfg);

  it('offers offerCount different cards, with valid species', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const offers = offersFor(seed);
      expect(offers).toHaveLength(quietConfig.cards.offerCount);
      expect(new Set(offers.map(cardKey)).size).toBe(offers.length);
      for (const c of offers) {
        if (c.kind === 'newBall') expect(quietConfig.ballSpecies).toContain(c.species);
      }
    }
  });

  it('is reproducible for a seed and varies between seeds', () => {
    expect(offersFor(5)).toEqual(offersFor(5));
    const distinct = new Set(
      Array.from({ length: 30 }, (_, s) => JSON.stringify(offersFor(s + 1))),
    );
    expect(distinct.size).toBeGreaterThan(10);
  });

  it('draws from the cards stream only', () => {
    const run = createRun(quietConfig, 12, 'charmander');
    const others = JSON.stringify([run.rng.spawn, run.rng.aim, run.rng.loot]);
    drawOffers(run, quietConfig);
    expect(JSON.stringify([run.rng.spawn, run.rng.aim, run.rng.loot])).toBe(others);
    const fresh = deriveRng(12, 'cards');
    expect(run.rng.cards).not.toEqual(fresh);
  });

  it('draws the same offers whatever happened in the fight before (cards stream is independent)', () => {
    const calm = createRun(quietConfig, 33, 'charmander');
    const busy = createRun(quietConfig, 33, 'charmander');
    for (let i = 0; i < 50; i++) damageEnemy(busy, quietConfig, makeEnemy({ id: i + 1, hp: 1 }), 5);
    for (let i = 0; i < 30; i++) nextU32(busy.rng.aim);
    for (let i = 0; i < 30; i++) nextU32(busy.rng.spawn);
    expect(drawOffers(busy, quietConfig)).toEqual(drawOffers(calm, quietConfig));
  });

  /** A team of `n` different Pokémon (the starter first), for the card tests. */
  const teamOf = (n: number) => {
    const run = createRun(quietConfig, 1, 'charmander');
    for (const id of ['squirtle', 'bulbasaur', 'pikachu', 'vulpix', 'psyduck'].slice(0, n - 1)) {
      addMember(run, quietConfig, id, 1);
    }
    return run;
  };

  it('never offers a new Pokémon when the team is full, and offers one otherwise', () => {
    const full = teamOf(quietConfig.team.maxMembers);
    expect(full.team).toHaveLength(6);
    let recruits = 0;
    for (let i = 0; i < 300; i++)
      recruits += drawOffers(full, quietConfig).filter((c) => c.kind === 'newBall').length;
    expect(recruits).toBe(0);

    const room = createRun(quietConfig, 1, 'charmander');
    let withRoom = 0;
    for (let i = 0; i < 300; i++)
      withRoom += drawOffers(room, quietConfig).filter((c) => c.kind === 'newBall').length;
    expect(withRoom).toBeGreaterThan(100);
  });

  it('does not recruit when the team is full even if there are species left to recruit', () => {
    const roomy = withConfig({ ballSpecies: [...quietConfig.ballSpecies, 'gyarados'] });
    const full = teamOf(quietConfig.team.maxMembers);
    for (let i = 0; i < 300; i++) {
      expect(drawOffers(full, roomy).some((c) => c.kind === 'newBall')).toBe(false);
    }
    const five = teamOf(quietConfig.team.maxMembers - 1);
    let recruits = 0;
    for (let i = 0; i < 300; i++) {
      recruits += drawOffers(five, roomy).filter((c) => c.kind === 'newBall').length;
    }
    expect(recruits).toBeGreaterThan(0);
  });

  it('with two Pokémon an offer may name the same one twice; from three on it may not', () => {
    const named = (run: ReturnType<typeof teamOf>): boolean => {
      for (let i = 0; i < 400; i++) {
        const members = drawOffers(run, quietConfig).flatMap((c) =>
          c.kind === 'train' || c.kind === 'power' || c.kind === 'cadence' ? [c.member] : [],
        );
        if (new Set(members).size < members.length) return true;
      }
      return false;
    };
    expect(named(teamOf(2))).toBe(true);
    expect(named(teamOf(3))).toBe(false);
  });

  it('never recruits a species the team already has: a copy is a level, not a place', () => {
    const run = teamOf(3); // charmander, squirtle, bulbasaur
    const owned = new Set(run.team.map((m) => m.species));
    for (let i = 0; i < 300; i++) {
      for (const card of drawOffers(run, quietConfig)) {
        if (card.kind === 'newBall') expect(owned.has(card.species)).toBe(false);
      }
    }
  });

  it('terminates with fewer cards when only one distinct card exists', () => {
    const only = withConfig({
      cards: {
        ...quietConfig.cards,
        weights: { newBall: 0, train: 0, power: 0, cadence: 0, vitality: 1, team: 0, hybrid: 0 },
      },
    });
    expect(offersFor(1, only)).toEqual([{ kind: 'vitality' }]);
    const none = withConfig({
      cards: {
        ...quietConfig.cards,
        weights: { newBall: 0, train: 0, power: 0, cadence: 0, vitality: 0, team: 0, hybrid: 0 },
      },
    });
    expect(offersFor(1, none)).toEqual([{ kind: 'vitality' }]); // never an empty offer
  });

  it('offers every kind of card over many draws, never a hybrid while they are off', () => {
    const kinds = new Set<string>();
    const run = teamOf(3);
    for (let i = 0; i < 400; i++) for (const c of drawOffers(run, quietConfig)) kinds.add(c.kind);
    expect(kinds).toEqual(new Set(['newBall', 'train', 'power', 'cadence', 'vitality', 'team']));
  });

  it('a card about a Pokémon names a different one each while the team has three or more', () => {
    const run = teamOf(4);
    for (let i = 0; i < 200; i++) {
      const names = drawOffers(run, quietConfig).flatMap((c) =>
        c.kind === 'train' || c.kind === 'power' || c.kind === 'cadence' ? [c.member] : [],
      );
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('does not offer a card that cannot be played: a Pokémon at the cap or at the maximum level', () => {
    const run = teamOf(1);
    const only = run.team[0] as NonNullable<(typeof run.team)[number]>;
    only.level = quietConfig.team.maxLevel;
    only.damageUps = quietConfig.cards.upgradeCap;
    only.cadenceUps = quietConfig.cards.upgradeCap;
    for (let i = 0; i < 200; i++) {
      for (const card of drawOffers(run, quietConfig)) {
        expect(['train', 'power', 'cadence']).not.toContain(card.kind);
      }
    }
  });
});

describe('applying cards', () => {
  const fresh = () => createRun(quietConfig, 1, 'charmander');

  it('newBall adds a Pokémon with a ready ball of its own and a new id', () => {
    const run = fresh();
    applyCard(run, quietConfig, { kind: 'newBall', species: 'pikachu' });
    expect(run.team.map((m) => [m.species, m.level])).toEqual([
      ['charmander', 1],
      ['pikachu', 1],
    ]);
    expect(run.loadout.map((b) => [b.id, b.species, b.owner])).toEqual([
      [1, 'charmander', 0],
      [2, 'pikachu', 1],
    ]);
    expect(run.cooldowns).toEqual([0, 0]);
    expect(run.nextBallId).toBe(3);
  });

  it('newBall is ignored when the team is full', () => {
    const run = fresh();
    for (const id of ['squirtle', 'bulbasaur', 'pikachu', 'vulpix', 'psyduck', 'gyarados']) {
      applyCard(run, quietConfig, { kind: 'newBall', species: id });
    }
    expect(run.team).toHaveLength(quietConfig.team.maxMembers);
    expect(run.loadout).toHaveLength(quietConfig.team.maxMembers);
    expect(run.cooldowns).toHaveLength(quietConfig.team.maxMembers);
  });

  it('a new Pokémon fires on the next tick when there is a target', () => {
    const run = fresh();
    run.cooldowns = [-1];
    run.bodies = [];
    run.enemies = [makeEnemy({ y: 200 })];
    applyCard(run, quietConfig, { kind: 'newBall', species: 'pikachu' });
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.bodies.map((b) => b.slot)).toEqual([1]);
  });

  it('team adds damageStep to the multiplier of everyone, and hits use it', () => {
    const run = flyingRun(makeBall(), [makeEnemy({ type: 'electric' })]);
    const base = tick(run, { moveX: 0 }, quietConfig).events.find((e) => e.type === 'hit');
    const boosted = flyingRun(makeBall(), [makeEnemy({ type: 'electric' })]);
    applyCard(boosted, quietConfig, { kind: 'team' });
    applyCard(boosted, quietConfig, { kind: 'team' });
    expect(boosted.player.damageMult).toBeCloseTo(1 + 2 * quietConfig.cards.damageStep, 9);
    const hit = tick(boosted, { moveX: 0 }, quietConfig).events.find((e) => e.type === 'hit');
    expect(base?.type === 'hit' && hit?.type === 'hit' ? hit.damage / base.damage : 0).toBeCloseTo(
      1 + 2 * quietConfig.cards.damageStep,
      9,
    );
  });

  it('power is the damage of one Pokémon only, up to the cap', () => {
    const run = fresh();
    addMember(run, quietConfig, 'squirtle', 1);
    applyCard(run, quietConfig, { kind: 'power', member: 1 });
    expect(run.team.map((m) => m.damageUps)).toEqual([0, 1]);
    expect(run.player.damageMult).toBe(1);
    expect(powerMult(quietConfig, run.team[1])).toBeCloseTo(1 + quietConfig.cards.powerStep, 9);
    expect(powerMult(quietConfig, run.team[0])).toBe(1);
    for (let i = 0; i < 20; i++) applyCard(run, quietConfig, { kind: 'power', member: 1 });
    expect(run.team[1]?.damageUps).toBe(quietConfig.cards.upgradeCap);
    applyCard(run, quietConfig, { kind: 'power', member: 9 }); // a Pokémon that is not there
    expect(run.team).toHaveLength(2);
  });

  it('a power card makes the hits of the balls of that Pokémon harder', () => {
    const a = flyingRun(makeBall(), [makeEnemy({ type: 'electric' })]);
    const b = flyingRun(makeBall(), [makeEnemy({ type: 'electric' })]);
    applyCard(b, quietConfig, { kind: 'power', member: 0 });
    const hitA = tick(a, { moveX: 0 }, quietConfig).events.find((e) => e.type === 'hit');
    const hitB = tick(b, { moveX: 0 }, quietConfig).events.find((e) => e.type === 'hit');
    expect(
      hitA?.type === 'hit' && hitB?.type === 'hit' ? hitB.damage / hitA.damage : 0,
    ).toBeCloseTo(1 + quietConfig.cards.powerStep, 9);
  });

  it('cadence shortens the reload of one Pokémon after its ball leaves, never below the floor', () => {
    const run = flyingRun(makeBall(), [], {
      slot: 0,
      x: 240,
      y: 730,
      vx: 0,
      vy: 6,
      pierce: 0,
      skipId: 0,
    });
    applyCard(run, quietConfig, { kind: 'cadence', member: 0 });
    // The ball leaves at x = 240, right on the launcher: it is picked up in the same tick.
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.cooldowns[0]).toBe(
      Math.floor(quietConfig.ball.cooldownTicks * quietConfig.cards.cadenceFactor + 0.5),
    );
    for (let i = 0; i < 40; i++) applyCard(run, quietConfig, { kind: 'cadence', member: 0 });
    expect(run.team[0]?.cadenceUps).toBe(quietConfig.cards.upgradeCap);
    const lots = { ...(run.team[0] as NonNullable<(typeof run.team)[number]>), cadenceUps: 60 };
    expect(cadenceMult(quietConfig, lots)).toBe(quietConfig.cards.cadenceFloor);
  });

  it('train gives a level; at the maximum it does nothing', () => {
    const run = fresh();
    applyCard(run, quietConfig, { kind: 'train', member: 0 });
    expect(run.team[0]?.level).toBe(2);
    for (let i = 0; i < 20; i++) applyCard(run, quietConfig, { kind: 'train', member: 0 });
    expect(run.team[0]?.level).toBe(quietConfig.team.maxLevel);
  });

  it('vitality raises max hp and heals the same amount', () => {
    const run = fresh();
    run.player.hp = 4;
    applyCard(run, quietConfig, { kind: 'vitality' });
    expect(run.player.maxHp).toBe(quietConfig.player.maxHp + quietConfig.cards.vitalityHp);
    expect(run.player.hp).toBe(4 + quietConfig.cards.vitalityHp);
  });
});
