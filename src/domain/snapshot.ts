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
  tokens: number;
  /** 0-based wave in progress; equals the number of waves once all have been spawned. */
  waveIndex: number;

  slotCount: number;
  ballActive: Uint8Array;
  ballX: Float32Array;
  ballY: Float32Array;
  ballType: Uint8Array;

  enemyCount: number;
  enemyId: Int32Array;
  enemyX: Float32Array;
  enemyY: Float32Array;
  enemyRadius: Float32Array;
  enemyType: Uint8Array;

  /** True if the run had more slots or enemies than the buffers hold (extras are dropped). */
  truncated: boolean;
}

export function createSnapshot(maxSlots = 64, maxEnemies = 512): Snapshot {
  return {
    tick: 0,
    phase: PHASE_PLAYING,
    playerX: 0,
    playerHp: 0,
    playerMaxHp: 0,
    playerLevel: 1,
    playerXp: 0,
    playerXpNext: 1,
    tokens: 0,
    waveIndex: 0,
    slotCount: 0,
    ballActive: new Uint8Array(maxSlots),
    ballX: new Float32Array(maxSlots),
    ballY: new Float32Array(maxSlots),
    ballType: new Uint8Array(maxSlots),
    enemyCount: 0,
    enemyId: new Int32Array(maxEnemies),
    enemyX: new Float32Array(maxEnemies),
    enemyY: new Float32Array(maxEnemies),
    enemyRadius: new Float32Array(maxEnemies),
    enemyType: new Uint8Array(maxEnemies),
    truncated: false,
  };
}

/** Copies the render-relevant part of the run into `snap`. Allocates nothing. */
export function writeSnapshot(run: Run, snap: Snapshot): void {
  snap.tick = run.tickCount;
  snap.phase = phaseCode(run.phase);
  snap.playerX = run.player.x;
  snap.playerHp = run.player.hp;
  snap.playerMaxHp = run.player.maxHp;
  snap.playerLevel = run.player.level;
  snap.playerXp = run.player.xp;
  snap.playerXpNext = run.player.xpNext;
  snap.tokens = run.tokens;
  snap.waveIndex = run.wave.index;

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
  }
  snap.truncated = truncated;
}
