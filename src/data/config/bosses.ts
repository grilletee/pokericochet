import type {
  BossAttackDef,
  BossFightDef,
  BossPatternDef,
  BossPhaseDef,
  GameType,
} from '../../domain';

/**
 * The boss fights as data (4G-C, ADR-053, which replaces the columns-and-shield fights of ADR-046).
 * Two phases (the normal one and the fury at half health), a core that closes and opens (the skill:
 * hit it when it is open), and attacks of five kinds of verb by family of type, like the families of
 * effects: SHOTS (fire, electric, dragon, steel, psychic), TIDES (water, ice, flying: sweeps and
 * gusts that push), HAZE (poison, ghost, dark: patches that keep you from collecting, and rain),
 * QUAKES (ground, rock, fighting: heavy columns, gusts and combs) and SWARMS (bug, fairy, normal,
 * grass: reinforcements, rain and shots). Each of the 14 legendaries has a table of its own.
 * PROVISIONAL: calibrated with `pnpm bench:bosses` and, above all, with the author's own play.
 */

// Shorthands: (width, telegraph, damage), etc. Every attack that hurts is announced >= 60 ticks.
const column = (width: number, telegraph: number, damage: number): BossAttackDef => ({
  kind: 'column',
  width,
  telegraphTicks: telegraph,
  activeTicks: 20,
  damage,
});
const comb = (count: number, telegraph: number, damage: number): BossAttackDef => ({
  kind: 'comb',
  width: 0,
  count,
  telegraphTicks: telegraph,
  activeTicks: 20,
  damage,
});
const sweep = (width: number, telegraph: number, speed: number, damage: number): BossAttackDef => ({
  kind: 'sweep',
  width,
  telegraphTicks: telegraph,
  // It crosses about 40 % of the floor and stops, so the far side is always a safe place.
  activeTicks: Math.round(190 / speed),
  speed,
  damage,
});
const rain = (width: number, count: number, telegraph: number, damage: number): BossAttackDef => ({
  kind: 'rain',
  width,
  count,
  telegraphTicks: telegraph,
  activeTicks: 16,
  damage,
});
const shot = (
  width: number,
  count: number,
  telegraph: number,
  speed: number,
  damage: number,
): BossAttackDef => ({
  kind: 'shot',
  width,
  count,
  telegraphTicks: telegraph,
  activeTicks: 0,
  speed,
  damage,
});
const zone = (width: number, telegraph: number, active: number): BossAttackDef => ({
  kind: 'zone',
  width,
  telegraphTicks: telegraph,
  activeTicks: active,
  damage: 0,
});
const gust = (telegraph: number, active: number, speed: number): BossAttackDef => ({
  kind: 'gust',
  width: 480,
  telegraphTicks: telegraph,
  activeTicks: active,
  damage: 0,
  speed,
});
const summon = (count: number): BossAttackDef => ({
  kind: 'summon',
  width: 0,
  count,
  telegraphTicks: 0,
  activeTicks: 0,
  damage: 0,
});

interface Shape {
  /** Ticks between rounds, attacks per round and the ticks the core stays closed / open. */
  readonly interval: number;
  readonly perRound: number;
  readonly coreEvery: number;
  readonly coreOpen: number;
  readonly damageMult?: number;
  /** Scales the damage written in the attacks (the intermediates hit softer than the finals). */
  readonly damageScale?: number;
  /** Damage multiplier of the fury (x1.5 for the finals). */
  readonly furyMult?: number;
}

/** The softer numbers of the intermediate bosses (the first of them met a team of level 4). */
const SOFT: Partial<Shape> = { damageScale: 0.5, furyMult: 1.2, interval: 250 };

/**
 * Scales of the core clock written in the tables below: the first numbers (a window of ~3 s every
 * ~8 s) left the bots with 9 % of the boss's health per window and the boss reaching the line, so the
 * bench (B3) moved them: windows come sooner and last longer.
 */
const EVERY_SCALE = 0.62;
const OPEN_SCALE = 1.2;

function phase(attacks: readonly BossAttackDef[], shape: Shape): BossPhaseDef {
  return {
    attacks,
    intervalTicks: shape.interval,
    perRound: shape.perRound,
    damageMult: shape.damageMult ?? 1,
    coreEvery: Math.round(shape.coreEvery * EVERY_SCALE),
    coreOpen: Math.round(shape.coreOpen * OPEN_SCALE),
  };
}

/**
 * A table: the normal phase and the fury. The fury is faster (shorter rounds, one more attack, a core
 * that closes for less time and stays open less), harder (x1.5 damage) and has its own attacks.
 */
