import type { GameType } from '../domain';
import { pokemonName } from './names';
import { PALETTE, pixelFrame } from './pixelStyle';
import { TYPE_COLORS } from './typeColors';

/** What the capture of a boss shows this frame, in host pixels (the app converts from the arena). */
export interface CatchViewState {
  readonly form: string;
  readonly type: GameType | undefined;
  readonly spriteUrl: string | undefined;
  /** Centre of the boss and its body radius, the ring radius (host pixels). */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly ring: number;
  /** The chance a throw that lands now captures it (0..1) and how much of the window is left (1..0). */
  readonly chance: number;
  readonly left: number;
  /** How to throw, by the control scheme (a click, a tap...). */
  readonly how: string;
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

/** The colour of the ring for a chance: the warmer, the worse (never the red of danger). */
export function ringColor(chance: number): string {
  return chance >= 0.6 ? PALETTE.lime : chance >= 0.35 ? PALETTE.yellow : PALETTE.orange;
}

/** "62 %". */
export function chanceText(chance: number): string {
  return `${Math.round(Math.max(0, Math.min(1, chance)) * 100)} %`;
}

/** Real milliseconds the throw plays for: the sphere flies, shakes three times, and decides. */
export const THROW_MS = 1500;

/**
 * 4X, block 1: the capture of a defeated boss (19th playtest: "debería abrirse la posibilidad de
 * conseguirlo y tener que hacer algo"). Over the field: the boss, weakened (it blinks, it sways), a
 * ring around it that narrows and starts again, coloured by the chance; on top, its name, the chance
 * now in big digits, a bar of the time left and how to throw. Then the throw: the sphere flies to
 * where it was aimed, shakes three times and either clicks shut (stars) or bursts open (it fled).
 * Only draws; the throw is the app's command (`Command.throw`).
 */
export class CatchView {
  private readonly root: HTMLDivElement;
  private readonly sprite: HTMLImageElement;
  private readonly ring: HTMLDivElement;
  private readonly head: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly chance: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly how: HTMLDivElement;
  private shownForm = '';

