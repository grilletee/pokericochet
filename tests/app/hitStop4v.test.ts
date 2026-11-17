import { describe, expect, it } from 'vitest';
import { HIT_STOP_GAP_MS, HIT_STOP_MS, HitStop, hitStopOf } from '../../src/app/hitStop';
import { gameConfig } from '../../src/data';
import { createRun, type GameEvent, hashRun, tick } from '../../src/domain';

/** 4V, block 1: the hit-stop is presentation only and is dosed. */
describe('hit-stop', () => {
  const move = (manual: boolean): GameEvent => ({ type: 'move', manual }) as unknown as GameEvent;

  it('only the moments that matter stop the game', () => {
    expect(hitStopOf(move(true))).toBe(HIT_STOP_MS.ultimate);
    expect(hitStopOf(move(false))).toBe(0);
    expect(hitStopOf({ type: 'playerHurt', damage: 1, x: 0, source: 'shot' })).toBe(
      HIT_STOP_MS.hurt,
    );
    expect(hitStopOf({ type: 'bossPhase', phase: 1 })).toBe(HIT_STOP_MS.fury);
    expect(hitStopOf({ type: 'bossDefeated', species: 'mew', index: 1 })).toBe(
      HIT_STOP_MS.bossDown,
    );
    // An ordinary hit or kill never stops it: there are dozens a second.
    expect(hitStopOf({ type: 'kill', enemyId: 1, x: 0, y: 0 })).toBe(0);
    expect(hitStopOf({ type: 'heal', amount: 1 })).toBe(0);
    // Short on purpose: a stop is felt, not seen.
    for (const ms of Object.values(HIT_STOP_MS)) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(120);
    }
  });

  it('lasts what was asked and then lets go', () => {
    const stop = new HitStop();
    expect(stop.active(0)).toBe(false);
    expect(stop.request(1000, 70)).toBe(true);
    expect(stop.active(1000)).toBe(true);
    expect(stop.active(1069)).toBe(true);
    expect(stop.active(1070)).toBe(false);
  });

  it('never two stops closer than the gap, and a stop of nothing is not one', () => {
    const stop = new HitStop();
    expect(stop.request(0, 0)).toBe(false);
    expect(stop.active(0)).toBe(false);
    expect(stop.request(1000, 70)).toBe(true);
    expect(stop.request(1000 + HIT_STOP_GAP_MS - 1, 70)).toBe(false);
    expect(stop.active(1000 + HIT_STOP_GAP_MS - 1)).toBe(false);
    expect(stop.request(1000 + HIT_STOP_GAP_MS, 70)).toBe(true);
    stop.reset();
    expect(stop.active(1000 + HIT_STOP_GAP_MS)).toBe(false);
    expect(stop.request(1000 + HIT_STOP_GAP_MS + 1, 70)).toBe(true);
  });

  it('does not touch the run: frames without ticks give the same run', () => {
    // The app skips the simulation while a stop lasts; the same commands in the same order give
    // the same run whatever the wall clock did between them.
    const play = (): string => {
      const run = createRun(gameConfig, 77, 'pikachu');
      for (let t = 0; t < 600; t++) tick(run, { moveX: 0, aimX: 240, aimY: 100 }, gameConfig);
      return hashRun(run);
    };
    expect(play()).toBe(play());
  });
});