function table(
  normal: readonly BossAttackDef[],
  fury: readonly BossAttackDef[],
  shape: Partial<Shape> = {},
): BossPatternDef {
  const base: Shape = {
    interval: 215, // the intermediates; every legendary sets a shorter one of its own
    perRound: 1,
    coreEvery: 420,
    coreOpen: 170,
    ...shape,
  };
  // The finals (no `SOFT`) hit at 0.8 of what is written, and 1.35 in the fury: the bench (deaths at
  // the final boss) moved them from 1 and 1.5, which killed nine games in ten that reached it.
  const scale = base.damageScale ?? 0.65;
  // The finals also pause 30 % longer between rounds (the intermediates already did through SOFT).
  const pace = shape.damageScale === undefined ? 1.3 : 1;
  const paced: Shape = { ...base, interval: Math.round(base.interval * pace) };
  const scaled = (list: readonly BossAttackDef[]): BossAttackDef[] =>
    list.map((a) => ({ ...a, damage: a.damage * scale }));
  return {
    phases: [
      phase(scaled(normal), paced),
      phase(scaled(fury), {
        interval: Math.round(paced.interval * 0.68),
        perRound: base.perRound + 1,
        coreEvery: Math.round(base.coreEvery * 0.8),
        coreOpen: Math.round(base.coreOpen * 0.8),
        damageMult: base.furyMult ?? 1.3,
      }),
    ],
  };
}

// The five families of the intermediate bosses.
const shots = table(
  [shot(36, 1, 80, 5.5, 2), column(70, 90, 2)],
  [shot(36, 3, 70, 7, 3), column(90, 80, 3), comb(4, 90, 2)],
  SOFT,
);
const tides = table(
  [sweep(80, 80, 2.6, 2), gust(70, 150, 2.2)],
  [sweep(100, 70, 3.6, 3), sweep(70, 75, 4.2, 2), gust(60, 170, 3), rain(36, 3, 75, 2)],
  SOFT,
);
const haze = table(
  [zone(110, 70, 260), rain(40, 3, 80, 2)],
  [zone(140, 60, 300), rain(36, 5, 70, 3), shot(40, 2, 70, 6, 3), summon(2)],
  SOFT,
);
const quakes = table(
  [column(110, 95, 3), gust(80, 150, 3), comb(4, 95, 2)],
  [column(130, 85, 4), comb(5, 85, 3), gust(60, 190, 3.6), rain(60, 4, 80, 3)],
  SOFT,
);
const swarms = table(
  [summon(2), rain(40, 3, 85, 2), shot(34, 1, 80, 5, 2)],
  [summon(3), rain(36, 5, 70, 3), shot(34, 3, 70, 6.5, 3), zone(100, 70, 240)],
  SOFT,
);

const byType: Partial<Record<GameType, BossPatternDef>> = {
  fire: shots,
  electric: shots,
  dragon: shots,
  steel: shots,
  psychic: shots,
  water: tides,
  ice: tides,
  flying: tides,
  poison: haze,
  ghost: haze,
  dark: haze,
  ground: quakes,
  rock: quakes,
  fighting: quakes,
  bug: swarms,
  fairy: swarms,
  normal: swarms,
  grass: swarms,
};

/**
 * The final bosses (4G-C): each legendary has a table of its own, with more attacks per round, more
 * damage (3 to 4 health, 4 to 6 in the fury: enough to die), a core that opens for a shorter time and
 * a mechanic that is its own, described next to it. The first attack list is the normal phase.
 */
