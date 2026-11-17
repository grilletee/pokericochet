/**
 * The language of the key moments (4V, block 2; art bible §6-7): a boss that enters, the legendary,
 * an evolution, the end of a run. Every one is a short cut scene built from the same few pieces, in
 * pixel art and stepped animation (no smooth easing): a diagonal band in the colour of the type with
 * speed lines, rays of light that turn, a white flash, motes that rise, and a cartridge title (two
 * bands of colour, a hard ink shadow). One stylesheet, installed once; plain CSS animations that the
 * browser plays while the game is paused, so they cost nothing on the field.
 */

const INK = '#0b0d1a';

const STYLE = `
@keyframes mx-in{0%{opacity:0}100%{opacity:1}}
@keyframes mx-band{0%{transform:skewY(-6deg) scaleY(0)}100%{transform:skewY(-6deg) scaleY(1)}}
@keyframes mx-speed{0%{background-position:0 0}100%{background-position:-256px 0}}
@keyframes mx-slide-r{0%{transform:translateX(70vw)}100%{transform:translateX(0)}}
@keyframes mx-slide-l{0%{transform:translateX(-70vw)}100%{transform:translateX(0)}}
@keyframes mx-land{0%,100%{filter:brightness(1)}30%,60%{filter:brightness(5)}}
@keyframes mx-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes mx-turn{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
@keyframes mx-flash{0%{opacity:0}10%{opacity:1}100%{opacity:0}}
@keyframes mx-rise{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(-62vh);opacity:0}}
@keyframes mx-fall{0%{transform:translateY(-10vh) rotate(0)}100%{transform:translateY(105vh) rotate(540deg)}}
@keyframes mx-drop{0%{transform:translateY(-60px);opacity:0}60%{transform:translateY(6px);opacity:1}100%{transform:translateY(0);opacity:1}}
@keyframes mx-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
[data-mx]{position:absolute;pointer-events:none}
[data-mx="band"]{left:-10%;right:-10%;top:33%;height:34%;transform-origin:50% 50%;
  animation:mx-band 200ms steps(4) both;box-shadow:0 -6px 0 0 var(--mx-edge),0 6px 0 0 var(--mx-edge),0 -12px 0 0 ${INK},0 12px 0 0 ${INK}}
[data-mx="speed"]{inset:0;opacity:0.5;animation:mx-speed 600ms steps(8) infinite;
  background:repeating-linear-gradient(90deg,rgba(255,255,255,0.22) 0 20px,transparent 20px 64px,rgba(255,255,255,0.1) 64px 72px,transparent 72px 128px)}
[data-mx="rays"]{left:50%;top:50%;width:160vmax;height:160vmax;margin:-80vmax 0 0 -80vmax;
  animation:mx-turn 9s steps(48) infinite;
  background:repeating-conic-gradient(from 0deg,var(--mx-ray) 0deg 7deg,transparent 7deg 22deg);
  -webkit-mask:radial-gradient(circle,#000 0,#000 18%,transparent 60%);mask:radial-gradient(circle,#000 0,#000 18%,transparent 60%)}
[data-mx="flash"]{inset:0;background:#fff;opacity:0}
[data-mx="mote"]{width:8px;height:8px;bottom:-10px;animation:mx-rise linear infinite}
[data-mx="confetti"]{width:8px;height:12px;top:-20px;animation:mx-fall linear infinite}
[data-mx-title]{font-family:'Pixelify',monospace;font-weight:700;text-transform:uppercase;letter-spacing:2px;
  line-height:1;color:transparent;-webkit-background-clip:text;background-clip:text;
  background-image:linear-gradient(180deg,var(--mx-hi) 0 52%,var(--mx-lo) 52% 100%);
  filter:drop-shadow(4px 4px 0 ${INK}) drop-shadow(-2px -2px 0 ${INK}) drop-shadow(2px -2px 0 ${INK}) drop-shadow(-2px 2px 0 ${INK})}
[data-mx-title] span{display:inline-block;animation:mx-drop 360ms steps(6) both;color:transparent;
  -webkit-background-clip:text;background-clip:text;
  background-image:linear-gradient(180deg,var(--mx-hi) 0 52%,var(--mx-lo) 52% 100%)}
[data-mx-kicker]{font-family:'Pixelify',monospace;font-weight:700;letter-spacing:3px;text-transform:uppercase;
  color:${INK};background:var(--mx-edge);padding:4px 12px;box-shadow:4px 4px 0 ${INK}}
@media (prefers-reduced-motion:reduce){[data-mx],[data-mx-title] span{animation-duration:1ms !important;animation-iteration-count:1 !important}}
`;

