import type { GameType, MemberStats } from '../domain';
import { type ArtLookup, spriteTile } from './cardView';
import { pokemonName } from './names';
import { oneDecimal, statBars, statSummary } from './statBars';
import { TYPE_COLORS } from './typeColors';

/** A Pokémon as the replace screen shows it: its form, its level, its cards and its real stats. */
export interface ReplaceMember {
  readonly form: string;
  readonly type: GameType | undefined;
  readonly level: number;
  readonly damageUps: number;
  readonly cadenceUps: number;
  readonly stats: MemberStats;
  /** Guard of the team if this Pokémon were the one replaced (ADR-038). */
  readonly guardIfReplaced: number;
  /** The Pokémon the run began with: replacing it loses its signature too (4F-D). */
  readonly starter: boolean;
}

/** What the replace screen needs: the team, the capture and the guard before the choice. */
export interface ReplaceView {
  readonly team: readonly ReplaceMember[];
  readonly capture: Omit<ReplaceMember, 'damageUps' | 'cadenceUps' | 'guardIfReplaced' | 'starter'>;
  /** Guard of the team now, 0..1. */
  readonly guard: number;
}

function box(css: string, text = ''): HTMLDivElement {
  const node = document.createElement('div');
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

/** 0.234 -> "23 %". */
export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`;
}

/** "Guardia 18 % → 23 %" (or just the value when it does not change). */
export function guardChange(before: number, after: number): string {
  return percent(before) === percent(after)
    ? `Guardia ${percent(before)}`
    : `Guardia ${percent(before)} → ${percent(after)}`;
}

/**
 * The pause screen of a capture that finds the team full (ADR-030): big and plain. The capture on
 * top with its real stats, the Pokémon of the team below with theirs, their level and cards, and
 * what each choice does to the guard of the team (ADR-038). Pressing one, or its number 1-6,
 * replaces it; a button lets the capture go (0 or X). Built once per capture, never per frame.
 */
export class ReplaceScreen {
  private readonly root: HTMLDivElement;
  private shownKey = '';

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.dataset.replace = '';
    this.root.style.cssText =
      'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:10px;padding:16px;box-sizing:border-box;z-index:8;' +
      'background:rgba(5,8,16,0.92);font-family:system-ui,sans-serif;color:#e8ecf8;' +
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
        : `${view.capture.form}:${view.capture.level}|${view.team
            .map((m) => `${m.form}:${m.level}:${m.damageUps}:${m.cadenceUps}`)
            .join(',')}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.root.replaceChildren();
    if (view === null) {
      this.root.style.display = 'none';
      return;
    }
    const { capture } = view;
    const name = pokemonName(capture.form);
    const captured = box(
      `display:flex;align-items:center;gap:14px;padding:8px 12px;border-radius:14px;` +
        `border:2px solid ${capture.type === undefined ? '#5b6aa8' : TYPE_COLORS[capture.type]};` +
        'background:#1b2540;max-width:420px;width:100%;box-sizing:border-box;',
    );
    const captureInfo = box('flex:1;display:flex;flex-direction:column;gap:4px;');
    captureInfo.append(
      box('font-size:18px;font-weight:800;', `${name} Nv${capture.level}`),
      statBars(capture.stats),
      box('font-size:12px;opacity:0.85;', statSummary(capture.stats)),
    );
    captured.append(
      spriteTile(art.spriteUrl(capture.form), capture.form, capture.type, 88),
      captureInfo,
    );
    this.root.append(
      box('font-size:22px;font-weight:800;', `¡Has capturado a ${name}! Tu equipo está completo`),
      captured,
      box(
        'font-size:14px;opacity:0.9;',
        `Elige a quién reemplaza (pierde su nivel y sus mejoras) · ${guardChange(view.guard, view.guard)} ahora`,
      ),
    );
    const row = box('display:flex;flex-wrap:wrap;justify-content:center;gap:8px;');
    view.team.forEach((member, slot) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.replaceSlot = String(slot);
      button.style.cssText =
        'pointer-events:auto;width:158px;min-height:44px;padding:8px;border-radius:12px;' +
        `border:2px solid ${member.type === undefined ? '#5b6aa8' : TYPE_COLORS[member.type]};` +
        'background:#1b2540;color:inherit;font:inherit;cursor:pointer;display:flex;' +
        'flex-direction:column;align-items:center;gap:4px;box-sizing:border-box;';
      button.append(
        spriteTile(art.spriteUrl(member.form), member.form, member.type, 52, member.level),
        box('font-size:13px;font-weight:700;', `${slot + 1}. ${pokemonName(member.form)}`),
        ...(member.starter
          ? [box('font-size:11px;font-weight:800;color:#ffd54f;', '★ Inicial: perderías su firma')]
          : []),
        statBars(member.stats, true),
        box('font-size:11px;opacity:0.85;', statSummary(member.stats)),
        box('font-size:11px;opacity:0.85;', `⚔${member.damageUps} ⟳${member.cadenceUps}`),
        box(
          `font-size:11px;font-weight:700;color:${member.guardIfReplaced >= view.guard ? '#a5d6a7' : '#ef9a9a'};`,
          guardChange(view.guard, member.guardIfReplaced),
        ),
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

export { oneDecimal };
