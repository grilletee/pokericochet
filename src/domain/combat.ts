import { abilitiesFor } from './abilities';
import type { GameConfig } from './config';
import type { Run } from './run';
import { stageOf } from './team';
import type { Ball, GameType, SpeciesDef } from './types';

export function getSpecies(config: GameConfig, id: string): SpeciesDef {
  const species = config.species[id];
  if (species === undefined) throw new Error(`Unknown species: ${id}`);
  return species;
}

/** Linear map of a stat onto [outMin, outMax], clamped to the stat range. */
export function mapStat(
  stat: number,
  statMin: number,
  statMax: number,
  outMin: number,
  outMax: number,
): number {
  const t = Math.max(0, Math.min(1, (stat - statMin) / (statMax - statMin)));
  return outMin + (outMax - outMin) * t;
}

export function effectiveness(config: GameConfig, attacker: GameType, defender: GameType): number {
  return config.typeChart[attacker][defender];
}

/** damage = attack / divisor x level multiplier x effectiveness (first type only for hybrids). */
export function hitDamage(config: GameConfig, ball: Ball, defender: GameType): number {
  const attack = getSpecies(config, ball.species).baseStats.attack;
  const levels = config.stats.levelMultiplier;
  const levelMultiplier = levels[ball.level - 1] ?? levels[levels.length - 1] ?? 1;
  return (
    (attack / config.stats.damageDivisor) *
    levelMultiplier *
    config.stats.typeDamage[ball.type] *
    effectiveness(config, ball.type, defender)
  );
}

/** A ball of a species for the Pokémon at `owner`, at the given level (ADR-031). */
export function createBall(
  config: GameConfig,
  speciesId: string,
  id: number,
  owner = 0,
  level = 1,
): Ball {
  const species = getSpecies(config, speciesId);
  const stage = stageOf(config, level);
  return {
    id,
    owner,
    stage,
    species: species.id,
    type: species.type,
    level,
    hybrid: false,
    effects: abilitiesFor(config, species.id, species.type, stage),
  };
}

/**
 * The only way damage reaches the player (ADR-032, ADR-034): leaks today, boss attacks in the 4G.
 * Health never goes above the maximum or heals from here.
 */
export function damagePlayer(run: Run, amount: number): void {
  run.player.hp -= amount;
}
