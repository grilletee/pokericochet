import { describe, expect, it } from 'vitest';
import {
  gameConfig,
  gameLevel,
  lineStageLevels,
  PACE,
  PSEUDO_LINES,
  STARTER_LINES,
} from '../../src/data';
import { formAt, stageForLevel, stageLevelsOf } from '../../src/domain';
import { MAX_PERMANENT_LEVEL, startLevelOf } from '../../src/meta';

/**
 * 4W, block 1 (18th playtest: "Cogí a Bagon de inicial y al principio de la oleada 2 ya tenía
 * Salamence"): each line evolves at the pace of the games, scaled to the levels 1-8 of a run.
 */
const lvl = (level: number) => ({ level, trigger: 'level-up' });
const item = { level: null, trigger: 'use-item' };
const trade = { level: null, trigger: 'trade' };
const lines = Object.keys(gameConfig.lines ?? {});

describe('the rule of the pace', () => {
  it('a level of the games becomes 1 + level / 7, rounded', () => {
    expect(gameLevel(16)).toBe(3);
    expect(gameLevel(36)).toBe(6);
    expect(gameLevel(30)).toBe(5);
    expect(gameLevel(50)).toBe(8);
    expect(gameLevel(7)).toBe(2);
  });

  it('the real cases: Charmander keeps 3/6, Bagon waits until 5/8, Caterpie is quick', () => {
    expect(lineStageLevels([lvl(16), lvl(36)])).toEqual([3, 6]);
    expect(lineStageLevels([lvl(30), lvl(50)], true)).toEqual([5, 8]);
    expect(lineStageLevels([lvl(7), lvl(10)])).toEqual([2, 3]);
    // A line of one form has no pace of its own.
    expect(lineStageLevels([])).toBeNull();
  });

  it('without a level: a stone at 4; a trade or a stone after a level, two levels later', () => {
    expect(lineStageLevels([item])).toEqual([4, 4 + PACE.peakGap]);
    expect(lineStageLevels([lvl(16), trade])).toEqual([3, 5]);
    expect(lineStageLevels([lvl(28), trade])).toEqual([5, 7]);
  });

  it('never out of range: stage 2 in 2..6, stage 3 after it and at most 8', () => {
    expect(lineStageLevels([lvl(1), lvl(1)])).toEqual([2, 3]);
    expect(lineStageLevels([lvl(100), lvl(100)])).toEqual([6, 8]);
    expect(lineStageLevels([lvl(100)])).toEqual([6, 8]);
  });
});

describe('the pace of every line of the roster', () => {
  it('every line has two thresholds in range, the second after the first', () => {
    for (const base of lines) {
      const [two, three] = stageLevelsOf(gameConfig, base);
      expect(two, base).toBeGreaterThanOrEqual(PACE.firstMin);
      expect(two, base).toBeLessThanOrEqual(PACE.firstMax);
      expect(three, base).toBeGreaterThan(two ?? 0);
      expect(three, base).toBeLessThanOrEqual(gameConfig.team.maxLevel);
    }
  });

  it('the pseudo-legendaries evolve clearly later: stage 2 at 5 or later, the final form at 8', () => {
    for (const base of PSEUDO_LINES) {
      const [two, three] = stageLevelsOf(gameConfig, base);
      expect(two, base).toBeGreaterThanOrEqual(PACE.pseudoFirstMin);
      expect(three, base).toBe(gameConfig.team.maxLevel);
    }
    // Later than every starter of the nine regions.
    const startersLast = Math.max(
      ...STARTER_LINES.map((s) => stageLevelsOf(gameConfig, s)[1] ?? 0),
    );
    const startersFirst = Math.max(
      ...STARTER_LINES.map((s) => stageLevelsOf(gameConfig, s)[0] ?? 0),
    );
    for (const base of PSEUDO_LINES) {
      expect(stageLevelsOf(gameConfig, base)[0] ?? 0, base).toBeGreaterThan(startersFirst - 1);
      expect(stageLevelsOf(gameConfig, base)[1] ?? 0, base).toBeGreaterThanOrEqual(startersLast);
    }
    expect(stageLevelsOf(gameConfig, 'bagon')).toEqual([5, 8]);
    expect(stageLevelsOf(gameConfig, 'charmander')).toEqual([3, 6]);
  });

  it('the form follows the level at every level of every line (the form-level invariant)', () => {
    for (const base of lines) {
      let previous = 1;
      for (let level = 1; level <= gameConfig.team.maxLevel; level++) {
        const stage = stageForLevel(gameConfig, level, base);
        // The stage never goes back and never jumps two at once from one level to the next.
        expect(stage, `${base} Nv${level}`).toBeGreaterThanOrEqual(previous);
        expect(stage - previous, `${base} Nv${level}`).toBeLessThanOrEqual(1);
        previous = stage;
        expect(formAt(gameConfig, base, stage)).toBeDefined();
      }
      // At the maximum level every line is at its last stage.
      expect(stageForLevel(gameConfig, gameConfig.team.maxLevel, base), base).toBe(3);
    }
  });
});

describe('the start level given by candies keeps the pace', () => {
  it('a starter never begins a run in its final form, whatever its permanent level', () => {
    for (const base of lines) {
      for (let permanent = 1; permanent <= MAX_PERMANENT_LEVEL; permanent++) {
        const start = startLevelOf(gameConfig, base, permanent);
        expect(start).toBeGreaterThanOrEqual(1);
        expect(stageForLevel(gameConfig, start, base), `${base} ${permanent}`).toBeLessThan(3);
      }
    }
  });

  it('a Bagon of the top permanent level still starts before Salamence; a Charmander as Charmeleon', () => {
    expect(
      formAt(
        gameConfig,
        'bagon',
        stageForLevel(gameConfig, startLevelOf(gameConfig, 'bagon', MAX_PERMANENT_LEVEL), 'bagon'),
      ),
    ).not.toBe('salamence');
    expect(startLevelOf(gameConfig, 'charmander', MAX_PERMANENT_LEVEL)).toBe(4);
    // Low permanent levels are as before.
    expect(startLevelOf(gameConfig, 'bagon', 1)).toBe(1);
  });
});
