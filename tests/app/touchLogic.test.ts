import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/app/bestRun';
import { CONTROLS_KEY, loadScheme, saveScheme } from '../../src/app/settings';
import {
  commandForScheme,
  enemyAtTap,
  FLICK_SPEED,
  flickOf,
  PAD_GAIN,
  type PadInput,
  slingAim,
  TAP_MOVE,
  TAP_MS,
  ThumbPad,
} from '../../src/app/touchLogic';
import { gameConfig } from '../../src/data';
import { createRun } from '../../src/domain';
import { CONTROL_SCHEMES, defaultSchemeFor, isControlScheme, schemeTip } from '../../src/ui';
import { makeEnemy } from '../domain/fixtures';

/** 4G-G, part 2: what a thumb does, as numbers; and the settings of the schemes. */

const none: PadInput = { steerX: null, tap: null, release: null };
const run = () => createRun(gameConfig, 3, 'pikachu');

describe('the thumb pad moves the launcher by how far it DRAGS, not where it is', () => {
  it('the target is where the launcher was plus the drag times the gain; lifting stops it', () => {
    const pad = new ThumbPad();
    pad.down(300, 600, 0, 240);
    expect(pad.target()).toBe(240);
    pad.move(340, 600, 50);
    expect(pad.target()).toBe(240 + 40 * PAD_GAIN);
    pad.move(200, 610, 100);
    expect(pad.target()).toBe(240 - 100 * PAD_GAIN);
    expect(pad.active).toBe(true);
    pad.up(200, 610, 120);
    expect(pad.active).toBe(false);
  });

  it('a short touch that hardly moved is a tap; a long one or one that travelled is a release', () => {
    const tap = new ThumbPad();
    tap.down(100, 100, 0, 240);
    expect(tap.up(103, 101, TAP_MS - 1)).toMatchObject({ kind: 'tap' });
    const slow = new ThumbPad();
    slow.down(100, 100, 0, 240);
    expect(slow.up(100, 100, TAP_MS + 50)).toMatchObject({ kind: 'release', flick: null });
    const dragged = new ThumbPad();
    dragged.down(100, 100, 0, 240);
    dragged.move(100 + TAP_MOVE + 20, 100, 100);
    dragged.move(100, 100, 200); // back where it started: still not a tap
    expect(dragged.up(100, 100, 220).kind).toBe('release');
  });

  it('a fast movement at the release is a flick with its direction; a slow or still one is not', () => {
    const fast = [
      { x: 100, y: 600, t: 0 },
      { x: 130, y: 560, t: 40 },
      { x: 170, y: 500, t: 80 },
    ];
    const flick = flickOf(fast, 80);
    expect(flick).not.toBeNull();
    expect(flick?.dx).toBeGreaterThan(0);
    expect(flick?.dy).toBeLessThan(0);
    const slow = [
      { x: 100, y: 600, t: 0 },
      { x: 101, y: 599, t: 80 },
    ];
    expect(flickOf(slow, 80)).toBeNull();
    expect(flickOf([], 0)).toBeNull();
    // The speed that counts is per second: 20 px in 100 ms is under the threshold, 60 px is over.
    expect(FLICK_SPEED).toBeGreaterThan(200);
    expect(
      flickOf(
        [
          { x: 0, y: 0, t: 0 },
          { x: 0, y: -20, t: 100 },
        ],
        100,
      ),
    ).toBeNull();
    expect(
      flickOf(
        [
          { x: 0, y: 0, t: 0 },
          { x: 0, y: -60, t: 100 },
        ],
        100,
      ),
    ).not.toBeNull();
  });
});

describe('a tap on an enemy fixes it as the target', () => {
  it('picks the nearest body under the finger, with a little slack, ignoring the dead', () => {
    const enemies = [
      makeEnemy({ id: 1, x: 100, y: 200, radius: 20 }),
      makeEnemy({ id: 2, x: 160, y: 200, radius: 20 }),
      makeEnemy({ id: 3, x: 300, y: 300, radius: 20, hp: 0 }),
    ];
    expect(enemyAtTap(enemies, 105, 205)).toBe(1);
    expect(enemyAtTap(enemies, 152, 200)).toBe(2);
    expect(enemyAtTap(enemies, 300, 300)).toBe(0); // dead
    expect(enemyAtTap(enemies, 400, 100)).toBe(0); // nothing there
  });
});