const legendaries: Record<string, BossPatternDef> = {
  // Moltres: a barrage of shots from above, with columns of fire between them.
  moltres: table(
    [shot(38, 2, 75, 6.5, 3), column(80, 85, 3)],
    [shot(38, 4, 65, 8, 4), column(100, 75, 4), comb(5, 85, 3)],
    { interval: 135, coreEvery: 400, coreOpen: 140 },
  ),
  // Kyogre: waves from both sides and winds that carry you into them.
  kyogre: table(
    [sweep(110, 80, 3, 3), gust(70, 170, 2.6)],
    [sweep(130, 70, 4, 4), sweep(80, 70, 4.8, 3), gust(60, 200, 3.4), rain(40, 4, 75, 3)],
    { interval: 140, coreEvery: 420, coreOpen: 150 },
  ),
  // Virizion: a swarm that never stops, and rain to dodge while you clear it.
  virizion: table(
    [summon(3), rain(40, 4, 80, 3)],
    [summon(4), rain(36, 6, 65, 4), shot(34, 3, 70, 7, 3), zone(120, 65, 260)],
    { interval: 130, coreEvery: 410, coreOpen: 150 },
  ),
  // Zapdos: fast combs and aimed shots; the core flickers open for a short time.
  zapdos: table(
    [comb(4, 75, 3), shot(32, 2, 70, 7.5, 3)],
    [comb(5, 68, 4), shot(32, 4, 62, 9, 4), column(60, 62, 4)],
    { interval: 115, coreEvery: 330, coreOpen: 110 },
  ),
  // Articuno: sweeps and patches of ice where you cannot pick your balls up.
  articuno: table(
    [sweep(90, 80, 2.8, 3), zone(120, 70, 280)],
    [sweep(110, 70, 4, 4), zone(150, 60, 320), comb(4, 80, 3), rain(36, 4, 70, 3)],
    { interval: 140, coreEvery: 430, coreOpen: 150 },
  ),
  // Mewtwo: the hardest shots, thrown in threes, and a core that opens for very little time.
  mewtwo: table(
    [shot(34, 3, 72, 7.5, 3), zone(100, 70, 240)],
    [shot(34, 5, 62, 9.5, 4), zone(130, 60, 280), column(60, 62, 5)],
    { interval: 120, coreEvery: 360, coreOpen: 100 },
  ),
  // Regirock: slow and enormous columns, with a wind that throws you onto them.
  regirock: table(
    [column(140, 100, 4), gust(80, 170, 3)],
    [column(170, 90, 5), gust(60, 220, 4), comb(4, 90, 4), rain(70, 4, 80, 3)],
    { interval: 170, coreEvery: 470, coreOpen: 190 },
  ),
  // Registeel: combs and patches that close the floor little by little; the core stays open long.
  registeel: table(
    [comb(4, 85, 3), zone(130, 70, 300)],
    [comb(5, 75, 4), zone(160, 60, 340), column(100, 70, 4), shot(40, 2, 70, 6.5, 3)],
    { interval: 150, coreEvery: 450, coreOpen: 210 },
  ),
  // Rayquaza: a gale in both directions with sweeps through it.
  rayquaza: table(
    [gust(60, 200, 3.2), sweep(100, 75, 3.4, 3)],
    [gust(60, 240, 4.2), sweep(120, 65, 4.8, 4), rain(36, 5, 65, 3), comb(5, 70, 4)],
    { interval: 125, coreEvery: 390, coreOpen: 130 },
  ),
  // Giratina: patches, rain and reinforcements from another world.
  'giratina-altered': table(
    [zone(120, 65, 280), rain(40, 4, 75, 3), summon(2)],
    [zone(160, 60, 320), rain(36, 7, 62, 4), summon(3), sweep(90, 65, 4.4, 4)],
    { interval: 130, coreEvery: 400, coreOpen: 140 },
  ),
  // Groudon: the heaviest columns, gusts that push you into them and a rain of lava.
  groudon: table(
    [column(130, 95, 4), gust(70, 170, 3.2), rain(56, 3, 80, 3)],
    [column(160, 82, 5), gust(60, 230, 4.2), rain(56, 6, 68, 4), comb(4, 82, 4)],
    { interval: 150, coreEvery: 430, coreOpen: 150 },
  ),
  // Darkrai: darkness (patches), shots from nowhere and a swarm of shadows.
  darkrai: table(
    [zone(130, 65, 280), shot(34, 3, 70, 7, 3)],
    [zone(170, 60, 330), shot(34, 5, 60, 9, 4), summon(3), rain(32, 6, 62, 4)],
    { interval: 125, coreEvery: 370, coreOpen: 120 },
  ),
  // Arceus: a little of everything, which is the point.
  arceus: table(
    [column(90, 85, 3), sweep(90, 80, 3, 3), shot(36, 2, 75, 7, 3), summon(2)],
    [comb(5, 70, 4), sweep(110, 65, 4.4, 4), shot(36, 4, 62, 9, 4), zone(140, 60, 300), summon(3)],
    { interval: 130, coreEvery: 420, coreOpen: 140 },
  ),
  // Genesect: reinforcements, shots and rain at the same time.
  genesect: table(
    [summon(3), shot(34, 3, 72, 7.5, 3), rain(36, 4, 78, 3)],
    [summon(4), shot(34, 5, 62, 9.5, 4), rain(32, 7, 62, 4), column(70, 62, 4)],
    { interval: 120, coreEvery: 380, coreOpen: 130 },
  ),
};

export const bossFight: BossFightDef = {
  // The fury starts at half health, with a message and no pause.
  rageAt: 0.5,
  // While the core is closed almost nothing gets through; open, a ball anywhere does half and a ball
  // ON the core does x3 of that (the skill: aim for it); an Ultimate in the open does x1.5 more.
  closedMult: 0.1,
  openMult: 0.6,
  coreHitMult: 5,
  ultimateOpenBonus: 1.5,
  coreWarnTicks: 60,
  calmTicks: 150,
  maxHazards: 14,
  bySpecies: legendaries,
  byType,
  default: swarms,
};
