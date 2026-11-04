import { describe, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { baseOf, createRun, type GameConfig, tick } from '../../src/domain';
import { activePolicy, commandFor } from './bots';

/**
 * Diagnosis of the 4D playtest (4F-A): is growth horizontal? For the active bot, per starter: wins,
 * health lost and where health came back from, which cards it took, how many balls it ended with
 * and how much of the damage the starter's line dealt. Run with `pnpm bench:diagnosis`.
 * DIAG_PER_STARTER (default 100) runs per starter.
 */
const PER_STARTER = Number(process.env.DIAG_PER_STARTER ?? 100);
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];

interface Totals {
  runs: number;
  wins: number;
  lostHp: number;
  healDrain: number;
  healBoss: number;
  cards: Record<string, number>;
  balls: number;
  starterShare: number;
  hybridShare: number;
  seconds: number;
  wave1Loss: number;
}

const blank = (): Totals => ({
  runs: 0,
  wins: 0,
  lostHp: 0,
  healDrain: 0,
  healBoss: 0,
  cards: {},
  balls: 0,
  starterShare: 0,
  hybridShare: 0,
  seconds: 0,
  wave1Loss: 0,
});

function measure(config: GameConfig, starter: string): Totals {
  const t = blank();
  for (let i = 0; i < PER_STARTER; i++) {
    const run = createRun(config, 31000 + i, starter);
    let damage = 0;
    let starterDamage = 0;
    let hybridDamage = 0;
    for (let n = 0; n < 60_000 && run.phase !== 'lost' && run.phase !== 'won'; n++) {
      const wave = run.wave.index;
      const out = tick(run, commandFor(activePolicy, run, config), config);
      for (const e of out.events) {
        if (e.type === 'leak') {
          t.lostHp += e.damage;
          if (wave === 0) t.wave1Loss += e.damage;
        } else if (e.type === 'heal') {
          // Boss heals are emitted in the tick of a bossDefeated; drain heals are always 1.
          if (out.events.some((x) => x.type === 'bossDefeated')) t.healBoss += e.amount;
          else t.healDrain += e.amount;
        } else if (e.type === 'pick') {
          t.cards[e.card.kind] = (t.cards[e.card.kind] ?? 0) + 1;
        } else if (e.type === 'hit') {
          const ball = run.loadout.find((b) => b.id === e.ballId);
          damage += e.damage;
          if (ball !== undefined) {
            if (baseOf(config, ball.species).base === baseOf(config, starter).base) {
              starterDamage += e.damage;
            }
            if (ball.hybrid) hybridDamage += e.damage;
          }
        }
      }
    }
    t.runs += 1;
    if (run.phase === 'won') t.wins += 1;
    t.balls += run.loadout.length;
    t.seconds += run.tickCount / 60;
    if (damage > 0) {
      t.starterShare += starterDamage / damage;
      t.hybridShare += hybridDamage / damage;
    }
  }
  return t;
}

describe('diagnosis of the 4D playtest', () => {
  it('reports growth, health and starters', { timeout: 900_000 }, () => {
    const rows = STARTERS.map((s) => [s, measure(gameConfig, s)] as const);
    const fmt = (n: number, d = 1): string => n.toFixed(d);
    const lines = rows.map(([s, t]) => {
      const cards = Object.entries(t.cards)
        .map(([k, v]) => `${k} ${fmt(v / t.runs)}`)
        .join(', ');
      return [
        s.padEnd(10),
        `win ${fmt((100 * t.wins) / t.runs, 0)} %`,
        `time ${fmt(t.seconds / t.runs, 0)} s`,
        `hp lost ${fmt(t.lostHp / t.runs)}`,
        `(wave 1: ${fmt(t.wave1Loss / t.runs)})`,
        `heal drain ${fmt(t.healDrain / t.runs)} boss ${fmt(t.healBoss / t.runs)}`,
        `final balls ${fmt(t.balls / t.runs)}`,
        `starter dmg ${fmt((100 * t.starterShare) / t.runs, 0)} %`,
        `hybrid dmg ${fmt((100 * t.hybridShare) / t.runs, 0)} %`,
        `cards/run: ${cards}`,
      ].join(' | ');
    });
    console.log(`\nDIAGNOSIS ${PER_STARTER} runs per starter, active bot\n${lines.join('\n')}`);
  });
});
