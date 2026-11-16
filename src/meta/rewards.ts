import type { RunSummary } from '../domain';
import type { Profile } from './profile';

/**
 * What a run is worth when it ends (4G-I, Phase 5, ADR-025 point 3): a pure function of its summary.
 * Coins for every wave cleared and every boss defeated, a prize for winning, and a little for the
 * enemies defeated. "Más por jugar mejor"; coins of the game only: no real money, no adverts (Vision).
 *
 * 4G-J (ADR-057): recalibrated for the new gacha (100 coins a draw) so that an average run pays for a
 * few draws and a won run for about a x10; measured with the bots in the 4G-J report.
 */
export const COINS_PER_WAVE = 30;
export const COINS_PER_BOSS = 100;
export const COINS_FOR_WIN = 250;
/** One coin for every this many enemies defeated. */
export const KILLS_PER_COIN = 6;

export function coinsFor(summary: RunSummary): number {
  return (
    summary.wavesCleared * COINS_PER_WAVE +
    summary.bossesDefeated * COINS_PER_BOSS +
    (summary.result === 'won' ? COINS_FOR_WIN : 0) +
    Math.floor(summary.kills / KILLS_PER_COIN)
  );
}

/** The profile after a run: its coins, its numbers. */
export function recordRun(profile: Profile, summary: RunSummary): Profile {
  return {
    ...profile,
    coins: profile.coins + coinsFor(summary),
    stats: {
      runs: profile.stats.runs + 1,
      wins: profile.stats.wins + (summary.result === 'won' ? 1 : 0),
      bossesDefeated: profile.stats.bossesDefeated + summary.bossesDefeated,
    },
  };
}
