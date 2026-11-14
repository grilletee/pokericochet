import { describe, it } from 'vitest';
import { mergeConfig } from '../../src/app/tune';
import { gameConfig } from '../../src/data';
import {
  type Command,
  createRun,
  type GameConfig,
  type GameEvent,
  liveBoss,
  PLAYER_WIDTH,
  type Run,
  tick,
} from '../../src/domain';
import {
  activeNoDodgePolicy,
  activePolicy,
  commandFor,
  DODGE_REACTION_TICKS,
  type Policy,
} from './bots';

/**
 * Boss metrics (ADR-053, revised in 4G-H when the exposed damage went away), measured with bots with
 * a human reaction (35 to 80 ticks, one attack in six missed) that dodge and aim at the boss, and with
 * one that never dodges. Run with `pnpm bench:bosses`. BOSS_PER_STARTER sets the runs per starter
 * (default 25); BOSS_PATCH is a JSON object merged over the shipped config.
 *
 *  B1 actions    kinds of action per boss (dodge, collect, Ultimate, aim) and per minute
 *  B2 damage     health lost to bosses per run; the dodging bot against the one that does not
 *  B3 time       seconds from the entry of a boss to its death, by place (4G-H targets: 1st as in the
 *                4G-G, then clearly longer, the final the longest)
 *  B5 dodging    attacks that threatened the bot and did not hurt it (target 50-80 %)
 *  DPS           (4G-H) health of the boss lost per second of fight, by place: the real damage of the
 *                bot's team at that point of the run. With it each boss's health is set in SECONDS:
 *                hpScale(target) = hpScale x target / seconds measured.
 *  fury          share of bosses that reached the fury; deaths of the dodging bot by boss
 */
const PER_STARTER = Number(process.env.BOSS_PER_STARTER ?? 25);
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];
const MAX_TICKS = 160_000;

function patched(): GameConfig {
  const raw = process.env.BOSS_PATCH;
  return raw ? mergeConfig(gameConfig, JSON.parse(raw)) : gameConfig;
}

interface BossLog {
  final: boolean;
  start: number;
  end: number | null;
  threats: number;
  hurts: number;
  casts: number;
  dealt: number;
  maxHp: number;
  raged: boolean;
  kinds: Set<string>;
  damage: number;
  diedHere: boolean;
}

interface RunLog {
  won: boolean;
  lost: boolean;
  bosses: BossLog[];
}

