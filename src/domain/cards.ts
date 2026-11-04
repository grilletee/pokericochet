import { createBall } from './combat';
import type { GameConfig } from './config';
import { applyHybrid, previewHybrid } from './evolution';
import { nextFloat, nextInt } from './rng';
import type { Run } from './run';
import type { Card } from './types';

const UPGRADES: readonly Card[] = [{ kind: 'damage' }, { kind: 'cadence' }, { kind: 'vitality' }];
const MAX_ATTEMPTS = 40;

/** Flat list of loadout slot pairs `a` < `b` that can be hybridised: a0, b0, a1, b1, ... */
function hybridPairs(run: Run): number[] {
  const pairs: number[] = [];
  for (let a = 0; a < run.loadout.length; a++) {
    for (let b = a + 1; b < run.loadout.length; b++) {
      if (previewHybrid(run, a, b) !== null) pairs.push(a, b);
    }
  }
  return pairs;
}

/** Two offers with the same key are the same card (so at most one hybrid is ever offered). */
function cardKey(card: Card): string {
  return card.kind === 'newBall' ? `newBall:${card.species}` : card.kind;
}

/** One random card, drawing only from the `cards` stream. */
function drawCard(run: Run, config: GameConfig, pairs: readonly number[]): Card {
  const { weights, maxBalls } = config.cards;
  const newBall =
    run.loadout.length < maxBalls && config.ballSpecies.length > 0 ? weights.newBall : 0;
  const hybrid = pairs.length > 0 ? weights.hybrid : 0;
  const total = newBall + weights.upgrade + hybrid;
  const roll = nextFloat(run.rng.cards) * total;
  if (roll < newBall) {
    const species = config.ballSpecies[nextInt(run.rng.cards, config.ballSpecies.length)];
    if (species !== undefined) return { kind: 'newBall', species };
  }
  if (roll >= newBall + weights.upgrade && pairs.length > 0) {
    const pair = nextInt(run.rng.cards, pairs.length / 2) * 2;
    const swap = nextInt(run.rng.cards, 2) === 1;
    const first = pairs[pair] ?? 0;
    const second = pairs[pair + 1] ?? 0;
    return swap ? { kind: 'hybrid', a: second, b: first } : { kind: 'hybrid', a: first, b: second };
  }
  return UPGRADES[nextInt(run.rng.cards, UPGRADES.length)] ?? { kind: 'damage' };
}

/**
 * The cards offered at a level-up: `offerCount` different ones, drawn from the `cards` stream
 * only. A new ball is never offered when the loadout is full, and a hybrid only when two balls of
 * different types and level 2 or more exist.
 */
export function drawOffers(run: Run, config: GameConfig): Card[] {
  const offers: Card[] = [];
  const pairs = hybridPairs(run);
  const seen = new Set<string>();
  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS && offers.length < config.cards.offerCount;
    attempt++
  ) {
    const card = drawCard(run, config, pairs);
    const key = cardKey(card);
    if (seen.has(key)) continue;
    seen.add(key);
    offers.push(card);
  }
  return offers;
}

/** Applies a chosen card to the run. */
export function applyCard(run: Run, config: GameConfig, card: Card): void {
  const { cards } = config;
  switch (card.kind) {
    case 'newBall':
      if (run.loadout.length < cards.maxBalls) {
        run.loadout.push(createBall(config, card.species, run.nextBallId));
        run.nextBallId += 1;
        run.cooldowns.push(0);
      }
      break;
    case 'damage':
      run.player.damageMult += cards.damageStep;
      break;
    case 'cadence':
      run.player.cooldownMult = Math.max(
        cards.cadenceFloor,
        run.player.cooldownMult * cards.cadenceFactor,
      );
      break;
    case 'vitality':
      run.player.maxHp += cards.vitalityHp;
      run.player.hp += cards.vitalityHp;
      break;
    case 'hybrid':
      applyHybrid(run, card.a, card.b);
      break;
  }
}
