/**
 * The HUD of a run (4V, block 4; art bible §5): small, framed, out of the way. Health as a bar of
 * segments that turns red when it is low, the level as a badge with its experience bar, the waves as
 * a row of pips (the bosses are diamonds) with the one in progress beating, and the seed in small
 * letters. `hudView` is pure (what to show); `HudPanel` draws it once and then only touches what
 * changed, so it costs nothing per frame.
 */
import { drawPixelNumber, pixelNumber } from './pixelNumber';

export interface HudView {
  readonly hp: number;
  readonly maxHp: number;
  readonly level: number;
  readonly xp: number;
  readonly xpNext: number;
  /** "Oleada 3/7", "Jefe 1/3", "Jefe final". */
  readonly stage: string;
  /** One mark per wave: 'done', 'now' or 'next'; and whether the current fight is a boss. */
  readonly waves: readonly ('done' | 'now' | 'next')[];
  readonly boss: boolean;
  readonly seed: number;
}

export interface HudInput {
  readonly hp: number;
  readonly maxHp: number;
  readonly level: number;
  readonly xp: number;
  readonly xpNext: number;
  readonly waveIndex: number;
  readonly waveCount: number;
  /** The label of a boss on the field ("Jefe 1/3", "Jefe final"), or null. */
  readonly boss: string | null;
  readonly seed: number;
}

export function hudView(input: HudInput): HudView {
  const count = Math.max(0, input.waveCount);
  const index = Math.max(0, input.waveIndex);
  const stage =
    input.boss ??
    (count > 0 && index >= count
      ? 'Jefe final'
      : `Oleada ${Math.min(index + 1, Math.max(1, count))}/${count}`);
  const waves = Array.from({ length: count }, (_, i): 'done' | 'now' | 'next' =>
    i < index ? 'done' : i === index ? 'now' : 'next',
  );
  return {
    hp: Math.max(0, Math.round(input.hp)),
    maxHp: Math.max(1, input.maxHp),
    level: input.level,
    xp: Math.max(0, Math.floor(input.xp)),
    xpNext: Math.max(1, input.xpNext),
    stage,
    waves,
    boss: input.boss !== null,
    seed: input.seed,
  };
}

/** The plain text of the HUD (what it said before 4V): for screen readers and the checks. */
export function hudLine(view: HudView): string {
  return `PV ${view.hp}/${view.maxHp}   Nv ${view.level} (${view.xp}/${view.xpNext} XP)   ${view.stage}\nSemilla ${view.seed}`;
}

/** Health segments: one per point up to 20, else 20 that each stand for a share. */
export function healthSegments(
  hp: number,
  maxHp: number,
): { readonly total: number; readonly lit: number } {
  const total = Math.max(1, Math.min(20, Math.round(maxHp)));
  const lit = hp <= 0 ? 0 : Math.max(1, Math.round((hp / Math.max(1, maxHp)) * total));
  return { total, lit: Math.min(total, lit) };
}

const INK = '#0b0d1a';
/** 4X: every number of the HUD at one whole scale (each font pixel two screen pixels). */
export const HUD_DIGIT_SCALE = 2;
const CSS = `
[data-hud-panel]{display:flex;flex-direction:column;gap:5px;padding:6px 8px;background:rgba(11,13,26,0.72);
  box-shadow:0 0 0 2px ${INK},0 0 0 4px #2b3a73,inset 0 2px 0 0 rgba(255,255,255,0.08);font-family:'Pixelify',monospace;
  white-space:normal !important;line-height:1 !important;width:max-content;max-width:100%;text-shadow:2px 2px 0 ${INK}}
[data-hud-panel] .hd-row{display:flex;align-items:center;gap:6px}
[data-hud-panel] .hd-k{font-size:11px;letter-spacing:1px;color:#9aa6c0;min-width:22px}
[data-hud-panel] .hd-n{font-size:14px;font-weight:700;color:#f6f3e8;min-width:44px}
[data-hud-panel] .hd-hp{display:flex;gap:2px}
[data-hud-panel] .hd-hp>i{width:7px;height:12px;background:#2b3a73;box-shadow:0 0 0 1px ${INK}}
[data-hud-panel] .hd-hp>i.on{background:linear-gradient(180deg,#ff8a7a 0 40%,#e04a4a 40% 100%)}
[data-hud-panel][data-low="1"] .hd-hp>i.on{animation:hd-blink 0.6s steps(2) infinite}
[data-hud-panel] .hd-lv{font-size:12px;font-weight:700;color:#ffd75a;background:${INK};padding:1px 5px;box-shadow:0 0 0 2px #ffd75a;display:flex;align-items:center;gap:2px}
[data-hud-panel] .hd-xp{width:110px;height:6px;background:#2b3a73;box-shadow:0 0 0 1px ${INK}}
[data-hud-panel] .hd-xp>div{height:100%;background:#5fb0ff}
[data-hud-panel] .hd-waves{display:flex;gap:3px;align-items:center}
[data-hud-panel] .hd-waves>i{width:8px;height:8px;background:#2b3a73;box-shadow:0 0 0 1px ${INK}}
[data-hud-panel] .hd-waves>i.done{background:#9fe86a}
[data-hud-panel] .hd-waves>i.now{background:#ffd75a;animation:hd-blink 0.9s steps(2) infinite}
[data-hud-panel][data-boss="1"] .hd-waves>i.now{background:#ff6a5a;transform:rotate(45deg)}
[data-hud-panel] .hd-stage{font-size:13px;font-weight:700;color:#f6f3e8}
[data-hud-panel][data-boss="1"] .hd-stage{color:#ff9a8a}
[data-hud-panel] .hd-seed{font-size:10px;color:#6f7a96}
@keyframes hd-blink{50%{filter:brightness(1.8)}}
`;

