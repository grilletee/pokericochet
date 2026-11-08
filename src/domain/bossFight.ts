import { damagePlayer, leakDamage } from './combat';
import type { BossAttackDef, BossPatternDef, BossPhaseDef, GameConfig } from './config';
import { nextFloat, nextInt } from './rng';
import type { Hazard, Run } from './run';
import type { Enemy, GameType } from './types';

/** A whole number of ticks from a positive length (the domain may not use Math.round). */
function ticksOf(x: number): number {
  return (x + 0.5) | 0;
}

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
 * How far from each side of the arena the player can go: the margin of the floor plus what the
 * `tide` of Kyogre has squeezed in (ADR-054). The rest of the game asks this, never `margin` directly.
 */
export function fieldMargin(run: Run, config: GameConfig): number {
  return config.player.margin + run.boss.squeeze * (config.arena.width * 0.3);
}

/** Does the barrier of a legendary reflect the balls now (ADR-054)? */
export function barrierUp(run: Run): boolean {
  return run.boss.barrier > 0;
}

/** The speed the player moves at, slowed while Dialga's time slow lasts (ADR-054). */
export function playerSpeedMult(run: Run, config: GameConfig): number {
  if (run.boss.timeSlow <= 0) return 1;
  const mechanic = patternFor(
    config,
    bossSpeciesOf(run, config),
    bossTypeOf(run, config),
  )?.mechanic;
  return mechanic?.kind === 'timeSlow' ? mechanic.mult : 1;
}

function bossSpeciesOf(run: Run, config: GameConfig): string {
  void config;
  return run.enemies.find((e) => e.id === run.boss.id)?.species ?? '';
}

function bossTypeOf(run: Run, config: GameConfig): string {
  void config;
  return run.enemies.find((e) => e.id === run.boss.id)?.type ?? '';
}

/** An Ultimate that lands while the boss is exposed hits extra hard (ADR-054); 1 otherwise. */
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
  run.boss.squeeze = 0;
  run.boss.barrier = 0;
  run.boss.timeSlow = 0;
  run.boss.mechIn = 240;
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
    link: 0,
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

/**
 * The exclusive mechanic of a legendary (ADR-054), one tick: the tide squeezes the field in, cracks
 * open in the floor, the barrier goes up and down, time slows, portals open. Bosses without one skip it.
 */
