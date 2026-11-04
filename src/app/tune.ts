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
    waves: base.waves.map((w) => ({
      spawnIntervalTicks: Math.max(1, Math.round(w.spawnIntervalTicks / get('spawnRate'))),
    })),
    enemy: {
      speedMin: base.enemy.speedMin * get('enemySpeed'),
      speedMax: base.enemy.speedMax * get('enemySpeed'),
      hpScale: base.enemy.hpScale * get('enemyHp'),
    },
    player: { speed: get('playerSpeed') },
    ball: {
      speedMin: base.ball.speedMin * get('ballSpeed'),
      speedMax: base.ball.speedMax * get('ballSpeed'),
      cooldownTicks: Math.round(get('reload')),
      manualAimJitter: get('manualJitter'),
      aimJitter: get('autoJitter'),
      autoCooldownMult: get('autoReload'),
    },
    stats: { damageDivisor: base.stats.damageDivisor / get('damage') },
    pickup: {
      radius: get('pickupRadius'),
      returnTicks: Math.round(get('returnTicks')),
      dropSpeed: get('captureFall'),
    },
    capture: { chance: get('captureChance'), pityStep: get('capturePity') },
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
