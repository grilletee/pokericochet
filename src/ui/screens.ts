import type { GameType, RunSummary } from '../domain';
import { CONTROL_SCHEMES, type ControlScheme } from './controlSchemes';
import type { CreditLine } from './creditsText';
import { MenuBackdrop } from './menuBackdrop';
import { pokemonName } from './names';
import { type BestRunView, describeBest, describeResults, starterBlurb } from './screenText';
import { drawLogo } from './titleArt';
import { TYPE_COLORS } from './typeColors';

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
  /** The line that names its signature move (4F-D); empty if it has none. */
  readonly signature: string;
}

/** What the title screen can lead to (4G-I). */
export interface MenuActions {
  readonly onPlay: () => void;
  readonly onCollection: () => void;
  readonly onGacha: () => void;
  readonly onSettings: () => void;
  readonly onCredits: () => void;
}

/**
 * The title screen (4G-I, 16th playtest: "el inicio es muy feo"): the logo of the game over an
 * animated pixel night with bouncing spheres, and the menu: Jugar, Colección, Gacha, Ajustes,
 * Créditos. Keys: Enter plays.
 */
export class StartScreen {
  private readonly root = el('div', PANEL);
  private readonly backdrop = new MenuBackdrop();

  constructor(host: HTMLElement) {
    this.root.dataset.screen = 'start';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.root);
  }

  show(
    title: string,
    best: BestRunView | null,
    disclaimer: string,
    actions: MenuActions,
    footer = '',
  ): void {
    const logo = drawLogo(title, "'Pixelify',monospace");
    logo.dataset.logo = '';
    logo.style.cssText =
      'image-rendering:pixelated;width:min(92vw,560px,110vh);height:auto;margin-bottom:6px;' +
      'filter:drop-shadow(0 6px 0 #05060f);';
    // The pixel font may still be loading: draw the logo again once it is there.
    if (typeof document !== 'undefined' && document.fonts !== undefined) {
      void document.fonts.ready.then(() => {
        const again = drawLogo(title, "'Pixelify',monospace");
        const g = logo.getContext('2d');
        g?.clearRect(0, 0, logo.width, logo.height);
        g?.drawImage(again, 0, 0);
      });
    }
    // A low screen (a phone held sideways): the entries in a row, so they all fit.
    const low = typeof window !== 'undefined' && window.innerHeight < 520;
    const menu = el(
      'div',
      low
        ? 'display:flex;flex-direction:row;flex-wrap:wrap;gap:6px;justify-content:center;max-width:94vw;'
        : 'display:flex;flex-direction:column;gap:8px;align-items:stretch;',
    );
    const entries: readonly [string, string, () => void][] = [
      ['play', '▶ Jugar', actions.onPlay],
      ['collection', 'Colección', actions.onCollection],
      ['gacha', 'Gacha', actions.onGacha],
      ['settings', 'Ajustes', actions.onSettings],
      ['credits', 'Créditos', actions.onCredits],
    ];
    for (const [id, label, action] of entries) {
      const big = id === 'play';
      const button = el(
        'button',
        `${BUTTON}text-align:center;min-width:${low ? '120px' : '220px'};${big ? `font-size:${low ? 18 : 22}px;padding:${low ? '8px 14px' : '14px 18px'};border-color:#ffd54f;background:#2a3a6a;` : `font-size:${low ? 14 : 16}px;padding:${low ? '6px 10px' : '9px 16px'};`}`,
        label,
      );
      button.type = 'button';
      button.dataset.action = id;
      // Not "pointerdown": that would also reach the canvas input underneath.
      button.addEventListener('click', action);
      menu.append(button);
    }
    this.root.replaceChildren(
      this.backdrop.canvas,
      logo,
      menu,
      el('div', 'font-size:14px;opacity:0.85;margin-top:8px;', describeBest(best)),
      el('div', 'font-size:12px;opacity:0.75;', footer),
      el('div', 'font-size:11px;opacity:0.6;max-width:420px;margin-top:4px;', disclaimer),
    );
    // Everything above the animated night (which is drawn first, under it all).
    for (const child of Array.from(this.root.children)) {
      if (child !== this.backdrop.canvas && child instanceof HTMLElement) {
        child.style.position = 'relative';
        child.style.zIndex = '1';
      }
    }
    this.root.style.background = '#0b0e24';
    this.root.style.overflow = 'hidden';
    this.root.style.display = 'flex';
    this.backdrop.start();
  }

  hide(): void {
    this.root.style.display = 'none';
    this.backdrop.stop();
  }
}

