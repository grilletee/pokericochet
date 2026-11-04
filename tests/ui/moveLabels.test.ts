import { beforeAll, describe, expect, it } from 'vitest';
import { MOVE_NAMES, POKEMON_NAMES } from '../../src/data';
import { labelPriority, labelText, MoveLabelPolicy, setNames } from '../../src/ui';

beforeAll(() => setNames(POKEMON_NAMES, MOVE_NAMES));

describe('priority of a move label (ADR-039)', () => {
  it('puts the starter first, then the moves of the last stage, then the rest', () => {
    expect(labelPriority(true, 1)).toBe(3);
    expect(labelPriority(true, 3)).toBe(3);
    expect(labelPriority(false, 3)).toBe(2);
    expect(labelPriority(false, 2)).toBe(1);
    expect(labelPriority(false, 1)).toBe(1);
  });

  it('writes the name in Spanish, with the count when casts were merged', () => {
    expect(labelText({ move: 'flamethrower', count: 1 })).toBe('Lanzallamas');
    expect(labelText({ move: 'flamethrower', count: 3 })).toBe('Lanzallamas ×3');
    expect(labelText({ move: 'unknown-move', count: 1 })).toBe('Unknown move');
  });
});

describe('the labels on screen never fill it with text (M11, ADR-039)', () => {
  it('shows at most three at once and drops the weakest newcomers when full', () => {
    const policy = new MoveLabelPolicy(3, 1000);
    expect(policy.offer(0, 'ember', 1, 10, 10, 0)).toBe('shown');
    expect(policy.offer(1, 'water-gun', 1, 20, 10, 10)).toBe('shown');
    expect(policy.offer(2, 'vine-whip', 1, 30, 10, 20)).toBe('shown');
    expect(policy.offer(3, 'thunder-shock', 1, 40, 10, 30)).toBe('dropped'); // same priority: no room
    expect(policy.visible(40)).toHaveLength(3);
    expect(policy.shown).toBe(3);
    expect(policy.dropped).toBe(1);
  });

  it('merges the same move of the same Pokémon into one label with a count', () => {
    const policy = new MoveLabelPolicy(3, 1000);
    expect(policy.offer(0, 'ember', 1, 10, 10, 0)).toBe('shown');
    expect(policy.offer(0, 'ember', 1, 50, 50, 300)).toBe('merged');
    expect(policy.offer(0, 'ember', 1, 60, 60, 600)).toBe('merged');
    const [label] = policy.visible(700);
    expect(label?.count).toBe(3);
    expect(labelText(label as NonNullable<typeof label>)).toBe('Ascuas ×3');
    expect(label?.x).toBe(10); // the label stays where it first appeared
    // The merge extends its life: it is still there 1000 ms after the last cast.
    expect(policy.visible(1599)).toHaveLength(1);
    expect(policy.visible(1601)).toHaveLength(0);
    expect(policy.shown).toBe(1);
    expect(policy.merged).toBe(2);
  });

  it('two Pokémon casting the same move are two labels (the key includes the Pokémon)', () => {
    const policy = new MoveLabelPolicy(3, 1000);
    expect(policy.offer(0, 'ember', 1, 0, 0, 0)).toBe('shown');
    expect(policy.offer(1, 'ember', 1, 0, 0, 0)).toBe('shown');
    expect(policy.visible(1)).toHaveLength(2);
  });

  it('the starter always shows: it takes the place of the weakest label when the screen is full', () => {
    const policy = new MoveLabelPolicy(3, 1000);
    policy.offer(1, 'a', 1, 0, 0, 0);
    policy.offer(2, 'b', 2, 0, 0, 10);
    policy.offer(3, 'c', 1, 0, 0, 20);
    expect(policy.offer(0, 'ember', 3, 0, 0, 30)).toBe('shown');
    const keys = policy.visible(40).map((label) => label.key);
    expect(keys).toContain('0:ember');
    expect(keys).toContain('2:b'); // the stronger label of stage 3 stays
    expect(keys).not.toContain('1:a'); // the oldest of the weakest went
    expect(keys).toHaveLength(3);
  });

  it('a label of the same priority never pushes out another one', () => {
    const policy = new MoveLabelPolicy(2, 1000);
    policy.offer(1, 'a', 2, 0, 0, 0);
    policy.offer(2, 'b', 2, 0, 0, 10);
    expect(policy.offer(3, 'c', 2, 0, 0, 20)).toBe('dropped');
    expect(policy.visible(30).map((l) => l.key)).toEqual(['1:a', '2:b']);
  });

  it('frees the place when a label expires, so the next one shows again', () => {
    const policy = new MoveLabelPolicy(1, 500);
    expect(policy.offer(1, 'a', 1, 0, 0, 0)).toBe('shown');
    expect(policy.offer(2, 'b', 1, 0, 0, 499)).toBe('dropped');
    expect(policy.offer(2, 'b', 1, 0, 0, 500)).toBe('shown'); // 'a' expires at exactly 500
    expect(policy.visible(500).map((l) => l.key)).toEqual(['2:b']);
  });

  it('counts what the player really sees: with 6 Pokémon casting often, the text stays bounded', () => {
    // 6 Pokémon cast every 2 s each, offset: 3 casts per second, a minute long.
    const policy = new MoveLabelPolicy(3, 900);
    let seen = 0;
    let maxVisible = 0;
    for (let casts = 0; casts < 180; casts++) {
      const now = casts * 333;
      const member = casts % 6;
      const fate = policy.offer(member, `move${member}`, member === 0 ? 3 : 1, 0, 0, now);
      if (fate === 'shown') seen += 1;
      maxVisible = Math.max(maxVisible, policy.visible(now).length);
    }
    expect(maxVisible).toBeLessThanOrEqual(3);
    // The starter (member 0) is never the one left out.
    expect(seen).toBeGreaterThan(60);
    expect(policy.shown + policy.merged + policy.dropped).toBe(180);
  });

  it('is deterministic: the same casts at the same times give the same labels', () => {
    const run = () => {
      const policy = new MoveLabelPolicy(3, 800);
      const fates: string[] = [];
      for (let i = 0; i < 40; i++) {
        fates.push(policy.offer(i % 5, `m${i % 3}`, 1 + (i % 3), 0, 0, i * 170));
      }
      return fates.join(',');
    };
    expect(run()).toBe(run());
  });
});
