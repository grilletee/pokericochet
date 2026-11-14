/**
 * The boss that comes down to the defence line (4G-I, 16th playtest: "Dragonite estuvo a punto de
 * llegar al final ... no sé qué pasa si un jefe llega al final"). A boss that reaches the line ends the
 * run at once (ADR-016). The game says so before it is too late: a distance meter and a pulsing line
 * on the field, the seconds left on its bar, and an alarm with a message at 30, 15 and 5 seconds.
 * Pure: the seconds come from the snapshot (`bossLineTicks`), the clock is never read here.
 */

/** Seconds left at which the alarm sounds and the message shows, once each per boss. */
export const LINE_ALARMS = [30, 15, 5] as const;

export type LineUrgency = 'none' | 'far' | 'near' | 'critical';

/** How worrying the distance is: shown from 40 s, red from 15 s, flashing from 5 s. */
export function lineUrgency(ticks: number): LineUrgency {
  if (ticks < 0 || ticks > 40 * 60) return 'none';
  if (ticks <= 5 * 60) return 'critical';
  if (ticks <= 15 * 60) return 'near';
  return 'far';
}

/** "12 s": whole seconds, rounded up (the last one reads 1, never 0 while it still comes). */
export function lineSeconds(ticks: number): number {
  return Math.ceil(Math.max(0, ticks) / 60);
}

/** The message of an alarm. The first one explains the rule. */
export function lineMessage(seconds: number, first: boolean): string {
  const rule = first ? ' Si toca la línea roja, pierdes la partida.' : '';
  return `⚠ ¡El jefe llega a la línea en ${seconds} s!${rule}`;
}

/** Which alarm sounds now, once each per boss (the boss is told by its id). */
export class LineAlarm {
  private bossId = -1;
  private next = 0;
  private told = false;

  /** The alarm (seconds) crossed by this frame, or null. `ticks` < 0: no boss coming down. */
  check(
    bossId: number,
    ticks: number,
  ): { readonly seconds: number; readonly first: boolean } | null {
    if (bossId !== this.bossId) {
      this.bossId = bossId;
      this.next = 0;
    }
    if (ticks < 0) return null;
    let crossed: number | null = null;
    while (this.next < LINE_ALARMS.length && ticks <= (LINE_ALARMS[this.next] ?? 0) * 60) {
      crossed = LINE_ALARMS[this.next] ?? null;
      this.next += 1;
    }
    if (crossed === null) return null;
    const first = !this.told;
    this.told = true;
    return { seconds: crossed, first };
  }

  /** A new run: the rule is explained again the first time. */
  reset(): void {
    this.bossId = -1;
    this.next = 0;
    this.told = false;
  }
}
