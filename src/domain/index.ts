export { abilitiesFor } from './abilities';
export type { BossAdvice, WaveAdvice } from './advice';
export { matchup, themeTypes, typeAdvice, waveAdvice } from './advice';
export type { AimDirection } from './aim';
export { aimDirection } from './aim';
export {
  advanceBossFight,
  advanceEnemyFire,
  barrierUp,
  bossDamage,
  coreOf,
  fieldMargin,
  isEnemyShot,
  liveBoss,
  MAX_WARNINGS,
  MIN_TELEGRAPH_TICKS,
  patternFor,
  playerSpeedMult,
  startFight,
  ultimateOnBoss,
  WARN_TICKS,
  zoneCovers,
} from './bossFight';
export { applyCard, drawOffers } from './cards';
export {
  ballForm,
  ballSpeed,
  bulkOf,
  createBall,
  damagePlayer,
  effectiveness,
  effectivenessOn,
  formPower,
  getSpecies,
  hitDamage,
  leakDamage,
  mapStat,
  stageBoost,
  teamGuard,
} from './combat';
export type {
  AbilitiesDef,
  BossAttackDef,
  BossDef,
  BossFightDef,
  BossMechanicDef,
  BossPatternDef,
  BossPhaseDef,
  EnemyFireDef,
  EnemyThreatDef,
  GameConfig,
  InterludeDef,
  MoveShapeDef,
  MovesDef,
  TeamDef,
  ThemeDef,
  WaveDef,
} from './config';
export { isDodgeable, MIN_GAP, PLAYER_WIDTH, SAFE_MARGIN } from './dodge';
export {
  applyHitEffects,
  ballPower,
  damageEnemy,
  pierceCount,
  tickBurning,
} from './effects';
export { applyHybrid, evolveTeam, mergeBalls, previewHybrid } from './evolution';
export {
  attackTypeOf,
  baseOf,
  formAt,
  formOfMember,
  nextStep,
  type StageKind,
  stageForLevel,
  stageKind,
} from './forms';
export type { FuseError, FuseResult } from './fusion';
export { fuse, HYBRID_MIN_LEVEL, MAX_BALL_LEVEL, SECONDARY_EFFECT_SCALE } from './fusion';
export { SpatialGrid } from './grid';
export type { MemberStats } from './inspect';
export { guardAfterReplace, statsOf, statsOfMember } from './inspect';
export { imul32 } from './int32';
export {
  castSignature,
  chargeNeed,
  landHit,
  moveIdOf,
  moveShape,
  signatureOf,
  signatureReady,
} from './moves';
export {
  bounceOffWalls,
  enforceMinVertical,
  findNearestOverlap,
  reflectOffEnemy,
} from './physics';
export { advancePickups, dropBall, dropCapture, MAX_PICKUPS, reloadTicks } from './pickups';
export {
  biomeLines,
  biomeTypes,
  championOf,
  drawPool,
  fairLines,
  statTotal,
  typesOfLine,
} from './pool';
export { awardKill, checkLevelUp, enemyXp, xpCost } from './progression';
export type { RngState } from './rng';
export { cloneRng, createRng, deriveRng, nextFloat, nextInt, nextU32 } from './rng';
export type { BossState, Hazard, Phase, Player, Run, RunRng } from './run';
export { cloneRun, createRun, hashRun } from './run';
export { motionDirection, smartTarget } from './smartAim';
export type { Snapshot } from './snapshot';
export {
  createSnapshot,
  HAZARD_KINDS,
  NO_SPECIES,
  PHASE_LEVELUP,
  PHASE_LOST,
  PHASE_PLAYING,
  PHASE_REPLACE,
  PHASE_WON,
  STATUS_BURN,
  STATUS_CURSE,
  STATUS_FROZEN,
  STATUS_MARK,
  STATUS_PARALYSED,
  STATUS_POISON,
  STATUS_PUSHED,
  STATUS_SLOW,
  statusOf,
  typeCode,
  writeSnapshot,
} from './snapshot';
export type { RunSummary } from './summary';
export { KILL_SCORE, summarizeRun, WAVE_SCORE, WIN_SCORE } from './summary';
export {
  addMember,
  ballRadius,
  ballsFor,
  cadenceMult,
  captureForm,
  captureLevel,
  joinTeam,
  memberIndexOf,
  powerMult,
  resolveReplace,
  stageOf,
  syncMember,
  teamIsFull,
  trainMember,
} from './team';
export { advanceThreats } from './threats';
export type { TickOutput } from './tick';
export { tick } from './tick';
export type {
  AimMode,
  Ball,
  BallBody,
  BaseStats,
  Card,
  Command,
  Effect,
  EffectKind,
  Enemy,
  GameEvent,
  GameType,
  Member,
  MoveShapeKind,
  PickAction,
  Pickup,
  ReplaceAction,
  SpeciesDef,
} from './types';
export { GAME_TYPES, typesOfSpecies } from './types';
export {
  advanceBoss,
  advanceWave,
  isBossAlive,
  laneX,
  onBossDefeated,
} from './waves';
