import { describe, expect, it } from 'vitest';
import { isPhone, layoutConfig, resolveLayout, WIDE_ARENA } from '../../src/app/layout';
import { gameConfig } from '../../src/data';
import { createRun, hashRun, tick } from '../../src/domain';

/** 4G-J, block 4: the two layouts of a phone held sideways; the tablet and the desktop stay. */
describe('the layout of a phone held sideways', () => {
  it('a phone is a coarse pointer with a short side under 540; a tablet or a desktop is not', () => {
    expect(isPhone(true, 844, 390)).toBe(true);
    expect(isPhone(true, 390, 844)).toBe(true);
    expect(isPhone(true, 1180, 820)).toBe(false); // tablet
    expect(isPhone(false, 844, 390)).toBe(false); // a small desktop window
  });

  it('the link wins; then the stored choice on a phone, or A; nothing on a tablet or a desktop', () => {
    expect(resolveLayout('b', null, false)).toBe('b');
    expect(resolveLayout('a', 'b', true)).toBe('a');
    expect(resolveLayout(null, 'b', true)).toBe('b');
    expect(resolveLayout(null, null, true)).toBe('a');
    expect(resolveLayout(null, 'zzz', true)).toBe('a');
    expect(resolveLayout(null, 'b', false)).toBeNull();
    expect(resolveLayout('x', null, false)).toBeNull();
  });

  it('only B changes the game: a wider field; A and none leave the config as it is', () => {
    expect(layoutConfig(gameConfig, null)).toBe(gameConfig);
    expect(layoutConfig(gameConfig, 'a')).toBe(gameConfig);
    const wide = layoutConfig(gameConfig, 'b');
    expect(wide.arena.width).toBe(WIDE_ARENA);
    expect(wide.arena.height).toBe(gameConfig.arena.height);
    expect(gameConfig.arena.width).toBe(480); // the shipped config is not touched
  });

  it('a run on the wide field plays and stays deterministic, with the launcher inside it', () => {
    const wide = layoutConfig(gameConfig, 'b');
    const play = (): string => {
      const run = createRun(wide, 77, 'charmander');
      for (let t = 0; t < 6000 && run.phase !== 'lost' && run.phase !== 'won'; t++) {
        tick(run, { moveX: t % 400 < 200 ? 1 : -1, autoAim: true }, wide);
        expect(run.player.x).toBeGreaterThanOrEqual(0);
        expect(run.player.x).toBeLessThanOrEqual(WIDE_ARENA);
      }
      return hashRun(run);
    };
    expect(play()).toBe(play());
    // It is another game than the one on the field of 480.
    const narrow = createRun(gameConfig, 77, 'charmander');
    for (let t = 0; t < 6000 && narrow.phase !== 'lost'; t++) {
      tick(narrow, { moveX: t % 400 < 200 ? 1 : -1, autoAim: true }, gameConfig);
    }
    expect(hashRun(narrow)).not.toBe(play());
  });
});
