import { PALETTE, pixelFrame } from './pixelStyle';

/**
 * How the cue says to throw the Ultimate (4X): the chosen key and the right click on a desktop, the
 * ULTI button on a touch screen. Pure.
 */
export function ultimateHint(touch: boolean, keyLabel: string): string {
  return touch ? 'Toca ULTI o el retrato que brilla' : `Pulsa ${keyLabel} o clic derecho`;
}

/**
 * 4X, block 4 (19th playtest, the author's cousin: "no te enteras bien de cuándo lo tienes"): a big
 * cue over the launcher for as long as the Ultimate is ready, not only the first time: "¡ULTIMATE
 * LISTA!" and how to throw it, breathing in the colour of the starter. It takes no pointer events and
 * costs nothing while nothing changes.
 */
export class UltimateCue {
  private readonly root: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private shown = false;
  private key = '';

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.dataset.ultimateCue = '';
    this.root.style.cssText =
      'position:absolute;left:50%;bottom:20%;transform:translateX(-50%);display:none;' +
      'flex-direction:column;align-items:center;gap:2px;padding:6px 14px;z-index:6;' +
      `pointer-events:none;background:rgba(20,23,43,0.86);color:${PALETTE.cream};text-align:center;`;
    const title = document.createElement('div');
    title.textContent = '¡ULTIMATE LISTA!';
    title.style.cssText = `font-size:24px;font-weight:700;letter-spacing:2px;color:${PALETTE.yellow};text-shadow:3px 3px 0 ${PALETTE.ink};`;
    this.hint = document.createElement('div');
    this.hint.style.cssText = 'font-size:13px;';
    this.root.append(title, this.hint);
    host.append(this.root);
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Shows the cue while `ready`, in `color` (the starter's type), with how to throw it. */
  update(ready: boolean, color: string, hint: string): void {
    if (ready === this.shown && hint === this.key) return;
    this.key = hint;
    this.hint.textContent = hint;
    if (ready === this.shown) return;
    this.shown = ready;
    this.root.style.display = ready ? 'flex' : 'none';
    if (!ready) return;
    this.root.style.cssText += pixelFrame(color);
    if (typeof this.root.animate === 'function') {
      this.root.animate(
        [
          { transform: 'translateX(-50%) scale(1)' },
          { transform: 'translateX(-50%) scale(1.08)' },
          { transform: 'translateX(-50%) scale(1)' },
        ],
        { duration: 800, iterations: Number.POSITIVE_INFINITY, easing: 'steps(6)' },
      );
    }
  }
}
