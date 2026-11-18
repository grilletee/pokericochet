import type { GameType } from '../domain';
import { band, flash, installCinema, kicker, motes, rays, shadeHex, title } from './cinema';
import { TYPE_COLORS } from './typeColors';

/** Real milliseconds the game stops for each moment of a boss (ADR-046): short, so it does not drag. */
export const BOSS_ENTRY_MS = 1600;
export const BOSS_DEFEAT_MS = 1300;
/** The entrance of the final boss, a legendary: an event, not a cartel (4G-E). */
export const BOSS_FINAL_MS = 4200;
/**
 * 4X: "¡X se une a tu equipo!" (19th playtest: "me aparece un Froakie en el equipo y ni me he
 * enterado"): every Pokémon that joins has its moment. Short, so it does not stop the game long.
 */
export const JOIN_MS = 1100;

/** What a boss moment shows: the small line over the name, the name and what comes with it. */
export interface BossMomentView {
  readonly kicker: string;
  readonly title: string;
  readonly note?: string;
  readonly type: GameType | undefined;
  readonly spriteUrl: string | undefined;
  /**
   * A defeat bursts in the colour of the type; an entry rises; a phase flashes; 4X: a Pokémon that
   * joins comes out of a sphere of its colour that cracks open in light.
   */
  readonly style: 'entry' | 'phase' | 'defeat' | 'final' | 'join';
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
 * The full-screen moment of a boss (4G-B, ADR-046; a cut scene since 4V, block 2). The app stops the
 * game for the time of each (`GamePause`); this only draws and takes no pointer events.
 *
 * - **Entry:** a band of the colour of its type sweeps in diagonally with speed lines, the boss
 *   slides in from the side onto it and lands with a flash, its name drops in letter by letter.
 * - **The legendary:** black; its silhouette, rimmed in the colour of its type, rumbles while motes
 *   rise; a white flash reveals it in colour over turning rays, and its name comes in huge.
 * - **Defeat:** it blinks and folds into the floor, a burst of pixels and rays of gold.
 */
export class BossMoment {
  private readonly root: HTMLDivElement;
  private timer = 0;

