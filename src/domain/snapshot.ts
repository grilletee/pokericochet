import { themeTypes } from './advice';
import { coreOf } from './bossFight';
import type { GameConfig } from './config';
import type { Run } from './run';
import { ballRadius } from './team';
import { type Enemy, GAME_TYPES, type GameType } from './types';

/** Numeric codes the render uses to index its colour tables: the place of the type in `GAME_TYPES`. */
export function typeCode(type: GameType): number {
  return GAME_TYPES.indexOf(type);
}

/** The kinds of things a boss leaves on the field, in the order of their codes in the snapshot. */
export const HAZARD_KINDS = ['column', 'comb', 'sweep', 'rain', 'shot', 'zone', 'gust'] as const;

/** Bits of `Snapshot.enemyStatus`: one sign for each thing that can be wrong with an enemy. */
export const STATUS_BURN = 1;
export const STATUS_POISON = 2;
export const STATUS_SLOW = 4;
export const STATUS_FROZEN = 8;
export const STATUS_PARALYSED = 16;
export const STATUS_MARK = 32;
export const STATUS_CURSE = 64;
export const STATUS_PUSHED = 128;

/**
 * What is wrong with an enemy now. A stop from ice (`chill` >= 0) is a freeze; a short stop from a
 * stun (`chill` < 0, the immunity that follows it) is a paralysis.
 */
export function statusOf(e: Enemy): number {
  let bits = 0;
  if (e.burnTicks > 0) bits |= STATUS_BURN;
  if ((e.poisonTicks ?? 0) > 0) bits |= STATUS_POISON;
  if (e.slowTicks > 0) bits |= STATUS_SLOW;
  if ((e.haltTicks ?? 0) > 0) bits |= (e.chill ?? 0) < 0 ? STATUS_PARALYSED : STATUS_FROZEN;
  if ((e.markTicks ?? 0) > 0) bits |= STATUS_MARK;
  if ((e.curseTicks ?? 0) > 0) bits |= STATUS_CURSE;
  if ((e.pushTicks ?? 0) > 0) bits |= STATUS_PUSHED;
  return bits;
}

/** The most columns of a boss the render keeps (the fight caps them lower, ADR-046). */
export const MAX_HAZARDS = 16;

/**
 * Species code of a ball or enemy whose species has no code in the table the app passed. The codes
 * are 16 bits since the roster of the 4H-B2 has more than 400 species (they were 8 bits before).
 */
export const NO_SPECIES = 65535;

export const PHASE_PLAYING = 0;
export const PHASE_LOST = 1;
export const PHASE_LEVELUP = 2;
export const PHASE_WON = 3;
export const PHASE_REPLACE = 4;

function phaseCode(phase: Run['phase']): number {
  switch (phase) {
    case 'playing':
      return PHASE_PLAYING;
    case 'lost':
      return PHASE_LOST;
    case 'levelup':
      return PHASE_LEVELUP;
    case 'won':
      return PHASE_WON;
    case 'replace':
      return PHASE_REPLACE;
  }
}

/**
 * What the render sees of a run (ADR-007): flat typed buffers, preallocated and reused. The
 * render treats them as read-only. Balls are indexed by loadout slot, enemies are listed in
 * ascending id order, so two consecutive snapshots can be interpolated without allocating.
 */
export interface Snapshot {
  tick: number;
  phase: number;
  playerX: number;
  playerHp: number;
  playerMaxHp: number;
  playerLevel: number;
  playerXp: number;
  playerXpNext: number;
  /** Hp and maximum hp of the boss while it is alive; both 0 otherwise. */
  bossHp: number;
  bossMaxHp: number;
  /** Species code of the boss that is on the field (0 when none: check `bossMaxHp`). */
  bossSpecies: number;
  /** 0-based wave in progress; equals the number of waves once all have been spawned. */
  waveIndex: number;
  /** Where the player aims (arena pixels) and whether the assisted aim is on. */
  aimX: number;
  aimY: number;
  autoAim: boolean;

  slotCount: number;
  ballActive: Uint8Array;
  ballX: Float32Array;
  ballY: Float32Array;
  ballType: Uint8Array;
  /** Species code (see `writeSnapshot`), or NO_SPECIES. */
  ballSpecies: Uint16Array;
  /** Evolution stage of the ball (1..3): with the species it picks the form to draw (ADR-031). */
  ballLevel: Uint8Array;
  /** Collision radius of the ball, which grows with its stage. */
  ballRadius: Float32Array;

  /** Balls waiting on the floor or falling to it (ADR-022, ADR-023). */
  pickupCount: number;
  pickupX: Float32Array;
  pickupY: Float32Array;
  pickupType: Uint8Array;
  /** Species code of the ball the pickup carries (see `writeSnapshot`), or NO_SPECIES. */
  pickupSpecies: Uint16Array;
  pickupLevel: Uint8Array;
  /** 1 = a captured ball, 0 = a returning ball of the team. */
  pickupCaptured: Uint8Array;
  /** Ticks left before it joins by itself. */
  pickupTicks: Int32Array;

