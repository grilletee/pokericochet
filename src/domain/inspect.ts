import { ballSpeed, bulkOf, formPower, getSpecies, stageBoost, teamGuard } from './combat';
import type { GameConfig } from './config';
import { formAt, formOfMember, stageForLevel } from './forms';
import { moveIdOf } from './moves';
import { captureLevel } from './team';
import type { BaseStats, Member } from './types';

/** What the player sees of a Pokémon when choosing a team (ADR-038): its form, stats and what they do. */
export interface MemberStats {
  /** The species it shows now; the single answer to its name and sprite (ADR-036). */
  readonly form: string;
  readonly stage: number;
  readonly stats: BaseStats;
  /** Which of Attack and Special Attack gives the damage. */
  readonly powerStat: 'attack' | 'specialAttack';
  /** Damage multiplier of the form and its stage boost (what the stats and the stage give). */
  readonly damage: number;
  /** Pixels per tick of its balls. */
  readonly ballSpeed: number;
  /** Mean of HP, Defense and Special Defense (feeds the guard of the team). */
  readonly bulk: number;
  /** Id of the move it casts at its stage, if the data has one (ADR-039). */
  readonly move: string | undefined;
}

/** Stats of a Pokémon of `species` at `level`. Pure: used by the replace screen and the sheet. */
export function statsOf(config: GameConfig, species: string, level: number): MemberStats {
  const stage = stageForLevel(config, level);
  const form = formAt(config, species, stage);
  const def = getSpecies(config, form);
  const base = getSpecies(config, species);
  const { attack, specialAttack } = def.baseStats;
  return {
    form,
    stage,
    stats: def.baseStats,
    powerStat: specialAttack > attack ? 'specialAttack' : 'attack',
    damage: formPower(config, def) * stageBoost(config, species, stage),
    ballSpeed: ballSpeed(config, {
      id: 0,
      owner: 0,
      stage,
      species,
      type: base.type,
      level,
      hybrid: false,
      effects: [],
    }),
    bulk: bulkOf(def),
    move: moveIdOf(config, species, stage),
  };
}

export function statsOfMember(config: GameConfig, member: Member): MemberStats {
  return statsOf(config, member.species, member.level);
}

/** Guard of the team now, and what it would be if the Pokémon at `slot` were replaced by a capture. */
export function guardAfterReplace(
  config: GameConfig,
  team: readonly Member[],
  slot: number,
  capture: { readonly species: string; readonly stage: number },
): number {
  const def = getSpecies(config, capture.species);
  const joined: Member = {
    species: capture.species,
    type: def.type,
    level: captureLevel(config, capture.stage),
    starter: false,
    damageUps: 0,
    cadenceUps: 0,
    charge: 0,
  };
  return teamGuard(
    config,
    team.map((member, index) => (index === slot ? joined : member)),
  );
}

export { formOfMember };
