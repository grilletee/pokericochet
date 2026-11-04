import type { GameConfig } from '../domain';

/**
 * Live tuning (?tune): a handful of knobs that change how the game feels, each a plain number.
 * `tuneToPatch` turns them into a partial config; `mergeConfig` lays it over the shipped one. The
 * same patch is what the panel copies, and what `FUN_PATCH` of `pnpm bench:fun` reads, so a feel
 * found by playing can be measured with the bots without retyping anything.
 */
export interface TuneDef {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Reads the shipped value of an absolute knob; multipliers have none and start at 1. */
  readonly read?: (config: GameConfig) => number;
  readonly hint: string;
}

/** The seven waves of the curve (ADR-029): each gets its own density, health and speed knob. */
const WAVE_COUNT = 7;

/** Per-wave multipliers on top of the global ones: the explicit difficulty curve, live. */
function waveKnobs(): TuneDef[] {
  const out: TuneDef[] = [];
  for (let wave = 1; wave <= WAVE_COUNT; wave++) {
    out.push(
      {
        key: `w${wave}Spawn`,
        label: `Oleada ${wave}: densidad`,
        min: 0.3,
        max: 3,
        step: 0.05,
        hint: '×',
      },
      { key: `w${wave}Hp`, label: `Oleada ${wave}: vida`, min: 0.3, max: 3, step: 0.05, hint: '×' },
      {
        key: `w${wave}Speed`,
        label: `Oleada ${wave}: velocidad`,
        min: 0.3,
        max: 3,
        step: 0.05,
        hint: '×',
      },
    );
  }
  return out;
}