let styled = false;

function div(cls: string, text = ''): HTMLDivElement {
  const node = document.createElement('div');
  node.className = cls;
  node.textContent = text;
  return node;
}

/** The HUD drawn into a host element; `update` only changes what is different. */
export class HudPanel {
  private readonly hp = div('hd-hp');
  private readonly hpText = div('hd-n');
  private readonly level = div('hd-lv');
  private readonly xpFill = document.createElement('div');
  private readonly waves = div('hd-waves');
  private readonly stage = div('hd-stage');
  private readonly seed = div('hd-seed');
  // 4X, block 5: whole scales (1.5 drew some font pixels one screen pixel wider than others: the
  // digits looked "raros").
  private readonly hpNumber = pixelNumber('', '#f6f3e8', HUD_DIGIT_SCALE);
  private readonly levelNumber = pixelNumber('', '#ffd75a', HUD_DIGIT_SCALE);
  private readonly stageNumber = pixelNumber('', '#f6f3e8', HUD_DIGIT_SCALE);
  private key = '';

  constructor(private readonly host: HTMLElement) {
    if (!styled && typeof document !== 'undefined') {
      styled = true;
      const style = document.createElement('style');
      style.dataset.hudStyle = '';
      style.textContent = CSS;
      document.head.append(style);
    }
    host.dataset.hudPanel = '';
    const rowHp = div('hd-row');
    this.hpText.append(this.hpNumber);
    rowHp.append(div('hd-k', 'PV'), this.hp, this.hpText);
    const xp = div('hd-xp');
    xp.append(this.xpFill);
    const rowLv = div('hd-row');
    this.level.append(document.createTextNode('Nv '), this.levelNumber);
    rowLv.append(this.level, xp);
    const rowWave = div('hd-row');
    rowWave.append(this.waves, this.stage);
    host.replaceChildren(rowHp, rowLv, rowWave, this.seed);
  }

  update(view: HudView): void {
    const key = `${view.hp}/${view.maxHp}/${view.level}/${view.xp}/${view.xpNext}/${view.stage}/${view.waves.join('')}/${view.seed}`;
    if (key === this.key) return;
    this.key = key;
    const { total, lit } = healthSegments(view.hp, view.maxHp);
    if (this.hp.childElementCount !== total) {
      this.hp.replaceChildren(...Array.from({ length: total }, () => document.createElement('i')));
    }
    Array.from(this.hp.children).forEach((seg, i) => {
      seg.className = i < lit ? 'on' : '';
    });
    this.host.dataset.low = view.hp > 0 && view.hp / view.maxHp <= 0.3 ? '1' : '0';
    this.host.dataset.boss = view.boss ? '1' : '0';
    // 4W (block 3): the numbers in the game's own digits.
    drawPixelNumber(this.hpNumber, `${view.hp}/${view.maxHp}`, '#f6f3e8', HUD_DIGIT_SCALE);
    drawPixelNumber(this.levelNumber, String(view.level), '#ffd75a', HUD_DIGIT_SCALE);
    this.xpFill.style.width = `${Math.round(Math.min(1, view.xp / view.xpNext) * 100)}%`;
    if (this.waves.childElementCount !== view.waves.length) {
      this.waves.replaceChildren(...view.waves.map(() => document.createElement('i')));
    }
    Array.from(this.waves.children).forEach((pip, i) => {
      pip.className = view.waves[i] ?? 'next';
    });
    // "Oleada 3/7", "Jefe 1/3": the word as text, the count in the digits; "Jefe final" as text.
    const split = /^(.*\D)\s(\d+\/\d+)$/.exec(view.stage);
    if (split === null) {
      this.stage.textContent = view.stage;
    } else {
      this.stage.textContent = `${split[1] ?? ''} `;
      drawPixelNumber(
        this.stageNumber,
        split[2] ?? '',
        view.boss ? '#ff9a8a' : '#f6f3e8',
        HUD_DIGIT_SCALE,
      );
      this.stage.append(this.stageNumber);
    }
    this.seed.textContent = `Semilla ${view.seed}`;
    this.host.setAttribute('aria-label', hudLine(view));
    this.host.title = `${view.xp}/${view.xpNext} XP`;
  }
}
