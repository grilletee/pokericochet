import {
  type Card,
  type Command,
  captureLevel,
  createRng,
  createRun,
  type GameConfig,
  nextInt,
  type ReplaceAction,
  type Run,
  tick,
} from '../../src/domain';

export interface AimPoint {
  readonly x: number;
  readonly y: number;
}

export interface Policy {
  readonly name: string;
  move(run: Run, config: GameConfig): -1 | 0 | 1;
  pick(run: Run, offers: readonly Card[]): number;
  /** Where to aim by hand this tick; omitted or null = leave the aim as it is (ADR-021). */
  aim?(run: Run, config: GameConfig): AimPoint | null;
  /** What to do with a capture that finds the team full; default: `chooseReplace`. */
  replace?(run: Run, config: GameConfig): ReplaceAction;
  /** Use the assisted aim (the launcher picks the nearest enemy by itself). */
  readonly autoAim?: boolean;
}

/**
 * Worth of a Pokémon for the replace decision: its level counts most, its cards a little.
 * A bot that keeps its best ones and swaps the weakest, like a player would.
 */
function memberWorth(member: Run['team'][number]): number {
  return member.level * 10 + member.damageUps + member.cadenceUps;
}

/**
 * The answer a sensible player gives to the replace screen (ADR-030): swap the weakest Pokémon if
 * the capture is stronger than it, otherwise let the capture go.
 */
export function chooseReplace(run: Run, config: GameConfig): ReplaceAction {
  const pending = run.pendingCapture;
  if (pending === null) return { type: 'release' };
  let weakest = 0;
  for (let i = 1; i < run.team.length; i++) {
    const a = run.team[i];
    const b = run.team[weakest];
    if (a !== undefined && b !== undefined && memberWorth(a) < memberWorth(b)) weakest = i;
  }
  const out = run.team[weakest];
  const incoming = captureLevel(config, pending.stage) * 10;
  return out !== undefined && incoming > memberWorth(out)
    ? { type: 'replace', slot: weakest }
    : { type: 'release' };
}

/**
 * The command a policy sends this tick: a card while a level-up waits, an answer while the replace
 * screen waits, otherwise movement and aim. The same builder serves every bench and the full-run
 * tests, so what a bot does with the mechanics is defined in one place.
 */
export function commandFor(policy: Policy, run: Run, config: GameConfig): Command {
  if (run.phase === 'levelup') {
    return { moveX: 0, action: { type: 'pick', index: policy.pick(run, run.offers) } };
  }
  if (run.phase === 'replace') {
    return { moveX: 0, action: (policy.replace ?? chooseReplace)(run, config) };
  }
  const moveX = policy.move(run, config);
  const aim = policy.aim?.(run, config) ?? null;
  return {
    moveX,
    autoAim: policy.autoAim === true,
    ...(aim === null ? {} : { aimX: aim.x, aimY: aim.y }),
  };
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
    replace: (run) =>
      nextInt(rng, 2) === 0
        ? { type: 'release' }
        : { type: 'replace', slot: nextInt(rng, Math.max(1, run.team.length)) },
  };
}

/** How much a bot likes each kind of card (higher is picked first). */
export type CardScores = Readonly<Record<Card['kind'], number>>;

/**
 * Picks the card with the best score. Among cards about a Pokémon, the one of the Pokémon with the
 * most levels wins: a bot that concentrates, as the vertical growth asks for. Health matters more
 * when it is low and a new Pokémon matters more while the team is small.
 */
