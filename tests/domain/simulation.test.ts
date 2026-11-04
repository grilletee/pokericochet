import { describe, expect, it } from 'vitest';
import {
  type BallBody,
  type Command,
  cloneRun,
  createRng,
  createRun,
  type Enemy,
  hashRun,
  nextInt,
  type Run,
  tick,
} from '../../src/domain';
import { advanceUntil, autoCommand, config, makeBall, quietConfig } from './fixtures';

const IDLE: Command = { moveX: 0 };

function randomCommands(seed: number, count: number): Command[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => ({ moveX: (nextInt(rng, 3) - 1) as -1 | 0 | 1 }));
}

function play(seed: number, commands: readonly Command[]): Run {
  const run = createRun(config, seed, 'charmander');
  for (const cmd of commands) tick(run, autoCommand(run, cmd.moveX), config);
  return run;
}

interface Recording {
  readonly run: Run;
  readonly commands: Command[];
  readonly hashes: string[];
  readonly kills: number;
  readonly picks: number;
}

/** A bot that moves at random and picks random cards; records every command it sends. */
/** Gentler enemies than the shipped ones, so a clumsy random bot lives long enough to level up. */
const playConfig = { ...config, enemy: { ...config.enemy, hpScale: 0.3 } };

function playBot(seed: number, ticks: number): Recording {
  const run = createRun(playConfig, seed, 'charmander');
  const bot = createRng(seed ^ 0x5eed);
  const commands: Command[] = [];
  const hashes: string[] = [];
  let kills = 0;
  let picks = 0;
  for (let i = 0; i < ticks && run.phase !== 'lost' && run.phase !== 'won'; i++) {
    // Wanders at random, but walks to a ball on the floor when there is one.
    const wander = (nextInt(bot, 3) - 1) as -1 | 0 | 1;
    const floorBall = run.pickups[0];
    const moveX: -1 | 0 | 1 =
      floorBall === undefined
        ? wander
        : floorBall.x > run.player.x + 4
          ? 1
          : floorBall.x < run.player.x - 4
            ? -1
            : 0;
    // The assisted aim is on for the first two thirds of each 3000 ticks and off for the rest,
    // so the recording exercises both.
    const autoAim = i % 3000 < 2000;
    // Aims by hand at the lowest enemy (or straight up), so the recording carries aim commands.
    const target = run.enemies.reduce<Enemy | undefined>(
      (low, e) => (low === undefined || e.y > low.y ? e : low),
      undefined,
    );
    const cmd: Command =
      run.phase === 'levelup'
        ? { moveX, action: { type: 'pick', index: nextInt(bot, run.offers.length) } }
        : target === undefined
          ? { moveX, autoAim }
          : { moveX, autoAim, aimX: target.x, aimY: target.y };
    commands.push(cmd);
    for (const e of tick(run, cmd, playConfig).events) {
      if (e.type === 'kill') kills += 1;
      if (e.type === 'pick') picks += 1;
    }
    if (i % 100 === 0) hashes.push(hashRun(run));
  }
  return { run, commands, hashes, kills, picks };
}

function replay(seed: number, commands: readonly Command[]): { run: Run; hashes: string[] } {
  const run = createRun(playConfig, seed, 'charmander');
  const hashes: string[] = [];
  commands.forEach((cmd, i) => {
    tick(run, cmd, playConfig);
    if (i % 100 === 0) hashes.push(hashRun(run));
  });
  return { run, hashes };
}

describe('createRun', () => {
  it('starts centred, at full health, with the starter ball ready to fire', () => {
    const run = createRun(config, 1, 'squirtle');
    expect(run.phase).toBe('playing');
    expect(run.tickCount).toBe(0);
    expect(run.player.x).toBe(config.arena.width / 2);
    expect(run.player.hp).toBe(config.player.maxHp);
    expect(run.loadout.map((b) => b.species)).toEqual(['squirtle']);
    expect(run.cooldowns).toEqual([0]);
    expect(run.bodies).toEqual([]);
  });
});

describe('player movement', () => {
  it('moves moveX * speed per tick and stays inside the margins', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    tick(run, { moveX: 1 }, quietConfig);
    expect(run.player.x).toBe(config.arena.width / 2 + config.player.speed);
    for (let i = 0; i < 500; i++) tick(run, { moveX: 1 }, quietConfig);
    expect(run.player.x).toBe(config.arena.width - config.player.margin);
    for (let i = 0; i < 1000; i++) tick(run, { moveX: -1 }, quietConfig);
    expect(run.player.x).toBe(config.player.margin);
  });
});

