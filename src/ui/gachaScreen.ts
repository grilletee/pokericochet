import type { GameType } from '../domain';
import type { ArtLookup } from './cardView';
import {
  bannerColors,
  endsText,
  type PityNumbers,
  type PityRules,
  percent,
  pityLines,
  RARITY_COLORS,
  revealNote,
  rulesText,
  type StarCount,
  stars,
} from './gachaText';
import { pokemonName } from './names';
import { pokeCard } from './pokeCard';
import { typeIcons } from './typeIcons';

/**
 * The gacha screen (4G-J, block 1; ADR-057): a banner screen like the gacha games. The banners on the
 * left (the standard one and the limited ones of the week); the art of the chosen one with its
 * featured Pokémon big, in their last form; the pity counters; x1 and x10; the probability table, the
 * history and how it works; and the reveal, in the colour of the best rarity, with a flash of its own
 * for a ★5. The meta decides every draw (meta/gacha.ts); this only shows it. Coins of the game only.
 */

export interface FeaturedView {
  /** The first of its line (what you get) and its last form (what the banner shows). */
  readonly species: string;
  readonly final: string;
  readonly types: readonly GameType[];
  readonly stars: StarCount;
  readonly owned: boolean;
}

export interface GachaBannerView {
  readonly key: string;
  readonly kind: 'standard' | 'region' | 'type';
  readonly name: string;
  /** "Región de Kanto · 1.ª generación", "Tipo Fuego", "Todo el catálogo". */
  readonly theme: string;
  readonly gen?: number;
  readonly type?: GameType;
  readonly endsInDays: number | null;
  readonly featured5: readonly FeaturedView[];
  readonly featured4: readonly FeaturedView[];
  /** The standard banner shows some ★5 of the catalogue instead of featured ones. */
  readonly showcase: readonly FeaturedView[];
  readonly pity: PityNumbers;
}

export interface HistoryRow {
  readonly species: string;
  readonly stars: StarCount;
  readonly banner: string;
  readonly featured: boolean;
  readonly n: number;
}

export interface GachaView {
  readonly coins: number;
  readonly cost: number;
  readonly multi: number;
  readonly banners: readonly GachaBannerView[];
  readonly selected: number;
  readonly rules: PityRules;
  /** Base and long-run shares of each rarity (fractions), and draws per ★5 on average. */
  readonly rates: {
    readonly base: Readonly<Record<StarCount, number>>;
    readonly overall: Readonly<Record<StarCount, number>>;
    readonly drawsPerFive: number;
  };
  readonly repeatCandies: Readonly<Record<StarCount, number>>;
  readonly history: readonly HistoryRow[];
  readonly owned: number;
  readonly total: number;
}

export interface RevealCard {
  readonly species: string;
  readonly final: string;
  readonly type: GameType | undefined;
  /** 4G-J, block 6: both types and the Pokédex number, for its card. */
  readonly types?: readonly GameType[];
  readonly dex?: number;
  readonly stars: StarCount;
  readonly isNew: boolean;
  readonly candies: number;
  readonly featured: boolean;
}

export interface GachaActions {
  readonly onSelect: (index: number) => void;
  readonly onDraw: (count: number) => void;
  readonly onBack: () => void;
}

