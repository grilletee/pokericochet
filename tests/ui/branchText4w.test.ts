import { describe, expect, it } from 'vitest';
import { branchText } from '../../src/ui/screens';

/** 4W, block 7: a split line tells, in words, what it becomes and where. */
describe('the words of the branches', () => {
  it('each branch with the type of place that picks it, the line of always last', () => {
    const text = branchText([
      { form: 'vaporeon' },
      { form: 'flareon', type: 'fire' },
      { form: 'glaceon', type: 'ice' },
    ]);
    expect(text).toBe('Flareon (Fuego), Glaceon (Hielo); en otro lugar, Vaporeon');
  });

  it('without the line of always, only the branches', () => {
    expect(branchText([{ form: 'gallade', type: 'fighting' }])).toBe('Gallade (Lucha)');
  });
});
