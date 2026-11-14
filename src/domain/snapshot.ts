import { themeTypes } from './advice';
import type { GameConfig } from './config';
import type { Run } from './run';
import { ballRadius, ballView, captureView } from './team';
import { type Enemy, GAME_TYPES, type GameType } from './types';

/** Numeric codes the render uses to index its colour tables: the place of the type in `GAME_TYPES`. */
export function typeCode(type: GameType): number {
  return GAME_TYPES.indexOf(type);
}

/** The kinds of things a boss leaves on the field, in the order of their codes in the snapshot. */
export const HAZARD_KINDS = [
  'column',
  'comb',
  'sweep',
  'rain',
  'shot',
  'zone',
  'gust',
  'crack',
  'portal',
] as const;

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
  /** Ticks of invulnerability left after a hit (the render blinks the launcher while > 0). */
  playerInvuln: number;
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
  /** Species code of the FORM each ball shows (4G-I): worked out by the domain, drawn as is. */
  ballForm: Uint16Array;
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
  /** Radius it has in flight (4G-H): it is drawn the same size on the floor. */
  pickupRadius: Float32Array;
  /** Species code of the form a ball on the floor shows (4G-I): the one it has or will have. */
  pickupForm: Uint16Array;
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
  /** Type code of the boss, the colour of its attacks (-1 without a boss). */
  bossType: number;
  /** The exclusive mechanics of a legendary (ADR-054): the squeeze of the field and the barrier / slow flags. */
  bossSqueeze: number;
  bossBarrier: boolean;
  /** The FINAL boss is on the field: the render changes the stage to its own (4G-E). */
  bossFinal: boolean;
  bossTimeSlow: boolean;
  /** Link x of a portal (0 for the rest of the hazards). */
  hazardLink: Float32Array;
  /** Type code of the enemy that fired a shot (see `typeCode`), 255 for what has none (4G-G). */
  hazardType: Uint8Array;
  /** Where an enemy's shot left from (4G-H), -1 for the rest: it flies from there to its mark. */
  hazardFromX: Float32Array;
  hazardFromY: Float32Array;
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
    playerInvuln: 0,
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
    ballForm: new Uint16Array(maxSlots),
    ballRadius: new Float32Array(maxSlots),
    pickupCount: 0,
    pickupX: new Float32Array(maxPickups),
    pickupY: new Float32Array(maxPickups),
    pickupType: new Uint8Array(maxPickups),
    pickupSpecies: new Uint16Array(maxPickups),
    pickupLevel: new Uint8Array(maxPickups),
    pickupRadius: new Float32Array(maxPickups),
    pickupForm: new Uint16Array(maxPickups),
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
    bossType: -1,
    bossSqueeze: 0,
    bossBarrier: false,
    bossFinal: false,
    bossTimeSlow: false,
    hazardLink: new Float32Array(MAX_HAZARDS),
    hazardType: new Uint8Array(MAX_HAZARDS),
    hazardFromX: new Float32Array(MAX_HAZARDS),
    hazardFromY: new Float32Array(MAX_HAZARDS),
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
  snap.playerInvuln = run.player.invuln;
  snap.playerMaxHp = run.player.maxHp;
  snap.playerLevel = run.player.level;
  snap.playerXp = run.player.xp;
  snap.playerXpNext = run.player.xpNext;
  snap.bossHp = 0;
  snap.bossMaxHp = 0;
  snap.bossSpecies = 0;
  snap.bossCoreOpen = 0;
  snap.bossCoreWarning = false;
  snap.bossType = -1;
  snap.bossSqueeze = run.boss.squeeze;
  snap.bossBarrier = run.boss.barrier > 0;
  snap.bossFinal =
    run.boss.spawned && run.boss.id !== 0 && run.enemies.some((e) => e.id === run.boss.id);
  snap.bossTimeSlow = run.boss.timeSlow > 0;
  snap.bossPhase = 0;
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
      snap.bossType = typeCode(e.type);
      snap.bossCoreOpen = run.boss.coreOpen;
      const fight = config?.bossFight;
      snap.bossCoreWarning =
        fight !== undefined && run.boss.coreOpen === 0 && run.boss.coreIn <= fight.coreWarnTicks;
    }
  }
  const hazards = Math.min(run.hazards.length, snap.hazardX.length);
  snap.hazardCount = hazards;
  for (let i = 0; i < hazards; i++) {
    const h = run.hazards[i];
    if (h === undefined) continue;
    snap.hazardKind[i] = HAZARD_KINDS.indexOf(h.kind);
    snap.hazardY[i] = h.y;
    snap.hazardLink[i] = h.link;
    snap.hazardType[i] = h.type === undefined ? 255 : typeCode(h.type);
    snap.hazardFromX[i] = h.fromX ?? -1;
    snap.hazardFromY[i] = h.fromY ?? -1;
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
    // The form it shows, from the rules of the game (4G-I): the render draws this, nothing else.
    const view = config === undefined ? null : ballView(config, ball);
    snap.ballForm[body.slot] =
      speciesCodes?.get(view?.form ?? ball.species) ?? snap.ballSpecies[body.slot] ?? NO_SPECIES;
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
    // What it looks like and how big it is, from the rules of the game (4G-I): a ball of the team is
    // the ball it is; a capture (whose `level` is the STAGE of the enemy it came from) is the form
    // and the stage it will have when it joins. The 4G-H read that stage as a level (Togekiss showed
    // Togetic).
    if (config === undefined) {
      snap.pickupForm[i] = snap.pickupSpecies[i] ?? NO_SPECIES;
      snap.pickupRadius[i] = 0;
    } else {
      const view =
        ball !== undefined ? ballView(config, ball) : captureView(config, p.species, p.level);
      snap.pickupForm[i] = speciesCodes?.get(view.form) ?? NO_SPECIES;
      snap.pickupRadius[i] =
        ball !== undefined
          ? ballRadius(config, ball)
          : (config.team.ballRadiusByStage[view.stage - 1] ?? config.ball.radius);
    }
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
