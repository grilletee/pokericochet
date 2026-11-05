import type { GameType, StageKind } from '../domain';
import { STEP_COLOR } from './cardView';
import { pokemonName } from './names';
import { TYPE_COLORS } from './typeColors';

/** Speed of the game while a stage step plays (4F-D): the loop of the app slows down, the sim does not change. */
export const SLOW_SCALE = 0.35;

/** Real milliseconds a stage step slows the game: a step to stage 3 lasts longer than one to 2. */
export function slowMs(stage: number): number {
  return stage >= 3 ? 1300 : 800;
}

/**
 * The slow motion of the app (4F-D). A new step while one plays extends it to the longer end: they
 * merge into one moment instead of stacking. Pure: the clock is given, never read.
 */
export class SlowMotion {
  private until = Number.NEGATIVE_INFINITY;

  /** Starts (or extends) a slow moment of `ms` from `now`. */
  start(now: number, ms: number): void {
    this.until = Math.max(this.until, now + ms);
  }

  /** The factor to apply to the frame's elapsed time. */
  scale(now: number): number {
    return now < this.until ? SLOW_SCALE : 1;
  }

  reset(): void {
    this.until = Number.NEGATIVE_INFINITY;
  }
}

/**
 * Real seconds of slow motion a run spends (M16 of the fun bench): the steps of `steps` merge when
 * one starts before the previous moment is over. `tickMs` is the real length of a tick at normal
 * speed; during a moment a tick takes 1 / SLOW_SCALE times longer.
 */
export function slowSeconds(
  steps: readonly { readonly tick: number; readonly stage: number }[],
  tickMs: number,
): number {
  let total = 0;
  let wall = 0; // real ms since the start of the run, advanced tick by tick
  let lastTick = 0;
  let until = Number.NEGATIVE_INFINITY;
  for (const step of steps) {
    // Ticks between two steps take 1 / SLOW_SCALE times longer while a moment is still running.
    const ticks = step.tick - lastTick;
    const slowTicks = Math.min(ticks, Math.max(0, ((until - wall) * SLOW_SCALE) / tickMs));
    wall += (slowTicks * tickMs) / SLOW_SCALE + (ticks - slowTicks) * tickMs;
    lastTick = step.tick;
    const end = wall + slowMs(step.stage);
    if (end > until) {
      total += end - Math.max(until, wall);
      until = end;
    }
  }
  return total / 1000;
}

function box(css: string, text = ''): HTMLDivElement {
  const node = document.createElement('div');
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

function animate(
  element: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  return typeof element.animate === 'function' ? element.animate(keyframes, options) : null;
}

/** What the moment needs to draw one step: both forms, their art and what kind of step it is. */
export interface MomentView {
  readonly kind: StageKind;
  readonly stage: number;
  readonly type: GameType | undefined;
  readonly from: string;
  readonly to: string;
  readonly fromUrl: string | undefined;
  readonly toUrl: string | undefined;
}

/**
 * The evolution moment (4F-D, polished in 4E): while the game runs in slow motion, the old form
 * shows as a glowing silhouette, a flash changes it into the new form and the name of what it
 * became appears big in the centre. It never takes pointer events and never pauses the game.
 */
export class EvolutionMoment {
  private readonly root: HTMLDivElement;
  private timers: number[] = [];

  constructor(host: HTMLElement) {
    this.root = box(
      'position:absolute;left:50%;top:34%;transform:translateX(-50%);display:none;' +
        'flex-direction:column;align-items:center;gap:8px;pointer-events:none;z-index:7;' +
        'font-family:system-ui,sans-serif;color:#fff;text-align:center;',
    );
    this.root.dataset.evolutionMoment = '';
    host.append(this.root);
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  show(view: MomentView, ms: number): void {
    this.clearTimers();
    const color = view.type === undefined ? STEP_COLOR : TYPE_COLORS[view.type];
    const size = view.stage >= 3 ? 150 : 120;
    const picture = (url: string | undefined, form: string): HTMLElement => {
      if (url === undefined) {
        return box(`font-size:${size / 2}px;font-weight:800;`, pokemonName(form).charAt(0));
      }
      const img = document.createElement('img');
      img.src = url;
      img.alt = pokemonName(form);
      img.draggable = false;
      img.style.cssText = `width:${size}px;height:${size}px;image-rendering:pixelated;`;
      return img;
    };
    const stage = box(`position:relative;width:${size}px;height:${size}px;`);
    const before = picture(view.fromUrl, view.from);
    // The old form as a white silhouette with the glow of its type.
    before.style.filter = `brightness(0) invert(1) drop-shadow(0 0 12px ${color})`;
    const after = picture(view.toUrl, view.to);
    after.style.cssText += 'position:absolute;left:0;top:0;opacity:0;';
    const flash = box(
      `position:absolute;inset:-30px;border-radius:50%;background:radial-gradient(#fff,${color}00 70%);opacity:0;`,
    );
    stage.append(before, after, flash);
    const title = box(
      `font-size:${view.stage >= 3 ? 34 : 28}px;font-weight:900;letter-spacing:0.5px;` +
        `text-shadow:0 2px 0 #000,0 0 14px ${color};`,
      this.headline(view, false),
    );
    this.root.replaceChildren(stage, title);
    this.root.style.display = 'flex';

    const half = ms * 0.55;
    animate(
      this.root,
      [
        { opacity: 0, transform: 'translateX(-50%) scale(0.6)' },
        { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.18 },
        { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.85 },
        { opacity: 0, transform: 'translateX(-50%) scale(1.15)' },
      ],
      { duration: ms + 900, easing: 'ease-out' },
    );
    animate(before, [{ opacity: 0.55 }, { opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], {
      duration: half,
      iterations: 1,
    });
    this.later(half, () => {
      before.style.display = 'none';
      after.style.opacity = '1';
      title.textContent = this.headline(view, true);
      animate(flash, [{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' });
      animate(after, [{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], {
        duration: 450,
        easing: 'ease-out',
      });
    });
    this.later(ms + 900, () => this.hide());
  }

  hide(): void {
    this.clearTimers();
    this.root.style.display = 'none';
  }

  private headline(view: MomentView, done: boolean): string {
    const name = pokemonName(done ? view.to : view.from);
    if (!done) {
      return view.kind === 'evolve' ? `¡${name} está evolucionando!` : `¡${name} se transforma!`;
    }
    switch (view.kind) {
      case 'evolve':
        return `¡${name}!`;
      case 'awaken':
        return `¡${name} despierta!`;
      case 'peak':
        return `¡${name}, máximo poder!`;
    }
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
  }
}
