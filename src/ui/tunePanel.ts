/** What the panel needs to know about a knob (the game builds these from `TUNE_DEFS`). */
export interface TuneRow {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly neutral: number;
  readonly hint: string;
}

/**
 * Live tuning panel (?tune): one slider per knob, a reset and a button that copies the resulting
 * configuration. Every change is applied at once; the panel keeps no game logic.
 */
export class TunePanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly status: HTMLSpanElement;
  private readonly inputs = new Map<string, HTMLInputElement>();
  private readonly labels = new Map<string, HTMLSpanElement>();

  constructor(
    host: HTMLElement,
    private readonly rows: readonly TuneRow[],
    private values: Record<string, number>,
    private readonly onChange: (values: Record<string, number>) => void,
    private readonly copyText: () => string,
  ) {
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.dataset.tuneToggle = '';
    this.toggle.textContent = 'Ajustes';
    this.toggle.style.cssText =
      'position:absolute;left:12px;top:104px;min-height:44px;min-width:44px;padding:4px 12px;' +
      'border-radius:8px;border:2px solid #5b6aa8;background:rgba(27,37,64,0.9);color:#e8ecf8;' +
      'font-family:system-ui,sans-serif;font-size:14px;cursor:pointer;pointer-events:auto;z-index:5;';
    this.root = document.createElement('div');
    this.root.dataset.tunePanel = '';
    this.root.style.cssText =
      'position:absolute;left:12px;top:154px;width:min(320px,calc(100% - 24px));max-height:70%;' +
      'overflow:auto;display:none;flex-direction:column;gap:6px;padding:8px;border-radius:8px;' +
      'background:rgba(5,8,16,0.88);font-family:system-ui,sans-serif;font-size:12px;color:#e8ecf8;' +
      'pointer-events:auto;z-index:5;';
    this.body = document.createElement('div');
    this.body.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;align-items:center;position:sticky;bottom:0;';
    this.status = document.createElement('span');
    actions.append(
      this.button('Copiar configuración', () => this.copy()),
      this.button('Restablecer', () => this.reset()),
      this.status,
    );
    this.root.append(this.body, actions);
    for (const row of rows) this.body.append(this.makeRow(row));
    // Neither the panel nor its button may steer or aim through the canvas input underneath.
    for (const el of [this.root, this.toggle]) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('keydown', (e) => e.stopPropagation());
    }
    this.toggle.addEventListener('click', () => {
      this.root.style.display = this.root.style.display === 'none' ? 'flex' : 'none';
    });
    host.append(this.toggle, this.root);
    this.refresh();
  }

  private button(text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.style.cssText =
      'min-height:44px;padding:4px 10px;border-radius:8px;border:2px solid #5b6aa8;' +
      'background:rgba(27,37,64,0.9);color:#e8ecf8;font:inherit;cursor:pointer;';
    b.addEventListener('click', onClick);
    return b;
  }

  private makeRow(row: TuneRow): HTMLDivElement {
    const wrap = document.createElement('div');
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;gap:8px;';
    const name = document.createElement('span');
    name.textContent = row.label;
    name.title = row.hint;
    const value = document.createElement('span');
    value.style.cssText = 'font-variant-numeric:tabular-nums;opacity:0.85;';
    head.append(name, value);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(row.min);
    input.max = String(row.max);
    input.step = String(row.step);
    input.dataset.tune = row.key;
    input.style.cssText = 'width:100%;min-height:28px;';
    input.addEventListener('input', () => {
      this.values = { ...this.values, [row.key]: Number(input.value) };
      this.refresh();
      this.onChange(this.values);
    });
    this.inputs.set(row.key, input);
    this.labels.set(row.key, value);
    wrap.append(head, input);
    return wrap;
  }

  private refresh(): void {
    for (const row of this.rows) {
      const value = this.values[row.key] ?? row.neutral;
      const input = this.inputs.get(row.key);
      if (input) input.value = String(value);
      const label = this.labels.get(row.key);
      if (label) {
        const digits = row.step < 0.01 ? 3 : row.step < 1 ? 2 : 0;
        label.textContent = `${value.toFixed(digits)}  ${value === row.neutral ? '' : '●'}`;
      }
    }
  }

  private reset(): void {
    this.values = Object.fromEntries(this.rows.map((r) => [r.key, r.neutral]));
    this.refresh();
    this.onChange(this.values);
    this.say('Restablecido');
  }

  private say(text: string): void {
    this.status.textContent = text;
    window.setTimeout(() => {
      this.status.textContent = '';
    }, 2000);
  }

  private copy(): void {
    const text = this.copyText();
    const done = (): void => this.say('Copiado');
    const fallback = (): void => {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      try {
        document.execCommand('copy');
        done();
      } catch {
        this.say('No se pudo copiar');
      }
      area.remove();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
}
