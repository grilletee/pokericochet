import {
  type Card,
  type Command,
  createRng,
  createRun,
  type FuseAction,
  type GameConfig,
  nextInt,
  previewFusion,
  type Run,
  tick,
  type WorkshopAction,
} from '../../src/domain';

export interface Policy {
  readonly name: string;
  move(run: Run, config: GameConfig): -1 | 0 | 1;
  pick(run: Run, offers: readonly Card[]): number;
  /** A workshop command to send now (open, fuse or close), if the policy wants one. */
  workshop?(run: Run): WorkshopCommand | null;
}

type WorkshopCommand = FuseAction | WorkshopAction;

/**
 * Opens the workshop when a fusion is possible, fuses while any is, then closes it: three kinds of
 * command, one per tick, as the player's panel would send them.
 */
export function workshopPolicy(run: Run): WorkshopCommand | null {
  if (run.phase === 'workshop') {
    return firstValidFusion(run) ?? { type: 'workshop', open: false };
  }
  if (run.phase === 'playing' && run.tokens > 0 && firstValidFusion(run) !== null) {
    return { type: 'workshop', open: true };
  }
  return null;
}

/** The first valid fusion of the loadout, trying every ordered pair of slots; null if none. */
export function firstValidFusion(run: Run): FuseAction | null {
  for (let a = 0; a < run.loadout.length; a++) {
    for (let b = 0; b < run.loadout.length; b++) {
      if (a !== b && previewFusion(run, a, b).ok) return { type: 'fuse', a, b };
    }
  }
  return null;
}

/** Moves at random and takes random cards: a floor for how the game plays with no skill. */
export function randomPolicy(seed: number): Policy {
  const rng = createRng(seed ^ 0xb07);
  return {
    name: 'random',
    move: () => (nextInt(rng, 3) - 1) as -1 | 0 | 1,
    pick: (_run, offers) => nextInt(rng, Math.max(1, offers.length)),
  };
}

const PRIORITY: Record<Card['kind'], number> = {
  newBall: 0,
  damage: 1,
  cadence: 2,
  vitality: 3,
  token: 4,
};

/**
 * A simple competent player: stays under the enemy closest to the defence line and takes cards
 * in a fixed order of usefulness (more balls, damage, cadence, health, token).
 */
export const chaserPolicy: Policy = {
  name: 'chaser',
  move(run) {
    let target: number | null = null;
    let lowest = Number.NEGATIVE_INFINITY;
    for (const e of run.enemies) {
      if (e.hp > 0 && e.y > lowest) {
        lowest = e.y;
        target = e.x;
      }
    }
    if (target === null) return 0;
    const delta = target - run.player.x;
    return delta > 6 ? 1 : delta < -6 ? -1 : 0;
  },
  workshop: workshopPolicy,
  pick(_run, offers) {
    let best = 0;
    offers.forEach((card, i) => {
      if (PRIORITY[card.kind] < PRIORITY[offers[best]?.kind ?? 'token']) best = i;
    });
    return best;
  },
};

export interface Outcome {
  readonly result: Run['phase'];
  readonly ticks: number;
  /** 0-based wave in progress when the run ended. */
  readonly wave: number;
  readonly level: number;
  readonly kills: number;
  readonly balls: number;
  readonly hp: number;
  readonly bossReached: boolean;
  readonly fusions: number;
}

export function playRun(
  config: GameConfig,
  seed: number,
  starter: string,
  policy: Policy,
  maxTicks = 40_000,
): Outcome {
  const run = createRun(config, seed, starter);
  let kills = 0;
  let fusions = 0;
  for (let i = 0; i < maxTicks && run.phase !== 'lost' && run.phase !== 'won'; i++) {
    let cmd: Command;
    if (run.phase === 'levelup') {
      cmd = { moveX: 0, action: { type: 'pick', index: policy.pick(run, run.offers) } };
    } else {
      const action = policy.workshop?.(run);
      const moveX = policy.move(run, config);
      cmd = action ? { moveX, action } : { moveX };
    }
    for (const e of tick(run, cmd, config).events) {
      if (e.type === 'kill') kills += 1;
      if (e.type === 'fuse') fusions += 1;
    }
  }
  return {
    result: run.phase,
    ticks: run.tickCount,
    wave: run.wave.index,
    level: run.player.level,
    kills,
    balls: run.loadout.length,
    hp: Math.max(0, run.player.hp),
    bossReached: run.boss.spawned,
    fusions,
  };
}