export function pickByScores(scores: CardScores): Policy['pick'] {
  return (run, offers) => {
    let best = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    offers.forEach((card, i) => {
      let score = scores[card.kind];
      if (card.kind === 'train' || card.kind === 'power' || card.kind === 'cadence') {
        score += 0.1 * (run.team[card.member]?.level ?? 0);
      }
      if (card.kind === 'vitality' && run.player.hp <= run.player.maxHp / 2) score += 5;
      if (card.kind === 'newBall' && run.team.length < 3) score += 3;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  };
}

/** The four ways of spending a level-up that M8 compares (ADR-033). */
export const BALANCED_SCORES: CardScores = {
  train: 5,
  newBall: 4.5,
  power: 4,
  cadence: 3.5,
  team: 3,
  vitality: 2,
  hybrid: 0,
};
export const UPGRADES_FIRST_SCORES: CardScores = {
  power: 6,
  cadence: 5,
  team: 4.5,
  train: 4,
  vitality: 3,
  newBall: 2,
  hybrid: 0,
};
export const TRAIN_FIRST_SCORES: CardScores = {
  train: 6,
  power: 4,
  newBall: 3.5,
  cadence: 3,
  team: 3,
  vitality: 2,
  hybrid: 0,
};
export const RECRUIT_FIRST_SCORES: CardScores = {
  newBall: 6,
  train: 4.5,
  power: 3.5,
  cadence: 3,
  team: 2.5,
  vitality: 2,
  hybrid: 0,
};

const balancedPick = pickByScores(BALANCED_SCORES);

/**
 * Does not move and does not aim (the aim stays straight up): the baseline of "what if the player
 * does nothing". Takes the same cards as the others.
 */
export const standStillPolicy: Policy = {
  name: 'still',
  move: () => 0,
  pick: balancedPick,
};

/**
 * The pre-4B player: assisted aim, follows the enemy closest to the defence line and never picks
 * balls up. Kept as a reference for how much the new mechanics add.
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
  pick: balancedPick,
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
 * The player that uses everything: aims by hand at the most dangerous enemy (leading it),
 * collects every ball that falls or drops, spends level-ups with the balanced scores and answers the
 * replace screen sensibly.
 */
export const activePolicy: Policy = {
  name: 'active',
  move: collectingMove,
  aim: dangerousTarget,
  pick: balancedPick,
};

/** The same bot with the assisted aim: isolates what aiming by hand is worth (ADR-021). */
export const activeAutoPolicy: Policy = {
  name: 'active-auto',
  autoAim: true,
  move: collectingMove,
  pick: balancedPick,
};

const withScores = (name: string, scores: CardScores): Policy => ({
  ...activePolicy,
  name,
  pick: pickByScores(scores),
});

/** M8: the active bot with a different taste for the level-up cards (ADR-033). */
export const activeUpgradesPolicy = withScores('upgrades-first', UPGRADES_FIRST_SCORES);
export const activeTrainPolicy = withScores('train-first', TRAIN_FIRST_SCORES);
export const activeRecruitPolicy = withScores('recruit-first', RECRUIT_FIRST_SCORES);

export interface Outcome {
  readonly result: Run['phase'];
  readonly ticks: number;
  /** 0-based wave in progress when the run ended. */
  readonly wave: number;
  readonly level: number;
  readonly kills: number;
  /** Balls the team fires at the end, and the Pokémon that fire them. */
  readonly balls: number;
  readonly members: number;
  /** Sum of the levels of the team at the end. */
  readonly teamLevels: number;
  readonly hp: number;
  readonly bossReached: boolean;
  /** Evolution stage changes (ADR-031). */
  readonly evolutions: number;
  /** Always 0 while hybrids are off (ADR-033); kept for the old benches. */
  readonly hybrids: number;
  /** New Pokémon that joined after the starter: captures and recruit cards. */
  readonly newBalls: number;
  /**
   * Longest stretch, in ticks, without any new Pokémon (the run start counts as one). Counted until
   * the team is full: after that a capture is a decision, not a new Pokémon.
   */
  readonly maxDroughtTicks: number;
  /** Tick of the first Pokémon after the starter; the run length if there was none. */
  readonly firstBallTicks: number;
  readonly captures: number;
  /** Balls the player picked up, and balls that came back on their own. */
  readonly collected: number;
  readonly recalled: number;

  // ---- 4F (ADR-030..033) ----
  /** Level-up cards picked, by kind. */
  readonly cards: Readonly<Record<string, number>>;
  /** Times the replace screen paused the run, and how they were answered. */
  readonly replacePauses: number;
  readonly replaced: number;
  readonly released: number;
  /** Levels given to a Pokémon by a duplicate capture. */
  readonly captureLevels: number;
  /**
   * Interesting decisions: level-ups (a card) and replace screens. `maxDecisionGapTicks` is the
   * longest stretch without one (M2).
   */
  readonly decisions: number;
  readonly maxDecisionGapTicks: number;
  /** Health lost to leaks, health healed, and the lowest health reached (M9). */
  readonly hpLost: number;
  readonly hpHealed: number;
  readonly minHp: number;
  /** Health lost in the first wave, the one that must be fair for every starter (ADR-033). */
  readonly wave1Loss: number;
  /** Share of the damage dealt by the starter's line, and by the two Pokémon that dealt most (M6). */
  readonly starterShare: number;
  readonly top2Share: number;
  /** Tick of the first stage change; the run length if there was none (M3). */
  readonly firstEvolveTicks: number;
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
  let evolutions = 0;
  let newBalls = 0;
  let captures = 0;
  let collected = 0;
  let recalled = 0;
  let lastNewBall = 0;
  let maxDrought = 0;
  let firstBall = -1;
  let teamFull = false;
  const cards: Record<string, number> = {};
  let replacePauses = 0;
  let replaced = 0;
  let released = 0;
  let captureLevels = 0;
  let decisions = 0;
  let lastDecision = 0;
  let maxDecisionGap = 0;
  let hpLost = 0;
  let hpHealed = 0;
  let minHp = run.player.hp;
  let wave1Loss = 0;
  let firstEvolve = -1;
  const damageBy = new Map<string, number>();
  const gotBall = (): void => {
    newBalls += 1;
    if (firstBall < 0) firstBall = run.tickCount;
    if (!teamFull) maxDrought = Math.max(maxDrought, run.tickCount - lastNewBall);
    lastNewBall = run.tickCount;
    if (run.team.length >= config.team.maxMembers) teamFull = true;
  };
  const decided = (): void => {
    decisions += 1;
    maxDecisionGap = Math.max(maxDecisionGap, run.tickCount - lastDecision);
    lastDecision = run.tickCount;
  };
  for (let i = 0; i < maxTicks && run.phase !== 'lost' && run.phase !== 'won'; i++) {
    const wave = run.wave.index;
    for (const e of tick(run, commandFor(policy, run, config), config).events) {
      switch (e.type) {
        case 'kill':
          kills += 1;
          break;
        case 'evolve':
          evolutions += 1;
          if (firstEvolve < 0) firstEvolve = run.tickCount;
          break;
        case 'capture':
          captures += 1;
          gotBall();
          break;
        case 'train':
          if (e.source === 'capture') captureLevels += 1;
          break;
        case 'pick':
          cards[e.card.kind] = (cards[e.card.kind] ?? 0) + 1;
          if (e.card.kind === 'newBall') gotBall();
          decided();
          break;
        case 'replaceOpen':
          replacePauses += 1;
          decided();
          break;
        case 'replaced':
          replaced += 1;
          break;
        case 'release':
          released += 1;
          break;
        case 'collect':
          if (e.late) recalled += 1;
          else collected += 1;
          break;
        case 'leak':
          hpLost += e.damage;
          if (wave === 0) wave1Loss += e.damage;
          break;
        case 'heal':
          hpHealed += e.amount;
          break;
        case 'hit': {
          const ball = run.loadout.find((b) => b.id === e.ballId);
          if (ball !== undefined) {
            damageBy.set(ball.species, (damageBy.get(ball.species) ?? 0) + e.damage);
          }
          break;
        }
        default:
          break;
      }
    }
    minHp = Math.min(minHp, run.player.hp);
  }
  if (!teamFull) maxDrought = Math.max(maxDrought, run.tickCount - lastNewBall);
  maxDecisionGap = Math.max(maxDecisionGap, run.tickCount - lastDecision);
  const shares = [...damageBy.values()].sort((a, b) => b - a);
  const total = shares.reduce((a, b) => a + b, 0);
  return {
    result: run.phase,
    ticks: run.tickCount,
    wave: run.wave.index,
    level: run.player.level,
    kills,
    balls: run.loadout.length,
    members: run.team.length,
    teamLevels: run.team.reduce((a, m) => a + m.level, 0),
    hp: Math.max(0, run.player.hp),
    bossReached: run.boss.spawned,
    evolutions,
    hybrids: 0,
    newBalls,
    maxDroughtTicks: maxDrought,
    firstBallTicks: firstBall < 0 ? run.tickCount : firstBall,
    captures,
    collected,
    recalled,
    cards,
    replacePauses,
    replaced,
    released,
    captureLevels,
    decisions,
    maxDecisionGapTicks: maxDecisionGap,
    hpLost,
    hpHealed,
    minHp: Math.max(0, minHp),
    wave1Loss,
    starterShare: total === 0 ? 0 : (damageBy.get(starter) ?? 0) / total,
    top2Share: total === 0 ? 0 : ((shares[0] ?? 0) + (shares[1] ?? 0)) / total,
    firstEvolveTicks: firstEvolve < 0 ? run.tickCount : firstEvolve,
  };
}
