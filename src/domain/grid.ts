import type { Enemy } from './types';

/**
 * Uniform grid over the arena, rebuilt every tick from the enemies (counting sort, no
 * allocation in steady state). Each enemy is stored in the cell of its centre; positions outside
 * the arena are clamped to the edge cells, which is consistent with the clamped queries.
 */
export class SpatialGrid {
  readonly cols: number;
  readonly rows: number;
  /** Extra reach a query must cover: ball radius + largest enemy radius. */
  readonly pad: number;
  /** cellStart[c]..cellStart[c + 1] delimits the items of cell c. */
  readonly cellStart: Int32Array;
  items: Int32Array;
  private readonly cursor: Int32Array;
  private cellOf: Int32Array;
  private capacity = 256;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
    pad: number,
  ) {
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.pad = pad;
    this.cellStart = new Int32Array(this.cols * this.rows + 1);
    this.cursor = new Int32Array(this.cols * this.rows + 1);
    this.items = new Int32Array(this.capacity);
    this.cellOf = new Int32Array(this.capacity);
  }

  colOf(x: number): number {
    return Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
  }

  rowOf(y: number): number {
    return Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize)));
  }

  /** Stores the indices (into `enemies`) of all enemies, bucketed by cell. */
  build(enemies: readonly Enemy[]): void {
    const count = enemies.length;
    if (count > this.capacity) {
      this.capacity = Math.max(count, this.capacity * 2);
      this.items = new Int32Array(this.capacity);
      this.cellOf = new Int32Array(this.capacity);
    }
    const cells = this.cols * this.rows;
    this.cellStart.fill(0);
    for (let i = 0; i < count; i++) {
      const e = enemies[i];
      if (e === undefined) continue;
      const cell = this.rowOf(e.y) * this.cols + this.colOf(e.x);
      this.cellOf[i] = cell;
      this.cellStart[cell + 1] = (this.cellStart[cell + 1] ?? 0) + 1;
    }
    for (let c = 0; c < cells; c++) {
      this.cellStart[c + 1] = (this.cellStart[c + 1] ?? 0) + (this.cellStart[c] ?? 0);
    }
    this.cursor.set(this.cellStart);
    for (let i = 0; i < count; i++) {
      const cell = this.cellOf[i] ?? 0;
      const position = this.cursor[cell] ?? 0;
      this.items[position] = i;
      this.cursor[cell] = position + 1;
    }
  }
}
