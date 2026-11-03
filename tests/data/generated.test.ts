import { describe, expect, it } from 'vitest';
import {
  BALL_SPECIES,
  BOSS_SPECIES,
  ENEMY_SPECIES,
  gameConfig,
  STARTER_SPECIES,
} from '../../src/data';
import generated from '../../src/data/generated/species.json';
import roster from '../../tools/fetch-data/roster.json';

describe('generated species data (tools/fetch-data)', () => {
  it('is what the roster asks for: every role filled, in the roster order', () => {
    expect(BALL_SPECIES.map((s) => s.id)).toEqual(roster.balls);
    expect(ENEMY_SPECIES.map((s) => s.id)).toEqual(roster.enemies);
    expect(BOSS_SPECIES.id).toBe(roster.boss);
    expect([...STARTER_SPECIES]).toEqual(roster.starters);
    expect(generated.roster).toEqual(roster);
  });

  it('has two ball species per type, one boss, and starters that are balls of four different types', () => {
    for (const type of ['fire', 'water', 'grass', 'electric']) {
      expect(BALL_SPECIES.filter((s) => s.type === type)).toHaveLength(2);
    }
    const starterTypes = STARTER_SPECIES.map((id) => gameConfig.species[id]?.type);
    expect(new Set(starterTypes).size).toBe(4);
  });

  it('keeps sane base stats: positive, within the range the stat mapping expects', () => {
    const { speedStatMin, speedStatMax } = gameConfig.stats;
    for (const s of Object.values(gameConfig.species)) {
      expect(s.baseStats.hp).toBeGreaterThan(0);
      expect(s.baseStats.attack).toBeGreaterThan(0);
      expect(s.baseStats.speed).toBeGreaterThanOrEqual(speedStatMin - 15);
      expect(s.baseStats.speed).toBeLessThanOrEqual(speedStatMax + 15);
    }
  });

  it('has no timestamps and a pokedex number for every species (so a rerun gives the same bytes)', () => {
    expect(JSON.stringify(generated)).not.toMatch(/20\d\d-\d\d-\d\d/);
    for (const s of generated.species) expect(s.pokedexId).toBeGreaterThan(0);
  });
});