const CSS = `
[data-px-root] [data-screen="gacha"][data-gacha]{background:radial-gradient(ellipse at 50% 0%,#2b3a73 0,#14172b 70%) !important}
[data-gacha] .gx-tab{display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px !important;font-size:13px;text-align:left}
[data-px-root] [data-gacha] button.gx-tab{background:#1f2547 !important}
[data-px-root] [data-gacha] button.gx-tab[data-on="1"]{background:#3f66d0 !important;color:#fff !important}
[data-px-root] [data-gacha] button[data-draw]{background:linear-gradient(180deg,#ffe27a,#e0a92a) !important;color:#14172b !important;text-shadow:none !important;font-size:18px !important;padding:10px 18px !important;min-width:150px}
[data-px-root] [data-gacha] button[data-draw="10"]{background:linear-gradient(180deg,#ffd75a,#ff9a4a) !important}
[data-px-root] [data-gacha] button[data-draw]:disabled{filter:grayscale(0.8) brightness(0.7);cursor:not-allowed}
[data-px-root] [data-gacha] button.gx-link{background:#2b3a73 !important;font-size:13px !important;padding:6px 10px !important}
[data-gacha] .gx-art{position:relative;overflow:hidden;min-height:190px;height:clamp(190px,44vh,380px)}
[data-gacha] .gx-rays{position:absolute;inset:-60%;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,0.13) 0 9deg,transparent 9deg 22deg);animation:gx-spin 40s linear infinite}
[data-gacha] .gx-hero{position:absolute;bottom:0;image-rendering:pixelated;filter:drop-shadow(0 0 12px rgba(255,215,90,0.75)) drop-shadow(4px 4px 0 rgba(0,0,0,0.55));animation:gx-float 3.2s ease-in-out infinite}
[data-gacha] .gx-four{image-rendering:pixelated;filter:drop-shadow(0 0 6px rgba(192,123,255,0.9)) drop-shadow(3px 3px 0 rgba(0,0,0,0.5))}
[data-gacha] .gx-bar{height:8px;background:#2b3a73;box-shadow:0 0 0 2px #14172b}
[data-gacha] .gx-bar>div{height:100%}
[data-gacha-reveal]{position:absolute;inset:0;z-index:40;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#07091acc;color:#f6f3e8;text-align:center;padding:12px;box-sizing:border-box;overflow-y:auto}
[data-gacha-reveal] .gx-orb{width:120px;height:120px;border-radius:50% !important;animation:gx-shake 0.18s linear infinite,gx-grow 1.1s ease-in forwards}
[data-gacha-reveal] .gx-flash{position:absolute;inset:0;pointer-events:none;animation:gx-flash 0.9s ease-out forwards}
[data-gacha-reveal] .gx-card{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;background:#14172b;opacity:0;animation:gx-in 0.35s ease-out forwards}
[data-gacha-reveal] .gx-card img{image-rendering:pixelated}
[data-gacha-reveal] .gx-gold{animation:gx-in 0.35s ease-out forwards,gx-glow 1.2s ease-in-out infinite alternate}
@keyframes gx-spin{to{transform:rotate(360deg)}}
@keyframes gx-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes gx-shake{0%{translate:0 0}25%{translate:3px -2px}50%{translate:-3px 2px}75%{translate:2px 3px}100%{translate:0 0}}
@keyframes gx-grow{0%{scale:0.6}80%{scale:1.15}100%{scale:1.35;opacity:0.2}}
@keyframes gx-flash{0%{background:#fff;opacity:0}15%{opacity:1}100%{opacity:0}}
@keyframes gx-in{0%{opacity:0;transform:translateY(16px) scale(0.85)}100%{opacity:1;transform:none}}
@keyframes gx-glow{from{box-shadow:0 0 0 3px #ffd75a,0 0 12px 2px #ffd75a88}to{box-shadow:0 0 0 3px #fff3b0,0 0 26px 8px #ffd75acc}}
`;

let styled = false;
function installCss(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.dataset.gachaStyle = '';
  style.textContent = CSS;
  document.head.append(style);
}

