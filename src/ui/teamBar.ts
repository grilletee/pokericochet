import type { GameType, Member } from '../domain';
import { type ArtLookup, spriteTile } from './cardView';
import { pokemonName } from './names';
import { TYPE_COLORS } from './typeColors';

const FLY_MS = 700;

function animate(
  element: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  return typeof element.animate === 'function' ? element.animate(keyframes, options) : null;
}

/** Same Pokémon, same level and same cards: what the bar needs to know to redraw a tile. */
function memberKey(member: Member): string {
  return `${member.species}:${member.level}:${member.damageUps}:${member.cadenceUps}`;
}

/**
 * How close a Pokémon is to its move (4F-D), shown as the glow of its portrait instead of a bar:
 * `near` = its own move is about to go off; `ready` = the starter's signature waits for the player.
 */
export type TileGlow = 'idle' | 'near' | 'ready';

/**
 * The team of up to six Pokémon as a row of big tiles (ADR-030): the form of its stage, its level
 * and the cards taken for it. The DOM is rebuilt only when the team changes. A captured Pokémon
 * flies from where it was picked up to its tile, which stays hidden until it arrives. Tiles are
 * addressed by their place in the team.
 */
export class TeamBar {
  private readonly root: HTMLDivElement;
  private shown: readonly string[] = [];
  private readonly tiles = new Map<number, HTMLElement>();
  /** The last glow drawn on each tile, so it only writes on change. */
  private readonly glows = new Map<number, TileGlow>();
  /** The looping pulse of each glowing tile (cancelled when the glow changes). */
  private readonly pulses = new Map<number, Animation>();
  /** The "ULTIMATE" tag of each tile, shown while its signature move is ready. */
  private readonly tags = new Map<number, HTMLElement>();
  /** Places whose tile waits for the capture sprite to land. */
  private readonly arriving = new Set<number>();
  private onInspect: (member: number) => void = () => {};
  private onTap: (member: number) => void = () => {};

  constructor(
    host: HTMLElement,
    private readonly art: ArtLookup,
    private readonly typeOf: (species: string) => GameType | undefined,
    /** The species a Pokémon shows now (ADR-036): what the bar draws and names. */
    private readonly formOf: (member: Member) => string,
    /** How close each Pokémon is to its move (4F-D). */
    private readonly glowOf: (member: Member, index: number) => TileGlow,
  ) {
    this.root = document.createElement('div');
    this.root.dataset.teamBar = '';
    this.root.style.cssText =
      'position:absolute;left:12px;top:112px;display:none;flex-wrap:wrap;gap:4px;' +
      'max-width:min(340px,calc(100% - 180px));pointer-events:none;' +
      'font-family:system-ui,sans-serif;color:#e8ecf8;';
    host.append(this.root);
  }

  /** Called with the place of the Pokémon whose "i" was pressed (the sheet of ADR-038). */
  setOnInspect(handler: (member: number) => void): void {
    this.onInspect = handler;
  }

  /** Called with the place of the Pokémon whose portrait was tapped (throws its signature if ready). */
  setOnTap(handler: (member: number) => void): void {
    this.onTap = handler;
  }

