import { GAME_TYPES, type GameType } from '../domain';
import { typeName } from './cardText';
import {
  activeFilters,
  type DexItem,
  type DexQuery,
  type DexSort,
  type DexStateFilter,
  EMPTY_QUERY,
  queryDex,
  sortDex,
} from './dexQuery';
import { RARITY_COLORS } from './gachaText';
import { pixelNumber } from './pixelNumber';
import { typeIcon } from './typeIcons';

/**
 * A grid of Pokémon with a search, filters and an order (4W, block 5): the Pokédex and the choice of
 * a starter show the same one. The controls are a pixel panel above the grid: a search box (by name,
 * by the name of its last form or by number), the order (number, level, rarity, name), and the
 * filters by type, region, rarity, state, raised level and candies to spend. On a narrow screen the
 * filters fold under one button that counts how many are on. The query lives in the browser, so it
 * is kept while the screen is redrawn (after choosing a card, after raising a level).
 */
export interface DexBrowserOptions {
  /** The name of a region by its generation. */
  readonly regionOf: (gen: number) => string;
  /** The choice of a starter: every card is yours, so there is no filter of state or "???". */
  readonly ownedOnly?: boolean;
  /** Smallest width of a card in the grid. */
  readonly cardWidth?: number;
  readonly empty?: string;
  /** Below this many items there is nothing to search: the controls hide (the first choice). */
  readonly minForControls?: number;
  /** The data attribute (camel case) that says how many cards are shown; `dexGrid` by default. */
  readonly gridName?: string;
}

const PANEL =
  'display:flex;flex-direction:column;gap:6px;padding:8px;background:#10142a;' +
  'box-shadow:0 0 0 3px #05060f,0 0 0 5px #3b4a8a;width:min(98vw,980px);box-sizing:border-box;';
const CHIP =
  'pointer-events:auto;padding:3px 8px;border:2px solid #3b4a8a;background:#1b2540;color:#e8ecf8;' +
  'font:inherit;font-size:12px;cursor:pointer;line-height:1.2;';
const ON = 'border-color:#ffd75a;background:#2a3a6a;box-shadow:inset 0 -3px 0 #ffd75a;';

