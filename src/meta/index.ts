/**
 * The meta layer (ADR-025, Phase 5, 4G-I): what a player keeps between runs. Pure: the app stores
 * it and joins it to the run only through `applyUpgrades`, before a run is created.
 */

export {
  type DexEntry,
  type DexState,
  dex,
  dexCounts,
  levelUp,
  levelUpCost,
} from './collection';
export {
  type DrawResult,
  drawGacha,
  GACHA_COST,
  gachaPool,
  PITY,
  REPEAT_CANDIES,
} from './gacha';
export {
  addSeen,
  applyUpgrades,
  emptyProfile,
  exportProfile,
  type GachaState,
  importProfile,
  MAX_PERMANENT_LEVEL,
  migrateProfile,
  type OwnedPokemon,
  PROFILE_VERSION,
  type Profile,
  type ProfileStats,
  SAVE_MARK,
  startLevelFor,
} from './profile';
export { REGISTER_MIN_BOSSES, registerable, registerCapture } from './register';
export {
  COINS_FOR_WIN,
  COINS_PER_BOSS,
  COINS_PER_WAVE,
  coinsFor,
  KILLS_PER_COIN,
  recordRun,
} from './rewards';
export { canStartWith, chooseFirstStarter, starterChoices } from './starters';
