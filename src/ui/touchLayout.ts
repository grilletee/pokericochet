import { asksToRotate, type SidePanels, sidePanels } from './sideLayout';

/**
 * The frame of the two-thumb scheme on a touch screen (4G-H): the "turn the phone" notice while it is
 * held upright (the game waits), and the ULTI button in the right panel, at the right thumb's reach,
 * lit while an Ultimate is ready. The game reads `update` every frame; it writes the DOM only when
 * something changes and says when the side panels changed, so the HUD can be moved into them.
 */
export class TouchLayout {
  private readonly rotate: HTMLDivElement;
  private readonly ulti: HTMLButtonElement;
  private panelsKey = '';
  private shownKey = '';
  private panels: SidePanels | null = null;

  constructor(host: HTMLElement, onUltimate: () => void) {
    this.rotate = document.createElement('div');
    this.rotate.dataset.rotateNotice = '';
    this.rotate.style.cssText =
      'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:18px;background:#0b0e16f2;z-index:20;color:#e8ecf8;' +
      'font-family:system-ui,sans-serif;text-align:center;padding:24px;';
    const icon = document.createElement('div');
    icon.textContent = '⟳';
    icon.style.cssText =
      'font-size:72px;line-height:1;animation:rotate-hint 1.6s ease-in-out infinite;';
    const text = document.createElement('div');
    text.textContent = 'Gira el móvil';
    text.style.cssText = 'font-size:28px;font-weight:800;';
    const sub = document.createElement('div');
    sub.textContent =
      'Se juega en horizontal, con los dos pulgares: izquierda para moverte, derecha para apuntar.';
    sub.style.cssText = 'font-size:15px;opacity:0.85;max-width:320px;line-height:1.4;';
    const spin = document.createElement('style');
    spin.textContent =
      '@keyframes rotate-hint{0%{transform:rotate(0)}50%{transform:rotate(90deg)}100%{transform:rotate(90deg)}}';
    document.head.append(spin);
    this.rotate.append(icon, text, sub);

    this.ulti = document.createElement('button');
    this.ulti.type = 'button';
    this.ulti.dataset.ultiButton = '';
    this.ulti.textContent = 'ULTI';
    this.ulti.setAttribute('aria-label', 'Lanzar el Ultimate');
    this.ulti.style.cssText =
      'position:absolute;display:none;width:84px;height:84px;border-radius:50%;z-index:6;' +
      'border:3px solid #ffd54f;background:rgba(27,37,64,0.9);color:#ffd54f;' +
      'font:900 18px system-ui,sans-serif;letter-spacing:1px;pointer-events:auto;touch-action:none;';
    // Its own finger: a press never becomes a move or an aim of the field, and works with the other
    // thumb down (multitouch).
    this.ulti.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onUltimate();
    });
    host.append(this.rotate, this.ulti);
  }

  /** The side panels in force (null: no side layout). */
  get sides(): SidePanels | null {
    return this.panels;
  }

  /**
   * One frame. `twin` is whether the two-thumb scheme is in force, `playing` whether a run is on
   * screen. Returns whether the game must wait (the phone is upright) and whether the panels changed.
   */
  update(view: {
    readonly twin: boolean;
    readonly playing: boolean;
    readonly screenW: number;
    readonly screenH: number;
    readonly fieldX: number;
    readonly fieldW: number;
    readonly ultimateReady: boolean;
  }): { readonly wait: boolean; readonly panelsChanged: boolean } {
    const upright = view.twin && asksToRotate(true, view.screenW, view.screenH);
    const panels = view.twin
      ? sidePanels(view.screenW, view.screenH, view.fieldX, view.fieldW)
      : null;
    const key =
      panels === null
        ? 'none'
        : `${panels.left.w | 0}:${panels.right.x | 0}:${panels.right.w | 0}:${panels.height | 0}`;
    const panelsChanged = key !== this.panelsKey;
    this.panelsKey = key;
    this.panels = panels;
    const showUlti = panels !== null && view.playing;
    const shown = `${upright && view.playing}|${showUlti}|${view.ultimateReady}|${key}`;
    if (shown !== this.shownKey) {
      this.shownKey = shown;
      this.rotate.style.display = upright && view.playing ? 'flex' : 'none';
      this.ulti.style.display = showUlti ? 'block' : 'none';
      if (panels !== null) {
        this.ulti.style.left = `${panels.right.x + panels.right.w / 2 - 42}px`;
        this.ulti.style.bottom = `${Math.round(panels.height * 0.24)}px`;
      }
      this.ulti.style.opacity = view.ultimateReady ? '1' : '0.45';
      this.ulti.style.boxShadow = view.ultimateReady ? '0 0 18px 4px #ffd54f' : 'none';
    }
    return { wait: upright && view.playing, panelsChanged };
  }
}