  enemyCount: number;
  enemyId: Int32Array;
  enemyX: Float32Array;
  enemyY: Float32Array;
  enemyRadius: Float32Array;
  enemyType: Uint8Array;
  enemySpecies: Uint16Array;

  /**
   * The biome of the wave in progress (ADR-049), for the tint and the particles of the field: the
   * type codes of its two heaviest types, or -1 without a biome.
   */
  biomeMain: number;
  biomeSecond: number;

  /**
   * The boss fight (ADR-053): what the boss put on the floor or in the air (kind code = place in
   * `HAZARD_KINDS`), the core (arena pixels; open or about to open) and the phase.
   */
  hazardCount: number;
  hazardKind: Uint8Array;
  hazardX: Float32Array;
  hazardY: Float32Array;
  hazardWidth: Float32Array;
  /** Ticks of warning left (0 = striking) and ticks of strike left. */
  hazardWarn: Int32Array;
  hazardActive: Int32Array;
  /** Ticks the core stays open (0 = closed) and whether it is about to open. */
  bossCoreOpen: number;
  bossCoreWarning: boolean;
  bossWeakX: number;
  bossWeakY: number;
  bossWeakRadius: number;
  bossPhase: number;
  /**
   * What is wrong with each enemy (ADR-053, "estados visibles"), as a set of `STATUS_*` bits: the
   * render shows each one with its own subtle sign.
   */
  enemyStatus: Uint16Array;
  /** Where the boss is, for what is drawn around it. */
  bossX: number;
  bossY: number;
  bossRadius: number;

  /** True if the run had more slots or enemies than the buffers hold (extras are dropped). */
  truncated: boolean;
}

export function createSnapshot(maxSlots = 64, maxEnemies = 512, maxPickups = 64): Snapshot {
  return {
    tick: 0,
    phase: PHASE_PLAYING,
    playerX: 0,
    playerHp: 0,
    playerMaxHp: 0,
    playerLevel: 1,
    playerXp: 0,
    playerXpNext: 1,
    bossHp: 0,
    bossMaxHp: 0,
    bossSpecies: 0,
    waveIndex: 0,
    aimX: 0,
    aimY: 0,
    autoAim: false,
    slotCount: 0,
    ballActive: new Uint8Array(maxSlots),
    ballX: new Float32Array(maxSlots),
    ballY: new Float32Array(maxSlots),
    ballType: new Uint8Array(maxSlots),
    ballSpecies: new Uint16Array(maxSlots),
    ballLevel: new Uint8Array(maxSlots),
    ballRadius: new Float32Array(maxSlots),
    pickupCount: 0,
    pickupX: new Float32Array(maxPickups),
    pickupY: new Float32Array(maxPickups),
    pickupType: new Uint8Array(maxPickups),
    pickupSpecies: new Uint16Array(maxPickups),
    pickupLevel: new Uint8Array(maxPickups),
    pickupCaptured: new Uint8Array(maxPickups),
    pickupTicks: new Int32Array(maxPickups),
    enemyCount: 0,
    enemyId: new Int32Array(maxEnemies),
    enemyX: new Float32Array(maxEnemies),
    enemyY: new Float32Array(maxEnemies),
    enemyRadius: new Float32Array(maxEnemies),
    enemyType: new Uint8Array(maxEnemies),
    enemySpecies: new Uint16Array(maxEnemies),
    biomeMain: -1,
    biomeSecond: -1,
    hazardCount: 0,
    hazardKind: new Uint8Array(MAX_HAZARDS),
    hazardX: new Float32Array(MAX_HAZARDS),
    hazardY: new Float32Array(MAX_HAZARDS),
    hazardWidth: new Float32Array(MAX_HAZARDS),
    hazardWarn: new Int32Array(MAX_HAZARDS),
    hazardActive: new Int32Array(MAX_HAZARDS),
    enemyStatus: new Uint16Array(maxEnemies),
    bossCoreOpen: 0,
    bossCoreWarning: false,
    bossWeakX: 0,
    bossWeakY: 0,
    bossWeakRadius: 0,
    bossPhase: 0,
    bossX: 0,
    bossY: 0,
    bossRadius: 0,
    truncated: false,
  };
}

/**
 * Copies the render-relevant part of the run into `snap`. Allocates nothing. `speciesCodes` maps
 * a species id to the small number the render uses to pick its art (the domain knows no art);
 * without it, or for an unknown species, the code is NO_SPECIES.
 */
