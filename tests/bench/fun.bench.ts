import { describe, expect, it } from 'vitest';
import { mergeConfig } from '../../src/app/tune';
import { gameConfig } from '../../src/data';
import type { GameConfig } from '../../src/domain';
import {
  activeAutoPolicy,
  activePolicy,
  chaserPolicy,
  type Outcome,
  type Policy,
  playRun,
  randomPolicy,
  standStillPolicy,
} from './bots';

/**
 * Fun metrics of GDD-v1 (Informe-4A), measured with bots that USE the new mechanics:
 *  M1 agency      active - still win rate            (target >= 30 points)
 *  M2 new balls   per minute, and the longest drought (target >= 2 per minute, drought <= 45 s)
 *  M3 evolutions  per run and runs with a hybrid     (target see Informe-4A)
 *  M4 aim         active - active-auto win rate      (target >= 15 points, ADR-021)
 * plus guard rails (the active bot wins between 40 % and 70 %). Bots are a proxy for fun.
 * Run with `pnpm bench:fun`. FUN_PER_STARTER sets the runs per starter (default 50). FUN_PATCH is
 * a JSON object merged over the shipped config (e.g. {"capture":{"chance":0.12}}) to compare tunings.
 */
const PER_STARTER = Number(process.env.FUN_PER_STARTER ?? 50);
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];
const TICKS_PER_MINUTE = 3600;

function patched(): GameConfig {
  const raw = process.env.FUN_PATCH;
  return raw ? mergeConfig(gameConfig, JSON.parse(raw)) : gameConfig;
}

function play(config: GameConfig, policy: () => Policy): Outcome[] {
  const outcomes: Outcome[] = [];
  for (const [k, starter] of STARTERS.entries()) {
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
  const minutes = mean(o, (x) => x.ticks / TICKS_PER_MINUTE);
  return [
    `${name.padEnd(11)} win ${(100 * winRate(o)).toFixed(0).padStart(3)}% [${(100 * lo).toFixed(0)}-${(100 * hi).toFixed(0)}]`,
    `boss ${((100 * o.filter((x) => x.bossReached).length) / o.length).toFixed(0)}%`,
    `new balls/min ${(mean(o, (x) => x.newBalls) / minutes).toFixed(2)}`,
    `first ball ${(median(o.map((x) => x.firstBallTicks)) / 60).toFixed(0)}s`,
    `median drought ${(median(o.map((x) => x.maxDroughtTicks)) / 60).toFixed(0)}s`,
    `captures ${mean(o, (x) => x.captures).toFixed(1)}`,
    `collected ${mean(o, (x) => x.collected).toFixed(0)} recalled ${mean(o, (x) => x.recalled).toFixed(0)}`,
    `balls ${mean(o, (x) => x.balls).toFixed(1)}`,
    `evolutions ${mean(o, (x) => x.evolutions).toFixed(2)} hybrid runs ${((100 * o.filter((x) => x.hybrids > 0).length) / o.length).toFixed(0)}%`,
    `min ${minutes.toFixed(1)}`,
  ].join(' | ');
}

describe('fun metrics', () => {
  it('reports M1-M4 for the shipped (or patched) configuration', () => {
    const config = patched();
    const active = play(config, () => activePolicy);
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
    console.log(
      [
        `\nFUN  ${PER_STARTER * 4} runs per policy${process.env.FUN_PATCH ? `  patch ${process.env.FUN_PATCH}` : ''}`,
        row('active', active),
        row('active-auto', activeAuto),
        row('chaser', chaser),
        row('still', still),
        row('random', random),
        `M1 agency (active - still):        ${diff(active, still)}   target >= 30`,
        `M4 aim (active - active-auto):     ${diff(active, activeAuto)}   target >= 15`,
        '',
      ].join('\n'),
    );
    expect(active.length).toBe(still.length);
  }, 1_800_000);
});
