import { createBall } from './combat';
import type { GameConfig } from './config';
import { SpatialGrid } from './grid';
import { imul32 } from './int32';
import { xpCost } from './progression';
import { cloneRng, deriveRng, nextInt, type RngState } from './rng';
import type { Ball, BallBody, Card, Enemy, GameEvent, Pickup } from './types';

/** `levelup` pauses the simulation until a card is picked (ADR-014). */
export type Phase = 'playing' | 'levelup' | 'won' | 'lost';

export interface Player {
  x: number;
  hp: number;
  maxHp: number;
  xp: number;
  /** xp needed for the next level. */
  xpNext: number;
  level: number;
  /** Multiplies every hit (damage cards). */
  damageMult: number;
  /** Multiplies the ball cooldown (cadence cards). */
  cooldownMult: number;
  /** Accumulated drain strength, towards healing 1 hp. */
  drain: number;
}

/** The boss fight (ADR-016). `id` is 0 until the boss has spawned. */
export interface BossState {
  /** True once the FINAL boss has appeared. */
  spawned: boolean;
  id: number;
  maxHp: number;
  /** Ticks since the boss appeared; the summons follow this clock. */
  tick: number;
  /** Bosses between waves that have appeared so far (ADR-028). */
  next: number;
  /** Bosses defeated so far, the final one included. */
  defeated: number;
  /** Type of the current boss's summons; '' = any type. */
  type: string;
}

export interface RunRng {
  /** What spawns, where and how fast. Never touched by combat. */
  spawn: RngState;
  /** Dispersion of the aim and the chance part of a pierce. */
  aim: RngState;
  /** Card offers. */
  cards: RngState;
  /** Whether a kill drops its ball (ADR-023). */
  capture: RngState;
  /** Whether a kill is rich. */
  loot: RngState;
  /** Wave themes and the species of the bosses (ADR-027, ADR-028): its own stream. */
  themes: RngState;
}

/**
 * Whole state of a run. Mutable, with a single owner: `tick` (ADR-007). A run is a function of
 * (seed, commands). `events` and `grid` are transient and excluded from clone and hash.
 */
export interface Run {
  seed: number;
  /** Species of the first ball; only for the results screen, it does not affect the run. */
  starter: string;
  /** Enemies killed so far (the boss included). */
  kills: number;
  tickCount: number;
  phase: Phase;
  rng: RunRng;
  player: Player;
  loadout: Ball[];
  /** Per loadout slot: >0 cooling down, 0 ready, -1 in flight or waiting on the floor. */
  cooldowns: number[];
  /** Kills since the last captured ball dropped (bad-luck protection of the capture chance). */
  captureMisses: number;
  /** Balls waiting to be collected, in the order they appeared (ADR-022, ADR-023). */
  pickups: Pickup[];
  /** Where the player aims, in arena pixels (ADR-021). */
  aimX: number;
  aimY: number;
  /** Assisted aim: the launcher targets the nearest enemy by itself. */
  autoAim: boolean;
  /** Theme id of each wave, drawn when the run starts ('' = none). */
  waveThemes: string[];
  /** Balls captured so far (species of the line and level), for the run summary (ADR-025). */
  captured: { species: string; level: number }[];
  nextBallId: number;
  bodies: BallBody[];
  /** Always ordered by ascending id. */
  enemies: Enemy[];
  nextEnemyId: number;
  wave: { index: number; tick: number };
  boss: BossState;
  /** Cards on offer while the phase is `levelup`; empty otherwise. */
  offers: Card[];
  events: GameEvent[];
  grid: SpatialGrid;
}

function newGrid(config: GameConfig): SpatialGrid {
  return new SpatialGrid(
    config.arena.width,
    config.arena.height,
    config.grid.cellSize,
    config.ball.radius +
      Math.max(
        config.enemy.radius,
        config.boss?.radius ?? 0,
        ...(config.interludes ?? []).map((b) => b.radius),
      ),
  );
}

/** One theme per wave, from the run's own `themes` stream (so spawns and cards are not disturbed). */
function drawThemes(config: GameConfig, rng: RngState): string[] {
  return config.waves.map((wave) => {
    const candidates = wave.themes ?? [];
    if (candidates.length === 0) return '';
    return candidates[nextInt(rng, candidates.length)] ?? '';
  });
}

