import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { typeCode } from '../../src/domain';
import {
  digitsOf,
  FLASH_GAP_MS,
  FLASH_MS,
  mayFlash,
  NUMBER_BUSY,
  NUMBER_CAP,
  numberAlpha,
  numberLook,
  numberPop,
  numberRise,
  showsNumber,
} from '../../src/render/feelRules';
import { AMBIENT, SCENE_IDS, sceneFor } from '../../src/render/sceneIds';

/** 4V, block 1: every biome has its own painted scene, and the rules of the feel of a hit. */
describe('the scene of each biome', () => {
  const biomes = Object.values(gameConfig.themes ?? {});
  const sceneOf = (id: string): string => {
    const biome = biomes.find((b) => b.id === id);
    const [first, second] = biome?.types ?? [];
    return sceneFor(typeCode(first?.type ?? 'normal'), typeCode(second?.type ?? 'normal'));
  };

  it('the 14 biomes get 14 different scenes', () => {
    expect(biomes).toHaveLength(14);
    const scenes = biomes.map((b) => sceneOf(b.id));
    expect(new Set(scenes).size).toBe(14);
    expect([...scenes].sort()).toEqual([...SCENE_IDS].sort());
  });

  it('each biome is the place its name says', () => {
    expect(sceneOf('meadow')).toBe('meadow');
    expect(sceneOf('forest')).toBe('forest');
    expect(sceneOf('fairy-glade')).toBe('glade');
    expect(sceneOf('volcano')).toBe('volcano');
    expect(sceneOf('cave')).toBe('cave');
    expect(sceneOf('frozen-peak')).toBe('peak');
    expect(sceneOf('dojo')).toBe('dojo');
    expect(sceneOf('ruins')).toBe('ruins');
    expect(sceneOf('haunted-house')).toBe('haunted');
    expect(sceneOf('dragon-sky')).toBe('sky');
    // Two pairs share their main type and are told apart by the second one.
    expect(sceneOf('coast')).toBe('coast');
    expect(sceneOf('swamp')).toBe('swamp');
    expect(sceneOf('storm')).toBe('storm');
    expect(sceneOf('power-plant')).toBe('plant');
  });

  it('every type code has a scene, and an unknown one falls back to the meadow', () => {
    for (let main = 0; main < 18; main++) {
      expect(SCENE_IDS).toContain(sceneFor(main, main));
    }
    expect(sceneFor(99, 0)).toBe('meadow');
    expect(sceneFor(-1, -1)).toBe('meadow');
  });

  it('the air of every scene is few particles and leaves the edges darker than the middle', () => {
    for (const id of SCENE_IDS) {
      const air = AMBIENT[id];
      expect(air.count).toBeGreaterThan(0);
      expect(air.count).toBeLessThanOrEqual(30);
      expect(air.vignette).toBeGreaterThan(0.3);
      expect(air.vignette).toBeLessThan(0.85);
      // A film over the field is always faint: the game is read through it.
      if (air.mist !== null) expect(air.mist.alpha).toBeLessThanOrEqual(0.16);
    }
    // Only the storm has lightning.
    expect(SCENE_IDS.filter((id) => AMBIENT[id].flash)).toEqual(['storm']);
  });
});

describe('the feel of a hit', () => {
  it('a number shows unless it is nothing, the cap is reached or the field is busy', () => {
    expect(showsNumber(0, 12, 1)).toBe(true);
    expect(showsNumber(0, 0.4, 1)).toBe(false);
    expect(showsNumber(0, 0.5, 1)).toBe(true);
    expect(showsNumber(NUMBER_CAP, 50, 2)).toBe(false);
    expect(showsNumber(NUMBER_CAP - 1, 50, 2)).toBe(true);
    const busy = Math.ceil(NUMBER_CAP * NUMBER_BUSY);
    // Busy: only the hits that matter.
    expect(showsNumber(busy, 12, 1)).toBe(false);
    expect(showsNumber(busy, 12, 0.5)).toBe(false);
    expect(showsNumber(busy, 12, 1.5)).toBe(true);
    expect(showsNumber(busy - 1, 12, 1)).toBe(true);
  });

  it('gold and bigger when very effective, grey and smaller when weak', () => {
    const strong = numberLook(1.5);
    const plain = numberLook(1);
    const weak = numberLook(0.67);
    expect(strong.color).toBe(0xffd75a);
    expect(strong.scale).toBeGreaterThan(plain.scale);
    expect(weak.scale).toBeLessThan(plain.scale);
    expect(weak.color).not.toBe(plain.color);
    expect(plain.scale).toBe(1);
  });

  it('an enemy does not flash again until the gap has passed', () => {
    expect(mayFlash(1000, -1e9)).toBe(true);
    expect(mayFlash(1000 + FLASH_GAP_MS - 1, 1000)).toBe(false);
    expect(mayFlash(1000 + FLASH_GAP_MS, 1000)).toBe(true);
    // The flash is shorter than the gap: between two flashes the Pokémon is seen.
    expect(FLASH_MS).toBeLessThan(FLASH_GAP_MS);
  });

  it('the digits of a number, rounded and capped', () => {
    expect(digitsOf(7, 4)).toEqual([7]);
    expect(digitsOf(120, 4)).toEqual([1, 2, 0]);
    expect(digitsOf(12.6, 4)).toEqual([1, 3]);
    expect(digitsOf(123456, 4)).toEqual([9, 9, 9, 9]);
    expect(digitsOf(-3, 4)).toEqual([0]);
  });

  it('a number pops, rises without ever coming down and fades at the end', () => {
    expect(numberPop(0)).toBeGreaterThan(1.3);
    expect(numberPop(0.13)).toBe(1);
    expect(numberPop(0.5)).toBe(1);
    expect(numberRise(0)).toBe(0);
    expect(numberRise(1)).toBe(1);
    for (let t = 0; t < 1; t += 0.05) {
      expect(numberRise(t + 0.05)).toBeGreaterThanOrEqual(numberRise(t));
      expect(numberAlpha(t + 0.05)).toBeLessThanOrEqual(numberAlpha(t));
    }
    expect(numberAlpha(0)).toBe(1);
    expect(numberAlpha(0.69)).toBe(1);
    expect(numberAlpha(1)).toBe(0);
  });
});
