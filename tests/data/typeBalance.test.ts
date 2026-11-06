import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { biomeLines, effectiveness, GAME_TYPES, typesOfSpecies } from '../../src/domain';

/**
 * T1 and T3 of ADR-047: the balance of the types as a test of the data, not an opinion. What broke
 * in the eighth playtest ("Electric is broken: nothing slows it") must fail here if it happens
 * again, for example if a new biome gives one attack type a free ride.
 */
const biomes = Object.values(gameConfig.themes ?? {});
const roster = gameConfig.enemySpecies;

/** The form a line shows at a tier, as the game spawns it. */
function formAtTier(id: string, tier: number): string {
  if (tier === 1) return id;
  return gameConfig.lines?.[id]?.[1] ?? gameConfig.lines?.[id]?.[0] ?? id;
}

/** Mean effectiveness of an attack type against what a biome brings, weighted by the biome weights. */
function biomeScore(
  attack: (typeof GAME_TYPES)[number],
  biome: (typeof biomes)[number],
  tier: number,
) {
  let sum = 0;
  let count = 0;
  for (const id of biomeLines(gameConfig, roster, biome, tier)) {
    const species = gameConfig.species[formAtTier(id, tier)];
    if (species === undefined) continue;
    const types = typesOfSpecies(species);
    sum += effectiveness(gameConfig, attack, types[0] ?? species.type, types[1]);
    count += 1;
  }
  return count === 0 ? 1 : sum / count;
}

function scores(tier: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const attack of GAME_TYPES) {
    let total = 0;
    for (const biome of biomes) total += biomeScore(attack, biome, tier);
    out[attack] = total / biomes.length;
  }
  return out;
}

describe('T1: no attack type has a free ride over the biomes (ADR-047)', () => {
  for (const tier of [1, 3]) {
    it(`the mean effectiveness of every type is within 15 % of the global mean (form ${tier})`, () => {
      const byType = scores(tier);
      const mean = GAME_TYPES.reduce((total, t) => total + (byType[t] ?? 0), 0) / GAME_TYPES.length;
      for (const type of GAME_TYPES) {
        const deviation = (byType[type] ?? 0) / mean - 1;
        expect(
          Math.abs(deviation),
          `${type} ${(deviation * 100).toFixed(1)} %`,
        ).toBeLessThanOrEqual(0.15);
      }
    });
  }

  it('detects the hole of the eighth playtest: a world of Water and Flying enemies gives Electric a free ride', () => {
    const byType = scores(1);
    const mean = GAME_TYPES.reduce((total, t) => total + (byType[t] ?? 0), 0) / GAME_TYPES.length;
    const rigged = biomes.map((b) => ({
      ...b,
      types: [
        { type: 'water' as const, weight: 3 },
        { type: 'flying' as const, weight: 2 },
      ],
    }));
    let total = 0;
    for (const biome of rigged) total += biomeScore('electric', biome, 1);
    const riggedScore = total / rigged.length;
    expect(riggedScore / mean - 1).toBeGreaterThan(0.15);
  });
});

describe('T3: every attack type is held back in some biomes and strong in others', () => {
  it('is resisted (or nearly immune) in at least 2 biomes and super effective in at least 2', () => {
    for (const attack of GAME_TYPES) {
      let resisted = 0;
      let beats = 0;
      for (const biome of biomes) {
        const value = biomeScore(attack, biome, 1);
        if (value < 0.95) resisted += 1;
        if (value > 1.05) beats += 1;
      }
      expect(resisted, `${attack} resisted`).toBeGreaterThanOrEqual(2);
      // A type with no x2 cell in the chart (Normal) can never be strong: it is the "direct"
      // family, which makes up for it with base damage (typeDamage), and is exempt from this half.
      const hasStrongCell = GAME_TYPES.some((d) => gameConfig.typeChart[attack][d] === 2);
      if (hasStrongCell) expect(beats, `${attack} beats`).toBeGreaterThanOrEqual(2);
      else expect(beats, `${attack} (no x2 in the chart)`).toBe(0);
    }
  });
});
