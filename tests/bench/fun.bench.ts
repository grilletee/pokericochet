import { describe, expect, it } from 'vitest';
import { mergeConfig } from '../../src/app/tune';
import { gameConfig } from '../../src/data';
import { createBall, type GameConfig, hitDamage } from '../../src/domain';
import { pauseSeconds } from '../../src/ui';
import {
  activeAgainstStatsPolicy,
  activeAutoPolicy,
  activeNoSignaturePolicy,
  activePolicy,
  activeRandomReplacePolicy,
  activeRecruitPolicy,
  activeStatsPolicy,
  activeTrainPolicy,
  activeUpgradesPolicy,
  chaserPolicy,
  type Outcome,
  type Policy,
  playRun,
  randomPolicy,
  standStillPolicy,
} from './bots';

/**
 * Fun metrics of GDD-v2 (ADR-033), measured with bots that USE the mechanics. Targets (hypotheses,
 * to be validated with the author's own play; the 35-50 % is the ACTIVE BOT's, not the player's):
 *  M1  agency            active - still win rate                      >= 30 points
 *  M2  decisions         level-ups + replace screens per minute       >= 3, longest gap <= 45 s
 *  M3  visible stages    stage changes per run, the first before 2:00 >= 4
 *  M4  aim               active - active-auto win rate                >= 15 points
 *  M6  identity          damage share of the starter's line / top 2   >= 25 % / >= 55 %
 *  M7  starters          best - worst win rate                        <= 10 points
 *  M8  real choice       win rate of 4 card tastes, spread            <= 15 points; balanced takes upgrades/train >= 35 %
 *  M9  health            gross loss >= 1 x max, healed <= 25 % of it, min hp <= 5 in >= 60 % of wins, wave 1 <= 2
 *  M10 pauses            replace screens per minute                   <= 1 on average
 * 4F-C (ADR-036..039):
 *  M11 named moves       labels the player sees per minute            >= 10 (< 25); every Pokémon a move per 40 s
 *  M12 starter signature casts per minute once ready, thrown by the player   >= 3, ready < 120 s, first thrown <= 5 s later
 *  M13 moves' damage     share of the total damage                    15 % - 35 %
 * 4F-D (identity):
 *  M16 evolution moment  real seconds of pause per minute of play  <= 4
 *  M17 signature worth   win rate with it thrown - never thrown          3 - 15 points
 *  M14 line parity       damage growth by stage, 2 / 1 / 0 forms      within +-15 % of each other
 *  M15 stats matter      bot that replaces by stats - at random       >= 8 points of win rate
 *  pickups               balls collected by hand / balls that left, per speed cap (ADR-038)
 * Run with `pnpm bench:fun`. FUN_PER_STARTER sets the runs per starter (default 50; M7 asks for 300).
 * FUN_PATCH is a JSON object merged over the shipped config to compare tunings.
 * FUN_SECTIONS (comma list of: policies, starters, tastes, moves, parity, stats) limits the work.
 */
const PER_STARTER = Number(process.env.FUN_PER_STARTER ?? 50);
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];
const TICKS_PER_MINUTE = 3600;
const SECTIONS = (process.env.FUN_SECTIONS ?? 'policies,starters,tastes,moves,parity,stats').split(
  ',',
);

function patched(): GameConfig {
  const raw = process.env.FUN_PATCH;
  return raw ? mergeConfig(gameConfig, JSON.parse(raw)) : gameConfig;
}

function play(config: GameConfig, policy: () => Policy, starters = STARTERS): Outcome[] {
  const outcomes: Outcome[] = [];
  for (const [k, starter] of starters.entries()) {
    for (let i = 0; i < PER_STARTER; i++) {
      outcomes.push(playRun(config, 9000 + k * 1000 + i, starter, policy()));
    }
  }
  return outcomes;
}

function wilson(wins: number, n: number): [number, number] {
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [centre - half, centre + half];
}

