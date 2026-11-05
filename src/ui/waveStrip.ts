import type { WaveAdvice } from '../domain';
import { BOSS_WARNING_TICKS, bossCountdown, waveLabel } from './screenText';
import { typeIcons } from './typeIcons';

function part(css: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.style.cssText = css;
  return node;
}

/**
 * The strip under the HUD that is always there (ADR-050): the wave in progress, a bar and the seconds
 * left, the types the wave brings, and how long until the next boss. While a boss lives it only
 * says which one. It writes to the DOM only when what it shows changes, so it can be updated every
 * frame; the pulse of the last seconds before a boss uses the same rule.
 */
export class WaveStrip {
  private readonly root: HTMLDivElement;
  private readonly label = part('white-space:nowrap;font-weight:700;');
  private readonly track = part(
    'flex:1;min-width:36px;height:8px;border-radius:4px;background:rgba(255,255,255,0.2);' +
      'overflow:hidden;position:relative;',
  );
  private readonly fill = part('position:absolute;left:0;top:0;height:100%;background:#7ec8ff;');
  private readonly time = part('white-space:nowrap;min-width:30px;text-align:right;');
  private readonly icons = part('display:inline-flex;');
  private readonly boss = part('flex-basis:100%;white-space:nowrap;font-weight:700;color:#ffb347;');
  private key = '';
  private typesKey = '';
  private warned = false;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.dataset.waveStrip = '';
    this.root.style.cssText =
      // Two rows at most, and 150 px short of the right edge: the sound and aim buttons live there.
      'position:absolute;left:12px;right:150px;top:58px;display:none;flex-wrap:wrap;' +
      'align-items:center;gap:2px 8px;' +
      'padding:3px 10px;border-radius:12px;background:rgba(5,8,16,0.6);pointer-events:none;' +
      'font-family:system-ui,sans-serif;font-size:13px;color:#e8ecf8;box-sizing:border-box;';
    this.track.append(this.fill);
    this.root.append(this.label, this.track, this.time, this.icons, this.boss);
    host.append(this.root);
  }

  get element(): HTMLElement {
    return this.root;
  }

  /** `bossName` is the label of the boss on the field ("Jefe 1/3"), or null when none is. */
  update(advice: WaveAdvice | null, bossName: string | null): void {
    if (advice === null) {
      if (this.key !== '') {
        this.key = '';
        this.root.style.display = 'none';
      }
      return;
    }
    const seconds = Math.ceil(advice.ticksLeft / 60);
    const bossText = advice.boss === null ? '' : bossCountdown(advice.boss);
    const near = advice.boss !== null && advice.boss.ticks <= BOSS_WARNING_TICKS;
    const key = `${bossName ?? ''}|${advice.index}|${seconds}|${bossText}|${advice.types.join(',')}`;
    if (key === this.key) return;
    this.key = key;
    this.root.style.display = 'flex';
    if (bossName !== null) {
      this.label.textContent = bossName;
      this.track.style.display = 'none';
      this.time.style.display = 'none';
      this.boss.style.display = 'none';
      this.icons.style.display = 'none';
      this.warned = false;
      return;
    }
    this.track.style.display = 'block';
    this.time.style.display = 'inline';
    this.boss.style.display = 'inline';
    this.icons.style.display = 'inline-flex';
    this.label.textContent = waveLabel(advice.index, advice.total);
    const done = advice.ticksTotal > 0 ? 1 - advice.ticksLeft / advice.ticksTotal : 1;
    this.fill.style.width = `${Math.round(100 * done)}%`;
    this.time.textContent = `${seconds} s`;
    this.boss.textContent = bossText;
    const typesKey = advice.types.join(',');
    if (typesKey !== this.typesKey) {
      this.typesKey = typesKey;
      this.icons.replaceChildren(typeIcons(advice.types, 16));
    }
    if (near && !this.warned && typeof this.boss.animate === 'function') {
      this.boss.animate([{ opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }], {
        duration: 700,
        iterations: 5,
      });
    }
    this.warned = near;
  }
}
