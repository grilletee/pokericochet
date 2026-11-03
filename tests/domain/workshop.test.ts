import { describe, expect, it } from 'vitest';
import {
  type Ball,
  type Command,
  cloneRun,
  createRun,
  fuse,
  hashRun,
  previewFusion,
  type Run,
  tick,
} from '../../src/domain';
import { deepFreeze, makeBall, makeEnemy, quietConfig } from './fixtures';

const fuseCmd = (a: number, b: number): Command => ({ moveX: 0, action: { type: 'fuse', a, b } });

function runWith(balls: Ball[], tokens = 1): Run {
  const run = createRun(quietConfig, 1, 'charmander');
  run.loadout = balls;
  run.cooldowns = balls.map(() => 0);
  run.nextBallId = 100;
  run.tokens = tokens;
  run.phase = 'workshop'; // fusing happens with the workshop open (ADR-016)
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

describe('workshop: opening and closing (the run pauses)', () => {
  const open: Command = { moveX: 0, action: { type: 'workshop', open: true } };
  const close: Command = { moveX: 0, action: { type: 'workshop', open: false } };

  function playingRun(): Run {
    const run = runWith([fire(1), fire(2)]);
    run.phase = 'playing';
    run.enemies = [makeEnemy({ id: 1, y: 100, speed: 1 })];
    return run;
  }

  it('opening moves nothing and pauses: no time passes while it is open', () => {
    const run = playingRun();
    tick(run, open, quietConfig);
    expect(run.phase).toBe('workshop');
    expect(run.tickCount).toBe(0);
    const before = hashRun(run);
    for (let i = 0; i < 100; i++) tick(run, { moveX: 1 }, quietConfig);
    expect(hashRun(run)).toBe(before);
    expect(run.enemies[0]?.y).toBe(100);
    expect(run.player.x).toBe(quietConfig.arena.width / 2);
  });

  it('closing resumes play from exactly where it stopped', () => {
    const run = playingRun();
    for (let i = 0; i < 10; i++) tick(run, { moveX: 0 }, quietConfig);
    const y = run.enemies[0]?.y ?? 0;
    tick(run, open, quietConfig);
    tick(run, close, quietConfig);
    expect(run.phase).toBe('playing');
    expect(run.enemies[0]?.y).toBe(y);
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.enemies[0]?.y).toBe(y + 1);
  });

  it('opening and closing the workshop with no fusion leaves the run as if it never happened, apart from the phase', () => {
    const a = playingRun();
    const b = playingRun();
    tick(b, open, quietConfig);
    tick(b, { moveX: 1 }, quietConfig); // ignored while paused
    tick(b, close, quietConfig);
    for (const run of [a, b]) for (let i = 0; i < 50; i++) tick(run, { moveX: 1 }, quietConfig);
    expect(hashRun(a)).toBe(hashRun(b));
  });

  it('the workshop stays open after a fusion, so several can be done in a row', () => {
    const run = runWith([fire(1), fire(2), water(3), water(4)], 2);
    tick(run, fuseCmd(0, 1), quietConfig);
    expect(run.phase).toBe('workshop');
    tick(run, fuseCmd(1, 2), quietConfig);
    expect(run.loadout.map((b) => b.level)).toEqual([2, 2]);
    expect(run.tokens).toBe(0);
  });

  it('fusing while playing does nothing, and the workshop cannot be opened from other phases', () => {
    const run = playingRun();
    tick(run, fuseCmd(0, 1), quietConfig);
    expect(run.loadout).toHaveLength(2);
    expect(run.tokens).toBe(1);
    for (const phase of ['levelup', 'won', 'lost'] as const) {
      const other = playingRun();
      other.phase = phase;
      tick(other, open, quietConfig);
      expect(other.phase).toBe(phase);
    }
  });

  it('a pick is ignored while the workshop is open', () => {
    const run = playingRun();
    tick(run, open, quietConfig);
    run.offers = [{ kind: 'token' }];
    tick(run, { moveX: 0, action: { type: 'pick', index: 0 } }, quietConfig);
    expect(run.tokens).toBe(1);
    expect(run.offers).toHaveLength(1);
  });
});

