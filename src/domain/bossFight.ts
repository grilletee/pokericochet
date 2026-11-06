import { damagePlayer, leakDamage } from './combat';
import type { BossAttackDef, BossPatternDef, BossPhaseDef, GameConfig } from './config';
import { nextFloat, nextInt } from './rng';
import type { Hazard, Run } from './run';
import type { Enemy, GameType } from './types';

/** No ground attack is ever announced for less than this: a person has to be able to react (ADR-046). */
export const MIN_TELEGRAPH_TICKS = 60;

/** The pattern table of a boss: its own species, else the template of its main type, else the default. */
export function patternFor(
  config: GameConfig,
  species: string,
  type: GameType | string,
): BossPatternDef | undefined {
  const fight = config.bossFight;
  if (fight === undefined) return undefined;
  return fight.bySpecies[species] ?? fight.byType[type as GameType] ?? fight.default;
}

/** The boss on the field, if it is alive. */
export function liveBoss(run: Run): Enemy | undefined {
  if (run.boss.id === 0) return undefined;
  for (const e of run.enemies) if (e.id === run.boss.id && e.hp > 0) return e;
  return undefined;
}

function phaseOf(config: GameConfig, boss: Enemy, run: Run): BossPhaseDef | undefined {
  return patternFor(config, boss.species, boss.type)?.phases[run.boss.phase];
}

/**
 * Health the boss cannot be taken under until its next phase has started: the damage that would
 * cross the line is cut at it, so every phase gets played (ADR-046). 0 in the last phase.
 */
function phaseFloor(config: GameConfig, boss: Enemy, run: Run): number {
  const next = patternFor(config, boss.species, boss.type)?.phases[run.boss.phase + 1];
  return next === undefined ? 0 : next.fromHp * run.boss.maxHp;
}

/**
 * What a hit of `amount` really does to the boss (ADR-046): a third of it while the shield stands,
 * twice as much while it is stunned, and never enough to cross into the next phase. Anything that
 * hurts the boss goes through here (balls, burns, chains, moves).
 */
export function bossDamage(run: Run, config: GameConfig, boss: Enemy, amount: number): number {
  const fight = config.bossFight;
  if (fight === undefined) return amount;
  let hurt = amount;
  if (run.boss.shieldHp > 0) hurt *= fight.shieldMult;
  else if (run.boss.stunTicks > 0) hurt *= fight.stunMult;
  return Math.max(0, Math.min(hurt, boss.hp - phaseFloor(config, boss, run)));
}

function enterPhase(run: Run, config: GameConfig, boss: Enemy, phase: number): void {
  const def = patternFor(config, boss.species, boss.type)?.phases[phase];
  run.boss.phase = phase;
  run.boss.attackIn = config.bossFight?.phasePauseTicks ?? 120;
  run.boss.stunTicks = 0;
  run.boss.weakX = 0;
  run.boss.weakDir = 1;
  run.boss.shieldHp = (def?.shield?.share ?? 0) * run.boss.maxHp;
  run.boss.shieldMax = run.boss.shieldHp;
  if (def?.shield !== undefined) run.events.push({ type: 'bossShield', broken: false });
}

/** A boss has just been put on the field: its fight starts at phase 0 (ADR-046). */
export function startFight(run: Run, config: GameConfig, boss: Enemy): void {
  run.hazards.length = 0;
  if (config.bossFight === undefined) return;
  enterPhase(run, config, boss, 0);
}

/**
 * A ball at (x, y) of `radius` hit the boss (ADR-046): if its shield stands and the ball is on the
 * weak point, the shield takes the damage and, once gone, the boss is stunned. Called before the
 * damage itself, which `bossDamage` reduces.
 */
export function hitWeakPoint(
  run: Run,
  config: GameConfig,
  boss: Enemy,
  x: number,
  y: number,
  radius: number,
  damage: number,
): void {
  const fight = config.bossFight;
  const shield = phaseOf(config, boss, run)?.shield;
  if (fight === undefined || shield === undefined || run.boss.shieldHp <= 0) return;
  const dx = x - (boss.x + run.boss.weakX);
  const dy = y - boss.y;
  const reach = shield.weakRadius + radius;
  if (dx * dx + dy * dy > reach * reach) return;
  run.boss.shieldHp -= damage;
  if (run.boss.shieldHp <= 0) breakShield(run, config, boss);
}

function breakShield(run: Run, config: GameConfig, boss: Enemy): void {
  const fight = config.bossFight;
  run.boss.shieldHp = 0;
  run.events.push({ type: 'bossShield', broken: true });
  if (fight === undefined) return;
  run.boss.stunTicks = fight.stunTicks;
  boss.haltTicks = fight.stunTicks;
  run.events.push({ type: 'bossStun', ticks: fight.stunTicks });
}

/**
 * The multiplier an Ultimate (a move of the starter) gets on the boss (ADR-046): on an intact
 * shield it takes a share of it away (it can break it, which stuns the boss), and during the stun
 * it hits extra hard. 1 for anything else.
 */
export function ultimateOnBoss(run: Run, config: GameConfig, boss: Enemy): number {
  const fight = config.bossFight;
  if (fight === undefined) return 1;
  if (run.boss.shieldHp > 0) {
    run.boss.shieldHp -= run.boss.shieldMax * fight.ultimateShieldShare;
    if (run.boss.shieldHp <= 0) breakShield(run, config, boss);
    return 1;
  }
  return run.boss.stunTicks > 0 ? fight.ultimateStunBonus : 1;
}

