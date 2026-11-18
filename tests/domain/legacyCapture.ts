import { gameConfig } from '../../src/data';
import type { GameConfig } from '../../src/domain';

/**
 * The rules of capture before 4X: an ordinary enemy may drop its ball, a boss drops its own, and a
 * new Pokémon may come as a card among the others (`newBall`). The mechanism is still in the domain
 * (a config may turn it on); these tests keep it honest. The shipped game uses join encounters and
 * the capture of bosses instead (catching.ts, tests/domain/catching4x.test.ts).
 */
export function legacyCapture(config: GameConfig): GameConfig {
  const { join: _join, boss: _boss, ...rest } = config.capture;
  return {
    ...config,
    capture: { ...rest, wildDrops: true },
    cards: { ...config.cards, weights: { ...config.cards.weights, newBall: 3 } },
  };
}

export const LEGACY: GameConfig = legacyCapture(gameConfig);
