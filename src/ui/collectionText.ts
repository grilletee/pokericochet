import { pokemonName } from './names';

/**
 * The words of the collection about candies (4G-J, block 3; 17th playtest: "no entendí cómo se
 * consiguen los caramelos"). Pure; the numbers come from the meta's rules.
 */
export interface CandyRules {
  readonly perRun: number;
  readonly perBoss: number;
  /** Candies of a repeat in the gacha, by its stars (★6: a legendary of the key banner). */
  readonly repeat: Readonly<Record<3 | 4 | 5 | 6, number>>;
  /** 4X: candies of capturing in a run a boss you already have. */
  readonly caught: number;
}

/** How candies are earned and what they are for, one line each. */
export function candyLines(rules: CandyRules): string[] {
  return [
    `Jugando: el Pokémon con el que juegas gana ${rules.perRun} caramelos por partida (si superas una oleada) y ${rules.perBoss} más por cada jefe que derrotes.`,
    `En el Gacha: un repetido da caramelos de ese Pokémon (★3 +${rules.repeat[3]}, ★4 +${rules.repeat[4]}, ★5 +${rules.repeat[5]}, ★6 +${rules.repeat[6]}).`,
    `Capturando en una partida a un jefe que ya tienes: +${rules.caught}.`,
    'Para qué sirven: suben su nivel permanente, y con más nivel empieza las partidas más fuerte.',
  ];
}

/**
 * 4W, block 4 (18th playtest: "no entiendo subir de nivel"): the words of a Pokémon's permanent
 * level in its sheet. What it is, where it starts now, the next level that changes that and the
 * candies still missing. Pure.
 */
export const PERMANENT_INTRO =
  'El nivel permanente es suyo para siempre: no se pierde al acabar una partida. Se sube con caramelos de este Pokémon, y en ciertos niveles empieza las partidas más fuerte.';

/** "Ahora empieza las partidas en Nv 2, como Charmeleon." */
export function startNowLine(startLevel: number, form: string): string {
  return `Ahora empieza las partidas en Nv ${startLevel}, como ${pokemonName(form)}.`;
}

export interface GoalView {
  readonly level: number;
  readonly startLevel: number;
  readonly form: string;
  readonly missing: number;
}

/** The next milestone of the ladder, and the candies still missing to reach it. */
export function goalLine(goal: GoalView | null): string {
  if (goal === null) return 'Ya empieza las partidas en su mejor nivel inicial.';
  const reach = `Al llegar a nivel permanente ${goal.level} empezará en Nv ${goal.startLevel}, como ${pokemonName(goal.form)}.`;
  return goal.missing > 0
    ? `${reach} Te faltan ${goal.missing} caramelos.`
    : `${reach} ¡Ya tienes los caramelos!`;
}

/** The next single level: what it costs and what you have. */
export function nextLevelLine(level: number, candies: number, nextCost: number): string {
  if (!Number.isFinite(nextCost)) return 'Nivel permanente máximo.';
  const missing = Math.max(0, nextCost - candies);
  return missing > 0
    ? `Subir a nivel ${level + 1} cuesta ${nextCost} caramelos: tienes ${candies}, te faltan ${missing}.`
    : `Subir a nivel ${level + 1} cuesta ${nextCost} caramelos: ya los tienes.`;
}

/** How to get this Pokémon's candies, in one line. */
export function candyHowLine(rules: CandyRules, species: string): string {
  return `Cómo conseguirlos: juega con ${pokemonName(species)} (+${rules.perRun} por partida, +${rules.perBoss} por jefe) o sácalo repetido en el Gacha.`;
}

/**
 * The first-time notices (block 4): a short word the first time the collection is opened, and the
 * first time a run pays candies. Shown once per player (the app remembers them).
 */
export const FIRST_COLLECTION_TIP =
  'Aquí están tus Pokémon. Toca uno para ver su ficha: con sus caramelos subes su nivel permanente y empezará las partidas más fuerte.';

export function firstCandiesTip(species: string): string {
  return `¡Tus primeros caramelos! Son de ${pokemonName(species)}: gástalos en la Pokédex para subir su nivel permanente.`;
}

/** The line of the results: the candies the starter earned in this run. */
export function earnedCandiesLine(species: string, candies: number): string {
  return candies > 0 ? `+${candies} caramelos de ${pokemonName(species)}` : '';
}
