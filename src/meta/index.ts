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
  activeBanners,
  type Banner,
  type BannerInput,
  type BannerKind,
  bannerPeriod,
  buildCatalog,
  type CatalogEntry,
  type CatalogInput,
  type DrawResult,
  drawGacha,
  fiveChance,
  gachaPool,
  lineFinal,
  type PityView,
  type Pull,
  type PullReason,
  pityView,
  type RateTable,
  rateTable,
  type Stars,
} from './gacha';
export {
  addSeen,
  applyUpgrades,
  type BannerProgress,
  emptyProfile,
  exportProfile,
  type GachaState,
  importProfile,
  MAX_BANNER_KEYS,
  MAX_HISTORY,
  MAX_PERMANENT_LEVEL,
  migrateProfile,
  type OwnedPokemon,
  PROFILE_VERSION,
  type Profile,
  type ProfileStats,
  type PullRecord,
  SAVE_MARK,
  startLevelFor,
} from './profile';
export {
  REGISTER_MIN_BOSSES,
  REPEAT_CANDIES,
  registerable,
  registerCapture,
} from './register';
export {
  CANDIES_PER_BOSS,
  CANDIES_PER_RUN,
  COINS_FOR_WIN,
  COINS_PER_BOSS,
  COINS_PER_WAVE,
  candiesFor,
  coinsFor,
  KILLS_PER_COIN,
  recordRun,
} from './rewards';
export { canStartWith, chooseFirstStarter, starterChoices } from './starters';
