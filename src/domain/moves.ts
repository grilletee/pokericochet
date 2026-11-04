import { hitDamage } from './combat';
import type { GameConfig, MoveShapeDef } from './config';
import { ballPower, damageEnemy, nearestOther } from './effects';
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
  const { tiers, signatures } = config.moves;
  const tier = tiers[stage - 1] ?? tiers[tiers.length - 1] ?? { kind: 'burst', power: 1 };
  const list = signatures[base];
  // Past the end of the list the last entry repeats; an explicit null keeps the tier's shape.
  const own =
    list === undefined
      ? undefined
      : stage - 1 < list.length
        ? list[stage - 1]
        : list[list.length - 1];
  // A signature is a whole shape of its own: it takes nothing of the tier's size, only its
  // strength when it does not give one (a cross must not inherit the radius of a nova).
  if (own === undefined || own === null) return tier;
  return { ...own, power: own.power ?? tier.power };
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
    const dps = status.burn * config.typeChart[ball.type][enemy.type] * power;
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
  const damage = hitDamage(config, ball, enemy.type) * power;
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
  member.charge += 1;
  if (member.charge < chargeNeed(config, ball.stage)) return;
  member.charge = 0;

  const shape = moveShape(config, member.species, ball.stage);
  const power = ballPower(run, config, ball) * shape.power;
  const x = target.x;
  const y = target.y;
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
