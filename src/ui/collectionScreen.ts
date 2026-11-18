import type { BaseStats, GameType } from '../domain';
import { typeName } from './cardText';
import type { ArtLookup } from './cardView';
import {
  type GoalView,
  goalLine,
  nextLevelLine,
  PERMANENT_INTRO,
  startNowLine,
} from './collectionText';
import { DexBrowser } from './dexBrowser';
import { type DexItem, EMPTY_QUERY, queryDex } from './dexQuery';
import { RARITY_COLORS, type StarCount, stars } from './gachaText';
import { pokemonName } from './names';
import { pixelNumber } from './pixelNumber';
import { cardBackground, dexNumber, pokeCard } from './pokeCard';
import { barPercent, STAT_ROWS } from './statBars';
import { TYPE_COLORS } from './typeColors';
import { typeIcons } from './typeIcons';

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
  /** 4X: `caught` is a boss captured in a run that you do not own (only the gacha gives it). */
  readonly state: 'owned' | 'caught' | 'seen' | 'unknown';
  /** 4X: how many times it was captured as a boss in a run. */
  readonly caught?: number;
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
  /** 4W, block 4: what each permanent level gives (the meta's `permanentLadder`). */
  readonly ladder?: readonly LadderView[];
  /** The next permanent level that makes it start stronger (null: none left). */
  readonly goal?: GoalView | null;
  /** How to get its candies, in one line. */
  readonly how?: string;
}

export interface LadderView {
  readonly level: number;
  readonly startLevel: number;
  readonly form: string;
  readonly milestone: boolean;
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

/** A tile of the Pokédex as the search and filters of `dexQuery` see it (4W, block 5). */
export type DexTileItem = DexItem & { readonly tile: DexTile };

export function dexItemOf(tile: DexTile): DexTileItem {
  return {
    species: tile.species,
    state: tile.state,
    types: tile.types ?? (tile.type === undefined ? [] : [tile.type]),
    dex: tile.dex ?? 0,
    ...(tile.gen === undefined ? {} : { gen: tile.gen }),
    ...(tile.stars === undefined ? {} : { stars: tile.stars }),
    level: tile.level,
    candies: tile.candies,
    nextCost: tile.nextCost,
    ...(tile.final === undefined ? {} : { final: tile.final }),
    tile,
  };
}

/** The tiles a filter of the 4G-J Pokédex keeps, in Pokédex order (now a `queryDex`). Pure. */
export function filterDex(
  tiles: readonly DexTile[],
  filters: { readonly type: GameType | null; readonly gen: number | null; readonly mine: boolean },
): DexTile[] {
  return queryDex(tiles.map(dexItemOf), {
    ...EMPTY_QUERY,
    type: filters.type,
    gen: filters.gen,
    state: filters.mine ? 'owned' : 'all',
  }).map((item) => item.tile);
}

export class CollectionScreen {
  private readonly root: HTMLElement;
  private help = false;
  private lastSelected: string | null = null;
  /** The search, filters and order of the grid; kept while the screen is redrawn (4W, block 5). */
  private readonly browser: DexBrowser<DexTileItem>;

  constructor(
    host: HTMLElement,
    private readonly art: ArtLookup,
  ) {
    this.browser = new DexBrowser<DexTileItem>({
      regionOf: (gen) => this.regions.get(gen) ?? `Gen ${gen}`,
    });
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
    /** 4W, block 4: a first-time notice, shown at the top until the screen is drawn again. */
    notice: string | null = null,
  ): void {
    const again = (): void =>
      this.show(tiles, counts, selected, onSelect, onLevelUp, onBack, candyHelp);
    for (const tile of tiles) {
      if (tile.gen !== undefined && tile.region !== undefined)
        this.regions.set(tile.gen, tile.region);
    }
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
      this.help = !this.help;
      again();
    });
    header.append(
      back,
      el('div', 'font-size:28px;font-weight:800;', 'Pokédex'),
      countLine,
      helpButton,
    );
    const rows: HTMLElement[] = [header];
    if (notice !== null) {
      const tip = el(
        'div',
        'max-width:min(96vw,640px);font-size:13px;font-weight:700;padding:8px 12px;color:#14172b;' +
          'background:#ffd75a;box-shadow:0 0 0 3px #14172b;',
        `💡 ${notice}`,
      );
      tip.dataset.firstTip = 'collection';
      rows.push(tip);
    }
    if (candyHelp.length > 0 && (this.help || counts.owned <= 1)) {
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
    // The grid with its search, filters and order (4W, block 5).
    this.browser.show(tiles.map(dexItemOf), (item) => {
      const tile = item.tile;
      const card = pokeCard(
        {
          species: tile.species,
          types: item.types,
          dex: item.dex,
          state: tile.state,
          ...(tile.stars === undefined ? {} : { stars: tile.stars }),
          note:
            tile.state === 'owned'
              ? `Nv ${tile.level} · 🍬${tile.candies}`
              : tile.state === 'caught'
                ? `Capturado ×${tile.caught ?? 1}`
                : '',
          selected: tile.species === selected,
        },
        this.art,
        56,
      );
      card.dataset.dex = tile.species;
      card.dataset.dexState = tile.state;
      if (tile.state !== 'unknown') card.addEventListener('click', () => onSelect(tile.species));
      return card;
    });
    this.root.replaceChildren(...rows, this.browser.root);
    this.root.style.display = 'flex';
    // A new sheet opens at the top, where it is drawn (the card tapped may be far down the grid).
    if (selected !== this.lastSelected && selected !== null) this.root.scrollTop = 0;
    this.lastSelected = selected;
  }

