import { effectiveness } from './combat';
import type { GameConfig } from './config';
import { SpatialGrid } from './grid';
import { imul32 } from './int32';
import { biomeLines, drawPool, fairLines } from './pool';
import { xpCost } from './progression';
import { cloneRng, deriveRng, nextInt, type RngState } from './rng';
import { addMember } from './team';
import type {
  AimMode,
  Ball,
  BallBody,
  Card,
  Enemy,
  GameEvent,
  GameType,
  Member,
  Pickup,
} from './types';

/**
 * `levelup` pauses the simulation until a card is picked (ADR-014); `replace` until the player
 * answers what to do with a capture that finds the team full (ADR-030).
 */
export type Phase = 'playing' | 'levelup' | 'replace' | 'won' | 'lost';

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
  /** Accumulated drain strength, towards healing 1 hp. */
  drain: number;
  /** Ticks left in which attacks of bosses and enemies do not hurt (after a hit, 4G-G). */
  invuln: number;
  /** Smoothed sideways speed in pixels per tick (4G-G, `motion` aim: the launch leans with it). */
  vel: number;
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
  /**
   * The fight (ADR-053): 0 = normal, 1 = fury. The boss is not charging (`coreOpen` 0) until
   * `coreIn` runs out, then it charges its strong attack for a while (a warning only since 4G-H).
   */
  phase: number;
  coreOpen: number;
  coreIn: number;
  /** Ticks until the next round of attacks. */
  attackIn: number;
  /** Reinforcements a `summon` attack asked for and the wave code has not spawned yet. */
  summonDebt: number;
  /**
   * The state of the exclusive mechanics of a legendary (ADR-054): how much the field is squeezed
   * (0..1, `tide`), ticks left of the barrier and of the slowdown, and the clock of the mechanic.
   */
  squeeze: number;
  barrier: number;
  timeSlow: number;
  mechIn: number;
  /** Ticks before a portal can carry the player again (so they are not carried back at once). */
  portalCool: number;
  /** Base species of the bosses between waves met so far: none comes twice in a run. */
  used: string[];
}

/** Something a boss put on the floor or in the air (ADR-053). */
export interface Hazard {
  kind:
    | 'column'
    | 'comb'
    | 'sweep'
    | 'rain'
    | 'shot'
    | 'zone'
    | 'gust'
    | 'crack'
    | 'portal'
    | 'blast';
  x: number;
  /** A `portal` carries whoever touches it to this x (its pair); 0 for the rest. */
  link: number;
  /** Height of a `shot` (arena pixels); 0 for the rest. */
  y: number;
  width: number;
  /** Ticks left of the warning; it strikes (or starts, or falls) when it reaches 0. */
  telegraph: number;
  /** Ticks left of the strike. */
  active: number;
  damage: number;
  /** Pixels per tick: a `sweep` moves, a `shot` falls, a `gust` pushes (signed). */
  speed: number;
  /** True once it hurt the player: it hurts once. */
  struck: boolean;
  /** The type of the enemy that fired it (shots of enemies only): the render draws it by type (4G-G). */
  type?: GameType;
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
  /** The pool of species of the run (ADR-048): drawn once, at the start. */
  pool: RngState;
  /** Where the boss attacks (ADR-046): its own stream, so the fight never moves another one. */
  boss: RngState;
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
  /** The Pokémon of the team, at most `team.maxMembers` (ADR-030). */
  team: Member[];
  /** Capture waiting for an answer while the phase is `replace` (`stage`: its evolution stage). */
  pendingCapture: { species: string; stage: number } | null;
  /** The balls the team fires, derived from the Pokémon (`Ball.owner`); the physics works on them. */
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
  /** How the launcher aims when the assisted aim is off (4G-G, touch controls). */
  aimMode: AimMode;
  /** Id of the enemy the player tapped as the target of the smart aim; 0 = none. */
  lockId: number;
  /** True only on the tick of a `fire` command (`sling` mode). */
  fireNow: boolean;
  /** Theme id of each wave, drawn when the run starts ('' = none). */
  waveThemes: string[];
  /** Base species of the run's pool (ADR-048): enemies, recruit cards and captures come from it. */
  pool: string[];
  /** Ticks left of the temporary guard that the fairy effect gives the team (ADR-047). */
  guardTicks: number;
  /** Balls captured so far (species of the line and level), for the run summary (ADR-025). */
  captured: { species: string; level: number }[];
  nextBallId: number;
  bodies: BallBody[];
  /** Always ordered by ascending id. */
  enemies: Enemy[];
  nextEnemyId: number;
  wave: { index: number; tick: number };
  boss: BossState;
  /** Columns of the floor under attack, at most `bossFight.maxHazards` (ADR-046). */
  hazards: Hazard[];
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
    Math.max(config.ball.radius, ...config.team.ballRadiusByStage) +
      Math.max(
        config.enemy.radius,
        config.boss?.radius ?? 0,
        ...(config.interludes ?? []).map((b) => b.radius),
      ),
  );
}

