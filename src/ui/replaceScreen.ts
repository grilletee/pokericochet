import type { GameType, Member } from '../domain';
import { speciesName } from './cardText';
import { type ArtLookup, spriteTile } from './cardView';
import { TYPE_COLORS } from './typeColors';

/** What the replace screen needs: the team, the capture and the rules that give each its form. */
export interface ReplaceView {
  readonly team: readonly Member[];
  readonly capture: { readonly species: string; readonly stage: number };
  readonly captureType: GameType | undefined;
  /** Level a Pokémon of the captured stage joins with. */
  readonly captureLevel: number;
  readonly stageOf: (level: number) => number;
}

function box(css: string, text = ''): HTMLDivElement {
  const node = document.createElement('div');
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

/**
 * The pause screen of a capture that finds the team full (ADR-030): big and plain. The capture on
 * top, the six Pokémon below with their level and cards (pressing one, or its number 1-6,
 * replaces it) and a button to let the capture go (0 or X). Built once per capture, never per frame.
 */
export class ReplaceScreen {
  private readonly root: HTMLDivElement;
  private shownKey = '';

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.dataset.replace = '';
    this.root.style.cssText =
      'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:12px;padding:16px;box-sizing:border-box;z-index:8;' +
      'background:rgba(5,8,16,0.88);font-family:system-ui,sans-serif;color:#e8ecf8;' +
      'text-align:center;overflow:auto;';
    host.append(this.root);
  }

  /** Shows the screen for a pending capture, or hides it with null. Calling it again is free. */
  update(
    view: ReplaceView | null,
    art: ArtLookup,
    onReplace: (slot: number) => void,
    onRelease: () => void,
  ): void {
    const key =
      view === null
        ? ''
        : `${view.capture.species}:${view.capture.stage}|${view.team
            .map((m) => `${m.species}:${m.level}:${m.damageUps}:${m.cadenceUps}`)
            .join(',')}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.root.replaceChildren();
    if (view === null) {
      this.root.style.display = 'none';
      return;
    }
    const name = speciesName(view.capture.species);
    this.root.append(
      box('font-size:24px;font-weight:800;', `¡Has capturado a ${name}! Tu equipo está completo`),
      spriteTile(
        art.spriteUrl(view.capture.species, view.capture.stage),
        view.capture.species,
        view.captureType,
        96,
        view.captureLevel,
      ),
      box('font-size:16px;opacity:0.9;', 'Elige a quién reemplaza (pierde su nivel y sus mejoras)'),
    );
    const row = box('display:flex;flex-wrap:wrap;justify-content:center;gap:10px;');
    view.team.forEach((member, slot) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.replaceSlot = String(slot);
      button.style.cssText =
        'pointer-events:auto;min-width:96px;min-height:44px;padding:8px;border-radius:12px;' +
        `border:2px solid ${TYPE_COLORS[member.type]};background:#1b2540;color:inherit;` +
        'font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;';
      button.append(
        spriteTile(
          art.spriteUrl(member.species, view.stageOf(member.level)),
          member.species,
          member.type,
          64,
          member.level,
        ),
        box('font-size:13px;font-weight:700;', `${slot + 1}. ${speciesName(member.species)}`),
        box('font-size:12px;opacity:0.85;', `⚔${member.damageUps} ⟳${member.cadenceUps}`),
      );
      button.addEventListener('click', () => onReplace(slot));
      row.append(button);
    });
    const release = document.createElement('button');
    release.type = 'button';
    release.dataset.replaceRelease = '';
    release.textContent = `Soltar a ${name} (0)`;
    release.style.cssText =
      'pointer-events:auto;min-height:44px;padding:10px 22px;border-radius:12px;font:inherit;' +
      'font-weight:700;border:2px solid #8a93b8;background:#2a3566;color:inherit;cursor:pointer;';
    release.addEventListener('click', onRelease);
    this.root.append(row, release);
    this.root.style.display = 'flex';
  }
}
