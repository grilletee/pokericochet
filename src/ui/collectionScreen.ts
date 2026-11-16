import { type BaseStats, GAME_TYPES, type GameType } from '../domain';
import { typeName } from './cardText';
import type { ArtLookup } from './cardView';
import { RARITY_COLORS, type StarCount, stars } from './gachaText';
import { pokemonName } from './names';
import { cardBackground, dexNumber, pokeCard } from './pokeCard';
import { barPercent, STAT_ROWS } from './statBars';
import { TYPE_COLORS } from './typeColors';
import { typeIcon, typeIcons } from './typeIcons';

/**
 * The collection as a visual Pokédex (4G-I; 4G-J, block 6): a grid of cards of every Pokémon the
 * gacha can give, with filters by type and by generation and "only mine"; owned ones in the colours
 * of their types, seen ones as a silhouette, the rest "???". The card of the chosen one shows its
 * sprite and its last form, types, rarity and region, base stats, its permanent level and candies,
 * and the button that spends candies on the next level. How candies come is one tap away. The rules
 * are the meta's (collection.ts); this only shows them.
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
  /** 4G-J: its Pokédex number, generation and region, types, rarity and last form. */
  readonly dex?: number;
  readonly gen?: number;
  readonly region?: string;
  readonly types?: readonly GameType[];
  readonly stars?: StarCount;
  readonly final?: string;
}