export function createRun(config: GameConfig, seed: number, starterSpecies: string): Run {
  const normalizedSeed = seed >>> 0;
  const themesRng = deriveRng(normalizedSeed, 'themes');
  const waveThemes = drawThemes(config, themesRng);
  return {
    seed: normalizedSeed,
    starter: starterSpecies,
    kills: 0,
    tickCount: 0,
    phase: 'playing',
    rng: {
      spawn: deriveRng(normalizedSeed, 'spawn'),
      aim: deriveRng(normalizedSeed, 'aim'),
      cards: deriveRng(normalizedSeed, 'cards'),
      capture: deriveRng(normalizedSeed, 'capture'),
      loot: deriveRng(normalizedSeed, 'loot'),
      themes: themesRng,
    },
    player: {
      x: config.arena.width / 2,
      hp: config.player.maxHp,
      maxHp: config.player.maxHp,
      xp: 0,
      xpNext: xpCost(config, 1),
      level: 1,
      damageMult: 1,
      cooldownMult: 1,
      drain: 0,
    },
    loadout: [createBall(config, starterSpecies, 1)],
    cooldowns: [0],
    pickups: [],
    captureMisses: config.capture.startMisses,
    aimX: config.arena.width / 2,
    aimY: 0,
    autoAim: false,
    waveThemes,
    captured: [],
    nextBallId: 2,
    bodies: [],
    enemies: [],
    nextEnemyId: 1,
    wave: { index: 0, tick: 0 },
    boss: { spawned: false, id: 0, maxHp: 0, tick: 0, next: 0, defeated: 0, type: '' },
    offers: [],
    events: [],
    grid: newGrid(config),
  };
}

export function cloneRun(run: Run): Run {
  return {
    seed: run.seed,
    starter: run.starter,
    kills: run.kills,
    tickCount: run.tickCount,
    phase: run.phase,
    rng: {
      spawn: cloneRng(run.rng.spawn),
      aim: cloneRng(run.rng.aim),
      cards: cloneRng(run.rng.cards),
      capture: cloneRng(run.rng.capture),
      loot: cloneRng(run.rng.loot),
      themes: cloneRng(run.rng.themes),
    },
    player: { ...run.player },
    loadout: run.loadout.slice(), // balls are immutable values
    cooldowns: run.cooldowns.slice(),
    pickups: run.pickups.map((p) => ({ ...p })),
    captureMisses: run.captureMisses,
    aimX: run.aimX,
    aimY: run.aimY,
    autoAim: run.autoAim,
    waveThemes: run.waveThemes.slice(),
    captured: run.captured.map((c) => ({ ...c })),
    nextBallId: run.nextBallId,
    bodies: run.bodies.map((b) => ({ ...b })),
    enemies: run.enemies.map((e) => ({ ...e })),
    nextEnemyId: run.nextEnemyId,
    wave: { ...run.wave },
    boss: { ...run.boss },
    offers: run.offers.slice(), // cards are immutable values
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
  h.rng(run.rng.cards);
  h.rng(run.rng.capture);
  h.rng(run.rng.loot);
  h.rng(run.rng.themes);
  const p = run.player;
  h.num(p.x);
  h.num(p.hp);
  h.num(p.maxHp);
  h.num(p.xp);
  h.num(p.xpNext);
  h.int(p.level);
  h.num(p.damageMult);
  h.num(p.cooldownMult);
  h.num(p.drain);
  h.int(run.loadout.length);
  for (const ball of run.loadout) {
    h.int(ball.id);
    h.str(ball.species);
    h.str(ball.type);
    h.int(ball.level);
    h.int(ball.hybrid ? 1 : 0);
    h.str(ball.secondSpecies ?? '');
    h.str(ball.secondType ?? '');
    h.int(ball.effects.length);
    for (const effect of ball.effects) {
      h.str(effect.kind);
      h.num(effect.strength);
    }
  }
  h.int(run.cooldowns.length);
  for (const cooldown of run.cooldowns) h.int(cooldown);
  h.int(run.captureMisses);
  h.int(run.pickups.length);
  for (const p of run.pickups) {
    h.int(p.slot);
    h.str(p.species);
    h.str(p.type);
    h.num(p.x);
    h.num(p.y);
    h.int(p.level);
    h.int(p.ticks);
  }
  h.num(run.aimX);
  h.num(run.aimY);
  h.int(run.autoAim ? 1 : 0);
  h.int(run.nextBallId);
  h.int(run.bodies.length);
  for (const b of run.bodies) {
    h.int(b.slot);
    h.num(b.x);
    h.num(b.y);
    h.num(b.vx);
    h.num(b.vy);
    h.int(b.pierce);
    h.int(b.skipId);
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
    h.num(e.xp);
    h.int(e.burnTicks);
    h.num(e.burnDps);
  }
  h.int(run.nextEnemyId);
  h.int(run.wave.index);
  h.int(run.wave.tick);
  h.int(run.boss.spawned ? 1 : 0);
  h.int(run.boss.id);
  h.num(run.boss.maxHp);
  h.int(run.boss.tick);
  h.int(run.boss.next);
  h.int(run.boss.defeated);
  h.str(run.boss.type);
  h.int(run.waveThemes.length);
  for (const theme of run.waveThemes) h.str(theme);
  h.int(run.captured.length);
  for (const c of run.captured) {
    h.str(c.species);
    h.int(c.level);
  }
  h.int(run.offers.length);
  for (const card of run.offers) {
    h.str(card.kind);
    h.str(card.kind === 'newBall' ? card.species : '');
    h.int(card.kind === 'hybrid' ? card.a : -1);
    h.int(card.kind === 'hybrid' ? card.b : -1);
  }
  return h.digest();
}
