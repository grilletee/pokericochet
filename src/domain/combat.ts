import { abilitiesFor } from './abilities';
import type { GameConfig } from './config';
import { attackTypeOf, formAt, formOfMember } from './forms';
import type { Run } from './run';
import { stageOf } from './team';
import type { Ball, GameType, Member, SpeciesDef } from './types';

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

/** How the raw chart is read when `config.stats.typeScale` is missing (ADR-047). */
const DEFAULT_TYPE_SCALE = { immune: 0.25, min: 0.25, max: 3 } as const;

/**
 * Effectiveness of an attack type against a defender of one or two types (ADR-047): each cell of
 * the raw chart counts as is (an immunity, 0, as `typeScale.immune`), the cells multiply and the
 * product is clamped to [min, max], so Ground slows Electric to x0.25 but nothing ever does zero or
 * more than x3. A missing cell counts as 1.
 */
export function effectiveness(
  config: GameConfig,
  attacker: GameType,
  defender: GameType,
  second?: GameType,
): number {
  const scale = config.stats.typeScale ?? DEFAULT_TYPE_SCALE;
  const row = config.typeChart[attacker];
  const cell = (type: GameType): number => {
    const raw = row?.[type] ?? 1;
    return raw === 0 ? scale.immune : raw;
  };
  const product = second === undefined ? cell(defender) : cell(defender) * cell(second);
  return Math.max(scale.min, Math.min(scale.max, product));
}

/** Effectiveness of an attack type against a given enemy, with its second type. */
export function effectivenessOn(
  config: GameConfig,
  attacker: GameType,
  enemy: { readonly type: GameType; readonly type2?: GameType },
): number {
  return effectiveness(config, attacker, enemy.type, enemy.type2);
}

/** The species a ball shows now: the form of its line at its stage, whose stats it uses (ADR-038). */
export function ballForm(config: GameConfig, ball: Ball): SpeciesDef {
  return getSpecies(config, formAt(config, ball.species, ball.stage));
}

/** Damage multiplier of a form from its best attacking stat (ADR-038). */
export function formPower(config: GameConfig, species: SpeciesDef): number {
  const { baseStats } = species;
  const { stats } = config;
  return mapStat(
    Math.max(baseStats.attack, baseStats.specialAttack),
    stats.powerStatMin,
    stats.powerStatMax,
    stats.powerMultMin,
    stats.powerMultMax,
  );
}

/**
 * What a stage adds to the damage when the stats of its form do not give the minimum growth of the
 * stage (ADR-037): `team.stageGrowth[stage - 1]` over the growth the form already brings, never
 * under 1. A line that does not change form (an awakening, the maximum power) gets all of it; one
 * that evolves into a strong form gets little or nothing. So every line grows at least as much.
 */
export function stageBoost(config: GameConfig, base: string, stage: number): number {
  const growth = config.team.stageGrowth;
  const wanted = growth[stage - 1] ?? growth[growth.length - 1] ?? 1;
  if (stage <= 1) return 1;
  const first = formPower(config, getSpecies(config, base));
  const now = formPower(config, getSpecies(config, formAt(config, base, stage)));
  return Math.max(1, wanted / (now / first));
}

/**
 * damage = powerRef / divisor x power of the form x stage boost x level multiplier x type damage x
 * effectiveness (first type only for hybrids).
 */
export function hitDamage(
  config: GameConfig,
  ball: Ball,
  defender: GameType,
  second?: GameType,
): number {
  const levels = config.stats.levelMultiplier;
  const levelMultiplier = levels[ball.level - 1] ?? levels[levels.length - 1] ?? 1;
  return (
    (config.stats.powerRef / config.stats.damageDivisor) *
    formPower(config, ballForm(config, ball)) *
    stageBoost(config, ball.species, ball.stage) *
    levelMultiplier *
    (config.stats.typeDamage[ball.type] ?? 1) *
    effectiveness(config, ball.type, defender, second)
  );
}

/** Pixels per tick of a ball launched now: the Speed of its form, never above `ball.speedCap`. */
export function ballSpeed(config: GameConfig, ball: Ball): number {
  const { stats, ball: ballConfig } = config;
  return Math.min(
    ballConfig.speedCap,
    mapStat(
      ballForm(config, ball).baseStats.speed,
      stats.speedStatMin,
      stats.speedStatMax,
      ballConfig.speedMin,
      ballConfig.speedMax,
    ),
  );
}

/** Mean of HP, Defense and Special Defense of a form: how sturdy it is. */
export function bulkOf(species: SpeciesDef): number {
  const { hp, defense, specialDefense } = species.baseStats;
  return (hp + defense + specialDefense) / 3;
}

/**
 * Guard of a team (0..guardMax): its mean bulk mapped onto a fraction of the damage a leak does
 * not get through (ADR-038). An empty team has none.
 */
export function teamGuard(config: GameConfig, team: readonly Member[]): number {
  if (team.length === 0) return 0;
  let total = 0;
  for (const member of team) total += bulkOf(getSpecies(config, formOfMember(config, member)));
  const { stats } = config;
  return mapStat(total / team.length, stats.guardStatMin, stats.guardStatMax, 0, stats.guardMax);
}

/**
 * What a leak of `threat` really costs after the team's guard: whole points, at least 1 (ADR-038).
 * `extraGuard` is the temporary guard of the fairy effect (ADR-047); the total never passes 0.75.
 */
export function leakDamage(
  config: GameConfig,
  team: readonly Member[],
  threat: number,
  extraGuard = 0,
): number {
  if (threat <= 0) return 0;
  const guard = Math.min(0.75, teamGuard(config, team) + extraGuard);
  return Math.max(1, Math.floor(threat * (1 - guard) + 0.5));
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
  const type = attackTypeOf(config, species.id, stage, species.type);
  return {
    id,
    owner,
    stage,
    species: species.id,
    type,
    level,
    hybrid: false,
    effects: abilitiesFor(config, species.id, type, stage),
  };
}

/**
 * The only way damage reaches the player (ADR-032, ADR-034): leaks today, boss attacks in the 4G.
 * Health never goes above the maximum or heals from here.
 */
export function damagePlayer(run: Run, amount: number): void {
  run.player.hp -= amount;
}
