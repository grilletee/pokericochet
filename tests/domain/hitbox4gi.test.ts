import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  createRun,
  type GameConfig,
  type Hazard,
  isDodgeable,
  MIN_GAP,
  PLAYER_WIDTH,
  SAFE_MARGIN,
} from '../../src/domain';
import { quietConfig } from './fixtures';

/** 4G-I, block 1 (16th playtest: "si no te dan de lleno, no te dan"): the body is the hitbox. */
const fight = gameConfig.bossFight;
if (fight === undefined) throw new Error('no boss fight table');
const cfg: GameConfig = { ...quietConfig, bossFight: fight };

/** A shot of an enemy about to land at x (it falls the last pixels this tick). */
function shotAt(x: number): Hazard {
  return {
    kind: 'shot',
    x,
    y: cfg.player.y - 10,
    link: -5,
    width: 26,
    telegraph: 0,
    active: 0,
    damage: 2,
    speed: 7,
    struck: false,
  };
}

function hurtBy(offset: number): number {
  const run = createRun(cfg, 1, 'charmander');
  run.player.x = 200 + offset;
  run.hazards = [shotAt(200)];
  const hp = run.player.hp;
  advanceBossFight(run, cfg);
  return hp - run.player.hp;
}

describe('the body of the player is its hitbox (4G-I)', () => {
  it('is as wide as the launcher is drawn (16 art pixels x 2)', () => {
    expect(PLAYER_WIDTH).toBe(32);
  });

  it('a projectile that grazes the body hits; one that misses it by a pixel does not', () => {
    const reach = 13 + PLAYER_WIDTH / 2; // half the shot plus half the body
    expect(hurtBy(0)).toBeGreaterThan(0);
    expect(hurtBy(reach)).toBeGreaterThan(0);
    expect(hurtBy(-reach)).toBeGreaterThan(0);
    expect(hurtBy(reach + 1)).toBe(0);
    // Before 4G-I only the centre counted: a graze of 20 pixels did nothing.
    expect(hurtBy(20)).toBeGreaterThan(0);
  });

  it('the guarantee keeps a gap of the body plus a margin on each side', () => {
    expect(MIN_GAP).toBe(PLAYER_WIDTH + 2 * SAFE_MARGIN);
    const run = createRun(cfg, 1, 'charmander');
    run.player.x = 240;
    const wall = (x0: number, x1: number): Hazard => ({
      kind: 'column',
      x: (x0 + x1) / 2,
      y: 0,
      link: 0,
      width: x1 - x0,
      telegraph: 120,
      active: 20,
      damage: 2,
      speed: 0,
      struck: false,
    });
    // A gap a little wider than MIN_GAP in the middle is fine; a little narrower is not.
    const gap = (w: number): Hazard[] => [wall(0, 240 - w / 2), wall(240 + w / 2, 480)];
    expect(isDodgeable(run, cfg, gap(MIN_GAP + 4))).toBe(true);
    expect(isDodgeable(run, cfg, gap(MIN_GAP - 4))).toBe(false);
    // The old gap (36 + 16) is no longer enough.
    expect(isDodgeable(run, cfg, gap(52))).toBe(false);
  });
});
