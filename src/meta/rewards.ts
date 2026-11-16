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

/**
 * Candies a run gives to the Pokémon you played with (4G-J, block 3; 17th playtest: "no entendí cómo
 * se consiguen los caramelos"): some for playing (once you clear a wave, so quitting at once earns
 * nothing) and more for every boss defeated. They raise its permanent level in the collection.
 */
export const CANDIES_PER_RUN = 2;
export const CANDIES_PER_BOSS = 2;

export function candiesFor(summary: RunSummary): number {
  if (summary.wavesCleared < 1) return 0;
  return CANDIES_PER_RUN + summary.bossesDefeated * CANDIES_PER_BOSS;
}

/**
 * The profile after a run: its coins, its numbers, and the candies of the starter it was played with
 * (only if that Pokémon is in the collection).
 */
export function recordRun(profile: Profile, summary: RunSummary, starter = ''): Profile {
  const candies = profile.owned[starter] === undefined ? 0 : candiesFor(summary);
  return {
    ...profile,
    candies:
      candies === 0
        ? profile.candies
        : { ...profile.candies, [starter]: (profile.candies[starter] ?? 0) + candies },
    coins: profile.coins + coinsFor(summary),
    stats: {
      runs: profile.stats.runs + 1,
      wins: profile.stats.wins + (summary.result === 'won' ? 1 : 0),
      bossesDefeated: profile.stats.bossesDefeated + summary.bossesDefeated,
    },
  };
}