describe('the command of each scheme', () => {
  it('moves towards the thumb target with a dead zone, and stands when there is no thumb', () => {
    const r = run();
    r.player.x = 240;
    expect(commandForScheme('smart', { ...none, steerX: 300 }, r, gameConfig, 8).moveX).toBe(1);
    expect(commandForScheme('smart', { ...none, steerX: 100 }, r, gameConfig, 8).moveX).toBe(-1);
    expect(commandForScheme('smart', { ...none, steerX: 244 }, r, gameConfig, 8).moveX).toBe(0);
    expect(commandForScheme('smart', none, r, gameConfig, 8).moveX).toBe(0);
  });

  it('A: smart aim, a tap on an enemy locks it, a tap on nothing frees it, no tap keeps it', () => {
    const r = run();
    r.enemies = [makeEnemy({ id: 7, x: 200, y: 300, radius: 20 })];
    const base = commandForScheme('smart', none, r, gameConfig, 8);
    expect(base).toMatchObject({ aimMode: 'smart', autoAim: false });
    expect(base.lock).toBeUndefined();
    expect(
      commandForScheme('smart', { ...none, tap: { x: 205, y: 305 } }, r, gameConfig, 8).lock,
    ).toBe(7);
    expect(
      commandForScheme('smart', { ...none, tap: { x: 20, y: 20 } }, r, gameConfig, 8).lock,
    ).toBe(0);
  });

  it('B: the motion mode, no aim at all', () => {
    const cmd = commandForScheme('motion', none, run(), gameConfig, 8);
    expect(cmd).toMatchObject({ aimMode: 'motion', autoAim: false });
    expect(cmd.aimX).toBeUndefined();
    expect(cmd.fire).toBeUndefined();
  });

  it('C: nothing leaves until the release; the release fires with the aim of the flick', () => {
    const r = run();
    r.player.x = 240;
    const held = commandForScheme('sling', none, r, gameConfig, 8);
    expect(held).toMatchObject({ aimMode: 'sling' });
    expect(held.fire).toBeUndefined();
    const flick = { dx: 80, dy: -120 };
    const fired = commandForScheme(
      'sling',
      { ...none, release: { kind: 'release', x: 0, y: 0, flick } },
      r,
      gameConfig,
      8,
    );
    expect(fired.fire).toBe(true);
    expect(fired.aimX ?? 0).toBeGreaterThan(240); // to the right of the launcher
    expect(fired.aimY ?? 9999).toBeLessThan(gameConfig.player.y); // and up
  });

  it('a quiet release goes at the smart target, or straight up when there is none', () => {
    const r = run();
    r.player.x = 240;
    expect(slingAim(r, gameConfig, null)).toEqual({ x: 240, y: gameConfig.player.y - 400 });
    r.enemies = [makeEnemy({ id: 5, x: 90, y: 250 })];
    expect(slingAim(r, gameConfig, null)).toEqual({ x: 90, y: 250 });
    // A flick sideways is lifted: its vertical part is always up, never flat or down.
    const sideways = slingAim(r, gameConfig, { dx: 200, dy: 0 });
    expect(sideways.y).toBeLessThan(gameConfig.player.y);
    const down = slingAim(r, gameConfig, { dx: 0, dy: 100 });
    expect(down.y).toBeLessThan(gameConfig.player.y);
  });

  it('the classic scheme is not a touch scheme: its command is the keyboard and pointer one', () => {
    expect(commandForScheme('classic', { ...none, steerX: 400 }, run(), gameConfig, 8)).toEqual({
      moveX: 1,
    });
  });
});

describe('the scheme is a setting, with a default that suits the device', () => {
  const memory = (): KeyValueStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        data.set(k, v);
      },
    };
  };

  it('a touch screen starts with the smart aim, anything else with the classic', () => {
    expect(defaultSchemeFor(true)).toBe('smart');
    expect(defaultSchemeFor(false)).toBe('classic');
    expect(loadScheme(null, true)).toBe('smart');
    expect(loadScheme(memory(), false)).toBe('classic');
  });

  it('remembers the choice, and a bad stored value falls back to the device default', () => {
    const store = memory();
    saveScheme(store, 'sling');
    expect(store.data.get(CONTROLS_KEY)).toBe('sling');
    expect(loadScheme(store, true)).toBe('sling');
    store.data.set(CONTROLS_KEY, 'nonsense');
    expect(loadScheme(store, true)).toBe('smart');
  });

  it('lists the four schemes, each with a name and a hint, and tips for the touch ones', () => {
    expect(CONTROL_SCHEMES.map((s) => s.id)).toEqual(['classic', 'smart', 'motion', 'sling']);
    for (const s of CONTROL_SCHEMES) {
      expect(s.name.length).toBeGreaterThan(3);
      expect(s.hint.length).toBeGreaterThan(20);
      expect(isControlScheme(s.id)).toBe(true);
    }
    expect(isControlScheme('x')).toBe(false);
    expect(schemeTip('classic')).toBeNull();
    for (const id of ['smart', 'motion', 'sling'] as const) expect(schemeTip(id)).toContain('.');
  });
});
