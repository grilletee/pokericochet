import { abilitiesFor } from './abilities';
import type { GameConfig } from './config';
import {
  attackTypeOf,
  chooseBranch,
  formAt,
  formOfMember,
  stageForLevel,
  stageKind,
  stageLevelsOf,
} from './forms';
import { placeTypes } from './place';
import type { Run } from './run';
import type { Ball, CaptureSource, Member, ReplaceAction, SpeciesDef } from './types';

function speciesOf(config: GameConfig, id: string): SpeciesDef {
  const species = config.species[id];
  if (species === undefined) throw new Error(`Unknown species: ${id}`);
  return species;
}

/** Evolution stage (1..3) of a Pokémon of the line of `base` at this level. */
export const stageOf = stageForLevel;

/**
 * Level a captured Pokémon joins with, by the stage of the enemy it came from: the FIRST level of
 * that stage, so what falls to the floor is what joins (4F-E). It used to be a separate table
 * (`[1, 3, 4]`) whose third entry was below the start of stage 3 (level 6): a Kingdra boss dropped
 * a Kingdra and joined as a Seadra. Derived from the stage levels of its line (4W), the two can no
 * longer drift apart.
 */
export function captureLevel(config: GameConfig, stage: number, base: string): number {
  const levels = stageLevelsOf(config, base);
  if (stage <= 1) return 1;
  return levels[Math.min(stage - 2, levels.length - 1)] ?? 1;
}

/** Balls a Pokémon of this level fires. */
export function ballsFor(config: GameConfig, level: number): number {
  const table = config.team.ballsByLevel;
  return table[level - 1] ?? table[table.length - 1] ?? 1;
}

/** Collision radius of a ball, by its stage. */
export function ballRadius(config: GameConfig, ball: Ball): number {
  return config.team.ballRadiusByStage[ball.stage - 1] ?? config.ball.radius;
}

/** Damage multiplier of one Pokémon: its power cards and, for the starter, the starter bonus. */
export function powerMult(config: GameConfig, member: Member | undefined): number {
  if (member === undefined) return 1;
  const bonus = member.starter ? config.team.starterBonus : 0;
  return (1 + member.damageUps * config.cards.powerStep) * (1 + bonus);
}

/** Reload multiplier of one Pokémon from its cadence cards (never under the floor). */
export function cadenceMult(config: GameConfig, member: Member | undefined): number {
  if (member === undefined) return 1;
  let mult = 1;
  for (let i = 0; i < member.cadenceUps; i++) mult *= config.cards.cadenceFactor;
  return Math.max(config.cards.cadenceFloor, mult);
}

/** True when no place is left in the team. */
export function teamIsFull(run: Run, config: GameConfig): boolean {
  return run.team.length >= config.team.maxMembers;
}

export function memberIndexOf(run: Run, species: string): number {
  return run.team.findIndex((member) => member.species === species);
}

/**
 * Removes the loadout slots in `gone` (ascending). Their balls leave the arena, whether in flight
 * or waiting on the floor, and the later slots shift down.
 */
function removeSlots(run: Run, gone: readonly number[]): void {
  if (gone.length === 0) return;
  const isGone = new Set(gone);
  const shift = (slot: number): number => {
    let moved = 0;
    for (const g of gone) if (g < slot) moved += 1;
    return slot - moved;
  };
  let kept = 0;
  for (const body of run.bodies) {
    if (isGone.has(body.slot)) continue;
    body.slot = shift(body.slot);
    run.bodies[kept] = body;
    kept += 1;
  }
  run.bodies.length = kept;
  let waiting = 0;
  for (const pickup of run.pickups) {
    if (pickup.slot >= 0) {
      if (isGone.has(pickup.slot)) continue;
      pickup.slot = shift(pickup.slot);
    }
    run.pickups[waiting] = pickup;
    waiting += 1;
  }
  run.pickups.length = waiting;
  run.loadout = run.loadout.filter((_, slot) => !isGone.has(slot));
  run.cooldowns = run.cooldowns.filter((_, slot) => !isGone.has(slot));
}

/**
 * Makes the balls of the Pokémon at `index` match its level: stage, effects and, when the level
 * allows, new balls (ready at once). Existing balls keep their ids, so a ball in flight is not lost.
 */
