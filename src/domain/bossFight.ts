import { damagePlayer, leakDamage } from './combat';
import type { BossAttackDef, BossPatternDef, BossPhaseDef, GameConfig } from './config';
import { nextFloat, nextInt } from './rng';
import type { Hazard, Run } from './run';
import type { Enemy, GameType } from './types';

/** No attack that hurts is ever announced for less than this: a person has to be able to react. */
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

/** The core is a circle on the body of the boss: where it is, and how big (arena pixels). */
export function coreOf(
  run: Run,
  boss: Enemy,
): { readonly x: number; readonly y: number; readonly radius: number } {
  return { x: boss.x + run.boss.weakX, y: boss.y, radius: boss.radius * 0.45 };
}

/**
 * What a hit of `amount` really does to the boss (ADR-053): little while the core is closed, half
 * while it is open, and never enough to cross into the fury before it has started, so the fury is
 * always played. Anything that hurts the boss goes through here (balls, burns, chains, moves).
 */
export function bossDamage(run: Run, config: GameConfig, boss: Enemy, amount: number): number {
  const fight = config.bossFight;
  if (fight === undefined) return amount;
  const hurt = amount * (run.boss.coreOpen > 0 ? fight.openMult : fight.closedMult);
  const floor = run.boss.phase === 0 ? fight.rageAt * run.boss.maxHp : 0;
  return Math.max(0, Math.min(hurt, boss.hp - floor));
}

/**
 * How much more a ball does when it lands ON the open core (ADR-053): the skill of the fight. A
 * ball anywhere else, or with the core closed, gets 1.
 */
export function coreHitMult(
  run: Run,
  config: GameConfig,
  boss: Enemy,
  x: number,
  y: number,
  radius: number,
): number {
  const fight = config.bossFight;
  if (fight === undefined || run.boss.coreOpen <= 0) return 1;
  const core = coreOf(run, boss);
  const dx = x - core.x;
  const dy = y - core.y;
  const reach = core.radius + radius;
  return dx * dx + dy * dy <= reach * reach ? fight.coreHitMult : 1;
}

/** An Ultimate that lands while the core is open hits extra hard (ADR-053); 1 otherwise. */
export function ultimateOnBoss(run: Run, config: GameConfig): number {
  const fight = config.bossFight;
  if (fight === undefined) return 1;
  return run.boss.coreOpen > 0 ? fight.ultimateOpenBonus : 1;
}

