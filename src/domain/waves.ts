import { getSpecies, mapStat } from './combat';
import type { GameConfig } from './config';
import { enemyXp } from './progression';
import { nextFloat, nextInt } from './rng';
import type { Run } from './run';
import { type Enemy, GAME_TYPES, type GameType } from './types';

/** Centre x of a lane (0-based), lanes being equal columns between the player's margins. */
export function laneX(config: GameConfig, lane: number): number {
  const { width } = config.arena;
  const margin = config.enemy.radius;
  const laneWidth = (width - 2 * margin) / config.enemy.lanes;
  return margin + (lane + 0.5) * laneWidth;
}

/** What decides which enemies spawn and how tough they are: a wave, or the boss's summons. */
interface SpawnProfile {
  readonly types: readonly GameType[];
  readonly speedScale: number;
  readonly hpScale: number;
}

/**
 * Spawns one enemy. It always draws exactly three numbers from the `spawn` stream (species,
 * lane, speed variation), so what spawns never depends on how the fight is going.
 */
function spawnEnemy(run: Run, config: GameConfig, wave: SpawnProfile): void {
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

/** True while the boss is on the field. */
export function isBossAlive(run: Run): boolean {
  if (run.boss.id === 0) return false;
  for (const e of run.enemies) if (e.id === run.boss.id && e.hp > 0) return true;
  return false;
}

/**
 * The boss appears when the last wave ends (ADR-016): a big, slow, tough enemy in the middle
 * lane. From then on it summons `summonCount` small enemies every `summonIntervalTicks`, through
 * the same `spawn` stream and the same three draws per enemy as any wave, so the summons depend
 * only on the seed and on how long the boss has been alive.
 */
export function advanceBoss(run: Run, config: GameConfig): void {
  const def = config.boss;
  if (def === undefined || config.waves.length === 0 || run.wave.index < config.waves.length) {
    return;
  }
  if (!run.boss.spawned) {
    const species = getSpecies(config, def.species);
    const hp = species.baseStats.hp * config.enemy.hpScale * def.hpScale;
    const boss: Enemy = {
      id: run.nextEnemyId,
      species: species.id,
      type: species.type,
      hp,
      x: config.arena.width / 2,
      y: -def.radius,
      speed: def.speed,
      radius: def.radius,
      threat: config.player.maxHp,
      xp: 0,
      burnTicks: 0,
      burnDps: 0,
    };
    run.nextEnemyId += 1;
    run.enemies.push(boss);
    run.boss = { spawned: true, id: boss.id, maxHp: hp, tick: 0 };
    run.events.push({ type: 'bossSpawn', enemyId: boss.id });
    return;
  }
  run.boss.tick += 1;
  if (run.boss.tick % def.summonIntervalTicks === 0) {
    const profile: SpawnProfile = {
      types: GAME_TYPES,
      speedScale: def.summonSpeedScale,
      hpScale: def.summonHpScale,
    };
    for (let i = 0; i < def.summonCount; i++) spawnEnemy(run, config, profile);
    run.events.push({ type: 'bossSummon', count: def.summonCount });
  }
}
