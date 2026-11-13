/**
 * The name of each attack and how to dodge it, shown ONCE the first time it appears in a run
 * (4G-F, "la primera vez que aparece cada ataque, su nombre en pantalla"). Pure text.
 */
const NAMES: Readonly<Record<string, { readonly name: string; readonly tip: string }>> = {
  column: { name: 'Columna', tip: 'sal de la franja roja antes de que se llene' },
  comb: { name: 'Peine', tip: 'hay un hueco sin marcar: ponte ahí' },
  sweep: { name: 'Barrido', tip: 'cruza el campo de un lado: ponte al otro' },
  rain: { name: 'Lluvia', tip: 'columnas una tras otra: no te quedes quieto' },
  shot: { name: 'Proyectil', tip: 'cae recto sobre la marca del suelo: apártate' },
  zone: { name: 'Zona', tip: 'dentro no puedes recoger bolas' },
  gust: { name: 'Ráfaga', tip: 'te empuja de lado: muévete en contra' },
  crack: { name: 'Grieta', tip: 'quema cada segundo: no te quedes encima' },
  portal: { name: 'Portal', tip: 'te lleva al portal pareja' },
  enemyShot: { name: 'Disparo de enemigo', tip: 'el que brilla te apunta: sal de la marca' },
  tide: { name: 'Marea', tip: 'el campo se estrecha por los lados' },
  barrier: { name: 'Barrera', tip: 'tus bolas rebotan en el jefe: espera a que baje' },
  timeSlow: { name: 'Tiempo lento', tip: 'te mueves más despacio un rato' },
};

// The shot of each type has its own name (4G-G): "Chispa", "Ascua", "Burbuja"...
const SHOTS: Readonly<Record<string, { readonly name: string; readonly tip: string }>> = {
  // 4G-H: the shots are aimed at the player and many come in bursts of 2-3 side by side.
  electric: { name: 'Chispa', tip: 'ráfaga de tres, rápida: sal de las marcas en cuanto brille' },
  fire: { name: 'Ascua', tip: 'dos ascuas apuntadas a ti: apártate de las marcas' },
  water: { name: 'Burbuja', tip: 'lentas, de dos en dos: sigue las marcas' },
  grass: { name: 'Hoja', tip: 'tres hojas en abanico: sal por un lado' },
  rock: { name: 'Roca', tip: 'pesada y rápida: no te quedes bajo la marca' },
  ground: { name: 'Roca', tip: 'pesada y rápida: no te quedes bajo la marca' },
  ghost: { name: 'Sombra', tip: 'lentas, de dos en dos: vigila dónde caerán' },
  poison: { name: 'Gota tóxica', tip: 'tres gotas seguidas: sal de las marcas' },
  psychic: { name: 'Pulso mental', tip: 'muy rápido y apuntado: muévete en cuanto brille' },
  dragon: { name: 'Colmillo', tip: 'dos, rápidos: sal de las marcas enseguida' },
  ice: { name: 'Carámbano', tip: 'tres en fila: sal por un lado' },
  steel: { name: 'Esquirla', tip: 'la más rápida: muévete en cuanto brille' },
  fighting: { name: 'Puño', tip: 'dos golpes rápidos: apártate de las marcas' },
  flying: { name: 'Cuchilla de aire', tip: 'dos, muy rápidas: sal de las marcas' },
  bug: { name: 'Picadura', tip: 'tres en abanico: sal por un lado' },
  fairy: { name: 'Destello', tip: 'dos, lentos: sigue las marcas' },
  dark: { name: 'Mordisco', tip: 'dos, rápidos: apártate de las marcas' },
  normal: { name: 'Golpe', tip: 'apuntado a ti: apártate de la marca' },
};
for (const [type, entry] of Object.entries(SHOTS)) {
  (NAMES as Record<string, { name: string; tip: string }>)[`enemyShot-${type}`] = entry;
}

/**
 * Which name an announced attack is told by: the shot of its type if it has a name, or the verb of
 * the boss's attack.
 */
export function attackKey(kind: string, fromEnemy: boolean, shotType?: string): string {
  if (!fromEnemy) return kind;
  return shotType !== undefined && `enemyShot-${shotType}` in NAMES
    ? `enemyShot-${shotType}`
    : 'enemyShot';
}

/** The text of the first appearance of `key`, or null if it is unknown. */
export function attackLabel(key: string): string | null {
  const entry = NAMES[key];
  return entry === undefined ? null : `⚠ ${entry.name}: ${entry.tip}`;
}

/** Remembers which attacks were already named in this run. */
export class AttackNamer {
  private readonly seen = new Set<string>();

  /** The label to show the first time `key` appears; null every time after (and for unknown keys). */
  first(key: string): string | null {
    if (this.seen.has(key)) return null;
    const text = attackLabel(key);
    if (text === null) return null;
    this.seen.add(key);
    return text;
  }

  reset(): void {
    this.seen.clear();
  }
}
