import { gameConfig } from '../../src/data';
import {
  castSignature,
  createBall,
  createRun,
  type Enemy,
  GAME_TYPES,
  type GameConfig,
  type GameType,
} from '../../src/domain';

/**
 * The value of an Ultimate (U1, 4H-B1): the damage one cast of the starter's signature deals,
 * averaged over 24 fixed situations. Each puts 8, 16 or 24 enemies of the four types at
 * pseudo-random places of the arena (8 layouts of each size) and the player aims at one of them.
 * The damage is the sum of the `damage` of the `move` event (the enemies have so much health
 * nothing is wasted), so it includes the starter's type damage and its effectiveness against the
 * mix, plus the burn the cast leaves. Slow is not counted.
 */
export const U1_SIZES = [8, 16, 24];
export const U1_LAYOUTS = 8;

/** A tiny seeded generator, for the bench and its test only (the domain has its own streams). */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function enemy(id: number, type: GameType, x: number, y: number): Enemy {
  return {
    id,
    species: 'psyduck',
    type,
    hp: 100000,
    x,
    y,
    speed: 0,
    radius: gameConfig.enemy.radius,
    threat: 1,
    xp: 1,
    burnTicks: 0,
    burnDps: 0,
    slowTicks: 0,
    slow: 0,
  };
}

/** Mean damage of one cast of the starter's signature at a level over the 24 situations. */
export function ultimateValue(config: GameConfig, starter: string, level: number): number {
  let total = 0;
  let casts = 0;
  for (const size of U1_SIZES) {
    for (let layout = 0; layout < U1_LAYOUTS; layout++) {
      const next = lcg(size * 1000 + layout);
      const run = createRun(config, 1, starter);
      const member = run.team[0];
      const first = run.loadout[0];
      if (member === undefined || first === undefined) throw new Error('no starter');
      (member as { level: number }).level = level;
      run.loadout[0] = createBall(config, starter, first.id, 0, level);
      run.enemies = Array.from({ length: size }, (_, i) =>
        enemy(
          i + 1,
          GAME_TYPES[i % GAME_TYPES.length] ?? 'fire',
          30 + next() * 420,
          40 + next() * 560,
        ),
      );
      const aimAt = run.enemies[Math.floor(next() * size)];
      if (aimAt === undefined) continue;
      run.autoAim = false;
      run.aimX = aimAt.x;
      run.aimY = aimAt.y;
      (member as { charge: number }).charge = 1000;
      run.events.length = 0;
      if (!castSignature(run, config, 0)) throw new Error(`${starter} level ${level}: not ready`);
      const move = run.events.find((e) => e.type === 'move');
      if (move?.type === 'move') total += move.damage;
      // The burn the cast left (dps per second over its ticks) is damage still to come.
      for (const e of run.enemies) total += (e.burnDps / 60) * e.burnTicks;
      casts += 1;
    }
  }
  return total / casts;
}