  constructor(host: HTMLElement) {
    installCinema();
    this.root = box(
      'position:absolute;inset:0;display:none;background:rgba(5,8,16,0.6);overflow:hidden;' +
        'flex-direction:column;align-items:center;justify-content:center;gap:10px;' +
        // Over the sign of the wave (the cartel), which used to cover its top.
        'pointer-events:none;z-index:9;font-family:system-ui,sans-serif;color:#fff;text-align:center;',
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
    const back: HTMLElement[] = [];
    const front: HTMLElement[] = [];
    const over: HTMLElement[] = [];
    const big = view.style === 'final' ? 300 : view.style === 'phase' ? 140 : 240;
    const img = view.spriteUrl === undefined ? null : document.createElement('img');
    if (img !== null && view.spriteUrl !== undefined) {
      img.src = view.spriteUrl;
      img.alt = view.title;
      img.draggable = false;
      // At most 40 % of the height of the screen (a phone held sideways).
      img.style.cssText = `width:min(${big}px,40vh);height:min(${big}px,40vh);image-rendering:pixelated;position:relative;transform-origin:50% 100%;`;
    }

    if (view.style === 'entry') {
      back.push(band(color));
      if (img !== null) {
        img.style.filter = `drop-shadow(0 0 0 ${color}) drop-shadow(6px 6px 0 rgba(11,13,26,0.6))`;
        // Slides in from the right onto the band, lands with a flash, then breathes.
        animate(
          img,
          [
            { transform: 'translateX(70vw)', filter: 'brightness(1)' },
            { transform: 'translateX(0)', filter: 'brightness(1)', offset: 0.32 },
            { transform: 'translateX(0)', filter: 'brightness(5)', offset: 0.36 },
            { transform: 'translateX(0) translateY(-6px)', filter: 'brightness(1)', offset: 0.44 },
            { transform: 'translateX(0)', filter: 'brightness(1)' },
          ],
          { duration: ms, easing: 'steps(18)', fill: 'forwards' },
        );
        front.push(img);
      }
      front.push(kicker(view.kicker, shadeHex(color, 1.5)), title(view.title, color, 64, ms * 0.3));
      // The landing shakes the screen.
      animate(
        this.root,
        [
          { transform: 'translate(0,0)' },
          { transform: 'translate(0,0)', offset: 0.33 },
          { transform: 'translate(-8px,4px)', offset: 0.36 },
          { transform: 'translate(6px,-4px)', offset: 0.42 },
          { transform: 'translate(-3px,2px)', offset: 0.48 },
          { transform: 'translate(0,0)', offset: 0.54 },
        ],
        { duration: ms, easing: 'steps(1)' },
      );
    } else if (view.style === 'final') {
      // Black, motes of its colour rising, rays that come in at the reveal.
      const reveal = 0.55;
      back.push(...motes([color, shadeHex(color, 1.6), '#ffffff'], 18));
      const light = rays(color, 0.55);
      light.style.opacity = '0';
      animate(
        light,
        [
          { opacity: 0 },
          { opacity: 0, offset: reveal },
          { opacity: 0.6, offset: reveal + 0.04 },
          { opacity: 0.45 },
        ],
        { duration: ms, easing: 'steps(12)', fill: 'forwards' },
      );
      back.unshift(light);
      if (img !== null) {
        // A silhouette rimmed in its colour (so it reads on black), that grows as it rumbles; the
        // flash reveals it in colour.
        const rim = `drop-shadow(2px 0 0 ${color}) drop-shadow(-2px 0 0 ${color}) drop-shadow(0 2px 0 ${color}) drop-shadow(0 -2px 0 ${color})`;
        animate(
          img,
          [
            { filter: `brightness(0) ${rim}`, transform: 'scale(0.7)', opacity: 0, offset: 0 },
            { filter: `brightness(0) ${rim}`, transform: 'scale(0.82)', opacity: 1, offset: 0.2 },
            {
              filter: `brightness(0) ${rim}`,
              transform: 'scale(0.95)',
              opacity: 1,
              offset: reveal,
            },
            {
              filter: 'brightness(6)',
              transform: 'scale(1.12)',
              opacity: 1,
              offset: reveal + 0.03,
            },
            {
              filter: `brightness(1) drop-shadow(0 0 18px ${color})`,
              transform: 'scale(1)',
              opacity: 1,
              offset: reveal + 0.12,
            },
            {
              filter: `brightness(1) drop-shadow(0 0 18px ${color})`,
              transform: 'scale(1)',
              opacity: 1,
            },
          ],
          { duration: ms, easing: 'steps(36)', fill: 'forwards' },
        );
        front.push(img);
      }
      over.push(flash(ms * reveal, 520));
      front.push(
        kicker(view.kicker, shadeHex(color, 1.5)),
        title(view.title, color, 84, ms * (reveal + 0.05), 70),
      );
      const quake: Keyframe[] = [];
      for (let k = 0; k <= 24; k++) {
        const power = k < 13 ? 2 + k * 0.3 : k < 16 ? 10 : 3;
        quake.push({
          transform: `translate(${k % 2 === 0 ? -power : power}px,${k % 3 === 0 ? power / 2 : -power / 2}px)`,
          offset: k / 24,
        });
      }
      animate(this.root, quake, { duration: ms * 0.75, easing: 'steps(1)' });
    } else if (view.style === 'defeat') {
      back.push(rays('#ffd75a', 0.35));
      if (img !== null) {
        // It faints the way the old games did: blinks, then folds into the floor in coarse steps.
        animate(
          img,
          [
            { opacity: 1, transform: 'scaleY(1)', offset: 0 },
            { opacity: 0, transform: 'scaleY(1)', offset: 0.12 },
            { opacity: 1, transform: 'scaleY(1)', offset: 0.24 },
            { opacity: 0, transform: 'scaleY(1)', offset: 0.36 },
            { opacity: 1, transform: 'scaleY(1)', offset: 0.48 },
            { opacity: 1, transform: 'scaleY(1)', offset: 0.55 },
            { opacity: 0.9, transform: 'scaleY(0)', offset: 1 },
          ],
          { duration: ms, easing: 'steps(14)', fill: 'forwards' },
        );
        front.push(img);
      }
      // A burst of square pixels in the colour of the type, and gold.
      for (let k = 0; k < 32; k++) {
        const angle = (k / 32) * Math.PI * 2;
        const reach = 110 + (k % 4) * 46;
        const dot = box(
          `position:absolute;width:${k % 5 === 0 ? 12 : 8}px;height:${k % 5 === 0 ? 12 : 8}px;` +
            `background:${k % 3 === 0 ? '#fff7e0' : k % 3 === 1 ? '#ffd75a' : color};left:50%;top:42%;`,
        );
        over.push(dot);
        animate(
          dot,
          [
            { transform: 'translate(0,0)', opacity: 1 },
            {
              transform: `translate(${Math.cos(angle) * reach}px,${Math.sin(angle) * reach}px)`,
              opacity: 0,
            },
          ],
          { duration: ms * 0.8, delay: ms * 0.45, easing: 'steps(8)', fill: 'both' },
        );
      }
      front.push(kicker(view.kicker, '#ffd75a'), title(view.title, color, 52, ms * 0.2));
    } else if (view.style === 'join') {
      // A sphere of its colour drops in, shakes, cracks open in white light; the Pokémon pops out of
      // it and lands; rays of its colour turn behind. Original art: a plain sphere with a band.
      const open = 0.38;
      back.push(rays(color, 0.4));
      const sphere = box(
        'position:absolute;left:50%;top:44%;width:64px;height:64px;margin:-32px 0 0 -32px;' +
          `background:radial-gradient(circle at 34% 30%, #ffffff 0 10%, ${shadeHex(color, 1.35)} 11% 46%, ${color} 47% 70%, ${shadeHex(color, 0.55)} 71%);` +
          `box-shadow:0 0 0 4px #0b0d1a, inset 0 -6px 0 ${shadeHex(color, 0.45)};border-radius:50% !important;z-index:2;`,
      );
      sphere.dataset.joinSphere = '';
      animate(
        sphere,
        [
          { transform: 'translateY(-60vh) scale(0.8)', opacity: 1, offset: 0 },
          { transform: 'translateY(0) scale(1)', opacity: 1, offset: 0.16 },
          { transform: 'translateY(0) rotate(-14deg)', opacity: 1, offset: 0.22 },
          { transform: 'translateY(0) rotate(12deg)', opacity: 1, offset: 0.28 },
          { transform: 'translateY(0) rotate(0deg) scale(1)', opacity: 1, offset: open - 0.02 },
          { transform: 'scale(2.4)', opacity: 0, filter: 'brightness(6)', offset: open + 0.06 },
          { transform: 'scale(2.4)', opacity: 0, offset: 1 },
        ],
        { duration: ms, easing: 'steps(20)', fill: 'forwards' },
      );
      over.push(sphere);
      if (img !== null) {
        img.style.filter = `drop-shadow(0 0 14px ${color}) drop-shadow(6px 6px 0 rgba(11,13,26,0.6))`;
        animate(
          img,
          [
            { transform: 'scale(0)', opacity: 0, offset: 0 },
            { transform: 'scale(0)', opacity: 0, offset: open },
            { transform: 'scale(1.25)', opacity: 1, filter: 'brightness(4)', offset: open + 0.08 },
            { transform: 'scale(0.95)', opacity: 1, filter: 'brightness(1)', offset: open + 0.18 },
            { transform: 'scale(1)', opacity: 1, offset: 1 },
          ],
          { duration: ms, easing: 'steps(18)', fill: 'forwards' },
        );
        front.push(img);
      }
      // A soft flash (4W: a full white flash was too strong): 30 % of the light.
      const soft = box('position:absolute;inset:0;opacity:0.3;pointer-events:none;');
      soft.append(flash(ms * open, 260));
      over.push(soft);
      front.push(
        kicker(view.kicker, shadeHex(color, 1.5)),
        title(view.title, color, 46, ms * (open + 0.05)),
      );
    } else {
      // The fury: a flash and a shudder.
      if (img !== null) {
        animate(
          img,
          [
            { transform: 'scale(1)', filter: 'brightness(3)' },
            { transform: 'scale(1.12)', filter: 'brightness(1)' },
            { transform: 'scale(1)', filter: 'brightness(2)' },
          ],
          { duration: ms, easing: 'steps(6)', fill: 'forwards' },
        );
        front.push(img);
      }
      front.push(kicker(view.kicker, '#ff6a5a'), title(view.title, '#ff4a3a', 44));
    }
    if (view.note !== undefined) front.push(box('font-size:15px;opacity:0.9;', view.note));
    // Black bars slide in from the top and the bottom, like a cut scene.
    if (view.style === 'entry' || view.style === 'final') {
      for (const edge of ['top', 'bottom']) {
        const bar = box(
          `position:absolute;left:0;right:0;${edge}:0;height:12%;background:#0b0d1a;z-index:2;` +
            `box-shadow:0 ${edge === 'top' ? 4 : -4}px 0 0 ${color};`,
        );
        over.push(bar);
        animate(
          bar,
          [
            { transform: `translateY(${edge === 'top' ? '-100%' : '100%'})` },
            { transform: 'none' },
          ],
          { duration: ms * 0.18, easing: 'steps(5)', fill: 'both' },
        );
      }
    }
    // What is in front stands over the band and the rays.
    const stage = box(
      'position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:10px;',
    );
    stage.append(...front);
    this.root.replaceChildren(...back, stage, ...over);
    this.root.style.display = 'flex';
    this.root.dataset.style = view.style;
    this.root.style.background =
      view.style === 'defeat'
        ? `radial-gradient(${shadeHex(color, 0.6)}cc, rgba(5,8,16,0.82) 70%)`
        : view.style === 'final'
          ? 'rgba(0,0,4,0.96)'
          : 'rgba(5,8,16,0.72)';
    animate(
      this.root,
      [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.86 }, { opacity: 0 }],
      { duration: ms, easing: 'steps(10)' },
    );
    this.timer = window.setTimeout(() => this.hide(), ms);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.root.style.display = 'none';
  }
}
