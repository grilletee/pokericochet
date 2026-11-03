import { createBall } from './combat';
import type { GameConfig } from './config';
import { SpatialGrid } from './grid';
import { imul32 } from './int32';
import { cloneRng, deriveRng, type RngState } from './rng';
import type { Ball, BallBody, Enemy, GameEvent } from './types';

export type Phase = 'playing' | 'lost';

export interface Player {
  x: number;
  hp: number;
}

/**
 * Whole state of a run. Mutable, with a single owner: `tick` (ADR-007). A run is a function of
 * (seed, commands). `events` and `grid` are transient and excluded from clone and hash.
 */
export interface Run {
  seed: number;
  tickCount: number;
  phase: Phase;
  rng: { spawn: RngState; aim: RngState };
  player: Player;
  loadout: Ball[];
  /** Per loadout slot: >0 cooling down, 0 ready, -1 in flight. */
  cooldowns: number[];
  bodies: BallBody[];
  /** Always ordered by ascending id. */
  enemies: Enemy[];
  nextEnemyId: number;
  events: GameEvent[];
  grid: SpatialGrid;
}

function newGrid(config: GameConfig): SpatialGrid {
  return new SpatialGrid(
    config.arena.width,
    config.arena.height,
    config.grid.cellSize,
    config.ball.radius + config.enemy.radius,
  );
}

export function createRun(config: GameConfig, seed: number, starterSpecies: string): Run {
  const normalizedSeed = seed >>> 0;
  return {
    seed: normalizedSeed,
    tickCount: 0,
    phase: 'playing',
    rng: { spawn: deriveRng(normalizedSeed, 'spawn'), aim: deriveRng(normalizedSeed, 'aim') },
    player: { x: config.arena.width / 2, hp: config.player.maxHp },
    loadout: [createBall(config, starterSpecies, 1)],
    cooldowns: [0],
    bodies: [],
    enemies: [],
    nextEnemyId: 1,
    events: [],
    grid: newGrid(config),
  };
}

export function cloneRun(run: Run): Run {
  return {
    seed: run.seed,
    tickCount: run.tickCount,
    phase: run.phase,
    rng: { spawn: cloneRng(run.rng.spawn), aim: cloneRng(run.rng.aim) },
    player: { x: run.player.x, hp: run.player.hp },
    loadout: run.loadout.slice(), // balls are immutable values
    cooldowns: run.cooldowns.slice(),
    bodies: run.bodies.map((b) => ({ ...b })),
    enemies: run.enemies.map((e) => ({ ...e })),
    nextEnemyId: run.nextEnemyId,
    events: run.events.slice(),
    grid: new SpatialGrid(run.grid.width, run.grid.height, run.grid.cellSize, run.grid.pad),
  };
}

// Float64 -> two uint32 words. The word order follows platform endianness (little-endian on
// every platform the game targets); the hash is only compared within one runtime.
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

class Hasher {
  private h1 = 0x811c9dc5 | 0;
  private h2 = 0x9747b28c | 0;

  word(w: number): void {
    this.h1 = imul32(this.h1 ^ w, 0x01000193);
    this.h2 = (imul32(this.h2 ^ w, 0x85ebca6b) + 0x27d4eb2f) | 0;
    this.h2 ^= this.h2 >>> 13;
  }

  int(n: number): void {
    this.word(n | 0);
  }

  num(n: number): void {
    f64[0] = n;
    this.word(u32[0] ?? 0);
    this.word(u32[1] ?? 0);
  }

  str(s: string): void {
    this.word(s.length);
    for (let i = 0; i < s.length; i++) this.word(s.charCodeAt(i));
  }

  rng(r: RngState): void {
    this.int(r.a);
    this.int(r.b);
    this.int(r.c);
    this.int(r.d);
  }

  digest(): string {
    return (
      (this.h1 >>> 0).toString(16).padStart(8, '0') + (this.h2 >>> 0).toString(16).padStart(8, '0')
    );
  }
}

/**
 * 64-bit digest (16 hex digits) of the deterministic state of a run, used by tests to compare
 * runs. It covers everything that influences future ticks, and ignores `events` and `grid`.
 */
export function hashRun(run: Run): string {
  const h = new Hasher();
  h.int(run.seed);
  h.int(run.tickCount);
  h.str(run.phase);
  h.rng(run.rng.spawn);
  h.rng(run.rng.aim);
  h.num(run.player.x);
  h.num(run.player.hp);
  h.int(run.loadout.length);
  for (const ball of run.loadout) {
    h.int(ball.id);
    h.str(ball.species);
    h.str(ball.type);
    h.int(ball.level);
    h.int(ball.hybrid ? 1 : 0);
    h.int(ball.effects.length);
    for (const effect of ball.effects) {
      h.str(effect.kind);
      h.num(effect.strength);
    }
  }
  h.int(run.cooldowns.length);
  for (const cooldown of run.cooldowns) h.int(cooldown);
  h.int(run.bodies.length);
  for (const b of run.bodies) {
    h.int(b.slot);
    h.num(b.x);
    h.num(b.y);
    h.num(b.vx);
    h.num(b.vy);
  }
  h.int(run.enemies.length);
  for (const e of run.enemies) {
    h.int(e.id);
    h.str(e.species);
    h.str(e.type);
    h.num(e.hp);
    h.num(e.x);
    h.num(e.y);
    h.num(e.speed);
    h.num(e.radius);
    h.num(e.threat);
  }
  h.int(run.nextEnemyId);
  return h.digest();
}
