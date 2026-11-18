import type { GameType } from '../domain';
import { TYPE_COLORS } from './typeColors';

/**
 * The words and colours of the gacha screen (4G-J, block 1). Pure: tested without a page. The
 * numbers come from the meta (rules, pity, rate table); this only says them.
 */

/** 4X: ★6 is a legendary of the key banner. */
export type StarCount = 3 | 4 | 5 | 6;

/**
 * The colour of each rarity: blue ★3, violet ★4, gold ★5 and, 4X, a prismatic magenta for the ★6 of
 * the legendaries (the reveal and the cards wear it).
 */
export const RARITY_COLORS: Readonly<Record<StarCount, string>> = {
  3: '#5fb0ff',
  4: '#c07bff',
  5: '#ffd75a',
  6: '#ff5fd2',
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

/** 4X: the kinds of banner the screen shows. */
export type BannerViewKind = 'standard' | 'pseudo' | 'starter' | 'showcase' | 'legend';

/** 4X: what each banner is, in a few words (its kicker). */
export function bannerKindLabel(kind: BannerViewKind): string {
  switch (kind) {
    case 'pseudo':
      return 'Pseudolegendario de la semana';
    case 'starter':
      return 'Inicial de la semana';
    case 'showcase':
      return 'Pokémon con estilo de la semana';
    case 'legend':
      return 'Legendario de la semana · ★6';
    default:
      return 'Banner permanente';
  }
}

/**
 * The colours of a banner's art (4X): the type of its featured Pokémon for a weekly banner, pink for
 * the "Pokémon con estilo", magenta on black for the legendary one, gold for the standard one.
 */
export function bannerColors(
  kind: BannerViewKind,
  type: GameType | undefined,
): readonly [string, string] {
  if (kind === 'legend') return [RARITY_COLORS[6], '#0b0d1a'];
  if (kind === 'showcase') return ['#ff7fb0', '#2b3a73'];
  if ((kind === 'pseudo' || kind === 'starter') && type !== undefined) {
    return [TYPE_COLORS[type], '#14172b'];
  }
  return ['#ffd75a', '#3f66d0'];
}

export interface PityNumbers {
  readonly toFive: number;
  readonly toFour: number;
  readonly soft: boolean;
  readonly nextFiveChance: number;
  readonly sinceFive: number;
  /** The 50/50 was lost on a banner of this family: its next ★5 is the featured one (4V, 4X). */
  readonly featuredOwed?: boolean;
  /** 4X: draws left to the featured ★5 at the very worst (null without a featured ★5). */
  readonly worstToFeatured?: number | null;
}

export interface PityRules {
  readonly softFrom: number;
  readonly hardAt: number;
  readonly fourEvery: number;
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
        ? 'Perdiste el 50/50: tu próximo ★5 en un banner así es el destacado'
        : pity.worstToFeatured === null || pity.worstToFeatured === undefined
          ? 'Cada ★5 tiene un 50 % de ser el destacado'
          : `Destacado ★5 seguro en ${draws(pity.worstToFeatured)} como muy tarde`,
    );
  }
  return lines;
}

/** How the gacha works, for the help panel: the same numbers the draw uses. */
export function rulesText(rules: PityRules, limited: boolean): string[] {
  const lines = [
    `Cada tirada da un Pokémon para siempre: ★3 común, ★4 (evoluciones finales fuertes) o ★5 (iniciales y pseudolegendarios). Es la única forma de quedarte un Pokémon: lo que se une en una partida solo dura esa partida.`,
    `★5: ${percentBp(rules.rate5)} por tirada. Desde la tirada ${rules.softFrom} sin ★5 la probabilidad sube un 5 % en cada una, y la ${rules.hardAt} es un ★5 seguro.`,
    `Cada ${rules.fourEvery} tiradas, como muy tarde, sale un ★4 o mejor.`,
    `El contador de pity es tuyo: se conserva al cambiar de banner y entre semanas.`,
  ];
  if (limited) {
    lines.push(
      `En el banner del pseudolegendario y en el de iniciales de la semana, cada ★5 tiene un ${percentBp(rules.featuredShare)} de ser el destacado.`,
    );
    if (rules.lostHalfPaysBack === true) {
      lines.push(
        'Si pierdes el 50/50 (te sale otro ★5), el siguiente ★5 en un banner de esa familia es seguro el destacado, aunque ya sea otra semana.',
      );
    }
  }
  lines.push(
    'Los legendarios (★6) no salen con monedas: derrotar al legendario final de una partida da un fragmento de llave, y cada llave abre una tirada del Santuario Legendario.',
  );
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
    const worst = pity.worstToFeatured ?? 2 * rules.hardAt;
    meters.push({
      id: 'featured',
      label: 'Destacado ★5',
      value: owed ? 'Seguro' : String(worst),
      fill: owed ? 1 : clamp(1 - worst / (2 * rules.hardAt)),
      segments: 12,
      color: '#ff7fb0',
      hot: owed,
      note: owed ? 'tu próximo ★5' : 'tiradas, como muy tarde',
    });
  }
  return meters;
}