function el(tag: string, css: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

function button(text: string, css = ''): HTMLButtonElement {
  const b = el(
    'button',
    `pointer-events:auto;cursor:pointer;font:inherit;${css}`,
    text,
  ) as HTMLButtonElement;
  b.type = 'button';
  return b;
}

export class GachaScreen {
  private readonly root: HTMLElement;
  private readonly reveal: HTMLElement;
  private panel: 'none' | 'rates' | 'history' | 'help' = 'none';
  private revealTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    host: HTMLElement,
    private readonly art: ArtLookup,
  ) {
    installCss();
    this.root = el(
      'div',
      'position:absolute;inset:0;display:none;flex-direction:column;gap:8px;color:#f6f3e8;' +
        'padding:10px;box-sizing:border-box;overflow-y:auto;font-family:system-ui,sans-serif;',
    );
    this.root.dataset.screen = 'gacha';
    this.root.dataset.gacha = '';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.reveal = el('div', '');
    this.reveal.dataset.gachaReveal = '';
    this.reveal.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.root, this.reveal);
  }

  private picture(species: string, height: number, cls: string): HTMLElement {
    const url = this.art.spriteUrl(species);
    if (url === undefined) {
      return el(
        'div',
        `height:${height}px;width:${height}px;display:flex;align-items:center;justify-content:center;font-size:${Math.round(height / 3)}px;`,
        pokemonName(species).charAt(0),
      );
    }
    const img = document.createElement('img');
    img.src = url;
    img.alt = pokemonName(species);
    img.draggable = false;
    img.className = cls;
    img.style.height = `${height}px`;
    img.style.width = `${height}px`;
    return img;
  }

  show(view: GachaView, actions: GachaActions): void {
    const banner = view.banners[view.selected] ?? view.banners[0];
    if (banner === undefined) return;
    const limited = banner.featured5.length > 0;

    // Header: the title, the coins, back.
    const coins = el(
      'div',
      'font-size:18px;font-weight:800;color:#ffd75a;display:flex;align-items:center;gap:6px;',
    );
    coins.append(
      el(
        'span',
        'display:inline-block;width:16px;height:16px;border-radius:50% !important;background:radial-gradient(circle at 35% 30%,#fff6c0,#ffd75a 45%,#c08a20);box-shadow:0 0 0 2px #14172b;',
      ),
      el('span', '', `${view.coins}`),
    );
    coins.dataset.coins = String(view.coins);
    const back = button('Volver (M)', 'padding:6px 12px;');
    back.dataset.action = 'back';
    back.addEventListener('click', actions.onBack);
    const header = el('div', 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;');
    // Back on the left: the sound toggle of the game sits on the top right corner.
    header.style.paddingRight = '110px';
    header.append(
      back,
      el('div', 'font-size:26px;font-weight:800;letter-spacing:1px;', 'Gacha'),
      el('div', 'font-size:12px;opacity:0.8;', `Tienes ${view.owned} de ${view.total}`),
      el('div', 'flex:1;', ''),
      coins,
    );

    // The banners, as tabs.
    const tabs = el(
      'div',
      'display:flex;flex-direction:column;gap:6px;flex:0 0 170px;min-width:0;',
    );
    view.banners.forEach((b, i) => {
      const tab = button('');
      tab.className = 'gx-tab';
      tab.dataset.gachaTab = b.key;
      tab.dataset.on = i === view.selected ? '1' : '0';
      const face = b.featured5[0] ?? b.showcase[0];
      if (face !== undefined) tab.append(this.picture(face.final, 34, ''));
      const words = el('div', 'display:flex;flex-direction:column;min-width:0;');
      words.append(
        el(
          'div',
          'font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
          b.name,
        ),
        el(
          'div',
          'font-size:10px;opacity:0.8;',
          b.endsInDays === null ? 'Permanente' : endsText(b.endsInDays),
        ),
      );
      tab.append(words);
      tab.addEventListener('click', () => {
        this.panel = 'none';
        actions.onSelect(i);
      });
      tabs.append(tab);
    });

    const main = el(
      'div',
      'display:flex;flex-direction:column;gap:8px;flex:1 1 320px;min-width:0;',
    );
    main.append(this.bannerArt(banner));

    // The pity counters, with bars.
    const pity = el('div', 'display:flex;flex-direction:column;gap:4px;font-size:13px;');
    pity.dataset.pity = `${banner.pity.toFive}/${banner.pity.toFour}/${banner.pity.toFeatured ?? '-'}`;
    const lines = pityLines(banner.pity, limited);
    const fills: [number, string][] = [
      [1 - banner.pity.toFive / view.rules.hardAt, RARITY_COLORS[5]],
      [1 - banner.pity.toFour / view.rules.fourEvery, RARITY_COLORS[4]],
      [
        banner.pity.toFeatured === null ? 1 : 1 - banner.pity.toFeatured / view.rules.featuredAt,
        '#ff7fb0',
      ],
    ];
    lines.forEach((line, i) => {
      const [fill, color] = fills[i] ?? [0, '#fff'];
      const row = el(
        'div',
        'display:grid;grid-template-columns:1fr 120px;gap:8px;align-items:center;',
      );
      const bar = el('div', '');
      bar.className = 'gx-bar';
      bar.append(
        el(
          'div',
          `width:${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%;background:${color};`,
        ),
      );
      row.append(el('div', '', line), bar);
      pity.append(row);
    });
    main.append(pity);

    // The draw buttons and the panels.
    const draws = el(
      'div',
      'display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:center;',
    );
    for (const count of [1, view.multi]) {
      const price = view.cost * count;
      const b = button(`Tirar x${count} · ${price}`);
      b.dataset.draw = String(count);
      b.disabled = view.coins < price;
      b.addEventListener('click', () => {
        this.panel = 'none';
        actions.onDraw(count);
      });
      draws.append(b);
    }
    const links = el('div', 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;');
    for (const [id, label] of [
      ['rates', 'Probabilidades'],
      ['history', 'Historial'],
      ['help', 'Cómo funciona'],
    ] as const) {
      const b = button(label);
      b.className = 'gx-link';
      b.dataset.panel = id;
      b.addEventListener('click', () => {
        this.panel = this.panel === id ? 'none' : id;
        this.show(view, actions);
      });
      links.append(b);
    }
    main.append(draws);
    if (view.coins < view.cost) {
      main.append(
        el(
          'div',
          'font-size:12px;opacity:0.8;text-align:center;',
          'Juega partidas para ganar monedas: oleadas, jefes y victorias.',
        ),
      );
    }
    main.append(links);
    if (this.panel !== 'none') main.append(this.panelOf(this.panel, view, limited));

    const body = el('div', 'display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;');
    body.append(tabs, main);
    this.root.replaceChildren(header, body);
    this.root.style.display = 'flex';
  }

  private bannerArt(banner: GachaBannerView): HTMLElement {
    const [a, b] = bannerColors(banner.kind, banner.gen, banner.type);
    const art = el(
      'div',
      `background:radial-gradient(ellipse at 70% 60%,${a}cc 0,${a}55 35%,transparent 70%),` +
        `linear-gradient(135deg,${b} 0,#14172b 55%,${a}66 100%);box-shadow:0 0 0 3px #14172b,0 0 0 5px ${a};`,
    );
    art.className = 'gx-art';
    art.dataset.bannerArt = banner.key;
    const rays = el('div', '');
    rays.className = 'gx-rays';
    art.append(rays);
    // The heroes stand on the right 58 % of the art, the words keep the left: they never overlap.
    const heroes = banner.featured5.length > 0 ? banner.featured5 : banner.showcase.slice(0, 3);
    const stage = el(
      'div',
      'position:absolute;right:0;bottom:0;width:58%;height:100%;display:flex;' +
        'justify-content:flex-end;align-items:flex-end;',
    );
    heroes.forEach((hero, i) => {
      const img = this.picture(hero.final, 96, 'gx-hero');
      img.style.position = 'relative';
      img.style.height = banner.featured5.length > 0 ? '100%' : '78%';
      img.style.width = 'auto';
      img.style.maxWidth = `${Math.floor(100 / heroes.length)}%`;
      img.style.objectFit = 'contain';
      img.style.aspectRatio = '1';
      img.style.animationDelay = `${i * 0.4}s`;
      img.dataset.hero = hero.species;
      stage.append(img);
    });
    art.append(stage);
    // The words over the art.
    const words = el(
      'div',
      'position:absolute;left:12px;top:10px;width:42%;display:flex;flex-direction:column;gap:4px;text-shadow:3px 3px 0 #14172b;',
    );
    words.append(
      el(
        'div',
        'font-size:11px;letter-spacing:2px;opacity:0.9;',
        banner.endsInDays === null ? 'BANNER PERMANENTE' : 'BANNER LIMITADO',
      ),
      el('div', 'font-size:clamp(20px,4.2vw,34px);font-weight:800;line-height:1;', banner.name),
      el('div', 'font-size:12px;opacity:0.9;', `${banner.theme} · ${endsText(banner.endsInDays)}`),
    );
    const top = banner.featured5[0];
    if (top !== undefined) {
      const tag = el('div', 'margin-top:6px;display:flex;flex-direction:column;gap:2px;');
      tag.append(
        el(
          'div',
          `color:${RARITY_COLORS[5]};font-size:15px;letter-spacing:1px;`,
          `${stars(5)} DESTACADO`,
        ),
        el('div', 'font-size:clamp(16px,3vw,24px);font-weight:800;', pokemonName(top.final)),
        el(
          'div',
          'font-size:11px;opacity:0.9;',
          `Línea de ${pokemonName(top.species)}${top.owned ? ' · ya lo tienes' : ''}`,
        ),
      );
      tag.append(typeIcons(top.types, 18));
      words.append(tag);
    } else {
      words.append(
        el(
          'div',
          'font-size:12px;opacity:0.9;margin-top:6px;',
          'Todo el catálogo: cualquier Pokémon puede salir.',
        ),
      );
    }
    art.append(words);
    // The featured ★4, smaller, stand in front of the hero on its left (on the hero's stage, so
    // they never cover the words, however short the art is).
    if (banner.featured4.length > 0) {
      const fours = el(
        'div',
        'position:absolute;left:0;bottom:6px;display:flex;gap:4px;align-items:flex-end;z-index:1;',
      );
      for (const four of banner.featured4) {
        const card = el(
          'div',
          'display:flex;flex-direction:column;align-items:center;font-size:10px;text-shadow:2px 2px 0 #14172b;',
        );
        card.dataset.featured4 = four.species;
        card.append(
          this.picture(four.final, 60, 'gx-four'),
          el('div', `color:${RARITY_COLORS[4]};`, stars(4)),
          el('div', 'font-weight:700;white-space:nowrap;', pokemonName(four.final)),
        );
        fours.append(card);
      }
      stage.append(fours);
    }
    return art;
  }

  private panelOf(
    panel: 'rates' | 'history' | 'help',
    view: GachaView,
    limited: boolean,
  ): HTMLElement {
    const box = el(
      'div',
      'background:#14172b;padding:10px 12px;font-size:12px;display:flex;flex-direction:column;gap:6px;box-shadow:0 0 0 3px #3f66d0;',
    );
    box.dataset.gachaPanel = panel;
    if (panel === 'rates') {
      box.append(el('div', 'font-size:15px;font-weight:800;', 'Probabilidades'));
      const table = el('div', 'display:grid;grid-template-columns:auto 1fr 1fr;gap:4px 12px;');
      table.append(
        el('div', 'opacity:0.7;', 'Rareza'),
        el('div', 'opacity:0.7;', 'Base'),
        el('div', 'opacity:0.7;', 'Con el pity'),
      );
      for (const s of [5, 4, 3] as const) {
        table.append(
          el('div', `color:${RARITY_COLORS[s]};`, stars(s)),
          el('div', '', percent(view.rates.base[s])),
          el('div', '', percent(view.rates.overall[s])),
        );
      }
      box.append(
        table,
        el(
          'div',
          'opacity:0.85;',
          `De media, un ★5 cada ${Math.round(view.rates.drawsPerFive)} tiradas. ` +
            (limited
              ? `En este banner, cada ★5 es el destacado con un ${percent(view.rules.featuredShare / 10_000)}.`
              : 'En el estándar no hay destacados.'),
        ),
        el(
          'div',
          'opacity:0.85;',
          `Repetidos: ★3 +${view.repeatCandies[3]}, ★4 +${view.repeatCandies[4]}, ★5 +${view.repeatCandies[5]} caramelos.`,
        ),
      );
    } else if (panel === 'history') {
      box.append(el('div', 'font-size:15px;font-weight:800;', 'Historial'));
      if (view.history.length === 0) box.append(el('div', 'opacity:0.8;', 'Aún no has tirado.'));
      const list = el(
        'div',
        'display:flex;flex-direction:column;gap:2px;max-height:220px;overflow-y:auto;',
      );
      for (const row of view.history) {
        const line = el(
          'div',
          `display:grid;grid-template-columns:48px 52px 1fr auto;gap:6px;color:${row.stars === 3 ? '#c8d0e8' : RARITY_COLORS[row.stars]};`,
        );
        line.dataset.historyRow = row.species;
        line.append(
          el('div', 'opacity:0.7;', `#${row.n}`),
          el('div', '', stars(row.stars)),
          el(
            'div',
            'font-weight:700;',
            `${pokemonName(row.species)}${row.featured ? ' · destacado' : ''}`,
          ),
          el('div', 'opacity:0.7;', row.banner),
        );
        list.append(line);
      }
      box.append(list);
    } else {
      box.append(el('div', 'font-size:15px;font-weight:800;', 'Cómo funciona'));
      for (const line of rulesText(view.rules, limited)) box.append(el('div', '', line));
    }
    return box;
  }

  /** The reveal of one draw or a x10; `done` goes back to the banner. */
  showReveal(cards: readonly RevealCard[], done: () => void): void {
    if (this.revealTimer !== undefined) clearTimeout(this.revealTimer);
    const best = Math.max(3, ...cards.map((c) => c.stars)) as StarCount;
    const color = RARITY_COLORS[best];
    this.reveal.dataset.best = String(best);
    const orb = el(
      'div',
      `background:radial-gradient(circle at 35% 30%,#ffffff 0,${color} 40%,#14172b 100%);box-shadow:0 0 40px 10px ${color};`,
    );
    orb.className = 'gx-orb';
    const hint = el('div', 'font-size:13px;opacity:0.8;', 'Toca para saltar');
    this.reveal.replaceChildren(orb, hint);
    this.reveal.style.display = 'flex';
    const finish = (): void => {
      if (this.revealTimer !== undefined) clearTimeout(this.revealTimer);
      this.revealTimer = undefined;
      this.reveal.onclick = null;
      this.revealCards(cards, best, done);
    };
    this.reveal.onclick = finish;
    this.revealTimer = setTimeout(finish, 1100);
  }

  private revealCards(cards: readonly RevealCard[], best: StarCount, done: () => void): void {
    const nodes: HTMLElement[] = [];
    if (best === 5) {
      const flash = el('div', '');
      flash.className = 'gx-flash';
      nodes.push(flash);
      nodes.push(
        el(
          'div',
          `font-size:22px;font-weight:800;color:${RARITY_COLORS[5]};text-shadow:3px 3px 0 #14172b;letter-spacing:2px;`,
          '¡RAREZA MÁXIMA!',
        ),
      );
    }
    const big = cards.length === 1;
    const grid = el(
      'div',
      big
        ? 'display:flex;justify-content:center;'
        : 'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;width:min(96vw,720px);',
    );
    cards.forEach((card, i) => {
      const c = RARITY_COLORS[card.stars];
      const node = el('div', `box-shadow:0 0 0 3px ${c};animation-delay:${i * 0.09}s;`);
      node.className = card.stars === 5 ? 'gx-card gx-gold' : 'gx-card';
      node.dataset.revealCard = card.species;
      node.dataset.stars = String(card.stars);
      // 4G-J, block 6: the card of the Pokédex (its types as colours), inside the glow of its rarity.
      const face = pokeCard(
        {
          species: card.species,
          types: card.types ?? (card.type === undefined ? [] : [card.type]),
          dex: card.dex ?? 0,
          state: 'owned',
          stars: card.stars,
        },
        this.art,
        big ? 150 : 60,
      );
      face.tabIndex = -1;
      face.style.width = '100%';
      node.append(face);
      if (big && card.final !== card.species) {
        node.append(
          el('div', 'font-size:12px;opacity:0.8;', `Evoluciona hasta ${pokemonName(card.final)}`),
        );
      }
      if (card.featured)
        node.append(el('div', `font-size:${big ? 13 : 10}px;color:#ff7fb0;`, 'DESTACADO'));
      node.append(
        el(
          'div',
          `font-size:${big ? 14 : 10}px;font-weight:700;color:${card.isNew ? '#9fe86a' : '#c8d0e8'};`,
          revealNote(card.isNew, card.candies),
        ),
      );
      grid.append(node);
    });
    nodes.push(grid);
    const ok = button('Continuar', 'padding:8px 18px;font-size:16px;');
    ok.dataset.action = 'revealDone';
    ok.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideReveal();
      done();
    });
    nodes.push(ok);
    this.reveal.replaceChildren(...nodes);
    this.reveal.style.display = 'flex';
  }

  private hideReveal(): void {
    if (this.revealTimer !== undefined) clearTimeout(this.revealTimer);
    this.revealTimer = undefined;
    this.reveal.onclick = null;
    this.reveal.style.display = 'none';
  }

  hide(): void {
    this.hideReveal();
    this.root.style.display = 'none';
  }
}
