import { describe, it } from 'vitest';
import { mergeConfig } from '../../src/app/tune';
import { gameConfig } from '../../src/data';
import { createRun, type GameConfig, isBossAlive, tick } from '../../src/domain';
import { activePolicy, commandFor, type Policy } from './bots';

/**
 * M5, pressure per wave (4D): enemy health that enters per second divided by the damage per
 * second the active bot deals in the same wave. Both are per second of play (paused level-up
 * ticks do not count), so M5 = hp entering / damage dealt. Above 1 the enemies arrive faster than
 * the team can remove them; the target (ADR-029) is that it holds or rises from wave 2 to the last
 * and never sinks. Damage is the raw damage of `hit` events (overkill, burn and chain are not
 * counted), so it is a consistent proxy, not an exact number. Because a bot that clears every
 * enemy deals at least the health that entered, M5 saturates near 1 whenever the bot keeps up;
 * the `backlog` column (mean health on the field / damage per second = seconds of work waiting)
 * is the pressure the player feels, and it keeps rising while the bot falls behind. While a boss lives the wave clock
 * is stopped, so those ticks are counted apart (the `boss` rows) and the time the bot needs to
 * defeat each boss is reported. Run with `pnpm bench:pressure`.
 * PRESSURE_PER_STARTER (default 50) runs per starter; FUN_PATCH merges a config patch.
 */
const PER_STARTER = Number(process.env.PRESSURE_PER_STARTER ?? 50);
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];

interface Bucket {
  ticks: number;
  hpIn: number;
  damage: number;
  spawns: number;
  /** Sum over ticks of the health of the enemies on the field (the backlog). */
  stock: number;
  leaks: number;
  team: number;
  runs: number;
}

const empty = (): Bucket => ({
  ticks: 0,
  hpIn: 0,
  damage: 0,
  spawns: 0,
  stock: 0,
  leaks: 0,
  team: 0,
  runs: 0,
});

interface Result {
  readonly waves: Bucket[];
  /** Seconds the bot needed to defeat each boss, by order of appearance; `met` counts the runs that reached it. */
  readonly bossSeconds: number[][];
  readonly bossMet: number[];
  readonly wins: number;
  readonly runs: number;
}

function measure(config: GameConfig, policy: Policy): Result {
  const waves = Array.from({ length: config.waves.length }, empty);
  const bossSeconds: number[][] = [];
  const bossMet: number[] = [];
  let wins = 0;
  let runs = 0;
  for (const [k, starter] of STARTERS.entries()) {
    for (let i = 0; i < PER_STARTER; i++) {
      const run = createRun(config, 9000 + k * 1000 + i, starter);
      const seen = new Set<number>();
      let spawnedAt = 0;
      let order = 0;
      runs += 1;
      for (let t = 0; t < 60_000 && run.phase !== 'lost' && run.phase !== 'won'; t++) {
        const playing = run.phase === 'playing';
        const waveIndex = run.wave.index;
        const bucket = playing && !isBossAlive(run) ? waves[waveIndex] : undefined;
        const out = tick(run, commandFor(policy, run, config), config);
        for (const e of out.events) {
          if (e.type === 'bossSpawn') {
            spawnedAt = run.tickCount;
            bossMet[order] = (bossMet[order] ?? 0) + 1;
          } else if (e.type === 'bossDefeated') {
            const list = bossSeconds[order] ?? [];
            list.push((run.tickCount - spawnedAt) / 60);
            bossSeconds[order] = list;
            order += 1;
          }
        }
        if (bucket === undefined) continue;
        bucket.ticks += 1;
        if (!seen.has(waveIndex)) {
          seen.add(waveIndex);
          bucket.runs += 1;
        }
        bucket.team += run.loadout.length;
        for (const e of run.enemies) bucket.stock += Math.max(0, e.hp);
        for (const e of out.events) {
          if (e.type === 'hit') bucket.damage += e.damage;
          else if (e.type === 'leak') bucket.leaks += 1;
          else if (e.type === 'spawn') {
            const enemy = run.enemies.find((x) => x.id === e.enemyId);
            if (enemy !== undefined) {
              bucket.hpIn += enemy.hp;
              bucket.spawns += 1;
            }
          }
        }
      }
      if (run.phase === 'won') wins += 1;
    }
  }
  return { waves, bossSeconds, bossMet, wins, runs };
}

const median = (v: number[]): number =>
  v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;

describe('pressure per wave (M5)', () => {
  it('reports hp in, damage and M5 for each wave', { timeout: 900_000 }, () => {
    const raw = process.env.FUN_PATCH;
    const config = raw ? mergeConfig(gameConfig, JSON.parse(raw)) : gameConfig;
    const result = measure(config, activePolicy);
    const lines = result.waves.map((w, i) => {
      const seconds = w.ticks / 60;
      const name = `wave ${i + 1}`;
      if (seconds === 0) return `${name}  (no run reached it)`;
      return [
        name,
        `runs ${String(w.runs).padStart(3)}`,
        `hp in/s ${(w.hpIn / seconds).toFixed(1).padStart(6)}`,
        `dps ${(w.damage / seconds).toFixed(1).padStart(6)}`,
        `M5 ${(w.hpIn / Math.max(1e-9, w.damage)).toFixed(2)}`,
        `backlog ${(w.stock / w.ticks / Math.max(1e-9, w.damage / seconds)).toFixed(2)} s`,
        `leaks/min ${((60 * w.leaks) / seconds).toFixed(2)}`,
        `enemies/s ${(w.spawns / seconds).toFixed(2)}`,
        `team ${(w.team / w.ticks).toFixed(1)}`,
      ].join(' | ');
    });
    const bossLines = result.bossMet.map((met, i) => {
      const times = result.bossSeconds[i] ?? [];
      return `boss ${i + 1}  met ${met} | beaten ${times.length} | median kill ${median(times).toFixed(0)} s`;
    });
    console.log(
      `\nM5  ${result.runs} runs of the active bot, win ${((100 * result.wins) / result.runs).toFixed(0)} %\n${lines.join('\n')}\n${bossLines.join('\n')}`,
    );
  });
});
