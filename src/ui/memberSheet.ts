import type { GameType, MemberStats } from '../domain';
import { typeName } from './cardText';
import { type ArtLookup, spriteTile } from './cardView';
import { moveName, pokemonName } from './names';
import { typeAbility } from './screenText';
import { statBars, statSummary } from './statBars';
import { TYPE_COLORS } from './typeColors';
import { typeIcons } from './typeIcons';

/** What the sheet of a Pokémon of the team shows (ADR-038, ADR-039). */
export interface SheetView {
  readonly form: string;
  readonly type: GameType | undefined;
  /** The one or two types of the form it shows, and the type its balls attack with at this stage. */
  readonly types: readonly GameType[];
  readonly attackType: GameType | undefined;
  readonly level: number;
  readonly stage: number;
  readonly stats: MemberStats;
  readonly damageUps: number;
  readonly cadenceUps: number;
  /** Id of the move it casts at this stage, if any. */
  readonly move: string | undefined;
  readonly charge: number;
  readonly chargeNeed: number;
  /** True for the starter's signature: it waits for the player instead of going off by itself (4F-D). */
  readonly signature: boolean;
}

function box(css: string, text = ''): HTMLDivElement {
  const node = document.createElement('div');
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

/**
 * The sheet of one Pokémon of the team: real stats and what they do. Opening it pauses the game
 * at the app level (it is not a phase of the run and takes no command, so the run does not
 * change). Closes with the button, Escape or a click outside.
 */
export class MemberSheet {
  private readonly root: HTMLDivElement;
  private onClose: () => void = () => {};

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.dataset.sheet = '';
    this.root.style.cssText =
      'position:absolute;inset:0;display:none;align-items:center;justify-content:center;z-index:9;' +
      'background:rgba(5,8,16,0.8);font-family:system-ui,sans-serif;color:#e8ecf8;';
    this.root.addEventListener('pointerdown', (event) => {
      if (event.target === this.root) this.hide();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.open) this.hide();
    });
    host.append(this.root);
  }

  get open(): boolean {
    return this.root.style.display !== 'none';
  }

  show(view: SheetView, art: ArtLookup, onClose: () => void): void {
    this.onClose = onClose;
    const color = view.type === undefined ? '#5b6aa8' : TYPE_COLORS[view.type];
    const card = box(
      `display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:16px;width:min(340px,92%);` +
        `border:2px solid ${color};background:#1b2540;box-sizing:border-box;`,
    );
    const head = box('display:flex;align-items:center;gap:12px;');
    head.append(
      spriteTile(art.spriteUrl(view.form), view.form, view.type, 80),
      box(
        'display:flex;flex-direction:column;gap:2px;',
        `${pokemonName(view.form)}\nNv${view.level} · fase ${view.stage}`,
      ),
    );
    const title = head.lastElementChild as HTMLElement;
    title.style.whiteSpace = 'pre-line';
    title.style.fontWeight = '800';
    card.append(
      head,
      statBars(view.stats),
      box('font-size:13px;opacity:0.9;', statSummary(view.stats)),
    );
    card.append(
      box('font-size:13px;', `⚔${view.damageUps} ⟳${view.cadenceUps} (mejoras de este Pokémon)`),
    );
    // What its type does, with the icons of its types (4G-C): "Ataca con Fuego: quema al impactar".
    const typesRow = box('display:flex;align-items:center;gap:6px;font-size:13px;');
    typesRow.dataset.sheetTypes = '';
    typesRow.append(typeIcons(view.types, 20));
    if (view.attackType !== undefined) {
      typesRow.append(
        box(
          'font-weight:700;',
          `Ataca con ${typeName(view.attackType)}: ${typeAbility(view.attackType)}`,
        ),
      );
    }
    card.append(typesRow);
    if (view.move !== undefined) {
      const label = view.signature ? 'Ultimate' : 'Movimiento';
      const state =
        view.charge >= view.chargeNeed ? 'lista' : `${view.charge}/${view.chargeNeed} golpes`;
      card.append(
        box('font-size:14px;font-weight:700;', `${label}: ${moveName(view.move)} (${state})`),
      );
      if (view.signature) {
        card.append(
          box('font-size:12px;opacity:0.85;', 'La lanzas tú: toca su retrato o pulsa su número.'),
        );
      }
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.dataset.sheetClose = '';
    close.textContent = 'Cerrar (Esc)';
    close.style.cssText =
      'pointer-events:auto;min-height:44px;padding:10px 22px;border-radius:12px;font:inherit;' +
      'font-weight:700;border:2px solid #8a93b8;background:#2a3566;color:inherit;cursor:pointer;';
    close.addEventListener('click', () => this.hide());
    card.append(close);
    this.root.replaceChildren(card);
    this.root.style.display = 'flex';
  }

  hide(): void {
    if (!this.open) return;
    this.root.style.display = 'none';
    this.root.replaceChildren();
    this.onClose();
  }
}
