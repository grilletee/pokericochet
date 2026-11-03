/**
 * DOM overlay on top of the canvas: health, a message (lost, restart hint) and an optional
 * debug panel. It only writes to the DOM when a value changes, so it adds no per-frame work.
 */
export class Overlay {
  private readonly hud: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly debug: HTMLPreElement;
  private lastHud = '';
  private lastMessage = '';
  private lastDebug = '';

  constructor(host: HTMLElement) {
    const base =
      'position:absolute;pointer-events:none;font-family:system-ui,sans-serif;color:#e8ecf8;';
    this.hud = document.createElement('div');
    this.hud.style.cssText = `${base}left:12px;top:10px;font-size:18px;font-weight:600;`;
    this.message = document.createElement('div');
    this.message.style.cssText =
      `${base}inset:0;display:none;align-items:center;justify-content:center;` +
      'text-align:center;font-size:26px;font-weight:700;background:rgba(5,8,16,0.6);white-space:pre-line;';
    this.debug = document.createElement('pre');
    this.debug.style.cssText =
      `${base}right:8px;top:8px;margin:0;font-size:12px;line-height:1.35;` +
      'background:rgba(5,8,16,0.7);padding:6px 8px;border-radius:4px;display:none;';
    host.append(this.hud, this.message, this.debug);
  }

  setHud(text: string): void {
    if (text === this.lastHud) return;
    this.lastHud = text;
    this.hud.textContent = text;
  }

  /** Shows a centred message, or hides it with null. */
  setMessage(text: string | null): void {
    const value = text ?? '';
    if (value === this.lastMessage) return;
    this.lastMessage = value;
    this.message.textContent = value;
    this.message.style.display = text === null ? 'none' : 'flex';
  }

  setDebug(text: string | null): void {
    const value = text ?? '';
    if (value === this.lastDebug) return;
    this.lastDebug = value;
    this.debug.textContent = value;
    this.debug.style.display = text === null ? 'none' : 'block';
  }
}
