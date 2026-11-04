import { moveName } from './names';

/**
 * Names of moves on screen without filling it with text (ADR-039, M11): at most `max` labels at
 * once; the same move cast again meanwhile is merged into one label ("Lanzallamas ×2"); and when
 * the screen is full a label of higher priority takes the place of the weakest, so the starter's
 * move always shows. Pure and driven by a clock the caller passes, so the bots measure exactly
 * what the player would see.
 */
export interface MoveLabel {
  /** Move id and the Pokémon that cast it: the same pair merges. */
  readonly key: string;
  readonly move: string;
  readonly priority: number;
  readonly x: number;
  readonly y: number;
  /** Time (ms) it disappears, extended by a merge. */
  until: number;
  /** Casts merged into this label. */
  count: number;
}

export type LabelFate = 'shown' | 'merged' | 'dropped';

/** Priority of a cast: the starter's move first, then stage 3 moves, then the rest (ADR-039). */
export function labelPriority(starter: boolean, tier: number): number {
  return starter ? 3 : tier >= 3 ? 2 : 1;
}

/** "Lanzallamas", or "Lanzallamas ×2" when casts were merged. */
export function labelText(label: Pick<MoveLabel, 'move' | 'count'>): string {
  return label.count > 1 ? `${moveName(label.move)} ×${label.count}` : moveName(label.move);
}

export class MoveLabelPolicy {
  private readonly labels: MoveLabel[] = [];
  shown = 0;
  merged = 0;
  dropped = 0;

  constructor(
    private readonly max = 3,
    private readonly lifeMs = 900,
  ) {}

  /** Offers a cast at time `now` (ms). Returns what happened to its label. */
  offer(
    member: number,
    move: string,
    priority: number,
    x: number,
    y: number,
    now: number,
  ): LabelFate {
    this.prune(now);
    const key = `${member}:${move}`;
    const same = this.labels.find((label) => label.key === key);
    if (same !== undefined) {
      same.count += 1;
      same.until = now + this.lifeMs;
      this.merged += 1;
      return 'merged';
    }
    const fresh: MoveLabel = { key, move, priority, x, y, until: now + this.lifeMs, count: 1 };
    if (this.labels.length < this.max) {
      this.labels.push(fresh);
      this.shown += 1;
      return 'shown';
    }
    // Full: the weakest label (the oldest of equals) gives way only to a stronger one.
    let weakest = 0;
    for (let i = 1; i < this.labels.length; i++) {
      const a = this.labels[i] as MoveLabel;
      const b = this.labels[weakest] as MoveLabel;
      if (a.priority < b.priority || (a.priority === b.priority && a.until < b.until)) weakest = i;
    }
    if ((this.labels[weakest] as MoveLabel).priority < priority) {
      this.labels[weakest] = fresh;
      this.shown += 1;
      return 'shown';
    }
    this.dropped += 1;
    return 'dropped';
  }

  /** The labels alive at `now`, in the order they were placed. */
  visible(now: number): readonly MoveLabel[] {
    this.prune(now);
    return this.labels;
  }

  private prune(now: number): void {
    let kept = 0;
    for (const label of this.labels) {
      if (label.until > now) {
        this.labels[kept] = label;
        kept += 1;
      }
    }
    this.labels.length = kept;
  }
}

/** The labels on the field as DOM text (never takes the pointer). Redraws only when they change. */
export class MoveLabels {
  private readonly root: HTMLDivElement;
  private shownKey = '';

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.dataset.moveLabels = '';
    this.root.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:4;overflow:hidden;';
    host.append(this.root);
  }

  /** `place` turns an arena point into host pixels. */
  update(
    labels: readonly MoveLabel[],
    place: (x: number, y: number) => { x: number; y: number },
  ): void {
    const key = labels.map((label) => `${label.key}:${label.count}`).join('|');
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.root.replaceChildren();
    for (const label of labels) {
      const at = place(label.x, label.y);
      const node = document.createElement('div');
      node.textContent = labelText(label);
      const big = label.priority >= 2;
      node.style.cssText =
        `position:absolute;left:${at.x}px;top:${at.y - 24}px;transform:translateX(-50%);` +
        `font:800 ${big ? 20 : 15}px system-ui,sans-serif;white-space:nowrap;` +
        `color:${label.priority >= 3 ? '#ffd54f' : '#ffffff'};` +
        'text-shadow:0 0 4px #000,0 2px 2px #000;';
      this.root.append(node);
    }
  }
}
