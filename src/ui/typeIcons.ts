import type { GameType } from '../domain';
import { typeName } from './cardText';
import { TYPE_COLORS } from './typeColors';

/**
 * Original vector icons of the types (ADR-050): a disc of the colour of the type with a simple
 * white shape, drawn here, so nothing is downloaded and nothing of Nintendo's art is used. Colour
 * AND shape, so a type reads without relying on colour alone. 24 x 24 view box.
 */
const GLYPHS: Record<GameType, string> = {
  // Shapes drawn for this project, one idea each: a circle, a fist-like block, a wing, a drop with
  // a cross, a mound, a rock, a leaf-bug body, a ghost sheet, a bolt-head, a swirl, a snowflake,
  // a fang, a crescent and a heart.
  normal: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  fighting:
    'M6 9h12v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3zM8 6h2.5v3H8zm3.2-1h2.5v4h-2.5zm3.3 1H17v3h-2.5z',
  flying: 'M3 15c4 0 6-2 9-9 1 4 4 6 9 7-4 0-6 2-9 6-1-2-3-4-9-4z',
  poison:
    'M12 4s-5 5.5-5 9.5A5 5 0 0 0 17 13.5C17 9.5 12 4 12 4zm-1 8h2v1.8h1.8v2H13v1.8h-2v-1.8H9.2v-2H11z',
  ground: 'M3 18l5-9 3 5 3-7 7 11z',
  rock: 'M7 6l7-1 4 5-1 7-7 2-5-5z',
  bug: 'M12 8a4 4 0 0 1 4 4v3a4 4 0 0 1-8 0v-3a4 4 0 0 1 4-4zM9 7 7 4m8 3 2-3M8 12H5m11 0h3',
  ghost:
    'M6 19V11a6 6 0 0 1 12 0v8l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5zM9.5 11.5h1.6v2H9.5zm3.4 0h1.6v2h-1.6z',
  steel: 'M12 4l6.5 3v5c0 4-3 6.5-6.5 8-3.5-1.5-6.5-4-6.5-8V7z',
  psychic: 'M12 5a7 7 0 1 0 7 7M12 9a3 3 0 1 0 3 3M12 12h.01',
  ice: 'M12 3v18M5 7l14 10M19 7 5 17M12 3l-2 2.4M12 3l2 2.4M12 21l-2-2.4M12 21l2-2.4',
  dragon: 'M4 18c4 1 9 0 12-4 1-1.3 1.3-3.2.6-4.5L19 6l-4 1.2C12.5 7 9 9 8 12c-.7 2-1.8 4-4 6z',
  dark: 'M15.5 4.5A8 8 0 1 0 19.5 15 6.5 6.5 0 0 1 15.5 4.5z',
  fairy:
    'M12 19.5S4.5 15 4.5 9.8A3.8 3.8 0 0 1 12 8.2a3.8 3.8 0 0 1 7.5 1.6C19.5 15 12 19.5 12 19.5z',
  fire: 'M12 4c1 3.5 5 5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.2-4.8.3 1.3 1 2 1.8 2.3C11.2 8.6 10.8 6.4 12 4z',
  water: 'M12 4s-5.5 6-5.5 10a5.5 5.5 0 0 0 11 0C17.5 10 12 4 12 4z',
  grass: 'M6 18C6 10 10.5 6 18 6c0 7.5-4 12-12 12zM7 17c3-3 6-5 9-7',
  electric: 'M13.5 3.5 7 13h4.5L10.5 20.5 17 11h-4.5z',
};

const SVG = 'http://www.w3.org/2000/svg';

/** The icon of a type as a DOM element; `size` is its side in pixels. */
export function typeIcon(type: GameType, size = 20): HTMLElement {
  const holder = document.createElement('span');
  holder.dataset.typeIcon = type;
  holder.title = typeName(type);
  holder.style.cssText =
    `display:inline-flex;width:${size}px;height:${size}px;border-radius:50%;flex:none;` +
    `background:${TYPE_COLORS[type]};box-shadow:0 0 0 1px rgba(0,0,0,0.55) inset;`;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', GLYPHS[type]);
  path.setAttribute('fill', '#fff');
  path.setAttribute('stroke', 'rgba(0,0,0,0.55)');
  path.setAttribute('stroke-width', '1');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  holder.append(svg);
  return holder;
}

/** A row of icons. */
export function typeIcons(types: readonly GameType[], size = 20): HTMLElement {
  const row = document.createElement('span');
  row.style.cssText = 'display:inline-flex;gap:3px;align-items:center;';
  for (const type of types) row.append(typeIcon(type, size));
  return row;
}
