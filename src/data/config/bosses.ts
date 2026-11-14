import type {
  BossAttackDef,
  BossFightDef,
  BossMechanicDef,
  BossPatternDef,
  BossPhaseDef,
  GameType,
} from '../../domain';
import { WARN_TICKS } from '../../domain';

/**
 * The boss fights as data (4G-D, ADR-054, which replaces the core of ADR-053 and keeps its two
 * phases, its eight verbs and its fury). A boss attacks in rounds of the verbs of its family of
 * type; every so often it STOPS and CHARGES its strong attack, glowing, and then launches it (since
 * 4G-H the charge is only a warning: no exposed damage). The legendaries add a mechanic of their own.
 * PROVISIONAL: calibrated with `pnpm bench:bosses` and, above all, with the author's own play.
 */

// ---- The verbs. Every attack that hurts is announced for at least 60 ticks.
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
  /** Ticks between rounds, attacks per round and the ticks between charges / the charge lasts. */
  readonly interval: number;
  readonly perRound: number;
  readonly coreEvery: number;
  readonly coreOpen: number;
  readonly damageScale?: number;
  readonly furyMult?: number;
}

/**
 * The scales of the charge clock written in the tables: a charge of ~3 s every ~8 s left the bots
 * with too little time to hurt the boss, so the bench (B3) moved them.
 */
const EVERY_SCALE = 0.62;
const OPEN_SCALE = 1.2;

/** Every attack that is announced has the one warning time of the game (4G-F). */
const announced = (a: BossAttackDef): BossAttackDef =>
  a.kind === 'summon' ? a : { ...a, telegraphTicks: WARN_TICKS };

function phase(
  attacks: readonly BossAttackDef[],
  strong: BossAttackDef,
  shape: Shape & { readonly damageMult: number },
): BossPhaseDef {
  return {
    attacks: attacks.map(announced),
    strong: announced(strong),
    intervalTicks: shape.interval,
    perRound: shape.perRound,
    damageMult: shape.damageMult,
    coreEvery: Math.round(shape.coreEvery * EVERY_SCALE),
    coreOpen: Math.round(shape.coreOpen * OPEN_SCALE),
  };
}

/** The softer numbers of the intermediate bosses (the first of them met a team of level 4). */
// 4G-I: damageScale 0.6 -> 0.45. The body of the player is its hitbox now (16th playtest: grazes
// did not count): the same attacks land more often, so each one hurts a little less.
const SOFT: Partial<Shape> = { damageScale: 0.45, furyMult: 1.25, interval: 200 }; // 4G-F: interval 230 -> 200 (4G-E: 0.5 / 1.2 / 250)

/**
 * A table: the normal phase and the fury, each with its attacks and its strong attack. The fury is
 * faster (shorter rounds, one more attack per round, shorter charges), harder (a damage multiplier)
 * and has its own attacks. Without `SOFT` it is the table of a final boss: harder, and slower to
 * attack so each attack can still be read.
 */
function table(
  normal: readonly BossAttackDef[],
  fury: readonly BossAttackDef[],
  strong: readonly [BossAttackDef, BossAttackDef],
  shape: Partial<Shape> = {},
  mechanic?: BossMechanicDef,
): BossPatternDef {
  const base: Shape = { interval: 215, perRound: 1, coreEvery: 420, coreOpen: 170, ...shape };
  const final = shape.damageScale === undefined;
  const scale = base.damageScale ?? 0.7; // 4G-I: 0.85 -> 0.7 (the body is the hitbox); 4G-E: 0.75 -> 0.85
  const interval = Math.round(base.interval * (final ? 1.3 : 1));
  const scaled = (list: readonly BossAttackDef[]): BossAttackDef[] =>
    list.map((a) => ({ ...a, damage: a.damage * scale }));
  const strongOf = (a: BossAttackDef): BossAttackDef => ({ ...a, damage: a.damage * scale });
  return {
    phases: [
      phase(scaled(normal), strongOf(strong[0]), { ...base, interval, damageMult: 1 }),
      phase(scaled(fury), strongOf(strong[1]), {
        interval: Math.round(interval * 0.68),
        perRound: base.perRound + 1,
        coreEvery: Math.round(base.coreEvery * 0.8),
        coreOpen: Math.round(base.coreOpen * 0.8),
        damageMult: base.furyMult ?? 1.35,
      }),
    ],
    ...(mechanic === undefined ? {} : { mechanic }),
  };
}