/**
 * One theme (a biome, ADR-049) per wave, from the run's own `themes` stream (so spawns and cards
 * are not disturbed): always exactly one number per wave. A biome does not repeat inside a run
 * while another is left. The first wave only takes biomes where the pool has at least
 * `pool.minBiomeLines` lines that the starter's attack does not resist (ADR-033): so no starter
 * begins against enemies it cannot hurt.
 */
function drawThemes(
  config: GameConfig,
  rng: RngState,
  pool: readonly string[],
  starter: string,
): string[] {
  const used = new Set<string>();
  return config.waves.map((wave, index) => {
    let candidates = wave.themes ?? [];
    const fresh = candidates.filter((id) => !used.has(id));
    if (fresh.length > 0) candidates = fresh;
    if (index === 0 && config.pool !== undefined) {
      const need = config.pool.minBiomeLines;
      const fair = candidates.filter((id) => {
        const theme = config.themes?.[id];
        return (
          theme === undefined ||
          fairLines(config, [...new Set(biomeLines(config, pool, theme))], starter).length >= need
        );
      });
      if (fair.length > 0) candidates = fair;
    } else if (index === 0) {
      const starterType = config.species[starter]?.type;
      const fair = candidates.filter((id) => {
        const type = config.themes?.[id]?.type;
        return (
          starterType === undefined ||
          type === undefined ||
          effectiveness(config, starterType, type) >= 1
        );
      });
      if (fair.length > 0) candidates = fair;
    }
    if (candidates.length === 0) return '';
    const pick = candidates[nextInt(rng, candidates.length)] ?? '';
    used.add(pick);
    return pick;
  });
}