const winRate = (o: readonly Outcome[]): number =>
  o.filter((x) => x.result === 'won').length / o.length;
const mean = (o: readonly Outcome[], f: (x: Outcome) => number): number =>
  o.reduce((a, x) => a + f(x), 0) / o.length;
const median = (values: number[]): number => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const minutes = (x: Outcome): number => x.ticks / TICKS_PER_MINUTE;
const perMinute = (o: readonly Outcome[], f: (x: Outcome) => number): number =>
  o.reduce((a, x) => a + f(x), 0) / o.reduce((a, x) => a + minutes(x), 0);
const pct = (n: number): string => `${(100 * n).toFixed(0)}%`;

function diff(a: readonly Outcome[], b: readonly Outcome[]): string {
  const pa = winRate(a);
  const pb = winRate(b);
  const se = Math.sqrt((pa * (1 - pa)) / a.length + (pb * (1 - pb)) / b.length);
  const d = 100 * (pa - pb);
  return `${d.toFixed(0)} points (95 % CI ${(d - 196 * se).toFixed(0)}..${(d + 196 * se).toFixed(0)})`;
}

function row(name: string, o: readonly Outcome[]): string {
  const wins = o.filter((x) => x.result === 'won').length;
  const [lo, hi] = wilson(wins, o.length);
  return [
    `${name.padEnd(14)} win ${(100 * winRate(o)).toFixed(0).padStart(3)}% [${(100 * lo).toFixed(0)}-${(100 * hi).toFixed(0)}]`,
    `boss ${pct(o.filter((x) => x.bossReached).length / o.length)}`,
    `decisions/min ${perMinute(o, (x) => x.decisions).toFixed(2)} gap ${(median(o.map((x) => x.maxDecisionGapTicks)) / 60).toFixed(0)}s`,
    `replace/min ${perMinute(o, (x) => x.replacePauses).toFixed(2)}`,
    `stages ${mean(o, (x) => x.evolutions).toFixed(1)} first ${(median(o.map((x) => x.firstEvolveTicks)) / 60).toFixed(0)}s`,
    `team ${mean(o, (x) => x.members).toFixed(1)} balls ${mean(o, (x) => x.balls).toFixed(1)} lv ${mean(o, (x) => x.teamLevels).toFixed(0)}`,
    `hp lost ${mean(o, (x) => x.hpLost).toFixed(1)} healed ${mean(o, (x) => x.hpHealed).toFixed(1)}`,
    `min ${mean(o, minutes).toFixed(1)}`,
  ].join(' | ');
}

const UPGRADE_KINDS = ['train', 'power', 'cadence', 'team'];
function upgradeShare(o: readonly Outcome[]): number {
  let up = 0;
  let all = 0;
  for (const x of o) {
    for (const [kind, n] of Object.entries(x.cards)) {
      all += n;
      if (UPGRADE_KINDS.includes(kind)) up += n;
    }
  }
  return all === 0 ? 0 : up / all;
}

/**
 * M14: how much a Pokémon's damage grows from stage 1 to 2 and 3 through its stats and the stage
 * boost, for lines of two, one and no extra forms (ADR-037). Level and type are divided out, so
 * only what the form and the stage give is compared. Analytic: no run is played.
 */
