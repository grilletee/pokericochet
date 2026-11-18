import type { GameType } from '../domain';
import { typeName } from './cardText';
import type { ArtLookup } from './cardView';
import { pokemonName } from './names';
import { PALETTE, pixelFrame } from './pixelStyle';
import { TYPE_COLORS } from './typeColors';

/** One wild Pokémon that asks to join, as the screen shows it. */
export interface JoinOption {
  /** The form it joins as (what to call and draw it) and its level. */
  readonly form: string;
  readonly level: number;
  readonly types: readonly GameType[];
  /** A rare line (a strong final form, a ★4 of the gacha): it asks to join less often. */
  readonly rare: boolean;
}

export interface JoinView {
  readonly options: readonly JoinOption[];
  /** The team is full: taking one means replacing someone (the replace screen comes next). */
  readonly teamFull: boolean;
  /** The biome they live in (its name), or '' without one. */
  readonly biome: string;
}

function box(css: string, text = ''): HTMLDivElement {
  const node = document.createElement('div');
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

function animate(element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): void {
  if (typeof element.animate === 'function') element.animate(keyframes, options);
}

/** The headline of the encounter (one or several). */
export function joinTitle(count: number): string {
  return count === 1
    ? '¡Un Pokémon salvaje quiere unirse!'
    : '¡Unos Pokémon salvajes quieren unirse!';
}

/** What the encounter means, in one line. */
export function joinHint(teamFull: boolean): string {
  return teamFull
    ? 'Tu equipo está completo: si eliges uno, decidirás a quién sustituye. Solo para esta partida.'
    : 'Elige uno: se une a tu equipo durante esta partida.';
}

/**
 * 4X, block 1 (19th playtest: "conseguir Pokémon tiene que tener verdadero protagonismo"): the
 * encounter of a level-up. Three big cards, each one a wild Pokémon of the biome standing on a lit
 * patch of its colour: its picture large, its name, its types and level, and "RARO" for a rare one.
 * Pressing one (or 1-3) takes it; "Ahora no" (or X) lets them go and brings the usual cards. It
 * takes the whole screen like the replace screen, and is built once per encounter.
 */
export class JoinScreen {
  private readonly root: HTMLDivElement;
  private shownKey = '';

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.dataset.join = '';
    this.root.style.cssText =
      'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:14px;padding:16px;box-sizing:border-box;z-index:8;' +
      `background:radial-gradient(ellipse at 50% 55%, rgba(63,102,208,0.35), rgba(5,8,16,0.94) 70%);` +
      `color:${PALETTE.cream};text-align:center;overflow:auto;pointer-events:auto;`;
    host.append(this.root);
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  /** Shows the encounter, or hides it with null. Calling it again with the same view is free. */
  update(
    view: JoinView | null,
    art: ArtLookup,
    onPick: (index: number) => void,
    onSkip: () => void,
  ): void {
    const key =
      view === null
        ? ''
        : `${view.teamFull}|${view.options.map((o) => `${o.form}:${o.level}`).join(',')}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.root.replaceChildren();
    if (view === null) {
      this.root.style.display = 'none';
      return;
    }
    const heading = box(
      `font-size:30px;font-weight:700;color:${PALETTE.yellow};` +
        `text-shadow:3px 3px 0 ${PALETTE.ink};letter-spacing:1px;`,
      joinTitle(view.options.length),
    );
    heading.dataset.joinTitle = '';
    const hint = box('font-size:15px;opacity:0.92;max-width:560px;', joinHint(view.teamFull));
    const where =
      view.biome === ''
        ? null
        : box(`font-size:13px;color:${PALETTE.cyan};`, `Viven en: ${view.biome}`);
    const row = box('display:flex;flex-wrap:wrap;justify-content:center;gap:16px;max-width:900px;');
    view.options.forEach((option, index) => {
      row.append(this.card(option, index, art, onPick));
    });
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.dataset.joinSkip = '';
    skip.textContent = 'Ahora no (X): mejor una carta de nivel';
    skip.style.cssText =
      'min-height:44px;padding:10px 22px;font:inherit;font-size:15px;font-weight:700;' +
      `background:${PALETTE.navy};color:${PALETTE.cream};border:none;cursor:pointer;` +
      pixelFrame(PALETTE.grey);
    skip.addEventListener('click', onSkip);
    this.root.append(heading, hint, ...(where === null ? [] : [where]), row, skip);
    this.root.style.display = 'flex';
    animate(this.root, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'steps(5)' });
  }

  private card(
    option: JoinOption,
    index: number,
    art: ArtLookup,
    onPick: (index: number) => void,
  ): HTMLButtonElement {
    const main = option.types[0];
    const color = main === undefined ? PALETTE.blue : TYPE_COLORS[main];
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.joinOption = String(index);
    button.style.cssText =
      'width:220px;min-height:300px;padding:14px 12px;display:flex;flex-direction:column;' +
      'align-items:center;gap:8px;font:inherit;cursor:pointer;border:none;position:relative;' +
      `color:${PALETTE.cream};background:linear-gradient(180deg, ${color}55, ${PALETTE.deep} 62%);` +
      pixelFrame(option.rare ? PALETTE.yellow : color, 4);
    // The patch of light it stands on, and the picture large over it.
    const stage = box(
      'position:relative;width:150px;height:150px;display:flex;align-items:flex-end;justify-content:center;',
    );
    const glow = box(
      'position:absolute;left:15px;right:15px;bottom:4px;height:26px;border-radius:50% !important;' +
        `background:radial-gradient(${color}cc, transparent 70%);`,
    );
    stage.append(glow);
    const url = art.spriteUrl(option.form);
    if (url !== undefined) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = pokemonName(option.form);
      img.draggable = false;
      img.style.cssText = 'width:144px;height:144px;image-rendering:pixelated;position:relative;';
      // It hops in, one after another, then breathes.
      animate(
        img,
        [
          { transform: 'translateY(40px) scale(0.6)', opacity: 0 },
          { transform: 'translateY(-10px) scale(1.05)', opacity: 1, offset: 0.6 },
          { transform: 'translateY(0) scale(1)', opacity: 1 },
        ],
        { duration: 420, delay: 120 * index, easing: 'steps(8)', fill: 'both' },
      );
      animate(
        img,
        [
          { transform: 'translateY(0)' },
          { transform: 'translateY(-4px)' },
          { transform: 'translateY(0)' },
        ],
        {
          duration: 1400,
          delay: 600 + 120 * index,
          iterations: Number.POSITIVE_INFINITY,
          easing: 'steps(4)',
        },
      );
      stage.append(img);
    }
    const name = box(
      `font-size:22px;font-weight:700;text-shadow:2px 2px 0 ${PALETTE.ink};`,
      `${index + 1}. ${pokemonName(option.form)}`,
    );
    const types = box('display:flex;gap:6px;justify-content:center;flex-wrap:wrap;');
    for (const type of option.types) {
      types.append(
        box(
          `font-size:12px;font-weight:700;padding:3px 8px;background:${TYPE_COLORS[type]};` +
            `color:${PALETTE.ink};`,
          typeName(type),
        ),
      );
    }
    const level = box('font-size:15px;opacity:0.95;', `Nv ${option.level}`);
    button.append(stage, name, types, level);
    if (option.rare) {
      const tag = box(
        `position:absolute;top:8px;right:8px;font-size:12px;font-weight:700;padding:3px 7px;` +
          `background:${PALETTE.yellow};color:${PALETTE.ink};`,
        '★ RARO',
      );
      tag.dataset.joinRare = '';
      button.append(tag);
    }
    button.addEventListener('click', () => onPick(index));
    return button;
  }
}
