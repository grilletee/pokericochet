import type { GameType } from '../domain';
import type { ArtLookup } from './cardView';
import { motes, shadeHex } from './cinema';
import {
  type BannerViewKind,
  bannerColors,
  bannerKindLabel,
  RARITY_COLORS,
  type StarCount,
  stars,
} from './gachaText';
import { pokemonName } from './names';
import { typeIcons } from './typeIcons';

/**
 * The splash of a banner (4X, block 3; 19th playtest: "como cuando en Arknights: Endfield sale un
 * operador nuevo: el banner se ve tan bien que quieres tirar solo por eso"). A composition of our own
 * over the sprite of the game, never official art:
 *
 * - a sky in the colours of the featured Pokémon, with shafts of light that sweep across it and
 *   motes that rise;
 * - its silhouette, huge and dark, drifting behind everything (the poster look);
 * - a halo that breathes behind it and, on the legendary banner, a sigil of two rings that turn;
 * - the Pokémon itself, big, in pixel art, rimmed in its colour, that comes in with a flash;
 * - on the left, over a dark plate: what the banner is, the stars, the NAME huge, its line and types,
 *   what the rate-up promises, the featured ★4 and the countdown to the end of the week, live.
 */

export interface SplashHero {
  /** The first of its line (what you get) and its last form (what is drawn). */
  readonly species: string;
  readonly final: string;
  readonly types: readonly GameType[];
  readonly stars: StarCount;
  readonly owned: boolean;
}

export interface SplashView {
  readonly key: string;
  readonly kind: BannerViewKind;
  readonly name: string;
  readonly theme: string;
  readonly type?: GameType;
  /** The big ones: one featured, two for the showcase, three ★5 of the catalogue for the standard. */
  readonly heroes: readonly SplashHero[];
  /** The featured ★4, small. */
  readonly minis: readonly SplashHero[];
  /** The start of the next week (ms since 1970), or null for the permanent banner. */
  readonly endsAtMs: number | null;
  /** What the rate-up promises, in one line. */
  readonly rateLine: string;
}

/** "3 d 05:12:44", "05:12:44" on the last day, or a word when it is over. Pure. */
export function countdownText(msLeft: number): string {
  if (msLeft <= 0) return '¡Cambia ya!';
  const total = Math.floor(msLeft / 1000);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number): string => String(n).padStart(2, '0');
  const clock = `${two(h)}:${two(m)}:${two(s)}`;
  return d > 0 ? `${d} d ${clock}` : clock;
}

