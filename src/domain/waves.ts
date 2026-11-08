import { startFight } from './bossFight';
import { getSpecies, mapStat } from './combat';
import type { GameConfig, ThemeDef } from './config';
import { baseOf, formAt } from './forms';
import { dropCapture } from './pickups';
import { biomeLines, championOf, fairLines, typesOfLine } from './pool';
import { enemyXp } from './progression';
import { nextFloat, nextInt } from './rng';
import type { Run } from './run';
import { type Enemy, GAME_TYPES, type GameType, type SpeciesDef } from './types';

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
  /** The first wave of a run: only lines the starter does not resist. */
  readonly fair?: boolean;
}

/** The second type of a species as the optional field an enemy carries (none for a single type). */
function secondType(species: SpeciesDef): { type2?: GameType } {
  const second = species.types?.[1];
  return second === undefined ? {} : { type2: second };
}

/**
 * Spawns one enemy. It always draws exactly four numbers from the `spawn` stream (theme or
 * general pool, species, lane, speed variation), so what spawns never depends on how the fight is
 * going. A themed wave takes `purity` of its enemies from the theme's species (ADR-027).
 */
function spawnEnemy(run: Run, config: GameConfig, wave: SpawnProfile): void {
  const { enemy, stats } = config;
  // Enemies come from the pool of the run (ADR-048): the general ones by the wave's types, the
  // themed ones by the types of the biome (ADR-049, a line enters if any of its types matches).
  const inPool = config.enemySpecies.filter((id) => run.pool.includes(id));
  const matches = (id: string): boolean =>
    typesOfLine(config, id, wave.tier).some((type) => wave.types.includes(type));
  let general = inPool.filter(matches);
  if (general.length === 0) general = inPool; // nothing of those types in the pool: any line
  let themed = wave.theme === undefined ? [] : biomeLines(config, run.pool, wave.theme, wave.tier);
  // The first wave brings only what the starter's attack does not resist (ADR-033, ADR-049).
  if (wave.fair) {
    const fair = new Set(
      fairLines(config, [...new Set([...general, ...themed])], run.starter, wave.tier),
    );
    const keep = (id: string): boolean => fair.has(id);
    if (general.some(keep)) general = general.filter(keep);
    if (themed.some(keep)) themed = themed.filter(keep);
  }
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
    ...secondType(species),
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
    threat: enemy.threat + (wave.tier - 1) * enemy.threatPerTier,
    xp: enemyXp(config, species.baseStats.hp),
    burnTicks: 0,
    burnDps: 0,
    slowTicks: 0,
    slow: 0,
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
    spawnEnemy(run, config, {
      ...wave,
      theme,
      tier: wave.tier ?? 1,
      fair: run.wave.index === 0 && config.pool !== undefined,
    });
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

/**
 * Puts a boss on the field. `number` is its place in the run (1-based: the boss between waves are
 * 1..n, the final one n + 1), which the interface says as "Jefe 2/3" or "Jefe final" (4F-E).
 */
function placeBoss(
  run: Run,
  config: GameConfig,
  speciesId: string,
  shape: BossShape,
  number: number,
  isFinal: boolean,
): void {
  const species = getSpecies(config, speciesId);
  // The health stat of a boss counts between 60 and 110 (4H-B2): the champion of a biome is the
  // strongest line of its types, and a stat of 255 (Blissey) or 1 (Shedinja) must not decide the fight.
  const bossHpStat = Math.max(60, Math.min(110, species.baseStats.hp));
  const hp = bossHpStat * config.enemy.hpScale * shape.hpScale;
  const boss: Enemy = {
    id: run.nextEnemyId,
    species: species.id,
    type: species.type,
    ...secondType(species),
    hp,
    x: config.arena.width / 2,
    y: -shape.radius,
    speed: shape.speed,
    radius: shape.radius,
    threat: config.player.maxHp,
    xp: 0,
    burnTicks: 0,
    burnDps: 0,
    slowTicks: 0,
    slow: 0,
  };
  run.nextEnemyId += 1;
  run.enemies.push(boss);
  run.boss.id = boss.id;
  run.boss.maxHp = hp;
  run.boss.tick = 0;
  startFight(run, config, boss);
  run.events.push({
    type: 'bossSpawn',
    enemyId: boss.id,
    species: species.id,
    number,
    interludes: (config.interludes ?? []).length,
    final: isFinal,
  });
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
    // The champion of the biome of the wave that just ended (ADR-049); a theme without a type
    // list (or a pool with nothing of it) falls back to the table by type of ADR-028.
    const ended = config.themes?.[run.waveThemes[next.after - 1] ?? ''];
    const champion =
      ended?.types === undefined
        ? undefined
        : (championOf(config, run.pool, ended, run.boss.used) ??
          championOf(config, run.pool, ended));
    if (champion !== undefined) {
      placeBoss(run, config, champion, next, run.boss.next + 1, false);
      run.boss.used.push(baseOf(config, champion).base);
      run.boss.next += 1;
      run.boss.type = getSpecies(config, champion).type;
      return;
    }
    const table = next.byType ?? {};
    const type = bossType(run, config, table, next.after - 1);
    placeBoss(run, config, table[type] ?? '', next, run.boss.next + 1, false);
    run.boss.next += 1;
    run.boss.type = type;
    return;
  }

  const final = config.boss;
  if (!run.boss.spawned && final !== undefined && run.wave.index >= config.waves.length) {
    // 4G-D: the final boss is drawn from the whole list of legendaries that have data (37), with the
    // `themes` stream; the old table by type is the fallback for configs without the list.
    const listed = (final.finals ?? []).filter((id) => config.species[id] !== undefined);
    if (listed.length > 0) {
      const species = listed[nextInt(run.rng.themes, listed.length)] ?? final.species;
      placeBoss(run, config, species, final, interludes.length + 1, true);
      run.boss.spawned = true;
      run.boss.type = getSpecies(config, species).type;
      return;
    }
    const type = final.byType === undefined ? undefined : bossType(run, config, final.byType, -1);
    placeBoss(
      run,
      config,
      (type === undefined ? undefined : final.byType?.[type]) ?? final.species,
      final,
      interludes.length + 1,
      true,
    );
    run.boss.spawned = true;
    run.boss.type = type ?? '';
    return;
  }

  const def = run.boss.spawned ? final : interludes[run.boss.next - 1];
  if (def === undefined || !isBossAlive(run)) return;
  run.boss.tick += 1;
  // The reinforcements its `summon` attacks asked for (ADR-053), through the same `spawn` stream.
  if (run.boss.summonDebt > 0) {
    const asked: SpawnProfile = {
      types: run.boss.type === '' ? GAME_TYPES : [run.boss.type as GameType],
      speedScale: def.summonSpeedScale,
      hpScale: def.summonHpScale,
      tier: 1,
    };
    for (let i = 0; i < run.boss.summonDebt; i++) spawnEnemy(run, config, asked);
    run.boss.summonDebt = 0;
  }
  // A boss with `summonCount` 0 (the final one, 4G-E) fights alone: only the special reinforcements
  // its own attacks ask for (above) ever come.
  if (def.summonCount > 0 && run.boss.tick % def.summonIntervalTicks === 0) {
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