export function createRun(config: GameConfig, seed: number, starterSpecies: string): Run {
  const normalizedSeed = seed >>> 0;
  const themesRng = deriveRng(normalizedSeed, 'themes');
  const poolRng = deriveRng(normalizedSeed, 'pool');
  const pool = drawPool(config, poolRng);
  const waveThemes = drawThemes(config, themesRng, pool, starterSpecies);
  const run: Run = {
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
      pool: poolRng,
      boss: deriveRng(normalizedSeed, 'boss'),
    },
    player: {
      x: config.arena.width / 2,
      hp: config.player.maxHp,
      maxHp: config.player.maxHp,
      xp: 0,
      xpNext: xpCost(config, 1),
      level: 1,
      damageMult: 1,
      drain: 0,
      invuln: 0,
      vel: 0,
    },
    team: [],
    pendingCapture: null,
    loadout: [],
    cooldowns: [],
    pickups: [],
    captureMisses: config.capture.startMisses,
    aimX: config.arena.width / 2,
    aimY: 0,
    autoAim: false,
    aimMode: 'manual',
    lockId: 0,
    fireNow: false,
    waveThemes,
    pool,
    guardTicks: 0,
    captured: [],
    nextBallId: 1,
    bodies: [],
    enemies: [],
    nextEnemyId: 1,
    wave: { index: 0, tick: 0 },
    boss: {
      spawned: false,
      id: 0,
      maxHp: 0,
      tick: 0,
      next: 0,
      defeated: 0,
      type: '',
      phase: 0,
      coreOpen: 0,
      coreIn: 0,
      attackIn: 0,
      summonDebt: 0,
      squeeze: 0,
      barrier: 0,
      timeSlow: 0,
      mechIn: 0,
      portalCool: 0,
      used: [],
    },
    hazards: [],
    offers: [],
    events: [],
    grid: newGrid(config),
  };
  addMember(run, config, starterSpecies, 1, true);
  return run;
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
      pool: cloneRng(run.rng.pool),
      boss: cloneRng(run.rng.boss),
    },
    player: { ...run.player },
    team: run.team.map((m) => ({ ...m })),
    pendingCapture: run.pendingCapture === null ? null : { ...run.pendingCapture },
    loadout: run.loadout.slice(), // balls are immutable values
    cooldowns: run.cooldowns.slice(),
    pickups: run.pickups.map((p) => ({ ...p })),
    captureMisses: run.captureMisses,
    aimX: run.aimX,
    aimY: run.aimY,
    autoAim: run.autoAim,
    aimMode: run.aimMode,
    lockId: run.lockId,
    fireNow: run.fireNow,
    waveThemes: run.waveThemes.slice(),
    pool: run.pool.slice(),
    guardTicks: run.guardTicks,
    captured: run.captured.map((c) => ({ ...c })),
    nextBallId: run.nextBallId,
    bodies: run.bodies.map((b) => ({ ...b })),
    enemies: run.enemies.map((e) => ({ ...e })),
    nextEnemyId: run.nextEnemyId,
    wave: { ...run.wave },
    boss: { ...run.boss, used: run.boss.used.slice() },
    hazards: run.hazards.map((h) => ({ ...h })),
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
  h.rng(run.rng.pool);
  h.int(run.guardTicks);
  h.int(run.pool.length);
  for (const id of run.pool) h.str(id);
  const p = run.player;
  h.num(p.x);
  h.num(p.hp);
  h.num(p.maxHp);
  h.num(p.xp);
  h.num(p.xpNext);
  h.int(p.level);
  h.num(p.damageMult);
  h.num(p.drain);
  h.int(p.invuln);
  h.int(run.team.length);
  for (const member of run.team) {
    h.str(member.species);
    h.str(member.type);
    h.int(member.level);
    h.int(member.starter ? 1 : 0);
    h.int(member.damageUps);
    h.int(member.cadenceUps);
    h.int(member.charge);
  }
  h.int(run.pendingCapture === null ? 0 : 1);
  h.str(run.pendingCapture?.species ?? '');
  h.int(run.pendingCapture?.stage ?? 0);
  h.int(run.loadout.length);
  for (const ball of run.loadout) {
    h.int(ball.id);
    h.int(ball.owner);
    h.int(ball.stage);
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
      h.num(effect.radius ?? 0);
      h.int(effect.count ?? 0);
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
  h.str(run.aimMode);
  h.int(run.lockId);
  h.int(run.fireNow ? 1 : 0);
  h.num(run.player.vel);
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
    h.int(e.slowTicks);
    h.num(e.slow);
    h.str(e.type2 ?? '');
    h.int(e.poisonTicks ?? 0);
    h.int(e.poisonStacks ?? 0);
    h.num(e.poisonDps ?? 0);
    h.int(e.curseTicks ?? 0);
    h.num(e.curseDamage ?? 0);
    h.int(e.haltTicks ?? 0);
    h.int(e.chill ?? 0);
    h.int(e.markTicks ?? 0);
    h.num(e.markBonus ?? 0);
    h.int(e.pushTicks ?? 0);
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
  h.rng(run.rng.boss);
  h.int(run.boss.phase);
  h.int(run.boss.coreOpen);
  h.int(run.boss.coreIn);
  h.int(run.boss.attackIn);
  h.int(run.boss.summonDebt);
  h.num(run.boss.squeeze);
  h.int(run.boss.barrier);
  h.int(run.boss.timeSlow);
  h.int(run.boss.mechIn);
  h.int(run.boss.portalCool);
  h.int(run.boss.used.length);
  for (const id of run.boss.used) h.str(id);
  h.int(run.hazards.length);
  for (const hz of run.hazards) {
    h.str(hz.kind);
    h.num(hz.y);
    h.num(hz.link);
    h.num(hz.x);
    h.num(hz.width);
    h.int(hz.telegraph);
    h.int(hz.active);
    h.num(hz.damage);
    h.num(hz.speed);
    h.int(hz.struck ? 1 : 0);
    h.str(hz.type ?? '');
  }
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
    h.int(
      card.kind === 'train' || card.kind === 'power' || card.kind === 'cadence' ? card.member : -1,
    );
  }
  return h.digest();
}