  /** Cheap to call every frame: it compares a short key per Pokémon and moves the glows. */
  update(team: readonly Member[] | null): void {
    if (team === null) {
      if (this.shown.length === 0 && this.root.style.display === 'none') return;
      this.root.style.display = 'none';
      this.shown = [];
      this.tiles.clear();
      this.glows.clear();
      this.tags.clear();
      this.arriving.clear();
      return;
    }
    const keys = team.map(memberKey);
    if (keys.length !== this.shown.length || keys.some((key, i) => key !== this.shown[i])) {
      this.shown = keys;
      this.root.style.display = 'flex';
      this.root.replaceChildren();
      this.tiles.clear();
      this.glows.clear();
      this.tags.clear();
      team.forEach((member, index) => {
        const tile = this.buildTile(member, index);
        if (this.arriving.has(index)) tile.style.opacity = '0';
        this.tiles.set(index, tile);
        this.root.append(tile);
      });
    }
    team.forEach((member, index) => {
      const tile = this.tiles.get(index);
      if (tile === undefined) return;
      const glow = this.glowOf(member, index);
      if (this.glows.get(index) === glow) return;
      this.glows.set(index, glow);
      const color = TYPE_COLORS[member.type];
      tile.dataset.glow = glow;
      tile.style.filter =
        glow === 'ready'
          ? `drop-shadow(0 0 9px ${color}) drop-shadow(0 0 4px #fff)`
          : glow === 'near'
            ? `drop-shadow(0 0 5px ${color})`
            : '';
      // A ready Ultimate breathes (6th playtest: "I did not notice the portrait that glows").
      this.pulses.get(index)?.cancel();
      this.pulses.delete(index);
      if (glow !== 'idle') {
        const loop = animate(
          tile,
          [
            { transform: 'scale(1)' },
            { transform: glow === 'ready' ? 'scale(1.18)' : 'scale(1.08)' },
            { transform: 'scale(1)' },
          ],
          { duration: glow === 'ready' ? 700 : 1100, iterations: Number.POSITIVE_INFINITY },
        );
        if (loop !== null) this.pulses.set(index, loop);
      }
      const tag = this.tags.get(index);
      if (tag !== undefined) tag.style.display = glow === 'ready' ? 'block' : 'none';
    });
  }

  private buildTile(member: Member, index: number): HTMLElement {
    const form = this.formOf(member);
    // A sphere like the ones that fly in the field (4G-G): the same Pokémon, the same glass.
    const tile = spriteTile(this.art.spriteUrl(form), form, member.type, 48, member.level, true);
    tile.dataset.teamTile = String(index);
    tile.title = `${pokemonName(form)} Nv${member.level}`;
    tile.style.cssText += 'pointer-events:auto;cursor:pointer;position:relative;';
    tile.addEventListener('click', () => this.onTap(index));
    const name = document.createElement('div');
    name.textContent = pokemonName(form);
    name.style.cssText =
      'font-size:10px;font-weight:700;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    tile.append(name);
    // "ULTIMATE" with the key that throws it, only while the signature is ready (4F-D).
    const tag = document.createElement('div');
    tag.dataset.signatureTag = '';
    tag.textContent = `¡ULTIMATE! [${index + 1}]`;
    tag.style.cssText =
      `display:none;font-size:9px;font-weight:800;padding:0 3px;border-radius:4px;color:#10131c;` +
      `background:${TYPE_COLORS[member.type]};white-space:nowrap;`;
    tile.append(tag);
    this.tags.set(index, tag);
    // The sheet is one tap away on a small "i": the portrait itself is for the signature.
    const info = document.createElement('button');
    info.type = 'button';
    info.dataset.teamInfo = String(index);
    info.textContent = 'i';
    info.setAttribute('aria-label', `Ficha de ${pokemonName(form)}`);
    info.style.cssText =
      'position:absolute;right:-6px;top:-6px;width:20px;height:20px;border-radius:50%;padding:0;' +
      'border:1px solid #ffffff88;background:#0b0e16cc;color:#e8ecf8;font:700 11px system-ui;' +
      'cursor:pointer;pointer-events:auto;';
    info.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onInspect(index);
    });
    tile.append(info);
    const ups = member.damageUps + member.cadenceUps;
    if (ups > 0) {
      const mark = document.createElement('div');
      mark.style.cssText = `font-size:10px;font-weight:700;color:${TYPE_COLORS[member.type]};`;
      mark.textContent = `⚔${member.damageUps} ⟳${member.cadenceUps}`;
      tile.append(mark);
    }
    return tile;
  }

  /** Scale-and-glow pulse on the tile of a Pokémon that just evolved or was trained. */
  pulse(member: number): void {
    const tile = this.tiles.get(member);
    if (tile === undefined) return;
    animate(
      tile,
      [
        { transform: 'scale(1)', filter: 'brightness(1)' },
        { transform: 'scale(1.7)', filter: 'brightness(2.4)', offset: 0.35 },
        { transform: 'scale(1)', filter: 'brightness(1)' },
      ],
      { duration: 900, easing: 'ease-out' },
    );
  }

  /**
   * Flies the sprite of a captured Pokémon from screen point (`fromX`, `fromY`), relative to the
   * host, to its tile. Call after `update`, so the tile exists.
   */
  flyCapture(
    member: number,
    species: string,
    url: string | undefined,
    fromX: number,
    fromY: number,
  ): void {
    const tile = this.tiles.get(member);
    const target = (tile ?? this.root).getBoundingClientRect();
    const hostRect = this.root.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const toX = target.left - hostRect.left + target.width / 2;
    const toY = target.top - hostRect.top + target.height / 2;
    if (tile !== undefined) {
      this.arriving.add(member);
      tile.style.opacity = '0';
    }
    const flier = spriteTile(url, species, this.typeOf(species), 44);
    flier.style.cssText += 'position:absolute;left:0;top:0;pointer-events:none;z-index:5;';
    this.root.parentElement?.append(flier);
    const finish = (): void => {
      flier.remove();
      this.arriving.delete(member);
      const landed = this.tiles.get(member);
      if (landed !== undefined) {
        landed.style.opacity = '1';
        this.pulse(member);
      }
    };
    const flight = animate(
      flier,
      [
        { transform: `translate(${fromX - 22}px,${fromY - 22}px) scale(0.6)`, opacity: 0.2 },
        {
          transform: `translate(${fromX - 22}px,${fromY - 54}px) scale(1.6)`,
          opacity: 1,
          offset: 0.25,
        },
        { transform: `translate(${toX - 22}px,${toY - 22}px) scale(0.55)`, opacity: 1 },
      ],
      { duration: FLY_MS, easing: 'ease-in-out', fill: 'forwards' },
    );
    if (flight === null) finish();
    else flight.onfinish = finish;
  }
}