function playBosses(seed: number, starter: string, policy: Policy, config: GameConfig): RunLog {
  const run: Run = createRun(config, seed, starter);
  const bosses: BossLog[] = [];
  let current: BossLog | null = null;
  const seen = new WeakMap<object, number>();
  const judged = new WeakMap<object, boolean>();
  while (run.phase !== 'won' && run.phase !== 'lost' && run.tickCount < MAX_TICKS) {
    const cmd: Command = commandFor(policy, run, config);
    const boss = liveBoss(run);
    const hpBefore = boss?.hp ?? 0;
    const events: readonly GameEvent[] = tick(run, cmd, config).events;
    for (const h of run.hazards) {
      if (h.kind === 'zone' || h.kind === 'gust') continue;
      if (!seen.has(h)) seen.set(h, run.tickCount);
      if (!judged.has(h) && run.tickCount - (seen.get(h) ?? 0) >= DODGE_REACTION_TICKS) {
        judged.set(h, Math.abs(run.player.x - h.x) <= h.width / 2 + PLAYER_WIDTH / 2 + 8);
        if (judged.get(h) === true && current !== null) current.threats += 1;
      }
    }
    for (const e of events) {
      if (e.type === 'bossSpawn') {
        current = {
          final: e.final,
          start: run.tickCount,
          end: null,
          threats: 0,
          hurts: 0,
          casts: 0,
          dealt: 0,
          maxHp: run.boss.maxHp,
          raged: false,
          kinds: new Set(),
          damage: 0,
          diedHere: false,
        };
        bosses.push(current);
      }
      if (current === null) continue;
      if (e.type === 'bossHurt') {
        current.damage += e.damage;
        current.hurts += 1;
      }
      if (e.type === 'bossPhase') current.raged = true;
      if (e.type === 'collect') current.kinds.add('collect');
      if (e.type === 'move') {
        current.casts += 1;
        current.kinds.add('ultimate');
      }
      if (e.type === 'bossDefeated') current.end = run.tickCount;
    }
    if (current !== null && current.end === null && boss !== undefined) {
      const after = liveBoss(run)?.hp ?? 0;
      current.dealt += Math.max(0, hpBefore - after);
      if (run.hazards.length > 0 && cmd.moveX !== 0) current.kinds.add('dodge');
      if (cmd.aimX !== undefined) current.kinds.add('aim');
    }
  }
  const last = bosses[bosses.length - 1];
  if (run.phase === 'lost' && last !== undefined && last.end === null) last.diedHere = true;
  return { won: run.phase === 'won', lost: run.phase === 'lost', bosses };
}

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${Math.round((100 * n) / d)}%`);

function measure(policy: Policy, config: GameConfig): RunLog[] {
  const logs: RunLog[] = [];
  for (const starter of STARTERS) {
    for (let i = 0; i < PER_STARTER; i++) {
      logs.push(playBosses(1000 + i * 31, starter, policy, config));
    }
  }
  return logs;
}

describe('boss fights: B1-B5 and DPS (ADR-053, 4G-H)', () => {
  it('reports the boss metrics of the shipped (or patched) configuration', () => {
    const config = patched();
    const dodging = measure(activePolicy, config);
    const careless = measure(activeNoDodgePolicy, config);
    const all = dodging.flatMap((r) => r.bosses);
    const seconds = (b: BossLog): number => ((b.end ?? b.start) - b.start) / 60;
    const done = (b: BossLog): boolean => b.end !== null;
    const mids = all.filter((b) => !b.final && done(b));
    const finals = all.filter((b) => b.final && done(b));
    const threats = all.reduce((s, b) => s + b.threats, 0);
    const hurts = Math.min(
      threats,
      all.reduce((s, b) => s + b.hurts, 0),
    );
    const perMinute = all.filter(done).map((b) => (b.kinds.size * 60) / Math.max(1, seconds(b)));
    const at = (n: number): BossLog[] =>
      dodging.map((r) => r.bosses[n]).filter((b): b is BossLog => b !== undefined && done(b));
    const place = (n: number): string => median(at(n).map(seconds)).toFixed(0);
    // DPS over the bosses that were defeated: the whole health over the whole fight.
    const dps = (n: number): string =>
      mean(at(n).map((b) => b.dealt / Math.max(1 / 60, seconds(b)))).toFixed(1);
    const hp = (n: number): string => mean(at(n).map((b) => b.maxHp)).toFixed(0);
    const deaths = [0, 1, 2, 3].map((n) =>
      pct(dodging.filter((r) => r.bosses[n]?.diedHere === true).length, dodging.length),
    );
    const lines = [
      `\nBOSSES  ${PER_STARTER} runs per starter  ${process.env.BOSS_PATCH ?? ''}`,
      `dodging bot:   win ${pct(dodging.filter((r) => r.won).length, dodging.length)}  bosses met ${all.length}, defeated ${all.filter(done).length}`,
      `careless bot:  win ${pct(careless.filter((r) => r.won).length, careless.length)}`,
      `deaths of the dodging bot at boss 1 / 2 / 3 / final: ${deaths.join(' / ')}`,
      `B1 kinds of action per boss: mean ${mean(all.map((b) => b.kinds.size)).toFixed(1)} (>= 3); per minute ${mean(perMinute).toFixed(1)}`,
      `B2 health lost to bosses per run: dodging ${mean(dodging.map((r) => r.bosses.reduce((s, b) => s + b.damage, 0))).toFixed(1)}, careless ${mean(careless.map((r) => r.bosses.reduce((s, b) => s + b.damage, 0))).toFixed(1)}`,
      `B3 time per boss: intermediates ${median(mids.map(seconds)).toFixed(0)} s, final ${median(finals.map(seconds)).toFixed(0)} s; by place ${[0, 1, 2, 3].map(place).join(' / ')}`,
      `DPS by place (boss health lost per second): ${[0, 1, 2, 3].map(dps).join(' / ')}; boss health ${[0, 1, 2, 3].map(hp).join(' / ')}`,
      `B5 attacks that threatened the bot and did not hurt it: ${pct(threats - hurts, threats)} of ${threats} (50-80 %)`,
      `fury reached: ${pct(all.filter((b) => b.raged).length, all.length)} of the bosses`,
    ];
    console.log(lines.join('\n'));
  }, 3_600_000);
});
