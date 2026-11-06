import { describe, it } from 'vitest';
import { mergeConfig } from '../../src/app/tune';
import { gameConfig } from '../../src/data';
import {
  type Command,
  createRun,
  type GameConfig,
  type GameEvent,
  liveBoss,
  type Run,
  signatureReady,
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
 * Boss metrics of ADR-046 (B1-B6), measured with bots that dodge and aim at the weak point and with
 * one that never dodges. Run with `pnpm bench:bosses`. BOSS_PER_STARTER sets the runs per starter
 * (default 25); BOSS_PATCH is a JSON object merged over the shipped config.
 *
 *  B1 actions    kinds of action per boss (dodge, collect, weak-point hit, Ultimate, aim) and per minute
 *  B2 damage     health lost to the columns of bosses, per run; the dodging bot against the one that does not
 *  B3 time       seconds from the entry of a boss to its death (median; target 30-60, final up to 90)
 *  B4 Ultimate   share of bosses that get at least one Ultimate thrown (target >= 70 %)
 *  B5 dodging    columns that did not hit the bot of those that struck (target 60-85 %)
 *  B6 shields    shields raised that were broken at the weak point (target >= 50 %)
 *  stun window   bosses whose Ultimate was ready during a stun that threw it in it (target >= 85 %)
 */
const PER_STARTER = Number(process.env.BOSS_PER_STARTER ?? 25);
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];
const MAX_TICKS = 120_000;

function patched(): GameConfig {
  const raw = process.env.BOSS_PATCH;
  return raw ? mergeConfig(gameConfig, JSON.parse(raw)) : gameConfig;
}

interface BossLog {
  final: boolean;
  start: number;
  end: number | null;
  strikes: number;
  hits: number;
  /** Columns that covered the bot once it could have noticed them, and the ones among them that hit. */
  threats: number;
  threatHits: number;
  /** Times a column hurt the player, whether at its strike or later (a sweeping one). */
  hurts: number;
  shields: number;
  broken: number;
  casts: number;
  stunCasts: number;
  stunReady: boolean;
  stuns: number;
  kinds: Set<string>;
  damage: number;
}

interface RunLog {
  won: boolean;
  lost: boolean;
  ticks: number;
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
    const alive = liveBoss(run) !== undefined;
    const events: readonly GameEvent[] = tick(run, cmd, config).events;
    // A column "threatens" the bot if it covers its place once the bot has had time to notice it.
    for (const h of run.hazards) {
      if (!seen.has(h)) seen.set(h, run.tickCount);
      if (!judged.has(h) && run.tickCount - (seen.get(h) ?? 0) >= DODGE_REACTION_TICKS) {
        judged.set(h, Math.abs(run.player.x - h.x) <= h.width / 2 + 8);
      }
    }
    for (const e of events) {
      if (e.type === 'bossSpawn') {
        current = {
          final: e.final,
          start: run.tickCount,
          end: null,
          strikes: 0,
          hits: 0,
          threats: 0,
          threatHits: 0,
          hurts: 0,
          shields: 0,
          broken: 0,
          casts: 0,
          stunCasts: 0,
          stunReady: false,
          stuns: 0,
          kinds: new Set(),
          damage: 0,
        };
        bosses.push(current);
      }
      if (current === null) continue;
      if (e.type === 'bossStrike') {
        current.strikes += 1;
        if (e.hit) current.hits += 1;
        const column = run.hazards.find((h) => h.x === e.x && h.width === e.width);
        if (column !== undefined && judged.get(column) === true) {
          current.threats += 1;
          if (e.hit) current.threatHits += 1;
        }
      }
      if (e.type === 'bossHurt') {
        current.damage += e.damage;
        current.hurts += 1;
      }
      if (e.type === 'bossShield') {
        if (e.broken) {
          current.broken += 1;
          current.kinds.add('weak-point');
        } else current.shields += 1;
      }
      if (e.type === 'bossStun') current.stuns += 1;
      if (e.type === 'collect') current.kinds.add('collect');
      if (e.type === 'move') {
        current.casts += 1;
        current.kinds.add('ultimate');
        if (run.boss.stunTicks > 0) current.stunCasts += 1;
      }
      if (e.type === 'bossDefeated') current.end = run.tickCount;
    }
    if (current !== null && current.end === null && alive) {
      if (run.hazards.length > 0 && cmd.moveX !== 0) current.kinds.add('dodge');
      if (cmd.aimX !== undefined) current.kinds.add('aim');
      const index = run.team.findIndex((m) => m.starter);
      if (run.boss.stunTicks > 0 && index >= 0 && signatureReady(run, config, index)) {
        current.stunReady = true;
      }
    }
  }
  return { won: run.phase === 'won', lost: run.phase === 'lost', ticks: run.tickCount, bosses };
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
    for (let i = 0; i < PER_STARTER; i++)
      logs.push(playBosses(1000 + i * 31, starter, policy, config));
  }
  return logs;
}

