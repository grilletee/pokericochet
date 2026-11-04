import { describe, expect, it } from 'vitest';
import {
  ART_SPECIES_IDS,
  BALL_SPECIES,
  BOSS_SPECIES,
  ENEMY_SPECIES,
  EVOLUTION_LINES,
  formOf,
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

describe('evolution lines (ADR-024)', () => {
  it('give every ball and every wild species one or two forms with their own data', () => {
    const ids = new Set(ART_SPECIES_IDS);
    for (const base of [...BALL_SPECIES, ...ENEMY_SPECIES]) {
      const line = EVOLUTION_LINES[base.id] ?? [];
      expect(line.length, base.id).toBeGreaterThanOrEqual(1);
      expect(line.length, base.id).toBeLessThanOrEqual(2);
      for (const form of line) {
        expect(ids.has(form), form).toBe(true);
        // A form keeps the type of its line, so an evolved ball does not change type.
        const data = generated.species.find((sp) => sp.id === form);
        expect(data?.type, form).toBe(base.type);
      }
    }
  });

  it('shows the base species at level 1, the first form at 2 and the last one at 3', () => {
    expect(formOf('charmander', 1)).toBe('charmander');
    expect(formOf('charmander', 2)).toBe('charmeleon');
    expect(formOf('charmander', 3)).toBe('charizard');
  });

  it('keeps the only form of a short line at level 3, and knows nothing else', () => {
    expect(formOf('vulpix', 2)).toBe('ninetales');
    expect(formOf('vulpix', 3)).toBe('ninetales');
    expect(formOf('gyarados', 3)).toBe('gyarados');
    expect(formOf('missingno', 2)).toBe('missingno');
  });

  it('lists each species once, so every art code is unique', () => {
    expect(new Set(ART_SPECIES_IDS).size).toBe(ART_SPECIES_IDS.length);
  });
});
