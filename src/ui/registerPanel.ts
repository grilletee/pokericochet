import type { GameType } from '../domain';
import { type ArtLookup, spriteTile } from './cardView';
import { pokemonName } from './names';

/**
 * The end of a run that beat a boss (4G-I, Phase 5): "Registra uno en tu colección", a row of the
 * captures of the run to keep ONE of them for good. Once chosen, the row says what happened.
 */
export function registerPanel(
  offered: readonly string[],
  art: ArtLookup,
  typeOf: (species: string) => GameType | undefined,
  owned: (species: string) => boolean,
  onPick: (species: string) => void,
): HTMLElement {
  const panel = document.createElement('div');
  panel.dataset.register = '';
  panel.style.cssText =
    'display:flex;flex-direction:column;align-items:center;gap:6px;margin-top:8px;padding:8px;' +
    'border:2px solid #ffd54f;background:#10142a;max-width:94vw;';
  const title = document.createElement('div');
  title.textContent = 'Has derrotado a un jefe: registra UNO de tus capturados en tu colección';
  title.style.cssText = 'font-size:15px;font-weight:800;color:#ffd54f;max-width:420px;';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;';
  for (const species of offered) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.registerSpecies = species;
    button.style.cssText =
      'pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:2px;' +
      'padding:6px;border:2px solid #5b6aa8;background:#1b2540;color:inherit;font:inherit;cursor:pointer;';
    const name = document.createElement('div');
    name.textContent = pokemonName(species);
    name.style.cssText = 'font-size:12px;font-weight:700;';
    const note = document.createElement('div');
    note.textContent = owned(species) ? 'ya lo tienes: caramelos' : '¡nuevo!';
    note.style.cssText = 'font-size:10px;opacity:0.85;';
    button.append(
      spriteTile(art.spriteUrl(species), species, typeOf(species), 48, undefined, true),
      name,
      note,
    );
    button.addEventListener('click', () => onPick(species));
    row.append(button);
  }
  panel.append(title, row);
  return panel;
}

/** What the panel shows once a capture is registered. */
export function registeredLine(species: string, isNew: boolean): HTMLElement {
  const line = document.createElement('div');
  line.dataset.registered = species;
  line.textContent = isNew
    ? `¡${pokemonName(species)} se une a tu colección!`
    : `${pokemonName(species)} ya estaba: recibes sus caramelos.`;
  line.style.cssText = 'font-size:16px;font-weight:800;color:#ffd54f;margin-top:8px;';
  return line;
}
