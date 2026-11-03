import { getSpecies, mapStat } from './combat';
import type { GameConfig, WaveDef } from './config';
import { enemyXp } from './progression';
import { nextFloat, nextInt } from './rng';
import type { Run } from './run';
import type { Enemy } from './types';

/** Centre x of a lane (0-based), lanes being equal columns between the player's margins. */
export function laneX(config: GameConfig, lane: number): number {
  const { width } = config.arena;
  const margin = config.enemy.radius;
  const laneWidth = (width - 2 * margin) / config.enemy.lanes;
  return margin + (lane + 0.5) * laneWidth;
}

/**
 * Spawns one enemy. It always draws exactly three numbers from the `spawn` stream (species,
 * lane, speed variation), so what spawns never depends on how the fight is going.
 */
function spawnEnemy(run: Run, config: GameConfig, wave: WaveDef): void {
  const { enemy, stats } = config;
  let eligible = 0;
  for (const id of config.enemySpecies) {
    if (wave.types.includes(getSpecies(config, id).type)) eligible += 1;
  }
  if (eligible === 0) return;

  let pick = nextInt(run.rng.spawn, eligible);
  const lane = nextInt(run.rng.spawn, enemy.lanes);
  const variation = 1 + (nextFloat(run.rng.spawn) * 2 - 1) * enemy.speedVariation;

  for (const id of config.enemySpecies) {
    const species = getSpecies(config, id);
    if (!wave.types.includes(species.type)) continue;
    if (pick > 0) {
      pick -= 1;
      continue;
    }
    const spawned: Enemy = {
      id: run.nextEnemyId,
      species: species.id,
      type: species.type,
      hp: species.baseStats.hp * enemy.hpScale * wave.hpScale,
      x: laneX(config, lane),
      y: -enemy.radius,
      speed:
        mapStat(
          species.baseStats.speed,
          stats.speedStatMin,
          stats.speedStatMax,
          enemy.speedMin,
          enemy.speedMax,
        ) *
        wave.speedScale *
        variation,
      radius: enemy.radius,
      threat: enemy.threat,
      xp: enemyXp(config, species.baseStats.hp),
      burnTicks: 0,
      burnDps: 0,
    };
    run.nextEnemyId += 1;
    run.enemies.push(spawned);
    run.events.push({ type: 'spawn', enemyId: spawned.id });
    return;
  }
}

/** Advances the wave clock by one tick: spawns on schedule and moves on to the next wave. */
export function advanceWave(run: Run, config: GameConfig): void {
  const waves = config.waves;
  const wave = waves[run.wave.index];
  if (wave === undefined) return;

  run.wave.tick += 1;
  if (run.wave.tick % wave.spawnIntervalTicks === 0) spawnEnemy(run, config, wave);
  if (run.wave.tick >= wave.durationTicks) {
    run.wave.index += 1;
    run.wave.tick = 0;
    run.tokens += config.progression.tokensPerWave;
    if (run.wave.index < waves.length) {
      run.events.push({ type: 'waveStart', index: run.wave.index });
    }
  }
}
