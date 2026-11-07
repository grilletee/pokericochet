import type { Card } from '../domain';
import { type CardTextContext, cardStep, describeCard } from './cardText';
import { type ArtLookup, buildCardArt, STEP_COLOR } from './cardView';

/**
 * DOM overlay on top of the canvas: health, a message (lost, restart hint) and an optional
 * debug panel. It only writes to the DOM when a value changes, so it adds no per-frame work.
 */
export class Overlay {
  private readonly hud: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly debug: HTMLPreElement;
  private readonly cards: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly bossBar: HTMLDivElement;
  private readonly bossFill: HTMLDivElement;
  private readonly bossLabel: HTMLDivElement;
  private lastBossKey = '';
  private toastUntil = 0;
  private shownOffers: readonly Card[] | null = null;
  private lastHud = '';
  private lastMessage = '';
  private lastDebug = '';

  constructor(host: HTMLElement) {
    const base =
      'position:absolute;pointer-events:none;font-family:system-ui,sans-serif;color:#e8ecf8;';
    this.hud = document.createElement('div');
    this.hud.dataset.hud = '';
    this.hud.style.cssText = `${base}left:12px;top:10px;font-size:18px;font-weight:600;white-space:pre;line-height:1.25;`;
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
      'justify-content:center;gap:8px;background:rgba(5,8,16,0.8);' +
      'font-family:system-ui,sans-serif;color:#e8ecf8;';
    this.toast = document.createElement('div');
    this.toast.style.cssText =
      `${base}left:50%;top:30%;transform:translateX(-50%);display:none;padding:6px 14px;` +
      'border-radius:8px;background:rgba(5,8,16,0.78);font-size:16px;font-weight:600;' +
      'text-align:center;max-width:80%;';
    // The bar of the boss (4G-C, ADR-053): wide, with a notch at half health, where the fury
    // starts, and a gold edge while the boss is exposed. At the BOTTOM again (4G-D, the author's
    // choice: "me gusta, pero debe estar abajo"); the marks that attacks leave on the floor strip are
    // tall enough to stay readable above it.
    this.bossBar = document.createElement('div');
    this.bossBar.dataset.bossBar = '';
    this.bossBar.style.cssText =
      `${base}left:6%;bottom:10px;display:none;width:88%;height:26px;border-radius:9px;` +
      'background:rgba(255,255,255,0.18);overflow:hidden;font-size:13px;font-weight:700;' +
      'line-height:22px;text-align:center;box-sizing:border-box;border:2px solid transparent;';
    this.bossFill = document.createElement('div');
    this.bossFill.style.cssText = 'position:absolute;left:0;top:0;height:100%;background:#e8503a;';
    this.bossLabel = document.createElement('div');
    this.bossLabel.style.cssText = 'position:relative;text-shadow:0 0 3px #000;';
    this.bossBar.append(this.bossFill);
    const notch = document.createElement('div');
    notch.dataset.bossNotch = '50';
    notch.style.cssText =
      'position:absolute;left:50%;top:0;width:2px;height:100%;background:#0b0e16cc;';
    this.bossBar.append(notch, this.bossLabel);
    host.append(this.hud, this.toast, this.bossBar, this.message, this.debug, this.cards);
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
    context: CardTextContext & ArtLookup,
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
    heading.textContent = '¡Subes de nivel! Elige una carta';
    heading.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:6px;';
    this.cards.append(heading);
    offers.forEach((card, index) => {
      const { title, detail } = describeCard(card, context);
      const step = cardStep(card, context);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.card = String(index);
      if (step !== null) button.dataset.step = step.kind;
      // A card that evolves a Pokémon stands out: gold border and glow (4F-D).
      const border = step !== null ? STEP_COLOR : card.kind === 'hybrid' ? '#c792ea' : '#5b6aa8';
      button.style.cssText =
        'pointer-events:auto;width:min(340px,92vw);box-sizing:border-box;padding:10px 14px;' +
        `border:${step !== null ? 3 : 2}px solid ${border};` +
        (step !== null ? `box-shadow:0 0 14px ${STEP_COLOR}88;` : '') +
        'border-radius:12px;background:#1b2540;color:inherit;font:inherit;text-align:center;cursor:pointer;';
      const name = document.createElement('div');
      name.textContent = `${index + 1}. ${title}`;
      name.style.cssText = 'font-size:17px;font-weight:700;margin-top:4px;';
      const sub = document.createElement('div');
      sub.textContent = detail;
      sub.style.cssText = 'font-size:13px;opacity:0.8;margin-top:2px;';
      button.append(buildCardArt(card, context), name, sub);
      // Not "pointerdown": that would also reach the canvas input underneath.
      button.addEventListener('click', () => onPick(index));
      this.cards.append(button);
    });
    this.cards.style.display = 'flex';
  }

  /** Shows a short message for `ms` from `now` (a performance.now() reading). */
  showToast(text: string, now: number, ms = 2500): void {
    this.toast.textContent = text;
    this.toast.style.display = 'block';
    this.toastUntil = now + ms;
  }

  /** Hides the toast once its time is up; call every frame. */
  updateToast(now: number): void {
    if (this.toastUntil !== 0 && now >= this.toastUntil) {
      this.toastUntil = 0;
      this.toast.style.display = 'none';
    }
  }

  /**
   * Boss health bar (ADR-053). `open` lights the edge gold while the core is open (the window to hit
   * it and throw the Ultimate), `warning` pulses it just before, and `rage` turns the bar dark red
   * (the fury at half health). Writes to the DOM only when what it shows changes.
   */
  setBoss(
    name: string,
    hp: number,
    maxHp: number,
    open = false,
    warning = false,
    rage = false,
  ): void {
    const visible = maxHp > 0 && hp > 0;
    const percent = visible ? Math.max(1, Math.ceil((100 * hp) / maxHp)) : 0;
    const key = `${name}|${percent}|${open}|${warning}|${rage}`;
    if (key === this.lastBossKey) return;
    this.lastBossKey = key;
    this.bossBar.style.display = visible ? 'block' : 'none';
    this.bossLabel.textContent = `${name} ${percent} %${open ? ' · ¡CARGANDO, EXPUESTO! ¡ATACA!' : warning ? ' · va a cargar…' : ''}`;
    this.bossFill.style.width = `${percent}%`;
    this.bossFill.style.background = rage ? '#a3141f' : '#e8503a';
    this.bossBar.style.borderColor = open ? '#ffd54f' : warning ? '#ffffff88' : 'transparent';
  }

  setDebug(text: string | null): void {
    const value = text ?? '';
    if (value === this.lastDebug) return;
    this.lastDebug = value;
    this.debug.textContent = value;
    this.debug.style.display = text === null ? 'none' : 'block';
  }
}
