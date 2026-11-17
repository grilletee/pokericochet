import type { GameType } from '../domain';
import { TYPE_COLORS } from './typeColors';

/**
 * The words and colours of the gacha screen (4G-J, block 1). Pure: tested without a page. The
 * numbers come from the meta (rules, pity, rate table); this only says them.
 */

export type StarCount = 3 | 4 | 5;

/** The colour of each rarity: blue ★3, violet ★4, gold ★5 (the reveal and the cards wear it). */
export const RARITY_COLORS: Readonly<Record<StarCount, string>> = {
  3: '#5fb0ff',
  4: '#c07bff',
  5: '#ffd75a',
};

export function stars(n: StarCount): string {
  return '★'.repeat(n);
}

/** Basis points as a Spanish percentage: 80 -> "0,8 %", 5000 -> "50 %". */
export function percentBp(bp: number): string {
  return percent(bp / 10_000);
}

/** A fraction as a Spanish percentage with at most one decimal (two below 1 %). */
export function percent(fraction: number): string {
  const value = fraction * 100;
  const digits = value < 1 && value > 0 ? 2 : value < 10 ? 1 : 0;
  const fixed = value.toFixed(digits);
  const text = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return `${text.replace('.', ',')} %`;
}

/** The two colours of a region banner (by generation), for its art. */
const REGION_COLORS: Readonly<Record<number, readonly [string, string]>> = {
  1: ['#e04a4a', '#3f66d0'],
  2: ['#d8b040', '#9aa6c0'],
  3: ['#3fae5a', '#e04a4a'],
  4: ['#5fb0ff', '#c07bff'],
  5: ['#4a4a5a', '#f6f3e8'],
  6: ['#3f66d0', '#e04a4a'],
  7: ['#ff9a4a', '#8a5acb'],
  8: ['#c04a8a', '#5fb0ff'],
  9: ['#e04a4a', '#8a5acb'],
};

/** The colours of a banner's art: its type, its region, or gold for the standard one. */
export function bannerColors(
  kind: 'standard' | 'region' | 'type',
  gen: number | undefined,
  type: GameType | undefined,
): readonly [string, string] {
  if (kind === 'type' && type !== undefined) return [TYPE_COLORS[type], '#14172b'];
  if (kind === 'region' && gen !== undefined) return REGION_COLORS[gen] ?? ['#3f66d0', '#14172b'];
  return ['#ffd75a', '#3f66d0'];
}

export interface PityNumbers {
  readonly toFive: number;
  readonly toFour: number;
  readonly soft: boolean;
  readonly nextFiveChance: number;
  readonly toFeatured: number | null;
  readonly sinceFive: number;
  /** The 50/50 was lost on this banner: its next ★5 is the featured one (4V). */
  readonly featuredOwed?: boolean;
}

export interface PityRules {
  readonly softFrom: number;
  readonly hardAt: number;
  readonly fourEvery: number;
  readonly featuredAt: number;
  readonly featuredShare: number;
  readonly rate5: number;
  readonly lostHalfPaysBack?: boolean;
}

const draws = (n: number): string => `${n} ${n === 1 ? 'tirada' : 'tiradas'}`;

/** The counters under the banner, one line each. */
export function pityLines(pity: PityNumbers, limited: boolean): string[] {
  const lines = [
    `★5 seguro en ${draws(pity.toFive)}` +
      (pity.soft ? ` · ¡pity suave! ${percentBp(pity.nextFiveChance)} ahora` : ''),
    `★4 o más seguro en ${draws(pity.toFour)}`,
  ];
  if (limited) {
    lines.push(
      pity.featuredOwed === true
        ? 'Perdiste el 50/50: tu próximo ★5 aquí es el destacado'
        : pity.toFeatured === null
          ? 'Destacado ★5 de este banner: ya conseguido'
          : `Destacado ★5 seguro en ${draws(pity.toFeatured)} en este banner`,
    );
  }
  return lines;
}

