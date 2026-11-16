import { pokemonName } from './names';

/**
 * The words of the collection about candies (4G-J, block 3; 17th playtest: "no entendí cómo se
 * consiguen los caramelos"). Pure; the numbers come from the meta's rules.
 */
export interface CandyRules {
  readonly perRun: number;
  readonly perBoss: number;
  /** Candies of a repeat in the gacha, by its stars. */
  readonly repeat: Readonly<Record<3 | 4 | 5, number>>;
  /** Candies of registering a Pokémon you already have. */
  readonly register: number;
}

/** How candies are earned and what they are for, one line each. */
export function candyLines(rules: CandyRules): string[] {
  return [
    `Jugando: el Pokémon con el que juegas gana ${rules.perRun} caramelos por partida (si superas una oleada) y ${rules.perBoss} más por cada jefe que derrotes.`,
    `En el Gacha: un repetido da caramelos de ese Pokémon (★3 +${rules.repeat[3]}, ★4 +${rules.repeat[4]}, ★5 +${rules.repeat[5]}).`,
    `Al registrar una captura que ya tienes: +${rules.register}.`,
    'Para qué sirven: suben su nivel permanente, y con más nivel empieza las partidas más fuerte.',
  ];
}

/** The line of the results: the candies the starter earned in this run. */
export function earnedCandiesLine(species: string, candies: number): string {
  return candies > 0 ? `+${candies} caramelos de ${pokemonName(species)}` : '';
}