/** A simple screen with a title, a few lines and a way back (the menus still being built). */
export class InfoScreen {
  private readonly root = el('div', PANEL);

  constructor(host: HTMLElement, id: string) {
    this.root.dataset.screen = id;
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.root);
  }

  show(title: string, lines: readonly string[], onBack: () => void): void {
    const back = el('button', `${BUTTON}text-align:center;min-width:0;`, 'Volver (M)');
    back.type = 'button';
    back.dataset.action = 'back';
    back.addEventListener('click', onBack);
    this.root.replaceChildren(
      el('div', 'font-size:30px;font-weight:800;', title),
      ...lines.map((line) => el('div', 'font-size:15px;opacity:0.85;max-width:420px;', line)),
      back,
    );
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}

/** Pick the Pokémon to start the run with (click, or keys 1-9). */
export class StarterScreen {
  private readonly root = el('div', PANEL);

  constructor(host: HTMLElement) {
    this.root.dataset.screen = 'starters';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.root);
  }

  show(
    title: string,
    starters: readonly StarterOption[],
    onPick: (index: number) => void,
    onBack: () => void,
  ): void {
    this.root.replaceChildren(
      el('div', 'font-size:30px;font-weight:800;letter-spacing:0.5px;', title),
    );
    starters.forEach((starter, index) => {
      const button = el('button', `${BUTTON}border-color:${TYPE_COLORS[starter.type]};`);
      button.type = 'button';
      button.dataset.starter = starter.id;
      button.append(
        el('div', 'font-size:18px;font-weight:700;', `${index + 1}. ${pokemonName(starter.id)}`),
        el('div', 'font-size:14px;opacity:0.8;margin-top:2px;', starterBlurb(starter.type)),
      );
      if (starter.signature !== '') {
        const line = el(
          'div',
          `font-size:13px;font-weight:700;margin-top:3px;color:${TYPE_COLORS[starter.type]};`,
          starter.signature,
        );
        line.dataset.signature = starter.id;
        button.append(line);
      }
      // Not "pointerdown": that would also reach the canvas input underneath.
      button.addEventListener('click', () => onPick(index));
      this.root.append(button);
    });
    const back = el(
      'button',
      `${BUTTON}min-width:0;margin-top:6px;padding:6px 14px;`,
      'Volver (M)',
    );
    back.type = 'button';
    back.dataset.action = 'back';
    back.addEventListener('click', onBack);
    this.root.append(
      el(
        'div',
        'font-size:13px;opacity:0.65;max-width:360px;',
        'Muévete con A/D, las flechas o manteniendo pulsado. Las bolas salen solas.',
      ),
      back,
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

/**
 * Settings screen (4H-B2): for now only the assisted aim, an accessibility option that is off by
 * default and is no longer in the game screen ("I never use it": it only gets in the way there).
 */
export class SettingsScreen {
  private readonly root = el('div', PANEL);

  constructor(host: HTMLElement) {
    this.root.dataset.screen = 'settings';
    // Many rows now (controls, volumes): on a small phone the screen scrolls, from the top.
    this.root.style.overflowY = 'auto';
    this.root.style.justifyContent = 'flex-start';
    this.root.style.gap = '8px';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.root);
  }

  show(
    autoAim: boolean,
    onAutoAim: (auto: boolean) => void,
    onBack: () => void,
    volumes: VolumeValues,
    onVolumes: (next: VolumeValues) => void,
    scheme: ControlScheme = 'classic',
    onScheme: (next: ControlScheme) => void = () => {},
  ): void {
    let auto = autoAim;
    let chosen = scheme;
    let current = volumes;
    this.root.replaceChildren(
      el('div', 'font-size:30px;font-weight:800;margin-bottom:6px;', 'Ajustes'),
    );
    const aim = el('button', `${BUTTON}text-align:center;`);
    aim.type = 'button';
    aim.dataset.setting = 'autoAim';
    const render = (): void => {
      aim.textContent = auto ? 'Apuntado asistido: sí' : 'Apuntado asistido: no';
    };
    render();
    aim.addEventListener('click', () => {
      auto = !auto;
      render();
      onAutoAim(auto);
    });
    const note = el(
      'div',
      'font-size:13px;opacity:0.75;max-width:380px;line-height:1.4;',
      'Accesibilidad: dispara solo al enemigo más cercano, con más dispersión y recarga más lenta. ' +
        'Por defecto se apunta con el ratón o el dedo.',
    );
    const back = el('button', `${BUTTON}margin-top:12px;text-align:center;`, 'Volver (Esc)');
    back.type = 'button';
    back.dataset.action = 'back';
    back.addEventListener('click', onBack);
    // Volumes (4G-F): everything, effects and the cries of the Pokémon; remembered by the app.
    const sliders: HTMLElement[] = [];
    for (const [key, label] of [
      ['master', 'Volumen general'],
      ['effects', 'Efectos'],
      ['cries', 'Gritos'],
    ] as const) {
      const row = el(
        'label',
        'display:flex;align-items:center;gap:10px;font-size:15px;width:320px;',
      );
      const name = el('span', 'flex:0 0 120px;text-align:left;', label);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '5';
      input.value = String(Math.round(current[key] * 100));
      input.dataset.volume = key;
      input.style.cssText = 'flex:1;min-height:32px;';
      const value = el('span', 'flex:0 0 44px;text-align:right;', `${input.value} %`);
      input.addEventListener('input', () => {
        current = { ...current, [key]: Number(input.value) / 100 };
        value.textContent = `${input.value} %`;
        onVolumes(current);
      });
      row.append(name, input, value);
      sliders.push(row);
    }
    // The control scheme (4G-G): one button per scheme, the chosen one lit, and its hint below.
    const hint = el(
      'div',
      'font-size:13px;opacity:0.8;max-width:380px;line-height:1.4;min-height:54px;',
    );
    const schemeButtons: HTMLButtonElement[] = [];
    const paint = (): void => {
      for (const button of schemeButtons) {
        const on = button.dataset.scheme === chosen;
        button.style.outline = on ? '3px solid #ffd54f' : 'none';
        button.style.opacity = on ? '1' : '0.7';
      }
      hint.textContent = CONTROL_SCHEMES.find((s) => s.id === chosen)?.hint ?? '';
    };
    const schemeTitle = el('div', 'font-size:17px;font-weight:700;margin-top:8px;', 'Controles');
    // 4G-H: only the classic scheme and the two thumbs; the old portrait prototypes are hidden (and
    // still shown if one of them is the one in force, so the choice is never invisible).
    for (const info of CONTROL_SCHEMES) {
      if (info.hidden === true && info.id !== chosen) continue;
      const button = el('button', `${BUTTON}text-align:center;width:340px;`, info.name);
      button.type = 'button';
      button.dataset.scheme = info.id;
      button.addEventListener('click', () => {
        chosen = info.id;
        paint();
        onScheme(info.id);
      });
      schemeButtons.push(button);
    }
    paint();
    this.root.append(aim, note, schemeTitle, ...schemeButtons, hint, ...sliders, back);
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}

/** The three volumes of the settings screen, 0..1 (the app keeps them: `app/settings.ts`). */
export interface VolumeValues {
  readonly master: number;
  readonly effects: number;
  readonly cries: number;
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
