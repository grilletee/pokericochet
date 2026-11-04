import { describe, it } from 'vitest';
import { mergeConfig } from '../../src/app/tune';
import { gameConfig } from '../../src/data';
import { createRun, type GameConfig, tick } from '../../src/domain';
import { activePolicy, commandFor, type Policy } from './bots';

/**
 * M5, pressure per wave (4D): enemy health that enters per second divided by the damage per
 * second the active bot deals in the same wave. Both are per second of play (paused level-up
 * ticks do not count), so M5 = hp entering / damage dealt. Above 1 the enemies arrive faster than
 * the team can remove them; the target is that it holds or rises from wave 1 to the last and never
 * sinks. Damage is the raw damage of `hit` events (overkill, burn and chain are not counted), so it
 * is a consistent proxy, not an exact number. Run with `pnpm bench:pressure`.
 * PRESSURE_PER_STARTER (default 50) runs per starter; FUN_PATCH merges a config patch.
 */
const PER_STARTER = Number(process.env.PRESSURE_PER_STARTER ?? 50);
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];

interface WaveTotals {
  ticks: number;
  hpIn: number;
  damage: number;
  spawns: number;
  team: number;
  runs: number;
}

function measure(config: GameConfig, policy: Policy): WaveTotals[] {
  const waves = config.waves.length + 1; // the last slot is the boss fight
  const totals: WaveTotals[] = Array.from({ length: waves }, () => ({
    ticks: 0,
    hpIn: 0,
    damage: 0,
    spawns: 0,
    team: 0,
    runs: 0,
  }));
  for (const [k, starter] of STARTERS.entries()) {
    for (let i = 0; i < PER_STARTER; i++) {
      const run = createRun(config, 9000 + k * 1000 + i, starter);
      const seen = new Set<number>();
      for (let t = 0; t < 40_000 && run.phase !== 'lost' && run.phase !== 'won'; t++) {
        const wave = Math.min(run.wave.index, waves - 1);
        const slot = totals[wave];
        const playing = run.phase === 'playing';
        const out = tick(run, commandFor(policy, run, config), config);
        if (slot === undefined || !playing) continue;
        slot.ticks += 1;
        if (!seen.has(wave)) {
          seen.add(wave);
          slot.runs += 1;
        }
        slot.team += run.loadout.length;
        for (const e of out.events) {
          if (e.type === 'hit') slot.damage += e.damage;
          else if (e.type === 'spawn') {
            const enemy = run.enemies.find((x) => x.id === e.enemyId);
            if (enemy !== undefined) {
              slot.hpIn += enemy.hp;
              slot.spawns += 1;
            }
          }
        }
      }
    }
  }
  return totals;
}

describe('pressure per wave (M5)', () => {
  it('reports hp in, damage and M5 for each wave', { timeout: 900_000 }, () => {
    const raw = process.env.FUN_PATCH;
    const config = raw ? mergeConfig(gameConfig, JSON.parse(raw)) : gameConfig;
    const totals = measure(config, activePolicy);
    const lines = totals.map((w, i) => {
      const seconds = w.ticks / 60;
      const name = i < config.waves.length ? `wave ${i + 1}` : 'boss  ';
      if (seconds === 0) return `${name}  (no run reached it)`;
      return [
        name,
        `runs ${String(w.runs).padStart(3)}`,
        `hp in/s ${(w.hpIn / seconds).toFixed(1).padStart(6)}`,
        `dps ${(w.damage / seconds).toFixed(1).padStart(6)}`,
        `M5 ${(w.hpIn / Math.max(1e-9, w.damage)).toFixed(2)}`,
        `enemies/s ${(w.spawns / seconds).toFixed(2)}`,
        `team ${(w.team / w.ticks).toFixed(1)}`,
      ].join(' | ');
    });
    console.log(
      `\nM5  ${PER_STARTER * STARTERS.length} runs of the active bot\n${lines.join('\n')}`,
    );
  });
});