export function writeSnapshot(
  run: Run,
  snap: Snapshot,
  speciesCodes?: ReadonlyMap<string, number>,
  config?: GameConfig,
): void {
  snap.tick = run.tickCount;
  snap.phase = phaseCode(run.phase);
  snap.playerX = run.player.x;
  snap.playerHp = run.player.hp;
  snap.playerMaxHp = run.player.maxHp;
  snap.playerLevel = run.player.level;
  snap.playerXp = run.player.xp;
  snap.playerXpNext = run.player.xpNext;
  snap.bossHp = 0;
  snap.bossMaxHp = 0;
  snap.bossSpecies = 0;
  snap.bossCoreOpen = 0;
  snap.bossCoreWarning = false;
  snap.bossPhase = 0;
  snap.bossWeakRadius = 0;
  if (run.boss.id !== 0) {
    for (const e of run.enemies) {
      if (e.id !== run.boss.id) continue;
      snap.bossHp = Math.max(0, e.hp);
      snap.bossMaxHp = run.boss.maxHp;
      snap.bossSpecies = speciesCodes?.get(e.species) ?? 0;
      snap.bossX = e.x;
      snap.bossY = e.y;
      snap.bossRadius = e.radius;
      snap.bossPhase = run.boss.phase;
      snap.bossCoreOpen = run.boss.coreOpen;
      const fight = config?.bossFight;
      snap.bossCoreWarning =
        fight !== undefined && run.boss.coreOpen === 0 && run.boss.coreIn <= fight.coreWarnTicks;
      const core = coreOf(run, e);
      snap.bossWeakX = core.x;
      snap.bossWeakY = core.y;
      snap.bossWeakRadius = run.boss.coreOpen > 0 || snap.bossCoreWarning ? core.radius : 0;
    }
  }
  const hazards = Math.min(run.hazards.length, snap.hazardX.length);
  snap.hazardCount = hazards;
  for (let i = 0; i < hazards; i++) {
    const h = run.hazards[i];
    if (h === undefined) continue;
    snap.hazardKind[i] = HAZARD_KINDS.indexOf(h.kind);
    snap.hazardY[i] = h.y;
    snap.hazardX[i] = h.x;
    snap.hazardWidth[i] = h.width;
    snap.hazardWarn[i] = h.telegraph;
    snap.hazardActive[i] = h.active;
  }
  snap.waveIndex = run.wave.index;
  const biome =
    config?.themes?.[run.waveThemes[Math.min(run.wave.index, run.waveThemes.length - 1)] ?? ''];
  const biomeTypes = biome === undefined ? [] : themeTypes(config as GameConfig, biome.id);
  snap.biomeMain = biomeTypes[0] === undefined ? -1 : typeCode(biomeTypes[0]);
  snap.biomeSecond = biomeTypes[1] === undefined ? snap.biomeMain : typeCode(biomeTypes[1]);
  snap.aimX = run.aimX;
  snap.aimY = run.aimY;
  snap.autoAim = run.autoAim;

  const maxSlots = snap.ballActive.length;
  const slots = Math.min(run.loadout.length, maxSlots);
  snap.slotCount = slots;
  snap.ballActive.fill(0, 0, slots);
  let truncated = run.loadout.length > maxSlots;
  for (const body of run.bodies) {
    if (body.slot >= slots) continue;
    const ball = run.loadout[body.slot];
    if (ball === undefined) continue;
    snap.ballActive[body.slot] = 1;
    snap.ballX[body.slot] = body.x;
    snap.ballY[body.slot] = body.y;
    snap.ballType[body.slot] = typeCode(ball.type);
    snap.ballSpecies[body.slot] = speciesCodes?.get(ball.species) ?? NO_SPECIES;
    snap.ballLevel[body.slot] = ball.stage;
    snap.ballRadius[body.slot] = config === undefined ? 0 : ballRadius(config, ball);
  }

  const maxPickups = snap.pickupX.length;
  const pickups = Math.min(run.pickups.length, maxPickups);
  snap.pickupCount = pickups;
  truncated = truncated || run.pickups.length > maxPickups;
  for (let i = 0; i < pickups; i++) {
    const p = run.pickups[i];
    if (p === undefined) continue;
    snap.pickupX[i] = p.x;
    snap.pickupY[i] = p.y;
    snap.pickupType[i] = typeCode(p.type);
    snap.pickupCaptured[i] = p.slot < 0 ? 1 : 0;
    snap.pickupTicks[i] = p.ticks;
    const ball = p.slot < 0 ? undefined : run.loadout[p.slot];
    const species = ball?.species ?? p.species;
    snap.pickupSpecies[i] = speciesCodes?.get(species) ?? NO_SPECIES;
    snap.pickupLevel[i] = ball?.stage ?? p.level;
  }

  const maxEnemies = snap.enemyId.length;
  const count = Math.min(run.enemies.length, maxEnemies);
  snap.enemyCount = count;
  truncated = truncated || run.enemies.length > maxEnemies;
  for (let i = 0; i < count; i++) {
    const e = run.enemies[i];
    if (e === undefined) continue;
    snap.enemyId[i] = e.id;
    snap.enemyX[i] = e.x;
    snap.enemyY[i] = e.y;
    snap.enemyRadius[i] = e.radius;
    snap.enemyType[i] = typeCode(e.type);
    snap.enemySpecies[i] = speciesCodes?.get(e.species) ?? NO_SPECIES;
    snap.enemyStatus[i] = statusOf(e);
  }
  snap.truncated = truncated;
}