export function syncMember(run: Run, config: GameConfig, index: number): void {
  const member = run.team[index];
  if (member === undefined) return;
  const stage = stageOf(config, member.level, member.species);
  // 4W, block 7: a line that splits takes its branch the first time it reaches the stage of the
  // split, from the place where that happens; then it keeps it.
  const split = config.branches?.[member.species];
  if (split !== undefined && member.branch === undefined && stage >= split.at) {
    const branch = chooseBranch(config, member.species, placeTypes(run, config));
    if (branch !== undefined) member.branch = branch;
  }
  const branched = member.branch === undefined ? {} : { branch: member.branch };
  // The balls attack with the type of the move shown at this stage (ADR-047).
  const type = attackTypeOf(config, member.species, stage, member.type, member.branch);
  const effects = abilitiesFor(config, member.species, type, stage);
  let have = 0;
  for (let slot = 0; slot < run.loadout.length; slot++) {
    const ball = run.loadout[slot];
    if (ball === undefined || ball.owner !== index) continue;
    have += 1;
    if (ball.level !== member.level || ball.stage !== stage || ball.branch !== member.branch) {
      run.loadout[slot] = { ...ball, level: member.level, stage, type, effects, ...branched };
    }
  }
  for (const want = ballsFor(config, member.level); have < want; have++) {
    run.loadout.push({
      id: run.nextBallId,
      owner: index,
      stage,
      species: member.species,
      type,
      level: member.level,
      hybrid: false,
      effects,
      ...branched,
    });
    run.nextBallId += 1;
    run.cooldowns.push(0);
  }
}

function firstBallId(run: Run, index: number): number {
  return run.loadout.find((ball) => ball.owner === index)?.id ?? 0;
}

/**
 * The branch a capture brings (4W, block 7): the line of always when it was caught at or past the
 * stage of the split of its line (the enemies and bosses only ever show the line of always), else
 * none (it will take one by place when it evolves).
 */
export function capturedBranch(
  config: GameConfig,
  base: string,
  stage: number,
): string | undefined {
  const set = config.branches?.[base];
  if (set === undefined) return undefined;
  const joinsAt = stageOf(config, captureLevel(config, stage, base), base);
  return joinsAt >= set.at ? formAt(config, base, set.at) : undefined;
}

/** Puts a new Pokémon at the end of the team (the caller checked there is room) with its balls. */
export function addMember(
  run: Run,
  config: GameConfig,
  species: string,
  level: number,
  starter = false,
  /** 4W: the branch it already has (a captured Vaporeon is a Vaporeon, wherever it joins). */
  branch?: string,
): number {
  const def = speciesOf(config, species);
  run.team.push({
    species: def.id,
    type: def.type,
    level,
    starter,
    damageUps: 0,
    cadenceUps: 0,
    charge: 0,
    ...(branch === undefined ? {} : { branch }),
  });
  syncMember(run, config, run.team.length - 1);
  return run.team.length - 1;
}

/**
 * +1 level for a Pokémon (a card or a duplicate capture); false if it is already at the maximum.
 * `floor` is the level a duplicate capture is worth at least (4F-D, "you capture what you beat"):
 * the Rapidash a boss drops lifts a Ponyta to the level of Rapidash's stage, not just one more.
 */
export function trainMember(
  run: Run,
  config: GameConfig,
  index: number,
  source: 'card' | 'capture',
  floor = 0,
): boolean {
  const member = run.team[index];
  if (member === undefined || member.level >= config.team.maxLevel) return false;
  const before = stageOf(config, member.level, member.species);
  member.level = Math.min(config.team.maxLevel, Math.max(member.level + 1, floor));
  syncMember(run, config, index);
  const after = stageOf(config, member.level, member.species);
  run.events.push({
    type: 'train',
    member: index,
    species: member.species,
    level: member.level,
    form: formAt(config, member.species, after, member.branch),
    source,
  });
  // One event per stage crossed, in order (Bagon -> Shelgon -> Salamence): a jump of several stages
  // at once (a duplicate capture worth the level of a late stage) must never skip a form (4G-E).
  for (let stage = before + 1; stage <= after; stage++) {
    const kind = stageKind(config, member.species, stage, member.branch);
    if (kind === null) continue;
    run.events.push({
      type: 'stage',
      ballId: firstBallId(run, index),
      member: index,
      species: member.species,
      kind,
      stage,
      from: formAt(config, member.species, stage - 1, member.branch),
      to: formAt(config, member.species, stage, member.branch),
    });
  }
  return true;
}

/**
 * A captured ball reaches the team (ADR-030). A species the team already has gains a level; a new
 * one takes a free place; with the team full, a capture picked up by the player opens the replace
 * screen and one that expired on the floor (`late`) is let go.
 */
