import { describe, expect, it } from 'vitest';
import {
  advancePickups,
  applyFusion,
  cloneRun,
  createRun,
  createSnapshot,
  damageEnemy,
  dropBall,
  dropCapture,
  hashRun,
  MAX_PICKUPS,
  type Run,
  reloadTicks,
  tick,
  writeSnapshot,
} from '../../src/domain';
import { flyingRun, makeBall, makeEnemy, quietConfig, withConfig } from './fixtures';

const floorY = quietConfig.player.y;
const pickup = quietConfig.pickup;

/** A run on the floor of an empty arena with one ball waiting at `x`. */
function runWithDrop(x: number, playerX = 240): Run {
  const run = createRun(quietConfig, 1, 'charmander');
  run.cooldowns = [-1];
  run.player.x = playerX;
  dropBall(run, quietConfig, 0, x);
  run.events = [];
  return run;
}

describe('a ball that leaves the arena', () => {
  it('waits on the floor where it left, instead of re-arming by itself', () => {
    const run = flyingRun(makeBall({ id: 7 }), [], {
      slot: 0,
      x: 100,
      y: 730,
      vx: 0,
      vy: 6,
      pierce: 0,
      skipId: 0,
    });
    run.player.x = 400; // far from the pickup
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.bodies).toEqual([]);
    expect(run.cooldowns[0]).toBe(-1);
    expect(run.pickups).toEqual([
      { slot: 0, species: '', type: 'fire', x: 100, y: floorY, ticks: pickup.returnTicks - 1 },
    ]);
    expect(run.events).toContainEqual({ type: 'drop', ballId: 7, x: 100 });
  });

  it('is put where the launcher can reach, even if it left at the wall', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    dropBall(run, quietConfig, 0, -30);
    dropBall(run, quietConfig, 0, 9999);
    expect(run.pickups.map((p) => p.x)).toEqual([
      quietConfig.player.margin,
      quietConfig.arena.width - quietConfig.player.margin,
    ]);
  });

  it('does nothing for a slot that no longer exists', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    dropBall(run, quietConfig, 5, 100);
    expect(run.pickups).toEqual([]);
    expect(run.events).toEqual([]);
  });
});

describe('collecting', () => {
  it('re-arms the ball with the normal reload when the launcher is within reach', () => {
    const run = runWithDrop(240 + pickup.radius, 240); // exactly at the radius: collected
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.pickups).toEqual([]);
    expect(run.cooldowns[0]).toBe(quietConfig.ball.cooldownTicks);
    expect(run.events).toContainEqual({
      type: 'collect',
      ballId: run.loadout[0]?.id,
      x: 240 + pickup.radius,
      late: false,
    });
  });

  it('does not collect one pixel out of reach', () => {
    const run = runWithDrop(240 + pickup.radius + 1, 240);
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.pickups).toHaveLength(1);
    expect(run.cooldowns[0]).toBe(-1);
    expect(run.events.some((e) => e.type === 'collect')).toBe(false);
  });

  it('is collected by walking onto it', () => {
    const run = runWithDrop(240 + 100, 240);
    let collected = false;
    for (let i = 0; i < 40 && !collected; i++) {
      for (const e of tick(run, { moveX: 1 }, quietConfig).events) {
        if (e.type === 'collect') collected = true;
      }
    }
    expect(collected).toBe(true);
    expect(run.player.x).toBeLessThan(240 + 100); // it stopped needing to walk as soon as it reached
  });

  it('uses the cadence cards and, with the assisted aim, the slower reload', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    expect(reloadTicks(run, quietConfig)).toBe(quietConfig.ball.cooldownTicks);
    run.player.cooldownMult = 0.5;
    expect(reloadTicks(run, quietConfig)).toBe(
      Math.floor(quietConfig.ball.cooldownTicks * 0.5 + 0.5),
    );
    const slow = withConfig({ ball: { ...quietConfig.ball, autoCooldownMult: 2 } });
    run.player.cooldownMult = 1;
    expect(reloadTicks(run, slow)).toBe(quietConfig.ball.cooldownTicks);
    run.autoAim = true;
    expect(reloadTicks(run, slow)).toBe(quietConfig.ball.cooldownTicks * 2);
    run.player.cooldownMult = 0;
    expect(reloadTicks(run, slow)).toBe(1); // never zero
  });

  it('collects in order of appearance and several in one tick', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.loadout = [makeBall({ id: 1 }), makeBall({ id: 2 })];
    run.cooldowns = [-1, -1];
    dropBall(run, quietConfig, 1, 240);
    dropBall(run, quietConfig, 0, 245);
    run.events = [];
    tick(run, { moveX: 0 }, quietConfig);
    const ids = run.events.flatMap((e) => (e.type === 'collect' ? [e.ballId] : []));
    expect(ids).toEqual([2, 1]);
    expect(run.pickups).toEqual([]);
  });
});