/**
 * Big, short message while the run goes on underneath (it never pauses the game): the balls that
 * evolve or fuse and what they became, drawn with the sprites. Does not take pointer events.
 */
export class EvolutionBanner {
  private readonly root: HTMLDivElement;
  private timer = 0;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.dataset.banner = '';
    this.root.style.cssText =
      'position:absolute;left:50%;top:22%;transform:translateX(-50%);display:none;' +
      'flex-direction:column;align-items:center;gap:6px;padding:10px 18px;border-radius:14px;' +
      'background:rgba(5,8,16,0.82);border:2px solid #ffffff55;pointer-events:none;z-index:6;' +
      'font-family:system-ui,sans-serif;color:#e8ecf8;text-align:center;max-width:88%;';
    host.append(this.root);
  }

  /** `tiles` are the pictures (from, to), `text` the caption. */
  show(tiles: readonly HTMLElement[], text: string, accent: string): void {
    window.clearTimeout(this.timer);
    this.root.replaceChildren();
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;';
    for (const tile of tiles) row.append(tile);
    const caption = document.createElement('div');
    caption.style.cssText = 'font-size:16px;font-weight:700;';
    caption.textContent = text;
    this.root.append(row, caption);
    this.root.style.borderColor = accent;
    this.root.style.display = 'flex';
    animate(
      this.root,
      [
        { opacity: 0, transform: 'translateX(-50%) scale(0.7)' },
        { opacity: 1, transform: 'translateX(-50%) scale(1.08)', offset: 0.3 },
        { opacity: 1, transform: 'translateX(-50%) scale(1)' },
      ],
      { duration: 380, easing: 'ease-out' },
    );
    this.timer = window.setTimeout(() => {
      this.root.style.display = 'none';
    }, 2200);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.root.style.display = 'none';
  }
}
