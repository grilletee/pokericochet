import { describe, expect, it } from 'vitest';
import {
  applyHitEffects,
  createRun,
  createSnapshot,
  HAZARD_KINDS,
  STATUS_BURN,
  STATUS_CURSE,
  STATUS_FROZEN,
  STATUS_MARK,
  STATUS_PARALYSED,
  STATUS_POISON,
  STATUS_PUSHED,
  STATUS_SLOW,
  statusOf,
  writeSnapshot,
} from '../../src/domain';
import { tickAilments } from '../../src/domain/effects';
import { makeBall, makeEnemy, quietConfig } from './fixtures';

describe('the states of an enemy, as the render reads them (4G-C)', () => {
  it('a healthy enemy has none', () => {
    expect(statusOf(makeEnemy())).toBe(0);
  });

  it('each state has its own bit', () => {
    expect(statusOf(makeEnemy({ burnTicks: 5 }))).toBe(STATUS_BURN);
    expect(statusOf(makeEnemy({ poisonTicks: 5 }))).toBe(STATUS_POISON);
    expect(statusOf(makeEnemy({ slowTicks: 5 }))).toBe(STATUS_SLOW);
    expect(statusOf(makeEnemy({ markTicks: 5 }))).toBe(STATUS_MARK);
    expect(statusOf(makeEnemy({ curseTicks: 5 }))).toBe(STATUS_CURSE);
    expect(statusOf(makeEnemy({ pushTicks: 5 }))).toBe(STATUS_PUSHED);
    const bits = [
      STATUS_BURN,
      STATUS_POISON,
      STATUS_SLOW,
      STATUS_FROZEN,
      STATUS_PARALYSED,
      STATUS_MARK,
      STATUS_CURSE,
      STATUS_PUSHED,
    ];
    expect(new Set(bits).size).toBe(bits.length);
    for (const bit of bits) expect(bit & (bit - 1)).toBe(0); // a single bit each
  });

  it('a stop from ice is frozen; a stop from a stun (with its immunity running) is paralysed', () => {
    expect(statusOf(makeEnemy({ haltTicks: 40, chill: 0 }))).toBe(STATUS_FROZEN);
    expect(statusOf(makeEnemy({ haltTicks: 40, chill: 2 }))).toBe(STATUS_FROZEN);
    expect(statusOf(makeEnemy({ haltTicks: 20, chill: -60 }))).toBe(STATUS_PARALYSED);
    expect(statusOf(makeEnemy({ haltTicks: 0, chill: -60 }))).toBe(0);
  });

  it('several at once add up, and the effects of the types set them through real hits', () => {
    const target = makeEnemy();
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [target];
    const hit = (kind: 'burn' | 'poison' | 'slow' | 'mark' | 'curse' | 'push' | 'stun'): void =>
      applyHitEffects(
        run,
        quietConfig,
        makeBall({ effects: [{ kind, strength: kind === 'push' ? 10 : 1 }] }),
        target,
        10,
      );
    hit('burn');
    hit('poison');
    hit('slow');
    hit('mark');
    hit('curse');
    hit('push');
    expect(statusOf(target)).toBe(
      STATUS_BURN | STATUS_POISON | STATUS_SLOW | STATUS_MARK | STATUS_CURSE | STATUS_PUSHED,
    );
    hit('stun');
    expect(statusOf(target) & STATUS_PARALYSED).toBe(STATUS_PARALYSED);
  });

  it('a push leaves its trail for a few ticks only', () => {
    const target = makeEnemy({ y: 200 });
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [target];
    applyHitEffects(
      run,
      quietConfig,
      makeBall({ effects: [{ kind: 'push', strength: 12 }] }),
      target,
      10,
    );
    expect(statusOf(target) & STATUS_PUSHED).toBe(STATUS_PUSHED);
    for (let i = 0; i < 14; i++) tickAilments(run, quietConfig);
    expect(statusOf(target) & STATUS_PUSHED).toBe(0);
  });

  it('goes into the snapshot for each enemy, in the order of the enemies', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [
      makeEnemy({ id: 1, burnTicks: 4 }),
      makeEnemy({ id: 2 }),
      makeEnemy({ id: 3, poisonTicks: 4, slowTicks: 4 }),
    ];
    const snap = createSnapshot();
    writeSnapshot(run, snap);
    expect([snap.enemyStatus[0], snap.enemyStatus[1], snap.enemyStatus[2]]).toEqual([
      STATUS_BURN,
      0,
      STATUS_POISON | STATUS_SLOW,
    ]);
  });

  it('what a boss put on the field goes into the snapshot with a code per kind', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.hazards = [
      {
        kind: 'shot',
        x: 100,
        y: 222,
        width: 30,
        telegraph: 0,
        active: 0,
        damage: 2,
        speed: 6,
        struck: false,
      },
      {
        kind: 'zone',
        x: 300,
        y: 0,
        width: 120,
        telegraph: 20,
        active: 100,
        damage: 0,
        speed: 0,
        struck: false,
      },
    ];
    const snap = createSnapshot();
    writeSnapshot(run, snap);
    expect(snap.hazardCount).toBe(2);
    expect(HAZARD_KINDS[snap.hazardKind[0] ?? 0]).toBe('shot');
    expect(HAZARD_KINDS[snap.hazardKind[1] ?? 0]).toBe('zone');
    expect([snap.hazardX[0], snap.hazardY[0], snap.hazardWidth[1], snap.hazardWarn[1]]).toEqual([
      100, 222, 120, 20,
    ]);
  });
});
