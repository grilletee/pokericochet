import { describe, expect, it } from 'vitest';
import { mergeConfig } from '../../src/app/tune';
import { gameConfig } from '../../src/data';
import type { GameConfig } from '../../src/domain';
import {
  activeAutoPolicy,
  activePolicy,
  activeRecruitPolicy,
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
 * Run with `pnpm bench:fun`. FUN_PER_STARTER sets the runs per starter (default 50; M7 asks for 300).
 * FUN_PATCH is a JSON object merged over the shipped config to compare tunings.
 * FUN_SECTIONS (comma list of: policies, starters, tastes) limits the work.
 */
const PER_STARTER = Number(process.env.FUN_PER_STARTER ?? 50);
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];
const TICKS_PER_MINUTE = 3600;
const SECTIONS = (process.env.FUN_SECTIONS ?? 'policies,starters,tastes').split(',');

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

describe('fun metrics', () => {
  it('reports M1-M10 for the shipped (or patched) configuration', () => {
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
      lines.push(
        row('active', active),
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
    console.log(lines.join('\n'));
    expect(active.length).toBe(PER_STARTER * STARTERS.length);
  }, 3_600_000);
});
