import { describe, expect, it } from 'vitest';
import { GAME_TYPES } from '../../src/domain';
import { AttackNamer, attackKey, attackLabel } from '../../src/ui/attackNames';

describe('the first appearance of an attack is named (4G-F)', () => {
  it('names every verb and mechanic with how to dodge it', () => {
    for (const key of [
      'column',
      'comb',
      'sweep',
      'rain',
      'shot',
      'zone',
      'gust',
      'crack',
      'portal',
      'enemyShot',
      'tide',
      'barrier',
      'timeSlow',
    ]) {
      expect(attackLabel(key), key).toMatch(/^⚠ .+: .+/);
    }
    expect(attackLabel('nothing')).toBeNull();
  });

  it('the shot of each type has its own name (4G-G; every type since 4G-H)', () => {
    expect(attackKey('shot', true, 'electric')).toBe('enemyShot-electric');
    expect(attackLabel('enemyShot-electric')).toContain('Chispa');
    expect(attackLabel('enemyShot-fire')).toContain('Ascua');
    expect(attackLabel('enemyShot-water')).toContain('Burbuja');
    expect(attackLabel('enemyShot-grass')).toContain('Hoja');
    expect(attackLabel('enemyShot-rock')).toContain('Roca');
    expect(attackLabel('enemyShot-ghost')).toContain('Sombra');
    // Every type that shoots has its name (4G-H: all 18).
    for (const type of GAME_TYPES) {
      expect(attackLabel(attackKey('shot', true, type)), type).toMatch(/^⚠ .+: .+/);
      expect(attackKey('shot', true, type)).toBe(`enemyShot-${type}`);
    }
    // None given: the generic one. A boss keeps its verb, even with a type (4G-H).
    expect(attackKey('shot', true)).toBe('enemyShot');
    expect(attackKey('column', false)).toBe('column');
    expect(attackKey('column', false, 'fire')).toBe('column');
    expect(attackLabel('blast')).toBeNull();
  });

  it('says it once per run per attack, and again after a reset', () => {
    const namer = new AttackNamer();
    expect(namer.first('column')).toContain('Columna');
    expect(namer.first('column')).toBeNull();
    expect(namer.first('comb')).toContain('Peine');
    expect(namer.first('unknown')).toBeNull();
    namer.reset();
    expect(namer.first('column')).toContain('Columna');
  });
});
