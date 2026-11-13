import type { ControlScheme } from '../ui';
import { FLOOR_Y, type InputState } from './inputLogic';
import {
  aimDrag,
  PAD_ZONE_Y,
  type PadInput,
  type PadRelease,
  SlideTrack,
  ThumbPad,
  twinMovePerPixel,
} from './touchLogic';

/** Value of `takePick` that means "let the capture go" (the replace screen, ADR-030). */
export const RELEASE_PICK = -1;

export interface ArenaView {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Keyboard (A/D, arrows) and pointer. The mouse aims wherever it points
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
  /** Pointer ids currently steering (on the floor) and aiming (anywhere above it). */
  private steerId: number | null = null;
  private aimId: number | null = null;
  /** Card, starter or Pokémon chosen with the keys 1-6 or a click, waiting for the game loop. */
  private pickIndex: number | null = null;
  /** The thumb of the touch schemes (4G-G) and what it did since the last tick. */
  private readonly pad = new ThumbPad();
  private padId: number | null = null;
  private padTap: { x: number; y: number } | null = null;
  private padRelease: Extract<PadRelease, { kind: 'release' }> | null = null;
  /**
   * The two thumbs of the landscape touch screen (4G-H): one pointer moves (the left half of the
   * screen) and another aims (the right half), each tracked by its own id, both at once.
   */
  private readonly slide = new SlideTrack();
  private moveId: number | null = null;
  private twinAimId: number | null = null;
  private aimAnchor = { x: 0, y: 0, screenX: 0, screenY: 0 };
  private twinAim: { x: number; y: number } | null = null;
  private ultimateAsked = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly view: () => ArenaView,
    /** The control scheme in force and where the launcher is (arena x), read at each pointer event. */
    private readonly scheme: () => ControlScheme = () => 'classic',
    private readonly playerX: () => number = () => 0,
    /** Where the aim is now (arena), and the arena: the right thumb drags it from there (4G-H). */
    private readonly aimNow: () => { x: number; y: number } = () => ({ x: 0, y: 0 }),
    private readonly arena: {
      readonly width: number;
      readonly height: number;
      readonly playerY: number;
      readonly margin: number;
    } = {
      width: 480,
      height: 760,
      playerY: 680,
      margin: 20,
    },
  ) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    host.style.touchAction = 'none';
    host.addEventListener('pointerdown', (e) => {
      if (this.twinStarts(e)) return;
      const { x, y } = this.toArena(e);
      if (this.padStarts(e, x, y)) return;
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
      if (this.twinMoves(e)) return;
      const { x, y } = this.toArena(e);
      if (e.pointerId === this.padId) {
        this.pad.move(x, y, e.timeStamp);
        this.state.pointerX = this.pad.target();
        return;
      }
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
      if (e.pointerId === this.moveId) {
        this.moveId = null;
        this.slide.up();
        return;
      }
      if (e.pointerId === this.twinAimId) {
        this.twinAimId = null; // the aim stays where the thumb left it
        return;
      }
      if (e.pointerId === this.padId) {
        const { x, y } = this.toArena(e);
        this.padEnds(e.type === 'pointercancel' ? null : this.pad.up(x, y, e.timeStamp), x, y);
        return;
      }
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
      this.padId = null;
      this.pad.cancel();
      this.moveId = null;
      this.twinAimId = null;
      this.slide.up();
      this.state.pointerX = null;
    });
  }

  /**
   * A finger of the two-thumb scheme (4G-H) lands: on the left half of the screen it moves the
   * launcher, on the right half it aims. Only touches on the game itself count (a tap on a portrait
   * or a button is theirs).
   */
  private twinStarts(e: PointerEvent): boolean {
    if (this.scheme() !== 'twin') return false;
    if (!(e.target instanceof HTMLCanvasElement) && e.target !== this.host) return true;
    const rect = this.host.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    if (sx < rect.width / 2) {
      if (this.moveId !== null) return true;
      this.moveId = e.pointerId;
      this.slide.down(sx, this.playerX());
    } else {
      if (this.twinAimId !== null) return true;
      this.twinAimId = e.pointerId;
      const now = this.aimNow();
      this.aimAnchor = { x: now.x, y: now.y, screenX: e.clientX, screenY: e.clientY };
    }
    return true;
  }

  private twinMoves(e: PointerEvent): boolean {
    if (this.scheme() !== 'twin') return false;
    const { scale, offsetX } = this.view();
    if (e.pointerId === this.moveId) {
      const rect = this.host.getBoundingClientRect();
      const perPixel = twinMovePerPixel(scale, this.arena.width * scale, offsetX);
      this.slide.move(
        e.clientX - rect.left,
        perPixel,
        this.arena.margin,
        this.arena.width - this.arena.margin,
      );
    } else if (e.pointerId === this.twinAimId) {
      this.twinAim = aimDrag(
        this.aimAnchor,
        e.clientX - this.aimAnchor.screenX,
        e.clientY - this.aimAnchor.screenY,
        scale,
        this.arena,
        this.arena.playerY,
      );
    }
    return true;
  }

  /** The ULTI button of the two-thumb scheme (4G-H): throw the Ultimate that is ready. */
  requestUltimate(): void {
    this.ultimateAsked = true;
  }

  /** Whether the Ultimate was asked for since the last call. */
  takeUltimate(): boolean {
    const asked = this.ultimateAsked;
    this.ultimateAsked = false;
    return asked;
  }

  /**
   * A touch of the touch schemes (4G-G): the smart scheme steers only with the lower part of the
   * field and a quick touch above it is a tap on an enemy; the motion and sling schemes steer with a
   * finger anywhere. The launcher follows how far the thumb DRAGS, not where it is.
   */
  private padStarts(e: PointerEvent, x: number, y: number): boolean {
    const scheme = this.scheme();
    if (scheme === 'classic' || this.padId !== null) return false;
    const steers = scheme !== 'smart' || y >= PAD_ZONE_Y;
    if (!steers) {
      // Above the thumb zone: only a tap means anything (the smart scheme: fix a target).
      this.padTap = { x, y };
      return true;
    }
    this.padId = e.pointerId;
    this.pad.down(x, y, e.timeStamp, this.playerX());
    this.state.pointerX = this.pad.target();
    return true;
  }

  private padEnds(result: PadRelease | null, x: number, y: number): void {
    this.padId = null;
    this.state.pointerX = null;
    this.pad.cancel();
    if (result === null) return;
    if (this.scheme() === 'sling') {
      // Every lift is a volley in the sling: a tap too (without a flick).
      this.padRelease = result.kind === 'release' ? result : { kind: 'release', x, y, flick: null };
    } else if (result.kind === 'tap') {
      this.padTap = { x: result.x, y: result.y };
    }
  }

  /** What the thumb did since the last call (steering, a tap, a release); each event is given once. */
  takePad(): PadInput {
    if (this.scheme() === 'twin') {
      const aim = this.twinAim;
      this.twinAim = null;
      return {
        steerX: this.slide.active ? this.slide.target() : null,
        aim,
        tap: null,
        release: null,
      };
    }
    const pad: PadInput = {
      steerX: this.padId === null ? null : this.pad.target(),
      tap: this.padTap,
      release: this.padRelease,
    };
    this.padTap = null;
    this.padRelease = null;
    return pad;
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
      case 'Digit5':
      case 'Numpad5':
        if (down) this.pickIndex = 4;
        break;
      case 'Digit6':
      case 'Numpad6':
        if (down) this.pickIndex = 5;
        break;
      case 'Digit0':
      case 'Numpad0':
      case 'KeyX':
        if (down) this.pickIndex = RELEASE_PICK; // lets a capture go on the replace screen
        break;
      default:
        return;
    }
    e.preventDefault();
  }
}
