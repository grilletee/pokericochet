import { effectiveness } from './combat';
import type { GameConfig, ThemeDef } from './config';
import { attackTypeOf, formAt } from './forms';
import { nextInt, type RngState } from './rng';
import { GAME_TYPES, type GameType, type SpeciesDef, typesOfSpecies } from './types';

/**
 * The pool of species of a run (ADR-048): `pool.linesPerType` lines for each of the 18 types, drawn
 * with the run's own `pool` stream. The number of draws is fixed (`linesPerType` per type, whether
 * or not that many lines exist), so adding species to the roster changes which lines come out but
 * never how many numbers are consumed. The lines in `pool.always` (the starters) are always in.
 * Without `config.pool` every species is in the pool, which is what the small test configs want.
 */
export function drawPool(config: GameConfig, rng: RngState): string[] {
  const roster = config.enemySpecies.filter((id) => config.species[id] !== undefined);
  if (config.pool === undefined) return roster.slice();
  const chosen = new Set<string>();
  for (const id of config.pool.always) if (roster.includes(id)) chosen.add(id);
  for (const type of GAME_TYPES) {
    const left = roster.filter((id) => typesOfLine(config, id).includes(type) && !chosen.has(id));
    for (let i = 0; i < config.pool.linesPerType; i++) {
      const at = nextInt(rng, Math.max(1, left.length));
      const id = left[at];
      if (id === undefined) continue;
      chosen.add(id);
      left.splice(at, 1);
    }
  }
  return [...chosen];
}

/**
 * The types of a species line: those of the form it shows at `tier` (1 = the base), or, without a
 * tier, the union over all its forms (so Horsea counts for Dragon through Kingdra).
 */
export function typesOfLine(config: GameConfig, base: string, tier?: number): readonly GameType[] {
  const forms =
    tier === undefined
      ? [1, 2, 3].map((t) => formAt(config, base, t))
      : [formAt(config, base, tier)];
  const out: GameType[] = [];
  for (const id of forms) {
    const species = config.species[id];
    if (species === undefined) continue;
    for (const type of typesOfSpecies(species)) if (!out.includes(type)) out.push(type);
  }
  return out;
}

/** The types of a biome with their weight; a theme without a list is just its main type. */
export function biomeTypes(
  theme: ThemeDef,
): readonly { readonly type: GameType; readonly weight: number }[] {
  return theme.types ?? [{ type: theme.type, weight: 1 }];
}

/**
 * The lines of the pool that belong to a biome (ADR-049): a line enters if any of its types is one
 * of the biome's. A line that matches twice is listed as many times as its heaviest weight, so a
 * plain draw from the list is the weighted one. A theme with its own `species` uses those instead.
 */
export function biomeLines(
  config: GameConfig,
  pool: readonly string[],
  theme: ThemeDef,
  tier = 1,
): string[] {
  if (theme.species !== undefined) {
    return theme.species.filter((id) => config.species[id] !== undefined);
  }
  const weights = biomeTypes(theme);
  const out: string[] = [];
  for (const id of pool) {
    let weight = 0;
    for (const type of typesOfLine(config, id, tier)) {
      for (const entry of weights) if (entry.type === type) weight = Math.max(weight, entry.weight);
    }
    for (let i = 0; i < weight; i++) out.push(id);
  }
  return out;
}

/** Total base stats of a species: how strong a line is, for the champion of a biome. */
export function statTotal(species: SpeciesDef): number {
  const s = species.baseStats;
  return s.hp + s.attack + s.defense + s.specialAttack + s.specialDefense + s.speed;
}

/**
 * The champion of a biome, the boss between waves (ADR-049): among the lines of the pool that
 * belong to it, the one whose LAST form has the highest total of base stats; a tie goes to the
 * lower id. Returns the species of that last form, or undefined if the pool has no line there.
 */
export function championOf(
  config: GameConfig,
  pool: readonly string[],
  theme: ThemeDef,
): string | undefined {
  let best: { id: string; total: number } | undefined;
  for (const base of new Set(biomeLines(config, pool, theme, 3))) {
    const id = formAt(config, base, 3);
    const species = config.species[id];
    if (species === undefined) continue;
    const total = statTotal(species);
    if (best === undefined || total > best.total || (total === best.total && id < best.id)) {
      best = { id, total };
    }
  }
  return best?.id;
}

/**
 * Lines of `lines` whose stage-1 form is not resisted by the starter's attack type (effectiveness
 * of at least 1): what the first wave may bring (ADR-033, ADR-049).
 */
export function fairLines(
  config: GameConfig,
  lines: readonly string[],
  starter: string,
  tier = 1,
): string[] {
  const own = config.species[starter];
  if (own === undefined) return lines.slice();
  const attack = attackTypeOf(config, starter, 1, own.type);
  return lines.filter((base) => {
    const species = config.species[formAt(config, base, tier)];
    return (
      species !== undefined && effectiveness(config, attack, species.type, species.types?.[1]) >= 1
    );
  });
}
