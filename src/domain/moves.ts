import { ultimateOnBoss } from './bossFight';
import { effectivenessOn, hitDamage } from './combat';
import type { GameConfig, MoveShapeDef } from './config';
import { ballPower, damageEnemy, nearestOther } from './effects';
import { stageForLevel } from './forms';
import type { Run } from './run';
import type { Ball, Enemy } from './types';

/** Hits a Pokémon of this stage must land before its move (the last value repeats). */
export function chargeNeed(config: GameConfig, stage: number): number {
  const table = config.moves.chargeByStage;
  return table[stage - 1] ?? table[table.length - 1] ?? 1;
}

/** The shape of the move of a species line at a stage: its signature, else the tier's (ADR-039). */
export function moveShape(
  config: GameConfig,
  base: string,
  stage: number,
): MoveShapeDef & { readonly power: number } {
  const { tiers } = config.moves;
  const tier = tiers[stage - 1] ?? tiers[tiers.length - 1] ?? { kind: 'burst', power: 1 };
  const own = signatureOf(config, base, stage);
  // A signature is a whole shape of its own: it takes nothing of the tier's size, only its
  // strength when it does not give one (a cross must not inherit the radius of a nova).
  if (own === null) return tier;
  return { ...own, power: own.power ?? tier.power };
}

/**
 * The hand-made shape of a species line at a stage, or null when it only has its tier's. Past the
 * end of the list the last entry repeats; an explicit null keeps the tier's shape.
 */
export function signatureOf(config: GameConfig, base: string, stage: number): MoveShapeDef | null {
  const list = config.moves.signatures[base];
  if (list === undefined) return null;
  const own = stage - 1 < list.length ? list[stage - 1] : list[list.length - 1];
  return own ?? null;
}

/**
 * True when the Pokémon at `index` can be told to cast its signature now (4F-D): it is the
 * starter, its stage has a signature and its charge is full. The signature never goes off on its
 * own; the player throws it.
 */
export function signatureReady(run: Run, config: GameConfig, index: number): boolean {
  const member = run.team[index];
  if (member === undefined || !member.starter) return false;
  const stage = stageForLevel(config, member.level);
  return (
    signatureOf(config, member.species, stage) !== null &&
    moveIdOf(config, member.species, stage) !== undefined &&
    member.charge >= chargeNeed(config, stage)
  );
}

/** The move id a species line has at a stage, if it has data for one. */
export function moveIdOf(config: GameConfig, base: string, stage: number): string | undefined {
  const list = config.moves.byBase[base];
  return list?.[Math.min(stage, list.length) - 1];
}

const scratchSeen: number[] = [];

/** Burn or slow of the type of the ball on an enemy a move reached. */
function applyStatus(config: GameConfig, ball: Ball, enemy: Enemy, power: number): void {
  if (enemy.hp <= 0) return;
  const status = config.moves.status[ball.type];
  if (status === undefined) return;
  if (status.burn !== undefined) {
    const dps = status.burn * effectivenessOn(config, ball.type, enemy) * power;
    enemy.burnTicks = config.effects.burnTicks;
    enemy.burnDps = Math.max(enemy.burnDps, dps);
  }
  if (status.slow !== undefined) {
    enemy.slow = Math.max(status.slow, enemy.slowTicks > 0 ? enemy.slow : 0);
    enemy.slowTicks = config.effects.slowTicks;
  }
}

/** True when the living enemy is inside the shape that was cast at (x, y). Pure geometry. */
function inside(shape: MoveShapeDef, enemy: Enemy, x: number, y: number): boolean {
  const dx = enemy.x - x;
  const dy = enemy.y - y;
  const half = (shape.width ?? 0) / 2;
  switch (shape.kind) {
    case 'burst':
    case 'nova': {
      const radius = shape.radius ?? 0;
      return dx * dx + dy * dy <= radius * radius;
    }
    case 'beam':
      // A column from the impact to the top edge: enemies further up the arena.
      return Math.abs(dx) <= half && dy <= 0;
    case 'cross':
      return Math.abs(dx) <= half || Math.abs(dy) <= half;
    case 'wave':
      return Math.abs(dy) <= half;
    case 'chain':
      return false; // not an area: see `castChain`
  }
}

/** What a cast has reached so far; reused so a cast allocates nothing. */
const tally = { hits: 0, damage: 0 };

/** One enemy struck by a move: its damage, its status and the tally. */
function strike(run: Run, config: GameConfig, ball: Ball, enemy: Enemy, power: number): void {
  // An Ultimate on a boss: it takes a share of an intact shield, and hits extra during the stun.
  const onBoss = enemy.id === run.boss.id ? ultimateOnBoss(run, config) : 1;
  const damage = hitDamage(config, ball, enemy.type, enemy.type2) * power * onBoss;
  damageEnemy(run, config, enemy, damage);
  applyStatus(config, ball, enemy, power);
  tally.hits += 1;
  tally.damage += damage;
}