/** How the gacha works, for the help panel: the same numbers the draw uses. */
export function rulesText(rules: PityRules, limited: boolean): string[] {
  const lines = [
    `Cada tirada da un Pokémon: ★3 común, ★4 (evoluciones finales fuertes) o ★5 (iniciales y pseudolegendarios). Los legendarios no salen aquí: solo se ven como jefes.`,
    `★5: ${percentBp(rules.rate5)} por tirada. Desde la tirada ${rules.softFrom} sin ★5 la probabilidad sube un 5 % en cada una, y la ${rules.hardAt} es un ★5 seguro.`,
    `Cada ${rules.fourEvery} tiradas, como muy tarde, sale un ★4 o mejor.`,
    `El contador de pity es tuyo: se conserva al cambiar de banner y entre semanas.`,
  ];
  if (limited) {
    lines.push(
      `En un banner limitado, cada ★5 tiene un ${percentBp(rules.featuredShare)} de ser el destacado; si en ${rules.featuredAt} tiradas en ese banner no ha salido, esa tirada te lo da.`,
    );
    if (rules.lostHalfPaysBack === true) {
      lines.push(
        'Si pierdes el 50/50 (te sale otro ★5), el siguiente ★5 en ese banner es seguro el destacado.',
      );
    }
  }
  lines.push(
    'Si te sale uno que ya tienes, ganas caramelos de ese Pokémon (más cuanto más raro). Los caramelos suben su nivel permanente en la Colección.',
    'Las monedas solo se ganan jugando: oleadas, jefes y victorias. Sin dinero real.',
  );
  return lines;
}

/** The days a limited banner has left. */
export function endsText(days: number | null): string {
  if (days === null) return 'Siempre disponible';
  return days <= 1 ? 'Termina hoy' : `Termina en ${days} días`;
}

/** The line under a revealed Pokémon. */
export function revealNote(isNew: boolean, candies: number): string {
  return isNew ? '¡NUEVO!' : `+${candies} caramelos`;
}

/** One counter of the pity panel (4V, block 3): what it promises, how far, how full its bar is. */
export interface PityMeter {
  readonly id: 'five' | 'four' | 'featured';
  readonly label: string;
  /** The big number: draws left ("12"), or a word when there is none ("¡Ya!", "Seguro"). */
  readonly value: string;
  /** Share of the bar that is full, 0..1, and in how many segments it is drawn. */
  readonly fill: number;
  readonly segments: number;
  readonly color: string;
  /** Something special is on: the soft pity, or a lost 50/50 that is paid next. */
  readonly hot: boolean;
  readonly note: string;
}

/** The counters of the pity panel, from the same numbers as the lines (`pityLines`). */
export function pityMeters(pity: PityNumbers, rules: PityRules, limited: boolean): PityMeter[] {
  const clamp = (v: number): number => Math.max(0, Math.min(1, v));
  const meters: PityMeter[] = [
    {
      id: 'five',
      label: '★5 seguro en',
      value: String(pity.toFive),
      fill: clamp(1 - pity.toFive / rules.hardAt),
      segments: 16,
      color: RARITY_COLORS[5],
      hot: pity.soft,
      note: pity.soft ? `¡Pity suave! ${percentBp(pity.nextFiveChance)} ahora` : 'tiradas',
    },
    {
      id: 'four',
      label: '★4 o más en',
      value: String(pity.toFour),
      fill: clamp(1 - pity.toFour / rules.fourEvery),
      segments: rules.fourEvery,
      color: RARITY_COLORS[4],
      hot: pity.toFour === 1,
      note: 'tiradas',
    },
  ];
  if (limited) {
    const owed = pity.featuredOwed === true;
    const got = pity.toFeatured === null && !owed;
    meters.push({
      id: 'featured',
      label: 'Destacado ★5',
      value: owed ? 'Seguro' : got ? '¡Ya!' : String(pity.toFeatured ?? 0),
      fill: owed || got ? 1 : clamp(1 - (pity.toFeatured ?? 0) / rules.featuredAt),
      segments: 12,
      color: '#ff7fb0',
      hot: owed,
      note: owed ? 'tu próximo ★5 aquí' : got ? 'ya conseguido' : `tiradas en este banner`,
    });
  }
  return meters;
}

/** When the reveal turns each card, in milliseconds after the cards are dealt. */
export interface RevealTiming {
  /** The moment each card turns face up, in the order of the cards. */
  readonly flips: readonly number[];
  /** Each ★4 or better glows through its back this long before it turns (the hint). */
  readonly hintMs: number;
  /** When the last card is up and the button to go on shows. */
  readonly doneMs: number;
}

/**
 * The rhythm of a reveal (4V, block 3; the suspense of the gacha games): the cards are dealt face
 * down and turn one after another, the commonest first and the rarest last (in the order they were
 * drawn within a rarity); a ★4 or ★5 glows through its back before it turns, and every ★5 waits a
 * beat longer, so the best comes as a moment of its own.
 */
export function revealTiming(stars: readonly StarCount[]): RevealTiming {
  const STEP = 140;
  const FIVE_BEAT = 420;
  const first = 380;
  const order = stars.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s || a.i - b.i);
  const flips: number[] = new Array(stars.length).fill(first);
  let at = first;
  let last = first;
  for (const { s, i } of order) {
    if (s === 5) at += FIVE_BEAT;
    flips[i] = at;
    last = at;
    at += STEP;
  }
  return { flips, hintMs: 300, doneMs: last + 260 };
}