/** A boss has just been put on the field: its fight starts calm, with the core closed (ADR-053). */
export function startFight(run: Run, config: GameConfig, boss: Enemy): void {
  run.hazards.length = 0;
  const fight = config.bossFight;
  if (fight === undefined) return;
  const phase = patternFor(config, boss.species, boss.type)?.phases[0];
  run.boss.phase = 0;
  run.boss.coreOpen = 0;
  run.boss.coreIn = phase?.coreEvery ?? 0;
  run.boss.weakX = 0;
  run.boss.attackIn = fight.calmTicks;
  run.boss.summonDebt = 0;
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

function spawnAttack(
  run: Run,
  config: GameConfig,
  boss: Enemy,
  phase: BossPhaseDef,
  attack: BossAttackDef,
): void {
  const { width } = config.arena;
  const telegraph = Math.max(MIN_TELEGRAPH_TICKS, attack.telegraphTicks);
  const damage = attack.damage * phase.damageMult;
  const base = {
    y: 0,
    telegraph,
    active: attack.activeTicks,
    damage,
    struck: false,
  };
  const half = attack.width / 2;
  const count = Math.max(1, attack.count ?? 1);
  switch (attack.kind) {
    case 'column': {
      const x = half + nextFloat(run.rng.boss) * (width - attack.width);
      addHazard(run, config, { ...base, kind: 'column', x, width: attack.width, speed: 0 });
      break;
    }
    case 'comb': {
      // The floor in `count` equal slots and one of them left safe: there is always somewhere to stand.
      const slot = width / count;
      const safe = nextInt(run.rng.boss, count);
      for (let i = 0; i < count; i++) {
        if (i === safe) continue;
        addHazard(run, config, {
          ...base,
          kind: 'comb',
          x: (i + 0.5) * slot,
          width: slot,
          speed: 0,
        });
      }
      break;
    }
    case 'sweep': {
      const fromLeft = nextInt(run.rng.boss, 2) === 0;
      const speed = (attack.speed ?? 3) * (fromLeft ? 1 : -1);
      const x = fromLeft ? half : width - half;
      addHazard(run, config, { ...base, kind: 'sweep', x, width: attack.width, speed });
      break;
    }
    case 'rain': {
      // Narrow columns one after the other: each warns on its own, a little later than the last.
      for (let i = 0; i < count; i++) {
        const x = half + nextFloat(run.rng.boss) * (width - attack.width);
        addHazard(run, config, {
          ...base,
          kind: 'rain',
          telegraph: telegraph + i * 18,
          x,
          width: attack.width,
          speed: 0,
        });
      }
      break;
    }
    case 'shot': {
      // Aimed where the player stands when it is announced; it falls from the boss after the warning.
      for (let i = 0; i < count; i++) {
        const jitter = (nextFloat(run.rng.boss) - 0.5) * 60;
        const x = Math.max(half, Math.min(width - half, run.player.x + jitter));
        addHazard(run, config, {
          ...base,
          kind: 'shot',
          y: boss.y + boss.radius,
          telegraph: telegraph + i * 24,
          active: 0,
          x,
          width: attack.width,
          speed: attack.speed ?? 6,
        });
      }
      break;
    }
    case 'zone': {
      const x = half + nextFloat(run.rng.boss) * (width - attack.width);
      addHazard(run, config, {
        ...base,
        kind: 'zone',
        damage: 0,
        x,
        width: attack.width,
        speed: 0,
      });
      break;
    }
    case 'gust': {
      const toRight = nextInt(run.rng.boss, 2) === 0;
      addHazard(run, config, {
        ...base,
        kind: 'gust',
        damage: 0,
        x: width / 2,
        width,
        speed: (attack.speed ?? 3) * (toRight ? 1 : -1),
      });
      break;
    }
    case 'summon':
      // The wave code spawns them (it owns the `spawn` stream); the boss only asks.
      run.boss.summonDebt += count;
      run.events.push({ type: 'bossSummon', count });
      break;
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

/** True if a patch of floor (a `zone`) that is active covers x: balls there cannot be collected. */
export function zoneCovers(run: Run, x: number): boolean {
  for (const h of run.hazards) {
    if (h.kind === 'zone' && h.telegraph <= 0 && Math.abs(x - h.x) <= h.width / 2) return true;
  }
  return false;
}

/**
 * One tick of a boss fight (ADR-053): the fury at half health, the core that closes and opens, the
 * rounds of attacks and everything they leave on the floor. It only does anything while a boss with
 * a pattern table is alive.
 */
export function advanceBossFight(run: Run, config: GameConfig): void {
  const fight = config.bossFight;
  if (fight === undefined) return;
  const boss = liveBoss(run);
  if (boss === undefined) {
    run.hazards.length = 0;
    return;
  }
  const pattern = patternFor(config, boss.species, boss.type);
  const phase = pattern?.phases[run.boss.phase];
  if (pattern === undefined || phase === undefined) return;

  // The fury: a message, a calm moment and a harder table; the game never stops for it.
  if (run.boss.phase === 0 && boss.hp <= fight.rageAt * run.boss.maxHp + 1e-9) {
    run.boss.phase = 1;
    run.boss.coreOpen = 0;
    run.boss.coreIn = pattern.phases[1].coreEvery;
    run.boss.attackIn = fight.calmTicks;
    run.events.push({ type: 'bossPhase', phase: 1 });
    return;
  }

  // The core: closed, announced, open.
  if (run.boss.coreOpen > 0) {
    run.boss.coreOpen -= 1;
    if (run.boss.coreOpen === 0) {
      run.boss.coreIn = phase.coreEvery;
      run.events.push({ type: 'bossCore', open: false, warning: false });
    }
  } else {
    run.boss.coreIn -= 1;
    if (run.boss.coreIn === fight.coreWarnTicks) {
      run.events.push({ type: 'bossCore', open: false, warning: true });
    }
    if (run.boss.coreIn <= 0) {
      const reach = boss.radius * 0.55;
      run.boss.weakX = (nextFloat(run.rng.boss) * 2 - 1) * reach;
      run.boss.coreOpen = phase.coreOpen;
      run.events.push({ type: 'bossCore', open: true, warning: false });
    }
  }

  // A round of attacks.
  run.boss.attackIn -= 1;
  if (run.boss.attackIn <= 0) {
    for (let i = 0; i < phase.perRound; i++) {
      const attack = phase.attacks[nextInt(run.rng.boss, Math.max(1, phase.attacks.length))];
      if (attack !== undefined) spawnAttack(run, config, boss, phase, attack);
    }
    run.boss.attackIn = phase.intervalTicks;
  }

  // What is on the floor: warn, strike, fall, push, block, leave.
  let kept = 0;
  const floorY = config.player.y;
  for (const hazard of run.hazards) {
    if (hazard.telegraph > 0) {
      hazard.telegraph -= 1;
      if (hazard.telegraph === 0) {
        if (
          hazard.kind === 'column' ||
          hazard.kind === 'comb' ||
          hazard.kind === 'rain' ||
          hazard.kind === 'sweep'
        ) {
          const hit = covers(run, hazard);
          if (hit) strike(run, config, hazard);
          run.events.push({ type: 'bossStrike', x: hazard.x, width: hazard.width, hit });
        }
      }
    } else if (hazard.kind === 'shot') {
      hazard.y += hazard.speed;
      if (hazard.y >= floorY - 8) {
        const hit = covers(run, hazard);
        if (hit) strike(run, config, hazard);
        run.events.push({ type: 'bossStrike', x: hazard.x, width: hazard.width, hit });
        hazard.active = -1; // spent
      }
    } else if (hazard.kind === 'gust') {
      hazard.active -= 1;
      run.player.x = Math.max(
        config.player.margin,
        Math.min(config.arena.width - config.player.margin, run.player.x + hazard.speed),
      );
    } else if (hazard.kind === 'zone') {
      hazard.active -= 1;
    } else {
      hazard.active -= 1;
      hazard.x += hazard.speed;
      if (!hazard.struck && covers(run, hazard)) strike(run, config, hazard);
    }
    const alive =
      hazard.kind === 'shot' ? hazard.active >= 0 : hazard.telegraph > 0 || hazard.active > 0;
    if (alive) {
      run.hazards[kept] = hazard;
      kept += 1;
    }
  }
  run.hazards.length = kept;
}