export const TUNE_DEFS: readonly TuneDef[] = [
  {
    key: 'spawnRate',
    label: 'Densidad de enemigos',
    min: 0.4,
    max: 2.5,
    step: 0.05,
    hint: '× apariciones por segundo',
  },
  { key: 'enemySpeed', label: 'Velocidad de enemigos', min: 0.4, max: 2.5, step: 0.05, hint: '×' },
  { key: 'enemyHp', label: 'Vida de enemigos', min: 0.3, max: 3, step: 0.05, hint: '×' },
  {
    key: 'playerSpeed',
    label: 'Velocidad del lanzador',
    min: 2,
    max: 10,
    step: 0.5,
    read: (c) => c.player.speed,
    hint: 'px por tick',
  },
  { key: 'ballSpeed', label: 'Velocidad de las bolas', min: 0.6, max: 1.6, step: 0.05, hint: '×' },
  { key: 'damage', label: 'Daño de las bolas', min: 0.3, max: 3, step: 0.05, hint: '×' },
  {
    key: 'reload',
    label: 'Recarga tras recoger',
    min: 10,
    max: 160,
    step: 2,
    read: (c) => c.ball.cooldownTicks,
    hint: 'ticks (60 = 1 s)',
  },
  {
    key: 'manualJitter',
    label: 'Dispersión manual',
    min: 0,
    max: 0.2,
    step: 0.005,
    read: (c) => c.ball.manualAimJitter,
    hint: 'tan del ángulo',
  },
  {
    key: 'autoJitter',
    label: 'Dispersión auto-apuntado',
    min: 0,
    max: 0.4,
    step: 0.01,
    read: (c) => c.ball.aimJitter,
    hint: 'tan del ángulo',
  },
  {
    key: 'autoReload',
    label: 'Auto-apuntado: recarga',
    min: 1,
    max: 3,
    step: 0.05,
    read: (c) => c.ball.autoCooldownMult,
    hint: '× más lento',
  },
  {
    key: 'pickupRadius',
    label: 'Radio de recogida',
    min: 16,
    max: 100,
    step: 2,
    read: (c) => c.pickup.radius,
    hint: 'px',
  },
  {
    key: 'returnTicks',
    label: 'Vuelta sola de una bola',
    min: 60,
    max: 900,
    step: 10,
    read: (c) => c.pickup.returnTicks,
    hint: 'ticks en el suelo',
  },
  {
    key: 'captureChance',
    label: 'Probabilidad de captura',
    min: 0,
    max: 0.6,
    step: 0.01,
    read: (c) => c.capture.chance,
    hint: 'por enemigo derrotado',
  },
  {
    key: 'capturePity',
    label: 'Protección de mala suerte',
    min: 0,
    max: 0.1,
    step: 0.005,
    read: (c) => c.capture.pityStep,
    hint: 'suma por baja sin captura',
  },
  {
    key: 'captureFall',
    label: 'Caída de la bola capturada',
    min: 0.5,
    max: 8,
    step: 0.25,
    read: (c) => c.pickup.dropSpeed,
    hint: 'px por tick',
  },
  { key: 'levelCost', label: 'XP por nivel', min: 0.4, max: 2.5, step: 0.05, hint: '×' },
  {
    key: 'fullTeamCapture',
    label: 'Captura con equipo lleno',
    min: 0,
    max: 1,
    step: 0.05,
    read: (c) => c.capture.fullTeamChanceMult,
    hint: '× de la probabilidad',
  },
  {
    key: 'ballsMid',
    label: 'Bolas por Pokémon (Nv 3-5)',
    min: 1,
    max: 4,
    step: 1,
    read: (c) => c.team.ballsByLevel[2] ?? 2,
    hint: 'bolas',
  },
  {
    key: 'ballsMax',
    label: 'Bolas por Pokémon (Nv 6-8)',
    min: 1,
    max: 5,
    step: 1,
    read: (c) => c.team.ballsByLevel[5] ?? 3,
    hint: 'bolas',
  },
  {
    key: 'stage2',
    label: 'Nivel de la 2.ª fase',
    min: 2,
    max: 8,
    step: 1,
    read: (c) => c.team.stageLevels[0] ?? 3,
    hint: 'nivel',
  },
  {
    key: 'stage3',
    label: 'Nivel de la 3.ª fase',
    min: 3,
    max: 8,
    step: 1,
    read: (c) => c.team.stageLevels[1] ?? 6,
    hint: 'nivel',
  },
  {
    key: 'powerStep',
    label: 'Carta de potencia',
    min: 0.05,
    max: 0.6,
    step: 0.01,
    read: (c) => c.cards.powerStep,
    hint: '+ daño del Pokémon',
  },
  {
    key: 'cadenceFactor',
    label: 'Carta de cadencia',
    min: 0.7,
    max: 0.98,
    step: 0.01,
    read: (c) => c.cards.cadenceFactor,
    hint: '× recarga del Pokémon',
  },
  {
    key: 'teamStep',
    label: 'Carta de equipo',
    min: 0,
    max: 0.3,
    step: 0.01,
    read: (c) => c.cards.damageStep,
    hint: '+ daño de todos',
  },
  {
    key: 'wTrain',
    label: 'Peso: entrenar',
    min: 0,
    max: 12,
    step: 0.5,
    read: (c) => c.cards.weights.train,
    hint: 'peso',
  },
  {
    key: 'wPower',
    label: 'Peso: potencia',
    min: 0,
    max: 12,
    step: 0.5,
    read: (c) => c.cards.weights.power,
    hint: 'peso',
  },
  {
    key: 'wCadence',
    label: 'Peso: cadencia',
    min: 0,
    max: 12,
    step: 0.5,
    read: (c) => c.cards.weights.cadence,
    hint: 'peso',
  },
  {
    key: 'wRecruit',
    label: 'Peso: fichar',
    min: 0,
    max: 12,
    step: 0.5,
    read: (c) => c.cards.weights.newBall,
    hint: 'peso',
  },
  {
    key: 'wVitality',
    label: 'Peso: vitalidad',
    min: 0,
    max: 12,
    step: 0.5,
    read: (c) => c.cards.weights.vitality,
    hint: 'peso',
  },
  {
    key: 'drainPerHp',
    label: 'Absorción: coste de 1 PV',
    min: 5,
    max: 90,
    step: 1,
    read: (c) => c.effects.drainPerHp,
    hint: 'fuerza por PV',
  },
  {
    key: 'threatPerTier',
    label: 'Daño de fuga por fase',
    min: 0,
    max: 3,
    step: 0.25,
    read: (c) => c.enemy.threatPerTier,
    hint: 'PV extra por fase',
  },
  {
    key: 'powerMultMax',
    label: 'Estadísticas: techo del daño',
    min: 1,
    max: 3,
    step: 0.05,
    read: (c) => c.stats.powerMultMax,
    hint: '× de daño del Pokémon más fuerte',
  },
  {
    key: 'guardMax',
    label: 'Guardia máxima del equipo',
    min: 0,
    max: 0.6,
    step: 0.01,
    read: (c) => c.stats.guardMax,
    hint: 'fracción que no pasa de una fuga',
  },
  {
    key: 'stageGrowth2',
    label: 'Crecimiento mínimo, fase 2',
    min: 1,
    max: 2,
    step: 0.01,
    read: (c) => c.team.stageGrowth[1] ?? 1.2,
    hint: '× de daño sobre la fase 1',
  },
  {
    key: 'stageGrowth3',
    label: 'Crecimiento mínimo, fase 3',
    min: 1,
    max: 2.5,
    step: 0.01,
    read: (c) => c.team.stageGrowth[2] ?? 1.45,
    hint: '× de daño sobre la fase 1',
  },
  {
    key: 'speedCap',
    label: 'Tope de velocidad de la bola',
    min: 4,
    max: 12,
    step: 0.1,
    read: (c) => c.ball.speedCap,
    hint: 'px por tick (de cualquier forma)',
  },
  {
    key: 'chargeStage1',
    label: 'Movimiento: golpes (fase 1)',
    min: 2,
    max: 30,
    step: 1,
    read: (c) => c.moves.chargeByStage[0] ?? 10,
    hint: 'golpes para lanzarlo',
  },
  {
    key: 'chargeStage2',
    label: 'Movimiento: golpes (fase 2)',
    min: 2,
    max: 30,
    step: 1,
    read: (c) => c.moves.chargeByStage[1] ?? 8,
    hint: 'golpes para lanzarlo',
  },
  {
    key: 'chargeStage3',
    label: 'Movimiento: golpes (fase 3)',
    min: 2,
    max: 30,
    step: 1,
    read: (c) => c.moves.chargeByStage[2] ?? 6,
    hint: 'golpes para lanzarlo',
  },
  { key: 'moveTier1', label: 'Movimiento: fuerza (fase 1)', min: 0, max: 4, step: 0.05, hint: '×' },
  { key: 'moveTier2', label: 'Movimiento: fuerza (fase 2)', min: 0, max: 4, step: 0.05, hint: '×' },
  { key: 'moveTier3', label: 'Movimiento: fuerza (fase 3)', min: 0, max: 4, step: 0.05, hint: '×' },
  {
    key: 'bossHp',
    label: 'Vida de los jefes',
    min: 0.3,
    max: 3,
    step: 0.05,
    hint: '× todos los jefes',
  },
  ...waveKnobs(),
];