describe('auto-aim', () => {
  function runWithEnemies(enemyList: Array<[id: number, x: number, y: number]>): Run {
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = enemyList.map(([id, x, y]) => ({
      id,
      species: 'vulpix',
      type: 'fire',
      hp: 100,
      x,
      y,
      speed: 0,
      radius: quietConfig.enemy.radius,
      threat: 1,
      xp: 1,
      burnTicks: 0,
      burnDps: 0,
    }));
    run.nextEnemyId = 100;
    run.autoAim = true;
    return run;
  }

  it('fires towards the nearest enemy', () => {
    const run = runWithEnemies([
      [1, 100, 200],
      [2, 400, 500],
    ]);
    tick(run, IDLE, quietConfig);
    const b = run.bodies[0];
    expect(b).toBeDefined();
    expect((b?.vx ?? 0) > 0).toBe(true); // enemy 2 is up-right of the player, enemy 1 is up-left
  });

  it('breaks distance ties by lower id, whatever the array order', () => {
    // Player at x=240. Enemies at x=200 and x=280 are exactly equidistant.
    for (const order of [
      [
        [7, 280, 300],
        [3, 200, 300],
      ],
      [
        [3, 200, 300],
        [7, 280, 300],
      ],
    ] as Array<Array<[number, number, number]>>) {
      const run = runWithEnemies(order);
      tick(run, IDLE, quietConfig);
      expect((run.bodies[0]?.vx ?? 0) < 0).toBe(true); // id 3 is on the left
      expect(run.events.some((e) => e.type === 'launch')).toBe(true);
    }
  });

  it('does not fire when there is no enemy, and keeps the ball ready', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.autoAim = true;
    tick(run, IDLE, quietConfig);
    expect(run.bodies).toEqual([]);
    expect(run.cooldowns).toEqual([0]);
  });

  it('fires with a seeded jitter inside the configured cone', () => {
    const cfg = { ...quietConfig, ball: { ...quietConfig.ball, aimJitter: 0.176 } };
    const run = createRun(cfg, 5, 'charmander');
    run.enemies = [
      {
        id: 1,
        species: 'vulpix',
        type: 'fire',
        hp: 100,
        x: 240,
        y: 100,
        speed: 0,
        radius: 16,
        threat: 1,
        xp: 1,
        burnTicks: 0,
        burnDps: 0,
      },
    ];
    run.nextEnemyId = 2;
    tick(run, IDLE, cfg);
    const b = run.bodies[0];
    expect(b).toBeDefined();
    if (b) {
      expect(Math.abs(b.vx / -b.vy)).toBeLessThanOrEqual(0.2);
      expect(b.vy).toBeLessThan(0);
    }
  });
});

describe('combat in the loop', () => {
  it('a ball hits and damages the enemy, and a fatal hit emits kill and removes it', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [
      {
        id: 1,
        species: 'vulpix',
        type: 'grass',
        hp: 1,
        x: 240,
        y: 300,
        speed: 0,
        radius: 16,
        threat: 1,
        xp: 1,
        burnTicks: 0,
        burnDps: 0,
      },
    ];
    run.nextEnemyId = 2;
    const seen: string[] = [];
    for (let i = 0; i < 120 && run.enemies.length > 0; i++) {
      tick(run, IDLE, quietConfig);
      for (const e of run.events) seen.push(e.type);
    }
    expect(seen).toContain('hit');
    expect(seen).toContain('kill');
    expect(run.enemies).toEqual([]);
  });

  it('an enemy crossing the defence line hurts the player and disappears', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [
      {
        id: 1,
        species: 'vulpix',
        type: 'water',
        hp: 9999,
        x: 30,
        y: quietConfig.arena.defenseLineY - 0.1,
        speed: 1,
        radius: 16,
        threat: 3,
        xp: 1,
        burnTicks: 0,
        burnDps: 0,
      },
    ];
    run.nextEnemyId = 2;
    tick(run, IDLE, quietConfig);
    expect(run.player.hp).toBe(quietConfig.player.maxHp - 3);
    expect(run.enemies).toEqual([]);
    expect(run.events).toContainEqual({ type: 'leak', enemyId: 1, damage: 3 });
  });

  it('the run is lost at 0 hp and then stops advancing', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.player.hp = 1;
    run.enemies = [
      {
        id: 1,
        species: 'vulpix',
        type: 'water',
        hp: 9999,
        x: 30,
        y: quietConfig.arena.defenseLineY,
        speed: 1,
        radius: 16,
        threat: 1,
        xp: 1,
        burnTicks: 0,
        burnDps: 0,
      },
    ];
    tick(run, IDLE, quietConfig);
    expect(run.phase).toBe('lost');
    const frozen = hashRun(run);
    tick(run, { moveX: 1 }, quietConfig);
    expect(hashRun(run)).toBe(frozen);
  });

  it('keeps every ball inside the arena horizontally and never creates NaN', () => {
    const run = createRun(config, 3, 'pikachu');
    for (let i = 0; i < 3000; i++) {
      tick(run, autoCommand(run, i % 200 < 100 ? 1 : -1), config);
      for (const b of run.bodies) {
        expect(Number.isFinite(b.x + b.y + b.vx + b.vy)).toBe(true);
        expect(b.x).toBeGreaterThanOrEqual(config.ball.radius - 1e-9);
        expect(b.x).toBeLessThanOrEqual(config.arena.width - config.ball.radius + 1e-9);
      }
      if (run.phase === 'lost') break;
    }
  });
});

