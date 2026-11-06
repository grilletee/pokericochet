import type {
  BossAttackDef,
  BossFightDef,
  BossPatternDef,
  BossPhaseDef,
  GameType,
} from '../../domain';

/**
 * The boss fights as data (4G-B, ADR-046): ground attacks to dodge, a shield with a weak point that
 * asks for a bounce, a stun that is the window for the Ultimate, and three phases. PROVISIONAL like
 * the rest of the balance: calibrated with `pnpm bench:bosses` (B1-B6) and the author's own play.
 * The engine knows no boss: it reads these tables (seven templates by the main type of the boss
 * and one table of its own for each of the legendaries).
 */

/**
 * Share of the shield written in the tables below that is really used. The first tables made the
 * first boss last 78 s (the boss reaches the defence line at 94 s, so the bots lost to the clock):
 * a shield of a fixed size was too much for a team of level 3, so it is now a share of the boss's
 * health (every boss has the fight of its size) and `pnpm bench:bosses` (B3) fixes the scale.
 */
const SHIELD_SCALE = 0.3;

// Shorthands for the attacks: (width, telegraph, active, damage[, count / speed]).
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
  sweepSpeed: speed,
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

/** A phase: its attacks, the pause between them and (optionally) a shield of `shield` health. */
function phase(
  fromHp: number,
  intervalTicks: number,
  attacks: readonly BossAttackDef[],
  shield = 0,
): BossPhaseDef {
  return {
    fromHp,
    attacks,
    intervalTicks,
    // The numbers written below are thousandths of the boss's health (90 = 9 %).
    ...(shield > 0
      ? { shield: { share: (shield / 1000) * SHIELD_SCALE, weakRadius: 28, weakSpeed: 1.7 } }
      : {}),
  };
}

/** Three phases at 100 %, 66 % and 33 % of the health. */
function pattern(
  first: BossPhaseDef['attacks'],
  second: BossPhaseDef['attacks'],
  third: BossPhaseDef['attacks'],
  interval: number,
  shield: number,
): BossPatternDef {
  return {
    phases: [
      phase(1, interval, first, 0),
      phase(0.66, Math.round(interval * 0.85), second, shield),
      phase(0.33, Math.round(interval * 0.7), third, Math.round(shield * 1.3)),
    ],
  };
}

// The seven templates, by the main type of the boss (ADR-049): flames, bolts, frost, phantoms,
// quakes, tides and gardens.
const flame = pattern(
  [column(70, 90, 1)],
  [column(80, 80, 1), comb(4, 100, 1)],
  [column(90, 70, 2), comb(5, 95, 1), rain(40, 3, 80, 1)],
  230,
  90,
);
const bolt = pattern(
  [comb(3, 90, 1)],
  [comb(4, 80, 1), column(60, 70, 2)],
  [comb(5, 80, 1), rain(36, 4, 70, 1), comb(3, 65, 2)],
  210,
  90,
);
const frost = pattern(
  [sweep(70, 80, 2.4, 1)],
  [sweep(80, 75, 3, 1), column(80, 85, 1)],
  [sweep(90, 70, 3.6, 2), comb(4, 90, 1)],
  250,
  100,
);
const phantom = pattern(
  [sweep(60, 90, 2.8, 1), column(50, 80, 1)],
  [sweep(70, 80, 3.4, 1), rain(40, 3, 80, 1)],
  [sweep(80, 70, 4, 2), rain(36, 4, 75, 1), column(80, 65, 2)],
  220,
  95,
);
const quake = pattern(
  [column(110, 100, 2)],
  [column(120, 95, 2), rain(60, 3, 90, 1)],
  [column(130, 90, 2), comb(4, 100, 2), rain(50, 4, 85, 1)],
  270,
  110,
);
const tide = pattern(
  [sweep(90, 85, 2.2, 1)],
  [sweep(100, 80, 2.8, 1), comb(3, 85, 1)],
  [sweep(110, 75, 3.4, 2), sweep(70, 70, 4.2, 1), column(90, 70, 2)],
  240,
  100,
);
const garden = pattern(
  [column(80, 90, 1), rain(44, 2, 85, 1)],
  [rain(44, 3, 80, 1), comb(4, 90, 1)],
  [rain(40, 5, 75, 1), column(100, 70, 2), comb(5, 85, 1)],
  235,
  95,
);

/** The template of each type (the first one that matches a boss's main type). */
const byType: Partial<Record<GameType, BossPatternDef>> = {
  fire: flame,
  dragon: flame,
  electric: bolt,
  steel: bolt,
  ice: frost,
  psychic: frost,
  ghost: phantom,
  dark: phantom,
  poison: phantom,
  rock: quake,
  ground: quake,
  fighting: quake,
  water: tide,
  flying: tide,
  grass: garden,
  bug: garden,
  normal: garden,
  fairy: garden,
};

/**
 * One table of its own for each legendary of the final fight (ADR-046: "a pattern of its own"): the
 * template of its type with the attacks, the pace or the shield that make it a different fight.
 */
