import { describe, expect, it } from 'vitest';
import {
  createRun,
  createSnapshot,
  NO_SPECIES,
  PHASE_LOST,
  PHASE_PLAYING,
  type Run,
  typeCode,
  writeSnapshot,
} from '../../src/domain';
import { advanceUntil, config, quietConfig } from './fixtures';

function populatedRun(): Run {
  const run = createRun(config, 7, 'charmander');
  advanceUntil(
    run,
    config,
    (r) => r.tickCount >= 400 && r.enemies.length > 0 && r.bodies.length > 0,
  );
  return run;
}

describe('writeSnapshot', () => {
  it('copies player, balls and enemies faithfully', () => {
    const run = populatedRun();
    expect(run.enemies.length).toBeGreaterThan(0);
    expect(run.bodies.length).toBeGreaterThan(0);
    const snap = createSnapshot();
    writeSnapshot(run, snap);

    expect(snap.tick).toBe(run.tickCount);
    expect(snap.phase).toBe(PHASE_PLAYING);
    expect(snap.playerX).toBe(run.player.x);
    expect(snap.playerHp).toBe(run.player.hp);
    expect(snap.enemyCount).toBe(run.enemies.length);
    run.enemies.forEach((e, i) => {
      expect(snap.enemyId[i]).toBe(e.id);
      expect(snap.enemyX[i]).toBeCloseTo(e.x, 3);
      expect(snap.enemyY[i]).toBeCloseTo(e.y, 3);
      expect(snap.enemyRadius[i]).toBe(e.radius);
      expect(snap.enemyType[i]).toBe(typeCode(e.type));
    });
    expect(snap.slotCount).toBe(run.loadout.length);
    for (let slot = 0; slot < snap.slotCount; slot++) {
      const body = run.bodies.find((b) => b.slot === slot);
      expect(snap.ballActive[slot]).toBe(body ? 1 : 0);
      if (body) {
        expect(snap.ballX[slot]).toBeCloseTo(body.x, 3);
        expect(snap.ballY[slot]).toBeCloseTo(body.y, 3);
      }
    }
    expect(snap.truncated).toBe(false);
  });

  it('lists enemies in ascending id order (needed to interpolate without allocating)', () => {
    const snap = createSnapshot();
    writeSnapshot(populatedRun(), snap);
    for (let i = 1; i < snap.enemyCount; i++) {
      expect(snap.enemyId[i] ?? 0).toBeGreaterThan(snap.enemyId[i - 1] ?? 0);
    }
  });

  it('reusing a buffer for a smaller run leaves no stale entries visible', () => {
    const snap = createSnapshot();
    writeSnapshot(populatedRun(), snap);
    const small = createRun(quietConfig, 1, 'charmander');
    writeSnapshot(small, snap);
    expect(snap.enemyCount).toBe(0);
    expect(snap.slotCount).toBe(1);
    expect(snap.ballActive[0]).toBe(0);
  });

  it('is deterministic: the same run gives identical buffers', () => {
    const a = createSnapshot();
    const b = createSnapshot();
    writeSnapshot(populatedRun(), a);
    writeSnapshot(populatedRun(), b);
    expect(a).toEqual(b);
  });

  it('flags truncation instead of overflowing the buffers', () => {
    const run = populatedRun();
    const tiny = createSnapshot(1, 2);
    writeSnapshot(run, tiny);
    expect(tiny.enemyCount).toBe(Math.min(2, run.enemies.length));
    expect(tiny.truncated).toBe(run.enemies.length > 2);
  });

  it('reports the lost phase', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.phase = 'lost';
    const snap = createSnapshot();
    writeSnapshot(run, snap);
    expect(snap.phase).toBe(PHASE_LOST);
  });

  it('assigns a distinct colour code to each type', () => {
    expect(
      new Set(['fire', 'water', 'grass', 'electric'].map((t) => typeCode(t as never))).size,
    ).toBe(4);
  });
});

describe('snapshot: species codes for the render', () => {
  it('writes the code of each ball and enemy species, and NO_SPECIES for unknown ones', () => {
    const run = populatedRun();
    const codes = new Map(Object.keys(config.species).map((id, code) => [id, code]));
    const snap = createSnapshot(8, 64);
    writeSnapshot(run, snap, codes);
    expect(snap.enemyCount).toBeGreaterThan(0);
    for (let i = 0; i < snap.enemyCount; i++) {
      expect(snap.enemySpecies[i]).toBe(codes.get(run.enemies[i]?.species ?? ''));
    }
    const slot = run.bodies[0]?.slot ?? 0;
    expect(snap.ballSpecies[slot]).toBe(codes.get(run.loadout[slot]?.species ?? ''));

    writeSnapshot(run, snap); // no table
    expect(snap.enemySpecies[0]).toBe(NO_SPECIES);
    expect(snap.ballSpecies[slot]).toBe(NO_SPECIES);
    writeSnapshot(run, snap, new Map());
    expect(snap.enemySpecies[0]).toBe(NO_SPECIES);
  });
});

describe('snapshot: ball levels for the evolution forms', () => {
  it('writes the level of every ball in flight and of every pickup, so the render picks the form', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.loadout = [
      { id: 1, species: 'charmander', type: 'fire', level: 3, hybrid: false, effects: [] },
      { id: 2, species: 'squirtle', type: 'water', level: 2, hybrid: false, effects: [] },
    ];
    run.cooldowns = [-1, -1];
    run.bodies = [{ slot: 0, x: 10, y: 300, vx: 0, vy: -1, pierce: 0, skipId: 0 }];
    run.pickups = [
      { slot: 1, species: '', type: 'water', x: 50, y: 680, level: 1, ticks: 100 },
      { slot: -1, species: 'psyduck', type: 'water', x: 90, y: 200, level: 1, ticks: 100 },
    ];
    const snap = createSnapshot();
    writeSnapshot(run, snap);
    expect(snap.ballLevel[0]).toBe(3);
    // A returning ball keeps the level of the ball it is; a captured one always starts at 1.
    expect(snap.pickupLevel[0]).toBe(2);
    expect(snap.pickupLevel[1]).toBe(1);
  });
});
