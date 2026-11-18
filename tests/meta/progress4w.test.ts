import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/app/bestRun';
import { loadTips, markTip, TIPS_KEY } from '../../src/app/settings';
import { gameConfig } from '../../src/data';
import {
  candiesBetween,
  levelUpCost,
  MAX_PERMANENT_LEVEL,
  nextGoal,
  permanentLadder,
  startLevelOf,
} from '../../src/meta';
import {
  candyHowLine,
  firstCandiesTip,
  goalLine,
  nextLevelLine,
  startNowLine,
} from '../../src/ui/collectionText';

/** 4W, block 4 (18th playtest: "no entiendo subir de nivel"): the permanent level, explained. */
describe('the ladder of the permanent level', () => {
  it('has ten steps; each says where the runs start and in which form', () => {
    const ladder = permanentLadder(gameConfig, 'charmander');
    expect(ladder).toHaveLength(MAX_PERMANENT_LEVEL);
    expect(ladder.map((s) => s.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const step of ladder) {
      expect(step.startLevel).toBe(startLevelOf(gameConfig, 'charmander', step.level));
    }
    expect(ladder[0]?.form).toBe('charmander');
    // Charmander evolves at 3: a start at Nv 3 or more is a Charmeleon, never a Charizard.
    expect(ladder.every((s) => s.form !== 'charizard')).toBe(true);
    expect(ladder.some((s) => s.form === 'charmeleon')).toBe(true);
  });

  it('marks as milestones exactly the levels that make it start stronger', () => {
    for (const species of ['charmander', 'bagon', 'caterpie', 'pikachu']) {
      const ladder = permanentLadder(gameConfig, species);
      ladder.forEach((step, i) => {
        const before = ladder[i - 1];
        expect(step.milestone, `${species} ${step.level}`).toBe(
          before !== undefined && step.startLevel > before.startLevel,
        );
      });
    }
  });

  it('candies between two levels add the cost of each step', () => {
    expect(candiesBetween(1, 4)).toBe(levelUpCost(1) + levelUpCost(2) + levelUpCost(3));
    expect(candiesBetween(4, 4)).toBe(0);
    expect(candiesBetween(5, 3)).toBe(0);
  });

  it('the next goal is the next milestone, with the candies still missing', () => {
    const goal = nextGoal(gameConfig, 'charmander', 1, 5);
    const first = permanentLadder(gameConfig, 'charmander').find((s) => s.milestone);
    expect(goal?.level).toBe(first?.level);
    expect(goal?.missing).toBe(candiesBetween(1, first?.level ?? 1) - 5);
    // With candies to spare, nothing is missing.
    expect(nextGoal(gameConfig, 'charmander', 1, 999)?.missing).toBe(0);
    // At the top, there is no goal left.
    expect(nextGoal(gameConfig, 'charmander', MAX_PERMANENT_LEVEL, 0)).toBeNull();
  });
});

describe('the words of the permanent level', () => {
  it('say where it starts, what is next and what is missing', () => {
    expect(startNowLine(2, 'charmeleon')).toBe(
      'Ahora empieza las partidas en Nv 2, como Charmeleon.',
    );
    expect(goalLine({ level: 4, startLevel: 2, form: 'charmeleon', missing: 7 })).toContain(
      'Te faltan 7 caramelos',
    );
    expect(goalLine({ level: 4, startLevel: 2, form: 'charmeleon', missing: 0 })).toContain(
      '¡Ya tienes los caramelos!',
    );
    expect(goalLine(null)).toContain('mejor nivel inicial');
    expect(nextLevelLine(2, 1, 6)).toBe(
      'Subir a nivel 3 cuesta 6 caramelos: tienes 1, te faltan 5.',
    );
    expect(nextLevelLine(2, 9, 6)).toContain('ya los tienes');
    expect(nextLevelLine(10, 0, Number.POSITIVE_INFINITY)).toBe('Nivel permanente máximo.');
    expect(
      candyHowLine(
        { perRun: 2, perBoss: 1, repeat: { 3: 1, 4: 3, 5: 10, 6: 20 }, caught: 5 },
        'bagon',
      ),
    ).toContain('juega con Bagon (+2 por partida, +1 por jefe)');
    expect(firstCandiesTip('bagon')).toContain('Bagon');
  });
});

describe('first-time notices', () => {
  const memory = (): KeyValueStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        data.set(k, v);
      },
    };
  };

  it('each one shows once, and they are remembered apart', () => {
    const store = memory();
    expect(markTip(store, 'collection')).toBe(true);
    expect(markTip(store, 'collection')).toBe(false);
    expect(markTip(store, 'candies')).toBe(true);
    expect([...loadTips(store)].sort()).toEqual(['candies', 'collection']);
    expect(store.data.get(TIPS_KEY)).toBe('candies,collection');
  });

  it('a missing or broken storage shows the notice (harmless) and never throws', () => {
    expect(markTip(null, 'collection')).toBe(true);
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(markTip(broken, 'collection')).toBe(true);
    const junk = memory();
    junk.data.set(TIPS_KEY, 'ok,<script>,,collection');
    expect([...loadTips(junk)].sort()).toEqual(['collection', 'ok']);
  });
});