describe('a pickup of a slot that no longer exists', () => {
  it('is dropped without error and without any event', () => {
    const run = runWithDrop(240);
    run.loadout = [];
    run.cooldowns = [];
    advancePickups(run, quietConfig);
    expect(run.pickups).toEqual([]);
    expect(run.events).toEqual([]);
  });
});

describe('a ball nobody picks up', () => {
  it('comes back on its own after returnTicks, with the extra reload', () => {
    const run = runWithDrop(60, 400);
    let late = false;
    let ticks = 0;
    while (!late && ticks < pickup.returnTicks + 5) {
      ticks += 1;
      for (const e of tick(run, { moveX: 0 }, quietConfig).events) {
        if (e.type === 'collect') late = e.late;
      }
    }
    expect(late).toBe(true);
    expect(ticks).toBe(pickup.returnTicks);
    expect(run.cooldowns[0]).toBe(quietConfig.ball.cooldownTicks + pickup.returnPenaltyTicks);
    expect(run.pickups).toEqual([]);
  });

  it('its timer is part of the state: the hash and the clone see it', () => {
    const run = runWithDrop(60, 400);
    const base = hashRun(run);
    const copy = cloneRun(run);
    expect(hashRun(copy)).toBe(base);
    tick(copy, { moveX: 0 }, quietConfig);
    expect(hashRun(copy)).not.toBe(base);
    expect(run.pickups[0]?.ticks).toBe(pickup.returnTicks); // the original was not touched
  });
});

describe('captured balls', () => {
  const cfg = withConfig({ pickup: { ...pickup, dropSpeed: 10, captureTtlTicks: 50 } });

  function dropAt(x: number, y: number, run: Run = createRun(cfg, 1, 'charmander')): Run {
    dropCapture(run, cfg, 'psyduck', 'water', x, y);
    return run;
  }

  it('falls at the drop speed and does not run its timer until it lands', () => {
    const run = dropAt(100, 400);
    run.player.x = 400;
    advancePickups(run, cfg);
    expect(run.pickups[0]).toMatchObject({ y: 410, ticks: 50 });
    for (let i = 0; i < 40; i++) advancePickups(run, cfg);
    expect(run.pickups[0]?.y).toBe(floorY);
    const landed = run.pickups[0]?.ticks ?? 0;
    expect(landed).toBeLessThanOrEqual(50);
    advancePickups(run, cfg);
    expect(run.pickups[0]?.ticks).toBe(landed - 1);
  });

  it('can be caught in the air by a launcher that is near enough', () => {
    const run = dropAt(240, floorY - 20, createRun(cfg, 1, 'charmander'));
    advancePickups(run, cfg); // falls to the floor, at the launcher
    expect(run.pickups).toEqual([]);
    expect(run.loadout.map((b) => b.species)).toEqual(['charmander', 'psyduck']);
  });

  it('is within reach by distance, height included: a ball falling beside the launcher waits', () => {
    const run = createRun(cfg, 1, 'charmander');
    // 30 px to the side and, after the first step, 20 px above the floor: 36.06 px away, just out.
    dropCapture(run, cfg, 'psyduck', 'water', 240 + 30, floorY - 30);
    advancePickups(run, cfg);
    expect(run.pickups).toHaveLength(1);
    expect(run.pickups[0]?.y).toBe(floorY - 20);
    advancePickups(run, cfg); // lands: 30 px to the side, in reach
    expect(run.pickups).toEqual([]);
    expect(run.loadout).toHaveLength(2);
  });

  it('joins the team ready to fire, as a level 1 ball of its own species', () => {
    const run = dropAt(240, floorY);
    advancePickups(run, cfg);
    const added = run.loadout[1];
    expect(added).toMatchObject({ species: 'psyduck', type: 'water', level: 1, hybrid: false });
    expect(added?.id).toBe(2);
    expect(run.nextBallId).toBe(3);
    expect(run.cooldowns).toEqual([0, 0]);
    expect(run.events).toContainEqual({
      type: 'capture',
      ballId: 2,
      species: 'psyduck',
      x: 240,
      late: false,
    });
  });

  it('joins on its own with the extra reload once it has waited too long', () => {
    const run = dropAt(60, floorY);
    run.player.x = 400;
    for (let i = 0; i < cfg.pickup.captureTtlTicks - 1; i++) advancePickups(run, cfg);
    expect(run.pickups).toHaveLength(1);
    advancePickups(run, cfg);
    expect(run.pickups).toEqual([]);
    expect(run.cooldowns[1]).toBe(cfg.pickup.returnPenaltyTicks);
    expect(run.events.at(-1)).toMatchObject({ type: 'capture', late: true });
  });

  it('is never lost when the team is full: it makes everyone hit harder instead', () => {
    const full = withConfig({ cards: { ...quietConfig.cards, maxBalls: 1 } });
    const run = createRun(full, 1, 'charmander');
    dropCapture(run, full, 'psyduck', 'water', 240, floorY);
    advancePickups(run, full);
    expect(run.loadout).toHaveLength(1);
    expect(run.player.damageMult).toBeCloseTo(1 + full.capture.overflowDamageStep, 12);
    expect(run.events).toContainEqual({
      type: 'capture',
      ballId: 0,
      species: 'psyduck',
      x: 240,
      late: false,
    });
  });

  it('never holds more than MAX_PICKUPS', () => {
    const run = createRun(cfg, 1, 'charmander');
    for (let i = 0; i < MAX_PICKUPS + 10; i++) dropCapture(run, cfg, 'psyduck', 'water', 50, 100);
    expect(run.pickups).toHaveLength(MAX_PICKUPS);
  });
});

