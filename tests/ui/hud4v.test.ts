import { describe, expect, it } from 'vitest';
import { healthSegments, hudLine, hudView, uiSoundFor } from '../../src/ui';

/** 4V, block 4: what the HUD of a run shows, and the sounds of the interface. */
describe('the HUD of a run', () => {
  const base = {
    hp: 7.4,
    maxHp: 10,
    level: 3,
    xp: 4.7,
    xpNext: 9,
    waveIndex: 2,
    waveCount: 7,
    boss: null,
    seed: 6,
  };

  it('says the same as the old line of text', () => {
    const view = hudView(base);
    expect(hudLine(view)).toBe('PV 7/10   Nv 3 (4/9 XP)   Oleada 3/7\nSemilla 6');
  });

  it('a pip per wave: done, the one in progress, the ones to come', () => {
    expect(hudView(base).waves).toEqual(['done', 'done', 'now', 'next', 'next', 'next', 'next']);
    // After the last wave: all done and the final boss.
    const end = hudView({ ...base, waveIndex: 7 });
    expect(end.waves.every((w) => w === 'done')).toBe(true);
    expect(end.stage).toBe('Jefe final');
  });

  it('a boss on the field replaces the wave and marks the fight', () => {
    const view = hudView({ ...base, boss: 'Jefe 1/3' });
    expect(view.stage).toBe('Jefe 1/3');
    expect(view.boss).toBe(true);
    expect(hudView(base).boss).toBe(false);
  });

  it('health in segments: one per point up to 20, never empty while alive', () => {
    expect(healthSegments(7, 10)).toEqual({ total: 10, lit: 7 });
    expect(healthSegments(0, 10)).toEqual({ total: 10, lit: 0 });
    expect(healthSegments(1, 100)).toEqual({ total: 20, lit: 1 });
    expect(healthSegments(50, 100)).toEqual({ total: 20, lit: 10 });
    expect(healthSegments(100, 100)).toEqual({ total: 20, lit: 20 });
  });

  it('never shows negative health or experience', () => {
    const view = hudView({ ...base, hp: -3, xp: -1 });
    expect(view.hp).toBe(0);
    expect(view.xp).toBe(0);
  });
});

describe('the sounds of the interface', () => {
  it('back for the buttons that go back, nothing for the draws, accept for the rest', () => {
    expect(uiSoundFor('back', false)).toBe('uiBack');
    expect(uiSoundFor('menu', false)).toBe('uiBack');
    expect(uiSoundFor('again', false)).toBe('uiOk');
    expect(uiSoundFor(undefined, false)).toBe('uiOk');
    expect(uiSoundFor(undefined, true)).toBeNull();
  });
});
