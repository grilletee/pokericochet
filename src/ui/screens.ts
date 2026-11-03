import type { GameType, RunSummary } from '../domain';
import { speciesName } from './cardText';
import type { CreditLine } from './creditsText';
import { TYPE_COLORS } from './fusionPanel';
import { type BestRunView, describeBest, describeResults, starterBlurb } from './screenText';

const PANEL =
  'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
  'justify-content:center;gap:10px;background:rgba(5,8,16,0.82);text-align:center;' +
  'font-family:system-ui,sans-serif;color:#e8ecf8;padding:16px;box-sizing:border-box;';
const BUTTON =
  'pointer-events:auto;min-width:240px;padding:12px 16px;border:2px solid #5b6aa8;' +
  'border-radius:10px;background:#1b2540;color:inherit;font:inherit;text-align:left;cursor:pointer;';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

export interface StarterOption {
  readonly id: string;
  readonly type: GameType;
}

/** Title screen: pick one of the starters (click, or keys 1-4). */
export class StartScreen {
  private readonly root = el('div', PANEL);

  constructor(host: HTMLElement) {
    this.root.dataset.screen = 'start';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.root);
  }

  show(
    title: string,
    starters: readonly StarterOption[],
    best: BestRunView | null,
    disclaimer: string,
    onPick: (index: number) => void,
    onCredits: () => void,
  ): void {
    this.root.replaceChildren(
      el('div', 'font-size:40px;font-weight:800;letter-spacing:0.5px;', title),
      el('div', 'font-size:18px;opacity:0.85;margin-bottom:8px;', 'Elige tu inicial'),
    );
    starters.forEach((starter, index) => {
      const button = el('button', `${BUTTON}border-color:${TYPE_COLORS[starter.type]};`);
      button.type = 'button';
      button.dataset.starter = starter.id;
      button.append(
        el('div', 'font-size:18px;font-weight:700;', `${index + 1}. ${speciesName(starter.id)}`),
        el('div', 'font-size:14px;opacity:0.8;margin-top:2px;', starterBlurb(starter.type)),
      );
      // Not "pointerdown": that would also reach the canvas input underneath.
      button.addEventListener('click', () => onPick(index));
      this.root.append(button);
    });
    this.root.append(
      el('div', 'font-size:14px;opacity:0.8;margin-top:10px;', describeBest(best)),
      el(
        'div',
        'font-size:13px;opacity:0.65;max-width:360px;',
        'Muévete con A/D, las flechas o manteniendo pulsado. Las bolas salen solas.',
      ),
    );
    const credits = el(
      'button',
      `${BUTTON}min-width:0;margin-top:6px;padding:6px 14px;`,
      'Créditos',
    );
    credits.type = 'button';
    credits.dataset.action = 'credits';
    credits.addEventListener('click', onCredits);
    this.root.append(
      credits,
      el('div', 'font-size:11px;opacity:0.6;max-width:420px;margin-top:6px;', disclaimer),
    );
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}

/** End-of-run screen: result, numbers, best run and the two ways to go on. */
export class ResultsScreen {
  private readonly root = el('div', PANEL);

  constructor(host: HTMLElement) {
    this.root.dataset.screen = 'results';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.root);
  }

  show(
    summary: RunSummary,
    best: BestRunView | null,
    isNewBest: boolean,
    onAgain: () => void,
    onMenu: () => void,
  ): void {
    const text = describeResults(summary, best, isNewBest);
    this.root.replaceChildren(
      el('div', 'font-size:36px;font-weight:800;margin-bottom:6px;', text.title),
      ...text.lines.map((line) => el('div', 'font-size:16px;max-width:420px;', line)),
    );
    const again = el('button', `${BUTTON}margin-top:12px;text-align:center;`, 'Jugar otra vez (R)');
    again.type = 'button';
    again.dataset.action = 'again';
    again.addEventListener('click', onAgain);
    const menu = el('button', `${BUTTON}text-align:center;`, 'Elegir inicial (M)');
    menu.type = 'button';
    menu.dataset.action = 'menu';
    menu.addEventListener('click', onMenu);
    this.root.append(again, menu);
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}

/** Credits and affiliation notice. */
export class CreditsScreen {
  private readonly root = el('div', PANEL);

  constructor(host: HTMLElement) {
    this.root.dataset.screen = 'credits';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.root);
  }

  show(title: string, lines: readonly CreditLine[], onBack: () => void): void {
    this.root.replaceChildren(
      el('div', 'font-size:30px;font-weight:800;margin-bottom:6px;', title),
    );
    for (const line of lines) {
      const row = el('div', 'font-size:14px;max-width:440px;line-height:1.4;');
      if (line.url === undefined) {
        row.textContent = line.text;
      } else {
        const link = document.createElement('a');
        link.href = line.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = line.text;
        link.style.cssText = 'color:#9db4ff;pointer-events:auto;';
        row.append(link);
      }
      this.root.append(row);
    }
    const back = el('button', `${BUTTON}margin-top:12px;text-align:center;`, 'Volver (Esc)');
    back.type = 'button';
    back.dataset.action = 'back';
    back.addEventListener('click', onBack);
    this.root.append(back);
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}