function advanceMechanic(run: Run, config: GameConfig, pattern: BossPatternDef): void {
  const mechanic = pattern.mechanic;
  if (mechanic === undefined) return;
  const { width } = config.arena;
  const fury = run.boss.phase === 1;
  switch (mechanic.kind) {
    case 'tide': {
      // The water rises a little all the time and further in the fury; it never goes back.
      const goal = mechanic.maxSqueeze * (fury ? 1 : 0.55);
      run.boss.squeeze = Math.min(goal, run.boss.squeeze + goal / mechanic.riseTicks);
      const margin = fieldMargin(run, config);
      run.player.x = Math.max(margin, Math.min(width - margin, run.player.x));
      break;
    }
    case 'cracks': {
      run.boss.mechIn -= 1;
      if (run.boss.mechIn <= 0) {
        const count = mechanic.count + (fury ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const x = 30 + nextFloat(run.rng.boss) * (width - 60);
          addHazard(run, config, {
            kind: 'crack',
            x,
            y: 0,
            link: 0,
            width: 44,
            telegraph: 80,
            active: mechanic.lastTicks,
            damage: 1.5,
            speed: 0,
            struck: false,
          });
        }
        run.boss.mechIn = ticksOf(mechanic.everyTicks * (fury ? 0.7 : 1));
      }
      break;
    }
    case 'barrier': {
      if (run.boss.barrier > 0) {
        run.boss.barrier -= 1;
        if (run.boss.barrier === 0) {
          run.boss.mechIn = mechanic.offTicks;
          run.events.push({ type: 'bossBarrier', up: false });
        }
      } else {
        run.boss.mechIn -= 1;
        if (run.boss.mechIn <= 0) {
          run.boss.barrier = ticksOf(mechanic.onTicks * (fury ? 1.25 : 1));
          run.events.push({ type: 'bossBarrier', up: true });
        }
      }
      break;
    }
    case 'timeSlow': {
      if (run.boss.timeSlow > 0) {
        run.boss.timeSlow -= 1;
      } else {
        run.boss.mechIn -= 1;
        if (run.boss.mechIn <= 0) {
          run.boss.timeSlow = ticksOf(mechanic.lastTicks * (fury ? 1.3 : 1));
          run.boss.mechIn = ticksOf(mechanic.everyTicks * (fury ? 0.75 : 1));
          run.events.push({ type: 'bossTimeSlow' });
        }
      }
      break;
    }
    case 'portals': {
      run.boss.mechIn -= 1;
      if (run.boss.mechIn <= 0) {
        const a = 60 + nextFloat(run.rng.boss) * (width / 2 - 100);
        const b = width / 2 + 40 + nextFloat(run.rng.boss) * (width / 2 - 100);
        const make = (x: number, link: number): Hazard => ({
          kind: 'portal',
          x,
          y: 0,
          link,
          width: 40,
          telegraph: 60,
          active: mechanic.lastTicks,
          damage: 0,
          speed: 0,
          struck: false,
        });
        addHazard(run, config, make(a, b));
        addHazard(run, config, make(b, a));
        run.boss.mechIn = ticksOf(mechanic.everyTicks * (fury ? 0.75 : 1));
      }
      break;
    }
    case 'storm':
    case 'meteors': {
      run.boss.mechIn -= 1;
      if (run.boss.mechIn <= 0) {
        const count = mechanic.count + (fury ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const x = 30 + nextFloat(run.rng.boss) * (width - 60);
          addHazard(
            run,
            config,
            mechanic.kind === 'storm'
              ? {
                  kind: 'column',
                  x,
                  y: 0,
                  link: 0,
                  width: 34,
                  telegraph: 70 + i * 12,
                  active: 14,
                  damage: 1.5,
                  speed: 0,
                  struck: false,
                }
              : {
                  kind: 'shot',
                  x,
                  y: 0,
                  link: 0,
                  width: 30,
                  telegraph: 70 + i * 10,
                  active: 0,
                  damage: 1.5,
                  speed: 5,
                  struck: false,
                },
          );
        }
        run.boss.mechIn = ticksOf(mechanic.everyTicks * (fury ? 0.7 : 1));
      }
      break;
    }
  }
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

  // The charge (ADR-054): guarded, announced, then the boss stops and charges its strong attack,
  // exposed (it takes much more damage, and the Ultimate is worth most), and launches it.
  if (run.boss.coreOpen > 0) {
    run.boss.coreOpen -= 1;
    if (run.boss.coreOpen === 0) {
      run.boss.coreIn = phase.coreEvery;
      run.events.push({ type: 'bossCore', open: false, warning: false });
      spawnAttack(run, config, boss, phase, phase.strong);
    }
  } else {
    run.boss.coreIn -= 1;
    if (run.boss.coreIn === fight.coreWarnTicks) {
      run.events.push({ type: 'bossCore', open: false, warning: true });
    }
    if (run.boss.coreIn <= 0) {
      run.boss.coreOpen = phase.coreOpen;
      run.events.push({ type: 'bossCore', open: true, warning: false });
    }
  }
  advanceMechanic(run, config, pattern);

  // A round of attacks (not while it charges: it is busy).
  if (run.boss.coreOpen <= 0) run.boss.attackIn -= 1;
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
  if (run.boss.portalCool > 0) run.boss.portalCool -= 1;
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
      const margin = fieldMargin(run, config);
      run.player.x = Math.max(
        margin,
        Math.min(config.arena.width - margin, run.player.x + hazard.speed),
      );
    } else if (hazard.kind === 'zone') {
      hazard.active -= 1;
    } else if (hazard.kind === 'crack') {
      // A burning crack hurts whoever stands on it, every second.
      hazard.active -= 1;
      if (hazard.active % 60 === 0 && covers(run, hazard)) {
        strike(run, config, hazard);
        hazard.struck = false;
      }
    } else if (hazard.kind === 'portal') {
      // Touching one carries the player to its pair, once; they cannot be carried back at once.
      hazard.active -= 1;
      if (covers(run, hazard) && run.boss.portalCool <= 0) {
        run.player.x = hazard.link;
        run.boss.portalCool = 45;
        run.events.push({ type: 'bossPortal', from: hazard.x, to: hazard.link });
      }
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