// ---- The five families: the attacks of the normal phase, of the fury and the strong attack of each.
interface Family {
  readonly normal: readonly BossAttackDef[];
  readonly fury: readonly BossAttackDef[];
  readonly strong: readonly [BossAttackDef, BossAttackDef];
}
const FAMILIES: Record<'shots' | 'tides' | 'haze' | 'quakes' | 'swarms', Family> = {
  shots: {
    normal: [shot(36, 1, 80, 5.5, 2), column(70, 90, 2)],
    fury: [shot(36, 3, 70, 7, 3), column(90, 80, 3), comb(4, 90, 2)],
    strong: [comb(3, 80, 3), comb(4, 70, 4)],
  },
  tides: {
    normal: [sweep(80, 80, 2.6, 2), gust(70, 150, 2.2)],
    fury: [sweep(100, 70, 3.6, 3), sweep(70, 75, 4.2, 2), gust(60, 170, 3), rain(36, 3, 75, 2)],
    strong: [sweep(170, 75, 3.4, 3), sweep(210, 68, 4, 4)],
  },
  haze: {
    normal: [zone(110, 70, 260), rain(40, 3, 80, 2)],
    fury: [zone(140, 60, 300), rain(36, 5, 70, 3), shot(40, 2, 70, 6, 3), summon(2)],
    strong: [rain(44, 6, 72, 3), rain(40, 9, 64, 4)],
  },
  quakes: {
    normal: [column(110, 95, 3), gust(80, 150, 3), comb(4, 95, 2)],
    fury: [column(130, 85, 4), comb(5, 85, 3), gust(60, 190, 3.6), rain(60, 4, 80, 3)],
    strong: [column(190, 85, 4), column(230, 75, 5)],
  },
  swarms: {
    normal: [summon(2), rain(40, 3, 85, 2), shot(34, 1, 80, 5, 2)],
    fury: [summon(3), rain(36, 5, 70, 3), shot(34, 3, 70, 6.5, 3), zone(100, 70, 240)],
    strong: [shot(40, 4, 72, 6, 3), shot(40, 6, 62, 8, 4)],
  },
};

/**
 * 4G-F (13th playtest: "atacan poco y tienen pocos ataques"): the intermediate bosses get one more
 * verb in each phase and two attacks per round. The final bosses keep the plain family tables.
 */
const EXTRA: Record<keyof typeof FAMILIES, { normal: BossAttackDef[]; fury: BossAttackDef[] }> = {
  shots: { normal: [comb(3, 80, 2)], fury: [rain(34, 3, 80, 2)] },
  tides: { normal: [shot(34, 1, 80, 5, 2)], fury: [shot(34, 2, 80, 6, 3)] },
  haze: { normal: [shot(34, 1, 80, 5, 2)], fury: [sweep(80, 80, 3, 2)] },
  quakes: { normal: [rain(50, 3, 80, 2)], fury: [shot(36, 2, 80, 6, 3)] },
  swarms: { normal: [column(60, 80, 2)], fury: [comb(4, 80, 2)] },
};

const intermediate = (family: Family, name: keyof typeof FAMILIES): BossPatternDef =>
  table(
    [...family.normal, ...EXTRA[name].normal],
    [...family.fury, ...EXTRA[name].fury],
    family.strong,
    SOFT,
  );

const byType: Partial<Record<GameType, BossPatternDef>> = {};
const FAMILY_OF_TYPE: Record<GameType, keyof typeof FAMILIES> = {
  fire: 'shots',
  electric: 'shots',
  dragon: 'shots',
  steel: 'shots',
  psychic: 'shots',
  water: 'tides',
  ice: 'tides',
  flying: 'tides',
  poison: 'haze',
  ghost: 'haze',
  dark: 'haze',
  ground: 'quakes',
  rock: 'quakes',
  fighting: 'quakes',
  bug: 'swarms',
  fairy: 'swarms',
  normal: 'swarms',
  grass: 'swarms',
};
// One table per family, shared by the types of the family.
const familyTables = {
  shots: intermediate(FAMILIES.shots, 'shots'),
  tides: intermediate(FAMILIES.tides, 'tides'),
  haze: intermediate(FAMILIES.haze, 'haze'),
  quakes: intermediate(FAMILIES.quakes, 'quakes'),
  swarms: intermediate(FAMILIES.swarms, 'swarms'),
};
for (const [type, family] of Object.entries(FAMILY_OF_TYPE)) {
  byType[type as GameType] = familyTables[family];
}

