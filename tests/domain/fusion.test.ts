import { describe, expect, it } from 'vitest';
import { type Ball, createRng, type FuseResult, fuse, nextInt } from '../../src/domain';
import { deepFreeze, makeBall } from './fixtures';

const fire = (o: Partial<Ball> = {}) =>
  makeBall({
    id: 1,
    species: 'charmander',
    type: 'fire',
    effects: [{ kind: 'burn', strength: 2 }],
    ...o,
  });
const water = (o: Partial<Ball> = {}) =>
  makeBall({
    id: 2,
    species: 'squirtle',
    type: 'water',
    effects: [{ kind: 'pierce', strength: 1 }],
    ...o,
  });
const grass = (o: Partial<Ball> = {}) =>
  makeBall({
    id: 3,
    species: 'bulbasaur',
    type: 'grass',
    effects: [{ kind: 'drain', strength: 1 }],
    ...o,
  });

function okBall(result: FuseResult): Ball {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.ball;
}

describe('fuse F1 (level up: same species, same level)', () => {
  it('raises the level by one and keeps species, type and effects', () => {
    const merged = okBall(fuse(fire({ id: 1 }), fire({ id: 9 })));
    expect(merged).toMatchObject({
      id: 1,
      species: 'charmander',
      type: 'fire',
      level: 2,
      hybrid: false,
    });
    expect(merged.effects).toEqual([{ kind: 'burn', strength: 2 }]);
  });

  it('reaches level 3 from two level 2 balls', () => {
    expect(okBall(fuse(fire({ level: 2 }), fire({ id: 9, level: 2 }))).level).toBe(3);
  });

  it('refuses to go beyond level 3', () => {
    expect(fuse(fire({ level: 3 }), fire({ id: 9, level: 3 }))).toEqual({
      ok: false,
      error: 'max-level',
    });
  });

  it('refuses different levels of the same species', () => {
    expect(fuse(fire({ level: 1 }), fire({ id: 9, level: 2 }))).toEqual({
      ok: false,
      error: 'level-mismatch',
    });
  });
});

describe('fuse F2 (hybrid: different types, both level >= 2)', () => {
  it('keeps the first ingredient and adds the second at half strength', () => {
    const merged = okBall(fuse(fire({ level: 2 }), water({ level: 2 })));
    expect(merged).toMatchObject({
      id: 1,
      species: 'charmander',
      type: 'fire',
      level: 2,
      hybrid: true,
    });
    expect(merged.effects).toEqual([
      { kind: 'burn', strength: 2 },
      { kind: 'pierce', strength: 0.5 },
    ]);
  });

  it('takes the lower level of the two', () => {
    expect(okBall(fuse(fire({ level: 3 }), water({ level: 2 }))).level).toBe(2);
    expect(okBall(fuse(fire({ level: 2 }), water({ level: 3 }))).level).toBe(2);
  });

  it('depends on the order of the ingredients', () => {
    const ab = okBall(fuse(fire({ level: 2 }), water({ level: 2 })));
    const ba = okBall(fuse(water({ level: 2 }), fire({ level: 2 })));
    expect(ab.type).toBe('fire');
    expect(ba.type).toBe('water');
    expect(ba.effects).toEqual([
      { kind: 'pierce', strength: 1 },
      { kind: 'burn', strength: 1 },
    ]);
  });

  it('adds strengths when both ingredients share an effect kind', () => {
    const a = fire({ level: 2 });
    const b = water({ level: 2, effects: [{ kind: 'burn', strength: 4 }] });
    expect(okBall(fuse(a, b)).effects).toEqual([{ kind: 'burn', strength: 4 }]);
  });

  it('requires both balls to be at least level 2', () => {
    expect(fuse(fire({ level: 1 }), water({ level: 2 }))).toEqual({
      ok: false,
      error: 'level-too-low',
    });
    expect(fuse(fire({ level: 2 }), water({ level: 1 }))).toEqual({
      ok: false,
      error: 'level-too-low',
    });
  });

  it('refuses the same type with a different species', () => {
    const other = fire({ id: 9, species: 'vulpix', level: 2 });
    expect(fuse(fire({ level: 2 }), other)).toEqual({
      ok: false,
      error: 'same-type-different-species',
    });
  });
});

describe('fuse limits', () => {
  it('never fuses a hybrid again, in either position', () => {
    const hybrid = okBall(fuse(fire({ level: 2 }), water({ level: 2 })));
    expect(hybrid.hybrid).toBe(true);
    expect(fuse(hybrid, grass({ level: 2 }))).toEqual({ ok: false, error: 'hybrid-input' });
    expect(fuse(grass({ level: 2 }), hybrid)).toEqual({ ok: false, error: 'hybrid-input' });
    expect(fuse(hybrid, { ...hybrid, id: 9 })).toEqual({ ok: false, error: 'hybrid-input' });
  });

  it('refuses to fuse a ball with itself', () => {
    expect(fuse(fire({ level: 2 }), fire({ level: 2 }))).toEqual({ ok: false, error: 'same-ball' });
  });
});

describe('fuse purity', () => {
  it('does not mutate its inputs (frozen inputs would throw) nor alias their effects', () => {
    const a = deepFreeze(fire({ level: 2 }));
    const b = deepFreeze(water({ level: 2 }));
    const snapshot = JSON.stringify([a, b]);
    const merged = okBall(fuse(a, b));
    expect(JSON.stringify([a, b])).toBe(snapshot);
    expect(merged.effects).not.toBe(a.effects);
    expect(merged.effects).not.toBe(b.effects);
  });

  it('holds on 1000 random pairs: inputs untouched, same output twice, invariants respected', () => {
    const rng = createRng(777);
    const makers = [fire, water, grass];
    for (let i = 0; i < 1000; i++) {
      const mk = (id: number): Ball => {
        const base = makers[nextInt(rng, makers.length)]?.({ id, level: 1 + nextInt(rng, 3) });
        if (base === undefined) throw new Error('unreachable');
        return deepFreeze(base);
      };
      const a = mk(1);
      const b = mk(nextInt(rng, 2) === 0 ? 1 : 2);
      const before = JSON.stringify([a, b]);

      const first = fuse(a, b);
      const second = fuse(a, b);

      expect(JSON.stringify([a, b])).toBe(before);
      expect(second).toEqual(first);
      if (first.ok) {
        expect(first.ball.level).toBeGreaterThanOrEqual(1);
        expect(first.ball.level).toBeLessThanOrEqual(3);
        expect(first.ball.effects.length).toBeGreaterThan(0);
        expect(first.ball.level).toBeLessThanOrEqual(Math.max(a.level + 1, b.level));
      }
    }
  });
});
