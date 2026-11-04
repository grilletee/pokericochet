import { getSpecies, mapStat } from './combat';
import type { GameConfig, ThemeDef } from './config';
import { dropCapture } from './pickups';
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

/** What decides which enemies spawn and how tough they are: a wave, or a boss's summons. */
interface SpawnProfile {
  readonly types: readonly GameType[];
  readonly speedScale: number;
  readonly hpScale: number;
  readonly theme?: ThemeDef | undefined;
  /** Evolution form of the enemies (1 = base species). */
  readonly tier: number;
}

/** The species an enemy of `base` shows at `level`: the base itself, or the form of its line. */
export function formAt(config: GameConfig, base: string, level: number): string {
  const line = config.lines?.[base];
  if (line === undefined || level <= 1) return base;
  const form = line[Math.min(level - 2, line.length - 1)];
  return form !== undefined && config.species[form] !== undefined ? form : base;
}

/** Base species and level of an enemy species (an evolved form maps back to its line). */
export function baseOf(config: GameConfig, species: string): { base: string; level: number } {
  return config.forms?.[species] ?? { base: species, level: 1 };
}

/**
 * Spawns one enemy. It always draws exactly four numbers from the `spawn` stream (theme or
 * general pool, species, lane, speed variation), so what spawns never depends on how the fight is
 * going. A themed wave takes `purity` of its enemies from the theme's species (ADR-027).
 */
function spawnEnemy(run: Run, config: GameConfig, wave: SpawnProfile): void {
  const { enemy, stats } = config;
  const general = config.enemySpecies.filter((id) =>
    wave.types.includes(getSpecies(config, id).type),
  );
  const themed = (wave.theme?.species ?? []).filter((id) => config.species[id] !== undefined);
  if (general.length === 0 && themed.length === 0) return;

  const mix = nextFloat(run.rng.spawn);
  const useTheme = themed.length > 0 && (general.length === 0 || mix < (wave.theme?.purity ?? 0));
  const pool = useTheme ? themed : general;
  const pick = nextInt(run.rng.spawn, pool.length);
  const lane = nextInt(run.rng.spawn, enemy.lanes);
  const variation = 1 + (nextFloat(run.rng.spawn) * 2 - 1) * enemy.speedVariation;

  const base = pool[pick];
  if (base === undefined) return;
  const species = getSpecies(config, formAt(config, base, wave.tier));
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
}

/**
 * Advances the wave clock by one tick: spawns on schedule and moves on to the next wave. The clock
 * is stopped while a boss lives (ADR-028); `tick` does not call this then.
 */
export function advanceWave(run: Run, config: GameConfig): void {
  const waves = config.waves;
  const wave = waves[run.wave.index];
  if (wave === undefined) return;

  if (run.tickCount === 0 && run.wave.index === 0 && run.wave.tick === 0) {
    run.events.push({ type: 'waveStart', index: 0, theme: run.waveThemes[0] ?? '' });
  }
  run.wave.tick += 1;
  if (run.wave.tick % wave.spawnIntervalTicks === 0) {
    const theme = config.themes?.[run.waveThemes[run.wave.index] ?? ''];
    spawnEnemy(run, config, { ...wave, theme, tier: wave.tier ?? 1 });
  }
  if (run.wave.tick >= wave.durationTicks) {
    run.wave.index += 1;
    run.wave.tick = 0;
    if (run.wave.index < waves.length) {
      run.events.push({
        type: 'waveStart',
        index: run.wave.index,
        theme: run.waveThemes[run.wave.index] ?? '',
      });
    }
  }
}

/** True while the current boss (a boss between waves or the final one) is on the field. */
export function isBossAlive(run: Run): boolean {
  if (run.boss.id === 0) return false;
  for (const e of run.enemies) if (e.id === run.boss.id && e.hp > 0) return true;
  return false;
}

interface BossShape {
  readonly hpScale: number;
  readonly speed: number;
  readonly radius: number;
}