describe('determinism', () => {
  const commands = randomCommands(2026, 1800); // 30 s of game

  it('same seed + same commands => same hashRun after every tick checkpoint', () => {
    const a = createRun(config, 42, 'charmander');
    const b = createRun(config, 42, 'charmander');
    for (let i = 0; i < commands.length; i++) {
      tick(a, autoCommand(a, commands[i]?.moveX ?? 0), config);
      tick(b, autoCommand(b, commands[i]?.moveX ?? 0), config);
      if (i % 60 === 0) expect(hashRun(a)).toBe(hashRun(b));
    }
    expect(hashRun(a)).toBe(hashRun(b));
    expect(a.tickCount).toBe(commands.length);
  });

  it('is meaningful: the run actually spawns, fires and hits during those ticks', () => {
    const run = play(42, commands);
    expect(run.nextEnemyId).toBeGreaterThan(1);
    expect(run.enemies.length + run.bodies.length).toBeGreaterThan(0);
  });

  it('different seed => different hash; different commands => different hash', () => {
    const base = hashRun(play(42, commands));
    expect(hashRun(play(43, commands))).not.toBe(base);
    const altered = commands.slice();
    altered[10] = { moveX: 1 };
    altered[11] = { moveX: 1 };
    altered[12] = { moveX: 1 };
    expect(hashRun(play(42, altered))).not.toBe(base);
  });

  it('hashRun covers the content of the card offers', () => {
    // Accepted surviving mutant (3B, ADR-015): dropping `h.int(run.offers.length)` from hashRun is
    // NOT caught, and that is deliberate. It is an equivalent mutant in practice: every offer
    // still writes its kind (and species) into the hash, so [] and [card] already differ, and the
    // length prefix only removes a purely theoretical ambiguity between two different lists
    // that would write the same bytes. What matters, and what this test pins, is the content.
    const a = play(42, commands.slice(0, 200));
    const b = cloneRun(a);
    expect(hashRun(b)).toBe(hashRun(a));
    b.offers = [{ kind: 'vitality' }];
    expect(hashRun(b)).not.toBe(hashRun(a));
    a.offers = [{ kind: 'damage' }];
    expect(hashRun(b)).not.toBe(hashRun(a));
  });

  it('cloneRun gives an independent copy with the same hash', () => {
    const run = play(42, commands.slice(0, 600));
    const copy = cloneRun(run);
    expect(hashRun(copy)).toBe(hashRun(run));
    for (const cmd of commands.slice(600, 900)) tick(run, autoCommand(run, cmd.moveX), config);
    expect(hashRun(copy)).not.toBe(hashRun(run));
    for (const cmd of commands.slice(600, 900)) tick(copy, autoCommand(copy, cmd.moveX), config);
    expect(hashRun(copy)).toBe(hashRun(run));
  });
});

describe('determinism: replaying a whole run (seed + commands, card picks included)', () => {
  const recording = playBot(2026, 9000);

  it('the scenario is not vacuous: it levels up, picks cards, kills and spawns', () => {
    expect(recording.run.player.level).toBeGreaterThanOrEqual(3);
    expect(recording.picks).toBeGreaterThanOrEqual(2);
    expect(recording.kills).toBeGreaterThan(5);
    expect(recording.run.nextEnemyId).toBeGreaterThan(20);
    expect(recording.run.loadout.length).toBeGreaterThan(1);
  });

  it('replaying the recorded commands gives the same hashRun at every checkpoint and at the end', () => {
    const again = replay(2026, recording.commands);
    expect(again.hashes).toEqual(recording.hashes);
    expect(hashRun(again.run)).toBe(hashRun(recording.run));
    expect(again.run.player).toEqual(recording.run.player);
    expect(again.run.loadout).toEqual(recording.run.loadout);
  });

  it('a different card pick or a different seed leads to a different run', () => {
    const altered = recording.commands.slice();
    const pickAt = altered.findIndex((c) => c.action !== undefined);
    expect(pickAt).toBeGreaterThanOrEqual(0);
    const original = altered[pickAt]?.action;
    const index = original?.type === 'pick' ? original.index : 0;
    altered[pickAt] = {
      moveX: altered[pickAt]?.moveX ?? 0,
      action: { type: 'pick', index: (index + 1) % 3 },
    };
    expect(hashRun(replay(2026, altered).run)).not.toBe(hashRun(recording.run));
    expect(hashRun(replay(2027, recording.commands).run)).not.toBe(hashRun(recording.run));
  });

  it('is stable across independent bot runs with the same seed', () => {
    expect(hashRun(playBot(2026, 9000).run)).toBe(hashRun(recording.run));
  });
});