  constructor(host: HTMLElement) {
    this.root = box('position:absolute;inset:0;display:none;pointer-events:none;z-index:7;');
    this.root.dataset.catch = '';
    this.sprite = document.createElement('img');
    this.sprite.draggable = false;
    this.sprite.style.cssText =
      'position:absolute;image-rendering:pixelated;transform:translate(-50%,-50%);' +
      'filter:drop-shadow(0 0 6px #fff8) saturate(0.7);';
    this.sprite.dataset.catchSprite = '';
    this.ring = box(
      'position:absolute;border-radius:50% !important;transform:translate(-50%,-50%);' +
        'box-sizing:border-box;',
    );
    this.ring.dataset.catchRing = '';
    this.head = box(
      // Low on the field: the bosses stand in its upper half, so the ring is never under it.
      'position:absolute;left:50%;bottom:20%;transform:translateX(-50%);display:flex;' +
        'flex-direction:column;align-items:center;gap:6px;padding:10px 18px;min-width:280px;' +
        `background:rgba(20,23,43,0.92);color:${PALETTE.cream};text-align:center;` +
        pixelFrame(PALETTE.yellow),
    );
    this.title = box(`font-size:20px;font-weight:700;color:${PALETTE.yellow};`);
    this.chance = box('font-size:40px;font-weight:700;line-height:1;');
    this.chance.dataset.catchChance = '';
    const track = box(`width:240px;height:8px;background:${PALETTE.slate};`);
    this.bar = box(`height:100%;width:100%;background:${PALETTE.cyan};`);
    track.append(this.bar);
    this.how = box('font-size:13px;opacity:0.92;max-width:320px;');
    this.head.append(
      this.title,
      box('font-size:12px;opacity:0.85;', 'Probabilidad de captura si aciertas ahora'),
      this.chance,
      track,
      this.how,
    );
    this.root.append(this.ring, this.sprite, this.head);
    host.append(this.root);
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  /** Draws the capture of this frame, or hides it with null. */
  update(view: CatchViewState | null, now: number): void {
    if (view === null) {
      if (this.root.style.display !== 'none') this.root.style.display = 'none';
      this.shownForm = '';
      return;
    }
    if (this.shownForm !== view.form) {
      this.shownForm = view.form;
      this.title.textContent = `¡${pokemonName(view.form)} está debilitado!`;
      if (view.spriteUrl !== undefined) this.sprite.src = view.spriteUrl;
      this.sprite.alt = pokemonName(view.form);
      animate(
        this.head,
        [
          { transform: 'translate(-50%,40px)', opacity: 0 },
          { transform: 'translate(-50%,0)', opacity: 1 },
        ],
        {
          duration: 260,
          easing: 'steps(6)',
        },
      );
    }
    this.root.style.display = 'block';
    const size = view.radius * 2.2;
    this.sprite.style.width = `${size}px`;
    this.sprite.style.height = `${size}px`;
    this.sprite.style.left = `${view.x}px`;
    this.sprite.style.top = `${view.y}px`;
    // Weakened: it blinks now and then.
    this.sprite.style.opacity = Math.floor(now / 140) % 7 === 0 ? '0.45' : '1';
    const color = ringColor(view.chance);
    const d = view.ring * 2;
    this.ring.style.width = `${d}px`;
    this.ring.style.height = `${d}px`;
    this.ring.style.left = `${view.x}px`;
    this.ring.style.top = `${view.y}px`;
    this.ring.style.border = `4px solid ${color}`;
    this.ring.style.boxShadow = `0 0 0 2px ${PALETTE.ink}, inset 0 0 0 2px ${PALETTE.ink}, 0 0 18px ${color}`;
    this.chance.textContent = chanceText(view.chance);
    this.chance.style.color = color;
    this.bar.style.width = `${Math.round(view.left * 100)}%`;
    this.bar.style.background = view.left < 0.3 ? PALETTE.orange : PALETTE.cyan;
    this.how.textContent = view.how;
  }

  /**
   * The throw (`THROW_MS`): the sphere flies from the launcher to where it was aimed; if it landed in
   * the ring it shakes three times and then clicks shut with stars (`caught`) or bursts (it fled);
   * a miss flies past and the boss runs.
   */
  playThrow(
    from: { x: number; y: number },
    to: { x: number; y: number },
    hit: boolean,
    caught: boolean,
    type: GameType | undefined,
  ): void {
    const color = type === undefined ? PALETTE.blue : TYPE_COLORS[type];
    const layer = box('position:absolute;inset:0;pointer-events:none;z-index:8;');
    layer.dataset.catchThrow = caught ? 'caught' : hit ? 'broke' : 'missed';
    const sphere = box(
      `position:absolute;left:${from.x}px;top:${from.y}px;width:30px;height:30px;margin:-15px 0 0 -15px;` +
        `background:radial-gradient(circle at 34% 30%, #ffffff 0 12%, ${color} 13% 64%, ${PALETTE.ink} 65%);` +
        `border-radius:50% !important;box-shadow:0 0 0 3px ${PALETTE.ink};`,
    );
    layer.append(sphere);
    this.root.parentElement?.append(layer);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const fly = 0.25;
    const frames: Keyframe[] = [
      { transform: 'translate(0,0) scale(0.8)', offset: 0 },
      { transform: `translate(${dx / 2}px,${dy / 2 - 80}px) scale(1.1)`, offset: fly / 2 },
      { transform: `translate(${dx}px,${dy}px) scale(1)`, offset: fly },
    ];
    if (!hit) {
      frames.push({
        transform: `translate(${dx * 1.4}px,${dy * 1.4 - 40}px) scale(0.6)`,
        opacity: 0,
        offset: 0.5,
      });
      frames.push({
        transform: `translate(${dx * 1.4}px,${dy * 1.4 - 40}px) scale(0.6)`,
        opacity: 0,
        offset: 1,
      });
    } else {
      // Three shakes, then the verdict.
      for (let k = 0; k < 3; k++) {
        const at = fly + 0.1 + k * 0.17;
        frames.push({ transform: `translate(${dx}px,${dy}px) rotate(0deg)`, offset: at });
        frames.push({
          transform: `translate(${dx}px,${dy}px) rotate(${k % 2 === 0 ? -22 : 22}deg)`,
          offset: at + 0.05,
        });
        frames.push({ transform: `translate(${dx}px,${dy}px) rotate(0deg)`, offset: at + 0.1 });
      }
      frames.push(
        caught
          ? {
              transform: `translate(${dx}px,${dy}px) scale(1.15)`,
              filter: 'brightness(2)',
              offset: 0.95,
            }
          : {
              transform: `translate(${dx}px,${dy}px) scale(2.2)`,
              opacity: 0,
              filter: 'brightness(5)',
              offset: 0.95,
            },
      );
      frames.push(
        caught
          ? { transform: `translate(${dx}px,${dy}px) scale(1)`, filter: 'brightness(1)', offset: 1 }
          : { transform: `translate(${dx}px,${dy}px) scale(2.2)`, opacity: 0, offset: 1 },
      );
    }
    animate(sphere, frames, { duration: THROW_MS, easing: 'steps(30)', fill: 'forwards' });
    // The weakened boss vanishes into the sphere when it lands inside the ring.
    if (hit) {
      animate(
        this.sprite,
        [
          { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
          { opacity: 0, transform: 'translate(-50%,-50%) scale(0.1)' },
        ],
        {
          duration: THROW_MS * 0.08,
          delay: THROW_MS * fly,
          fill: 'forwards',
        },
      );
    }
    const verdict = box(
      `position:absolute;left:${to.x}px;top:${to.y - 70}px;transform:translateX(-50%);` +
        `font-size:30px;font-weight:700;white-space:nowrap;text-shadow:3px 3px 0 ${PALETTE.ink};` +
        `color:${caught ? PALETTE.lime : PALETTE.orange};opacity:0;`,
      caught ? '¡Capturado!' : hit ? '¡Se ha escapado!' : '¡Fallaste!',
    );
    verdict.dataset.catchVerdict = '';
    layer.append(verdict);
    animate(verdict, [{ opacity: 0 }, { opacity: 1 }, { opacity: 1 }], {
      duration: THROW_MS * 0.2,
      delay: hit ? THROW_MS * 0.8 : THROW_MS * 0.3,
      fill: 'forwards',
    });
    window.setTimeout(() => layer.remove(), THROW_MS + 600);
  }
}