function placeBoss(run: Run, config: GameConfig, speciesId: string, shape: BossShape): void {
  const species = getSpecies(config, speciesId);
  const hp = species.baseStats.hp * config.enemy.hpScale * shape.hpScale;
  const boss: Enemy = {
    id: run.nextEnemyId,
    species: species.id,
    type: species.type,
    hp,
    x: config.arena.width / 2,
    y: -shape.radius,
    speed: shape.speed,
    radius: shape.radius,
    threat: config.player.maxHp,
    xp: 0,
    burnTicks: 0,
    burnDps: 0,
  };
  run.nextEnemyId += 1;
  run.enemies.push(boss);
  run.boss.id = boss.id;
  run.boss.maxHp = hp;
  run.boss.tick = 0;
  run.events.push({ type: 'bossSpawn', enemyId: boss.id });
}

/**
 * The type of a boss that picks its species from a table: the type of the wave that just ended
 * if the table has it, otherwise a draw from the `themes` stream (the legendary of the final fight).
 */
function bossType(
  run: Run,
  config: GameConfig,
  table: Readonly<Partial<Record<GameType, string>>>,
  endedWave: number,
): GameType {
  const themed = config.themes?.[run.waveThemes[endedWave] ?? '']?.type;
  if (themed !== undefined && table[themed] !== undefined) return themed;
  const keys = GAME_TYPES.filter((type) => table[type] !== undefined);
  return keys[nextInt(run.rng.themes, keys.length)] ?? 'fire';
}

/**
 * Bosses (ADR-016, ADR-028). A boss between waves appears when its `after` waves are over; the
 * wave clock stays stopped while it lives. The final boss appears when the last wave ends and may
 * be a legendary drawn by type. Whichever is on the field summons `summonCount` small enemies
 * every `summonIntervalTicks`, through the same `spawn` stream and the same four draws per enemy
 * as any wave, so the summons depend only on the seed and on how long the boss has been alive.
 */
export function advanceBoss(run: Run, config: GameConfig): void {
  if (config.waves.length === 0) return;
  const interludes = config.interludes ?? [];
  const next = interludes[run.boss.next];
  if (
    !run.boss.spawned &&
    !isBossAlive(run) &&
    next !== undefined &&
    run.wave.index >= next.after
  ) {
    const type = bossType(run, config, next.byType, next.after - 1);
    placeBoss(run, config, next.byType[type], next);
    run.boss.next += 1;
    run.boss.type = type;
    return;
  }

  const final = config.boss;
  if (!run.boss.spawned && final !== undefined && run.wave.index >= config.waves.length) {
    const type = final.byType === undefined ? undefined : bossType(run, config, final.byType, -1);
    placeBoss(
      run,
      config,
      (type === undefined ? undefined : final.byType?.[type]) ?? final.species,
      final,
    );
    run.boss.spawned = true;
    run.boss.type = type ?? '';
    return;
  }

  const def = run.boss.spawned ? final : interludes[run.boss.next - 1];
  if (def === undefined || !isBossAlive(run)) return;
  run.boss.tick += 1;
  if (run.boss.tick % def.summonIntervalTicks === 0) {
    const profile: SpawnProfile = {
      types: run.boss.type === '' ? GAME_TYPES : [run.boss.type as GameType],
      speedScale: def.summonSpeedScale,
      hpScale: def.summonHpScale,
      tier: 1,
    };
    for (let i = 0; i < def.summonCount; i++) spawnEnemy(run, config, profile);
    run.events.push({ type: 'bossSummon', count: def.summonCount });
  }
}

/**
 * A boss died: it counts, and a boss between waves heals the player and drops a guaranteed
 * capture of its own line, at the level of its form (ADR-028).
 */
export function onBossDefeated(run: Run, config: GameConfig, boss: Enemy): void {
  run.boss.defeated += 1;
  run.events.push({ type: 'bossDefeated', species: boss.species, index: run.boss.defeated });
  if (run.boss.spawned) return; // the final boss: the run is won
  const def = (config.interludes ?? [])[run.boss.next - 1];
  if (def === undefined) return;
  if (def.healHp > 0 && run.player.hp < run.player.maxHp) {
    const healed = Math.min(def.healHp, run.player.maxHp - run.player.hp);
    run.player.hp += healed;
    run.events.push({ type: 'heal', amount: healed });
  }
  const { base, level } = baseOf(config, boss.species);
  dropCapture(run, config, base, boss.type, boss.x, boss.y, level);
}
