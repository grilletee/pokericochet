/**
 * The control schemes (4G-G, 14th playtest: "MÓVIL: injugable"; a thumb cannot move and aim at once).
 * Pure data: the Settings screen lists them and the app builds the commands.
 *
 * 4G-H (15th playtest: "Móvil: casi injugable ... no me gusta nada"): the touch screen plays in
 * LANDSCAPE with two thumbs (`twin`): the left one moves the launcher 1:1 with no delay, the right one
 * aims by dragging and has the Ultimate at hand, both at once; the team and the HUD live in the side
 * panels, never over the field. The three one-thumb portrait schemes of the 4G-G stay in the code
 * but are hidden from Settings (the bots and the author found them worse); `?controls=` still opens
 * them.
 */
export type ControlScheme = 'classic' | 'twin' | 'smart' | 'motion' | 'sling';

export interface SchemeInfo {
  readonly id: ControlScheme;
  readonly name: string;
  readonly hint: string;
  /** Not offered in Settings (4G-H): the old portrait prototypes. */
  readonly hidden?: boolean;
}

export const CONTROL_SCHEMES: readonly SchemeInfo[] = [
  {
    id: 'classic',
    name: 'Clásico (teclado y ratón)',
    hint: 'A/D para moverte y el ratón apunta. En pantalla táctil: un dedo abajo se mueve y otro arriba apunta.',
  },
  {
    id: 'twin',
    name: 'Móvil en horizontal · dos pulgares',
    hint: 'Gira el móvil. Pulgar izquierdo: arrastra y el lanzador sigue al dedo. Pulgar derecho: arrastra para apuntar; el botón ULTI lanza tu Ultimate. Los dos a la vez.',
  },
  {
    id: 'smart',
    name: 'A · Arrastrar + apuntado inteligente',
    hint: 'Arrastra abajo para moverte; el lanzador elige a quién disparar (el jefe, el más cercano a la línea). Toca un enemigo para fijarlo.',
    hidden: true,
  },
  {
    id: 'motion',
    name: 'B · Ángulo por movimiento (Arkanoid)',
    hint: 'Arrastra abajo para moverte. No se apunta: las bolas salen inclinadas hacia donde te mueves, rectas si estás quieto.',
    hidden: true,
  },
  {
    id: 'sling',
    name: 'C · Tirachinas',
    hint: 'Mantén y arrastra para moverte; al soltar, salen todas las bolas listas. Suelta con un gesto rápido para dirigirlas; si sueltas quieto, van al objetivo.',
    hidden: true,
  },
];

/** The schemes Settings offers (4G-H: the classic one and the two thumbs). */
export const VISIBLE_SCHEMES: readonly SchemeInfo[] = CONTROL_SCHEMES.filter((s) => !s.hidden);

export const DEFAULT_SCHEME: ControlScheme = 'classic';

/** One line shown when a run starts with a touch scheme (null for the classic one). */
export function schemeTip(scheme: ControlScheme): string | null {
  switch (scheme) {
    case 'twin':
      return 'Izquierda: arrastra para moverte. Derecha: arrastra para apuntar. ULTI: tu Ultimate.';
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

/** The scheme a device starts with: a touch screen plays with two thumbs (4G-H), anything else classic. */
export function defaultSchemeFor(coarsePointer: boolean): ControlScheme {
  return coarsePointer ? 'twin' : 'classic';
}

export function isControlScheme(value: unknown): value is ControlScheme {
  return CONTROL_SCHEMES.some((scheme) => scheme.id === value);
}
