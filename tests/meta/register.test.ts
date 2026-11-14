import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { createRun, type RunSummary, summarizeRun } from '../../src/domain';
import { emptyProfile, REPEAT_CANDIES, registerable, registerCapture } from '../../src/meta';

/** 4G-I, block 10 (Phase 5): keep ONE capture of a run that beat a boss. */
const base = summarizeRun(createRun(gameConfig, 1, 'pikachu'), gameConfig);
const summary = (over: Partial<RunSummary>): RunSummary => ({ ...base, ...over });
const captured = [
  { species: 'zubat', level: 2 },
  { species: 'geodude', level: 1 },
  { species: 'zubat', level: 3 },
];

describe('registering a capture', () => {
  it('needs at least one boss defeated, and offers each capture once', () => {
    expect(registerable(summary({ bossesDefeated: 0, captured }))).toEqual([]);
    expect(registerable(summary({ bossesDefeated: 1, captured }))).toEqual(['zubat', 'geodude']);
    expect(registerable(summary({ bossesDefeated: 4, captured: [] }))).toEqual([]);
  });

  it('a new one joins the collection; one you have gives candies; one not offered, nothing', () => {
    const offered = ['zubat', 'geodude'];
    const p = emptyProfile(1);
    const first = registerCapture(p, offered, 'zubat');
    expect(first.isNew).toBe(true);
    expect(first.profile.owned.zubat).toEqual({ level: 1 });
    expect(first.profile.seen).toContain('zubat');
    const again = registerCapture(first.profile, offered, 'zubat');
    expect(again.isNew).toBe(false);
    expect(again.profile.candies.zubat).toBe(REPEAT_CANDIES);
    const cheat = registerCapture(p, offered, 'mewtwo');
    expect(cheat.profile).toBe(p);
  });
});