describe('boss fights: B1-B6 (ADR-046)', () => {
  it('reports the boss metrics of the shipped (or patched) configuration', () => {
    const config = patched();
    const dodging = measure(activePolicy, config);
    const careless = measure(activeNoDodgePolicy, config);
    const all = dodging.flatMap((r) => r.bosses);
    const finals = all.filter((b) => b.final);
    const mids = all.filter((b) => !b.final && b.end !== null);
    const seconds = (b: BossLog): number => ((b.end ?? b.start) - b.start) / 60;
    const strikes = all.reduce((s, b) => s + b.threats, 0);
    const hits = Math.min(
      strikes,
      all.reduce((s, b) => s + b.hurts, 0),
    );
    const shields = all.reduce((s, b) => s + b.shields, 0);
    const broken = all.reduce((s, b) => s + b.broken, 0);
    const readyBosses = all.filter((b) => b.stunReady);
    const ultimates = all.filter((b) => b.casts > 0);
    const kinds = all.map((b) => b.kinds.size);
    const perMinute = all.map((b) =>
      b.end === null ? 0 : (b.kinds.size * 60) / Math.max(1, seconds(b)),
    );
    const lines = [
      `\nBOSSES  ${PER_STARTER} runs per starter  ${process.env.BOSS_PATCH ?? ''}`,
      `dodging bot:   win ${pct(dodging.filter((r) => r.won).length, dodging.length)}  ` +
        `bosses met ${all.length}, defeated ${all.filter((b) => b.end !== null).length}`,
      `careless bot:  win ${pct(careless.filter((r) => r.won).length, careless.length)}`,
      `B1 kinds of action per boss: mean ${mean(kinds).toFixed(1)} (target >= 4); per minute ${mean(perMinute).toFixed(1)}`,
      `B2 health lost to columns per run: dodging ${mean(dodging.map((r) => r.bosses.reduce((s, b) => s + b.damage, 0))).toFixed(1)}, careless ${mean(careless.map((r) => r.bosses.reduce((s, b) => s + b.damage, 0))).toFixed(1)}  (target: the careless one >= 3)`,
      `B3 time per boss: middle ${median(mids.map(seconds)).toFixed(0)} s (30-60), final ${median(finals.map(seconds)).toFixed(0)} s (<= 90)`,
      `B4 Ultimate thrown during a boss: ${pct(ultimates.length, all.length)} of bosses (>= 70 %)`,
      `B5 columns that threatened the bot and were dodged: ${pct(strikes - hits, strikes)} of ${strikes} (60-85 %)`,
      `B6 shields broken at the weak point: ${pct(broken, shields)} of ${shields} (>= 50 %)`,
      `stun window: ${pct(readyBosses.filter((b) => b.stunCasts > 0).length, readyBosses.length)} of the ${readyBosses.length} bosses that had the Ultimate ready in a stun threw it there (>= 85 %)`,
    ];
    // The time of each boss by its place in the run (the first, second, third and the final one).
    const byPlace = [0, 1, 2, 3].map((place) =>
      median(
        dodging
          .map((r) => r.bosses[place])
          .filter((b): b is BossLog => b !== undefined && b.end !== null)
          .map(seconds),
      ).toFixed(0),
    );
    lines.push(`   time by place (1st, 2nd, 3rd, final): ${byPlace.join(' / ')} s`);
    console.log(lines.join('\n'));
  }, 3_600_000);
});
