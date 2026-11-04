import type { Ball, GameType } from '../domain';
import { type ArtLookup, spriteTile } from './cardView';
import { TYPE_COLORS } from './typeColors';

const HYBRID_COLOR = '#c792ea';
const FLY_MS = 700;

function animate(
  element: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  return typeof element.animate === 'function' ? element.animate(keyframes, options) : null;
}

/** Tile edge in px for a team of `count` balls: the bar shrinks instead of covering the field. */
function tileSize(count: number): number {
  return count <= 8 ? 36 : count <= 16 ? 29 : 23;
}

/**
 * The team as a row of sprites with their level (ADR-024): what the player has and what a
 * capture or an evolution just changed. The DOM is rebuilt only when the team changes. A captured
 * ball flies from where it was picked up to its tile, which stays hidden until it arrives.
 */
export class TeamBar {
  private readonly root: HTMLDivElement;
  private shown: readonly Ball[] = [];
  private readonly tiles = new Map<number, HTMLElement>();
  /** Balls whose tile waits for the capture sprite to land. */
  private readonly arriving = new Set<number>();

  constructor(
    host: HTMLElement,
    private readonly art: ArtLookup,
    private readonly typeOf: (species: string) => GameType | undefined,
  ) {
    this.root = document.createElement('div');
    this.root.dataset.teamBar = '';
    this.root.style.cssText =
      'position:absolute;left:12px;top:58px;display:none;flex-wrap:wrap;gap:3px;' +
      'max-width:min(300px,calc(100% - 180px));pointer-events:none;' +
      'font-family:system-ui,sans-serif;color:#e8ecf8;';
    host.append(this.root);
  }

  /** Cheap to call every frame: it compares the balls by identity (they are immutable values). */
  update(loadout: readonly Ball[] | null): void {
    if (loadout === null) {
      if (this.shown.length === 0 && this.root.style.display === 'none') return;
      this.root.style.display = 'none';
      this.shown = [];
      this.tiles.clear();
      this.arriving.clear();
      return;
    }
    let same = loadout.length === this.shown.length;
    for (let i = 0; same && i < loadout.length; i++) same = loadout[i] === this.shown[i];
    if (same) return;
    this.shown = loadout.slice();
    this.root.style.display = 'flex';
    this.root.replaceChildren();
    this.tiles.clear();
    const size = tileSize(loadout.length);
    for (const ball of loadout) {
      const tile = this.buildTile(ball, size);
      if (this.arriving.has(ball.id)) tile.style.opacity = '0';
      this.tiles.set(ball.id, tile);
      this.root.append(tile);
    }
  }

  private buildTile(ball: Ball, size: number): HTMLElement {
    const tile = spriteTile(
      this.art.spriteUrl(ball.species, ball.level),
      ball.species,
      ball.type,
      size,
    );
    tile.dataset.ball = String(ball.id);
    const pips = document.createElement('div');
    pips.style.cssText = 'display:flex;gap:2px;height:5px;';
    for (let i = 0; i < ball.level; i++) {
      const pip = document.createElement('div');
      pip.style.cssText = `width:6px;height:5px;border-radius:2px;background:${
        ball.hybrid ? HYBRID_COLOR : TYPE_COLORS[ball.type]
      };`;
      pips.append(pip);
    }
    tile.append(pips);
    return tile;
  }

  /** Scale-and-glow pulse on the tile of a ball that just evolved or became a hybrid. */
  pulse(ballId: number): void {
    const tile = this.tiles.get(ballId);
    if (tile === undefined) return;
    animate(
      tile,
      [
        { transform: 'scale(1)', filter: 'brightness(1)' },
        { transform: 'scale(1.7)', filter: 'brightness(2.4)', offset: 0.35 },
        { transform: 'scale(1)', filter: 'brightness(1)' },
      ],
      { duration: 900, easing: 'ease-out' },
    );
  }

  /**
   * Flies the sprite of a captured ball from screen point (`fromX`, `fromY`), relative to the
   * host, to its tile; `ballId` 0 (the team was full) flies to the end of the bar. Call after
   * `update`, so the tile exists.
   */
  flyCapture(
    ballId: number,
    species: string,
    url: string | undefined,
    fromX: number,
    fromY: number,
  ): void {
    const tile = this.tiles.get(ballId);
    const target = (tile ?? this.root).getBoundingClientRect();
    const hostRect = this.root.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const toX = target.left - hostRect.left + target.width / 2;
    const toY = target.top - hostRect.top + target.height / 2;
    if (tile !== undefined) {
      this.arriving.add(ballId);
      tile.style.opacity = '0';
    }
    const flier = spriteTile(url, species, this.typeOf(species), 44);
    flier.style.cssText += 'position:absolute;left:0;top:0;pointer-events:none;z-index:5;';
    this.root.parentElement?.append(flier);
    const finish = (): void => {
      flier.remove();
      this.arriving.delete(ballId);
      const landed = this.tiles.get(ballId);
      if (landed !== undefined) {
        landed.style.opacity = '1';
        this.pulse(ballId);
      }
    };
    const flight = animate(
      flier,
      [
        { transform: `translate(${fromX - 22}px,${fromY - 22}px) scale(0.6)`, opacity: 0.2 },
        {
          transform: `translate(${fromX - 22}px,${fromY - 54}px) scale(1.6)`,
          opacity: 1,
          offset: 0.25,
        },
        { transform: `translate(${toX - 22}px,${toY - 22}px) scale(0.55)`, opacity: 1 },
      ],
      { duration: FLY_MS, easing: 'ease-in-out', fill: 'forwards' },
    );
    if (flight === null) finish();
    else flight.onfinish = finish;
  }
}

/**
 * Big, short message while the run goes on underneath (it never pauses the game): the balls that
 * evolve or fuse and what they became, drawn with the sprites. Does not take pointer events.
 */
export class EvolutionBanner {
  private readonly root: HTMLDivElement;
  private timer = 0;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.dataset.banner = '';
    this.root.style.cssText =
      'position:absolute;left:50%;top:22%;transform:translateX(-50%);display:none;' +
      'flex-direction:column;align-items:center;gap:6px;padding:10px 18px;border-radius:14px;' +
      'background:rgba(5,8,16,0.82);border:2px solid #ffffff55;pointer-events:none;z-index:6;' +
      'font-family:system-ui,sans-serif;color:#e8ecf8;text-align:center;max-width:88%;';
    host.append(this.root);
  }

  /** `tiles` are the pictures (from, to), `text` the caption. */
  show(tiles: readonly HTMLElement[], text: string, accent: string): void {
    window.clearTimeout(this.timer);
    this.root.replaceChildren();
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;';
    for (const tile of tiles) row.append(tile);
    const caption = document.createElement('div');
    caption.style.cssText = 'font-size:16px;font-weight:700;';
    caption.textContent = text;
    this.root.append(row, caption);
    this.root.style.borderColor = accent;
    this.root.style.display = 'flex';
    animate(
      this.root,
      [
        { opacity: 0, transform: 'translateX(-50%) scale(0.7)' },
        { opacity: 1, transform: 'translateX(-50%) scale(1.08)', offset: 0.3 },
        { opacity: 1, transform: 'translateX(-50%) scale(1)' },
      ],
      { duration: 380, easing: 'ease-out' },
    );
    this.timer = window.setTimeout(() => {
      this.root.style.display = 'none';
    }, 2200);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.root.style.display = 'none';
  }
}
