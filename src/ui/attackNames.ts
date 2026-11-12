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
  blast: {
    name: 'Enemigo marcado',
    tip: 'va a explotar: derrótalo antes de que acabe la cuenta o sal de la franja',
  },
  enemyShot: { name: 'Disparo de enemigo', tip: 'el que brilla va a disparar: derrótalo primero' },
  tide: { name: 'Marea', tip: 'el campo se estrecha por los lados' },
  barrier: { name: 'Barrera', tip: 'tus bolas rebotan en el jefe: espera a que baje' },
  timeSlow: { name: 'Tiempo lento', tip: 'te mueves más despacio un rato' },
};

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