  /** Region names by generation, from the tiles. */
  private readonly regions = new Map<number, string>();

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
      // 4X: one captured in a run shows in colour; one only seen is a silhouette.
      img.style.cssText = `width:120px;height:120px;image-rendering:pixelated;${owned || tile.state === 'caught' ? '' : 'filter:brightness(0) opacity(0.6);'}`;
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
    if (tile.state === 'caught' || (owned && (tile.caught ?? 0) > 0)) {
      // 4X: the mark of the captured bosses; for good it only comes from the gacha.
      const mark = el(
        'div',
        'font-weight:700;padding:4px 6px;background:#3f66d0;color:#f6f3e8;',
        owned
          ? `Capturado ${tile.caught ?? 1} ${tile.caught === 1 ? 'vez' : 'veces'} en partida`
          : `Capturado ${tile.caught ?? 1} ${tile.caught === 1 ? 'vez' : 'veces'} en partida · para tenerlo siempre, consíguelo en el Gacha`,
      );
      mark.dataset.dexCaught = String(tile.caught ?? 1);
      info.append(mark);
    }
    if (owned) {
      info.append(this.progress(tile));
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

  /**
   * The permanent level of a Pokémon, explained (4W, block 4): what it is, a ladder of the ten
   * levels where the ones that make it start stronger show the form and level it starts at, where it
   * starts now, the next milestone and the candies missing, and how to get them.
   */
  private progress(tile: DexTile): HTMLElement {
    const box = el(
      'div',
      'display:flex;flex-direction:column;gap:5px;padding:6px;background:#14172b;color:#f6f3e8;' +
        'box-shadow:inset 0 0 0 2px #ffd75a;',
    );
    box.dataset.permanent = String(tile.level);
    const head = el('div', 'display:flex;align-items:center;gap:6px;font-weight:800;');
    head.append(
      el('span', 'color:#ffd75a;letter-spacing:1px;font-size:11px;', 'NIVEL PERMANENTE'),
      pixelNumber(`${tile.level}/10`, '#ffd75a', 2),
      el('span', 'margin-left:auto;font-size:12px;', '🍬'),
      pixelNumber(String(tile.candies), '#f6f3e8', 2),
    );
    box.append(head, el('div', 'font-size:11px;opacity:0.85;line-height:1.35;', PERMANENT_INTRO));
    const ladder = tile.ladder ?? [];
    if (ladder.length > 0) {
      const row = el(
        'div',
        `display:grid;grid-template-columns:repeat(${ladder.length},1fr);gap:2px;align-items:end;`,
      );
      row.dataset.ladder = ladder.map((s) => s.startLevel).join(',');
      for (const step of ladder) {
        const reached = step.level <= tile.level;
        const current = step.level === tile.level;
        const cell = el(
          'div',
          'display:flex;flex-direction:column;align-items:center;gap:1px;padding:2px 0;' +
            `background:${reached ? '#ffd75a33' : '#ffffff0d'};` +
            `box-shadow:${current ? 'inset 0 0 0 2px #ffd75a' : 'none'};`,
        );
        cell.dataset.ladderStep = String(step.level);
        if (step.milestone || step.level === 1) {
          const url = this.art.spriteUrl(step.form);
          if (url !== undefined) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = pokemonName(step.form);
            img.title = `Nivel permanente ${step.level}: empieza en Nv ${step.startLevel} como ${pokemonName(step.form)}`;
            img.style.cssText = `width:30px;height:30px;image-rendering:pixelated;${reached ? '' : 'filter:brightness(0) opacity(0.45);'}`;
            cell.append(img);
          }
          const lv = el('div', 'display:flex;align-items:center;font-size:9px;gap:1px;', 'Nv');
          lv.append(pixelNumber(String(step.startLevel), reached ? '#ffd75a' : '#9aa6c0', 1));
          cell.append(lv);
        }
        cell.append(pixelNumber(String(step.level), reached ? '#f6f3e8' : '#5b6aa8', 1.5));
        row.append(cell);
      }
      box.append(row);
      const now = ladder.find((s) => s.level === tile.level);
      if (now !== undefined) {
        box.append(
          el('div', 'font-weight:700;font-size:12px;', startNowLine(now.startLevel, now.form)),
        );
      }
    }
    if (tile.goal !== undefined) {
      const goal = el('div', 'font-size:12px;color:#ffd75a;', goalLine(tile.goal));
      goal.dataset.goal = tile.goal === null ? 'none' : `${tile.goal.level}/${tile.goal.missing}`;
      box.append(goal);
    }
    box.append(
      el(
        'div',
        'font-size:11px;opacity:0.9;',
        nextLevelLine(tile.level, tile.candies, tile.nextCost),
      ),
    );
    if (tile.how !== undefined) box.append(el('div', 'font-size:11px;opacity:0.75;', tile.how));
    return box;
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}
