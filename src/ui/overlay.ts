import type { Card } from '../domain';
import { type CardTextContext, describeCard } from './cardText';

/**
 * DOM overlay on top of the canvas: health, a message (lost, restart hint) and an optional
 * debug panel. It only writes to the DOM when a value changes, so it adds no per-frame work.
 */
export class Overlay {
  private readonly hud: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly debug: HTMLPreElement;
  private readonly cards: HTMLDivElement;
  private shownOffers: readonly Card[] | null = null;
  private lastHud = '';
  private lastMessage = '';
  private lastDebug = '';

  constructor(host: HTMLElement) {
    const base =
      'position:absolute;pointer-events:none;font-family:system-ui,sans-serif;color:#e8ecf8;';
    this.hud = document.createElement('div');
    this.hud.style.cssText = `${base}left:12px;top:10px;font-size:18px;font-weight:600;`;
    this.message = document.createElement('div');
    this.message.style.cssText =
      `${base}inset:0;display:none;align-items:center;justify-content:center;` +
      'text-align:center;font-size:26px;font-weight:700;background:rgba(5,8,16,0.6);white-space:pre-line;';
    this.debug = document.createElement('pre');
    this.debug.style.cssText =
      `${base}right:8px;top:8px;margin:0;font-size:12px;line-height:1.35;` +
      'background:rgba(5,8,16,0.7);padding:6px 8px;border-radius:4px;display:none;';
    this.cards = document.createElement('div');
    this.cards.style.cssText =
      'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:10px;background:rgba(5,8,16,0.72);' +
      'font-family:system-ui,sans-serif;color:#e8ecf8;';
    host.append(this.hud, this.message, this.debug, this.cards);
  }

  setHud(text: string): void {
    if (text === this.lastHud) return;
    this.lastHud = text;
    this.hud.textContent = text;
  }

  /** Shows a centred message, or hides it with null. */
  setMessage(text: string | null): void {
    const value = text ?? '';
    if (value === this.lastMessage) return;
    this.lastMessage = value;
    this.message.textContent = value;
    this.message.style.display = text === null ? 'none' : 'flex';
  }

  /**
   * Shows the cards of a level-up, or hides them with null. `onPick` receives the index of the
   * chosen card (button click; the keyboard shortcuts 1-3 are handled by the input layer).
   * Calling it again with the same offers does nothing, so it can be called every frame.
   */
  setCards(
    offers: readonly Card[] | null,
    context: CardTextContext,
    onPick: (index: number) => void,
  ): void {
    if (offers === this.shownOffers) return;
    this.shownOffers = offers;
    this.cards.replaceChildren();
    if (offers === null) {
      this.cards.style.display = 'none';
      return;
    }
    const heading = document.createElement('div');
    heading.textContent = '¡Subes de nivel! Elige una mejora';
    heading.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:6px;';
    this.cards.append(heading);
    offers.forEach((card, index) => {
      const { title, detail } = describeCard(card, context);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.card = String(index);
      button.style.cssText =
        'pointer-events:auto;min-width:260px;padding:12px 16px;border:2px solid #5b6aa8;' +
        'border-radius:10px;background:#1b2540;color:inherit;font:inherit;text-align:left;cursor:pointer;';
      const name = document.createElement('div');
      name.textContent = `${index + 1}. ${title}`;
      name.style.cssText = 'font-size:18px;font-weight:700;';
      const sub = document.createElement('div');
      sub.textContent = detail;
      sub.style.cssText = 'font-size:14px;opacity:0.8;margin-top:2px;';
      button.append(name, sub);
      // Not "pointerdown": that would also reach the canvas input underneath.
      button.addEventListener('click', () => onPick(index));
      this.cards.append(button);
    });
    this.cards.style.display = 'flex';
  }

  setDebug(text: string | null): void {
    const value = text ?? '';
    if (value === this.lastDebug) return;
    this.lastDebug = value;
    this.debug.textContent = value;
    this.debug.style.display = text === null ? 'none' : 'block';
  }
}