function parityLines(config: GameConfig): string[] {
  const bases = [...config.ballSpecies, ...config.enemySpecies];
  const lines = config.lines ?? {};
  const levelOf = [1, 3, 6];
  const growth = (cfg: GameConfig, base: string, stage: number): number => {
    const value = (s: number): number => {
      const level = levelOf[s - 1] ?? 1;
      const ball = createBall(cfg, base, 1, 0, level);
      const levels = cfg.stats.levelMultiplier;
      return (
        hitDamage(cfg, ball, 'electric') /
        (levels[level - 1] ?? 1) /
        cfg.stats.typeDamage[ball.type]
      );
    };
    return value(stage) / value(1);
  };
  const noEvolution = (id: string): GameConfig => ({
    ...config,
    lines: Object.fromEntries(Object.entries(lines).filter(([base]) => base !== id)),
  });
  interface Group {
    readonly name: string;
    readonly picks: readonly { base: string; cfg: GameConfig }[];
  }
  const withLines = (count: number): string[] =>
    bases.filter((b) => (lines[b]?.length ?? 0) === count);
  const groups: Group[] = [
    { name: 'three forms', picks: withLines(2).map((base) => ({ base, cfg: config })) },
    { name: 'two forms', picks: withLines(1).map((base) => ({ base, cfg: config })) },
    // The same species as the previous group with their evolution taken away.
    {
      name: 'no evolution',
      picks: withLines(1).map((base) => ({ base, cfg: noEvolution(base) })),
    },
  ];
  const mean2 = (g: Group, stage: number): number =>
    g.picks.reduce((a, p) => a + growth(p.cfg, p.base, stage), 0) / Math.max(1, g.picks.length);
  const ref2 = mean2(groups[0] as Group, 2);
  const ref3 = mean2(groups[0] as Group, 3);
  const off = (value: number, ref: number): string => `${(100 * (value / ref - 1)).toFixed(0)} %`;
  return [
    'M14 line parity: growth of the damage of a Pokémon from stats and stage boost (x of stage 1)',
    ...groups.map((g) => {
      const g2 = mean2(g, 2);
      const g3 = mean2(g, 3);
      return `  ${g.name.padEnd(13)} n=${String(g.picks.length).padStart(2)}  stage 2 x${g2.toFixed(2)} (${off(g2, ref2)})  stage 3 x${g3.toFixed(2)} (${off(g3, ref3)})`;
    }),
    '  target: every group within +-15 % of the three-form line at each stage',
  ];
}

