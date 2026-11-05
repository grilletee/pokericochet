import type { Ball, Card, GameType, Member } from '../domain';
import { type CardTextContext, cardStep } from './cardText';
import { pokemonName } from './names';
import { TYPE_COLORS } from './typeColors';

/** Where the art of a species form lives; undefined = no art, a coloured marker is drawn. */
export interface ArtLookup {
  spriteUrl(form: string): string | undefined;
}

const GLYPHS: Record<'power' | 'cadence' | 'vitality' | 'team' | 'train', string> = {
  power: '⚔',
  cadence: '⟳',
  vitality: '♥',
  team: '★',
  train: '▲',
};

function box(css: string, text = ''): HTMLDivElement {
  const node = document.createElement('div');
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

/** A framed sprite of a form: the type colour as border, an optional level caption underneath. */
export function spriteTile(
  url: string | undefined,
  form: string,
  type: GameType | undefined,
  size: number,
  level?: number,
): HTMLElement {
  const color = type === undefined ? '#5b6aa8' : TYPE_COLORS[type];
  const tile = box(
    `display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;font-weight:700;`,
  );
  const frame = box(
    `width:${size}px;height:${size}px;border-radius:12px;border:2px solid ${color};` +
      `background:${color}33;display:flex;align-items:center;justify-content:center;overflow:hidden;`,
  );
  if (url === undefined) {
    frame.textContent = pokemonName(form).charAt(0);
    frame.style.fontSize = `${Math.round(size / 2)}px`;
  } else {
    const img = document.createElement('img');
    img.src = url;
    img.alt = pokemonName(form);
    img.draggable = false;
    img.style.cssText = `width:${size - 6}px;height:${size - 6}px;image-rendering:pixelated;`;
    frame.append(img);
  }
  tile.append(frame);
  if (level !== undefined) tile.append(box('opacity:0.85;', `Nv${level}`));
  return tile;
}

/** Gold of everything that announces a stage step: the card, its arrow, the banner. */
export const STEP_COLOR = '#ffd54f';

function symbol(text: string, color?: string): HTMLElement {
  return box(
    'font-size:24px;font-weight:800;opacity:0.9;align-self:center;padding-bottom:12px;' +
      (color === undefined ? '' : `color:${color};font-size:32px;opacity:1;`),
    text,
  );
}

/** A Pokémon of the team drawn in the form of its stage, with its level. */
function memberTile(
  member: Member,
  context: CardTextContext & ArtLookup,
  size: number,
): HTMLElement {
  const form = context.formOf(member);
  return spriteTile(context.spriteUrl(form), form, member.type, size, member.level);
}

function ballTile(ball: Ball, context: ArtLookup, size: number): HTMLElement {
  return spriteTile(context.spriteUrl(ball.species), ball.species, ball.type, size, ball.level);
}

/**
 * The picture of a card (ADR-024): the new ball, the two balls that evolve into the next form, or
 * the two ingredients of a hybrid and what they make. Upgrades get a big symbol. Built once per
 * offer, never per frame.
 */
export function buildCardArt(card: Card, context: CardTextContext & ArtLookup): HTMLElement {
  const row = box(
    'display:flex;align-items:center;justify-content:center;gap:8px;min-height:84px;',
  );
  switch (card.kind) {
    case 'newBall':
      row.append(
        spriteTile(context.spriteUrl(card.species), card.species, context.typeOf(card.species), 72),
      );
      break;
    case 'train':
    case 'power':
    case 'cadence': {
      const member = context.memberAt(card.member);
      if (member === undefined) break;
      const step = cardStep(card, context);
      if (step !== null) {
        // The card that evolves a Pokémon shows both forms, big, with a golden arrow (4F-D).
        const now = context.formOf(member);
        row.append(
          memberTile(member, context, 68),
          symbol(step.kind === 'evolve' ? '⇒' : '▲', STEP_COLOR),
          spriteTile(context.spriteUrl(step.to), step.to, member.type, 80, member.level + 1),
        );
        row.dataset.step = step.kind;
        row.title = `${pokemonName(now)} → ${pokemonName(step.to)}`;
        break;
      }
      row.append(memberTile(member, context, 68), symbol(GLYPHS[card.kind]));
      break;
    }
    case 'hybrid': {
      const first = context.ballAt(card.a);
      const second = context.ballAt(card.b);
      const result = context.previewHybrid(card.a, card.b);
      if (first === undefined || second === undefined || result === null) break;
      const made = spriteTile(
        context.spriteUrl(result.species),
        result.species,
        result.type,
        68,
        result.level,
      );
      // The second ingredient's type shows as a coloured corner on the result.
      const corner = box(
        `position:absolute;right:-2px;top:-2px;width:18px;height:18px;border-radius:50%;` +
          `background:${TYPE_COLORS[second.type]};border:2px solid #0b0e16;`,
      );
      const wrap = box('position:relative;');
      wrap.append(made, corner);
      row.append(
        ballTile(first, context, 56),
        symbol('+'),
        ballTile(second, context, 56),
        symbol('→'),
        wrap,
      );
      break;
    }
    default:
      row.append(
        box(
          'width:64px;height:64px;border-radius:50%;border:2px solid #5b6aa8;background:#2a3566;' +
            'display:flex;align-items:center;justify-content:center;font-size:32px;',
          GLYPHS[card.kind as keyof typeof GLYPHS] ?? '?',
        ),
      );
  }
  return row;
}
