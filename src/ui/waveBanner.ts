import type { CartelText } from './screenText';
import { typeIcons } from './typeIcons';

/** How long each cartel stays up. A boss gets a little longer than a wave. */
export const CARTEL_MS = 2000;
export const BOSS_CARTEL_MS = 2500;

/**
 * Signs that show one at a time, each for its own time (A1 of ADR-050): a second one waits behind
 * the first instead of replacing it. Pure: the clock is given, never read.
 */
export class SignQueue<T> {
  private readonly items: { item: T; ms: number }[] = [];
  private shown: T | null = null;
  private until = 0;

  /** The sign that is up, or null. */
  get current(): T | null {
    return this.shown;
  }

  /** Signs waiting behind the one that is up. */
  get waiting(): number {
    return this.items.length;
  }

  push(item: T, ms: number, now: number): void {
    this.items.push({ item, ms });
    if (this.shown === null) this.advance(now);
  }

  /** Takes the sign down once its time is up and puts the next one up. */
  update(now: number): void {
    if (this.shown !== null && now >= this.until) {
      this.shown = null;
      this.advance(now);
    }
  }

  clear(): void {
    this.items.length = 0;
    this.shown = null;
  }

  private advance(now: number): void {
    const next = this.items.shift();
    if (next === undefined) return;
    this.shown = next.item;
    this.until = now + next.ms;
  }
}

/**
 * The cartel of a wave or a boss (ADR-050): a sign near the top, never over the middle of the
 * field, with the name, the types as icons and what is effective against them. It is its own
 * element (a toast cannot wipe it) and only one is up at a time: a second one waits its turn, so
 * the wave sign and the boss sign that comes with it ("Al acabar…") are read one after the other.
 * It takes no pointer events, and the game does not pause for it. The clock is given, never read.
 */
export class WaveBanner {
  private readonly root: HTMLDivElement;
  private readonly queue = new SignQueue<CartelText>();
  /** The sign drawn now, so the DOM is written only when it changes. */
  private drawn: CartelText | null = null;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.dataset.cartel = '';
    this.root.style.cssText =
      'position:absolute;left:50%;top:150px;transform:translateX(-50%);display:none;' +
      'flex-direction:column;align-items:center;gap:6px;padding:10px 18px;max-width:86%;' +
      'border-radius:14px;background:rgba(5,8,16,0.82);border:2px solid #7ec8ff;' +
      'pointer-events:none;text-align:center;font-family:system-ui,sans-serif;color:#fff;z-index:5;';
    host.append(this.root);
  }

  get visible(): boolean {
    return this.queue.current !== null;
  }

  /** Puts a sign in the line; it shows now if none is up. */
  push(text: CartelText, now: number, boss = false): void {
    this.queue.push(text, boss ? BOSS_CARTEL_MS : CARTEL_MS, now);
    this.sync();
  }

  /** Call every frame: takes a sign down when its time is up and puts the next one up. */
  update(now: number): void {
    this.queue.update(now);
    this.sync();
  }

  hide(): void {
    this.queue.clear();
    this.sync();
  }

  private sync(): void {
    const current = this.queue.current;
    if (current === this.drawn) return;
    this.drawn = current;
    if (current === null) this.root.style.display = 'none';
    else this.draw(current);
  }

  private draw(text: CartelText): void {
    const title = document.createElement('div');
    title.textContent = text.title;
    title.style.cssText = 'font-size:22px;font-weight:900;letter-spacing:0.5px;';
    const types = document.createElement('div');
    types.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:15px;';
    types.append(typeIcons(text.types, 24));
    const effective = document.createElement('div');
    effective.style.cssText =
      'display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;';
    const label = document.createElement('span');
    label.textContent = text.effectiveLabel;
    effective.append(label, typeIcons(text.effective, 24));
    const rows: HTMLElement[] = [title];
    if (text.types.length > 0) rows.push(types);
    rows.push(effective);
    if (text.boss !== null) {
      const boss = document.createElement('div');
      boss.textContent = text.boss;
      boss.style.cssText = 'font-size:15px;font-weight:700;color:#ffb347;';
      rows.push(boss);
    }
    this.root.replaceChildren(...rows);
    this.root.style.display = 'flex';
    if (typeof this.root.animate === 'function') {
      this.root.animate(
        [{ opacity: 0, transform: 'translateX(-50%) scale(0.9)' }, { opacity: 1 }],
        {
          duration: 180,
          easing: 'ease-out',
        },
      );
    }
  }
}
