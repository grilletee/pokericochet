import { describe, expect, it } from 'vitest';
import {
  createRun,
  createSnapshot,
  PHASE_LOST,
  PHASE_PLAYING,
  type Run,
  tick,
  typeCode,
  writeSnapshot,
} from '../../src/domain';
import { config, quietConfig } from './fixtures';

function populatedRun(): Run {
  const run = createRun(config, 7, 'charmander');
  for (let i = 0; i < 400; i++) tick(run, { moveX: i % 80 < 40 ? 1 : -1 }, config);
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
