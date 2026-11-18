import type { GameType } from '../domain';
import { type ArtLookup, spriteTile } from './cardView';
import { pokemonName } from './names';
import { PALETTE, pixelFrame } from './pixelStyle';

/** What the end of a run shows of what it leaves for good (4X). */
export interface RunRewardsView {
  readonly fragments: number;
  /** Fragments the profile has now, and how many make a key. */
  readonly fragmentsNow: number;
  readonly perKey: number;
  readonly caught: readonly { readonly species: string; readonly candies: number }[];
}

/**
 * The lines of what a run leaves (4X, block 2; 19th playtest: "no puede ser que en una partida
 * consigas un Deino y lo registres para siempre"): nothing of the run joins the collection; a
 * captured boss marks the Pokédex (or gives candies if you have it) and the legendary a fragment of
 * a key. Pure.
 */
export function rewardLines(view: RunRewardsView): string[] {
  const lines: string[] = [];
  if (view.fragments > 0) {
    const keys = Math.floor(view.fragmentsNow / view.perKey);
    const left = view.fragmentsNow % view.perKey;
    lines.push(
      `+${view.fragments} fragmento de llave legendaria · ${keys > 0 ? `${keys} ${keys === 1 ? 'llave lista' : 'llaves listas'} y ` : ''}${left}/${view.perKey} hacia la siguiente`,
    );
  }
  for (const c of view.caught) {
    lines.push(
      c.candies > 0
        ? `${pokemonName(c.species)} capturado: +${c.candies} caramelos suyos`
        : `${pokemonName(c.species)} capturado: marcado en tu Pokédex (para tenerlo siempre, el Gacha)`,
    );
  }
  if (lines.length === 0) {
    lines.push(
      'Lo que se une en una partida se queda en ella. Para siempre: el Gacha con tus monedas, y los legendarios con llaves.',
    );
  }
  return lines;
}

/** The panel of the results screen with those lines, each captured boss with its picture. */
export function rewardsPanel(
  view: RunRewardsView,
  art: ArtLookup,
  typeOf: (species: string) => GameType | undefined,
): HTMLElement {
  const panel = document.createElement('div');
  panel.dataset.runRewards = '';
  panel.style.cssText =
    'display:flex;flex-direction:column;gap:6px;align-items:center;max-width:min(94vw,460px);' +
    `padding:8px 12px;background:${PALETTE.deep};${pixelFrame(PALETTE.yellow)}`;
  const lines = rewardLines(view);
  const caughtLines = new Map(view.caught.map((c, i) => [i + (view.fragments > 0 ? 1 : 0), c]));
  lines.forEach((text, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;text-align:left;';
    const c = caughtLines.get(i);
    if (c !== undefined) {
      row.dataset.rewardCaught = c.species;
      row.append(spriteTile(art.spriteUrl(c.species), c.species, typeOf(c.species), 40));
    } else if (view.fragments > 0 && i === 0) {
      row.dataset.rewardFragment = String(view.fragments);
    }
    const words = document.createElement('div');
    words.textContent = text;
    row.append(words);
    panel.append(row);
  });
  return panel;
}
