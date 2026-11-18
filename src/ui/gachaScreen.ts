import type { GameType } from '../domain';
import type { SoundId } from './audio';
import type { ArtLookup } from './cardView';
import { confetti, installCinema, kicker, motes, shadeHex, title } from './cinema';
import {
  anticipation,
  bannerColors,
  endsText,
  type PityNumbers,
  type PityRules,
  percent,
  pityLines,
  pityMeters,
  RARITY_COLORS,
  revealNote,
  revealTiming,
  rulesText,
  type StarCount,
  stars,
} from './gachaText';
import { pokemonName } from './names';
import { pixelNumber } from './pixelNumber';
import { pokeCard } from './pokeCard';
import { typeIcons } from './typeIcons';

/**
 * The gacha screen (4G-J, block 1; ADR-057; rebuilt as a banner screen of a finished gacha game in
 * 4V, block 3). The banners on the left (the standard one and the limited ones of the week); the art
 * of the chosen one, framed, with its featured Pokémon big in their last form standing on a floor,
 * its ribbon and its title; under it a control bar with the pity counters on the left and the big
 * draw buttons on the right; the probability table, the history and how it works; and the reveal:
 * an orb in the colour of the best rarity, then the cards dealt face down that turn one by one, a
 * ★4 or ★5 glowing through its back before it turns, and a white flash and gold rays for a ★5. The
 * meta decides every draw (meta/gacha.ts); this only shows it. Coins of the game only.
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

const INK = '#0b0d1a';

const CSS = `
[data-px-root] [data-screen="gacha"][data-gacha]{background:radial-gradient(ellipse at 50% 0%,#2b3a73 0,#14172b 60%,#0b0d1a 100%) !important}
[data-gacha] .gx-tab{display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px !important;font-size:13px;text-align:left;transition:transform 80ms steps(2)}
[data-px-root] [data-gacha] button.gx-tab{background:#1f2547 !important}
[data-px-root] [data-gacha] button.gx-tab:hover{transform:translateX(4px)}
[data-px-root] [data-gacha] button.gx-tab[data-on="1"]{background:#3f66d0 !important;color:#fff !important;transform:translateX(6px);box-shadow:0 0 0 3px ${INK},0 0 0 5px #ffd75a !important}
[data-px-root] [data-gacha] button[data-draw]{color:${INK} !important;text-shadow:none !important;padding:10px 22px !important;min-width:190px;
  display:flex !important;flex-direction:column;align-items:center;gap:2px;line-height:1.1;
  box-shadow:0 0 0 3px ${INK},inset 0 4px 0 0 rgba(255,255,255,0.45),inset 0 -5px 0 0 rgba(0,0,0,0.28),0 6px 0 0 ${INK} !important;
  transition:transform 60ms steps(2)}
[data-px-root] [data-gacha] button[data-draw="1"]{background:linear-gradient(180deg,#bfe0ff 0 50%,#8ec4ff 50% 100%) !important}
[data-px-root] [data-gacha] button[data-draw="10"]{background:linear-gradient(180deg,#ffe9a0 0 50%,#ffc84a 50% 100%) !important;min-width:220px}
[data-px-root] [data-gacha] button[data-draw]:hover{transform:translateY(-2px);filter:brightness(1.08)}
[data-px-root] [data-gacha] button[data-draw]:active{transform:translateY(5px);box-shadow:0 0 0 3px ${INK},inset 0 4px 0 0 rgba(0,0,0,0.2) !important}
[data-px-root] [data-gacha] button[data-draw]:disabled{filter:grayscale(0.85) brightness(0.65);cursor:not-allowed;transform:none}
[data-gacha] .gx-draw-n{font-size:22px;font-weight:700;letter-spacing:1px}
[data-gacha] .gx-draw-c{font-size:13px;display:flex;align-items:center;gap:4px}
[data-gacha] .gx-draw-g{font-size:11px;color:#7a2a00}
[data-px-root] [data-gacha] button.gx-link{background:#1f2547 !important;font-size:13px !important;padding:6px 10px !important}
[data-px-root] [data-gacha] button.gx-link[data-on="1"]{background:#3f66d0 !important}
[data-gacha] .gx-coin{display:inline-block;width:14px;height:14px;background:radial-gradient(circle at 35% 30%,#fff6c0,#ffd75a 45%,#c08a20);box-shadow:0 0 0 2px ${INK};border-radius:50% !important}
[data-gacha] .gx-art{position:relative;overflow:hidden;min-height:210px;height:clamp(210px,50vh,470px);
  box-shadow:0 0 0 3px ${INK},0 0 0 6px var(--gx-a),0 0 0 9px ${INK},inset 0 0 0 3px rgba(255,255,255,0.18),inset 0 -40px 60px -30px rgba(0,0,0,0.6)}
[data-gacha] .gx-rays{position:absolute;inset:-60%;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,0.12) 0 8deg,transparent 8deg 20deg);animation:gx-spin 48s steps(96) infinite}
[data-gacha] .gx-floor{position:absolute;left:0;right:0;bottom:0;height:22%;
  background:repeating-linear-gradient(90deg,rgba(255,255,255,0.06) 0 2px,transparent 2px 24px),linear-gradient(180deg,rgba(11,13,26,0) 0,rgba(11,13,26,0.55) 30%,rgba(11,13,26,0.85) 100%);
  box-shadow:0 -3px 0 0 rgba(255,255,255,0.12)}
[data-gacha] .gx-hero{position:absolute;bottom:4%;image-rendering:pixelated;filter:drop-shadow(0 0 0 #fff) drop-shadow(0 0 14px rgba(255,215,90,0.7)) drop-shadow(6px 6px 0 rgba(0,0,0,0.5));animation:gx-float 3.2s steps(16) infinite}
[data-gacha] .gx-four{image-rendering:pixelated;filter:drop-shadow(0 0 8px rgba(192,123,255,0.95)) drop-shadow(4px 4px 0 rgba(0,0,0,0.5));animation:gx-float 2.6s steps(12) infinite}
[data-gacha] .gx-ribbon{position:absolute;top:12px;right:-6px;z-index:2;padding:5px 14px 5px 12px;font-size:12px;font-weight:700;letter-spacing:1px;
  color:${INK};background:var(--gx-r);box-shadow:-4px 4px 0 0 ${INK}}
[data-gacha] .gx-plate{position:absolute;left:0;top:0;width:46%;height:100%;z-index:1;
  background:linear-gradient(90deg,rgba(11,13,26,0.82) 0,rgba(11,13,26,0.55) 70%,rgba(11,13,26,0) 100%)}
[data-gacha] .gx-panel{background:#14172b;box-shadow:0 0 0 3px ${INK},0 0 0 5px #2b3a73,inset 0 3px 0 0 rgba(255,255,255,0.08);padding:10px 12px}
[data-gacha] .gx-meter{display:grid;grid-template-columns:minmax(90px,auto) 1fr;gap:2px 10px;align-items:end}
[data-gacha] .gx-meter-n{font-size:28px;font-weight:700;line-height:1;text-shadow:3px 3px 0 ${INK}}
[data-gacha] .gx-seg{display:flex;gap:2px;height:10px;align-self:center}
[data-gacha] .gx-seg>i{flex:1;background:#2b3a73;box-shadow:0 0 0 1px ${INK}}
[data-gacha] .gx-hot .gx-meter-n{animation:gx-blink 0.8s steps(2) infinite}
[data-gacha-reveal]{position:absolute;inset:0;z-index:40;display:none;flex-direction:column;align-items:center;justify-content:safe center;gap:12px;
  background:radial-gradient(ellipse at 50% 45%,#1f2547 0,#07091a 70%);color:#f6f3e8;text-align:center;padding:12px;box-sizing:border-box;overflow:hidden auto;isolation:isolate}
[data-gacha-reveal] .gx-bg{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
[data-gacha-reveal] .gx-orb{width:132px;height:132px;border-radius:50% !important;animation:gx-shake 0.16s steps(2) infinite,gx-grow 1.1s steps(11) forwards}
/* 4W, block 6: the anticipation. The colour of everything is --orb, which climbs with the rarity. */
[data-gacha-reveal] .gx-stage{position:relative;width:220px;height:220px;display:flex;align-items:center;justify-content:center}
[data-gacha-reveal] .gx-sphere{position:relative;z-index:2;width:132px;height:132px;border-radius:50% !important;
  background:radial-gradient(circle at 35% 30%,#ffffff 0,var(--orb) 40%,#14172b 100%);
  box-shadow:0 0 0 4px ${INK},0 0 50px 14px var(--orb);animation:gx-fall 420ms steps(7) both}
[data-gacha-reveal] .gx-sphere.gx-landed{animation:gx-shake 0.16s steps(2) infinite}
[data-gacha-reveal] .gx-sphere.gx-hard{animation:gx-shake 0.07s steps(2) infinite}
[data-gacha-reveal] .gx-pad{position:absolute;bottom:4px;left:50%;width:200px;height:34px;margin-left:-100px;border-radius:50% !important;
  background:radial-gradient(ellipse,var(--orb) 0,transparent 70%);opacity:0.55}
[data-gacha-reveal] .gx-ring{position:absolute;left:50%;top:50%;width:132px;height:132px;margin:-66px 0 0 -66px;border-radius:50% !important;
  box-shadow:0 0 0 3px var(--orb),0 0 12px 2px var(--orb);opacity:0}
[data-gacha-reveal] .gx-charging .gx-ring{animation:gx-converge 520ms steps(6) infinite}
@keyframes gx-fall{from{translate:0 -70vh}to{translate:0 0}}
@keyframes gx-converge{0%{scale:2.4;opacity:0}30%{opacity:0.9}100%{scale:0.95;opacity:0}}
/* The screen of its own of a ★5 (4W): gold light, speed lines, the Pokémon big. */
[data-gacha-reveal] .gx-five{position:absolute;inset:0;z-index:6;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  background:radial-gradient(ellipse at 50% 45%,#5a4210 0,#1a1408 55%,#07091a 100%);overflow:hidden}
[data-gacha-reveal] .gx-five.gx-on{display:flex;animation:mx-in 0.2s steps(4) both}
[data-gacha-reveal] .gx-five .gx-lines{position:absolute;inset:-20%;opacity:0.35;
  background:repeating-linear-gradient(115deg,#ffd75a33 0 6px,transparent 6px 46px);animation:gx-lines 0.6s steps(6) infinite}
[data-gacha-reveal] .gx-five img{width:min(400px,52vh,80vw);height:min(400px,52vh,80vw);margin:-6vh 0;image-rendering:pixelated;
  filter:drop-shadow(0 0 0 #0b0d1a) drop-shadow(0 0 18px #ffd75a);animation:mx-bob 1.6s steps(8) infinite}
@keyframes gx-lines{to{background-position:46px 0}}
[data-gacha-reveal] .gx-flash{position:absolute;inset:0;pointer-events:none;background:#fff;opacity:0}
[data-gacha-reveal] .gx-flash.gx-on{animation:gx-flash 0.7s steps(7) both}
/* The states of a card are classes put on by the timers of the reveal (gx-hint, gx-up): the
   timeline is JavaScript, the moves are short CSS animations that start when a class comes. */
[data-gacha-reveal] .gx-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 4px;background:#14172b;
  box-shadow:0 0 0 3px #3a4a7c;animation:gx-deal 0.24s steps(4) both}
[data-gacha-reveal] .gx-card.gx-up{box-shadow:0 0 0 3px var(--c),0 0 18px 2px var(--c);animation:gx-turn 0.18s steps(4) both}
[data-gacha-reveal] .gx-card.gx-up[data-stars="5"]{animation:gx-turn 0.18s steps(4) both,gx-glow 1.2s steps(6) 0.2s infinite alternate}
[data-gacha-reveal] .gx-back{position:absolute;inset:0;z-index:2;
  background:repeating-linear-gradient(45deg,#2b3a73 0 6px,#1f2547 6px 12px);box-shadow:inset 0 0 0 3px #3f66d0,inset 0 0 0 6px ${INK};
  display:flex;align-items:center;justify-content:center}
[data-gacha-reveal] .gx-back::after{content:'';width:34%;aspect-ratio:1;border-radius:50% !important;
  background:radial-gradient(circle at 35% 30%,#fff 0,#8ec4ff 40%,#2b3a73 100%);box-shadow:0 0 0 3px ${INK}}
[data-gacha-reveal] .gx-card.gx-hint[data-stars="4"] .gx-back{box-shadow:inset 0 0 0 3px #c07bff,inset 0 0 0 6px ${INK},0 0 16px 6px #c07bffaa}
[data-gacha-reveal] .gx-card.gx-hint[data-stars="5"] .gx-back{box-shadow:inset 0 0 0 3px #ffd75a,inset 0 0 0 6px ${INK},0 0 24px 10px #ffd75acc;filter:brightness(1.4);animation:gx-shake 0.12s steps(2) infinite}
[data-gacha-reveal] .gx-card.gx-up .gx-back{display:none}
[data-gacha-reveal] .gx-card img{image-rendering:pixelated}
[data-gacha-reveal] .gx-late{visibility:hidden}
[data-gacha-reveal] .gx-late.gx-on{visibility:visible;animation:mx-in 0.2s steps(4) both}
[data-gacha] [data-mx-title]{white-space:nowrap}
/* A phone held sideways (~390 px high): the art shorter, the counters compact and beside the draw
   buttons, so the buttons are in sight without scrolling. */
@media (max-height:520px){
  [data-gacha] .gx-art{height:44vh;min-height:150px}
  [data-gacha] .gx-art [data-mx-title]{font-size:min(28px,7vh) !important}
  [data-gacha] .gx-panel{padding:6px 8px;gap:4px !important}
  [data-gacha] .gx-meter-n{font-size:18px}
  [data-gacha] .gx-meter-n canvas{height:18px !important;width:auto !important}
  [data-gacha] .gx-meter{grid-template-columns:auto 1fr}
  [data-gacha] .gx-meter .gx-seg{height:7px}
  [data-px-root] [data-gacha] button[data-draw]{min-width:120px !important;padding:6px 10px !important}
  [data-px-root] [data-gacha] button[data-draw="10"]{min-width:140px !important}
  [data-gacha] .gx-draw-n{font-size:16px}
  [data-gacha] .gx-control{flex-wrap:nowrap !important}
  [data-gacha] .gx-control>.gx-panel{flex:1 1 200px !important}
}
@keyframes gx-spin{to{transform:rotate(360deg)}}
@keyframes gx-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes gx-shake{0%{translate:0 0}50%{translate:3px -2px}100%{translate:-3px 2px}}
@keyframes gx-grow{0%{scale:0.5}80%{scale:1.15}100%{scale:1.4;opacity:0.15}}
@keyframes gx-flash{0%{opacity:0}12%{opacity:1}100%{opacity:0}}
@keyframes gx-deal{0%{transform:translateY(-40px) scale(0.7);opacity:0}100%{transform:none;opacity:1}}
@keyframes gx-turn{0%{transform:scaleX(1)}50%{transform:scaleX(0.04)}100%{transform:scaleX(1)}}
@keyframes gx-frame{to{box-shadow:0 0 0 3px var(--c),0 0 18px 2px var(--c)}}
@keyframes gx-gone{to{opacity:0;visibility:hidden}}
@keyframes gx-hint4{to{box-shadow:inset 0 0 0 3px #c07bff,inset 0 0 0 6px ${INK},0 0 16px 6px #c07bffaa}}
@keyframes gx-hint5{to{box-shadow:inset 0 0 0 3px #ffd75a,inset 0 0 0 6px ${INK},0 0 24px 10px #ffd75acc;filter:brightness(1.4)}}
@keyframes gx-glow{from{box-shadow:0 0 0 3px #ffd75a,0 0 14px 2px #ffd75a88}to{box-shadow:0 0 0 3px #fff3b0,0 0 30px 10px #ffd75acc}}
@keyframes gx-show{to{opacity:1}}
@keyframes gx-blink{50%{color:#fff}}
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

function coin(): HTMLElement {
  const c = el('span', '');
  c.className = 'gx-coin';
  return c;
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
    installCinema();
    this.root = el(
      'div',
      'position:absolute;inset:0;display:none;flex-direction:column;gap:10px;color:#f6f3e8;' +
        'padding:10px 14px;box-sizing:border-box;overflow-y:auto;font-family:system-ui,sans-serif;',
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

    // Header: back, the title, what you own, the coins.
    const coins = el(
      'div',
      `font-size:20px;font-weight:800;color:#ffd75a;display:flex;align-items:center;gap:8px;` +
        `background:#14172b;padding:4px 12px;box-shadow:0 0 0 3px ${INK},0 0 0 5px #c8922e;`,
    );
    coins.append(coin(), pixelNumber(String(view.coins), '#ffd75a', 2));
    coins.dataset.coins = String(view.coins);
    const back = button('Volver (M)', 'padding:6px 12px;');
    back.dataset.action = 'back';
    back.addEventListener('click', actions.onBack);
    const header = el('div', 'display:flex;align-items:center;gap:14px;flex-wrap:wrap;');
    // Back on the left: the sound toggle of the game sits on the top right corner.
    header.style.paddingRight = '110px';
    const heading = title('Gacha', '#ffd75a', 34, 0, 30);
    header.append(
      back,
      heading,
      el('div', 'font-size:12px;opacity:0.85;', `Pokédex: ${view.owned} de ${view.total}`),
      el('div', 'flex:1;', ''),
      coins,
    );

    // The banners, as tabs.
    const tabs = el(
      'div',
      'display:flex;flex-direction:column;gap:8px;flex:0 0 180px;min-width:0;',
    );
    view.banners.forEach((b, i) => {
      const tab = button('');
      tab.className = 'gx-tab';
      tab.dataset.gachaTab = b.key;
      tab.dataset.on = i === view.selected ? '1' : '0';
      const face = b.featured5[0] ?? b.showcase[0];
      if (face !== undefined) tab.append(this.picture(face.final, 36, ''));
      const words = el('div', 'display:flex;flex-direction:column;min-width:0;');
      words.append(
        el(
          'div',
          'font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
          b.name,
        ),
        el(
          'div',
          `font-size:10px;opacity:0.85;color:${b.endsInDays === null ? '#c8d0e8' : '#ffb0d0'};`,
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
      'display:flex;flex-direction:column;gap:14px;flex:1 1 320px;min-width:0;',
    );
    main.append(this.bannerArt(banner));

    // The control bar: the pity counters on the left, the draws on the right.
    const control = el(
      'div',
      'display:flex;gap:16px;flex-wrap:wrap;align-items:stretch;justify-content:space-between;',
    );
    control.className = 'gx-control';
    const pity = el(
      'div',
      'display:flex;flex-direction:column;gap:8px;flex:1 1 300px;min-width:0;',
    );
    pity.className = 'gx-panel';
    pity.dataset.pity = `${banner.pity.toFive}/${banner.pity.toFour}/${banner.pity.toFeatured ?? '-'}`;
    // The same lines as before, for screen readers and the checks.
    pity.title = pityLines(banner.pity, limited).join('\n');
    for (const meter of pityMeters(banner.pity, view.rules, limited)) {
      const row = el('div', '');
      row.className = meter.hot ? 'gx-meter gx-hot' : 'gx-meter';
      row.dataset.meter = meter.id;
      const left = el('div', 'display:flex;flex-direction:column;gap:2px;');
      left.append(
        el('div', `font-size:11px;letter-spacing:1px;color:${meter.color};`, meter.label),
      );
      const big = el('div', 'display:flex;align-items:baseline;gap:6px;');
      // 4W (block 3): a number in the game's own digits; a word ("Seguro") as text.
      const numeric = /^\d+$/.test(meter.value);
      const n = el('span', `color:${meter.color};`, numeric ? '' : meter.value);
      if (numeric) n.append(pixelNumber(meter.value, meter.color, 2.5));
      n.className = 'gx-meter-n';
      big.append(n, el('span', 'font-size:11px;opacity:0.85;', meter.note));
      const seg = el('div', '');
      seg.className = 'gx-seg';
      const lit = Math.round(meter.fill * meter.segments);
      for (let k = 0; k < meter.segments; k++) {
        seg.append(el('i', k < lit ? `background:${meter.color};` : ''));
      }
      left.append(big);
      row.append(left, seg);
      pity.append(row);
    }
    const drawCol = el(
      'div',
      'display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;flex:0 1 auto;',
    );
    const draws = el('div', 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;');
    for (const count of [1, view.multi]) {
      const price = view.cost * count;
      const b = button('');
      b.dataset.draw = String(count);
      b.disabled = view.coins < price;
      const n = el('span', '', `Tirar x${count}`);
      n.className = 'gx-draw-n';
      const cost = el('span', '');
      cost.className = 'gx-draw-c';
      cost.append(coin(), pixelNumber(String(price), '#0b0d1a', 1.5));
      b.append(n, cost);
      if (count > 1) {
        const g = el('span', '', '★4 o más seguro');
        g.className = 'gx-draw-g';
        b.append(g);
      }
      b.setAttribute('aria-label', `Tirar x${count} · ${price}`);
      b.addEventListener('click', () => {
        this.panel = 'none';
        actions.onDraw(count);
      });
      draws.append(b);
    }
    drawCol.append(draws);
    if (view.coins < view.cost) {
      drawCol.append(
        el(
          'div',
          'font-size:12px;opacity:0.85;text-align:center;',
          'Juega partidas para ganar monedas: oleadas, jefes y victorias.',
        ),
      );
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
      b.dataset.on = this.panel === id ? '1' : '0';
      b.addEventListener('click', () => {
        this.panel = this.panel === id ? 'none' : id;
        this.show(view, actions);
      });
      links.append(b);
    }
    drawCol.append(links);
    control.append(pity, drawCol);
    main.append(control);
    if (this.panel !== 'none') main.append(this.panelOf(this.panel, view, limited));

    const body = el('div', 'display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;');
    body.append(tabs, main);
    this.root.replaceChildren(header, body);
    this.root.style.display = 'flex';
  }

  private bannerArt(banner: GachaBannerView): HTMLElement {
    const [a, b] = bannerColors(banner.kind, banner.gen, banner.type);
    const art = el(
      'div',
      `--gx-a:${a};--gx-r:${shadeHex(a, 1.35)};` +
        `background:radial-gradient(ellipse at 72% 62%,${a}d0 0,${a}55 38%,transparent 72%),` +
        `linear-gradient(135deg,${b} 0,#14172b 55%,${a}66 100%);`,
    );
    art.className = 'gx-art';
    art.dataset.bannerArt = banner.key;
    const rays = el('div', '');
    rays.className = 'gx-rays';
    const floor = el('div', '');
    floor.className = 'gx-floor';
    const air = el('div', 'position:absolute;inset:0;overflow:hidden;pointer-events:none;');
    air.append(...motes([shadeHex(a, 1.6), '#ffffff', '#ffd75a'], 12));
    const ribbon = el(
      'div',
      '',
      banner.endsInDays === null ? 'PERMANENTE' : `LIMITADO · ${endsText(banner.endsInDays)}`,
    );
    ribbon.className = 'gx-ribbon';
    art.append(rays, air, floor, ribbon);
    // The heroes stand on the right 58 % of the art, the words keep the left: they never overlap.
    const heroes = banner.featured5.length > 0 ? banner.featured5 : banner.showcase.slice(0, 3);
    const stage = el(
      'div',
      'position:absolute;right:0;bottom:0;width:60%;height:100%;display:flex;' +
        'justify-content:flex-end;align-items:flex-end;',
    );
    heroes.forEach((hero, i) => {
      const img = this.picture(hero.final, 96, 'gx-hero');
      img.style.position = 'relative';
      img.style.height = banner.featured5.length > 0 ? '100%' : '80%';
      img.style.width = 'auto';
      img.style.maxWidth = `${Math.floor(100 / heroes.length)}%`;
      img.style.objectFit = 'contain';
      img.style.aspectRatio = '1';
      img.style.animationDelay = `${i * 0.4}s`;
      img.dataset.hero = hero.species;
      stage.append(img);
    });
    art.append(stage);
    // The words over a dark plate on the left, so they read over any art.
    const plate = el('div', '');
    plate.className = 'gx-plate';
    const words = el(
      'div',
      'position:absolute;left:14px;top:12px;bottom:12px;width:42%;z-index:2;display:flex;flex-direction:column;gap:6px;text-shadow:3px 3px 0 #0b0d1a;',
    );
    // What the banner is about (the ribbon already says how long it lasts).
    const label = kicker(
      banner.kind === 'region'
        ? 'Banner de región'
        : banner.kind === 'type'
          ? 'Banner de tipo'
          : 'Banner estándar',
      shadeHex(a, 1.4),
    );
    label.style.alignSelf = 'flex-start';
    words.append(
      label,
      // Lighter than the colour of the banner, so the name reads over its own rays.
      title(banner.name, shadeHex(a, 1.3), 40, 0, 25),
      el('div', 'font-size:12px;opacity:0.9;', banner.theme),
    );
    const top = banner.featured5[0];
    if (top !== undefined) {
      const tag = el('div', 'margin-top:4px;display:flex;flex-direction:column;gap:3px;');
      tag.append(
        el(
          'div',
          `color:${RARITY_COLORS[5]};font-size:15px;letter-spacing:2px;`,
          `${stars(5)} DESTACADO`,
        ),
        el(
          'div',
          'font-size:clamp(18px,3vw,28px);font-weight:800;color:#fff6d8;',
          pokemonName(top.final),
        ),
        el(
          'div',
          'font-size:11px;opacity:0.9;',
          `Línea de ${pokemonName(top.species)}${top.owned ? ' · ya lo tienes' : ''}`,
        ),
      );
      tag.append(typeIcons(top.types, 20));
      words.append(tag);
    } else {
      words.append(
        el(
          'div',
          'font-size:13px;opacity:0.95;margin-top:6px;max-width:240px;',
          'Todo el catálogo: cualquier Pokémon puede salir.',
        ),
      );
    }
    art.append(plate, words);
    // The featured ★4, on the floor in front of the hero, on its left (on the hero's stage, so they
    // never cover the words, however short the art is).
    if (banner.featured4.length > 0) {
      const fours = el(
        'div',
        'position:absolute;left:0;bottom:4%;display:flex;gap:8px;align-items:flex-end;z-index:1;',
      );
      for (const four of banner.featured4) {
        const card = el(
          'div',
          'display:flex;flex-direction:column;align-items:center;font-size:11px;text-shadow:2px 2px 0 #0b0d1a;',
        );
        card.dataset.featured4 = four.species;
        const pic = this.picture(four.final, 88, 'gx-four');
        pic.style.height = 'clamp(60px,14vh,104px)';
        pic.style.width = 'auto';
        pic.style.aspectRatio = '1';
        card.append(
          pic,
          el('div', `color:${RARITY_COLORS[4]};letter-spacing:1px;`, stars(4)),
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
    const box = el('div', 'font-size:12px;display:flex;flex-direction:column;gap:8px;');
    box.className = 'gx-panel';
    box.dataset.gachaPanel = panel;
    if (panel === 'rates') {
      box.append(el('div', 'font-size:16px;font-weight:800;', 'Probabilidades'));
      const table = el(
        'div',
        'display:grid;grid-template-columns:auto 1fr 1fr;gap:6px 14px;align-items:center;',
      );
      table.append(
        el('div', 'opacity:0.7;', 'Rareza'),
        el('div', 'opacity:0.7;', 'Base'),
        el('div', 'opacity:0.7;', 'Con el pity'),
      );
      for (const s of [5, 4, 3] as const) {
        const bar = (share: number): HTMLElement => {
          const cell = el('div', 'display:flex;align-items:center;gap:6px;');
          const track = el(
            'div',
            'flex:1;height:8px;background:#2b3a73;box-shadow:0 0 0 1px #0b0d1a;',
          );
          track.append(
            el(
              'div',
              `height:100%;width:${Math.max(2, Math.min(100, share * 100 * (s === 3 ? 1 : s === 4 ? 5 : 25)))}%;background:${RARITY_COLORS[s]};`,
            ),
          );
          cell.append(el('span', 'min-width:44px;font-weight:700;', percent(share)), track);
          return cell;
        };
        table.append(
          el('div', `color:${RARITY_COLORS[s]};font-size:14px;`, stars(s)),
          bar(view.rates.base[s]),
          bar(view.rates.overall[s]),
        );
      }
      box.append(
        table,
        el(
          'div',
          'opacity:0.85;',
          `De media, un ★5 cada ${Math.round(view.rates.drawsPerFive)} tiradas. ` +
            (limited
              ? `En este banner, cada ★5 es el destacado con un ${percent(view.rules.featuredShare / 10_000)}` +
                (view.rules.lostHalfPaysBack === true
                  ? '; si no lo es, el siguiente ★5 aquí lo es seguro.'
                  : '.')
              : 'En el estándar no hay destacados.'),
        ),
        el(
          'div',
          'opacity:0.85;',
          `Repetidos: ★3 +${view.repeatCandies[3]}, ★4 +${view.repeatCandies[4]}, ★5 +${view.repeatCandies[5]} caramelos.`,
        ),
      );
    } else if (panel === 'history') {
      box.append(el('div', 'font-size:16px;font-weight:800;', 'Historial'));
      if (view.history.length === 0) box.append(el('div', 'opacity:0.8;', 'Aún no has tirado.'));
      const list = el(
        'div',
        'display:flex;flex-direction:column;gap:2px;max-height:220px;overflow-y:auto;',
      );
      for (const row of view.history) {
        const line = el(
          'div',
          `display:grid;grid-template-columns:48px 52px 1fr auto;gap:6px;padding:2px 4px;color:${row.stars === 3 ? '#c8d0e8' : RARITY_COLORS[row.stars]};` +
            (row.stars === 5 ? 'background:#ffd75a22;' : ''),
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
      box.append(el('div', 'font-size:16px;font-weight:800;', 'Cómo funciona'));
      for (const line of rulesText(view.rules, limited)) box.append(el('div', '', line));
    }
    return box;
  }

  /** 4W: who plays the sounds of the reveal (the app's `SoundFx`); silent until it is set. */
  private sound: (id: SoundId) => void = () => {};

  setSound(play: (id: SoundId) => void): void {
    this.sound = play;
  }

  /**
   * The reveal of one draw or a x10; `done` goes back to the banner. 4W, block 6: first the
   * anticipation (`anticipation`): a glass sphere falls and lands on a pad of light, rings close on
   * it while it charges, and its colour climbs one rarity at a time up to the best of the draw (the
   * hint), each step with a pop and a sound; then it bursts open into the cards. A tap skips to them.
   */
  showReveal(cards: readonly RevealCard[], done: () => void): void {
    if (this.revealTimer !== undefined) clearTimeout(this.revealTimer);
    for (const timer of this.cueTimers) window.clearTimeout(timer);
    this.cueTimers.clear();
    const best = Math.max(3, ...cards.map((c) => c.stars)) as StarCount;
    this.reveal.dataset.best = String(best);
    const plan = anticipation(best);
    const stage = el('div', `--orb:${RARITY_COLORS[3]};`);
    stage.className = 'gx-stage';
    stage.dataset.orbStars = '3';
    const pad = el('div', '');
    pad.className = 'gx-pad';
    const rings = [0, 170, 340].map((delay) => {
      const ring = el('div', `animation-delay:${delay}ms;`);
      ring.className = 'gx-ring';
      return ring;
    });
    const sphere = el('div', '');
    sphere.className = 'gx-sphere';
    stage.append(pad, ...rings, sphere);
    const bg = el('div', '');
    bg.className = 'gx-bg';
    bg.append(...motes(['#ffffff', RARITY_COLORS[3]], 10));
    const flash = el('div', '');
    flash.className = 'gx-flash';
    const hint = el('div', 'font-size:13px;opacity:0.8;', 'Toca para saltar');
    this.reveal.replaceChildren(bg, stage, hint, flash);
    this.reveal.style.display = 'flex';
    this.sound('gachaDrop');
    const timers = new Set<number>();
    const at = (ms: number, fn: () => void): void => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        fn();
      }, ms);
      timers.add(timer);
    };
    at(plan.landMs, () => {
      sphere.classList.add('gx-landed');
      stage.classList.add('gx-charging');
      sphere.animate?.([{ scale: '1.25 0.75' }, { scale: '0.9 1.1' }, { scale: '1 1' }], {
        duration: 200,
        easing: 'steps(3)',
      });
      this.sound('gachaCharge');
    });
    for (const shift of plan.shifts) {
      at(shift.at, () => {
        stage.style.setProperty('--orb', RARITY_COLORS[shift.stars]);
        stage.dataset.orbStars = String(shift.stars);
        if (shift.stars === 5) sphere.classList.add('gx-hard');
        sphere.animate?.([{ scale: '1.3' }, { scale: '1' }], { duration: 220, easing: 'steps(4)' });
        this.sound('gachaShift');
      });
    }
    const finish = (): void => {
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      if (this.revealTimer !== undefined) clearTimeout(this.revealTimer);
      this.revealTimer = undefined;
      this.reveal.onclick = null;
      this.revealCards(cards, best, done);
    };
    at(plan.openMs, () => {
      this.sound('gachaOpen');
      flash.classList.add('gx-on');
      sphere.animate?.(
        [
          { scale: '1', opacity: 1 },
          { scale: '2.2', opacity: 0 },
        ],
        { duration: 200, easing: 'steps(4)', fill: 'forwards' },
      );
    });
    this.reveal.onclick = finish;
    this.revealTimer = setTimeout(finish, plan.openMs + 200);
    this.cueTimers = timers;
  }

  private revealCards(cards: readonly RevealCard[], best: StarCount, done: () => void): void {
    const timing = revealTiming(cards.map((c) => c.stars));
    const firstFive = cards.findIndex((c) => c.stars === 5);
    const fiveAt = firstFive < 0 ? -1 : (timing.flips[firstFive] ?? 0);
    const nodes: HTMLElement[] = [];
    // Behind: rays in the colour of the best rarity and motes; a white flash when a ★5 turns.
    const bg = el('div', '');
    bg.className = 'gx-bg';
    const light = el(
      'div',
      `position:absolute;left:50%;top:50%;width:160vmax;height:160vmax;margin:-80vmax 0 0 -80vmax;opacity:${best === 5 ? 0.5 : 0.28};` +
        `background:repeating-conic-gradient(from 0deg,${RARITY_COLORS[best]} 0deg 7deg,transparent 7deg 22deg);` +
        'animation:mx-turn 14s steps(64) infinite;-webkit-mask:radial-gradient(circle,#000 0,#000 18%,transparent 62%);mask:radial-gradient(circle,#000 0,#000 18%,transparent 62%);',
    );
    bg.append(light, ...motes([RARITY_COLORS[best], '#ffffff'], 14));
    nodes.push(bg);
    // The timeline: each cue puts a class on at its moment (a tap plays all that are left at once).
    const cues: [number, () => void][] = [];
    if (best === 5) {
      const flash = el('div', '');
      flash.className = 'gx-flash';
      nodes.push(flash);
      cues.push([fiveAt, () => flash.classList.add('gx-on')]);
    }
    const fiveCues: [number, () => void][] = [];
    const five = el('div', '');
    five.className = 'gx-five';
    five.dataset.gachaFive = '';
    // A tap on the screen of a ★5 closes it (and only it).
    five.addEventListener('click', (e) => {
      e.stopPropagation();
      five.classList.remove('gx-on');
    });
    const big = cards.length === 1;
    const grid = el(
      'div',
      big
        ? 'display:flex;justify-content:center;'
        : 'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;width:min(96vw,760px);',
    );
    cards.forEach((card, i) => {
      const c = RARITY_COLORS[card.stars];
      const flip = timing.flips[i] ?? 0;
      const node = el('div', `--c:${c};animation-delay:${i * 40}ms;`);
      if (card.stars >= 4) {
        cues.push([Math.max(0, flip - timing.hintMs), () => node.classList.add('gx-hint')]);
      }
      cues.push([
        flip,
        () => {
          node.classList.add('gx-up');
          this.sound(card.stars === 5 ? 'flip5' : card.stars === 4 ? 'flip4' : 'flip3');
        },
      ]);
      // 4W: a ★5 has a screen of its own, right after it turns; the next card waits for it.
      if (card.stars === 5) {
        fiveCues.push(
          [flip + 150, () => this.showFive(five, card)],
          [flip + timing.fiveScreenMs - 100, () => five.classList.remove('gx-on')],
        );
      }
      node.className = 'gx-card';
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
        big ? 150 : 64,
      );
      face.tabIndex = -1;
      face.style.width = '100%';
      node.append(face);
      if (big && card.final !== card.species) {
        node.append(
          el('div', 'font-size:12px;opacity:0.8;', `Evoluciona hasta ${pokemonName(card.final)}`),
        );
      }
      if (card.featured) {
        node.append(el('div', `font-size:${big ? 13 : 10}px;color:#ff7fb0;`, 'DESTACADO'));
      }
      node.append(
        el(
          'div',
          `font-size:${big ? 14 : 10}px;font-weight:700;color:${card.isNew ? '#9fe86a' : '#c8d0e8'};`,
          revealNote(card.isNew, card.candies),
        ),
      );
      // The back of the card, over its face until it turns.
      const backFace = el('div', '');
      backFace.className = 'gx-back';
      node.append(backFace);
      grid.append(node);
    });
    nodes.push(grid);
    const ok = button('Continuar', 'padding:8px 22px;font-size:16px;');
    ok.dataset.action = 'revealDone';
    ok.classList.add('gx-late');
    cues.push([timing.doneMs, () => ok.classList.add('gx-on')]);
    ok.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideReveal();
      done();
    });
    nodes.push(ok, five);
    this.reveal.replaceChildren(...nodes);
    this.reveal.style.display = 'flex';
    const pending = new Set<number>();
    for (const [at, cue] of [...cues, ...fiveCues]) {
      const timer = window.setTimeout(() => {
        pending.delete(timer);
        cue();
      }, at);
      pending.add(timer);
    }
    this.cueTimers = pending;
    // A tap turns every card at once; the best ★5, if any, still gets its screen (a while, or a tap).
    this.reveal.onclick = () => {
      this.reveal.onclick = null;
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
      for (const [, cue] of cues) cue();
      const last = [...cards].reverse().find((c) => c.stars === 5);
      if (last !== undefined) {
        this.showFive(five, last);
        const timer = window.setTimeout(() => five.classList.remove('gx-on'), timing.fiveScreenMs);
        pending.add(timer);
      }
    };
  }

  /** The screen of its own of a ★5 (4W, block 6): its name, its picture big, gold and a fanfare. */
  private showFive(five: HTMLElement, card: RevealCard): void {
    const gold = RARITY_COLORS[5];
    const lines = el('div', '');
    lines.className = 'gx-lines';
    const rain = confetti([gold, '#fff3b0', '#ffffff', shadeHex(gold, 0.7)], 26);
    const top = kicker('¡Rareza máxima!', gold);
    top.style.cssText += 'font-size:18px;position:relative;';
    const starRow = el(
      'div',
      `font-size:30px;color:${gold};text-shadow:3px 3px 0 ${INK};position:relative;`,
      stars(5),
    );
    const picture = this.picture(card.species, 400, '');
    picture.style.position = 'relative';
    const name = title(pokemonName(card.species), gold, 64);
    name.style.position = 'relative';
    const notes: string[] = [];
    if (card.featured) notes.push('DESTACADO');
    notes.push(revealNote(card.isNew, card.candies));
    const note = el(
      'div',
      `font-size:16px;font-weight:700;color:${card.isNew ? '#9fe86a' : '#f6f3e8'};position:relative;`,
      notes.join(' · '),
    );
    const tap = el('div', 'font-size:12px;opacity:0.7;position:relative;', 'Toca para seguir');
    five.replaceChildren(lines, ...rain, top, starRow, picture, name, note, tap);
    five.dataset.gachaFive = card.species;
    five.classList.remove('gx-on');
    void five.offsetWidth; // restart its entrance
    five.classList.add('gx-on');
    this.sound('fanfare5');
  }

  private cueTimers = new Set<number>();

  private hideReveal(): void {
    if (this.revealTimer !== undefined) clearTimeout(this.revealTimer);
    this.revealTimer = undefined;
    this.reveal.onclick = null;
    for (const timer of this.cueTimers) window.clearTimeout(timer);
    this.cueTimers.clear();
    this.reveal.style.display = 'none';
  }

  hide(): void {
    this.hideReveal();
    this.root.style.display = 'none';
  }
}
