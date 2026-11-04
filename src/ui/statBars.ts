import type { MemberStats } from '../domain';

interface Row {
  readonly key: 'hp' | 'attack' | 'defense' | 'specialAttack' | 'specialDefense' | 'speed';
  readonly label: string;
  /** What the stat does in the game (ADR-038): shown so that a stat is never decoration. */
  readonly effect: string;
}

export const STAT_ROWS: readonly Row[] = [
  { key: 'hp', label: 'PS', effect: 'guardia' },
  { key: 'attack', label: 'Ataque', effect: 'daño' },
  { key: 'defense', label: 'Defensa', effect: 'guardia' },
  { key: 'specialAttack', label: 'At. Esp.', effect: 'daño' },
  { key: 'specialDefense', label: 'Def. Esp.', effect: 'guardia' },
  { key: 'speed', label: 'Velocidad', effect: 'velocidad de bola' },
];

/** A stat of 150 or more fills the bar. */
export const STAT_BAR_MAX = 150;

/** 1.476 -> "1,48"; 8.2 -> "8,2". */
export function oneDecimal(value: number, digits = 2): string {
  return String(Math.round(value * 10 ** digits) / 10 ** digits).replace('.', ',');
}

/** "Daño ×1,48 · Bola 8,2 px/t", the numbers that the bars turn into. */
export function statSummary(stats: MemberStats): string {
  return `Daño ×${oneDecimal(stats.damage)} · Bola ${oneDecimal(stats.ballSpeed, 1)}`;
}

/** Width of the bar of a stat, 0..100 (percent). */
export function barPercent(value: number): number {
  return Math.max(0, Math.min(100, (value / STAT_BAR_MAX) * 100));
}

/**
 * The six bars of the real stats of the form (ADR-038). The stat that gives the damage is marked
 * with a diamond; each row says what the stat does.
 */
export function statBars(stats: MemberStats, compact = false): HTMLElement {
  const table = document.createElement('div');
  table.dataset.statBars = '';
  table.style.cssText = `display:grid;grid-template-columns:auto 1fr auto;gap:2px 6px;align-items:center;font-size:${compact ? 10 : 12}px;text-align:left;width:100%;`;
  for (const row of STAT_ROWS) {
    const value = stats.stats[row.key];
    const used = row.key === stats.powerStat;
    const label = document.createElement('div');
    label.textContent = `${used ? '◆ ' : ''}${row.label}`;
    label.title = `${row.label}: ${row.effect}`;
    label.style.cssText = `opacity:${used || row.key === 'speed' || row.effect === 'guardia' ? 1 : 0.55};`;
    const track = document.createElement('div');
    track.style.cssText = `height:${compact ? 5 : 7}px;border-radius:4px;background:#ffffff22;overflow:hidden;`;
    const fill = document.createElement('div');
    fill.dataset.stat = row.key;
    fill.style.cssText = `width:${barPercent(value)}%;height:100%;background:${used || row.effect !== 'daño' ? '#ffd54f' : '#8a93b8'};`;
    track.append(fill);
    const number = document.createElement('div');
    number.textContent = String(value);
    number.style.cssText = 'font-variant-numeric:tabular-nums;';
    table.append(label, track, number);
  }
  return table;
}
