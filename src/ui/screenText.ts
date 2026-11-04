import type { GameEvent, GameType, RunSummary } from '../domain';
import { speciesName, typeName } from './cardText';

const TYPE_BLURB: Record<GameType, string> = {
  fire: 'Quema al impactar',
  water: 'Atraviesa enemigos',
  grass: 'Drena vida al golpear',
  electric: 'Encadena a otro enemigo',
};

export function starterBlurb(type: GameType): string {
  return `${typeName(type)} · ${TYPE_BLURB[type]}`;
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
  return `Mejor partida: ${outcome}, ${best.kills} bajas · ${speciesName(best.starter)} · semilla ${best.seed}`;
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
  const team = summary.team.map((m) => `${speciesName(m.species)} Nv${m.level}`).join(', ');
  const progress = won
    ? 'Derrotaste al jefe.'
    : summary.bossReached
      ? 'Llegaste al jefe, pero no lo derrotaste.'
      : `Oleadas superadas: ${summary.wavesCleared}/${summary.wavesTotal}.`;
  return {
    title: won ? '¡Victoria!' : 'Derrota',
    lines: [
      progress,
      `Bajas: ${summary.kills} · Nivel ${summary.level} · Tiempo ${formatTime(summary.ticks)}`,
      `Equipo: ${team}`,
      `Inicial: ${speciesName(summary.starter)} · Semilla: ${summary.seed}`,
      isNewBest ? '¡Nueva mejor partida!' : describeBest(best),
    ],
  };
}

/** Name of the form a ball of `species` shows at `level`; the plain species name by default. */
export type FormNamer = (species: string, level: number) => string;

/** A short on-screen message for an event, or null if the event needs none. */
export function describeEvent(
  event: GameEvent,
  formName: FormNamer = (species) => speciesName(species),
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
      return `¡Jefe derrotado: ${speciesName(event.species)}!`;
    case 'bossSpawn':
      return '¡Aparece el jefe!';
    case 'bossSummon':
      return `El jefe invoca ${event.count} refuerzos`;
    case 'evolve':
      return `¡${formName(event.species, event.level - 1)} evoluciona a ${formName(event.species, event.level)}!`;
    case 'hybrid':
      return `¡Híbrida! ${speciesName(event.species)} + ${speciesName(event.withSpecies)}`;
    case 'captureDrop':
      return `¡${formName(event.species, event.level)} soltó una bola! Recógela`;
    case 'capture':
      return `¡Capturado: ${formName(event.species, event.level)}!`;
    case 'train':
      return `¡${speciesName(event.species)} sube a Nv${event.level}!`;
    case 'replaced':
      return `${speciesName(event.species)} reemplaza a ${speciesName(event.out)}`;
    case 'release':
      return `Soltaste a ${speciesName(event.species)}`;
    default:
      return null;
  }
}
