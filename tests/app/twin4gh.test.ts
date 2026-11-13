import { describe, expect, it } from 'vitest';
import {
  AIM_FLOOR,
  AIM_GAIN,
  aimDrag,
  commandForScheme,
  type PadInput,
  SlideTrack,
  twinMovePerPixel,
} from '../../src/app/touchLogic';
import { gameConfig } from '../../src/data';
import { createRun } from '../../src/domain';
import { asksToRotate, sidePanels } from '../../src/ui';
import { MIN_PANEL } from '../../src/ui/sideLayout';

/** 4G-H, block 4: the two thumbs of the touch screen in landscape. */

describe('the left thumb: the launcher follows the drag, 1:1, with no delay', () => {
  it('moves as much as the finger, from where the launcher was, wherever the finger lands', () => {
    const track = new SlideTrack();
    track.down(100, 240);
    track.move(150, 2, 20, 460);
    expect(track.target()).toBe(340); // 50 screen pixels x 2 arena pixels per screen pixel
    track.move(140, 2, 20, 460);
    expect(track.target()).toBe(320);
  });

  it('stops at the walls and answers at once when the finger turns back (no dead travel)', () => {
    const track = new SlideTrack();
    track.down(0, 400);
    track.move(500, 1, 20, 460); // far past the right wall
    expect(track.target()).toBe(460);
    track.move(490, 1, 20, 460); // ten pixels back: ten pixels back at once
    expect(track.target()).toBe(450);
  });

  it('a sweep of the whole side panel crosses the whole field (and never less than 1:1)', () => {
    const scale = 0.5;
    const fieldScreen = 480 * scale;
    // A panel as wide as the field: 1:1 on the screen.
    expect(twinMovePerPixel(scale, fieldScreen, fieldScreen)).toBeCloseTo(1 / scale, 9);
    // A narrower panel: the whole panel is the whole field.
    const narrow = twinMovePerPixel(scale, fieldScreen, 120);
    expect(narrow * 120).toBeCloseTo(480, 6);
    // A wider panel never makes it slower than the finger.
    expect(twinMovePerPixel(scale, fieldScreen, 600)).toBeCloseTo(1 / scale, 9);
  });
});

describe('the right thumb aims by dragging the aim point, like a mouse', () => {
  it('moves the aim with the drag (a little more than 1:1) and never below the launcher', () => {
    const at = aimDrag({ x: 240, y: 300 }, 10, -20, 0.5, { width: 480 }, 680);
    expect(at.x).toBeCloseTo(240 + (10 * AIM_GAIN) / 0.5, 9);
    expect(at.y).toBeCloseTo(300 - (20 * AIM_GAIN) / 0.5, 9);
    const low = aimDrag({ x: 240, y: 600 }, 0, 400, 0.5, { width: 480 }, 680);
    expect(low.y).toBe(680 - AIM_FLOOR);
    const out = aimDrag({ x: 470, y: 300 }, 400, 0, 0.5, { width: 480 }, 680);
    expect(out.x).toBe(480);
  });

  it('the command: the left thumb says where to be, the right one where to aim, both at once', () => {
    const run = createRun(gameConfig, 3, 'pikachu');
    const pad: PadInput = { steerX: 333, aim: { x: 100, y: 200 }, tap: null, release: null };
    expect(commandForScheme('twin', pad, run, gameConfig, 4)).toEqual({
      moveX: 0,
      moveTo: 333,
      autoAim: false,
      aimMode: 'manual',
      aimX: 100,
      aimY: 200,
    });
    // No thumb down: the launcher stays, the aim stays.
    const none: PadInput = { steerX: null, aim: null, tap: null, release: null };
    expect(commandForScheme('twin', none, run, gameConfig, 4)).toEqual({
      moveX: 0,
      autoAim: false,
      aimMode: 'manual',
    });
  });
});

describe('the side panels: the HUD and the team never over the field', () => {
  it('a landscape screen has a panel on each side of the field', () => {
    // A phone of 844 x 390 with the field of 480 x 760 drawn at 390/760.
    const scale = 390 / 760;
    const fieldW = 480 * scale;
    const fieldX = (844 - fieldW) / 2;
    const panels = sidePanels(844, 390, fieldX, fieldW);
    expect(panels).not.toBeNull();
    expect(panels?.left).toEqual({ x: 0, w: fieldX });
    expect(panels?.right.x).toBeCloseTo(fieldX + fieldW, 9);
    expect(panels?.right.w).toBeCloseTo(844 - fieldX - fieldW, 9);
    expect(panels?.height).toBe(390);
  });

  it('upright, or with no room at a side, there is no side layout', () => {
    expect(sidePanels(390, 844, 0, 390)).toBeNull();
    // Upright even with room at the sides (a tablet held up): the field is the whole width.
    expect(sidePanels(500, 900, 120, 260)).toBeNull();
    expect(sidePanels(600, 500, MIN_PANEL - 1, 400)).toBeNull();
  });

  it('a touch screen held upright asks to be turned; a computer never does', () => {
    expect(asksToRotate(true, 390, 844)).toBe(true);
    expect(asksToRotate(true, 844, 390)).toBe(false);
    expect(asksToRotate(false, 390, 844)).toBe(false);
  });
});
