import { describe, expect, it } from 'vitest';
import { GACHA_RULES } from '../../src/data';
import {
  bannerColors,
  bannerKindLabel,
  endsText,
  legendMeters,
  percentBp,
  pityLines,
  RARITY_COLORS,
  revealNote,
  rulesText,
  stars,
} from '../../src/ui';

/** 4G-J, block 1 (4X: weekly families, ★6): what the gacha screen says, from the draw's numbers. */
describe('the words of the gacha', () => {
  it('percentages in Spanish', () => {
    expect(percentBp(80)).toBe('0,8 %');
    expect(percentBp(5000)).toBe('50 %');
    expect(percentBp(800)).toBe('8 %');
    expect(percentBp(10_000)).toBe('100 %');
  });

  it('the pity counters, with the soft pity and the worst case of the featured one', () => {
    const calm = pityLines(
      {
        toFive: 80,
        toFour: 10,
        soft: false,
        nextFiveChance: 80,
        worstToFeatured: 160,
        sinceFive: 0,
      },
      true,
    );
    expect(calm).toEqual([
      '★5 seguro en 80 tiradas',
      '★4 o más seguro en 10 tiradas',
      'Destacado ★5 seguro en 160 tiradas como muy tarde',
    ]);
    const hot = pityLines(
      { toFive: 1, toFour: 1, soft: true, nextFiveChance: 10_000, sinceFive: 79 },
      true,
    );
    expect(hot[0]).toBe('★5 seguro en 1 tirada · ¡pity suave! 100 % ahora');
    expect(hot[2]).toBe('Cada ★5 tiene un 50 % de ser el destacado');
    // The standard banner has no featured line.
    const standard = pityLines(
      { toFive: 5, toFour: 3, soft: true, nextFiveChance: 5580, sinceFive: 75 },
      false,
    );
    expect(standard).toEqual([
      '★5 seguro en 5 tiradas · ¡pity suave! 56 % ahora',
      '★4 o más seguro en 3 tiradas',
    ]);
  });

  it('how it works says the numbers of the rules, the families, the keys and how candies come', () => {
    const text = rulesText(GACHA_RULES, true).join(' ');
    expect(text).toContain(`tirada ${GACHA_RULES.softFrom}`);
    expect(text).toContain(`la ${GACHA_RULES.hardAt} es un ★5 seguro`);
    expect(text).toContain(`Cada ${GACHA_RULES.fourEvery} tiradas`);
    expect(text).toContain('única forma de quedarte un Pokémon');
    expect(text).toContain('aunque ya sea otra semana');
    expect(text).toContain('llave');
    expect(text).toContain('caramelos');
    expect(text).toContain('Sin dinero real');
    // 4V: the payback of a lost 50/50 is told on a limited banner, and only there.
    expect(text).toContain('Si pierdes el 50/50');
    expect(rulesText(GACHA_RULES, false).join(' ')).not.toContain('50/50');
    expect(rulesText({ ...GACHA_RULES, lostHalfPaysBack: false }, true).join(' ')).not.toContain(
      'Si pierdes el 50/50',
    );
  });

  it("a lost 50/50 shows on the counter (4V; 4X: it is the family's)", () => {
    const owed = pityLines(
      {
        toFive: 70,
        toFour: 8,
        soft: false,
        nextFiveChance: 80,
        worstToFeatured: 70,
        sinceFive: 10,
        featuredOwed: true,
      },
      true,
    );
    expect(owed[2]).toBe('Perdiste el 50/50: tu próximo ★5 en un banner así es el destacado');
  });

  it('4X: the counters of the legendary banner: fragments to a key, keys to the legendary', () => {
    const [fragments, legend] = legendMeters({
      keys: 1,
      fragments: 2,
      perKey: 3,
      nextChance: 1000,
      toLegend: 6,
      hardAt: 6,
    });
    expect(fragments?.value).toBe('2');
    expect(fragments?.note).toBe('de 3 · 1 llave');
    expect(fragments?.hot).toBe(true);
    expect(legend?.value).toBe('6');
    expect(legend?.fill).toBe(0);
    expect(legend?.note).toContain('10 %');
    expect(fragments?.color).toBe(RARITY_COLORS[6]);
  });

  it('rarity colours, stars, the end of a banner and the note of a reveal', () => {
    expect(new Set(Object.values(RARITY_COLORS)).size).toBe(4);
    expect(stars(5)).toBe('★★★★★');
    expect(stars(6)).toBe('★★★★★★');
    expect(endsText(null)).toBe('Siempre disponible');
    expect(endsText(1)).toBe('Termina hoy');
    expect(endsText(4)).toBe('Termina en 4 días');
    expect(revealNote(true, 0)).toBe('¡NUEVO!');
    expect(revealNote(false, 8)).toBe('+8 caramelos');
    expect(bannerColors('pseudo', 'fire')[0]).toBe('#f08030');
    expect(bannerColors('legend', undefined)[0]).toBe(RARITY_COLORS[6]);
    expect(bannerColors('standard', undefined)).toHaveLength(2);
    expect(bannerKindLabel('pseudo')).toBe('Pseudolegendario de la semana');
    expect(bannerKindLabel('legend')).toContain('★6');
  });
});