/**
 * 4X: the counters of the legendary banner: the fragments towards the next key, and the keys left to
 * the certain legendary (its own pity).
 */
export function legendMeters(legend: {
  readonly keys: number;
  readonly fragments: number;
  readonly perKey: number;
  readonly nextChance: number;
  readonly toLegend: number;
  readonly hardAt: number;
}): PityMeter[] {
  const clamp = (v: number): number => Math.max(0, Math.min(1, v));
  return [
    {
      id: 'four',
      label: 'Fragmentos de llave',
      value: `${legend.fragments}`,
      fill: clamp(legend.fragments / legend.perKey),
      segments: legend.perKey,
      color: RARITY_COLORS[6],
      hot: legend.keys > 0,
      note: `de ${legend.perKey} · ${legend.keys} ${legend.keys === 1 ? 'llave' : 'llaves'}`,
    },
    {
      id: 'five',
      label: '★6 seguro en',
      value: String(legend.toLegend),
      fill: clamp(1 - legend.toLegend / legend.hardAt),
      segments: legend.hardAt,
      color: RARITY_COLORS[6],
      hot: legend.toLegend === 1,
      note: `llaves · ${percentBp(legend.nextChance)} con la próxima`,
    },
  ];
}

/** When the reveal turns each card, in milliseconds after the cards are dealt. */
export interface RevealTiming {
  /** The moment each card turns face up, in the order of the cards. */
  readonly flips: readonly number[];
  /** Each ★4 or better glows through its back this long before it turns (the hint). */
  readonly hintMs: number;
  /** When the last card is up and the button to go on shows. */
  readonly doneMs: number;
  /** 4W: how long the screen of its own of a ★5 stays (the next card waits for it). */
  readonly fiveScreenMs: number;
}

/**
 * The anticipation before the cards (4W, block 6; 18th playtest: "el gacha mucho más espectacular"):
 * a glass sphere falls and lands, charges with rings that close on it, and its colour climbs from
 * ★3 up to the best rarity of the draw, one step at a time (the hint: violet promises a ★4, gold a
 * ★5); then it opens. Times in ms from the start. Pure.
 */
export interface Anticipation {
  readonly landMs: number;
  /** Each change of colour: when, and to which rarity. */
  readonly shifts: readonly { readonly at: number; readonly stars: StarCount }[];
  readonly openMs: number;
}

export function anticipation(best: StarCount): Anticipation {
  const landMs = 420;
  const shifts: { at: number; stars: StarCount }[] = [];
  if (best >= 4) shifts.push({ at: 1000, stars: 4 });
  if (best >= 5) shifts.push({ at: 1450, stars: 5 });
  // 4X: a legendary climbs one step further, after a longer charge.
  if (best >= 6) shifts.push({ at: 2050, stars: 6 });
  // A rare draw keeps the sphere a moment longer, so the last colour is seen before it opens.
  const openMs = best === 6 ? 2700 : best === 5 ? 1950 : best === 4 ? 1500 : 1150;
  return { landMs, shifts, openMs };
}

/**
 * The rhythm of a reveal (4V, block 3; the suspense of the gacha games): the cards are dealt face
 * down and turn one after another, the commonest first and the rarest last (in the order they were
 * drawn within a rarity); a ★4 or ★5 glows through its back before it turns, and every ★5 waits a
 * beat longer, so the best comes as a moment of its own.
 */
export function revealTiming(stars: readonly StarCount[]): RevealTiming {
  // 4W, block 6 (a x10 "con más ritmo"): the commons turn faster and faster (a roll), every ★4
  // waits a short beat, every ★5 a long one and then has a screen of its own.
  const FIRST_STEP = 150;
  const ACCEL = 12;
  const MIN_STEP = 85;
  const FOUR_BEAT = 200;
  const FIVE_BEAT = 420;
  const FIVE_SCREEN = 2400;
  const first = 380;
  const order = stars.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s || a.i - b.i);
  const flips: number[] = new Array(stars.length).fill(first);
  let at = first;
  let last = first;
  let step = FIRST_STEP;
  let lastFive = false;
  for (const { s, i } of order) {
    if (s === 4) at += FOUR_BEAT;
    // A ★6 (4X) is a ★5 moment and more: the same beat and screen of its own.
    if (s >= 5) at += FIVE_BEAT;
    flips[i] = at;
    last = at;
    lastFive = s >= 5;
    at += s >= 5 ? FIVE_SCREEN : step;
    step = Math.max(MIN_STEP, step - ACCEL);
  }
  return {
    flips,
    hintMs: 300,
    doneMs: last + 260 + (lastFive ? FIVE_SCREEN : 0),
    fiveScreenMs: FIVE_SCREEN,
  };
}