function el(tag: string, css: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

const BUTTON =
  'pointer-events:auto;padding:6px 12px;border:2px solid #5b6aa8;border-radius:10px;' +
  'background:#1b2540;color:inherit;font:inherit;cursor:pointer;';

interface Filters {
  type: GameType | null;
  gen: number | null;
  mine: boolean;
  help: boolean;
}

/** The tiles a filter keeps, in Pokédex order. Pure. */
export function filterDex(
  tiles: readonly DexTile[],
  filters: { readonly type: GameType | null; readonly gen: number | null; readonly mine: boolean },
): DexTile[] {
  return tiles.filter(
    (t) =>
      (filters.type === null ||
        (t.types ?? (t.type === undefined ? [] : [t.type])).includes(filters.type)) &&
      (filters.gen === null || t.gen === filters.gen) &&
      (!filters.mine || t.state === 'owned'),
  );
}

export class CollectionScreen {
  private readonly root: HTMLElement;
  private readonly filters: Filters = { type: null, gen: null, mine: false, help: false };

  constructor(
    host: HTMLElement,
    private readonly art: ArtLookup,
  ) {
    this.root = el(
      'div',
      'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
        'justify-content:flex-start;gap:8px;background:#0b0e24f2;text-align:center;' +
        'font-family:system-ui,sans-serif;color:#e8ecf8;padding:10px;box-sizing:border-box;overflow-y:auto;',
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
    /** How candies are earned (4G-J, block 3), one line each. */
    candyHelp: readonly string[] = [],
  ): void {
    const again = (): void =>
      this.show(tiles, counts, selected, onSelect, onLevelUp, onBack, candyHelp);
    const f = this.filters;
    // The header: back, the title, the counts and the candies.
    const back = el('button', BUTTON, 'Volver (M)');
    back.dataset.action = 'back';
    back.addEventListener('click', onBack);
    const header = el(
      'div',
      'display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;padding-right:100px;',
    );
    const countLine = el(
      'div',
      'font-size:13px;opacity:0.9;',
      `Vistos ${counts.seen} · tuyos ${counts.owned} de ${counts.total}`,
    );
    countLine.dataset.dexCounts = `${counts.seen}/${counts.owned}/${counts.total}`;
    const helpButton = el('button', `${BUTTON}border-color:#ffd54f;`, '🍬 Caramelos');
    helpButton.dataset.action = 'candyHelp';
    helpButton.addEventListener('click', () => {
      f.help = !f.help;
      again();
    });
    header.append(
      back,
      el('div', 'font-size:28px;font-weight:800;', 'Pokédex'),
      countLine,
      helpButton,
    );
    const rows: HTMLElement[] = [header];
    if (candyHelp.length > 0 && (f.help || counts.owned <= 1)) {
      // Open by itself while the collection is new (the 17th playtest did not find it).
      const help = el(
        'div',
        'max-width:min(96vw,640px);text-align:left;font-size:12px;line-height:1.4;padding:6px 10px;' +
          'border:2px solid #ffd54f;background:#10142a;display:flex;flex-direction:column;gap:3px;',
      );
      help.dataset.candyHelp = '';
      help.append(el('div', 'font-weight:800;color:#ffd54f;', '🍬 ¿Cómo consigo caramelos?'));
      for (const line of candyHelp) help.append(el('div', '', line));
      rows.push(help);
    }
    // The card of the chosen one.
    const chosen = tiles.find((t) => t.species === selected && t.state !== 'unknown');
    if (chosen !== undefined) rows.push(this.card(chosen, onLevelUp));
    // The filters: types, generations, only mine.
    rows.push(this.filterBar(tiles, again));
    const shown = filterDex(tiles, f);
    const grid = el(
      'div',
      'display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px;width:min(98vw,980px);',
    );
    grid.dataset.dexGrid = String(shown.length);
    for (const tile of shown) {
      const types = tile.types ?? (tile.type === undefined ? [] : [tile.type]);
      const card = pokeCard(
        {
          species: tile.species,
          types,
          dex: tile.dex ?? 0,
          state: tile.state,
          ...(tile.stars === undefined ? {} : { stars: tile.stars }),
          note: tile.state === 'owned' ? `Nv ${tile.level} · 🍬${tile.candies}` : '',
          selected: tile.species === selected,
        },
        this.art,
        56,
      );
      card.dataset.dex = tile.species;
      card.dataset.dexState = tile.state;
      if (tile.state !== 'unknown') card.addEventListener('click', () => onSelect(tile.species));
      grid.append(card);
    }
    if (shown.length === 0) {
      grid.append(
        el(
          'div',
          'grid-column:1/-1;opacity:0.7;font-size:13px;',
          'Ningún Pokémon con estos filtros.',
        ),
      );
    }
    this.root.replaceChildren(...rows, grid);
    this.root.style.display = 'flex';
  }

  private filterBar(tiles: readonly DexTile[], again: () => void): HTMLElement {
    const f = this.filters;
    const bar = el(
      'div',
      'display:flex;flex-direction:column;gap:4px;align-items:center;width:min(98vw,980px);',
    );
    const chip = (label: string, on: boolean, act: () => void, css = ''): HTMLElement => {
      const b = el(
        'button',
        `${BUTTON}padding:3px 8px;font-size:12px;opacity:${on ? 1 : 0.6};outline:${on ? '2px solid #ffd54f' : 'none'};${css}`,
        label,
      );
      b.addEventListener('click', () => {
        act();
        again();
      });
      return b;
    };
    const typeRow = el('div', 'display:flex;gap:3px;flex-wrap:wrap;justify-content:center;');
    typeRow.dataset.filterTypes = '';
    typeRow.append(chip('Todos', f.type === null, () => (f.type = null)));
    for (const type of GAME_TYPES) {
      const b = chip(
        '',
        f.type === type,
        () => (f.type = f.type === type ? null : type),
        'padding:2px 3px;',
      );
      b.dataset.filterType = type;
      b.title = typeName(type);
      b.append(typeIcon(type, 18));
      typeRow.append(b);
    }
    const genRow = el('div', 'display:flex;gap:3px;flex-wrap:wrap;justify-content:center;');
    genRow.dataset.filterGens = '';
    genRow.append(chip('Todas', f.gen === null, () => (f.gen = null)));
    const gens = [...new Set(tiles.map((t) => t.gen ?? 0))]
      .filter((g) => g > 0)
      .sort((a, b) => a - b);
    for (const gen of gens) {
      const region = tiles.find((t) => t.gen === gen)?.region ?? `Gen ${gen}`;
      const b = chip(region, f.gen === gen, () => (f.gen = f.gen === gen ? null : gen));
      b.dataset.filterGen = String(gen);
      genRow.append(b);
    }
    const mine = chip(
      f.mine ? '★ Solo los míos' : 'Solo los míos',
      f.mine,
      () => (f.mine = !f.mine),
    );
    mine.dataset.filterMine = '';
    genRow.append(mine);
    bar.append(typeRow, genRow);
    return bar;
  }

  /** The card of a Pokémon of the Pokédex: everything about it, and its next permanent level. */
  private card(tile: DexTile, onLevelUp: (species: string) => void): HTMLElement {
    const types = tile.types ?? (tile.type === undefined ? [] : [tile.type]);
    const owned = tile.state === 'owned';
    const card = el(
      'div',
      `display:flex;gap:12px;align-items:stretch;padding:8px;max-width:min(98vw,720px);flex-wrap:wrap;` +
        `justify-content:center;background:${cardBackground(types, tile.state)};color:#14172b;` +
        'box-shadow:0 0 0 3px #14172b,0 0 0 6px #ffd75a;text-align:left;',
    );
    card.dataset.dexCard = tile.species;
    // The pictures: the Pokémon and the last form of its line.
    const pics = el('div', 'display:flex;flex-direction:column;align-items:center;gap:4px;');
    const big = el(
      'div',
      'width:120px;height:120px;background:radial-gradient(circle,#ffffffee 0,#ffffff66 55%,transparent 72%);display:flex;align-items:center;justify-content:center;',
    );
    const url = this.art.spriteUrl(tile.species);
    if (url !== undefined) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = pokemonName(tile.species);
      img.style.cssText = `width:120px;height:120px;image-rendering:pixelated;${owned ? '' : 'filter:brightness(0) opacity(0.6);'}`;
      big.append(img);
    }
    pics.append(big);
    if (owned && tile.final !== undefined && tile.final !== tile.species) {
      const finalUrl = this.art.spriteUrl(tile.final);
      const evo = el(
        'div',
        'display:flex;align-items:center;gap:4px;font-size:11px;font-weight:700;',
      );
      evo.append(el('span', '', '→'));
      if (finalUrl !== undefined) {
        const img = document.createElement('img');
        img.src = finalUrl;
        img.alt = pokemonName(tile.final);
        img.style.cssText = 'width:48px;height:48px;image-rendering:pixelated;';
        evo.append(img);
      }
      evo.append(el('span', '', pokemonName(tile.final)));
      pics.append(evo);
    }
    // The words.
    const info = el(
      'div',
      'display:flex;flex-direction:column;gap:4px;flex:1 1 240px;background:#f6f3e8ee;padding:8px;font-size:12px;',
    );
    const title = el('div', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;');
    title.append(
      el('span', 'font-size:20px;font-weight:800;', pokemonName(tile.species)),
      el('span', 'opacity:0.6;', dexNumber(tile.dex ?? 0)),
      typeIcons(types, 18),
    );
    if (tile.stars !== undefined) {
      title.append(
        el(
          'span',
          `color:${RARITY_COLORS[tile.stars]};text-shadow:1px 1px 0 #14172b;font-size:14px;`,
          stars(tile.stars),
        ),
      );
    }
    info.append(title);
    info.append(
      el(
        'div',
        'opacity:0.8;',
        `${types.map(typeName).join(' / ')}${tile.region === undefined ? '' : ` · ${tile.region}`}`,
      ),
    );
    if (tile.stats !== undefined) {
      const stats = tile.stats;
      const table = el(
        'div',
        'display:grid;grid-template-columns:auto 1fr auto;gap:2px 6px;align-items:center;',
      );
      for (const row of STAT_ROWS) {
        const value = stats[row.key];
        const track = el('div', 'height:7px;background:#14172b33;');
        track.append(
          el(
            'div',
            `width:${barPercent(value)}%;height:100%;background:${TYPE_COLORS[types[0] ?? 'normal']};box-shadow:inset 0 -2px 0 #14172b55;`,
          ),
        );
        table.append(
          el('div', 'font-size:11px;', row.label),
          track,
          el('div', 'font-size:11px;', String(value)),
        );
      }
      info.append(table);
    }
    if (owned) {
      info.append(
        el(
          'div',
          'font-weight:700;',
          `Nivel permanente ${tile.level} · empieza las partidas en Nv ${tile.startLevel}`,
        ),
        el('div', '', `🍬 Caramelos: ${tile.candies}`),
      );
      const can = tile.candies >= tile.nextCost;
      const up = el(
        'button',
        `${BUTTON}border-color:#ffd54f;opacity:${can ? 1 : 0.55};`,
        Number.isFinite(tile.nextCost)
          ? `Subir a Nv ${tile.level + 1} (${tile.nextCost} caramelos)`
          : 'Nivel máximo',
      ) as HTMLButtonElement;
      up.dataset.action = 'levelUp';
      up.disabled = !can;
      up.addEventListener('click', () => onLevelUp(tile.species));
      info.append(up);
    } else {
      info.append(
        el(
          'div',
          'font-weight:700;',
          'Lo has visto, pero aún no es tuyo: sale en el Gacha, o regístralo si lo capturas y derrotas a un jefe.',
        ),
      );
    }
    card.append(pics, info);
    return card;
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}