/** The move jumps from the enemy that was hit to the nearest ones, one `count` of them. */
function castChain(
  run: Run,
  config: GameConfig,
  ball: Ball,
  target: Enemy,
  shape: MoveShapeDef,
  power: number,
): void {
  let from = target;
  scratchSeen.length = 0;
  scratchSeen.push(target.id);
  if (target.hp > 0) strike(run, config, ball, target, power);
  for (let jump = 0; jump < (shape.count ?? 1); jump++) {
    const other = nearestOther(run.enemies, from, config.effects.chainRadius, scratchSeen);
    if (other === null) break;
    scratchSeen.push(other.id);
    run.events.push({
      type: 'chain',
      fromX: from.x,
      fromY: from.y,
      toX: other.x,
      toY: other.y,
    });
    strike(run, config, ball, other, power);
    from = other;
  }
}

/**
 * A ball of a Pokémon of the team landed a hit on `target` (ADR-039): the Pokémon gains a charge
 * and, when it is full, casts its move on the enemy just hit. Deterministic and with no random
 * stream: the shape is applied to the enemies in array order. A Pokémon without a move in the
 * data never charges.
 */
export function landHit(run: Run, config: GameConfig, ball: Ball, target: Enemy): void {
  const member = run.team[ball.owner];
  if (member === undefined) return;
  const move = moveIdOf(config, member.species, ball.stage);
  if (move === undefined) return;
  const need = chargeNeed(config, ball.stage);
  member.charge += 1;
  if (member.charge < need) return;
  if (member.starter && signatureOf(config, member.species, ball.stage) !== null) {
    // The signature waits for the player (4F-D): the charge stays full, it does not pile up.
    member.charge = need;
    return;
  }
  member.charge = 0;
  castMove(run, config, ball, move, target.x, target.y, target, false);
}

/** The enemy nearest to a point (ties: the first in array order), or null if none lives. */
function enemyNear(run: Run, x: number, y: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0) continue;
    const d2 = (enemy.x - x) * (enemy.x - x) + (enemy.y - y) * (enemy.y - y);
    if (d2 < bestD2) {
      best = enemy;
      bestD2 = d2;
    }
  }
  return best;
}

/**
 * The player throws the signature of the Pokémon at `index` (4F-D). It lands where the player aims
 * (manual aim) or on the enemy nearest to the launcher (assisted aim), and does nothing, keeping
 * the charge, when it is not ready or no enemy is alive. A command, so the run stays a function of
 * its seed and its commands. Returns true if it was cast.
 */
export function castSignature(run: Run, config: GameConfig, index: number): boolean {
  if (!signatureReady(run, config, index)) return false;
  const ball = run.loadout.find((candidate) => candidate.owner === index);
  const member = run.team[index];
  if (ball === undefined || member === undefined) return false;
  const move = moveIdOf(config, member.species, ball.stage);
  if (move === undefined) return false;
  const at = run.autoAim
    ? enemyNear(run, run.player.x, config.player.y)
    : enemyNear(run, run.aimX, run.aimY);
  if (at === null) return false;
  const x = run.autoAim ? at.x : run.aimX;
  const y = run.autoAim ? at.y : run.aimY;
  member.charge = 0;
  castMove(run, config, ball, move, x, y, at, true);
  return true;
}

/** The effect of one cast, shared by the moves that go off by themselves and the signature. */
function castMove(
  run: Run,
  config: GameConfig,
  ball: Ball,
  move: string,
  x: number,
  y: number,
  target: Enemy,
  manual: boolean,
): void {
  const member = run.team[ball.owner];
  if (member === undefined) return;
  const shape = moveShape(config, member.species, ball.stage);
  const power = ballPower(run, config, ball) * shape.power;
  tally.hits = 0;
  tally.damage = 0;
  if (shape.kind === 'chain') {
    castChain(run, config, ball, target, shape, power);
  } else {
    for (const enemy of run.enemies) {
      if (enemy.hp <= 0 || !inside(shape, enemy, x, y)) continue;
      strike(run, config, ball, enemy, power);
    }
  }
  run.events.push({
    type: 'move',
    member: ball.owner,
    species: member.species,
    starter: member.starter,
    manual,
    signature: signatureOf(config, member.species, ball.stage) !== null,
    move,
    tier: ball.stage,
    element: ball.type,
    shape: shape.kind,
    size: (shape.kind === 'burst' || shape.kind === 'nova' ? shape.radius : shape.width) ?? 0,
    x,
    y,
    hits: tally.hits,
    damage: tally.damage,
  });
}