describe('capture on a kill', () => {
  function killOne(chance: number, pity = 0, misses = 0, enemyId = 1): Run {
    const cfg = withConfig({ capture: { ...quietConfig.capture, chance, pityStep: pity } });
    const run = createRun(cfg, 1, 'charmander');
    run.captureMisses = misses;
    const enemy = makeEnemy({
      id: enemyId,
      species: 'vulpix',
      type: 'fire',
      hp: 1,
      x: 200,
      y: 300,
    });
    run.enemies = [enemy];
    run.nextEnemyId = 100;
    damageEnemy(run, cfg, enemy, 5);
    return run;
  }

  it('drops the enemy ball where it fell when the roll is under the chance', () => {
    const run = killOne(1);
    expect(run.pickups).toEqual([
      {
        slot: -1,
        species: 'vulpix',
        type: 'fire',
        x: 200,
        y: 300,
        ticks: quietConfig.pickup.captureTtlTicks,
      },
    ]);
    expect(run.captureMisses).toBe(0);
  });

  it('drops nothing at chance 0 and counts the miss', () => {
    const run = killOne(0);
    expect(run.pickups).toEqual([]);
    expect(run.captureMisses).toBe(1);
  });

  it('adds the bad-luck bonus for every kill without a drop, and a drop resets it', () => {
    expect(killOne(0, 0.5, 2).pickups).toHaveLength(1); // 0 + 2 * 0.5 = 1 >= any roll
    expect(killOne(0, 0.5, 2).captureMisses).toBe(0);
    expect(killOne(0, 0.1, 0).pickups).toHaveLength(0);
  });

  it('draws from its own stream on every kill, whatever the chance', () => {
    const lucky = killOne(1);
    const unlucky = killOne(0);
    expect(lucky.rng.capture).toEqual(unlucky.rng.capture);
    const fresh = createRun(quietConfig, 1, 'charmander');
    expect(lucky.rng.capture).not.toEqual(fresh.rng.capture);
    expect(lucky.rng.loot).toEqual(unlucky.rng.loot);
    expect(lucky.rng.spawn).toEqual(fresh.rng.spawn);
  });

  it('never drops the boss, and a boss kill does not move the bad-luck counter', () => {
    const cfg = withConfig({ capture: { ...quietConfig.capture, chance: 1 } });
    const run = createRun(cfg, 1, 'charmander');
    const boss = makeEnemy({ id: 9, species: 'gyarados', hp: 1 });
    run.enemies = [boss];
    run.boss = { spawned: true, id: 9, maxHp: 100, tick: 0 };
    run.captureMisses = 3;
    damageEnemy(run, cfg, boss, 5);
    expect(run.pickups).toEqual([]);
    expect(run.captureMisses).toBe(3);
  });

  it('does not drop beyond the pickup limit, and counts that as a miss', () => {
    const cfg = withConfig({ capture: { ...quietConfig.capture, chance: 1 } });
    const run = createRun(cfg, 1, 'charmander');
    for (let i = 0; i < MAX_PICKUPS; i++) dropCapture(run, cfg, 'psyduck', 'water', 50, 100);
    const enemy = makeEnemy({ id: 1, hp: 1 });
    run.enemies = [enemy];
    const before = run.captureMisses;
    damageEnemy(run, cfg, enemy, 5);
    expect(run.pickups).toHaveLength(MAX_PICKUPS);
    expect(run.captureMisses).toBe(before + 1);
  });

  it('a run starts as if some kills had already missed', () => {
    const cfg = withConfig({ capture: { ...quietConfig.capture, startMisses: 4 } });
    expect(createRun(cfg, 1, 'charmander').captureMisses).toBe(4);
  });
});

