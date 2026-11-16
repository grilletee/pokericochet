import type { GameType } from '../domain';
import type { ArtLookup } from './cardView';
import { RARITY_COLORS, type StarCount, stars } from './gachaText';
import { pokemonName } from './names';
import { TYPE_COLORS } from './typeColors';
import { typeIcons } from './typeIcons';

/**
 * The card of a Pokémon (4G-J, block 6: "más Pokémon en espíritu": colours, type icons, cards). Our
 * own design over the pixel style of the game: the colour of its types as the card, a light window
 * with the sprite, its Pokédex number and name, its type icons and its rarity. A seen one is a
 * silhouette; an unknown one a "?". Used by the Pokédex, the choice of a starter and the gacha.
 */
export interface PokeCardView {
  readonly species: string;
  readonly types: readonly GameType[];
  readonly dex: number;
  readonly state: 'owned' | 'seen' | 'unknown';
  readonly stars?: StarCount;
  /** A line under the name (the permanent level and candies of an owned one, a region...). */
  readonly note?: string;
  readonly selected?: boolean;
}

const CSS = `
[data-px-root] button[data-poke-card]{background:var(--card-bg) !important;color:#14172b !important;text-shadow:none !important;padding:0 !important}
[data-px-root] button[data-poke-card]:hover{filter:brightness(1.12)}
[data-px-root] button[data-poke-card][data-selected="1"]{box-shadow:0 0 0 3px #14172b,0 0 0 6px #ffd75a !important}
[data-poke-card] .pc-window{background:radial-gradient(circle at 50% 45%,#ffffffee 0,#ffffff88 45%,#ffffff22 70%);margin:4px 4px 0;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 2px #14172b55}
[data-poke-card] .pc-name{background:#f6f3e8;margin:0 4px;padding:1px 4px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;gap:4px;justify-content:space-between;box-shadow:inset 0 -2px 0 #14172b33}
`;

let styled = false;
function installCss(): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const style = document.createElement('style');
  style.dataset.pokeCardStyle = '';
  style.textContent = CSS;
  document.head.append(style);
}

/** The background of a card: its two types as a diagonal, or grey for one that is not yours. */
export function cardBackground(types: readonly GameType[], state: PokeCardView['state']): string {
  if (state === 'unknown') return 'linear-gradient(160deg,#3a4260,#1f2547)';
  if (state === 'seen') return 'linear-gradient(160deg,#8a93b8,#4a5578)';
  const a = TYPE_COLORS[types[0] ?? 'normal'];
  const b = TYPE_COLORS[types[1] ?? types[0] ?? 'normal'];
  return `linear-gradient(160deg,${a} 0,${a} 48%,${b} 52%,${b} 100%)`;
}

/** "#025". */
export function dexNumber(dex: number): string {
  return `#${String(Math.max(0, dex)).padStart(3, '0')}`;
}

export function pokeCard(view: PokeCardView, art: ArtLookup, size: number): HTMLButtonElement {
  installCss();
  const card = document.createElement('button');
  card.type = 'button';
  card.dataset.pokeCard = view.species;
  card.dataset.selected = view.selected === true ? '1' : '0';
  card.style.setProperty('--card-bg', cardBackground(view.types, view.state));
  card.style.cssText += `display:flex;flex-direction:column;align-items:stretch;gap:2px;cursor:pointer;font:inherit;font-size:${size >= 90 ? 13 : 10}px;pointer-events:auto;min-width:0;`;
  const window = document.createElement('div');
  window.className = 'pc-window';
  window.style.height = `${size}px`;
  if (view.state === 'unknown') {
    window.textContent = '?';
    window.style.fontSize = `${Math.round(size / 2.4)}px`;
    window.style.color = '#ffffff99';
  } else {
    const url = art.spriteUrl(view.species);
    if (url === undefined) {
      window.textContent = pokemonName(view.species).charAt(0);
    } else {
      const img = document.createElement('img');
      img.src = url;
      img.alt = pokemonName(view.species);
      img.draggable = false;
      img.style.cssText = `width:${size}px;height:${size}px;image-rendering:pixelated;transform:scale(1.15);`;
      // A seen one is only its silhouette.
      if (view.state === 'seen') img.style.filter = 'brightness(0) opacity(0.6)';
      window.append(img);
    }
  }
  const name = document.createElement('div');
  name.className = 'pc-name';
  const number = document.createElement('span');
  number.textContent = dexNumber(view.dex);
  number.style.opacity = '0.6';
  const label = document.createElement('span');
  label.textContent = view.state === 'unknown' ? '???' : pokemonName(view.species);
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  name.append(label, number);
  const foot = document.createElement('div');
  foot.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;padding:0 4px 4px;gap:2px;min-height:16px;';
  if (view.state !== 'unknown') foot.append(typeIcons(view.types, size >= 90 ? 16 : 12));
  if (view.stars !== undefined && view.state !== 'unknown') {
    const rarity = document.createElement('span');
    rarity.textContent = stars(view.stars);
    rarity.style.cssText = `color:${RARITY_COLORS[view.stars]};text-shadow:1px 1px 0 #14172b;font-size:${size >= 90 ? 12 : 9}px;letter-spacing:-1px;`;
    foot.append(rarity);
  }
  card.append(window, name, foot);
  if (view.note !== undefined && view.note !== '') {
    const note = document.createElement('div');
    note.textContent = view.note;
    note.style.cssText = `background:#14172bcc;color:#ffd75a;padding:1px 4px;font-size:${size >= 90 ? 11 : 9}px;font-weight:700;`;
    card.append(note);
  }
  return card;
}
