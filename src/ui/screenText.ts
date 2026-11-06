import type {
  BossAdvice,
  GameEvent,
  GameType,
  MoveShapeKind,
  RunSummary,
  WaveAdvice,
} from '../domain';
import { typeName } from './cardText';
import { pokemonName } from './names';

const TYPE_BLURB: Record<GameType, string> = {
  normal: 'Golpe fiable y fuerte',
  fighting: 'Empuja y revienta a los de al lado',
  flying: 'Atraviesa enemigos',
  poison: 'Envenena: el daño se acumula',
  ground: 'Una onda sube por la columna',
  rock: 'Explota al derrotar',
  bug: 'Salta entre varios enemigos',
  ghost: 'Maldice: el daño llega después',
  steel: 'Atraviesa y golpea fuerte',
  fire: 'Quema al impactar',
  water: 'Atraviesa enemigos',
  grass: 'Drena vida al golpear',
  electric: 'Encadena a otro enemigo',
  psychic: 'Aturde un instante',
  ice: 'Frena y congela',
  dragon: 'Daño muy alto, pero raro',
  dark: 'Marca: recibe más daño',
  fairy: 'Cura y da guardia al equipo',
};

export function starterBlurb(type: GameType): string {
  return `${typeName(type)} · ${TYPE_BLURB[type]}`;
}

const SHAPE_WORD: Record<MoveShapeKind, string> = {
  burst: 'estallido',
  beam: 'columna',
  nova: 'nova',
  cross: 'cruz',
  wave: 'ola',
  chain: 'cadena',
};

/**
 * The starter's signature on the title screen (4F-D): the real move, the shape it draws and when
 * it is yours ("Ultimate: Lanzallamas, cruz · desde Charmeleon · la lanzas tú").
 */
export function signatureLine(moveLabel: string, shape: MoveShapeKind, fromForm: string): string {
  return `Ultimate: ${moveLabel}, ${SHAPE_WORD[shape]} · desde ${fromForm} · la lanzas tú`;
}

