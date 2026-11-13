import { describe, expect, it } from 'vitest';
import { HIT_BLINK_GAP_MS, hitBlinkDue } from '../../src/ui/teamBar';

describe('4G-H: the portrait of the Pokémon whose ball hits blinks in the team bar', () => {
  it('blinks on the first hit, and again only once the gap has passed', () => {
    expect(hitBlinkDue(undefined, 0)).toBe(true);
    expect(hitBlinkDue(1000, 1000 + HIT_BLINK_GAP_MS - 1)).toBe(false);
    expect(hitBlinkDue(1000, 1000 + HIT_BLINK_GAP_MS)).toBe(true);
    // A busy fight blinks a few times per second, never a solid white.
    expect(HIT_BLINK_GAP_MS).toBeGreaterThanOrEqual(120);
    expect(HIT_BLINK_GAP_MS).toBeLessThanOrEqual(400);
  });
});