export type TuneValues = Record<string, number>;

/** Value of a knob that leaves the shipped config untouched. */
export function neutral(def: TuneDef, base: GameConfig): number {
  return def.read ? def.read(base) : 1;
}

export function defaultTune(base: GameConfig): TuneValues {
  return Object.fromEntries(TUNE_DEFS.map((d) => [d.key, neutral(d, base)]));
}

/** Values clamped to the range of each knob; unknown keys are dropped, missing ones are neutral. */
export function sanitizeTune(base: GameConfig, raw: unknown): TuneValues {
  const out = defaultTune(base);
  if (typeof raw !== 'object' || raw === null) return out;
  const source = raw as Record<string, unknown>;
  for (const def of TUNE_DEFS) {
    const value = source[def.key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[def.key] = Math.min(def.max, Math.max(def.min, value));
    }
  }
  return out;
}

/** The knobs that differ from neutral, as a partial GameConfig (what gets copied and measured). */
export function tuneToPatch(base: GameConfig, values: TuneValues): Record<string, unknown> {
  const v = { ...defaultTune(base), ...values };
  const get = (key: string): number => v[key] ?? 0;
  const patch: Record<string, unknown> = {
    waves: base.waves.map((w, i) => ({
      spawnIntervalTicks: Math.max(
        1,
        Math.round(w.spawnIntervalTicks / (get('spawnRate') * get(`w${i + 1}Spawn`))),
      ),
      hpScale: w.hpScale * get(`w${i + 1}Hp`),
      speedScale: w.speedScale * get(`w${i + 1}Speed`),
    })),
    ...(base.boss === undefined ? {} : { boss: { hpScale: base.boss.hpScale * get('bossHp') } }),
    interludes: (base.interludes ?? []).map((b) => ({ hpScale: b.hpScale * get('bossHp') })),
    enemy: {
      threatPerTier: get('threatPerTier'),
      speedMin: base.enemy.speedMin * get('enemySpeed'),
      speedMax: base.enemy.speedMax * get('enemySpeed'),
      hpScale: base.enemy.hpScale * get('enemyHp'),
    },
    player: { speed: get('playerSpeed') },
    ball: {
      speedMin: base.ball.speedMin * get('ballSpeed'),
      speedMax: base.ball.speedMax * get('ballSpeed'),
      speedCap: get('speedCap') * get('ballSpeed'),
      cooldownTicks: Math.round(get('reload')),
      manualAimJitter: get('manualJitter'),
      aimJitter: get('autoJitter'),
      autoCooldownMult: get('autoReload'),
    },
    stats: {
      damageDivisor: base.stats.damageDivisor / get('damage'),
      powerMultMax: get('powerMultMax'),
      guardMax: get('guardMax'),
    },
    moves: {
      chargeByStage: [
        Math.round(get('chargeStage1')),
        Math.round(get('chargeStage2')),
        Math.round(get('chargeStage3')),
      ],
      tiers: base.moves.tiers.map((tier, i) => ({
        power: tier.power * get(`moveTier${i + 1}`),
      })),
    },
    pickup: {
      radius: get('pickupRadius'),
      returnTicks: Math.round(get('returnTicks')),
      dropSpeed: get('captureFall'),
    },
    capture: {
      chance: get('captureChance'),
      pityStep: get('capturePity'),
      fullTeamChanceMult: get('fullTeamCapture'),
    },
    team: {
      ballsByLevel: base.team.ballsByLevel.map((n, i) =>
        i >= 5 ? get('ballsMax') : i >= 2 ? get('ballsMid') : n,
      ),
      stageLevels: [get('stage2'), get('stage3')],
      stageGrowth: [1, get('stageGrowth2'), get('stageGrowth3')],
    },
    cards: {
      powerStep: get('powerStep'),
      cadenceFactor: get('cadenceFactor'),
      damageStep: get('teamStep'),
      weights: {
        train: get('wTrain'),
        power: get('wPower'),
        cadence: get('wCadence'),
        newBall: get('wRecruit'),
        vitality: get('wVitality'),
      },
    },
    effects: { drainPerHp: get('drainPerHp') },
    progression: {
      levelCosts: base.progression.levelCosts.map((c) =>
        Math.max(1, Math.round(c * get('levelCost'))),
      ),
    },
  };
  return patch;
}

/** Lays a partial config over a base one (objects merge, arrays merge by index, numbers replace). */
export function mergeConfig<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (typeof base !== 'object' || base === null || typeof patch !== 'object' || patch === null) {
    return patch as T;
  }
  if (Array.isArray(base)) {
    const patchList = patch as unknown[];
    return base.map((item, i) => mergeConfig(item, patchList[i])) as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    out[key] = mergeConfig(out[key], value);
  }
  return out as T;
}

export function applyTune(base: GameConfig, values: TuneValues): GameConfig {
  return mergeConfig(base, tuneToPatch(base, values));
}

/** Only the knobs that moved, to keep the copied text short. */
export function changedKnobs(base: GameConfig, values: TuneValues): TuneValues {
  const out: TuneValues = {};
  for (const def of TUNE_DEFS) {
    const value = values[def.key];
    if (value !== undefined && value !== neutral(def, base)) out[def.key] = value;
  }
  return out;
}

export const TUNE_KEY = 'tune.v1';
