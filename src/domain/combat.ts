import type { GameConfig } from './config';
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
    effectiveness(config, ball.type, defender)
  );
}

/** Level 1 ball for a species, with the effect that its type grants. */
export function createBall(config: GameConfig, speciesId: string, id: number): Ball {
  const species = getSpecies(config, speciesId);
  const effect = config.typeEffects[species.type];
  return {
    id,
    species: species.id,
    type: species.type,
    level: 1,
    hybrid: false,
    effects: [{ kind: effect.kind, strength: effect.strength }],
  };
}