describe('workshop: fuse command', () => {
  it('F1: fuses two equal balls into the next level, spending one token', () => {
    const run = runWith([fire(1), fire(2), water(3)], 2);
    const out = tick(run, fuseCmd(0, 1), quietConfig);
    expect(run.loadout.map((b) => [b.id, b.level])).toEqual([
      [1, 2],
      [3, 1],
    ]);
    expect(run.tokens).toBe(1);
    expect(out.events).toContainEqual({ type: 'fuse', ballId: 1, level: 2, hybrid: false });
    expect(run.cooldowns).toHaveLength(2);
  });

  it('F2: a hybrid takes the first ingredient and half the effect of the second; order matters', () => {
    const forward = runWith([fire(1, 2), water(2, 2)]);
    tick(forward, fuseCmd(0, 1), quietConfig);
    const reverse = runWith([fire(1, 2), water(2, 2)]);
    tick(reverse, fuseCmd(1, 0), quietConfig);
    const f = forward.loadout[0];
    const r = reverse.loadout[0];
    expect(f?.type).toBe('fire');
    expect(f?.hybrid).toBe(true);
    expect(f?.effects).toEqual([
      { kind: 'burn', strength: 2 },
      { kind: 'pierce', strength: 0.5 },
    ]);
    expect(r?.type).toBe('water');
    expect(r?.id).toBe(2);
  });

  it('a slot above the removed one shifts down, and bodies follow their slots', () => {
    const run = runWith([fire(1), water(2), fire(3), water(4)]);
    run.cooldowns = [0, 0, -1, -1];
    run.bodies = [
      { slot: 2, x: 100, y: 300, vx: 0, vy: -1, pierce: 0, skipId: 0 },
      { slot: 3, x: 200, y: 300, vx: 0, vy: -1, pierce: 0, skipId: 0 },
    ];
    tick(run, fuseCmd(0, 2), quietConfig); // slot 2 is consumed
    expect(run.loadout.map((b) => b.id)).toEqual([1, 2, 4]);
    expect(run.loadout[0]?.level).toBe(2);
    // The body of slot 2 is gone with its ball; the body of slot 3 is now slot 2.
    expect(run.bodies.map((b) => b.slot)).toEqual([2]);
    expect(run.bodies[0]?.x).toBeCloseTo(200, 0);
    expect(run.cooldowns).toEqual([0, 0, -1]);
  });

  it('the kept ball may come after the removed one, and the result waits the longer cooldown', () => {
    const run = runWith([water(1), fire(2), fire(3)]);
    run.cooldowns = [0, -1, 5];
    run.bodies = [{ slot: 1, x: 50, y: 300, vx: 0, vy: -1, pierce: 0, skipId: 0 }];
    tick(run, fuseCmd(2, 1), quietConfig); // a = slot 2 (kept), b = slot 1 (removed)
    expect(run.loadout.map((b) => b.id)).toEqual([1, 3]);
    expect(run.loadout[1]?.level).toBe(2);
    expect(run.bodies).toHaveLength(0);
    expect(run.cooldowns[1]).toBe(5);
  });

  it('the body of the kept ball leaves the arena too, and the result waits the longer cooldown of the two', () => {
    const run = runWith([fire(1), fire(2)]);
    run.cooldowns = [-1, 9];
    run.bodies = [{ slot: 0, x: 100, y: 300, vx: 0, vy: -1, pierce: 0, skipId: 0 }];
    tick(run, fuseCmd(0, 1), quietConfig);
    expect(run.bodies).toHaveLength(0);
    expect(run.cooldowns).toEqual([9]);
  });

  it('a refused fusion costs nothing and says why', () => {
    const cases: Array<[Ball[], number, number, string, number]> = [
      [[fire(1), fire(2, 2)], 0, 1, 'level-mismatch', 1],
      [[fire(1), water(2)], 0, 1, 'level-too-low', 1],
      [[fire(1), fire(2)], 0, 0, 'same-ball', 1],
      [[fire(1), fire(2)], 0, 5, 'bad-slot', 1],
      [[fire(1), fire(2)], 0, 1, 'no-token', 0],
    ];
    for (const [balls, a, b, error, tokens] of cases) {
      const run = runWith(balls, tokens);
      const out = tick(run, fuseCmd(a, b), quietConfig);
      expect(out.events).toContainEqual({ type: 'fuseFailed', error });
      expect(run.loadout).toEqual(balls);
      expect(run.tokens).toBe(tokens);
    }
  });

  it('rule errors win over the missing token, so the player learns the real reason', () => {
    const run = runWith([fire(1), fire(2, 2)], 0);
    expect(previewFusion(run, 0, 1)).toEqual({ ok: false, error: 'level-mismatch' });
  });

  it('with no token a valid fusion still shows what it would give', () => {
    const run = runWith([fire(1), fire(2)], 0);
    const p = previewFusion(run, 0, 1);
    expect(p.ok).toBe(false);
    expect(p.ok === false && p.error).toBe('no-token');
    expect(p.ok === false && p.ball?.level).toBe(2);
  });

  it('a hybrid cannot be fused again', () => {
    const run = runWith([fire(1, 2), water(2, 2), fire(3, 2)]);
    tick(run, fuseCmd(0, 1), quietConfig);
    run.tokens = 1;
    const out = tick(run, fuseCmd(0, 1), quietConfig);
    expect(out.events).toContainEqual({ type: 'fuseFailed', error: 'hybrid-input' });
  });

  it('previewFusion changes nothing and matches what the command does', () => {
    const run = runWith([fire(1, 2), water(2, 2)]);
    deepFreeze(run.loadout);
    const before = hashRun(run);
    const p = previewFusion(run, 0, 1);
    expect(hashRun(run)).toBe(before);
    const direct = fuse(fire(1, 2), water(2, 2));
    expect(p.ok && direct.ok && p.ball).toEqual(direct.ok && direct.ball);
    const live = runWith([fire(1, 2), water(2, 2)]);
    tick(live, fuseCmd(0, 1), quietConfig);
    expect(live.loadout[0]).toEqual(p.ok ? p.ball : null);
  });

  it('fusing is ignored while the run waits for a card', () => {
    const run = runWith([fire(1), fire(2)]);
    run.phase = 'levelup';
    run.offers = [{ kind: 'token' }];
    tick(run, fuseCmd(0, 1), quietConfig);
    expect(run.loadout).toHaveLength(2);
    expect(run.tokens).toBe(1);
  });

  it('is deterministic and clone-safe: same commands, same hash', () => {
    const a = runWith([fire(1), fire(2), water(3)], 2);
    const b = cloneRun(a);
    for (const run of [a, b]) {
      tick(run, fuseCmd(0, 1), quietConfig);
      tick(run, { moveX: 0, action: { type: 'workshop', open: false } }, quietConfig);
      for (let i = 0; i < 30; i++) tick(run, { moveX: 1 }, quietConfig);
    }
    expect(hashRun(a)).toBe(hashRun(b));
  });
});
