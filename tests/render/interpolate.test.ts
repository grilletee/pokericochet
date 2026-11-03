import { describe, expect, it } from 'vitest';
import { createSnapshot, type Snapshot } from '../../src/domain';
import { interpolateBalls, interpolateEnemies } from '../../src/render/interpolate';

function snapWithEnemies(list: Array<[id: number, x: number, y: number]>): Snapshot {
  const s = createSnapshot(4, 8);
  s.enemyCount = list.length;
  list.forEach(([id, x, y], i) => {
    s.enemyId[i] = id;
    s.enemyX[i] = x;
    s.enemyY[i] = y;
  });
  return s;
}

describe('interpolateEnemies', () => {
  it('blends enemies present in both snapshots, matched by id', () => {
    const prev = snapWithEnemies([
      [1, 0, 0],
      [2, 100, 100],
    ]);
    const curr = snapWithEnemies([
      [1, 10, 20],
      [2, 100, 120],
    ]);
    const x = new Float32Array(8);
    const y = new Float32Array(8);
    interpolateEnemies(prev, curr, 0.5, x, y);
    expect([x[0], y[0], x[1], y[1]]).toEqual([5, 10, 100, 110]);
  });

  it('handles an enemy that died, one that appeared and one that survived', () => {
    const prev = snapWithEnemies([
      [1, 0, 0],
      [2, 50, 50],
      [4, 80, 80],
    ]);
    const curr = snapWithEnemies([
      [2, 60, 60],
      [3, 7, 7],
      [4, 90, 90],
    ]);
    const x = new Float32Array(8);
    const y = new Float32Array(8);
    interpolateEnemies(prev, curr, 0.5, x, y);
    expect(x[0]).toBe(55); // id 2 blended, even though index 0 is a different enemy in prev
    expect(x[1]).toBe(7); // id 3 is new: not blended
    expect(x[2]).toBe(85); // id 4 blended
  });

  it('alpha 0 gives the previous state and alpha 1 the current one', () => {
    const prev = snapWithEnemies([[1, 0, 0]]);
    const curr = snapWithEnemies([[1, 10, 10]]);
    const x = new Float32Array(8);
    const y = new Float32Array(8);
    interpolateEnemies(prev, curr, 0, x, y);
    expect(x[0]).toBe(0);
    interpolateEnemies(prev, curr, 1, x, y);
    expect(x[0]).toBe(10);
  });
});

describe('interpolateBalls', () => {
  it('blends by slot, and shows a newly launched ball where it is', () => {
    const prev = createSnapshot(4, 4);
    const curr = createSnapshot(4, 4);
    prev.slotCount = curr.slotCount = 2;
    prev.ballActive[0] = 1;
    prev.ballX[0] = 0;
    prev.ballY[0] = 100;
    curr.ballActive[0] = 1;
    curr.ballX[0] = 10;
    curr.ballY[0] = 80;
    curr.ballActive[1] = 1; // launched this tick
    curr.ballX[1] = 33;
    curr.ballY[1] = 44;
    const x = new Float32Array(4);
    const y = new Float32Array(4);
    interpolateBalls(prev, curr, 0.5, x, y);
    expect([x[0], y[0]]).toEqual([5, 90]);
    expect([x[1], y[1]]).toEqual([33, 44]);
  });
});
