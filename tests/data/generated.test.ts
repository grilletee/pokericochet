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
import { formAt, GAME_TYPES, stageKind, typesOfLine, typesOfSpecies } from '../../src/domain';
import roster from '../../tools/fetch-data/roster.json';

describe('generated species data (tools/fetch-data)', () => {
  it('is what the roster asks for: every role filled, in the roster order', () => {
    expect(BALL_SPECIES.map((s) => s.id)).toEqual(roster.balls);
    expect(ENEMY_SPECIES.map((s) => s.id)).toEqual(roster.enemies);
    expect(BOSS_SPECIES.id).toBe(roster.boss);
    expect([...STARTER_SPECIES]).toEqual(roster.starters);
    expect(generated.roster).toEqual(roster);
  });

  it('covers the 18 types with at least 6 lines each as the type of one of their forms (ADR-048), and the starters are four types', () => {
    for (const type of GAME_TYPES) {
      const lines = BALL_SPECIES.filter((s) => typesOfLine(gameConfig, s.id).includes(type));
      expect(lines.length, type).toBeGreaterThanOrEqual(6);
    }
    const starterTypes = STARTER_SPECIES.map((id) => gameConfig.species[id]?.type);
    expect(new Set(starterTypes).size).toBe(4);
  });

  it('keeps one or two types per species, the first being `type`, and the 18 only', () => {
    for (const s of generated.species) {
      expect(s.types.length, s.id).toBeGreaterThanOrEqual(1);
      expect(s.types.length, s.id).toBeLessThanOrEqual(2);
      expect(s.type, s.id).toBe(s.types[0]);
      for (const type of s.types) expect(GAME_TYPES as readonly string[], s.id).toContain(type);
    }
    expect(generated.species.filter((s) => s.types.length === 2).length).toBeGreaterThan(100);
  });

  it('keeps the legendaries out of every line and available as final bosses (ADR-048)', () => {
    const lines = new Set([
      ...roster.balls,
      ...roster.enemies,
      ...Object.values(roster.lines).flat(),
    ]);
    for (const id of roster.legendaries) {
      expect(lines.has(id), `${id} is in a line`).toBe(false);
      expect(gameConfig.species[id], `${id} has data`).toBeDefined();
      expect(ART_SPECIES_IDS, id).toContain(id);
    }
    expect(lines.has(roster.boss)).toBe(false);
    // Every legendary of the final boss table is one of them, of the type it is filed under.
    const table = gameConfig.boss?.byType ?? {};
    for (const [type, id] of Object.entries(table)) {
      expect(roster.legendaries, id).toContain(id);
      expect(gameConfig.species[id as string]?.type, id).toBe(type);
    }
    // 14 of the 18 types have a legendary or mythical of their own among the final bosses; fighting,
    // poison, flying and fairy have none in generations 1-4 (or none of that primary type).
    expect(Object.keys(table).length).toBeGreaterThanOrEqual(14);
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
      // Some lines have no evolution (Farfetch'd, Absol...): they just keep their form.
      expect(line.length, base.id).toBeLessThanOrEqual(2);
      for (const form of line) {
        expect(ids.has(form), form).toBe(true);
        // A form may gain or change a type (Charmander -> Charizard adds Flying); it always has one.
        const data = generated.species.find((sp) => sp.id === form);
        expect(data?.types.length, form).toBeGreaterThanOrEqual(1);
      }
    }
    expect(Object.values(EVOLUTION_LINES).filter((l) => l.length > 0).length).toBeGreaterThan(150);
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
  // Every line is both a ball and a wild species since the roster is built by rule (ADR-048).
  const bases = [...new Map([...BALL_SPECIES, ...ENEMY_SPECIES].map((s) => [s.id, s])).values()];

  it('gives every ball and enemy line a move at each of the three stages, with a name', () => {
    expect(Object.keys(MOVES_BY_BASE).sort()).toEqual(bases.map((s) => s.id).sort());
    for (const base of bases) {
      const moves = MOVES_BY_BASE[base.id] ?? [];
      expect(moves, base.id).toHaveLength(3);
      for (const move of moves) expect(MOVE_NAMES[move], `${base.id} ${move}`).toBeTruthy();
    }
  });

  it('only uses damaging moves of one of the species types (ADR-047), growing with the stage', () => {
    let strictlyStronger = 0;
    for (const base of bases) {
      const powers = (MOVES_BY_BASE[base.id] ?? []).map((move) => {
        const info = MOVE_INFO[move];
        // The move is of either type of the species: a dual type brings coverage.
        expect(typesOfSpecies(base) as readonly string[], `${base.id} ${move}`).toContain(
          info?.type,
        );
        return info?.power ?? 0;
      });
      expect(powers[0], base.id).toBeGreaterThan(0);
      // Three lines (Clefairy, Poochyena, Sableye) have no stronger move of their types at some
      // stage and fall back to the default one of the type, which can repeat or dip a little.
      expect(powers[1] ?? 0, base.id).toBeGreaterThanOrEqual((powers[0] ?? 0) * 0.99);
      expect(powers[2] ?? 0, base.id).toBeGreaterThanOrEqual((powers[1] ?? 0) * 0.8);
      if ((powers[1] ?? 0) > (powers[0] ?? 0) && (powers[2] ?? 0) > (powers[1] ?? 0)) {
        strictlyStronger += 1;
      }
    }
    expect(strictlyStronger).toBeGreaterThan(bases.length - 6);
  });

  it('attack types: every type attacks as the first move of at least two lines (ADR-047)', () => {
    const attackers = new Map<string, number>();
    for (const base of bases) {
      const type = MOVE_INFO[MOVES_BY_BASE[base.id]?.[0] ?? '']?.type ?? '';
      attackers.set(type, (attackers.get(type) ?? 0) + 1);
    }
    for (const type of GAME_TYPES) expect(attackers.get(type) ?? 0, type).toBeGreaterThanOrEqual(2);
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
