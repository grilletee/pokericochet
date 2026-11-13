import { describe, expect, it } from 'vitest';
import { cloneRun, createRun, hashRun, tick } from '../../src/domain';
import { quietConfig } from './fixtures';

/** 4G-H, block 4: the thumb says where to be and the launcher goes straight there. */
const cfg = quietConfig;
const step = cfg.player.touchStep ?? cfg.player.speed;

describe('moveTo: the launcher follows the finger with no delay', () => {
  it('goes straight to the point, up to touchStep per tick (much faster than the keys)', () => {
    expect(step).toBeGreaterThanOrEqual(cfg.player.speed * 6);
    const run = createRun(cfg, 1, 'charmander');
    run.player.x = 100;
    tick(run, { moveX: 0, moveTo: 120 }, cfg);
    expect(run.player.x).toBe(120); // near: it is there at once
    tick(run, { moveX: 0, moveTo: 400 }, cfg);
    expect(run.player.x).toBe(120 + step); // far: as fast as it may
  });

  it('stays inside the field, and the keys still move it as before when there is no moveTo', () => {
    const run = createRun(cfg, 1, 'charmander');
    run.player.x = 30;
    tick(run, { moveX: 0, moveTo: -500 }, cfg);
    expect(run.player.x).toBe(cfg.player.margin);
    tick(run, { moveX: 1 }, cfg);
    expect(run.player.x).toBe(cfg.player.margin + cfg.player.speed);
  });

  it('is slowed by the time slow of a legendary like any movement', () => {
    const slowCfg = {
      ...cfg,
      bossFight: {
        ...(cfg.bossFight ?? ({} as never)),
        bySpecies: {},
        byType: {},
        default: {
          phases: [
            {
              attacks: [],
              intervalTicks: 1e9,
              perRound: 0,
              damageMult: 1,
              coreEvery: 1e9,
              coreOpen: 1,
              strong: {
                kind: 'column' as const,
                width: 10,
                telegraphTicks: 80,
                activeTicks: 1,
                damage: 0,
              },
            },
            {
              attacks: [],
              intervalTicks: 1e9,
              perRound: 0,
              damageMult: 1,
              coreEvery: 1e9,
              coreOpen: 1,
              strong: {
                kind: 'column' as const,
                width: 10,
                telegraphTicks: 80,
                activeTicks: 1,
                damage: 0,
              },
            },
          ] as const,
          mechanic: { kind: 'timeSlow' as const, everyTicks: 1e9, lastTicks: 100, mult: 0.5 },
        },
      },
    };
    const run = createRun(slowCfg, 1, 'charmander');
    run.enemies = [
      {
        id: 9,
        species: 'dialga',
        type: 'steel',
        hp: 1e9,
        x: 240,
        y: 120,
        speed: 0,
        radius: 60,
        threat: 1,
        xp: 0,
        burnTicks: 0,
        burnDps: 0,
        slowTicks: 0,
        slow: 0,
      },
    ];
    run.boss.id = 9;
    run.boss.maxHp = 1e9;
    run.boss.timeSlow = 50;
    run.player.x = 100;
    tick(run, { moveX: 0, moveTo: 400 }, slowCfg);
    expect(run.player.x).toBeCloseTo(100 + step * 0.5, 9);
  });

  it('is part of the command, so the run stays a function of its commands (whole pixels)', () => {
    const a = createRun(cfg, 7, 'charmander');
    const b = cloneRun(a);
    tick(a, { moveX: 0, moveTo: 200.2 }, cfg);
    tick(b, { moveX: 0, moveTo: 199.8 }, cfg);
    expect(hashRun(a)).toBe(hashRun(b));
    const c = createRun(cfg, 7, 'charmander');
    tick(c, { moveX: 0, moveTo: 260 }, cfg);
    expect(hashRun(c)).not.toBe(hashRun(a));
  });
});
