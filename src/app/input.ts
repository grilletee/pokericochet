import type { InputState } from './inputLogic';

export interface ArenaView {
  readonly scale: number;
  readonly offsetX: number;
}

/**
 * Keyboard (A/D, arrows) and pointer (mouse or touch: hold and the player steers towards it).
 * It only records state; the per-tick command is derived in `commandFromInput`.
 */
export class Input {
  readonly state: InputState = { left: false, right: false, pointerX: null };
  /** Set when R or Enter asks to play again; the game loop consumes it. */
  restartRequested = false;
  /** Set when M or Escape asks for the title screen; the game loop consumes it. */
  menuRequested = false;
  /** Card or starter chosen with the keys 1-4 or a click, waiting for the game loop. */
  private pickIndex: number | null = null;

  constructor(
    host: HTMLElement,
    private readonly view: () => ArenaView,
  ) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    host.style.touchAction = 'none';
    host.addEventListener('pointerdown', (e) => {
      this.state.pointerX = this.toArenaX(e);
    });
    host.addEventListener('pointermove', (e) => {
      if (this.state.pointerX !== null) this.state.pointerX = this.toArenaX(e);
    });
    const release = (): void => {
      this.state.pointerX = null;
    };
    host.addEventListener('pointerup', release);
    host.addEventListener('pointercancel', release);
    host.addEventListener('pointerleave', release);
    window.addEventListener('blur', () => {
      this.state.left = false;
      this.state.right = false;
      release();
    });
  }

  /** For the on-screen buttons of the results screen (same effect as R and M). */
  requestRestart(): void {
    this.restartRequested = true;
  }

  requestMenu(): void {
    this.menuRequested = true;
  }

  requestPick(index: number): void {
    this.pickIndex = index;
  }

  /** The card chosen since the last call, if any. */
  takePick(): number | null {
    const index = this.pickIndex;
    this.pickIndex = null;
    return index;
  }

  private toArenaX(e: PointerEvent): number {
    const { scale, offsetX } = this.view();
    return (e.clientX - offsetX) / scale;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.state.left = down;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.state.right = down;
        break;
      case 'KeyR':
      case 'Enter':
        if (down) this.restartRequested = true;
        break;
      case 'KeyM':
      case 'Escape':
        if (down) this.menuRequested = true;
        break;
      case 'Digit1':
      case 'Numpad1':
        if (down) this.pickIndex = 0;
        break;
      case 'Digit2':
      case 'Numpad2':
        if (down) this.pickIndex = 1;
        break;
      case 'Digit3':
      case 'Numpad3':
        if (down) this.pickIndex = 2;
        break;
      case 'Digit4':
      case 'Numpad4':
        if (down) this.pickIndex = 3;
        break;
      default:
        return;
    }
    e.preventDefault();
  }
}
