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

export interface AimPoint {
  readonly x: number;
  readonly y: number;
}

export interface Policy {
  readonly name: string;
  move(run: Run, config: GameConfig): -1 | 0 | 1;
  pick(run: Run, offers: readonly Card[]): number;
  /** A workshop command to send now (open, fuse or close), if the policy wants one. */
  workshop?(run: Run): WorkshopCommand | null;
  /** Where to aim by hand this tick; omitted or null = leave the aim as it is (ADR-021). */
  aim?(run: Run, config: GameConfig): AimPoint | null;
  /** Use the assisted aim (the launcher picks the nearest enemy by itself). */
  readonly autoAim?: boolean;
}

/**
 * The command a policy sends this tick: a card while a level-up waits, otherwise movement, aim
 * and (when it wants one) a workshop action. The same builder serves every bench and the full-run
 * tests, so what a bot does with the new mechanics is defined in one place.
 */
export function commandFor(policy: Policy, run: Run, config: GameConfig): Command {
  if (run.phase === 'levelup') {
    return { moveX: 0, action: { type: 'pick', index: policy.pick(run, run.offers) } };
  }
  const moveX = policy.move(run, config);
  const aim = policy.aim?.(run, config) ?? null;
  const base: Command = {
    moveX,
    autoAim: policy.autoAim === true,
    ...(aim === null ? {} : { aimX: aim.x, aimY: aim.y }),
  };
  const action = policy.workshop?.(run);
  return action ? { ...base, action } : base;
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

/** Moves at random, aims at random and takes random cards: a floor for no skill at all. */
export function randomPolicy(seed: number): Policy {
  const rng = createRng(seed ^ 0xb07);
  return {
    name: 'random',
    move: () => (nextInt(rng, 3) - 1) as -1 | 0 | 1,
    pick: (_run, offers) => nextInt(rng, Math.max(1, offers.length)),
    aim: (_run, config) => ({
      x: nextInt(rng, config.arena.width),
      y: nextInt(rng, Math.floor(config.arena.height / 2)),
    }),
  };
}

/**
 * Does not move and does not aim (the aim stays straight up): the baseline of "what if the player
 * does nothing". Takes the same cards and fusions as the others.
 */
export const standStillPolicy: Policy = {
  name: 'still',
  move: () => 0,
  pick: (run, offers) => chaserPolicy.pick(run, offers),
  workshop: workshopPolicy,
};

const PRIORITY: Record<Card['kind'], number> = {
  newBall: 0,
  damage: 1,
  cadence: 2,
  vitality: 3,
  token: 4,
};

/**
 * The pre-4B player: assisted aim, follows the enemy closest to the defence line and never picks
 * balls up. Kept as a reference for how much the new mechanics add. Takes cards in a fixed order
 * of usefulness (more balls, damage, cadence, health, token).
 */
export const chaserPolicy: Policy = {
  name: 'chaser',
  autoAim: true,
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

/** Where the lowest (most dangerous) enemy will be when a ball launched now would arrive. */
function dangerousTarget(run: Run, config: GameConfig): AimPoint | null {
  let best: Run['enemies'][number] | null = null;
  for (const e of run.enemies) {
    if (e.hp <= 0) continue;
    if (best === null || e.y > best.y) best = e;
  }
  if (best === null) return null;
  const dx = best.x - run.player.x;
  const dy = best.y - config.player.y;
  const flight = Math.sqrt(dx * dx + dy * dy) / ((config.ball.speedMin + config.ball.speedMax) / 2);
  return { x: best.x, y: best.y + best.speed * flight };
}

/** Moves to the nearest pickup if there is one, otherwise under the most dangerous enemy. */
function collectingMove(run: Run, config: GameConfig): -1 | 0 | 1 {
  let goal: number | null = null;
  let nearest = Number.POSITIVE_INFINITY;
  for (const p of run.pickups) {
    const d = Math.abs(p.x - run.player.x);
    if (d < nearest) {
      nearest = d;
      goal = p.x;
    }
  }
  if (goal === null) goal = dangerousTarget(run, config)?.x ?? null;
  if (goal === null) return 0;
  const delta = goal - run.player.x;
  return delta > 4 ? 1 : delta < -4 ? -1 : 0;
}

/**
 * The 4B player that uses everything: aims by hand at the most dangerous enemy (leading it),
 * collects every ball that falls or drops, and plays the workshop and the cards like the others.
 */
export const activePolicy: Policy = {
  name: 'active',
  move: collectingMove,
  aim: dangerousTarget,
  workshop: workshopPolicy,
  pick: (run, offers) => chaserPolicy.pick(run, offers),
};

/** The same bot with the assisted aim: isolates what aiming by hand is worth (ADR-021). */
export const activeAutoPolicy: Policy = {
  name: 'active-auto',
  autoAim: true,
  move: collectingMove,
  workshop: workshopPolicy,
  pick: (run, offers) => chaserPolicy.pick(run, offers),
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
  /** Fusions that produced a hybrid (F2). */
  readonly hybrids: number;
  /** Fusion tokens still unspent when the run ended. */
  readonly tokensLeft: number;
  /** Balls that joined the team after the starter: captures and new-ball cards. */
  readonly newBalls: number;
  /**
   * Longest stretch, in ticks, without any new ball (the run start counts as one). Counted until
   * the team reaches its safety valve: after that captures become damage, not balls.
   */
  readonly maxDroughtTicks: number;
  /** Tick of the first ball after the starter; the run length if there was none. */
  readonly firstBallTicks: number;
  readonly captures: number;
  /** Balls the player picked up, and balls that came back on their own. */
  readonly collected: number;
  readonly recalled: number;
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
  let hybrids = 0;
  let newBalls = 0;
  let captures = 0;
  let collected = 0;
  let recalled = 0;
  let lastNewBall = 0;
  let maxDrought = 0;
  let firstBall = -1;
  let teamFull = false;
  const gotBall = (): void => {
    newBalls += 1;
    if (firstBall < 0) firstBall = run.tickCount;
    if (!teamFull) maxDrought = Math.max(maxDrought, run.tickCount - lastNewBall);
    lastNewBall = run.tickCount;
    if (run.loadout.length >= config.cards.maxBalls) teamFull = true;
  };
  for (let i = 0; i < maxTicks && run.phase !== 'lost' && run.phase !== 'won'; i++) {
    for (const e of tick(run, commandFor(policy, run, config), config).events) {
      if (e.type === 'kill') kills += 1;
      if (e.type === 'fuse') {
        fusions += 1;
        if (e.hybrid) hybrids += 1;
      }
      if (e.type === 'capture' && e.ballId > 0) {
        captures += 1;
        gotBall();
      }
      if (e.type === 'pick' && e.card.kind === 'newBall') gotBall();
      if (e.type === 'collect') {
        if (e.late) recalled += 1;
        else collected += 1;
      }
    }
  }
  if (!teamFull) maxDrought = Math.max(maxDrought, run.tickCount - lastNewBall);
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
    hybrids,
    tokensLeft: run.tokens,
    newBalls,
    maxDroughtTicks: maxDrought,
    firstBallTicks: firstBall < 0 ? run.tickCount : firstBall,
    captures,
    collected,
    recalled,
  };
}
