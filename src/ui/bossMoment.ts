import type { GameType } from '../domain';
import { TYPE_COLORS } from './typeColors';

/** Real milliseconds the game stops for each moment of a boss (ADR-046): short, so it does not drag. */
export const BOSS_ENTRY_MS = 1600;
export const BOSS_DEFEAT_MS = 700;

/** What a boss moment shows: the small line over the name, the name and what comes with it. */
export interface BossMomentView {
  readonly kicker: string;
  readonly title: string;
  readonly note?: string;
  readonly type: GameType | undefined;
  readonly spriteUrl: string | undefined;
  /** A defeat bursts in the colour of the type; an entry rises; a phase flashes. */
  readonly style: 'entry' | 'phase' | 'defeat';
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

/**
 * The full-screen moment of a boss (4G-B, ADR-046): its entry with the name big and the type, the
 * change of phase and its defeat with a burst of colour and what it leaves behind. The app stops
 * the game for the time of each (`GamePause`); this only draws and takes no pointer events.
 */
export class BossMoment {
  private readonly root: HTMLDivElement;
  private timer = 0;

  constructor(host: HTMLElement) {
    this.root = box(
      'position:absolute;inset:0;display:none;background:rgba(5,8,16,0.6);' +
        'flex-direction:column;align-items:center;justify-content:center;gap:8px;' +
        'pointer-events:none;z-index:6;font-family:system-ui,sans-serif;color:#fff;text-align:center;',
    );
    this.root.dataset.bossMoment = '';
    host.append(this.root);
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  show(view: BossMomentView, ms: number): void {
    window.clearTimeout(this.timer);
    const color = view.type === undefined ? '#ffd54f' : TYPE_COLORS[view.type];
    const children: HTMLElement[] = [];
    if (view.spriteUrl !== undefined) {
      const img = document.createElement('img');
      img.src = view.spriteUrl;
      img.alt = view.title;
      img.draggable = false;
      img.style.cssText = `width:${view.style === 'phase' ? 120 : 170}px;height:${view.style === 'phase' ? 120 : 170}px;image-rendering:pixelated;filter:drop-shadow(0 0 14px ${color});`;
      children.push(img);
      animate(
        img,
        view.style === 'defeat'
          ? [
              { transform: 'scale(1)', opacity: 1 },
              { transform: 'scale(1.5)', opacity: 0 },
            ]
          : [
              { transform: 'translateY(60px) scale(0.6)', opacity: 0 },
              { transform: 'translateY(0) scale(1)', opacity: 1 },
            ],
        { duration: ms * 0.7, easing: 'ease-out', fill: 'forwards' },
      );
    }
    children.push(
      box(`font-size:15px;font-weight:800;letter-spacing:2px;color:${color};`, view.kicker),
      box(`font-size:38px;font-weight:900;text-shadow:0 2px 0 #000,0 0 14px ${color};`, view.title),
    );
    if (view.note !== undefined) children.push(box('font-size:15px;opacity:0.9;', view.note));
    this.root.replaceChildren(...children);
    this.root.style.display = 'flex';
    this.root.dataset.style = view.style;
    this.root.style.background =
      view.style === 'defeat'
        ? `radial-gradient(${color}cc, rgba(5,8,16,0.7) 70%)`
        : 'rgba(5,8,16,0.6)';
    animate(
      this.root,
      [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
      {
        duration: ms,
      },
    );
    this.timer = window.setTimeout(() => this.hide(), ms);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.root.style.display = 'none';
  }
}
