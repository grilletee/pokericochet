/**
 * The look of the whole interface (4G-D, direction A, pixel-art): one palette of our own, one pixel
 * font under the SIL Open Font License (Pixelify Sans, `src/assets/fonts`), and frames with notched
 * corners made of shadows (no border radius anywhere). It is a single stylesheet over the elements
 * the game already marks with `data-*`, so every screen, card, bar and notice wears it at once.
 */
export const PALETTE = {
  ink: '#14172b',
  deep: '#1f2547',
  navy: '#2b3a73',
  blue: '#3f66d0',
  sky: '#5fb0ff',
  cyan: '#8ef0ff',
  cream: '#f6f3e8',
  grey: '#9aa6c0',
  slate: '#4a5578',
  red: '#e04a4a',
  orange: '#ff9a4a',
  yellow: '#ffd75a',
  lime: '#9fe86a',
  green: '#3fae5a',
  teal: '#1f7a7a',
  violet: '#8a5acb',
  pink: '#ff7fb0',
} as const;

const P = PALETTE;

/** A frame with notched corners: `edge` is the outline, the inner light and dark lines give volume. */
export function pixelFrame(edge: string = P.ink, size = 3): string {
  return (
    `box-shadow:0 -${size}px 0 0 ${edge},0 ${size}px 0 0 ${edge},-${size}px 0 0 0 ${edge},` +
    `${size}px 0 0 0 ${edge},inset 0 ${size}px 0 0 rgba(255,255,255,0.16),` +
    `inset 0 -${size}px 0 0 rgba(0,0,0,0.32);border-radius:0;`
  );
}

const STYLE = `
[data-px-root]{--ink:${P.ink};--deep:${P.deep};--navy:${P.navy};--blue:${P.blue};--sky:${P.sky};--cyan:${P.cyan};
  --cream:${P.cream};--grey:${P.grey};--slate:${P.slate};--red:${P.red};--orange:${P.orange};--yellow:${P.yellow};
  --lime:${P.lime};--green:${P.green};--teal:${P.teal};--violet:${P.violet};--pink:${P.pink};
  font-family:'Pixelify',monospace}
[data-px-root] *{font-family:'Pixelify',monospace !important;border-radius:0 !important;
  -webkit-font-smoothing:none;font-smooth:never;letter-spacing:0.2px}
[data-px-root] canvas{image-rendering:pixelated}
[data-px-root] img{image-rendering:pixelated}
/* panels: the title, credits, settings, results and replace screens */
[data-px-root] [data-screen],[data-px-root] [data-replace],[data-px-root] [data-sheet]{
  background:
    linear-gradient(rgba(20,23,43,0.9),rgba(20,23,43,0.9)),
    repeating-linear-gradient(0deg,${P.deep} 0 4px,${P.ink} 4px 8px) !important;
  color:${P.cream} !important}
[data-px-root] [data-screen="start"]{
  background:
    linear-gradient(180deg,rgba(20,23,43,0) 55%,rgba(20,23,43,0.95)),
    repeating-linear-gradient(90deg,rgba(63,102,208,0.1) 0 8px,transparent 8px 16px),
    linear-gradient(180deg,${P.navy},${P.deep} 60%,${P.ink}) !important}
/* buttons */
[data-px-root] button{background:${P.blue} !important;color:${P.cream} !important;border:0 !important;
  ${pixelFrame()}text-shadow:2px 2px 0 ${P.ink};cursor:pointer;font-weight:600;
  transition:none}
[data-px-root] button:hover{background:${P.sky} !important;color:${P.ink} !important;text-shadow:none}
[data-px-root] button:active{transform:translateY(3px)}
[data-px-root] button[data-starter]{background:${P.navy} !important;text-align:left}
[data-px-root] button[data-starter]:hover{background:${P.slate} !important;color:${P.cream} !important}
[data-px-root] button[data-action="again"],[data-px-root] button[data-action="back"]{background:${P.green} !important}
[data-px-root] [data-sound-toggle]{background:${P.deep} !important;font-size:13px !important}
/* the cards of a level up and the replace slots */
[data-px-root] button[data-card],[data-px-root] button[data-replace-slot],[data-px-root] button[data-replace-release]{
  background:${P.navy} !important;${pixelFrame(P.cream)}text-align:left}
[data-px-root] button[data-card]:hover,[data-px-root] button[data-replace-slot]:hover{background:${P.blue} !important;color:${P.cream} !important}
/* the sheet, the sign of a wave, the banners and the moment of a boss */
[data-px-root] [data-sheet]>div{background:${P.navy} !important;${pixelFrame(P.cream)}padding:18px !important;color:${P.cream}}
[data-px-root] [data-cartel]{background:${P.ink} !important;${pixelFrame(P.sky)}color:${P.cream} !important}
[data-px-root] [data-banner]{background:${P.ink} !important;${pixelFrame(P.yellow)}color:${P.cream} !important}
/* the team bar, the tiles, the bars of life and of the boss */
[data-px-root] [data-team-tile]{background:${P.deep} !important;${pixelFrame(P.slate)}padding:4px !important}
[data-px-root] [data-team-tile][data-glow="ready"]{${pixelFrame(P.yellow)}}
[data-px-root] [data-team-tile][data-glow="near"]{${pixelFrame(P.orange)}}
[data-px-root] [data-boss-bar]{background:${P.ink} !important;${pixelFrame(P.cream)}height:22px !important;line-height:22px !important;border:0 !important}
[data-px-root] [data-boss-bar] div:first-child{background:repeating-linear-gradient(90deg,${P.red} 0 6px,#b93636 6px 12px) !important}
[data-px-root] [data-boss-notch]{background:${P.cream} !important;width:3px !important}
[data-px-root] [data-signature-tag]{background:${P.yellow} !important;color:${P.ink} !important;${pixelFrame(P.ink, 2)}font-weight:700}
[data-px-root] [data-stat-bars] *,[data-px-root] [data-stat]{image-rendering:pixelated}
[data-px-root] [data-type-icon]{${pixelFrame(P.ink, 2)}}
/* the text of the HUD */
[data-px-root] [data-hud]{text-shadow:2px 2px 0 ${P.ink}}
`;

let installed = false;

/** Puts the pixel stylesheet in the page and marks the game's root element, once. */
export function installPixelStyle(host: HTMLElement, fontUrl: string): void {
  host.dataset.pxRoot = '';
  if (installed) return;
  installed = true;
  const style = document.createElement('style');
  style.dataset.pixelStyle = '';
  // The font file (OFL, see assets/fonts) is imported by the app layer and handed in as a URL.
  style.textContent = `@font-face{font-family:'Pixelify';src:url(${fontUrl}) format('truetype');font-weight:400 700;font-display:block}${STYLE}`;
  document.head.append(style);
}
