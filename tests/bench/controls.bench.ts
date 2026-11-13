import { describe, it } from 'vitest';
import { mergeConfig } from '../../src/app/tune';
import { gameConfig } from '../../src/data';
import type { GameConfig } from '../../src/domain';
import {
  activePolicy,
  type Outcome,
  type Policy,
  playRun,
  schemeMotionPolicy,
  schemeSlingPolicy,
  schemeSmartPolicy,
  schemeTwinPolicy,
} from './bots';

/**
 * The touch control schemes of the 4G-G, compared with bots (the author decides on the phone; this
 * only says whether a scheme is playable at all and how it differs). The SAME bot (dodges, collects,
 * balanced cards) plays every scheme; only what the launcher does with the balls changes:
 *
 *  classic  the mouse: the bot aims by hand (the reference)
 *  twin     4G-H, the two thumbs in landscape: aims by hand, moves with a finger the launcher follows
 *  smart    A: the launcher picks the target, the bot only moves
 *  motion   B: no aim, the balls lean with the movement
 *  sling    C: the balls leave when the bot lifts its finger (every 45 ticks)
 *
 * Metrics: wins, health lost to leaks and attacks, balls collected, kills and the wave reached.
 * Run with `pnpm bench:controls`. CONTROLS_PER_STARTER sets the runs per starter (default 25).
 */
const PER_STARTER = Number(process.env.CONTROLS_PER_STARTER ?? 25);
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];

const SCHEMES: readonly { name: string; policy: Policy }[] = [
  { name: 'classic (mouse)', policy: activePolicy },
  { name: 'twin (2 thumbs)', policy: schemeTwinPolicy },
  { name: 'A smart', policy: schemeSmartPolicy },
  { name: 'B motion', policy: schemeMotionPolicy },
  { name: 'C sling', policy: schemeSlingPolicy },
];

// CONTROLS_PATCH: a JSON object merged over the shipped config to compare tunings of the table.
const config: GameConfig = process.env.CONTROLS_PATCH
  ? mergeConfig(gameConfig, JSON.parse(process.env.CONTROLS_PATCH))
  : gameConfig;

function play(policy: Policy): Outcome[] {
  const out: Outcome[] = [];
  for (const starter of STARTERS) {
    for (let i = 0; i < PER_STARTER; i++) {
      out.push(playRun(config, 1000 + i * 7919 + STARTERS.indexOf(starter), starter, policy));
    }
  }
  return out;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

function row(name: string, o: readonly Outcome[]): string {
  const wins = o.filter((x) => x.result === 'won').length;
  const pct = (100 * wins) / o.length;
  return [
    name.padEnd(16),
    `win ${pct.toFixed(0).padStart(3)} %`,
    `hp lost ${mean(o.map((x) => x.hpLost))
      .toFixed(1)
      .padStart(5)}`,
    `collected ${mean(o.map((x) => x.collected))
      .toFixed(1)
      .padStart(5)}`,
    `recalled ${mean(o.map((x) => x.recalled))
      .toFixed(1)
      .padStart(5)}`,
    `kills ${mean(o.map((x) => x.kills))
      .toFixed(0)
      .padStart(4)}`,
    `wave ${mean(o.map((x) => x.wave + 1)).toFixed(1)}`,
    `balls ${mean(o.map((x) => x.balls)).toFixed(1)}`,
    `${(mean(o.map((x) => x.ticks)) / 3600).toFixed(1)} min`,
  ].join('  ');
}

describe('touch control schemes (4G-G)', () => {
  it(`prints the same bot with each scheme (${PER_STARTER} runs per starter)`, () => {
    const lines = SCHEMES.map(({ name, policy }) => row(name, play(policy)));
    console.log(`\n${lines.join('\n')}\n`);
  }, 1_800_000);
});
