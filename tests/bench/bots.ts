import {
  type Card,
  type Command,
  captureLevel,
  createRng,
  createRun,
  type GameConfig,
  liveBoss,
  nextInt,
  type ReplaceAction,
  type Run,
  signatureReady,
  statsOf,
  tick,
} from '../../src/domain';
import { labelPriority, MoveLabelPolicy } from '../../src/ui';

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
  /**
   * Ticks the bot takes to throw the starter's signature once it is ready (a human reaction, 4F-D);
   * default `SIGNATURE_REACTION_TICKS`. A negative value never throws it: the control group that
   * shows what the signature is worth.
   */
  readonly signatureDelay?: number;
  /** True while the bot keeps its ready Ultimate for a better moment (the stun of a boss, ADR-046). */
  holdSignature?(run: Run): boolean;
}

/** About 0.75 s: the time a player takes to see the glow and tap the portrait. */
export const SIGNATURE_REACTION_TICKS = 45;

/** The tick at which each run's signature became ready, so the bots can wait a human reaction time. */
const readySince = new WeakMap<Run, number>();

/** The place of the team whose signature to throw this tick, if the policy would do it now. */
function signatureToCast(policy: Policy, run: Run, config: GameConfig): number | null {
  const delay = policy.signatureDelay ?? SIGNATURE_REACTION_TICKS;
  const index = run.team.findIndex((member) => member.starter);
  if (delay < 0 || index < 0 || !signatureReady(run, config, index)) {
    readySince.delete(run);
    return null;
  }
  if (policy.holdSignature?.(run) === true) return null;
  const since = readySince.get(run) ?? run.tickCount;
  readySince.set(run, since);
  return run.tickCount - since >= delay ? index : null;
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
  // The starter is the identity of the run and its signature goes with it (4F-D): never swapped.
  let weakest = run.team.findIndex((member) => !member.starter);
  if (weakest < 0) return { type: 'release' };
  for (let i = weakest + 1; i < run.team.length; i++) {
    const a = run.team[i];
    const b = run.team[weakest];
    if (a !== undefined && b !== undefined && !a.starter && memberWorth(a) < memberWorth(b)) {
      weakest = i;
    }
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
  const cast = signatureToCast(policy, run, config);
  return {
    moveX,
    autoAim: policy.autoAim === true,
    ...(aim === null ? {} : { aimX: aim.x, aimY: aim.y }),
    ...(cast === null ? {} : { cast }),
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
 * Ticks the bot takes to start dodging a column once it appears: a human reaction (ADR-046, B5). A
 * column is announced for 60 to 100 ticks, so 30 leaves a person time to get out of most of them.
 */
export const DODGE_REACTION_TICKS = 45;

/** The tick each column of a run was first seen on, so the bot reacts after a human delay. */
const seenAt = new WeakMap<object, number>();

/**
 * Where to go to leave the columns the bot has already noticed, or null when it is not standing in
 * one (or has noticed none). It goes to the nearest free point of the floor; a column it cannot
 * leave in time simply hits it, like a person who is too late.
 */
export function dodgeMove(
  run: Run,
  config: GameConfig,
  reaction = DODGE_REACTION_TICKS,
): -1 | 0 | 1 | null {
  const margin = config.player.margin;
  const widthOfFloor = config.arena.width;
  const spans: { lo: number; hi: number }[] = [];
  for (const h of run.hazards) {
    if (!seenAt.has(h)) seenAt.set(h, run.tickCount);
    if (run.tickCount - (seenAt.get(h) ?? 0) < reaction) continue;
    // A moving column is avoided where it is going to be, not only where it is.
    const ahead = h.speed * Math.min(40, h.telegraph + h.active);
    spans.push({
      lo: Math.min(h.x, h.x + ahead) - h.width / 2 - 8,
      hi: Math.max(h.x, h.x + ahead) + h.width / 2 + 8,
    });
  }
  const here = run.player.x;
  if (!spans.some((s) => here >= s.lo && here <= s.hi)) return null;
  const free = (x: number): boolean =>
    x >= margin && x <= widthOfFloor - margin && !spans.some((s) => x >= s.lo && x <= s.hi);
  let best: number | null = null;
  for (const s of spans) {
    for (const x of [s.lo - 1, s.hi + 1, margin, widthOfFloor - margin]) {
      if (free(x) && (best === null || Math.abs(x - here) < Math.abs(best - here))) best = x;
    }
  }
  if (best === null) return null;
  return best > here + 2 ? 1 : best < here - 2 ? -1 : 0;
}

/**
 * Aims at where the weak point of a boss's shield will be when the ball arrives (ADR-046): it
 * slides over the body, so the bot leads it like it leads any target; otherwise at the most
 * dangerous enemy.
 */
function bossAwareAim(run: Run, config: GameConfig): AimPoint | null {
  const boss = liveBoss(run);
  if (boss === undefined || run.boss.shieldHp <= 0) return dangerousTarget(run, config);
  const dx = boss.x - run.player.x;
  const dy = boss.y - config.player.y;
  const flight = Math.sqrt(dx * dx + dy * dy) / ((config.ball.speedMin + config.ball.speedMax) / 2);
  const reach = Math.max(0, boss.radius - 22);
  const lead = run.boss.weakX + run.boss.weakDir * 1.7 * flight;
  // The weak point turns back at the edges of the body: follow it there.
  const folded = Math.abs(lead) <= reach ? lead : Math.sign(lead) * (2 * reach - Math.abs(lead));
  return { x: boss.x + folded, y: boss.y };
}

/** Dodges the columns of a boss, collects, and otherwise goes under the most dangerous enemy. */
function dodgingMove(run: Run, config: GameConfig): -1 | 0 | 1 {
  return dodgeMove(run, config) ?? collectingMove(run, config);
}

/**
 * The player that uses everything: aims by hand at the most dangerous enemy (leading it) and at the
 * weak point of a boss's shield, dodges the columns with a human reaction, keeps the Ultimate for
 * the stun of a shielded boss, collects every ball that falls or drops, spends level-ups with the
 * balanced scores and answers the replace screen sensibly.
 */
export const activePolicy: Policy = {
  name: 'active',
  move: dodgingMove,
  aim: bossAwareAim,
  pick: balancedPick,
  holdSignature: (run) => liveBoss(run) !== undefined && run.boss.shieldHp > 0,
};

/** The same bot that never dodges (ADR-046): shows that the health of the player matters. */
export const activeNoDodgePolicy: Policy = {
  ...activePolicy,
  name: 'active-no-dodge',
  move: collectingMove,
};

/** The same bot that never throws the signature: shows what throwing it is worth (4F-D, M17). */
export const activeNoSignaturePolicy: Policy = {
  ...activePolicy,
  name: 'active-no-signature',
  signatureDelay: -1,
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

/**
 * M15 (ADR-038): the active bot whose choices use the real stats of the games. `statsReplace`
 * swaps the Pokémon whose stats and level are worst for the capture, if the capture is better, and
 * prefers to recruit the offered species with the best stats. `randomReplace` decides the same
 * screen at random; both release when the capture is not better.
 */
function statsWorth(config: GameConfig, species: string, level: number): number {
  const view = statsOf(config, species, level);
  // Damage decides most; sturdiness (the guard) adds a little; the level is what it already grew.
  return view.damage * 10 + view.bulk / 20 + level * 2;
}

export function chooseReplaceByStats(run: Run, config: GameConfig): ReplaceAction {
  const pending = run.pendingCapture;
  if (pending === null) return { type: 'release' };
  let weakest = 0;
  let weakestWorth = Number.POSITIVE_INFINITY;
  run.team.forEach((member, i) => {
    if (member.starter) return; // the starter and its signature stay (4F-D)
    const worth = statsWorth(config, member.species, member.level) + member.damageUps;
    if (worth < weakestWorth) {
      weakestWorth = worth;
      weakest = i;
    }
  });
  const incoming = statsWorth(config, pending.species, captureLevel(config, pending.stage));
  return incoming > weakestWorth ? { type: 'replace', slot: weakest } : { type: 'release' };
}

/** The balanced taste, except that among the species offered to recruit the better stats win. */
function statsAwarePick(config: GameConfig): Policy['pick'] {
  const base = pickByScores(BALANCED_SCORES);
  return (run, offers) => {
    const chosen = base(run, offers);
    if (offers[chosen]?.kind !== 'newBall') return chosen;
    let best = chosen;
    let bestDamage = Number.NEGATIVE_INFINITY;
    offers.forEach((card, i) => {
      if (card.kind !== 'newBall') return;
      const damage = statsOf(config, card.species, 1).damage;
      if (damage > bestDamage) {
        bestDamage = damage;
        best = i;
      }
    });
    return best;
  };
}

export function activeStatsPolicy(config: GameConfig): Policy {
  return {
    ...activePolicy,
    name: 'stats-replace',
    pick: statsAwarePick(config),
    replace: (run) => chooseReplaceByStats(run, config),
  };
}

export function activeRandomReplacePolicy(seed: number): Policy {
  const rng = createRng(seed ^ 0x5eed);
  return {
    ...activePolicy,
    name: 'random-replace',
    replace: (run) =>
      nextInt(rng, 2) === 0
        ? { type: 'release' }
        : { type: 'replace', slot: nextInt(rng, Math.max(1, run.team.length)) },
  };
}

/** The same decision made against the stats: it keeps the worst Pokémon (a floor for M15). */
export function activeAgainstStatsPolicy(config: GameConfig): Policy {
  return {
    ...activePolicy,
    name: 'against-stats',
    replace: (run) => {
      const pending = run.pendingCapture;
      if (pending === null) return { type: 'release' };
      let best = 0;
      let bestWorth = Number.NEGATIVE_INFINITY;
      run.team.forEach((member, i) => {
        const worth = statsWorth(config, member.species, member.level);
        if (worth > bestWorth) {
          bestWorth = worth;
          best = i;
        }
      });
      return { type: 'replace', slot: best };
    },
  };
}

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

  // ---- 4F-C (ADR-036..039) ----
  /** Stage steps by kind: evolutions, awakenings and maximum powers (ADR-037). */
  readonly steps: Readonly<Record<'evolve' | 'awaken' | 'peak', number>>;
  /** Moves cast, their damage and the damage of the balls' hits (M13). */
  readonly moveCasts: number;
  readonly moveDamage: number;
  readonly hitDamage: number;
  /**
   * What the player would see (M11): move labels shown on screen, merged into another one, and
   * left out because the screen was full, using the real label policy of the UI.
   */
  readonly labelsShown: number;
  readonly labelsMerged: number;
  readonly labelsDropped: number;
  /** Per Pokémon: ticks it was in the team and moves it cast, for "a move every 40 s" (M11). */
  readonly castCoverage: readonly { readonly ticks: number; readonly casts: number }[];
  /**
   * The starter's signature, which the player throws (4F-D, M12): casts after it was ready for the
   * first time, ticks from then to the first cast, ticks from then to the end of the run.
   */
  readonly starterCastsLate: number;
  readonly starterFirstCastDelay: number;
  readonly starterLateTicks: number;
  /** Tick at which the signature was ready for the first time (-1 never): when "Ultimate lista" shows. */
  readonly signatureReadyTick: number;
  /** False when the replace screen swapped the starter out (it loses its signature with it). */
  readonly starterKept: boolean;
  /** Stage steps with their tick and stage, for the slow-motion time of the evolution moment (M16). */
  readonly stepList: readonly { readonly tick: number; readonly stage: number }[];
  /** Balls that left the arena at the bottom, and captured balls that dropped to the floor (pickups). */
  readonly drops: number;
  readonly captureDrops: number;
  /** Captured balls that came on their own after waiting too long. */
  readonly lateCaptures: number;
  /**
   * Ticks a ball waited on the floor before the player picked it up (mean and the slowest tenth):
   * what the speed cap of ADR-038 is measured by, since the bot picks up nearly every ball.
   */
  readonly pickupLatencyMean: number;
  readonly pickupLatencyP90: number;
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
  const steps = { evolve: 0, awaken: 0, peak: 0 };
  let moveCasts = 0;
  let moveDamage = 0;
  let hitDamage = 0;
  const labels = new MoveLabelPolicy(3, 900);
  const presence = new Map<string, { first: number; last: number; casts: number }>();
  let firstReady = -1;
  const stepList: { tick: number; stage: number }[] = [];
  let starterCastsLate = 0;
  let starterFirstCast = -1;
  let drops = 0;
  let captureDrops = 0;
  let lateCaptures = 0;
  const droppedAt = new Map<number, number>();
  const latencies: number[] = [];
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
        case 'stage':
          evolutions += 1;
          steps[e.kind] += 1;
          if (firstEvolve < 0) firstEvolve = run.tickCount;
          stepList.push({ tick: run.tickCount, stage: e.stage });
          break;
        case 'move': {
          moveCasts += 1;
          moveDamage += e.damage;
          // A move is the damage of its Pokémon too (M6): it counts towards the starter's share.
          damageBy.set(e.species, (damageBy.get(e.species) ?? 0) + e.damage);
          const seen = presence.get(e.species);
          if (seen !== undefined) seen.casts += 1;
          // What the player would see, with the same clock the game uses (60 ticks = 1 s).
          labels.offer(
            e.member,
            e.move,
            labelPriority(e.starter, e.tier),
            e.x,
            e.y,
            (run.tickCount * 1000) / 60,
          );
          if (e.manual && firstReady >= 0) {
            starterCastsLate += 1;
            if (starterFirstCast < 0) starterFirstCast = run.tickCount;
          }
          break;
        }
        case 'drop':
          drops += 1;
          droppedAt.set(e.ballId, run.tickCount);
          break;
        case 'captureDrop':
          captureDrops += 1;
          break;
        case 'capture':
          captures += 1;
          if (e.late) lateCaptures += 1;
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
        case 'collect': {
          if (e.late) recalled += 1;
          else collected += 1;
          const left = droppedAt.get(e.ballId);
          if (left !== undefined && !e.late) latencies.push(run.tickCount - left);
          droppedAt.delete(e.ballId);
          break;
        }
        case 'leak':
          hpLost += e.damage;
          if (wave === 0) wave1Loss += e.damage;
          break;
        case 'heal':
          hpHealed += e.amount;
          break;
        case 'hit': {
          const ball = run.loadout.find((b) => b.id === e.ballId);
          hitDamage += e.damage;
          if (ball !== undefined) {
            damageBy.set(ball.species, (damageBy.get(ball.species) ?? 0) + e.damage);
          }
          break;
        }
        default:
          break;
      }
    }
    for (const member of run.team) {
      const seen = presence.get(member.species);
      if (seen === undefined) {
        presence.set(member.species, { first: run.tickCount, last: run.tickCount, casts: 0 });
      } else {
        seen.last = run.tickCount;
      }
    }
    minHp = Math.min(minHp, run.player.hp);
    if (firstReady < 0) {
      const index = run.team.findIndex((member) => member.starter);
      if (index >= 0 && signatureReady(run, config, index)) firstReady = run.tickCount;
    }
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
    steps,
    moveCasts,
    moveDamage,
    hitDamage,
    labelsShown: labels.shown,
    labelsMerged: labels.merged,
    labelsDropped: labels.dropped,
    castCoverage: [...presence.values()].map((p) => ({
      ticks: p.last - p.first + 1,
      casts: p.casts,
    })),
    starterCastsLate,
    starterFirstCastDelay:
      starterFirstCast < 0 || firstReady < 0 ? -1 : starterFirstCast - firstReady,
    starterLateTicks: firstReady < 0 ? 0 : run.tickCount - firstReady,
    signatureReadyTick: firstReady,
    starterKept: run.team.some((member) => member.starter),
    stepList,
    drops,
    captureDrops,
    lateCaptures,
    pickupLatencyMean:
      latencies.length === 0 ? 0 : latencies.reduce((a, b) => a + b, 0) / latencies.length,
    pickupLatencyP90:
      latencies.length === 0
        ? 0
        : (latencies.slice().sort((a, b) => a - b)[Math.floor(latencies.length * 0.9)] ?? 0),
  };
}