function el(tag: string, css: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

const SORTS: readonly { readonly id: DexSort; readonly label: string }[] = [
  { id: 'number', label: 'Nº' },
  { id: 'level', label: 'Nivel' },
  { id: 'rarity', label: 'Rareza' },
  { id: 'name', label: 'Nombre' },
];

const STATES: readonly { readonly id: DexStateFilter; readonly label: string }[] = [
  { id: 'owned', label: 'Míos' },
  { id: 'seen', label: 'Vistos' },
  { id: 'missing', label: 'Me faltan' },
];

export class DexBrowser<T extends DexItem> {
  readonly root: HTMLElement;
  private query: DexQuery = EMPTY_QUERY;
  private sort: DexSort = 'number';
  /** The filters panel is open (always on a wide screen). */
  private open = false;
  private items: readonly T[] = [];
  private cardOf: (item: T) => HTMLElement = () => document.createElement('div');
  private readonly search: HTMLInputElement;
  private readonly bar: HTMLElement;
  private readonly filters: HTMLElement;
  private readonly count: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly panel: HTMLElement;

  constructor(private readonly options: DexBrowserOptions) {
    this.root = el(
      'div',
      'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;',
    );
    this.root.dataset.dexBrowser = '';
    const panel = el('div', PANEL);
    this.panel = panel;
    this.search = document.createElement('input');
    this.search.type = 'search';
    this.search.placeholder = 'Buscar por nombre o número';
    this.search.setAttribute('aria-label', 'Buscar Pokémon por nombre o número');
    this.search.dataset.dexSearch = '';
    this.search.style.cssText =
      'pointer-events:auto;flex:1 1 180px;min-width:0;padding:6px 8px;border:2px solid #5b6aa8;' +
      'background:#0b0e24;color:#f6f3e8;font:inherit;font-size:14px;outline:none;';
    this.search.addEventListener('input', () => {
      this.query = { ...this.query, text: this.search.value };
      this.renderBar();
      this.renderGrid();
    });
    // The keys typed here are words, not the game's shortcuts (M for the menu, the digits...).
    this.search.addEventListener('keydown', (e) => e.stopPropagation());
    this.search.addEventListener('keyup', (e) => e.stopPropagation());
    // The search box sits in a row of its own that is never rebuilt, so typing keeps the focus;
    // only the buttons beside it (`bar`) are drawn again.
    const top = el('div', 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;');
    const icon = el('span', 'font-size:16px;', '🔍');
    icon.setAttribute('aria-hidden', 'true');
    this.bar = el('div', 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;');
    top.append(icon, this.search, this.bar);
    this.filters = el('div', 'display:flex;flex-direction:column;gap:5px;');
    this.filters.dataset.dexFilters = '';
    panel.append(top, this.filters);
    this.count = el('div', 'font-size:12px;opacity:0.85;display:flex;align-items:center;gap:4px;');
    this.count.dataset.dexShown = '';
    this.grid = el(
      'div',
      `display:grid;grid-template-columns:repeat(auto-fill,minmax(${options.cardWidth ?? 88}px,1fr));` +
        'gap:8px;width:min(98vw,980px);',
    );
    this.root.append(panel, this.count, this.grid);
  }

  /** Shows these items, each drawn by `cardOf`, with the query of the last time. */
  show(items: readonly T[], cardOf: (item: T) => HTMLElement): void {
    this.items = items;
    this.cardOf = cardOf;
    this.open = this.open || (typeof window !== 'undefined' && window.innerWidth >= 760);
    const controls = items.length >= (this.options.minForControls ?? 0);
    this.panel.style.display = controls ? 'flex' : 'none';
    this.count.style.display = controls ? 'flex' : 'none';
    if (!controls) {
      this.query = EMPTY_QUERY;
      this.search.value = '';
    }
    this.renderBar();
    this.renderFilters();
    this.renderGrid();
  }

  /** The items the query keeps, in order. */
  shown(): T[] {
    const query =
      this.options.ownedOnly === true ? { ...this.query, state: 'all' as const } : this.query;
    return sortDex(queryDex(this.items, query), this.sort);
  }

  private redraw(): void {
    this.renderBar();
    this.renderFilters();
    this.renderGrid();
  }

  private chip(label: string, on: boolean, act: () => void, css = ''): HTMLButtonElement {
    const b = el('button', `${CHIP}${on ? ON : ''}${css}`, label) as HTMLButtonElement;
    b.type = 'button';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.addEventListener('click', () => {
      act();
      this.redraw();
    });
    return b;
  }

  private renderBar(): void {
    const sort = el('div', 'display:flex;gap:2px;align-items:center;');
    sort.append(el('span', 'font-size:11px;opacity:0.75;margin-right:2px;', 'Orden'));
    for (const s of SORTS) {
      const b = this.chip(s.label, this.sort === s.id, () => (this.sort = s.id));
      b.dataset.sort = s.id;
      sort.append(b);
    }
    const on = activeFilters(this.query);
    const toggle = this.chip(
      this.open ? 'Filtros ▴' : `Filtros ▾${on > 0 ? ` (${on})` : ''}`,
      on > 0,
      () => (this.open = !this.open),
    );
    toggle.dataset.filtersToggle = this.open ? 'open' : 'closed';
    const clear = this.chip(`Limpiar${on > 0 ? ` (${on})` : ''}`, false, () => {
      this.query = EMPTY_QUERY;
      this.search.value = '';
    });
    clear.dataset.clearFilters = String(on);
    clear.disabled = on === 0;
    clear.style.opacity = on === 0 ? '0.45' : '1';
    if (this.search.value !== this.query.text) this.search.value = this.query.text;
    this.bar.replaceChildren(sort, toggle, clear);
  }

  private renderFilters(): void {
    this.filters.style.display = this.open ? 'flex' : 'none';
    if (!this.open) return;
    const q = this.query;
    const set = (patch: Partial<DexQuery>): void => {
      this.query = { ...this.query, ...patch };
    };
    const row = (label: string): HTMLElement => {
      const r = el('div', 'display:flex;gap:3px;flex-wrap:wrap;align-items:center;');
      r.append(el('span', 'font-size:11px;opacity:0.75;min-width:52px;text-align:left;', label));
      return r;
    };
    // Types: the icons.
    const types = row('Tipo');
    types.dataset.filterTypes = '';
    for (const type of GAME_TYPES) {
      const b = this.chip(
        '',
        q.type === type,
        () => set({ type: q.type === type ? null : type }),
        'padding:2px 3px;',
      );
      b.dataset.filterType = type;
      b.title = typeName(type as GameType);
      b.setAttribute('aria-label', typeName(type as GameType));
      b.append(typeIcon(type, 18));
      types.append(b);
    }
    // Regions, from the items themselves.
    const gens = row('Región');
    gens.dataset.filterGens = '';
    const present = [...new Set(this.items.map((i) => i.gen ?? 0))]
      .filter((g) => g > 0)
      .sort((a, b) => a - b);
    for (const gen of present) {
      const b = this.chip(this.options.regionOf(gen), q.gen === gen, () =>
        set({ gen: q.gen === gen ? null : gen }),
      );
      b.dataset.filterGen = String(gen);
      gens.append(b);
    }
    // Rarity, state, progress.
    const more = row('Rareza');
    for (const stars of [3, 4, 5] as const) {
      const b = this.chip(
        '★'.repeat(stars),
        q.stars === stars,
        () => set({ stars: q.stars === stars ? null : stars }),
        `color:${RARITY_COLORS[stars]};`,
      );
      b.dataset.filterStars = String(stars);
      more.append(b);
    }
    if (this.options.ownedOnly !== true) {
      more.append(el('span', 'width:8px;'));
      for (const s of STATES) {
        const b = this.chip(s.label, q.state === s.id, () =>
          set({ state: q.state === s.id ? 'all' : s.id }),
        );
        b.dataset.filterState = s.id;
        // The Pokédex of 4G-J called it "Solo los míos": the browser checks keep the name.
        if (s.id === 'owned') b.dataset.filterMine = '';
        more.append(b);
      }
    }
    more.append(el('span', 'width:8px;'));
    const raised = this.chip('▲ Nivel subido', q.raised, () => set({ raised: !q.raised }));
    raised.dataset.filterRaised = '';
    const canLevel = this.chip('🍬 Puede subir', q.canLevel, () => set({ canLevel: !q.canLevel }));
    canLevel.dataset.filterCanLevel = '';
    more.append(raised, canLevel);
    this.filters.replaceChildren(types, gens, more);
  }

  private renderGrid(): void {
    const shown = this.shown();
    this.grid.dataset[this.options.gridName ?? 'dexGrid'] = String(shown.length);
    this.grid.replaceChildren(...shown.map((item) => this.cardOf(item)));
    if (shown.length === 0) {
      this.grid.append(
        el(
          'div',
          'grid-column:1/-1;opacity:0.75;font-size:13px;padding:12px;',
          this.options.empty ?? 'Ningún Pokémon con estos filtros.',
        ),
      );
    }
    this.count.replaceChildren(
      pixelNumber(String(shown.length), '#ffd75a', 1.5),
      el('span', '', `de ${this.items.length}`),
    );
  }
}
