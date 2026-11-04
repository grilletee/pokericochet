import { abilitiesFor } from './abilities';
import type { GameConfig } from './config';
import { formAt, formOfMember } from './forms';
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

export function effectiveness(config: GameConfig, attacker: GameType, defender: GameType): number {
  return config.typeChart[attacker][defender];
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
export function hitDamage(config: GameConfig, ball: Ball, defender: GameType): number {
  const levels = config.stats.levelMultiplier;
  const levelMultiplier = levels[ball.level - 1] ?? levels[levels.length - 1] ?? 1;
  return (
    (config.stats.powerRef / config.stats.damageDivisor) *
    formPower(config, ballForm(config, ball)) *
    stageBoost(config, ball.species, ball.stage) *
    levelMultiplier *
    config.stats.typeDamage[ball.type] *
    effectiveness(config, ball.type, defender)
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

/** What a leak of `threat` really costs after the team's guard: whole points, at least 1 (ADR-038). */
export function leakDamage(config: GameConfig, team: readonly Member[], threat: number): number {
  if (threat <= 0) return 0;
  return Math.max(1, Math.floor(threat * (1 - teamGuard(config, team)) + 0.5));
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
