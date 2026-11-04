import { describe, expect, it } from 'vitest';
import {
  ART_SPECIES_IDS,
  BALL_SPECIES,
  BOSS_SPECIES,
  ENEMY_SPECIES,
  EVOLUTION_LINES,
  gameConfig,
  MOVE_INFO,
  MOVE_NAMES,
  MOVES_BY_BASE,
  POKEMON_NAMES,
  STARTER_SPECIES,
} from '../../src/data';
import generated from '../../src/data/generated/species.json';
import { formAt, stageKind } from '../../src/domain';
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

  it('keeps the six real base stats of every species: positive numbers (ADR-038)', () => {
    for (const s of Object.values(gameConfig.species)) {
      for (const [stat, value] of Object.entries(s.baseStats)) {
        // mapStat clamps, so an extreme species is fine; it only has to be a real stat.
        expect(value, `${s.id} ${stat}`).toBeGreaterThan(0);
      }
      expect(Object.keys(s.baseStats).sort()).toEqual(
        ['attack', 'defense', 'hp', 'specialAttack', 'specialDefense', 'speed'].sort(),
      );
    }
  });

  it('has the real stats of the games: Charizard is not Charmander', () => {
    const charizard = gameConfig.species.charizard?.baseStats;
    expect(charizard).toEqual({
      hp: 78,
      attack: 84,
      defense: 78,
      specialAttack: 109,
      specialDefense: 85,
      speed: 100,
    });
  });

  it('names every species in Spanish from PokéAPI, once (ADR-036)', () => {
    for (const id of ART_SPECIES_IDS) {
      expect(POKEMON_NAMES[id], id).toBeTruthy();
    }
    expect(Object.keys(POKEMON_NAMES).sort()).toEqual([...ART_SPECIES_IDS].sort());
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

  it('shows the base species at stage 1, the first form at 2 and the last one at 3', () => {
    expect(formAt(gameConfig, 'charmander', 1)).toBe('charmander');
    expect(formAt(gameConfig, 'charmander', 2)).toBe('charmeleon');
    expect(formAt(gameConfig, 'charmander', 3)).toBe('charizard');
  });

  it('keeps the only form of a short line at stage 3, and knows nothing else', () => {
    expect(formAt(gameConfig, 'vulpix', 2)).toBe('ninetales');
    expect(formAt(gameConfig, 'vulpix', 3)).toBe('ninetales');
    expect(formAt(gameConfig, 'gyarados', 3)).toBe('gyarados');
    expect(formAt(gameConfig, 'missingno', 2)).toBe('missingno');
  });

  it('never announces an evolution into the same form (the "Exeggutor evolves into Exeggutor" bug)', () => {
    for (const base of Object.keys(EVOLUTION_LINES)) {
      for (const stage of [2, 3]) {
        const kind = stageKind(gameConfig, base, stage);
        const changed = formAt(gameConfig, base, stage) !== formAt(gameConfig, base, stage - 1);
        expect(kind === 'evolve', `${base} stage ${stage}`).toBe(changed);
      }
    }
    expect([2, 3].map((s) => stageKind(gameConfig, 'exeggcute', s))).toEqual(['evolve', 'peak']);
    expect([2, 3].map((s) => stageKind(gameConfig, 'charmander', s))).toEqual(['evolve', 'evolve']);
  });

  it('lists each species once, so every art code is unique', () => {
    expect(new Set(ART_SPECIES_IDS).size).toBe(ART_SPECIES_IDS.length);
  });
});

describe('moves (ADR-039)', () => {
  const bases = [...BALL_SPECIES, ...ENEMY_SPECIES];

  it('gives every ball and enemy line a move at each of the three stages, with a name', () => {
    expect(Object.keys(MOVES_BY_BASE).sort()).toEqual(bases.map((s) => s.id).sort());
    for (const base of bases) {
      const moves = MOVES_BY_BASE[base.id] ?? [];
      expect(moves, base.id).toHaveLength(3);
      for (const move of moves) expect(MOVE_NAMES[move], `${base.id} ${move}`).toBeTruthy();
    }
  });

  it('only uses damaging moves of the type of the species, stronger at each stage', () => {
    for (const base of bases) {
      const powers = (MOVES_BY_BASE[base.id] ?? []).map((move) => {
        const info = MOVE_INFO[move];
        expect(info?.type, `${base.id} ${move}`).toBe(base.type);
        return info?.power ?? 0;
      });
      expect(powers[0], base.id).toBeGreaterThan(0);
      expect(powers[1] ?? 0, base.id).toBeGreaterThan(powers[0] ?? 0);
      expect(powers[2] ?? 0, base.id).toBeGreaterThan(powers[1] ?? 0);
    }
  });

  it('gives the four starters their signature moves, in Spanish', () => {
    const named = (id: string) => (MOVES_BY_BASE[id] ?? []).map((move) => MOVE_NAMES[move]);
    expect(named('charmander')).toEqual(['Ascuas', 'Lanzallamas', 'Llamarada']);
    expect(named('squirtle')).toEqual(['Pistola Agua', 'Surf', 'Hidrobomba']);
    expect(named('bulbasaur')).toEqual(['Látigo Cepa', 'Hoja Afilada', 'Rayo Solar']);
    expect(named('pikachu')).toEqual(['Impactrueno', 'Rayo', 'Trueno']);
  });

  it('has a hand-made shape for every starter, so its signature is not just the tier', () => {
    for (const starter of STARTER_SPECIES) {
      const shapes = gameConfig.moves.signatures[starter] ?? [];
      expect(
        shapes.some((shape) => shape !== null),
        starter,
      ).toBe(true);
    }
  });
});