describe('fusing with balls on the floor', () => {
  function fusable(): Run {
    const run = createRun(quietConfig, 1, 'charmander');
    run.loadout = [
      makeBall({ id: 1 }),
      makeBall({ id: 2 }),
      makeBall({ id: 3, species: 'vulpix' }),
    ];
    run.cooldowns = [-1, -1, -1];
    run.tokens = 1;
    run.player.x = 450;
    dropBall(run, quietConfig, 0, 50);
    dropBall(run, quietConfig, 1, 100);
    dropBall(run, quietConfig, 2, 150);
    return run;
  }

  it('removes the pickups of both ingredients and shifts the later slots down', () => {
    const run = fusable();
    applyFusion(run, 0, 1);
    expect(run.loadout.map((b) => b.id)).toEqual([1, 3]);
    expect(run.pickups.map((p) => [p.slot, p.x])).toEqual([[1, 150]]);
  });

  it('leaves the pickups of earlier slots alone', () => {
    const run = fusable();
    applyFusion(run, 1, 2); // species differ: refused, nothing changes
    expect(run.pickups).toHaveLength(3);
    const ok = fusable();
    ok.loadout = [makeBall({ id: 1, species: 'vulpix' }), makeBall({ id: 2 }), makeBall({ id: 3 })];
    applyFusion(ok, 1, 2);
    expect(ok.pickups.map((p) => p.slot)).toEqual([0]);
  });
});

describe('what the render sees', () => {
  it('copies the pickups, the aim and the assist into the snapshot', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    dropBall(run, quietConfig, 0, 123);
    dropCapture(run, quietConfig, 'psyduck', 'water', 300, 200);
    run.aimX = 77;
    run.aimY = 88;
    run.autoAim = true;
    const snap = createSnapshot();
    const codes = new Map([
      ['charmander', 0],
      ['psyduck', 5],
    ]);
    writeSnapshot(run, snap, codes);
    expect(snap.pickupCount).toBe(2);
    expect([
      snap.pickupX[0],
      snap.pickupY[0],
      snap.pickupCaptured[0],
      snap.pickupSpecies[0],
    ]).toEqual([123, floorY, 0, 0]);
    expect([
      snap.pickupX[1],
      snap.pickupY[1],
      snap.pickupCaptured[1],
      snap.pickupSpecies[1],
    ]).toEqual([300, 200, 1, 5]);
    expect(snap.pickupType[1]).toBe(1); // water
    expect(snap.pickupTicks[0]).toBe(quietConfig.pickup.returnTicks);
    expect([snap.aimX, snap.aimY, snap.autoAim]).toEqual([77, 88, true]);
  });

  it('reports truncation when there are more pickups than buffer slots', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    for (let i = 0; i < 5; i++) dropCapture(run, quietConfig, 'psyduck', 'water', 50, 100);
    const snap = createSnapshot(8, 8, 3);
    writeSnapshot(run, snap);
    expect(snap.pickupCount).toBe(3);
    expect(snap.truncated).toBe(true);
  });
});