let installed = false;

/** Puts the stylesheet of the moments in the page, once. */
export function installCinema(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const style = document.createElement('style');
  style.dataset.cinema = '';
  style.textContent = STYLE;
  document.head.append(style);
}

function part(kind: string, css = ''): HTMLDivElement {
  const node = document.createElement('div');
  node.dataset.mx = kind;
  node.style.cssText = css;
  return node;
}

/** A darker and a lighter version of a CSS hex colour (#rrggbb), for the bands and the titles. */
export function shadeHex(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v: number): number =>
    Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** The diagonal band of a moment, in the colour of the type, with speed lines running across it. */
export function band(color: string, delayMs = 0): HTMLDivElement {
  const node = part(
    'band',
    `--mx-edge:${shadeHex(color, 1.5)};animation-delay:${delayMs}ms;` +
      `background:linear-gradient(180deg,${shadeHex(color, 0.35)} 0,${shadeHex(color, 0.7)} 18%,${color} 50%,${shadeHex(color, 0.7)} 82%,${shadeHex(color, 0.35)} 100%);`,
  );
  node.append(part('speed'));
  return node;
}

/** Rays of light that turn slowly behind what is shown. */
export function rays(color: string, opacity = 0.5, delayMs = 0): HTMLDivElement {
  return part('rays', `--mx-ray:${color};opacity:${opacity};animation-delay:-${delayMs}ms;`);
}

/** A white flash over the whole moment, `atMs` after it starts, that lasts `ms`. */
export function flash(atMs: number, ms = 420): HTMLDivElement {
  return part('flash', `animation:mx-flash ${ms}ms steps(6) ${atMs}ms both;`);
}

/** Square motes of light that rise from the floor (the legendary, an evolution). */
export function motes(colors: readonly string[], count: number): HTMLDivElement[] {
  return Array.from({ length: count }, (_, k) =>
    part(
      'mote',
      `left:${((k * 61) % 100) + 0.5}%;background:${colors[k % colors.length] ?? '#fff'};` +
        `animation-duration:${1800 + ((k * 337) % 1400)}ms;animation-delay:${(k * 173) % 1600}ms;` +
        `animation-timing-function:steps(${14 + (k % 6)});`,
    ),
  );
}

/** Confetti of pixels that falls (a victory). */
export function confetti(colors: readonly string[], count: number): HTMLDivElement[] {
  return Array.from({ length: count }, (_, k) =>
    part(
      'confetti',
      `left:${(k * 37) % 100}%;background:${colors[k % colors.length] ?? '#fff'};` +
        `animation-duration:${2200 + ((k * 211) % 1800)}ms;animation-delay:${(k * 97) % 2400}ms;` +
        `animation-timing-function:steps(${18 + (k % 8)});`,
    ),
  );
}

/**
 * A cartridge title: big pixel letters in two bands of colour (light above, `color` below) with a
 * hard ink outline; each letter drops in a step after the one before.
 */
export function title(
  text: string,
  color: string,
  sizePx: number,
  delayMs = 0,
  perLetterMs = 45,
): HTMLDivElement {
  const node = document.createElement('div');
  node.dataset.mxTitle = '';
  // Never taller than a ninth of the screen: a phone held sideways is only ~390 px high.
  node.style.cssText = `font-size:min(${sizePx}px,11vh);--mx-hi:${shadeHex(color, 1.55)};--mx-lo:${color};`;
  [...text].forEach((ch, i) => {
    const letter = document.createElement('span');
    letter.textContent = ch === ' ' ? ' ' : ch;
    letter.style.animationDelay = `${delayMs + i * perLetterMs}ms`;
    node.append(letter);
  });
  // The whole text stays readable to tests and screen readers.
  node.setAttribute('aria-label', text);
  return node;
}

/** The small label over a title, on a plate of the colour of the moment. */
export function kicker(text: string, color: string): HTMLDivElement {
  const node = document.createElement('div');
  node.dataset.mxKicker = '';
  node.style.cssText = `--mx-edge:${color};font-size:14px;`;
  node.textContent = text;
  return node;
}