describe('fun metrics', () => {
  it('reports M1-M15 for the shipped (or patched) configuration', () => {
    const config = patched();
    const lines: string[] = [
      `\nFUN  ${PER_STARTER} runs per starter${process.env.FUN_PATCH ? `  patch ${process.env.FUN_PATCH}` : ''}`,
    ];
    const active = play(config, () => activePolicy);
    if (SECTIONS.includes('policies')) {
      const activeAuto = play(config, () => activeAutoPolicy);
      const still = play(config, () => standStillPolicy);
      const chaser = play(config, () => chaserPolicy);
      const random = play(
        config,
        (() => {
          let k = 0;
          return () => randomPolicy(++k);
        })(),
      );
      const noSignature = play(config, () => activeNoSignaturePolicy);
      lines.push(
        row('active', active),
        row('active-no-sig', noSignature),
        `M17 the signature is worth: active - never throws it = ${diff(active, noSignature)}   target 3-15 points (it should matter, not decide)`,
        row('active-auto', activeAuto),
        row('chaser', chaser),
        row('still', still),
        row('random', random),
        '',
        `M1 agency (active - still):      ${diff(active, still)}   target >= 30`,
        `M4 aim (active - active-auto):   ${diff(active, activeAuto)}   target >= 15`,
        `M2 decisions/min ${perMinute(active, (x) => x.decisions).toFixed(2)} (>= 3), median longest gap ${(median(active.map((x) => x.maxDecisionGapTicks)) / 60).toFixed(0)} s (<= 45)`,
        `M3 stage changes ${mean(active, (x) => x.evolutions).toFixed(1)} per run (>= 4), first at ${(median(active.map((x) => x.firstEvolveTicks)) / 60).toFixed(0)} s (< 120)`,
        `M6 identity: starter line ${pct(mean(active, (x) => x.starterShare))} of the damage (>= 25 %), top 2 ${pct(mean(active, (x) => x.top2Share))} (>= 55 %)`,
        `M10 replace screens per minute: ${perMinute(active, (x) => x.replacePauses).toFixed(2)} mean (<= 1); answered: ${mean(active, (x) => x.replaced).toFixed(1)} swaps, ${mean(active, (x) => x.released).toFixed(1)} released, ${mean(active, (x) => x.captureLevels).toFixed(1)} levels from duplicates per run`,
      );
      const won = active.filter((x) => x.result === 'won');
      const lowHp = won.length === 0 ? 0 : won.filter((x) => x.minHp <= 5).length / won.length;
      const lost = mean(active, (x) => x.hpLost);
      lines.push(
        `M9 health: gross loss ${lost.toFixed(1)} (>= ${config.player.maxHp}), healed ${pct(mean(active, (x) => x.hpHealed) / Math.max(1e-9, lost))} of it (<= 25 %), min hp <= 5 in ${pct(lowHp)} of wins (>= 60 %)`,
        '',
      );
    }
    if (SECTIONS.includes('starters')) {
      const wins = STARTERS.map((s) => {
        const o = active.filter((_, i) => Math.floor(i / PER_STARTER) === STARTERS.indexOf(s));
        return {
          s,
          p: winRate(o),
          loss: mean(o, (x) => x.wave1Loss),
          share: mean(o, (x) => x.starterShare),
        };
      });
      const best = Math.max(...wins.map((w) => w.p));
      const worst = Math.min(...wins.map((w) => w.p));
      lines.push(
        ...wins.map(
          (w) =>
            `  ${w.s.padEnd(10)} win ${pct(w.p)}  wave 1 loss ${w.loss.toFixed(2)} hp (<= 2)  starter damage ${pct(w.share)}`,
        ),
        `M7 starters: best - worst = ${(100 * (best - worst)).toFixed(0)} points (<= 10; n = ${PER_STARTER} per starter, error about ${(100 * Math.sqrt(0.5 / PER_STARTER)).toFixed(0)} points per starter)`,
        '',
      );
    }
    if (SECTIONS.includes('tastes')) {
      const tastes = [
        ['balanced', active],
        ['upgrades-first', play(config, () => activeUpgradesPolicy)],
        ['train-first', play(config, () => activeTrainPolicy)],
        ['recruit-first', play(config, () => activeRecruitPolicy)],
      ] as const;
      const rates = tastes.map(([, o]) => winRate(o));
      for (const [name, o] of tastes) {
        lines.push(
          `  ${name.padEnd(15)} win ${pct(winRate(o))}  upgrade+train share of its cards ${pct(upgradeShare(o))}`,
        );
      }
      lines.push(
        `M8 real choice: spread ${(100 * (Math.max(...rates) - Math.min(...rates))).toFixed(0)} points (<= 15); balanced takes upgrades or train ${pct(upgradeShare(active))} of its cards (>= 35 %)`,
      );
    }
    if (SECTIONS.includes('moves')) {
      const sum = (f: (x: Outcome) => number): number => active.reduce((a, x) => a + f(x), 0);
      const offered = sum((x) => x.labelsShown + x.labelsMerged + x.labelsDropped);
      const coverage = active.flatMap((x) => x.castCoverage);
      const castingOften = coverage.filter((c) => c.casts > 0 && c.ticks / c.casts <= 40 * 60);
      const gaps = coverage.filter((c) => c.casts > 0).map((c) => c.ticks / c.casts / 60);
      const late = active.filter((x) => x.starterLateTicks > 0);
      const lateMinutes = late.reduce((a, x) => a + x.starterLateTicks / TICKS_PER_MINUTE, 0);
      const firstDelays = late
        .filter((x) => x.starterFirstCastDelay >= 0)
        .map((x) => x.starterFirstCastDelay / 60);
      const moveShare =
        sum((x) => x.moveDamage) /
        Math.max(
          1e-9,
          sum((x) => x.moveDamage + x.hitDamage),
        );
      lines.push(
        '',
        `M11 named moves: ${perMinute(active, (x) => x.moveCasts).toFixed(1)} cast per minute, ${perMinute(active, (x) => x.labelsShown).toFixed(1)} labels shown per minute (>= 10, < 25), ${pct(sum((x) => x.labelsDropped) / Math.max(1, offered))} of casts left without a label (screen full), ${pct(sum((x) => x.labelsMerged) / Math.max(1, offered))} merged`,
        `    Pokémon casting at least once per 40 s: ${pct(castingOften.length / Math.max(1, coverage.length))} of ${coverage.length}; median seconds between casts ${median(gaps).toFixed(0)}; never cast: ${pct(coverage.filter((c) => c.casts === 0).length / Math.max(1, coverage.length))}`,
        `M12 starter signature (thrown by the player): ${(sum((x) => x.starterCastsLate) / Math.max(1e-9, lateMinutes)).toFixed(1)} casts per minute after it was ready the first time (>= 3), ready after a median of ${median(late.map((x) => x.signatureReadyTick / 60)).toFixed(0)} s (<= 120), first thrown ${median(firstDelays).toFixed(0)} s after (<= 5); ${pct(late.length / active.length)} of runs reach it (>= 90 %)`,
        `M16 pause of the evolution moment: ${(
          active.reduce((a, x) => a + pauseSeconds(x.stepList), 0) /
            Math.max(
              1e-9,
              active.reduce((a, x) => a + x.ticks / TICKS_PER_MINUTE, 0),
            )
        ).toFixed(
          2,
        )} real seconds per minute of play (<= 4), longest run ${Math.max(...active.map((x) => pauseSeconds(x.stepList))).toFixed(1)} s`,
        `    by starter: ${STARTERS.map((s, k) => {
          const mine = active.filter((_, i) => Math.floor(i / PER_STARTER) === k);
          return `${s} ready in ${pct(mine.filter((x) => x.signatureReadyTick >= 0).length / mine.length)} (kept ${pct(mine.filter((x) => x.starterKept).length / mine.length)})`;
        }).join(', ')}`,
        `M13 moves' share of the damage: ${pct(moveShare)} (15 % - 35 %)`,
        `stage steps per run: evolve ${mean(active, (x) => x.steps.evolve).toFixed(1)}, awaken ${mean(active, (x) => x.steps.awaken).toFixed(1)}, peak ${mean(active, (x) => x.steps.peak).toFixed(1)}`,
        `pickups: ${pct(
          sum((x) => x.collected) /
            Math.max(
              1,
              sum((x) => x.collected + x.recalled),
            ),
        )} of the balls that left were picked up by hand (${mean(active, (x) => x.drops).toFixed(0)} left per run); ${pct(
          1 -
            sum((x) => x.lateCaptures) /
              Math.max(
                1,
                sum((x) => x.captureDrops),
              ),
        )} of captured balls were caught in time (${mean(active, (x) => x.captureDrops).toFixed(1)} dropped per run); ball speed cap ${config.ball.speedCap}`,
        `    ticks a ball waits on the floor before the player picks it up: mean ${mean(active, (x) => x.pickupLatencyMean).toFixed(1)}, slowest tenth ${mean(active, (x) => x.pickupLatencyP90).toFixed(0)} (60 ticks = 1 s)`,
      );
    }
    if (SECTIONS.includes('parity')) lines.push('', ...parityLines(config));
    if (SECTIONS.includes('stats')) {
      const byStats = play(config, () => activeStatsPolicy(config));
      const random = play(
        config,
        (() => {
          let k = 0;
          return () => activeRandomReplacePolicy(++k);
        })(),
      );
      const against = play(config, () => activeAgainstStatsPolicy(config));
      lines.push(
        '',
        `  replace by stats ${pct(winRate(byStats))}  at random ${pct(winRate(random))}  against the stats ${pct(winRate(against))}  (balanced, by level: ${pct(winRate(active))})`,
        `M15 stats matter: by stats - random = ${diff(byStats, random)}   target >= 8; by stats - against = ${diff(byStats, against)}`,
      );
    }
    console.log(lines.join('\n'));
    expect(active.length).toBe(PER_STARTER * STARTERS.length);
  }, 3_600_000);
});
