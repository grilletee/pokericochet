/**
 * The control schemes (4G-G, 14th playtest: "MÓVIL: injugable"; a thumb cannot move and aim at once).
 * Pure data: the Settings screen lists them and the app builds the commands. The three touch schemes
 * are prototypes the author tries on the phone before deciding which one stays.
 */
export type ControlScheme = 'classic' | 'smart' | 'motion' | 'sling';

export interface SchemeInfo {
  readonly id: ControlScheme;
  readonly name: string;
  readonly hint: string;
}

export const CONTROL_SCHEMES: readonly SchemeInfo[] = [
  {
    id: 'classic',
    name: 'Clásico (teclado y ratón)',
    hint: 'A/D para moverte y el ratón apunta. En pantalla táctil: un dedo abajo se mueve y otro arriba apunta.',
  },
  {
    id: 'smart',
    name: 'A · Arrastrar + apuntado inteligente',
    hint: 'Arrastra abajo para moverte; el lanzador elige a quién disparar (el jefe, el más cercano a la línea). Toca un enemigo para fijarlo.',
  },
  {
    id: 'motion',
    name: 'B · Ángulo por movimiento (Arkanoid)',
    hint: 'Arrastra abajo para moverte. No se apunta: las bolas salen inclinadas hacia donde te mueves, rectas si estás quieto.',
  },
  {
    id: 'sling',
    name: 'C · Tirachinas',
    hint: 'Mantén y arrastra para moverte; al soltar, salen todas las bolas listas. Suelta con un gesto rápido para dirigirlas; si sueltas quieto, van al objetivo.',
  },
];

export const DEFAULT_SCHEME: ControlScheme = 'classic';

/** One line shown when a run starts with a touch scheme (null for the classic one). */
export function schemeTip(scheme: ControlScheme): string | null {
  switch (scheme) {
    case 'smart':
      return 'Arrastra con el pulgar abajo para moverte. Toca un enemigo para fijarlo como objetivo.';
    case 'motion':
      return 'Arrastra para moverte: las bolas salen inclinadas hacia donde te mueves.';
    case 'sling':
      return 'Arrastra para moverte y suelta para lanzar. Suelta con un gesto rápido para dirigirlas.';
    default:
      return null;
  }
}

/** The scheme a device starts with: a touch screen starts with the smart aim, anything else the classic. */
export function defaultSchemeFor(coarsePointer: boolean): ControlScheme {
  return coarsePointer ? 'smart' : 'classic';
}

export function isControlScheme(value: unknown): value is ControlScheme {
  return CONTROL_SCHEMES.some((scheme) => scheme.id === value);
}
