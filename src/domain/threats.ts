import { placeHazard, WARN_TICKS } from './bossFight';
import { hitDamage } from './combat';
import type { GameConfig } from './config';
import type { Run } from './run';
import type { Enemy } from './types';

/**
 * The enemy that becomes a threat (4G-G, 14th playtest: "un enemigo normal se marca y tienes que
 * dejar lo que haces para matarlo antes de que te quite vida"). Deterministic and data-driven
 * (`config.enemyThreat`): the choice depends on the tick count and the field, never on a random draw.
 *
 * Every `everyTicks`, if fewer than `maxAtOnce` are alive, one enemy is marked. A themed species
 * (Voltorb, Electrode, Geodude, Graveler, Exeggcute: what explodes or quakes in the games) is chosen
 * first; if none is on the field, any ordinary enemy on one mark in `otherOneIn`. Its health is lowered
 * so that `hits` strong hits of the team kill it, and it takes extra damage. A `blast` hazard (a column
 * of danger under it, announced for the whole countdown like every attack) is put on the field with
 * the enemy's id as `link` (minus, like its shots): killing the enemy cancels it, and the hazard goes
 * through the guarantee of dodgeability (`isDodgeable`) like any other. If it is not placed (no way
 * through at that moment), nothing is marked: the next chance comes later.
 */
export function advanceThreats(run: Run, config: GameConfig): void {
  const threat = config.enemyThreat;
  if (threat === undefined || run.loadout.length === 0) return;
  if (run.tickCount === 0 || run.tickCount % threat.everyTicks !== 0) return;
  let alive = 0;
  for (const h of run.hazards) if (h.kind === 'blast') alive += 1;
  if (alive >= threat.maxAtOnce) return;
  const turn = (run.tickCount / threat.everyTicks) | 0;

  const themed: Enemy[] = [];
  const others: Enemy[] = [];
  const line = config.arena.defenseLineY;
  for (const e of run.enemies) {
    if (e.id === run.boss.id || e.hp <= 0) continue;
    // On the field, far enough from the line that the countdown can run, and not already a target.
    if (e.y < 40 || e.y > line - 220) continue;
    if (run.hazards.some((h) => h.link === -e.id)) continue;
    (threat.themed[e.species] === undefined ? others : themed).push(e);
  }
  let pick: Enemy | undefined;
  if (themed.length > 0) pick = themed[turn % themed.length];
  else if (others.length > 0 && turn % threat.other.otherOneIn === 0) {
    pick = others[turn % others.length];
  }
  if (pick === undefined) return;

  const def = threat.themed[pick.species] ?? threat.other;
  const placed = placeHazard(run, config, {
    kind: 'blast',
    x: pick.x,
    y: pick.y,
    link: -pick.id,
    width: def.width,
    telegraph: Math.max(WARN_TICKS, threat.countdownTicks),
    active: 14,
    damage: def.damage,
    speed: 0,
    struck: false,
  });
  if (!placed) return;

  // A glass cannon: it dies in `hits` strong hits, and takes more from every one.
  let strongest = 0;
  for (const ball of run.loadout) {
    strongest = Math.max(strongest, hitDamage(config, ball, pick.type, pick.type2));
  }
  if (strongest > 0) pick.hp = Math.min(pick.hp, strongest * threat.hits);
  pick.markTicks = Math.max(WARN_TICKS, threat.countdownTicks) + 20;
  pick.markBonus = threat.markBonus;
}
