import { describe, expect, it } from 'vitest';
import { AttackNamer, attackLabel } from '../../src/ui/attackNames';

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
