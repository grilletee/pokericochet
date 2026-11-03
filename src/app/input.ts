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
  /** Set when R, Enter or a tap asks for a restart; the game loop consumes it. */
  restartRequested = false;

  constructor(
    host: HTMLElement,
    private readonly view: () => ArenaView,
  ) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    host.style.touchAction = 'none';
    host.addEventListener('pointerdown', (e) => {
      this.restartRequested = true;
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
      default:
        return;
    }
    e.preventDefault();
  }
}