/** 4271 ticks at 60 Hz -> "1:11". */
export function formatTime(ticks: number): string {
  const total = Math.floor(ticks / 60);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** The record a run is compared to; a subset of RunSummary that is cheap to store. */
export interface BestRunView {
  readonly result: 'won' | 'lost' | 'ongoing';
  readonly wavesCleared: number;
  readonly wavesTotal: number;
  readonly kills: number;
  readonly ticks: number;
  readonly seed: number;
  readonly starter: string;
}

export function describeBest(best: BestRunView | null): string {
  if (best === null) return 'Aún no hay ninguna partida guardada.';
  const outcome =
    best.result === 'won'
      ? `Victoria en ${formatTime(best.ticks)}`
      : `${best.wavesCleared}/${best.wavesTotal} oleadas`;
  return `Mejor partida: ${outcome}, ${best.kills} bajas · ${pokemonName(best.starter)} · semilla ${best.seed}`;
}

export interface ResultsText {
  readonly title: string;
  readonly lines: readonly string[];
}

/** Text of the end-of-run screen. `isNewBest` adds the record line. */
export function describeResults(
  summary: RunSummary,
  best: BestRunView | null,
  isNewBest: boolean,
): ResultsText {
  const won = summary.result === 'won';
  const team = summary.team.map((m) => `${pokemonName(m.form)} Nv${m.level}`).join(', ');
  // "Llegaste a la oleada 7/7" counts the wave you were in, the one the HUD showed (4F-E); the
  // bosses are counted apart: "Derrotaste a 3 de 4 jefes".
  const progress = won
    ? '¡Derrotaste al jefe final!'
    : `Llegaste a la oleada ${summary.waveReached}/${summary.wavesTotal}.`;
  return {
    title: won ? '¡Victoria!' : 'Derrota',
    lines: [
      progress,
      `Derrotaste a ${summary.bossesDefeated} de ${summary.bossesTotal} jefes.`,
      `Bajas: ${summary.kills} · Nivel ${summary.level} · Tiempo ${formatTime(summary.ticks)}`,
      `Equipo: ${team}`,
      `Inicial: ${pokemonName(summary.starter)} · Semilla: ${summary.seed}`,
      isNewBest ? '¡Nueva mejor partida!' : describeBest(best),
    ],
  };
}

/** "Jefe 2/3" for the bosses between waves and "Jefe final" for the last one (4F-E). */
export function bossLabel(number: number, interludes: number, final: boolean): string {
  return final ? 'Jefe final' : `Jefe ${number}/${interludes}`;
}

/** Ticks to "1:12": rounded up, so the last second shows 0:01 and never 0:00 while time is left. */
export function countdown(ticks: number): string {
  const total = Math.ceil(Math.max(0, ticks) / 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The strip warns that a boss is near (pulses) from this many ticks before it appears (ADR-050). */
export const BOSS_WARNING_TICKS = 300;

/** "Oleada 3/7" (the wave in progress, as the HUD counts it). */
export function waveLabel(index: number, total: number): string {
  return `Oleada ${index + 1}/${total}`;
}

/** The boss line of the strip: "Jefe 1/3 en 1:12", or "Jefe 1/3: ya viene" when it is about to appear. */
export function bossCountdown(boss: BossAdvice): string {
  const label = bossLabel(boss.number, boss.interludes, boss.final);
  return boss.ticks <= 0 ? `${label}: ya viene` : `${label} en ${countdown(boss.ticks)}`;
}

/** What the wave cartel (a 2 s sign at the start of a wave) says (ADR-050). */
export interface CartelText {
  readonly title: string;
  /** The types the wave brings, shown as icons. */
  readonly types: readonly GameType[];
  /** "Eficaz:" with its icons, or the sentence that says no type has an edge. */
  readonly effectiveLabel: string;
  readonly effective: readonly GameType[];
  /** "Al acabar: Jefe 1/3" when a boss comes as this wave ends, else null. */
  readonly boss: string | null;
}

export function waveCartel(advice: WaveAdvice, themeName: string): CartelText {
  const name = themeName === '' ? '' : ` · ${themeName}`;
  const effective = advice.effective.slice(0, 3);
  const bossNext = advice.boss !== null && advice.boss.ticks <= advice.ticksLeft;
  return {
    title: `OLEADA ${advice.index + 1}/${advice.total}${name}`,
    types: advice.types,
    effectiveLabel: effective.length > 0 ? 'Eficaz:' : 'Ningún tipo tiene ventaja',
    effective,
    boss:
      bossNext && advice.boss !== null
        ? `Al acabar: ${bossLabel(advice.boss.number, advice.boss.interludes, advice.boss.final)}`
        : null,
  };
}

/** The cartel of a boss that has just appeared: its name, its type and what beats it. */
export function bossCartel(
  label: string,
  species: string,
  types: readonly GameType[],
  effective: readonly GameType[],
): CartelText {
  const shown = effective.slice(0, 3);
  return {
    title: `${label.toUpperCase()} · ${pokemonName(species)}`,
    types,
    effectiveLabel: shown.length > 0 ? 'Eficaz:' : 'Ningún tipo tiene ventaja',
    effective: shown,
    boss: null,
  };
}

/** The announcement of a step: an evolution, an awakening or the maximum power (ADR-037). */
export function stageText(kind: 'evolve' | 'awaken' | 'peak', from: string, to: string): string {
  switch (kind) {
    case 'evolve':
      return `¡${pokemonName(from)} evoluciona a ${pokemonName(to)}!`;
    case 'awaken':
      return `¡${pokemonName(to)} despierta su poder!`;
    case 'peak':
      return `¡${pokemonName(to)} alcanza su máximo poder!`;
  }
}

/**
 * A short on-screen message for an event, or null if the event needs none. Every Pokémon is named
 * by the form the event carries (ADR-036), never by the base species.
 */
export function describeEvent(
  event: GameEvent,
  themeLabel: (themeId: string) => string | null = () => null,
): string | null {
  switch (event.type) {
    case 'waveStart': {
      const theme = event.theme === '' ? null : themeLabel(event.theme);
      return theme === null || theme === undefined
        ? `Oleada ${event.index + 1}`
        : `Oleada ${event.index + 1}: ${theme}`;
    }
    case 'bossDefeated':
      return `¡Jefe derrotado: ${pokemonName(event.species)}!`;
    case 'bossSpawn':
      return `¡${bossLabel(event.number, event.interludes, event.final)}: ${pokemonName(event.species)}!`;
    case 'bossSummon':
      return `El jefe invoca ${event.count} refuerzos`;
    case 'stage':
      return stageText(event.kind, event.from, event.to);
    case 'hybrid':
      return `¡Híbrida! ${pokemonName(event.species)} + ${pokemonName(event.withSpecies)}`;
    case 'captureDrop':
      return `¡${pokemonName(event.form)} soltó una bola! Recógela`;
    case 'capture':
      return `¡Capturado: ${pokemonName(event.form)}!`;
    case 'train':
      return `¡${pokemonName(event.form)} sube a Nv${event.level}!`;
    case 'replaced':
      return `${pokemonName(event.form)} reemplaza a ${pokemonName(event.outForm)}`;
    case 'release':
      return `Soltaste a ${pokemonName(event.form)}`;
    default:
      return null;
  }
}