// ---- The legendaries: 37 of them (generations 1-4, plus Virizion and Genesect which were already
// here). Each has a family of attacks (by its type), a shape of its own (the pace and the charge) and,
// the iconic ones, a mechanic no other boss has (ADR-054).
const TIDE: BossMechanicDef = { kind: 'tide', maxSqueeze: 0.55, riseTicks: 1500 };
const CRACKS: BossMechanicDef = { kind: 'cracks', everyTicks: 420, count: 2, lastTicks: 420 };
const BARRIER: BossMechanicDef = { kind: 'barrier', onTicks: 150, offTicks: 330 };
const SLOW: BossMechanicDef = { kind: 'timeSlow', everyTicks: 520, lastTicks: 220, mult: 0.5 };
const PORTALS: BossMechanicDef = { kind: 'portals', everyTicks: 520, lastTicks: 330 };
const STORM: BossMechanicDef = { kind: 'storm', everyTicks: 380, count: 3 };
const METEORS: BossMechanicDef = { kind: 'meteors', everyTicks: 400, count: 3 };

interface Legend {
  readonly family: keyof typeof FAMILIES;
  /** Ticks between rounds: different for every legendary, so no two are the same fight. */
  readonly interval: number;
  readonly charge?: number;
  readonly open?: number;
  readonly mechanic?: BossMechanicDef;
}

/** Variants of the iconic mechanics for the rest (a shorter or a longer barrier, faster cracks...). */
const variant = (m: BossMechanicDef, k: number): BossMechanicDef => {
  switch (m.kind) {
    case 'tide':
      return { ...m, maxSqueeze: m.maxSqueeze * k };
    case 'cracks':
      return {
        ...m,
        everyTicks: Math.round(m.everyTicks / k),
        lastTicks: Math.round(m.lastTicks * k),
      };
    case 'barrier':
      return { ...m, onTicks: Math.round(m.onTicks * k), offTicks: Math.round(m.offTicks / k) };
    case 'timeSlow':
      return {
        ...m,
        lastTicks: Math.round(m.lastTicks * k),
        mult: Math.min(0.8, m.mult + (k < 1 ? 0.15 : 0)),
      };
    case 'portals':
      return { ...m, everyTicks: Math.round(m.everyTicks / k) };
    case 'storm':
    case 'meteors':
      return { ...m, everyTicks: Math.round(m.everyTicks / k) };
  }
};

