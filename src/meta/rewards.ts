import type { RunSummary } from '../domain';
import type { Profile } from './profile';

/**
 * What a run is worth when it ends (4G-I, Phase 5, ADR-025 point 3): a pure function of its summary.
 * Coins for every wave cleared and every boss defeated, a prize for winning, and a little for the
 * enemies defeated. "Más por jugar mejor"; coins of the game only: no real money, no adverts (Vision).
 *
 * 4G-J (ADR-057): recalibrated for the new gacha (100 coins a draw) so that an average run pays for a
 * few draws and a won run for about a x10; measured with the bots in the 4G-J report.
 *
 * 4X, block 2 (19th playtest: "economía escasa"; decision 3: the featured ★5 for sure in ~3 weeks of
 * 4 runs a day): every number x0.45. The bot that dodges made 419 coins a run with the old numbers
 * (6.9 minutes a run); now ~190, about two draws a run: 160 draws (two hard pities, the worst case of
 * the featured ★5) take 84 runs, three weeks. The economy table is in the 4X report (`economy.ts`).
 */
export const COINS_PER_WAVE = 13;
export const COINS_PER_BOSS = 45;
export const COINS_FOR_WIN = 110;
/** One coin for every this many enemies defeated. */
export const KILLS_PER_COIN = 14;

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
 * 4X: a fragment of a legendary key for defeating the final legendary of a run (a won run); a key is
 * `GACHA_RULES.legend.keyFragments` of them.
 */
export const FRAGMENTS_PER_LEGEND = 1;

export function fragmentsFor(summary: RunSummary): number {
  return summary.result === 'won' ? FRAGMENTS_PER_LEGEND : 0;
}

/**
 * 4X (decision 4): a boss captured in a run marks the Pokédex ("capturado en partida") but does not
 * join the collection; if you already have it, it gives this many of its candies.
 */
export const CAUGHT_CANDIES = 5;

/** What a run leaves for good (4X): coins, candies, key fragments and the marks of the Pokédex. */
export interface RunRewards {
  readonly coins: number;
  /** Candies of the starter (only if it is in the collection). */
  readonly starterCandies: number;
  readonly fragments: number;
  /** The bosses captured in the run, and the candies each one you already have gave. */
  readonly caught: readonly { readonly species: string; readonly candies: number }[];
}

export function rewardsFor(profile: Profile, summary: RunSummary, starter = ''): RunRewards {
  return {
    coins: coinsFor(summary),
    starterCandies: profile.owned[starter] === undefined ? 0 : candiesFor(summary),
    fragments: fragmentsFor(summary),
    caught: (summary.bossesCaught ?? []).map((species) => ({
      species,
      candies: profile.owned[species] === undefined ? 0 : CAUGHT_CANDIES,
    })),
  };
}

/**
 * The profile after a run: its coins, its numbers, the candies of the starter it was played with
 * (only if that Pokémon is in the collection), and 4X: key fragments, the captured bosses marked in
 * the Pokédex (seen too) and their candies when you have them. Nothing of the run joins the
 * collection: only the gacha gives Pokémon for good.
 */
export function recordRun(profile: Profile, summary: RunSummary, starter = ''): Profile {
  const rewards = rewardsFor(profile, summary, starter);
  const candies: Record<string, number> = { ...profile.candies };
  const add = (species: string, n: number): void => {
    if (n > 0) candies[species] = (candies[species] ?? 0) + n;
  };
  add(starter, rewards.starterCandies);
  const caught: Record<string, number> = { ...profile.caught };
  for (const c of rewards.caught) {
    caught[c.species] = (caught[c.species] ?? 0) + 1;
    add(c.species, c.candies);
  }
  const seen = [...new Set([...profile.seen, ...rewards.caught.map((c) => c.species)])].sort();
  return {
    ...profile,
    candies,
    caught,
    seen: seen.length === profile.seen.length ? profile.seen : seen,
    coins: profile.coins + rewards.coins,
    legend: { ...profile.legend, fragments: profile.legend.fragments + rewards.fragments },
    stats: {
      runs: profile.stats.runs + 1,
      wins: profile.stats.wins + (summary.result === 'won' ? 1 : 0),
      bossesDefeated: profile.stats.bossesDefeated + summary.bossesDefeated,
    },
  };
}
