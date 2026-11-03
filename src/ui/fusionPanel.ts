import type { Ball, FusionPreview, GameType } from '../domain';
import { speciesName, typeName } from './cardText';
import { describeBall, describeEffects, describePreview } from './fusionText';

export const TYPE_COLORS: Record<GameType, string> = {
  fire: '#f08030',
  water: '#6890f0',
  grass: '#78c850',
  electric: '#f8d030',
};

export interface FusionView {
  readonly loadout: readonly Ball[];
  readonly tokens: number;
}

/**
 * Workshop panel: the balls of the loadout as chips. Click one ingredient, then another: the
 * panel says what they would give, or why they cannot be fused, and the button fuses them. The
 * order matters (the first one lends its type), so there is a swap button. It only holds the
 * selection; the fusion itself is a domain command.
 */
export class FusionPanel {
  private readonly root: HTMLDivElement;
  private readonly launcher: HTMLButtonElement;
  private lastLauncher = '';
  private lastOnClose: (() => void) | null = null;
  private selected: number[] = [];
  /** Balls (immutable values, compared by identity) and tokens the panel currently shows. */
  private shown: Ball[] | null = null;
  private shownTokens = -1;
  private lastView: FusionView | null = null;
  private lastPreview: ((a: number, b: number) => FusionPreview) | null = null;
  private lastOnFuse: ((a: number, b: number) => void) | null = null;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.dataset.fusionPanel = '';
    this.root.style.cssText =
      'position:absolute;left:12px;top:60px;max-width:300px;display:none;flex-direction:column;' +
      'gap:6px;padding:8px;border-radius:8px;background:rgba(5,8,16,0.72);' +
      'font-family:system-ui,sans-serif;font-size:13px;color:#e8ecf8;pointer-events:auto;';
    // Clicks here must not steer the player through the canvas input underneath.
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.launcher = document.createElement('button');
    this.launcher.type = 'button';
    this.launcher.dataset.fusionOpen = '';
    this.launcher.style.cssText =
      'position:absolute;left:12px;top:60px;display:none;padding:6px 10px;border-radius:8px;' +
      'border:2px solid #5b6aa8;background:rgba(27,37,64,0.85);color:#e8ecf8;font:inherit;' +
      'font-family:system-ui,sans-serif;font-size:13px;cursor:pointer;pointer-events:auto;';
    this.launcher.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.root, this.launcher);
  }

  /**
   * The button that opens the workshop while playing (key F does the same); `null` hides it.
   * Cheap to call every frame.
   */
  setLauncher(tokens: number | null, onOpen: () => void): void {
    const key = tokens === null ? '' : String(tokens);
    if (key === this.lastLauncher) return;
    this.lastLauncher = key;
    this.launcher.onclick = onOpen;
    this.launcher.style.display = tokens === null ? 'none' : 'block';
    this.launcher.textContent = `Fusión (F) · Fichas: ${tokens ?? 0}`;
  }

  /** Cheap to call every frame: it only redraws when the loadout, tokens or selection change. */
  update(
    view: FusionView,
    preview: (a: number, b: number) => FusionPreview,
    onFuse: (a: number, b: number) => void,
    onClose: () => void,
  ): void {
    this.lastOnClose = onClose;
    this.lastView = view;
    this.lastPreview = preview;
    this.lastOnFuse = onFuse;
    if (this.sameAsShown(view)) return;
    this.shown = view.loadout.slice();
    this.shownTokens = view.tokens;
    this.selected = [];
    this.render();
  }

  private sameAsShown(view: FusionView): boolean {
    const shown = this.shown;
    if (shown === null || view.tokens !== this.shownTokens) return false;
    if (shown.length !== view.loadout.length) return false;
    for (let i = 0; i < shown.length; i++) if (shown[i] !== view.loadout[i]) return false;
    return true;
  }

  hide(): void {
    if (this.shown === null && this.root.style.display === 'none') return;
    this.shown = null;
    this.selected = [];
    this.root.style.display = 'none';
  }

  /** The preview text currently shown, for tests and debugging. */
  get text(): string {
    return this.root.textContent ?? '';
  }

  private select(slot: number): void {
    if (this.selected.length === 1 && this.selected[0] === slot) this.selected = [];
    else if (this.selected.length === 1) this.selected = [this.selected[0] ?? 0, slot];
    else this.selected = [slot];
    this.render();
  }

  private render(): void {
    const view = this.lastView;
    const preview = this.lastPreview;
    const onFuse = this.lastOnFuse;
    if (view === null || preview === null || onFuse === null) return;
    this.root.replaceChildren();
    this.root.style.display = 'flex';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;gap:8px;font-weight:700;';
    const title = document.createElement('span');
    title.textContent = `Fusión · Fichas: ${view.tokens} · juego en pausa`;
    const close = document.createElement('button');
    close.type = 'button';
    close.dataset.fusionClose = '';
    close.textContent = 'Cerrar (F)';
    close.style.cssText = this.buttonStyle(true);
    close.addEventListener('click', () => this.lastOnClose?.());
    header.append(title, close);
    this.root.append(header);

    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
    view.loadout.forEach((ball, slot) => {
      const order = this.selected.indexOf(slot);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.dataset.slot = String(slot);
      chip.title = `${speciesName(ball.species)} · ${typeName(ball.type)} · ${describeEffects(ball)}`;
      chip.style.cssText =
        `padding:4px 8px;border-radius:6px;background:${order >= 0 ? '#2b3a6b' : '#1b2540'};` +
        `border:2px solid ${TYPE_COLORS[ball.type]};color:inherit;font:inherit;cursor:pointer;`;
      chip.textContent = `${order >= 0 ? `${order + 1}º ` : ''}${describeBall(ball)}`;
      chip.addEventListener('click', () => this.select(slot));
      chips.append(chip);
    });
    this.root.append(chips);

    const [a, b] = this.selected;
    const hint = document.createElement('div');
    hint.dataset.fusionText = '';
    hint.style.cssText = 'white-space:pre-line;opacity:0.9;';
    let canFuse = false;
    if (view.loadout.length < 2) {
      hint.textContent = 'Consigue otra bola para poder fusionar.';
    } else if (a === undefined) {
      hint.textContent = 'Elige dos bolas. La primera presta su tipo al resultado.';
    } else if (b === undefined) {
      hint.textContent = 'Elige la segunda bola.';
    } else {
      const described = describePreview(preview(a, b));
      canFuse = described.ok;
      hint.textContent = described.text;
      hint.style.color = described.ok ? '#9be59b' : '#ffb4a8';
    }
    this.root.append(hint);

    if (a !== undefined && b !== undefined) {
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:6px;';
      const swap = document.createElement('button');
      swap.type = 'button';
      swap.dataset.fusionSwap = '';
      swap.textContent = '⇄ Invertir orden';
      swap.style.cssText = this.buttonStyle(true);
      swap.addEventListener('click', () => {
        this.selected = [b, a];
        this.render();
      });
      const go = document.createElement('button');
      go.type = 'button';
      go.dataset.fusionGo = '';
      go.disabled = !canFuse;
      go.textContent = 'Fusionar (1 ficha)';
      go.style.cssText = this.buttonStyle(canFuse);
      go.addEventListener('click', () => {
        if (!canFuse) return;
        this.selected = [];
        onFuse(a, b);
      });
      actions.append(swap, go);
      this.root.append(actions);
    }
  }

  private buttonStyle(enabled: boolean): string {
    return (
      `padding:4px 8px;border-radius:6px;border:2px solid ${enabled ? '#5b6aa8' : '#3a3f55'};` +
      `background:#1b2540;color:inherit;font:inherit;opacity:${enabled ? 1 : 0.5};` +
      `cursor:${enabled ? 'pointer' : 'not-allowed'};`
    );
  }
}
