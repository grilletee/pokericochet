import type { Run } from './run';
import type { GameType } from './types';

/** Numeric codes the render uses to index its colour tables. */
export function typeCode(type: GameType): number {
  switch (type) {
    case 'fire':
      return 0;
    case 'water':
      return 1;
    case 'grass':
      return 2;
    case 'electric':
      return 3;
  }
}

/** Species code of a ball or enemy whose species has no code in the table the app passed. */
export const NO_SPECIES = 255;

export const PHASE_PLAYING = 0;
export const PHASE_LOST = 1;
export const PHASE_LEVELUP = 2;
export const PHASE_WON = 3;

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
  ballSpecies: Uint8Array;
  /** Level of the ball (1..3): with the species it picks the evolution form to draw. */
  ballLevel: Uint8Array;

  /** Balls waiting on the floor or falling to it (ADR-022, ADR-023). */
  pickupCount: number;
  pickupX: Float32Array;
  pickupY: Float32Array;
  pickupType: Uint8Array;
  /** Species code of the ball the pickup carries (see `writeSnapshot`), or NO_SPECIES. */
  pickupSpecies: Uint8Array;
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
  enemySpecies: Uint8Array;

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
    waveIndex: 0,
    aimX: 0,
    aimY: 0,
    autoAim: false,
    slotCount: 0,
    ballActive: new Uint8Array(maxSlots),
    ballX: new Float32Array(maxSlots),
    ballY: new Float32Array(maxSlots),
    ballType: new Uint8Array(maxSlots),
    ballSpecies: new Uint8Array(maxSlots),
    ballLevel: new Uint8Array(maxSlots),
    pickupCount: 0,
    pickupX: new Float32Array(maxPickups),
    pickupY: new Float32Array(maxPickups),
    pickupType: new Uint8Array(maxPickups),
    pickupSpecies: new Uint8Array(maxPickups),
    pickupLevel: new Uint8Array(maxPickups),
    pickupCaptured: new Uint8Array(maxPickups),
    pickupTicks: new Int32Array(maxPickups),
    enemyCount: 0,
    enemyId: new Int32Array(maxEnemies),
    enemyX: new Float32Array(maxEnemies),
    enemyY: new Float32Array(maxEnemies),
    enemyRadius: new Float32Array(maxEnemies),
    enemyType: new Uint8Array(maxEnemies),
    enemySpecies: new Uint8Array(maxEnemies),
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
  if (run.boss.id !== 0) {
    for (const e of run.enemies) {
      if (e.id !== run.boss.id) continue;
      snap.bossHp = Math.max(0, e.hp);
      snap.bossMaxHp = run.boss.maxHp;
    }
  }
  snap.waveIndex = run.wave.index;
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
    snap.ballLevel[body.slot] = ball.level;
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
    snap.pickupLevel[i] = ball?.level ?? 1;
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
  }
  snap.truncated = truncated;
}
