import type { GameType, RunSummary } from '../domain';
import { type ArtLookup, spriteTile } from './cardView';
import { CONTROL_SCHEMES, type ControlScheme } from './controlSchemes';
import type { CreditLine } from './creditsText';
import { MenuBackdrop } from './menuBackdrop';
import { pokemonName } from './names';
import { drawProfessor, PROFESSOR_NAME } from './professor';
import { type BestRunView, describeBest, describeResults, starterBlurb } from './screenText';
import { drawLogo } from './titleArt';
import { TYPE_COLORS } from './typeColors';
import { typeIcons } from './typeIcons';

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
  /** A line about it in the collection (4G-I): its permanent level, the level it starts at. */
  readonly note?: string;
  /** 4G-J: both types, its region and the last form of its line, for the card. */
  readonly types?: readonly GameType[];
  readonly region?: string;
  readonly final?: string;
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

/**
 * Pick the Pokémon to start the run with (4G-J, block 3). The first time, the professor's tutorial
 * comes first, a page at a time (what the game is, that this Pokémon is yours for good, how the
 * collection grows); then a grid of cards with their sprite and types. Tapping a card shows it
 * bigger with what it does, and "¡Te elijo!" starts the run. Keys 1-9 still pick at once.
 */
export class StarterScreen {
  private readonly root = el('div', PANEL);
  private page = 0;
  private chosen = 0;

