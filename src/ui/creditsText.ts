/** One line of the credits; a line with `url` is shown as a link. */
export interface CreditLine {
  readonly text: string;
  readonly url?: string;
}

export const POKEAPI_URL = 'https://pokeapi.co';
export const SPRITES_URL = 'https://github.com/PokeAPI/sprites';

/** The one-line notice shown under the title screen at all times. */
export function disclaimerShort(title: string): string {
  return `${title} es un proyecto de fans, gratuito y sin ánimo de lucro. No está afiliado a Nintendo, Game Freak, Creatures ni The Pokémon Company.`;
}

/** The credits screen: affiliation notice, data and art sources, tools, and what is original. */
export function creditLines(title: string): CreditLine[] {
  return [
    {
      text:
        `${title} es un juego de fans, gratuito, sin anuncios ni donaciones y sin ánimo de lucro. ` +
        'No está afiliado, patrocinado ni respaldado por Nintendo, Game Freak, Creatures Inc. ni The Pokémon Company. ' +
        'Pokémon y los nombres de los Pokémon son marcas de sus respectivos propietarios.',
    },
    { text: 'Datos de las especies (tipos y estadísticas): PokéAPI', url: POKEAPI_URL },
    {
      text: 'Imágenes de los Pokémon: PokeAPI/sprites (© sus propietarios, usadas sin fines comerciales)',
      url: SPRITES_URL,
    },
    {
      text: 'Gritos de los Pokémon: PokeAPI/cries (© sus propietarios, usados sin fines comerciales; se descargan aparte, no están en el repositorio)',
      url: 'https://github.com/PokeAPI/cries',
    },
    { text: 'Gráficos de la partida: PixiJS (licencia MIT)', url: 'https://pixijs.com' },
    {
      text: 'Tipografía: Pixelify Sans, © The Pixelify Sans Project Authors (licencia SIL OFL 1.1)',
      url: 'https://github.com/eifetx/Pixelify-Sans',
    },
    {
      text: 'El código, los efectos de sonido, el pixel art de los fondos, los ataques y la interfaz son originales (dibujados por código y sonidos sintetizados).',
    },
  ];
}
