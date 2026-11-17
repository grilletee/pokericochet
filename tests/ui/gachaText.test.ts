import { describe, expect, it } from 'vitest';
import { GACHA_RULES } from '../../src/data';
import {
  bannerColors,
  endsText,
  percentBp,
  pityLines,
  RARITY_COLORS,
  revealNote,
  rulesText,
  stars,
} from '../../src/ui';

/** 4G-J, block 1: what the gacha screen says, from the same numbers the draw uses. */
describe('the words of the gacha', () => {
  it('percentages in Spanish', () => {
    expect(percentBp(80)).toBe('0,8 %');
    expect(percentBp(5000)).toBe('50 %');
    expect(percentBp(800)).toBe('8 %');
    expect(percentBp(10_000)).toBe('100 %');
  });

  it('the pity counters, with the soft pity and the featured guarantee', () => {
    const calm = pityLines(
      { toFive: 80, toFour: 10, soft: false, nextFiveChance: 80, toFeatured: 120, sinceFive: 0 },
      true,
    );
    expect(calm).toEqual([
      '★5 seguro en 80 tiradas',
      '★4 o más seguro en 10 tiradas',
      'Destacado ★5 seguro en 120 tiradas en este banner',
    ]);
    const hot = pityLines(
      { toFive: 1, toFour: 1, soft: true, nextFiveChance: 10_000, toFeatured: null, sinceFive: 79 },
      true,
    );
    expect(hot[0]).toBe('★5 seguro en 1 tirada · ¡pity suave! 100 % ahora');
    expect(hot[2]).toBe('Destacado ★5 de este banner: ya conseguido');
    // The standard banner has no featured line.
    const standard = pityLines(
      { toFive: 5, toFour: 3, soft: true, nextFiveChance: 5580, toFeatured: null, sinceFive: 75 },
      false,
    );
    expect(standard).toEqual([
      '★5 seguro en 5 tiradas · ¡pity suave! 56 % ahora',
      '★4 o más seguro en 3 tiradas',
    ]);
  });

  it('how it works says the numbers of the rules and how candies come', () => {
    const text = rulesText(GACHA_RULES, true).join(' ');
    expect(text).toContain(`tirada ${GACHA_RULES.softFrom}`);
    expect(text).toContain(`la ${GACHA_RULES.hardAt} es un ★5 seguro`);
    expect(text).toContain(`Cada ${GACHA_RULES.fourEvery} tiradas`);
    expect(text).toContain(`${GACHA_RULES.featuredAt} tiradas`);
    expect(text).toContain('caramelos');
    expect(text).toContain('Sin dinero real');
    expect(rulesText(GACHA_RULES, false).join(' ')).not.toContain('destacado;');
    // 4V: the payback of a lost 50/50 is told on a limited banner, and only there.
    expect(text).toContain('Si pierdes el 50/50');
    expect(rulesText(GACHA_RULES, false).join(' ')).not.toContain('50/50');
    expect(rulesText({ ...GACHA_RULES, lostHalfPaysBack: false }, true).join(' ')).not.toContain(
      'Si pierdes el 50/50',
    );
  });

  it('a lost 50/50 shows on the counter of its banner (4V)', () => {
    const owed = pityLines(
      {
        toFive: 70,
        toFour: 8,
        soft: false,
        nextFiveChance: 80,
        toFeatured: 40,
        sinceFive: 10,
        featuredOwed: true,
      },
      true,
    );
    expect(owed[2]).toBe('Perdiste el 50/50: tu próximo ★5 aquí es el destacado');
  });

  it('rarity colours, stars, the end of a banner and the note of a reveal', () => {
    expect(new Set(Object.values(RARITY_COLORS)).size).toBe(3);
    expect(stars(5)).toBe('★★★★★');
    expect(endsText(null)).toBe('Siempre disponible');
    expect(endsText(1)).toBe('Termina hoy');
    expect(endsText(4)).toBe('Termina en 4 días');
    expect(revealNote(true, 0)).toBe('¡NUEVO!');
    expect(revealNote(false, 8)).toBe('+8 caramelos');
    expect(bannerColors('type', undefined, 'fire')[0]).toBe('#f08030');
    expect(bannerColors('region', 1, undefined)).toHaveLength(2);
  });
});
