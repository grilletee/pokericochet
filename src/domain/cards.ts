import { createBall } from './combat';
import type { GameConfig } from './config';
import { nextFloat, nextInt } from './rng';
import type { Run } from './run';
import type { Card } from './types';

const UPGRADES: readonly Card[] = [{ kind: 'damage' }, { kind: 'cadence' }, { kind: 'vitality' }];
const MAX_ATTEMPTS = 40;

function cardKey(card: Card): string {
  return card.kind === 'newBall' ? `newBall:${card.species}` : card.kind;
}

/** One random card, drawing only from the `cards` stream. */
function drawCard(run: Run, config: GameConfig): Card {
  const { weights, maxBalls } = config.cards;
  const newBall =
    run.loadout.length < maxBalls && config.ballSpecies.length > 0 ? weights.newBall : 0;
  const total = newBall + weights.upgrade + weights.token;
  const roll = nextFloat(run.rng.cards) * total;
  if (roll < newBall) {
    const species = config.ballSpecies[nextInt(run.rng.cards, config.ballSpecies.length)];
    if (species !== undefined) return { kind: 'newBall', species };
  }
  if (roll < newBall + weights.upgrade) {
    return UPGRADES[nextInt(run.rng.cards, UPGRADES.length)] ?? { kind: 'damage' };
  }
  return { kind: 'token' };
}

/**
 * The cards offered at a level-up: `offerCount` different ones, drawn from the `cards` stream
 * only. A new ball is never offered when the loadout is full.
 */
export function drawOffers(run: Run, config: GameConfig): Card[] {
  const offers: Card[] = [];
  const seen = new Set<string>();
  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS && offers.length < config.cards.offerCount;
    attempt++
  ) {
    const card = drawCard(run, config);
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
    case 'token':
      run.tokens += 1;
      break;
  }
}