  constructor(
    host: HTMLElement,
    private readonly art: ArtLookup,
  ) {
    this.root.dataset.screen = 'starters';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.root);
  }

  show(
    title: string,
    starters: readonly StarterOption[],
    onPick: (index: number) => void,
    onBack: () => void,
    /** The pages of the professor's tutorial, the first time (4G-J); empty for the collection. */
    tutorial: readonly string[] = [],
    subtitle = '',
  ): void {
    this.page = tutorial.length > 0 ? 0 : -1;
    this.chosen = 0;
    this.render(title, subtitle, starters, onPick, onBack, tutorial);
    this.root.style.display = 'flex';
  }

  private render(
    title: string,
    subtitle: string,
    starters: readonly StarterOption[],
    onPick: (index: number) => void,
    onBack: () => void,
    tutorial: readonly string[],
  ): void {
    const again = (): void => this.render(title, subtitle, starters, onPick, onBack, tutorial);
    const back = el(
      'button',
      `${BUTTON}min-width:0;padding:6px 14px;text-align:center;`,
      'Volver (M)',
    );
    back.type = 'button';
    back.dataset.action = 'back';
    back.addEventListener('click', onBack);
    this.root.style.overflowY = 'auto';
    if (this.page >= 0 && this.page < tutorial.length) {
      // The tutorial: her portrait, her words, next / skip.
      this.root.style.justifyContent = 'center';
      const box = el(
        'div',
        'display:flex;gap:14px;align-items:flex-end;max-width:640px;text-align:left;flex-wrap:wrap;justify-content:center;',
      );
      box.dataset.professor = '';
      box.dataset.tutorialPage = String(this.page);
      const portrait = drawProfessor(6);
      portrait.style.filter = 'drop-shadow(4px 4px 0 #05060f)';
      const speech = el(
        'div',
        'flex:1 1 280px;padding:12px 14px;border:3px solid #e8ecf8;background:#10142a;' +
          'font-size:16px;line-height:1.5;display:flex;flex-direction:column;gap:8px;',
      );
      speech.append(
        el('div', 'font-size:12px;color:#ffd75a;letter-spacing:1px;', PROFESSOR_NAME.toUpperCase()),
        el('div', '', tutorial[this.page] ?? ''),
        el('div', 'font-size:11px;opacity:0.6;', `${this.page + 1} / ${tutorial.length}`),
      );
      box.append(portrait, speech);
      const next = el(
        'button',
        `${BUTTON}min-width:0;text-align:center;border-color:#ffd54f;background:#2a3a6a;`,
        this.page === tutorial.length - 1 ? 'Elegir mi Pokémon ▶' : 'Siguiente ▶',
      );
      next.type = 'button';
      next.dataset.action = 'tutorialNext';
      next.addEventListener('click', () => {
        this.page += 1;
        again();
      });
      const skip = el(
        'button',
        `${BUTTON}min-width:0;text-align:center;padding:6px 12px;`,
        'Saltar',
      );
      skip.type = 'button';
      skip.dataset.action = 'tutorialSkip';
      skip.addEventListener('click', () => {
        this.page = tutorial.length;
        again();
      });
      const row = el('div', 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;');
      row.append(next, skip, back);
      this.root.replaceChildren(el('div', 'font-size:26px;font-weight:800;', title), box, row);
      return;
    }
    // The grid of cards, and the chosen one bigger.
    this.root.style.justifyContent = 'flex-start';
    const head = el('div', 'display:flex;flex-direction:column;align-items:center;gap:2px;');
    head.append(el('div', 'font-size:26px;font-weight:800;letter-spacing:0.5px;', title));
    if (subtitle !== '') head.append(el('div', 'font-size:14px;opacity:0.85;', subtitle));
    const detail = this.detail(starters[this.chosen], () => onPick(this.chosen));
    const grid = el(
      'div',
      'display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:6px;width:min(96vw,900px);',
    );
    starters.forEach((starter, index) => {
      const card = el(
        'button',
        `${BUTTON}min-width:0;padding:4px;display:flex;flex-direction:column;align-items:center;gap:2px;` +
          `text-align:center;border-color:${index === this.chosen ? '#ffd54f' : TYPE_COLORS[starter.type]};`,
      );
      card.type = 'button';
      card.dataset.starter = starter.id;
      card.dataset.selected = index === this.chosen ? '1' : '0';
      card.append(
        spriteTile(this.art.spriteUrl(starter.id), starter.id, starter.type, 52, undefined, true),
        el(
          'div',
          'font-size:12px;font-weight:700;',
          `${index < 9 ? `${index + 1}. ` : ''}${pokemonName(starter.id)}`,
        ),
        typeIcons(starter.types ?? [starter.type], 14),
      );
      if (starter.region !== undefined)
        card.append(el('div', 'font-size:10px;opacity:0.7;', starter.region));
      card.addEventListener('click', () => {
        this.chosen = index;
        again();
      });
      grid.append(card);
    });
    this.root.replaceChildren(head, detail, grid, back);
  }

  /** The chosen Pokémon bigger, with what it does, and the button that starts the run. */
  private detail(starter: StarterOption | undefined, onPick: () => void): HTMLElement {
    const box = el(
      'div',
      'display:flex;gap:12px;align-items:center;padding:8px 12px;border:3px solid #ffd54f;' +
        'background:#10142a;text-align:left;max-width:min(96vw,640px);flex-wrap:wrap;justify-content:center;',
    );
    if (starter === undefined) return box;
    box.dataset.starterDetail = starter.id;
    const info = el('div', 'display:flex;flex-direction:column;gap:3px;flex:1 1 220px;');
    info.append(
      el('div', 'font-size:20px;font-weight:800;', pokemonName(starter.id)),
      el('div', 'font-size:13px;opacity:0.85;', starterBlurb(starter.type)),
    );
    if (starter.final !== undefined && starter.final !== starter.id) {
      info.append(
        el('div', 'font-size:12px;opacity:0.8;', `Evoluciona hasta ${pokemonName(starter.final)}`),
      );
    }
    if (starter.signature !== '') {
      const line = el(
        'div',
        `font-size:13px;font-weight:700;color:${TYPE_COLORS[starter.type]};`,
        starter.signature,
      );
      line.dataset.signature = starter.id;
      info.append(line);
    }
    if (starter.note !== undefined && starter.note !== '') {
      info.append(el('div', 'font-size:12px;opacity:0.85;', starter.note));
    }
    const go = el(
      'button',
      `${BUTTON}min-width:0;text-align:center;font-size:18px;border-color:#ffd54f;background:#2a3a6a;`,
      '¡Te elijo!',
    );
    go.type = 'button';
    go.dataset.action = 'choose';
    // Not "pointerdown": that would also reach the canvas input underneath.
    go.addEventListener('click', onPick);
    info.append(go);
    box.append(
      spriteTile(this.art.spriteUrl(starter.id), starter.id, starter.type, 96, undefined, true),
      info,
    );
    return box;
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
    /** What the run earned for the collection (4G-I): "+120 monedas (tienes 340)". */
    reward = '',
    /** Extra rows (4G-I: registering one of the captures), placed before the buttons. */
    extra: readonly HTMLElement[] = [],
  ): void {
    const text = describeResults(summary, best, isNewBest);
    this.root.replaceChildren(
      el('div', 'font-size:36px;font-weight:800;margin-bottom:6px;', text.title),
      ...text.lines.map((line) => el('div', 'font-size:16px;max-width:420px;', line)),
    );
    if (reward !== '') {
      const coins = el(
        'div',
        'font-size:18px;font-weight:800;color:#ffd54f;margin-top:6px;',
        reward,
      );
      coins.dataset.reward = '';
      this.root.append(coins);
    }
    this.root.append(...extra);
    this.root.style.overflowY = 'auto';
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
/** The layout of a phone held sideways (4G-J, block 4): the one in force and how to change it. */
export interface LayoutChoice {
  readonly current: 'a' | 'b';
  readonly onChange: (next: 'a' | 'b') => void;
  /** True when `?layout=` forces it (the choice is kept for later, but the link wins now). */
  readonly forced: boolean;
}

export const LAYOUT_TEXT: Readonly<Record<'a' | 'b', { name: string; hint: string }>> = {
  a: {
    name: 'Móvil A: campo de siempre, a todo el alto',
    hint: 'El campo ocupa toda la altura y el escenario sigue por los lados; el HUD y tus Pokémon flotan encima, transparentes.',
  },
  b: {
    name: 'Móvil B: campo más ancho',
    hint: 'Como la A, con un campo un 20 % más ancho: más sitio para esquivar. Cambia un poco el juego.',
  },
};

function layoutRows(choice: LayoutChoice): HTMLElement[] {
  const title = el('div', 'font-size:17px;font-weight:700;margin-top:8px;', 'Pantalla del móvil');
  const rows: HTMLElement[] = [title];
  for (const id of ['a', 'b'] as const) {
    const on = choice.current === id;
    const button = el(
      'button',
      `${BUTTON}text-align:center;width:340px;outline:${on ? '3px solid #ffd54f' : 'none'};opacity:${on ? 1 : 0.7};`,
      LAYOUT_TEXT[id].name,
    );
    button.type = 'button';
    button.dataset.layoutChoice = id;
    button.addEventListener('click', () => choice.onChange(id));
    rows.push(button);
  }
  rows.push(
    el(
      'div',
      'font-size:13px;opacity:0.8;max-width:380px;line-height:1.4;',
      `${LAYOUT_TEXT[choice.current].hint}${choice.forced ? ' (Ahora lo fija el enlace.)' : ''}`,
    ),
  );
  return rows;
}

/** Export and import of the save (4G-I). `status` is a line to show after an import. */
export interface SaveActions {
  readonly onExport: () => void;
  readonly onImport: () => void;
  readonly status: string;
}

function saveRows(save: SaveActions): HTMLElement[] {
  const title = el('div', 'font-size:17px;font-weight:700;margin-top:8px;', 'Tu guardado');
  const row = el('div', 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;');
  for (const [id, label, action] of [
    ['export', 'Exportar guardado', save.onExport],
    ['import', 'Importar guardado', save.onImport],
  ] as const) {
    const button = el('button', `${BUTTON}text-align:center;min-width:0;padding:8px 12px;`, label);
    button.type = 'button';
    button.dataset.save = id;
    button.addEventListener('click', action);
    row.append(button);
  }
  const status = el('div', 'font-size:13px;opacity:0.8;max-width:360px;', save.status);
  status.dataset.saveStatus = '';
  return [title, row, status];
}

export class SettingsScreen {
  private readonly root = el('div', PANEL);
  private saveSection: HTMLElement[] = [];

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
    /** The save of the collection (4G-I): export it to a file, or bring one back. */
    save: SaveActions | null = null,
    /** The layout of a phone held sideways (4G-J): null on a tablet or a desktop (not offered). */
    layout: LayoutChoice | null = null,
  ): void {
    this.saveSection = save === null ? [] : saveRows(save);
    const layoutSection = layout === null ? [] : layoutRows(layout);
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
      ['music', 'Música'],
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
    this.root.append(
      aim,
      note,
      schemeTitle,
      ...schemeButtons,
      hint,
      ...layoutSection,
      ...sliders,
      ...this.saveSection,
      back,
    );
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
  readonly music: number;
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
