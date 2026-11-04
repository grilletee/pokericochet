import { beforeAll, describe, expect, it } from 'vitest';
import { gameConfig, MOVE_NAMES, POKEMON_NAMES } from '../../src/data';
import { statsOf } from '../../src/domain';
import {
  barPercent,
  guardChange,
  moveName,
  oneDecimal,
  percent,
  pokemonName,
  STAT_BAR_MAX,
  STAT_ROWS,
  setNames,
  statSummary,
} from '../../src/ui';

describe('names (ADR-036)', () => {
  beforeAll(() => setNames(POKEMON_NAMES, MOVE_NAMES));

  it('are the Spanish ones from the generated data, for every species and every move', () => {
    expect(pokemonName('charizard')).toBe('Charizard');
    expect(moveName('ember')).toBe('Ascuas');
    expect(moveName('fire-blast')).toBe('Llamarada');
    expect(moveName('aqua-tail')).toBe('Acua Cola');
    for (const id of Object.keys(gameConfig.species)) expect(pokemonName(id)).not.toBe('');
  });

  it('read a plain version of an id that is not known, so a gap never shows an empty label', () => {
    expect(pokemonName('missingno')).toBe('Missingno');
    expect(moveName('some-new-move')).toBe('Some new move');
  });

  it('use whatever the app hands over', () => {
    setNames({ x: 'Equis' }, { y: 'Ye' });
    expect(pokemonName('x')).toBe('Equis');
    expect(moveName('y')).toBe('Ye');
    setNames(POKEMON_NAMES, MOVE_NAMES);
  });
});

describe('stat bars (ADR-038)', () => {
  it('has the six stats of the games, each with what it does in the game', () => {
    expect(STAT_ROWS.map((row) => row.key)).toEqual([
      'hp',
      'attack',
      'defense',
      'specialAttack',
      'specialDefense',
      'speed',
    ]);
    const effects = Object.fromEntries(STAT_ROWS.map((row) => [row.key, row.effect]));
    expect(effects).toEqual({
      hp: 'guardia',
      attack: 'daño',
      defense: 'guardia',
      specialAttack: 'daño',
      specialDefense: 'guardia',
      speed: 'velocidad de bola',
    });
  });

  it('fills a bar in proportion up to the maximum and never overflows', () => {
    expect(barPercent(0)).toBe(0);
    expect(STAT_BAR_MAX).toBe(150);
    expect(barPercent(75)).toBe(50);
    expect(barPercent(30)).toBe(20);
    expect(barPercent(STAT_BAR_MAX)).toBe(100);
    expect(barPercent(255)).toBe(100); // a very high HP stat still fits
    expect(barPercent(-5)).toBe(0);
  });

  it('writes numbers with a decimal comma', () => {
    expect(oneDecimal(1.476)).toBe('1,48');
    expect(oneDecimal(8.2, 1)).toBe('8,2');
    expect(oneDecimal(2, 1)).toBe('2');
  });

  it('sums up what the stats do: the damage multiplier and the speed of the ball', () => {
    const text = statSummary(statsOf(gameConfig, 'charmander', 6));
    expect(text).toMatch(/^Daño ×1,\d\d · Bola \d,\d$/);
  });

  it('shows the guard of the team before and after a replacement, without an arrow if it does not change', () => {
    expect(percent(0.234)).toBe('23 %');
    expect(percent(0.236)).toBe('24 %'); // rounds, it does not cut
    expect(percent(0)).toBe('0 %');
    expect(guardChange(0.18, 0.23)).toBe('Guardia 18 % → 23 %');
    expect(guardChange(0.231, 0.234)).toBe('Guardia 23 %');
  });
});