/** The time left as the tabs say it: "4 d 10 h", "3 h 12 min", "12 min" (never a lie of a day). */
export function shortCountdown(msLeft: number): string {
  if (msLeft <= 0) return 'Cambia ya';
  const minutes = Math.floor(msLeft / 60_000);
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/** The size of the name over the art: long names smaller, so they always fit on one line. */
export function nameSize(name: string): number {
  const n = name.length;
  return n <= 7 ? 72 : n <= 10 ? 60 : n <= 14 ? 48 : 38;
}

const INK = '#0b0d1a';

const CSS = `
[data-gacha] .gs-art{position:relative;overflow:hidden;min-height:230px;height:clamp(230px,58vh,560px);isolation:isolate;
  box-shadow:0 0 0 3px ${INK},0 0 0 6px var(--gs-a),0 0 0 9px ${INK},0 12px 0 0 rgba(0,0,0,0.35)}
[data-gacha] .gs-sky{position:absolute;inset:0;z-index:0;
  background:radial-gradient(ellipse at 72% 58%,var(--gs-a) 0,color-mix(in srgb,var(--gs-a) 35%,transparent) 32%,transparent 62%),
    radial-gradient(ellipse at 18% 110%,var(--gs-b) 0,transparent 55%),
    linear-gradient(160deg,color-mix(in srgb,var(--gs-a) 45%,${INK}) 0,${INK} 72%)}
[data-gacha] .gs-ghost{position:absolute;z-index:1;right:-12%;top:-30%;height:170%;aspect-ratio:1;image-rendering:pixelated;
  filter:brightness(0);opacity:0.38;animation:gs-drift 22s steps(44) infinite alternate}
[data-gacha] .gs-shafts{position:absolute;inset:-30%;z-index:2;mix-blend-mode:screen;opacity:0.55;
  background:repeating-linear-gradient(102deg,transparent 0 70px,rgba(255,255,255,0.10) 70px 90px,transparent 90px 170px,rgba(255,255,255,0.05) 170px 178px);
  animation:gs-sweep 9s steps(36) infinite linear}
[data-gacha] .gs-halo{position:absolute;z-index:3;right:6%;bottom:2%;width:62%;aspect-ratio:1;border-radius:50% !important;
  background:radial-gradient(circle,color-mix(in srgb,var(--gs-a) 80%,#fff) 0,var(--gs-a) 18%,color-mix(in srgb,var(--gs-a) 30%,transparent) 42%,transparent 66%);
  opacity:0.65;animation:gs-breathe 3.6s steps(12) infinite}
[data-gacha] .gs-sigil{position:absolute;z-index:3;right:12%;bottom:8%;width:50%;aspect-ratio:1;border-radius:50% !important;
  border:4px dashed color-mix(in srgb,var(--gs-a) 80%,#fff);opacity:0.5;animation:gx-spin 30s steps(120) infinite}
[data-gacha] .gs-sigil.gs-inner{width:36%;right:19%;bottom:15%;border-style:dotted;animation-direction:reverse;animation-duration:18s}
[data-gacha] .gs-air{position:absolute;inset:0;z-index:4;overflow:hidden;pointer-events:none}
[data-gacha] .gs-stage{position:absolute;z-index:5;right:0;bottom:0;width:62%;height:100%;display:flex;justify-content:flex-end;align-items:flex-end}
[data-gacha] .gs-hero{position:relative;height:96%;width:auto;aspect-ratio:1;object-fit:contain;image-rendering:pixelated;
  filter:drop-shadow(3px 0 0 var(--gs-rim)) drop-shadow(-3px 0 0 var(--gs-rim)) drop-shadow(0 -3px 0 var(--gs-rim)) drop-shadow(0 0 24px var(--gs-a)) drop-shadow(8px 10px 0 rgba(0,0,0,0.45));
  animation:gs-enter 700ms steps(14) both,gs-float 3.4s steps(16) 700ms infinite}
[data-gacha] .gs-floor{position:absolute;z-index:4;left:0;right:0;bottom:0;height:18%;
  background:linear-gradient(180deg,transparent 0,rgba(11,13,26,0.7) 70%),repeating-linear-gradient(90deg,rgba(255,255,255,0.07) 0 2px,transparent 2px 22px)}
[data-gacha] .gs-plate{position:absolute;z-index:6;left:0;top:0;bottom:0;width:52%;
  background:linear-gradient(90deg,rgba(11,13,26,0.9) 0,rgba(11,13,26,0.66) 62%,rgba(11,13,26,0) 100%)}
[data-gacha] .gs-words{position:absolute;z-index:7;left:16px;top:14px;bottom:14px;width:48%;display:flex;flex-direction:column;gap:6px;
  text-shadow:3px 3px 0 ${INK}}
[data-gacha] .gs-kicker{align-self:flex-start;font-size:12px;letter-spacing:2px;padding:3px 8px;color:${INK};background:var(--gs-rim);text-shadow:none}
[data-gacha] .gs-stars{font-size:26px;letter-spacing:2px;line-height:1}
[data-gacha] .gs-name{font-weight:700;line-height:0.95;letter-spacing:2px;text-transform:uppercase;white-space:nowrap;color:#fff6e0;
  text-shadow:4px 4px 0 ${INK},-2px -2px 0 ${INK},2px -2px 0 ${INK},-2px 2px 0 ${INK},0 0 26px var(--gs-a);animation:gs-name 800ms steps(10) both}
[data-gacha] .gs-line{font-size:13px;opacity:0.92;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
[data-gacha] .gs-rate{align-self:flex-start;font-size:12px;padding:4px 8px;background:rgba(11,13,26,0.75);box-shadow:0 0 0 2px var(--gs-rim);max-width:100%}
[data-gacha] .gs-minis{display:flex;gap:6px;align-items:flex-end;margin-top:auto}
[data-gacha] .gs-mini{display:flex;flex-direction:column;align-items:center;font-size:10px;padding:2px 4px;background:rgba(11,13,26,0.7);box-shadow:0 0 0 2px #c07bff}
[data-gacha] .gs-mini img{width:44px;height:44px;image-rendering:pixelated;filter:drop-shadow(0 0 6px #c07bff)}
[data-gacha] .gs-clock{position:absolute;z-index:8;right:12px;top:12px;display:flex;flex-direction:column;align-items:flex-end;gap:2px;
  padding:6px 10px;background:rgba(11,13,26,0.82);box-shadow:0 0 0 3px ${INK},0 0 0 5px var(--gs-rim);text-shadow:2px 2px 0 ${INK}}
[data-gacha] .gs-clock b{font-size:20px;letter-spacing:1px;color:#fff6e0}
[data-gacha] .gs-scan{position:absolute;inset:0;z-index:9;pointer-events:none;opacity:0.18;
  background:repeating-linear-gradient(0deg,rgba(0,0,0,0.6) 0 1px,transparent 1px 4px)}
[data-gacha] .gs-flash{position:absolute;inset:0;z-index:10;pointer-events:none;background:#fff;opacity:0;animation:gs-flash 700ms steps(7) 220ms both}
@keyframes gs-drift{from{transform:translate(0,0) scale(1)}to{transform:translate(-6%,4%) scale(1.06)}}
@keyframes gs-sweep{from{transform:translateX(-120px)}to{transform:translateX(120px)}}
@keyframes gs-breathe{0%,100%{transform:scale(0.94);opacity:0.55}50%{transform:scale(1.04);opacity:0.8}}
@keyframes gs-enter{0%{transform:translateX(38%) scale(0.86);filter:brightness(4) drop-shadow(0 0 0 #fff);opacity:0}
  45%{transform:translateX(0) scale(1.04);filter:brightness(3) drop-shadow(0 0 30px #fff);opacity:1}100%{transform:none}}
@keyframes gs-float{0%,100%{translate:0 0}50%{translate:0 -10px}}
@keyframes gs-name{0%{clip-path:inset(0 100% 0 0);opacity:0}100%{clip-path:inset(0 0 0 0);opacity:1}}
@keyframes gs-flash{0%{opacity:0}15%{opacity:0.22}100%{opacity:0}}
@media (max-height:520px){
  [data-gacha] .gs-art{height:46vh;min-height:160px}
  [data-gacha] .gs-stars{font-size:14px}
  [data-gacha] .gs-minis,[data-gacha] .gs-line{display:none}
  /* A phone held sideways: the hero takes the right half whole; the words and the clock keep out of it. */
  [data-gacha] .gs-words{width:50%;gap:4px;top:8px;left:10px}
  [data-gacha] .gs-plate{width:56%}
  [data-gacha] .gs-stage{width:50%}
  [data-gacha] .gs-name{font-size:min(30px,8vh) !important;letter-spacing:1px}
  [data-gacha] .gs-kicker{font-size:9px;letter-spacing:1px}
  [data-gacha] .gs-rate{font-size:9px;padding:2px 6px}
  [data-gacha] .gs-clock{top:auto;bottom:8px;right:auto;left:10px;flex-direction:row;align-items:baseline;gap:6px;padding:3px 8px}
  [data-gacha] .gs-clock span{font-size:8px !important}
  [data-gacha] .gs-clock b{font-size:12px}
}
@media (max-width:640px){
  [data-gacha] .gs-words{width:70%}
  [data-gacha] .gs-plate{width:80%}
}
`;

let styled = false;
function installCss(): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const style = document.createElement('style');
  style.dataset.gachaSplashStyle = '';
  style.textContent = CSS;
  document.head.append(style);
}

