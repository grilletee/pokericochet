/**
 * The meta layer (ADR-025, Phase 5, 4G-I): what a player keeps between runs. Pure: the app stores
 * it and joins it to the run only through `applyUpgrades`, before a run is created.
 */
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
export { canStartWith, chooseFirstStarter, starterChoices } from './starters';
