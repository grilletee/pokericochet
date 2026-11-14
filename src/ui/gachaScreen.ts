import type { GameType } from '../domain';
import { type ArtLookup, spriteTile } from './cardView';
import { pokemonName } from './names';

/**
 * The gacha screen (4G-I, Phase 5): the coins you have, what a draw costs, how many draws are left to
 * the guaranteed new Pokémon, and the draw with its reveal: the Pokémon in its glass sphere, "¡Nuevo!"
 * or the candies of a repeat. The game decides (meta/gacha.ts); this only shows it. No real money.
 */
export interface GachaView {
  readonly coins: number;
  readonly cost: number;
  /** Draws left until the guaranteed new one (1 = the next one). */
  readonly toGuarantee: number;
  readonly owned: number;
  readonly poolSize: number;
}

export interface GachaReveal {
  readonly species: string;
  readonly type: GameType | undefined;
  readonly isNew: boolean;
  readonly candies: number;
  readonly guaranteed: boolean;
}

const BUTTON =
  'pointer-events:auto;padding:12px 18px;border:2px solid #ffd54f;border-radius:10px;' +
  'background:#2a3a6a;color:inherit;font:inherit;cursor:pointer;font-size:18px;';

function el(tag: string, css: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

export class GachaScreen {
  private readonly root: HTMLElement;

  constructor(
    host: HTMLElement,
    private readonly art: ArtLookup,
  ) {
    this.root = el(
      'div',
      'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
        'justify-content:center;gap:10px;background:#0b0e24f2;text-align:center;' +
        'font-family:system-ui,sans-serif;color:#e8ecf8;padding:16px;box-sizing:border-box;overflow-y:auto;',
    );
    this.root.dataset.screen = 'gacha';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.root);
  }

  show(view: GachaView, onDraw: () => void, onBack: () => void, reveal: GachaReveal | null): void {
    const coins = el(
      'div',
      'font-size:20px;font-weight:800;color:#ffd54f;',
      `${view.coins} monedas`,
    );
    coins.dataset.coins = String(view.coins);
    const rows: HTMLElement[] = [
      el('div', 'font-size:32px;font-weight:800;', 'Gacha'),
      coins,
      el(
        'div',
        'font-size:14px;opacity:0.85;max-width:380px;',
        `Cada tirada cuesta ${view.cost} monedas y te da un Pokémon para tu colección. ` +
          `Novedad garantizada en ${view.toGuarantee} ${view.toGuarantee === 1 ? 'tirada' : 'tiradas'}. ` +
          `Tienes ${view.owned} de ${view.poolSize}.`,
      ),
    ];
    if (reveal !== null) {
      const card = el(
        'div',
        `display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 16px;` +
          `border:3px solid ${reveal.isNew ? '#ffd54f' : '#9aa6c0'};background:#10142a;`,
      );
      card.dataset.reveal = reveal.species;
      card.append(
        spriteTile(
          this.art.spriteUrl(reveal.species),
          reveal.species,
          reveal.type,
          96,
          undefined,
          true,
        ),
        el('div', 'font-size:22px;font-weight:800;', pokemonName(reveal.species)),
        el(
          'div',
          `font-size:16px;font-weight:700;color:${reveal.isNew ? '#ffd54f' : '#c8d0e8'};`,
          reveal.isNew
            ? `¡Nuevo en tu colección!${reveal.guaranteed ? ' (garantizado)' : ''}`
            : `Repetido: +${reveal.candies} caramelos de ${pokemonName(reveal.species)}`,
        ),
      );
      rows.push(card);
    }
    const draw = el('button', BUTTON, `Tirar (${view.cost} monedas)`) as HTMLButtonElement;
    draw.type = 'button';
    draw.dataset.action = 'draw';
    draw.disabled = view.coins < view.cost;
    draw.style.opacity = draw.disabled ? '0.5' : '1';
    draw.addEventListener('click', onDraw);
    const back = el(
      'button',
      BUTTON.replace('#ffd54f', '#5b6aa8').replace('#2a3a6a', '#1b2540'),
      'Volver (M)',
    ) as HTMLButtonElement;
    back.type = 'button';
    back.dataset.action = 'back';
    back.addEventListener('click', onBack);
    if (draw.disabled) {
      rows.push(el('div', 'font-size:13px;opacity:0.75;', 'Juega partidas para ganar monedas.'));
    }
    this.root.replaceChildren(...rows, draw, back);
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}
