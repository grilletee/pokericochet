import type { GameType, StageKind } from '../domain';
import { STEP_COLOR } from './cardView';
import { installCinema, motes, shadeHex, flash as whiteFlash } from './cinema';
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

/**
 * When the two silhouettes swap during the build-up of an evolution (4W, block 6; 18th playtest: the
 * turning rays were disliked, "más limpio"): the old and the new form take turns, slowly at first
 * and faster and faster, until the change. Times in ms from the start, all before `changeMs`; the
 * gaps shrink by `rate` and never go under `minGap`. Pure.
 */
export function swapTimes(changeMs: number, firstGap = 220, rate = 0.78, minGap = 55): number[] {
  const times: number[] = [];
  let gap = firstGap;
  let at = gap;
  while (at < changeMs - 40) {
    times.push(Math.round(at));
    gap = Math.max(minGap, gap * rate);
    at += gap;
  }
  return times;
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
      'position:absolute;inset:0;display:none;background:rgba(5,8,16,0.8);overflow:hidden;' +
        'flex-direction:column;align-items:center;justify-content:center;gap:14px;' +
        'pointer-events:none;z-index:7;font-family:system-ui,sans-serif;color:#fff;text-align:center;',
    );
    this.root.dataset.evolutionMoment = '';
    host.append(this.root);
    installCinema();
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
    // 4W, block 6: both forms as white silhouettes with the glow of the type, taking turns (the old
    // one shows first); then the new one in its colours.
    const silhouette = `brightness(0) invert(1) drop-shadow(0 0 10px ${color})`;
    const before = picture(view.fromUrl, view.from);
    before.style.filter = silhouette;
    const ghost = picture(view.toUrl, view.to);
    ghost.style.cssText += `position:absolute;left:0;top:0;opacity:0;filter:${silhouette};`;
    const after = picture(view.toUrl, view.to);
    after.style.cssText += 'position:absolute;left:0;top:0;opacity:0;';
    // A soft halo of the type behind, that breathes in steps (no rays).
    const halo = box(
      `position:absolute;inset:-40%;border-radius:50%;background:radial-gradient(${color}55 0,${color}22 40%,${color}00 70%);`,
    );
    const flash = box(
      `position:absolute;inset:-30px;border-radius:50%;background:radial-gradient(#ffffffcc,${color}00 70%);opacity:0;`,
    );
    stage.append(halo, before, ghost, after, flash);
    // 4V (block 2): a cartridge title in two bands of the colour of its type.
    const title = box(
      `font-size:${view.stage >= 3 ? 44 : 38}px;position:relative;z-index:1;max-width:90%;` +
        `--mx-hi:${shadeHex(color, 1.6)};--mx-lo:${shadeHex(color, 1.15)};`,
      this.headline(view, false),
    );
    title.dataset.mxTitle = '';
    stage.style.zIndex = '1';
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
    skip.style.position = 'relative';
    skip.style.zIndex = '1';
    const half = ms * 0.5;
    // Behind: a few faint motes; over everything, a soft white flash at the change (a third of the
    // full flash of the other moments: it marks the change without blinding).
    const softFlash = box('position:absolute;inset:0;opacity:0.3;pointer-events:none;');
    softFlash.append(whiteFlash(half - 40, 360));
    this.root.replaceChildren(
      ...motes([shadeHex(color, 1.6), '#ffffff'], 6).map((m) => {
        m.style.opacity = '0.45';
        return m;
      }),
      stage,
      title,
      skip,
      softFlash,
    );
    this.root.style.display = 'flex';

    animate(
      this.root,
      [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.88 }, { opacity: 0 }],
      { duration: ms, easing: 'ease-out' },
    );
    animate(
      halo,
      [
        { scale: '0.9', opacity: 0.6 },
        { scale: '1.08', opacity: 1 },
      ],
      {
        duration: 500,
        iterations: Number.POSITIVE_INFINITY,
        direction: 'alternate',
        easing: 'steps(4)',
      },
    );
    // The silhouettes take turns, faster and faster; each swap is a small pulse.
    swapTimes(half).forEach((at, i) => {
      this.later(at, () => {
        const showNew = i % 2 === 0;
        before.style.opacity = showNew ? '0' : '1';
        ghost.style.opacity = showNew ? '1' : '0';
        animate(stage, [{ scale: '1.06' }, { scale: '1' }], { duration: 90, easing: 'steps(2)' });
      });
    });
    this.later(half, () => {
      before.style.display = 'none';
      ghost.style.display = 'none';
      after.style.opacity = '1';
      title.textContent = this.headline(view, true);
      animate(flash, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: 'ease-out' });
      // From white to its colours in four steps, with a small bounce.
      animate(
        after,
        [
          { filter: silhouette, scale: '1.12' },
          { filter: 'none', scale: '1' },
        ],
        { duration: 320, easing: 'steps(4)' },
      );
      this.burst(stage, [color, shadeHex(color, 1.6), '#ffffff'], size);
    });
    this.later(ms, () => this.finish());
  }

  /** A few square sparks that leave the centre once, at the change (discreet: 10, small). */
  private burst(stage: HTMLElement, colors: readonly string[], size: number): void {
    for (let k = 0; k < 10; k++) {
      const angle = (k / 10) * Math.PI * 2 + 0.3;
      const reach = size * (0.55 + (k % 3) * 0.12);
      const spark = box(
        `position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;` +
          `background:${colors[k % colors.length] ?? '#fff'};box-shadow:0 0 0 2px #0b0d1a55;`,
      );
      stage.append(spark);
      animate(
        spark,
        [
          { translate: '0 0', opacity: 1 },
          {
            translate: `${Math.round(Math.cos(angle) * reach)}px ${Math.round(Math.sin(angle) * reach)}px`,
            opacity: 0,
          },
        ],
        { duration: 520 + (k % 4) * 60, easing: 'steps(6)', fill: 'forwards' },
      );
    }
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
