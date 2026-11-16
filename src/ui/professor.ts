/**
 * Doctora Ámbar (4G-I, 4G-J): the professor of this game, an original character. Her portrait is pure
 * data, 16 x 20 art pixels, drawn by code and scaled without smoothing: amber hair, round glasses, a
 * lab coat and the glass sphere of the balls of this game in her hand. Nothing traced, nothing of a
 * franchise. The tutorial of the first time (block 3 of the 4G-J) is her talking.
 *
 * o outline, h hair, H hair light, s skin, S skin shade, g glasses, e eye, m mouth, w coat,
 * W coat shade, t shirt, b sphere, l sphere glint.
 */
export const PROFESSOR_PORTRAIT: readonly string[] = [
  '....oooooooo....',
  '...ohhhHHHhhho..',
  '..ohhHHhhhhhhho.',
  '..ohhsssssshho..',
  '.ohhsssssssshho.',
  '.ohsgggssgggsho.',
  '.ohsgegssgegsho.',
  '.ohssssSSsssshho',
  '.ohhsssmmssshho.',
  '..ohhssssssshho.',
  '..owwoSSSSowwo..',
  '.owwwwtttttwwwo.',
  'owwwwwtttwwoooo.',
  'owWwwwwtwwobllbo',
  'owWwwwwwwwoblbbo',
  'owWwwwwwwwobbbbo',
  'owWwwwwwwwwoooo.',
  'owWwwwwwwwwwwWwo',
  'owWwwwwoowwwwWwo',
  'oooooooooooooooo',
];

export const PROFESSOR_COLORS: Readonly<Record<string, string>> = {
  o: '#14172b',
  h: '#b8662a',
  H: '#e8a050',
  s: '#f6cfa8',
  S: '#dba27e',
  g: '#8ef0ff',
  e: '#14172b',
  m: '#c04a4a',
  w: '#f6f3e8',
  W: '#c8d0e8',
  t: '#3f66d0',
  b: '#4a8ae8',
  l: '#ffffff',
};

/** Her name, as the screens say it. */
export const PROFESSOR_NAME = 'Doctora Ámbar';

/** The portrait as a canvas of `scale` screen pixels per art pixel. */
export function drawProfessor(scale: number): HTMLCanvasElement {
  const h = PROFESSOR_PORTRAIT.length;
  const w = PROFESSOR_PORTRAIT[0]?.length ?? 0;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.style.width = `${w * scale}px`;
  c.style.height = `${h * scale}px`;
  c.style.imageRendering = 'pixelated';
  const g = c.getContext('2d');
  if (g === null) return c;
  PROFESSOR_PORTRAIT.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = PROFESSOR_COLORS[row[x] ?? '.'];
      if (color === undefined) continue;
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

/**
 * The tutorial of the first time (4G-J, block 3): what the game is about, in her words. One page at
 * a time; the last one leads to the choice of the first Pokémon.
 */
export const FIRST_TIME_PAGES: readonly string[] = [
  '¡Hola! Soy la doctora Ámbar y estudio cómo rebotan los Pokémon.',
  'Antes de nada vas a elegir tu primer Pokémon. Será tuyo para siempre: es el comienzo de tu colección.',
  'En cada partida juegas con uno de los Pokémon de tu colección. Lanzas bolas, capturas compañeros para esa partida y te enfrentas a jefes.',
  '¿Cómo consigues más Pokémon para tu colección? De dos formas. Una: si derrotas al menos a un jefe, al acabar la partida puedes registrar uno de los que hayas capturado.',
  'Dos: las monedas que ganas jugando sirven para tirar en el Gacha, y cada tirada te da un Pokémon. Si te sale uno repetido, ganas caramelos.',
  'Los caramelos suben el nivel permanente de tus Pokémon, y con más nivel empiezan las partidas más fuertes. También se ganan jugando: en cada partida y por cada jefe, para el Pokémon que llevas.',
  'Elige con calma: hay uno de cada región. ¡Buena suerte!',
];