export function joinTeam(
  run: Run,
  config: GameConfig,
  species: string,
  stage: number,
  x: number,
  late: boolean,
  /** 4X: how it came (a ball on the floor, a join encounter, the capture of a boss). */
  source: CaptureSource = 'drop',
): void {
  const owned = memberIndexOf(run, species);
  // 4W, block 7: a capture of a form past the split of its line (a Vaporeon) is that form: it
  // fixes the line of always, whatever the place ("you capture what you beat", 4F-D).
  const caught = capturedBranch(config, species, stage);
  if (owned >= 0) {
    run.captured.push({ species, level: stage, source });
    const member = run.team[owned];
    if (member !== undefined && member.branch === undefined && caught !== undefined) {
      member.branch = caught;
    }
    trainMember(run, config, owned, 'capture', captureLevel(config, stage, species));
    return;
  }
  if (!teamIsFull(run, config)) {
    run.captured.push({ species, level: stage, source });
    const index = addMember(
      run,
      config,
      species,
      captureLevel(config, stage, species),
      false,
      caught,
    );
    // A capture that came on its own after waiting too long starts with an extra reload.
    if (late) {
      run.loadout.forEach((ball, slot) => {
        if (ball.owner === index) run.cooldowns[slot] = config.pickup.returnPenaltyTicks;
      });
    }
    run.events.push({
      type: 'capture',
      ballId: firstBallId(run, index),
      species,
      // The form it shows is the one of the level it joins with, whatever the enemy was.
      level: stageOf(config, captureLevel(config, stage, species), species),
      form: captureForm(config, species, stage),
      x,
      late,
      source,
    });
    return;
  }
  const form = captureForm(config, species, stage);
  if (late) {
    run.events.push({ type: 'release', species, form });
    return;
  }
  run.pendingCapture = source === 'drop' ? { species, stage } : { species, stage, source };
  run.phase = 'replace';
  run.events.push({ type: 'replaceOpen', species, stage, form });
}

/**
 * What a ball looks like, from the same rules the game uses (4G-I, 16th playtest: Togekiss dropped a
 * ball that showed Togetic). One function for every place a ball is drawn: in flight, waiting on the
 * floor, as a capture and on the team bar; the render never works out a form by itself.
 */
export function ballView(
  config: GameConfig,
  ball: Pick<Ball, 'species' | 'stage' | 'branch'>,
): {
  readonly form: string;
  readonly stage: number;
} {
  return { form: formAt(config, ball.species, ball.stage, ball.branch), stage: ball.stage };
}

/** What a capture on the floor looks like: the form and stage it will have when it joins. */
export function captureView(
  config: GameConfig,
  species: string,
  stage: number,
): { readonly form: string; readonly stage: number } {
  return {
    form: captureForm(config, species, stage),
    stage: stageOf(config, captureLevel(config, stage, species), species),
  };
}

/** The form a capture of this stage shows once it joins (it joins at `captureLevel`, ADR-036). */
export function captureForm(config: GameConfig, species: string, stage: number): string {
  return formAt(config, species, stageOf(config, captureLevel(config, stage, species), species));
}

/** Answers the replace screen (ADR-030): swap a Pokémon for the capture, or let the capture go. */
export function resolveReplace(run: Run, config: GameConfig, action: ReplaceAction): void {
  const pending = run.pendingCapture;
  if (pending === null) return;
  if (action.type === 'release') {
    run.events.push({
      type: 'release',
      species: pending.species,
      form: captureForm(config, pending.species, pending.stage),
    });
  } else {
    const out = run.team[action.slot];
    if (out === undefined) return; // not a valid choice: keep waiting
    const slots: number[] = [];
    run.loadout.forEach((ball, slot) => {
      if (ball.owner === action.slot) slots.push(slot);
    });
    removeSlots(run, slots);
    const def = speciesOf(config, pending.species);
    const caught = capturedBranch(config, def.id, pending.stage);
    run.team[action.slot] = {
      species: def.id,
      type: def.type,
      level: captureLevel(config, pending.stage, def.id),
      starter: false,
      damageUps: 0,
      cadenceUps: 0,
      charge: 0,
      ...(caught === undefined ? {} : { branch: caught }),
    };
    syncMember(run, config, action.slot);
    run.captured.push({ species: def.id, level: pending.stage, source: pending.source ?? 'drop' });
    run.events.push({
      type: 'replaced',
      slot: action.slot,
      out: out.species,
      species: def.id,
      outForm: formOfMember(config, out),
      form: formOfMember(config, run.team[action.slot] ?? out),
    });
  }
  run.pendingCapture = null;
  run.phase = 'playing';
}
