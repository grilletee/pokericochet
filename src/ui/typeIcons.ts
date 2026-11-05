import type { GameType } from '../domain';
import { typeName } from './cardText';
import { TYPE_COLORS } from './typeColors';

/**
 * Original vector icons of the types (ADR-050): a disc of the colour of the type with a simple
 * white shape, drawn here, so nothing is downloaded and nothing of Nintendo's art is used. Colour
 * AND shape, so a type reads without relying on colour alone. 24 x 24 view box.
 */
const GLYPHS: Record<GameType, string> = {
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
