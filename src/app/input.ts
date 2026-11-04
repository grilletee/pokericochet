import { FLOOR_Y, type InputState } from './inputLogic';

export interface ArenaView {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Keyboard (A/D, arrows, T for the assisted aim) and pointer. The mouse aims wherever it points
 * and a press on the floor strip steers; on a touch screen a finger on the floor steers and
 * another one above it aims (ADR-021). It only records state; the per-tick command is derived in
 * `commandFromInput`.
 */
export class Input {
  readonly state: InputState = {
    left: false,
    right: false,
    pointerX: null,
    aimX: null,
    aimY: null,
  };
  /** Set when R or Enter asks to play again; the game loop consumes it. */
  restartRequested = false;
  /** Set when M or Escape asks for the title screen; the game loop consumes it. */
  menuRequested = false;
  /** Set when T asks to switch the assisted aim; the game loop consumes it. */
  autoAimToggleRequested = false;
  /** Pointer ids currently steering (on the floor) and aiming (anywhere above it). */
  private steerId: number | null = null;
  private aimId: number | null = null;
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
      const { x, y } = this.toArena(e);
      if (y >= FLOOR_Y) {
        this.steerId = e.pointerId;
        this.state.pointerX = x;
      } else {
        this.aimId = e.pointerId;
        this.state.aimX = x;
        this.state.aimY = y;
      }
    });
    host.addEventListener('pointermove', (e) => {
      const { x, y } = this.toArena(e);
      if (e.pointerId === this.steerId) {
        this.state.pointerX = x;
      } else if (
        e.pointerId === this.aimId ||
        (e.pointerType === 'mouse' && this.steerId === null)
      ) {
        // The mouse aims by hovering; a touch only aims while the finger is down.
        if (y < FLOOR_Y) {
          this.state.aimX = x;
          this.state.aimY = y;
        }
      }
    });
    const release = (e: PointerEvent): void => {
      if (e.pointerId === this.steerId) {
        this.steerId = null;
        this.state.pointerX = null;
      }
      if (e.pointerId === this.aimId) this.aimId = null; // the aim stays where it was
    };
    host.addEventListener('pointerup', release);
    host.addEventListener('pointercancel', release);
    window.addEventListener('blur', () => {
      this.state.left = false;
      this.state.right = false;
      this.steerId = null;
      this.aimId = null;
      this.state.pointerX = null;
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

  /** Pointer position in arena units. */
  private toArena(e: PointerEvent): { x: number; y: number } {
    const { scale, offsetX, offsetY } = this.view();
    return { x: (e.clientX - offsetX) / scale, y: (e.clientY - offsetY) / scale };
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
      case 'KeyT':
        if (down) this.autoAimToggleRequested = true;
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
