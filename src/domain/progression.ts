import { drawOffers } from './cards';
import type { GameConfig } from './config';
import { nextFloat } from './rng';
import type { Run } from './run';
import type { Enemy } from './types';

/** xp needed to go from `level` to `level + 1`; the last configured value repeats. */
export function xpCost(config: GameConfig, level: number): number {
  const costs = config.progression.levelCosts;
  return costs[level - 1] ?? costs[costs.length - 1] ?? 1;
}

/** Experience an enemy of this species is worth (before the loot roll). */
export function enemyXp(config: GameConfig, speciesHp: number): number {
  return Math.max(1, Math.floor(speciesHp / config.progression.hpPerXp + 0.5));
}

/**
 * Grants the experience of a dead enemy. The `loot` stream decides whether the kill is rich; it
 * is drawn on every kill, so the stream advances the same way whatever the chance is.
 */
export function awardKill(run: Run, config: GameConfig, enemy: Enemy): void {
  const rich = nextFloat(run.rng.loot) < config.progression.lootChance;
  run.player.xp += rich ? enemy.xp * config.progression.lootMultiplier : enemy.xp;
}

/**
 * If the player has enough experience, levels up and opens the card choice. Returns true when it
 * did, in which case the run is now in the `levelup` phase.
 */
export function checkLevelUp(run: Run, config: GameConfig): boolean {
  if (run.player.xp < run.player.xpNext) return false;
  run.player.xp -= run.player.xpNext;
  run.player.level += 1;
  run.player.xpNext = xpCost(config, run.player.level);
  run.offers = drawOffers(run, config);
  run.phase = 'levelup';
  run.events.push({ type: 'levelup', level: run.player.level });
  return true;
}