const LEGENDS: Record<string, Legend> = {
  // The iconic ones, with their own mechanic at full strength.
  kyogre: { family: 'tides', interval: 140, charge: 420, mechanic: TIDE }, // the water rises and the field shrinks
  groudon: { family: 'quakes', interval: 150, charge: 430, mechanic: CRACKS }, // drought: cracks in the floor
  mewtwo: { family: 'shots', interval: 120, charge: 360, open: 150, mechanic: BARRIER }, // a barrier that reflects the balls
  dialga: { family: 'quakes', interval: 160, charge: 440, mechanic: SLOW }, // slows time
  palkia: { family: 'tides', interval: 135, charge: 410, mechanic: PORTALS }, // opens portals
  // The rest: their own variant of a mechanic or of the pace.
  rayquaza: { family: 'tides', interval: 125, charge: 390, mechanic: variant(PORTALS, 1.25) },
  'giratina-altered': { family: 'haze', interval: 132, charge: 402, mechanic: variant(SLOW, 1.2) },
  arceus: { family: 'swarms', interval: 128, charge: 380, mechanic: variant(BARRIER, 0.8) },
  lugia: { family: 'tides', interval: 138, charge: 415, mechanic: variant(TIDE, 0.85) },
  suicune: { family: 'tides', interval: 142, charge: 425, mechanic: variant(TIDE, 0.7) },
  manaphy: { family: 'tides', interval: 146, charge: 432, mechanic: variant(TIDE, 0.55) },
  phione: { family: 'tides', interval: 148, charge: 436, mechanic: variant(TIDE, 0.45) },
  entei: { family: 'shots', interval: 133, charge: 405, mechanic: METEORS },
  heatran: { family: 'shots', interval: 136, charge: 412, mechanic: variant(METEORS, 1.2) },
  regirock: {
    family: 'quakes',
    interval: 170,
    charge: 470,
    open: 190,
    mechanic: variant(CRACKS, 0.85),
  },
  regigigas: {
    family: 'quakes',
    interval: 175,
    charge: 480,
    open: 200,
    mechanic: variant(CRACKS, 0.7),
  },
  regice: { family: 'haze', interval: 152, charge: 450, mechanic: variant(SLOW, 0.9) },
  registeel: { family: 'quakes', interval: 156, charge: 455, mechanic: variant(SLOW, 1.1) },
  darkrai: { family: 'haze', interval: 122, charge: 370, mechanic: variant(SLOW, 1.35) },
  mew: { family: 'shots', interval: 126, charge: 375, mechanic: variant(BARRIER, 0.7) },
  celebi: { family: 'swarms', interval: 129, charge: 382, mechanic: variant(BARRIER, 0.75) },
  jirachi: { family: 'shots', interval: 131, charge: 388, mechanic: variant(BARRIER, 0.85) },
  'deoxys-normal': {
    family: 'shots',
    interval: 118,
    charge: 355,
    mechanic: variant(BARRIER, 1.15),
  },
  cresselia: { family: 'haze', interval: 144, charge: 428, mechanic: variant(BARRIER, 0.9) },
  uxie: { family: 'shots', interval: 134, charge: 408, mechanic: variant(BARRIER, 1.05) },
  mesprit: { family: 'swarms', interval: 137, charge: 414, mechanic: variant(BARRIER, 0.95) },
  azelf: { family: 'shots', interval: 139, charge: 418, mechanic: variant(BARRIER, 1.1) },
  latias: { family: 'tides', interval: 141, charge: 422, mechanic: variant(BARRIER, 0.6) },
  latios: { family: 'tides', interval: 143, charge: 426, mechanic: variant(PORTALS, 0.85) },
  'shaymin-land': { family: 'swarms', interval: 147, charge: 434, mechanic: variant(PORTALS, 0.7) },
  // Birds and beasts of storm and fire: no mechanic, a faster fight with their own pace.
  articuno: { family: 'tides', interval: 127, charge: 385 },
  zapdos: { family: 'shots', interval: 112, charge: 335, open: 130, mechanic: STORM },
  moltres: { family: 'shots', interval: 124, charge: 372, mechanic: variant(METEORS, 1.1) },
  raikou: {
    family: 'shots',
    interval: 114,
    charge: 340,
    open: 135,
    mechanic: variant(STORM, 1.15),
  },
  'ho-oh': { family: 'shots', interval: 123, charge: 368, mechanic: variant(METEORS, 1.3) },
  virizion: { family: 'swarms', interval: 119, charge: 360 },
  genesect: { family: 'swarms', interval: 116, charge: 345 },
};

const ticksOf = (x: number): number => Math.round(x);

function legend(spec: Legend): BossPatternDef {
  const family = FAMILIES[spec.family];
  return table(
    family.normal,
    family.fury,
    family.strong,
    {
      interval: ticksOf(spec.interval * 1.5),
      coreEvery: spec.charge ?? 420,
      coreOpen: spec.open ?? 170,
    },
    spec.mechanic,
  );
}

const legendaries: Record<string, BossPatternDef> = {};
for (const [id, spec] of Object.entries(LEGENDS)) legendaries[id] = legend(spec);

/** The final bosses: every legendary that has a table. */
export const FINAL_BOSSES: readonly string[] = Object.keys(LEGENDS);

export const bossFight: BossFightDef = {
  // The fury starts at half health, with a message and no pause.
  rageAt: 0.5,
  // 4G-H (15th playtest): no guarded / exposed damage any more; a boss always takes what it is hit
  // with (it was 0.35 guarded, 1.7 exposed and 1.5 more for an Ultimate). The health of each boss
  // (`hpScale` in the config) was measured again for it.
  coreWarnTicks: 60,
  calmTicks: 150,
  maxHazards: 16,
  bySpecies: legendaries,
  byType,
  default: familyTables.swarms,
};