function addHazard(run: Run, config: GameConfig, hazard: Hazard): void {
  if (run.hazards.length >= (config.bossFight?.maxHazards ?? 12)) return;
  run.hazards.push(hazard);
  run.events.push({
    type: 'bossTelegraph',
    x: hazard.x,
    width: hazard.width,
    ticks: hazard.telegraph,
  });
}

function spawnAttack(run: Run, config: GameConfig, attack: BossAttackDef): void {
  const { width } = config.arena;
  const telegraph = Math.max(MIN_TELEGRAPH_TICKS, attack.telegraphTicks);
  const base = { telegraph, active: attack.activeTicks, damage: attack.damage, struck: false };
  const half = attack.width / 2;
  const count = Math.max(1, attack.count ?? 1);
  switch (attack.kind) {
    case 'column': {
      const x = half + nextFloat(run.rng.boss) * (width - attack.width);
      addHazard(run, config, { ...base, x, width: attack.width, speed: 0 });
      break;
    }
    case 'comb': {
      // The floor in `count` equal slots and one of them left safe: there is always somewhere to stand.
      const slot = width / count;
      const safe = nextInt(run.rng.boss, count);
      for (let i = 0; i < count; i++) {
        if (i === safe) continue;
        addHazard(run, config, { ...base, x: (i + 0.5) * slot, width: slot, speed: 0 });
      }
      break;
    }
    case 'sweep': {
      const fromLeft = nextInt(run.rng.boss, 2) === 0;
      const speed = (attack.sweepSpeed ?? 3) * (fromLeft ? 1 : -1);
      const x = fromLeft ? half : width - half;
      addHazard(run, config, { ...base, x, width: attack.width, speed });
      break;
    }
    case 'rain': {
      // Narrow columns one after the other: each warns on its own, a little later than the last.
      for (let i = 0; i < count; i++) {
        const x = half + nextFloat(run.rng.boss) * (width - attack.width);
        addHazard(run, config, {
          ...base,
          telegraph: telegraph + i * 18,
          x,
          width: attack.width,
          speed: 0,
        });
      }
      break;
    }
  }
}

/** Does the column cover the player now? */
function covers(run: Run, hazard: Hazard): boolean {
  return Math.abs(run.player.x - hazard.x) <= hazard.width / 2;
}

function strike(run: Run, config: GameConfig, hazard: Hazard): void {
  hazard.struck = true;
  const cost = leakDamage(config, run.team, hazard.damage);
  damagePlayer(run, cost);
  run.events.push({ type: 'bossHurt', damage: cost });
}

/**
 * One tick of a boss fight (ADR-046): the phase changes, the weak point moves, the stun runs out,
 * the boss announces its next attack and the columns count down, strike and leave. It only does
 * anything while a boss with a pattern table is alive.
 */
export function advanceBossFight(run: Run, config: GameConfig): void {
  const boss = liveBoss(run);
  if (config.bossFight === undefined) return;
  if (boss === undefined) {
    run.hazards.length = 0;
    return;
  }
  const pattern = patternFor(config, boss.species, boss.type);
  const phase = pattern?.phases[run.boss.phase];
  if (pattern === undefined || phase === undefined) return;

  // Next phase: at 66 % and 33 % of the health; the columns of the last one are gone.
  const next = pattern.phases[run.boss.phase + 1];
  if (next !== undefined && boss.hp <= next.fromHp * run.boss.maxHp + 1e-9) {
    run.hazards.length = 0;
    enterPhase(run, config, boss, run.boss.phase + 1);
    run.events.push({ type: 'bossPhase', phase: run.boss.phase });
    return;
  }

  if (run.boss.stunTicks > 0) {
    run.boss.stunTicks -= 1;
    if (run.boss.stunTicks === 0) {
      // The stun is over: a phase that has a shield raises a new one.
      run.boss.shieldHp = (phase.shield?.share ?? 0) * run.boss.maxHp;
      run.boss.shieldMax = run.boss.shieldHp;
      if (phase.shield !== undefined) run.events.push({ type: 'bossShield', broken: false });
    }
  } else {
    if (phase.shield !== undefined && run.boss.shieldHp > 0) {
      // The weak point slides from side to side over the body.
      const reach = Math.max(0, boss.radius - phase.shield.weakRadius);
      run.boss.weakX += run.boss.weakDir * phase.shield.weakSpeed;
      if (run.boss.weakX > reach) {
        run.boss.weakX = reach;
        run.boss.weakDir = -1;
      } else if (run.boss.weakX < -reach) {
        run.boss.weakX = -reach;
        run.boss.weakDir = 1;
      }
    }
    run.boss.attackIn -= 1;
    if (run.boss.attackIn <= 0) {
      const attack = phase.attacks[nextInt(run.rng.boss, Math.max(1, phase.attacks.length))];
      if (attack !== undefined) spawnAttack(run, config, attack);
      run.boss.attackIn = phase.intervalTicks;
    }
  }

  // The columns: warn, strike once if the player is inside, and leave.
  let kept = 0;
  for (const hazard of run.hazards) {
    if (hazard.telegraph > 0) {
      hazard.telegraph -= 1;
      if (hazard.telegraph === 0) {
        const hit = covers(run, hazard);
        if (hit) strike(run, config, hazard);
        run.events.push({ type: 'bossStrike', x: hazard.x, width: hazard.width, hit });
      }
    } else {
      hazard.active -= 1;
      hazard.x += hazard.speed;
      if (!hazard.struck && covers(run, hazard)) strike(run, config, hazard);
    }
    if (hazard.telegraph > 0 || hazard.active > 0) {
      run.hazards[kept] = hazard;
      kept += 1;
    }
  }
  run.hazards.length = kept;
}
