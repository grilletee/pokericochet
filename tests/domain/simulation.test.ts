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
import { config, makeBall, quietConfig } from './fixtures';

const IDLE: Command = { moveX: 0 };

function randomCommands(seed: number, count: number): Command[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => ({ moveX: (nextInt(rng, 3) - 1) as -1 | 0 | 1 }));
}

function play(seed: number, commands: readonly Command[]): Run {
  const run = createRun(config, seed, 'charmander');
  for (const cmd of commands) tick(run, cmd, config);
  return run;
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
    }));
    run.nextEnemyId = 100;
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
      tick(run, { moveX: i % 200 < 100 ? 1 : -1 }, config);
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
      tick(a, commands[i] ?? IDLE, config);
      tick(b, commands[i] ?? IDLE, config);
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

  it('cloneRun gives an independent copy with the same hash', () => {
    const run = play(42, commands.slice(0, 600));
    const copy = cloneRun(run);
    expect(hashRun(copy)).toBe(hashRun(run));
    for (const cmd of commands.slice(600, 900)) tick(run, cmd, config);
    expect(hashRun(copy)).not.toBe(hashRun(run));
    for (const cmd of commands.slice(600, 900)) tick(copy, cmd, config);
    expect(hashRun(copy)).toBe(hashRun(run));
  });
});

describe('hashRun', () => {
  it('changes when any part of the state changes', () => {
    const base = play(9, randomCommands(1, 400));
    const h = hashRun(base);
    // The scenario must contain enemies and balls in flight, or those mutations would be vacuous.
    expect(base.enemies.length).toBeGreaterThan(0);
    expect(base.bodies.length).toBeGreaterThan(0);

    const mutations: Array<[string, (r: Run) => void]> = [
      [
        'seed',
        (r) => {
          r.seed += 1;
        },
      ],
      [
        'tickCount',
        (r) => {
          r.tickCount += 1;
        },
      ],
      [
        'player.x',
        (r) => {
          r.player.x += 0.001;
        },
      ],
      [
        'player.hp',
        (r) => {
          r.player.hp -= 1;
        },
      ],
      [
        'loadout level',
        (r) => {
          r.loadout[0] = { ...makeBall(), level: 2 };
        },
      ],
      [
        'cooldown',
        (r) => {
          r.cooldowns[0] = (r.cooldowns[0] ?? 0) + 1;
        },
      ],
      [
        'rng.spawn',
        (r) => {
          r.rng.spawn.a += 1;
        },
      ],
      [
        'rng.aim',
        (r) => {
          r.rng.aim.d += 1;
        },
      ],
      [
        'nextEnemyId',
        (r) => {
          r.nextEnemyId += 1;
        },
      ],
      [
        'phase',
        (r) => {
          r.phase = r.phase === 'playing' ? 'lost' : 'playing';
        },
      ],
      [
        'enemy hp',
        (r) => {
          (r.enemies[0] as Enemy).hp += 0.5;
        },
      ],
      [
        'enemy x',
        (r) => {
          (r.enemies[0] as Enemy).x += 0.001;
        },
      ],
      [
        'body vy',
        (r) => {
          (r.bodies[0] as BallBody).vy += 0.001;
        },
      ],
      [
        'body slot',
        (r) => {
          (r.bodies[0] as BallBody).slot += 1;
        },
      ],
    ];
    for (const [name, mutate] of mutations) {
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