describe('hashRun', () => {
  it('changes when any part of the state changes', () => {
    const base = createRun(config, 9, 'charmander');
    advanceUntil(
      base,
      config,
      (r) => r.tickCount >= 400 && r.enemies.length > 0 && r.bodies.length > 0,
    );
    const h = hashRun(base);
    // The scenario must contain enemies and balls in flight, or those mutations would be vacuous.
    expect(base.enemies.length).toBeGreaterThan(0);
    expect(base.bodies.length).toBeGreaterThan(0);

    const enemy = (r: Run): Enemy => r.enemies[0] as Enemy;
    const body = (r: Run): BallBody => r.bodies[0] as BallBody;
    const mutations: Record<string, (r: Run) => void> = {
      seed: (r) => {
        r.seed += 1;
      },
      tickCount: (r) => {
        r.tickCount += 1;
      },
      'player.x': (r) => {
        r.player.x += 0.001;
      },
      'player.hp': (r) => {
        r.player.hp -= 1;
      },
      'player.maxHp': (r) => {
        r.player.maxHp += 1;
      },
      'player.xp': (r) => {
        r.player.xp += 1;
      },
      'player.xpNext': (r) => {
        r.player.xpNext += 1;
      },
      'player.level': (r) => {
        r.player.level += 1;
      },
      'player.damageMult': (r) => {
        r.player.damageMult += 0.01;
      },
      'player.cooldownMult': (r) => {
        r.player.cooldownMult -= 0.01;
      },
      'player.drain': (r) => {
        r.player.drain += 0.5;
      },
      'loadout level': (r) => {
        r.loadout[0] = { ...makeBall(), level: 2 };
      },
      cooldown: (r) => {
        r.cooldowns[0] = (r.cooldowns[0] ?? 0) + 1;
      },
      nextBallId: (r) => {
        r.nextBallId += 1;
      },
      'rng.spawn': (r) => {
        r.rng.spawn.a += 1;
      },
      'rng.aim': (r) => {
        r.rng.aim.d += 1;
      },
      'rng.cards': (r) => {
        r.rng.cards.b += 1;
      },
      'rng.loot': (r) => {
        r.rng.loot.c += 1;
      },
      nextEnemyId: (r) => {
        r.nextEnemyId += 1;
      },
      'wave.index': (r) => {
        r.wave.index += 1;
      },
      'wave.tick': (r) => {
        r.wave.tick += 1;
      },
      offers: (r) => {
        r.offers = [{ kind: 'vitality' }];
      },
      'offers hybrid slots': (r) => {
        r.offers = [{ kind: 'hybrid', a: 0, b: 1 }];
      },
      'offers species': (r) => {
        r.offers = [{ kind: 'newBall', species: 'pikachu' }];
      },
      phase: (r) => {
        r.phase = r.phase === 'playing' ? 'lost' : 'playing';
      },
      'enemy hp': (r) => {
        enemy(r).hp += 0.5;
      },
      'enemy x': (r) => {
        enemy(r).x += 0.001;
      },
      'enemy xp': (r) => {
        enemy(r).xp += 1;
      },
      'enemy burnTicks': (r) => {
        enemy(r).burnTicks += 1;
      },
      'enemy burnDps': (r) => {
        enemy(r).burnDps += 0.5;
      },
      'body vy': (r) => {
        body(r).vy += 0.001;
      },
      'body slot': (r) => {
        body(r).slot += 1;
      },
      'body pierce': (r) => {
        body(r).pierce += 1;
      },
      'body skipId': (r) => {
        body(r).skipId += 1;
      },
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const copy = cloneRun(base);
      mutate(copy);
      expect(hashRun(copy), name).not.toBe(h);
    }
  });

  it('ignores transient data (events) and returns a 16-digit hex string', () => {
    const run = play(9, randomCommands(1, 100));
    const h = hashRun(run);
    run.events.length = 0;
    expect(hashRun(run)).toBe(h);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});
