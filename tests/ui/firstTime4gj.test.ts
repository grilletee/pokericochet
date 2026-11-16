import { describe, expect, it } from 'vitest';
import { GACHA_RULES, gameConfig, POKEDEX_IDS, STARTER_LINES } from '../../src/data';
import { CANDIES_PER_BOSS, CANDIES_PER_RUN, REPEAT_CANDIES } from '../../src/meta';
import {
  candyLines,
  earnedCandiesLine,
  FIRST_TIME_PAGES,
  PROFESSOR_COLORS,
  PROFESSOR_PORTRAIT,
} from '../../src/ui';

/** 4G-J, block 3: the first time (the professor's tutorial) and how candies are explained. */
describe('the first time', () => {
  it("the professor's portrait is a clean 16 x 20 pixel map of her own colours", () => {
    expect(PROFESSOR_PORTRAIT).toHaveLength(20);
    for (const row of PROFESSOR_PORTRAIT) {
      expect(row).toHaveLength(16);
      for (const c of row) expect(c === '.' || PROFESSOR_COLORS[c] !== undefined, c).toBe(true);
    }
  });

  it('the tutorial says what the 17th playtest missed: yours for good, the collection, the gacha, registering, candies', () => {
    const text = FIRST_TIME_PAGES.join(' ');
    expect(text).toContain('Será tuyo para siempre');
    expect(text).toContain('colección');
    expect(text).toContain('Gacha');
    expect(text).toContain('registrar');
    expect(text).toContain('caramelos');
    expect(FIRST_TIME_PAGES.length).toBeGreaterThanOrEqual(4);
    expect(FIRST_TIME_PAGES.length).toBeLessThanOrEqual(8);
  });

  it('the first choice: a starter of each of the nine regions and Pikachu, all in the roster, in Pokédex order', () => {
    expect(STARTER_LINES).toHaveLength(28);
    for (const id of STARTER_LINES) expect(gameConfig.species[id], id).toBeDefined();
    const dex = STARTER_LINES.map((id) => POKEDEX_IDS[id] ?? 0);
    expect([...dex].sort((a, b) => a - b)).toEqual(dex);
    expect(dex.filter((d) => d > 900)).toHaveLength(3); // Paldea's three
  });
});

describe('candies, explained', () => {
  it('the collection says every way to earn them, with the numbers of the rules', () => {
    const lines = candyLines({
      perRun: CANDIES_PER_RUN,
      perBoss: CANDIES_PER_BOSS,
      repeat: GACHA_RULES.repeatCandies,
      register: REPEAT_CANDIES,
    }).join(' ');
    expect(lines).toContain(`gana ${CANDIES_PER_RUN} caramelos por partida`);
    expect(lines).toContain(`${CANDIES_PER_BOSS} más por cada jefe`);
    expect(lines).toContain(`★5 +${GACHA_RULES.repeatCandies[5]}`);
    expect(lines).toContain(`+${REPEAT_CANDIES}`);
    expect(lines).toContain('nivel permanente');
  });

  it('the results say what the starter earned', () => {
    expect(earnedCandiesLine('charmander', 6)).toBe('+6 caramelos de Charmander');
    expect(earnedCandiesLine('charmander', 0)).toBe('');
  });
});