const legendaries: Record<string, BossPatternDef> = {
  moltres: pattern(
    [column(80, 85, 1), comb(4, 100, 1)],
    [column(90, 75, 2), rain(44, 4, 80, 1), comb(5, 90, 1)],
    [column(100, 65, 2), rain(40, 5, 70, 1), comb(5, 80, 2)],
    190,
    200,
  ),
  kyogre: pattern(
    [sweep(100, 85, 2.6, 1)],
    [sweep(110, 75, 3.2, 2), sweep(80, 80, 3.8, 1)],
    [sweep(120, 70, 4, 2), comb(4, 80, 2), sweep(70, 65, 4.6, 1)],
    200,
    210,
  ),
  virizion: pattern(
    [rain(44, 3, 85, 1), column(90, 90, 1)],
    [rain(40, 5, 80, 1), comb(4, 85, 1)],
    [rain(36, 6, 70, 1), comb(5, 80, 2), column(110, 70, 2)],
    185,
    190,
  ),
  zapdos: pattern(
    [comb(3, 80, 1), column(60, 80, 2)],
    [comb(4, 70, 1), rain(36, 5, 70, 1)],
    [comb(5, 65, 2), rain(32, 6, 65, 1), column(70, 60, 2)],
    170,
    200,
  ),
  articuno: pattern(
    [sweep(80, 85, 2.6, 1), column(80, 90, 1)],
    [sweep(90, 75, 3.4, 2), comb(4, 85, 1)],
    [sweep(100, 70, 4.2, 2), sweep(70, 75, 3, 1), comb(5, 80, 1)],
    195,
    210,
  ),
  mewtwo: pattern(
    [column(70, 80, 2), rain(40, 3, 80, 1)],
    [comb(4, 75, 2), column(80, 70, 2), rain(36, 4, 75, 1)],
    [comb(5, 70, 2), rain(32, 6, 65, 2), sweep(80, 65, 4.2, 2)],
    175,
    220,
  ),
  regirock: pattern(
    [column(130, 100, 2)],
    [column(140, 95, 2), column(100, 85, 2)],
    [column(150, 90, 3), comb(4, 95, 2), rain(60, 4, 80, 1)],
    240,
    260,
  ),
  registeel: pattern(
    [comb(3, 90, 1), column(90, 90, 1)],
    [comb(4, 80, 2), sweep(80, 80, 3, 1)],
    [comb(5, 75, 2), sweep(90, 70, 3.8, 2), column(110, 70, 2)],
    215,
    250,
  ),
  rayquaza: pattern(
    [sweep(90, 80, 3, 1), column(80, 80, 2)],
    [sweep(100, 70, 3.8, 2), rain(40, 5, 70, 1)],
    [sweep(110, 65, 4.6, 2), comb(5, 70, 2), rain(34, 6, 65, 1)],
    170,
    230,
  ),
  'giratina-altered': pattern(
    [sweep(60, 90, 3, 1), rain(40, 3, 80, 1)],
    [sweep(70, 75, 3.8, 2), rain(36, 5, 75, 1), column(70, 75, 2)],
    [sweep(80, 65, 4.4, 2), rain(34, 7, 65, 1), comb(5, 70, 2)],
    185,
    230,
  ),
  groudon: pattern(
    [column(120, 95, 2), column(90, 90, 1)],
    [column(130, 85, 2), comb(4, 90, 2)],
    [column(140, 80, 3), comb(5, 80, 2), rain(56, 5, 75, 1)],
    205,
    240,
  ),
  darkrai: pattern(
    [rain(40, 4, 75, 1), sweep(70, 85, 3, 1)],
    [rain(36, 6, 70, 1), sweep(80, 70, 3.8, 2)],
    [rain(32, 8, 65, 2), sweep(90, 65, 4.6, 2), comb(5, 70, 2)],
    165,
    220,
  ),
  arceus: pattern(
    [column(90, 85, 1), sweep(80, 85, 2.8, 1), rain(40, 3, 80, 1)],
    [comb(4, 80, 2), sweep(90, 75, 3.6, 2), rain(36, 5, 75, 1)],
    [comb(5, 70, 2), sweep(100, 65, 4.4, 2), rain(32, 7, 65, 2), column(110, 65, 3)],
    175,
    260,
  ),
  genesect: pattern(
    [rain(40, 4, 75, 1), comb(3, 85, 1)],
    [rain(36, 6, 70, 1), comb(4, 75, 2)],
    [rain(32, 8, 62, 1), comb(5, 68, 2), column(70, 62, 2)],
    170,
    220,
  ),
};

export const bossFight: BossFightDef = {
  // A third of the damage at most while the shield stands (ADR-046: "almost nothing").
  shieldMult: 0.15,
  stunTicks: 180,
  stunMult: 2,
  ultimateStunBonus: 1.5,
  ultimateShieldShare: 0.25,
  phasePauseTicks: 150,
  maxHazards: 12,
  bySpecies: legendaries,
  byType,
  default: garden,
};
