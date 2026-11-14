import type { BaseStats, GameType } from '../domain';
import { type ArtLookup, spriteTile } from './cardView';
import { pokemonName } from './names';
import { STAT_ROWS } from './statBars';

/**
 * The collection (4G-I, Phase 5): a Pokédex of every Pokémon the gacha can give. Owned ones show
 * their sphere, permanent level and candies; seen ones a dark silhouette and their name; the rest
 * "???". Tapping an owned one opens its card: base stats, the level it starts a run at, and the
 * button that spends candies on its next permanent level. The rules are the meta's (collection.ts).
 */
export interface DexTile {
  readonly species: string;
  readonly state: 'owned' | 'seen' | 'unknown';
  readonly type: GameType | undefined;
  readonly level: number;
  readonly candies: number;
  readonly nextCost: number;
  readonly startLevel: number;
  readonly stats: BaseStats | undefined;
}

function el(tag: string, css: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

const BUTTON =
  'pointer-events:auto;padding:8px 14px;border:2px solid #5b6aa8;border-radius:10px;' +
  'background:#1b2540;color:inherit;font:inherit;cursor:pointer;';

export class CollectionScreen {
  private readonly root: HTMLElement;

  constructor(
    host: HTMLElement,
    private readonly art: ArtLookup,
  ) {
    this.root = el(
      'div',
      'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
        'justify-content:flex-start;gap:8px;background:#0b0e24f2;text-align:center;' +
        'font-family:system-ui,sans-serif;color:#e8ecf8;padding:12px;box-sizing:border-box;overflow-y:auto;',
    );
    this.root.dataset.screen = 'collection';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.root);
  }

  show(
    tiles: readonly DexTile[],
    counts: { readonly seen: number; readonly owned: number; readonly total: number },
    selected: string | null,
    onSelect: (species: string) => void,
    onLevelUp: (species: string) => void,
    onBack: () => void,
  ): void {
    const back = el('button', BUTTON, 'Volver (M)');
    back.dataset.action = 'back';
    back.addEventListener('click', onBack);
    const header = el(
      'div',
      'font-size:15px;opacity:0.9;',
      `Vistos ${counts.seen} · conseguidos ${counts.owned} de ${counts.total}`,
    );
    header.dataset.dexCounts = `${counts.seen}/${counts.owned}/${counts.total}`;
    const rows: HTMLElement[] = [el('div', 'font-size:30px;font-weight:800;', 'Colección'), header];
    const chosen = tiles.find((t) => t.species === selected && t.state === 'owned');
    if (chosen !== undefined) rows.push(this.card(chosen, onLevelUp));
    const grid = el(
      'div',
      'display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:6px;width:min(96vw,720px);',
    );
    for (const tile of tiles) {
      const cell = el(
        'button',
        `${BUTTON}padding:4px;display:flex;flex-direction:column;align-items:center;gap:2px;` +
          `border-color:${tile.species === selected ? '#ffd54f' : '#2a3366'};`,
      );
      cell.dataset.dex = tile.species;
      cell.dataset.dexState = tile.state;
      if (tile.state === 'unknown') {
        cell.append(el('div', 'font-size:22px;height:48px;line-height:48px;opacity:0.5;', '?'));
        cell.append(el('div', 'font-size:11px;opacity:0.5;', '???'));
      } else {
        const picture = spriteTile(
          this.art.spriteUrl(tile.species),
          tile.species,
          tile.type,
          44,
          undefined,
          true,
        );
        // A seen one is only its silhouette.
        if (tile.state === 'seen') picture.style.filter = 'brightness(0) opacity(0.55)';
        cell.append(
          picture,
          el('div', 'font-size:11px;font-weight:700;', pokemonName(tile.species)),
        );
        if (tile.state === 'owned') {
          cell.append(
            el('div', 'font-size:10px;color:#ffd54f;', `Nv ${tile.level} · 🍬${tile.candies}`),
          );
          cell.addEventListener('click', () => onSelect(tile.species));
        }
      }
      grid.append(cell);
    }
    this.root.replaceChildren(...rows, back, grid);
    this.root.style.display = 'flex';
  }

  private card(tile: DexTile, onLevelUp: (species: string) => void): HTMLElement {
    const card = el(
      'div',
      'display:flex;gap:12px;align-items:center;padding:8px 12px;border:3px solid #ffd54f;' +
        'background:#10142a;text-align:left;max-width:96vw;flex-wrap:wrap;justify-content:center;',
    );
    card.dataset.dexCard = tile.species;
    const info = el('div', 'display:flex;flex-direction:column;gap:3px;font-size:13px;');
    info.append(
      el('div', 'font-size:20px;font-weight:800;', pokemonName(tile.species)),
      el(
        'div',
        '',
        `Nivel permanente ${tile.level} · empieza las partidas en Nv ${tile.startLevel}`,
      ),
      el('div', '', `Caramelos: ${tile.candies}`),
    );
    if (tile.stats !== undefined) {
      const stats = tile.stats;
      info.append(
        el(
          'div',
          'font-size:11px;opacity:0.85;',
          STAT_ROWS.map((row) => `${row.label} ${stats[row.key]}`).join(' · '),
        ),
      );
    }
    const can = tile.candies >= tile.nextCost;
    const up = el(
      'button',
      `${BUTTON}border-color:#ffd54f;opacity:${can ? 1 : 0.5};`,
      Number.isFinite(tile.nextCost)
        ? `Subir a Nv ${tile.level + 1} (${tile.nextCost} caramelos)`
        : 'Nivel máximo',
    ) as HTMLButtonElement;
    up.dataset.action = 'levelUp';
    up.disabled = !can;
    up.addEventListener('click', () => onLevelUp(tile.species));
    info.append(up);
    card.append(
      spriteTile(this.art.spriteUrl(tile.species), tile.species, tile.type, 80, undefined, true),
      info,
    );
    return card;
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}