function el(tag: string, cls: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (cls !== '') node.className = cls;
  node.textContent = text;
  return node;
}

function sprite(art: ArtLookup, species: string, cls: string): HTMLImageElement | null {
  const url = art.spriteUrl(species);
  if (url === undefined) return null;
  const img = document.createElement('img');
  img.src = url;
  img.alt = pokemonName(species);
  img.draggable = false;
  if (cls !== '') img.className = cls;
  return img;
}

/** The splash of a banner and the function that keeps its countdown live (call it every second). */
export function buildSplash(
  view: SplashView,
  art: ArtLookup,
  now: number,
): { readonly root: HTMLElement; readonly tick: (now: number) => void } {
  installCss();
  const [a, b] = bannerColors(view.kind, view.type);
  const top = view.heroes[0];
  const topStars: StarCount = top?.stars ?? (view.kind === 'legend' ? 6 : 5);
  const rim = view.kind === 'legend' ? RARITY_COLORS[6] : shadeHex(a, 1.35);
  const root = el('div', 'gs-art');
  root.dataset.bannerArt = view.key;
  root.dataset.splash = view.kind;
  root.style.setProperty('--gs-a', a);
  root.style.setProperty('--gs-b', b);
  root.style.setProperty('--gs-rim', rim);

  const layers: HTMLElement[] = [el('div', 'gs-sky')];
  if (top !== undefined) {
    const ghost = sprite(art, top.final, 'gs-ghost');
    if (ghost !== null) layers.push(ghost);
  }
  layers.push(el('div', 'gs-shafts'), el('div', 'gs-halo'));
  if (view.kind === 'legend') {
    layers.push(el('div', 'gs-sigil'), el('div', 'gs-sigil gs-inner'));
  }
  const air = el('div', 'gs-air');
  air.append(...motes([shadeHex(a, 1.6), '#ffffff', rim], view.kind === 'legend' ? 22 : 14));
  layers.push(air, el('div', 'gs-floor'));

  // The heroes on the right.
  const stage = el('div', 'gs-stage');
  view.heroes.forEach((hero, i) => {
    const img = sprite(art, hero.final, 'gs-hero');
    if (img === null) return;
    img.dataset.hero = hero.species;
    if (view.heroes.length > 1) {
      img.style.height = view.heroes.length === 2 ? '84%' : '66%';
      img.style.maxWidth = `${Math.floor(100 / view.heroes.length) + 6}%`;
      img.style.animationDelay = `${i * 120}ms, ${700 + i * 400}ms`;
    }
    stage.append(img);
  });

  // The words on the left.
  const words = el('div', 'gs-words');
  const kicker = el('div', 'gs-kicker', bannerKindLabel(view.kind));
  const starRow = el('div', 'gs-stars', stars(topStars));
  starRow.style.color = RARITY_COLORS[topStars];
  const heroName =
    view.heroes.length === 1 && top !== undefined ? pokemonName(top.final) : view.name;
  const name = el('div', 'gs-name', heroName);
  name.style.fontSize = `clamp(26px,${nameSize(heroName) / 10}vw,${nameSize(heroName)}px)`;
  name.dataset.splashName = '';
  const line = el('div', 'gs-line');
  if (view.heroes.length === 1 && top !== undefined) {
    line.append(
      el(
        'span',
        '',
        `${view.name} · línea de ${pokemonName(top.species)}${top.owned ? ' · ya lo tienes' : ''}`,
      ),
      typeIcons(top.types, 16),
    );
  } else {
    line.append(el('span', '', view.theme));
  }
  const rate = el('div', 'gs-rate', view.rateLine);
  rate.dataset.splashRate = '';
  words.append(kicker, starRow, name, line, rate);
  if (view.minis.length > 0) {
    const minis = el('div', 'gs-minis');
    for (const mini of view.minis) {
      const box = el('div', 'gs-mini');
      const img = sprite(art, mini.final, '');
      if (img !== null) box.append(img);
      box.append(el('span', '', `★4 ${pokemonName(mini.final)}`));
      minis.append(box);
    }
    words.append(minis);
  }

  // The countdown of the week (or "always" for the permanent one).
  const clock = el('div', 'gs-clock');
  const clockLabel = el('span', '', view.endsAtMs === null ? 'BANNER PERMANENTE' : 'TERMINA EN');
  clockLabel.style.fontSize = '11px';
  clockLabel.style.letterSpacing = '2px';
  const clockValue = el(
    'b',
    '',
    view.endsAtMs === null ? 'Siempre' : countdownText(view.endsAtMs - now),
  );
  clockValue.dataset.countdown = view.endsAtMs === null ? '' : String(view.endsAtMs);
  clock.append(clockLabel, clockValue);

  root.append(
    ...layers,
    stage,
    el('div', 'gs-plate'),
    words,
    clock,
    el('div', 'gs-scan'),
    el('div', 'gs-flash'),
  );
  return {
    root,
    tick: (t: number) => {
      if (view.endsAtMs !== null) clockValue.textContent = countdownText(view.endsAtMs - t);
    },
  };
}
