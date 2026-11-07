import type { GameType, StageKind } from '../domain';
import { STEP_COLOR } from './cardView';
import { pokemonName } from './names';
import { TYPE_COLORS } from './typeColors';

/**
 * Real milliseconds the game stops for a stage step: about two seconds, a little longer for the
 * maximum stage (4H-B1; one second in 4F-E was "a bit short to see it well"). The 4F-D slow motion
 * was dropped: "it cuts the rhythm and feels odd". Space or its button skips it (`GamePause.skip`).
 */
export function pauseMs(stage: number): number {
  return stage >= 3 ? 2400 : 2000;
}

/** A skip counts only after this long, so the tap that was meant for the game does not cancel it. */
export const SKIP_GRACE_MS = 300;

/**
 * The pause of the app while an evolution plays in the foreground. The run is paused at the app
 * level (no tick is taken, so it is the same run). A new step while one plays extends the pause to
 * the later end: they merge into one moment. Pure: the clock is given, never read.
 */
export class GamePause {
  private until = Number.NEGATIVE_INFINITY;
  private since = Number.NEGATIVE_INFINITY;

  /** Starts (or extends) a pause of `ms` from `now`. */
  start(now: number, ms: number): void {
    if (now >= this.until) this.since = now;
    this.until = Math.max(this.until, now + ms);
  }

  /** Queues `ms` more after what is already on: the steps of a chain play one after another. */
  add(now: number, ms: number): void {
    if (now >= this.until) this.since = now;
    this.until = Math.max(this.until, now) + ms;
  }

  /** True while the game is stopped. */
  active(now: number): boolean {
    return now < this.until;
  }

  /**
   * Ends the pause early (a tap or a key). Returns true if it did: nothing happens when no pause
   * is on or when it started less than `SKIP_GRACE_MS` ago.
   */
  skip(now: number): boolean {
    if (!this.active(now) || now - this.since < SKIP_GRACE_MS) return false;
    this.until = Number.NEGATIVE_INFINITY;
    return true;
  }

  reset(): void {
    this.until = Number.NEGATIVE_INFINITY;
    this.since = Number.NEGATIVE_INFINITY;
  }
}

/**
 * Real seconds a run spends paused by evolutions (M16 of the fun bench). While paused no tick is
 * taken, so two steps on different ticks never overlap; steps on the same tick merge into one
 * pause of the longest of them.
 */
export function pauseSeconds(
  steps: readonly { readonly tick: number; readonly stage: number }[],
): number {
  let total = 0;
  for (const step of steps) total += pauseMs(step.stage);
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
 * The evolution moment (4F-D, pause instead of slow motion in 4F-E, polished in 4E): the game is
 * paused by the app (`GamePause`) while the screen dims and the old form shows as a glowing
 * silhouette in the foreground; a flash changes it into the new form and the name of what it
 * became appears big in the centre. Only its skip button takes pointer events; it ends by itself,
 * or earlier when the app skips the pause (the button or Space; the app calls `hide`).
 */
export class EvolutionMoment {
  private readonly root: HTMLDivElement;
  private timers: number[] = [];
  private queue: { view: MomentView; ms: number }[] = [];
  private onSkip: () => void = () => {};

  /** Called when the visible skip button is pressed (the app decides if the grace has passed). */
  setOnSkip(handler: () => void): void {
    this.onSkip = handler;
  }

  constructor(host: HTMLElement) {
    this.root = box(
      'position:absolute;inset:0;display:none;background:rgba(5,8,16,0.72);' +
        'flex-direction:column;align-items:center;justify-content:center;gap:14px;' +
        'pointer-events:none;z-index:7;font-family:system-ui,sans-serif;color:#fff;text-align:center;',
    );
    this.root.dataset.evolutionMoment = '';
    host.append(this.root);
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  /**
   * Plays one step. While another is playing the new one WAITS its turn: a Pokémon that crosses
   * two stages at once shows both forms in order (Bagon, Shelgon, Salamence), never a jump (4G-E).
   */
  show(view: MomentView, ms: number, fromQueue = false): void {
    if (!fromQueue && this.visible) {
      this.queue.push({ view, ms });
      return;
    }
    this.clearTimers();
    const color = view.type === undefined ? STEP_COLOR : TYPE_COLORS[view.type];
    const size = view.stage >= 3 ? 220 : 180;
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
      `font-size:${view.stage >= 3 ? 40 : 34}px;font-weight:900;letter-spacing:0.5px;` +
        `text-shadow:0 2px 0 #000,0 0 14px ${color};`,
      this.headline(view, false),
    );
    // A visible button for the phone; the keyboard uses Space. Nothing else skips (9th playtest:
    // "I hit A by accident and skipped one I did not want to").
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.dataset.evolutionSkip = '';
    skip.textContent = 'Saltar [Espacio]';
    skip.style.cssText =
      'margin-top:10px;min-height:44px;padding:0 18px;border-radius:22px;border:1px solid #ffffff88;' +
      'background:#0b0e16cc;color:#e8ecf8;font:700 14px system-ui;cursor:pointer;pointer-events:auto;';
    skip.addEventListener('click', () => this.onSkip());
    this.root.replaceChildren(stage, title, skip);
    this.root.style.display = 'flex';

    const half = ms * 0.45;
    animate(
      this.root,
      [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }],
      { duration: ms, easing: 'ease-out' },
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
    this.later(ms, () => this.finish());
  }

  /** The step that was playing is over: the next one of the chain, or nothing. */
  private finish(): void {
    const next = this.queue.shift();
    if (next !== undefined) {
      this.show(next.view, next.ms, true);
      return;
    }
    this.hide();
  }

  /** Stops everything, the queued steps too (a skip). */
  hide(): void {
    this.clearTimers();
    this.queue = [];
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
