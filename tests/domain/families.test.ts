import { describe, expect, it } from 'vitest';
import {
  applyHitEffects,
  cloneRun,
  type Effect,
  hashRun,
  leakDamage,
  tick,
} from '../../src/domain';
import { tickAilments } from '../../src/domain/effects';
import { flyingRun, makeBall, makeBody, makeEnemy, quietConfig } from './fixtures';

/** A run with one ball carrying `effects` and the given enemies, and the first of them as target. */
function setup(effects: Effect[], enemies = [makeEnemy({ type: 'normal' })], type = 'normal') {
  const ball = makeBall({ type: type as 'normal', effects });
  const run = flyingRun(ball, enemies, makeBody({ x: 0, y: 700 }));
  run.bodies = [];
  const target = enemies[0] as ReturnType<typeof makeEnemy>;
  const hit = (damage = 10, killed = false): void =>
    applyHitEffects(run, quietConfig, ball, target, damage, killed);
  return { run, ball, target, hit };
}

describe('dot family: poison and curse (ADR-047)', () => {
  it('poison adds a layer per hit up to five and ticks for the layers together', () => {
    const { run, target, hit } = setup([{ kind: 'poison', strength: 6 }]);
    for (let i = 0; i < 8; i++) hit();
    expect(target.poisonStacks).toBe(5);
    const before = target.hp;
    tickAilments(run, quietConfig);
    // 5 layers x 6 dps each / 60 per tick, at the neutral matchup (normal against normal).
    expect(before - target.hp).toBeCloseTo((5 * 6) / 60, 9);
  });

  it('poison runs out after its ticks and clears its layers', () => {
    const { run, target, hit } = setup([{ kind: 'poison', strength: 3 }]);
    hit();
    const ticks = quietConfig.effects.poisonTicks ?? 0;
    for (let i = 0; i < ticks; i++) tickAilments(run, quietConfig);
    expect(target.poisonTicks).toBe(0);
    expect(target.poisonStacks).toBe(0);
    const hp = target.hp;
    tickAilments(run, quietConfig);
    expect(target.hp).toBe(hp);
  });

  it('a curse lands all at once after its delay, carrying a few hits at most', () => {
    const { run, target, hit } = setup([{ kind: 'curse', strength: 1 }]);
    for (let i = 0; i < 6; i++) hit(10);
    expect(target.curseDamage).toBe(30); // capped at three hits of 10 x strength 1
    const delay = quietConfig.effects.curseTicks ?? 0;
    for (let i = 0; i < delay - 1; i++) tickAilments(run, quietConfig);
    expect(target.hp).toBe(1000);
    tickAilments(run, quietConfig);
    expect(target.hp).toBe(970);
    expect(target.curseDamage).toBe(0);
  });

  it('a curse is not slowed or stopped: it lands even on a frozen enemy', () => {
    const { run, target, hit } = setup([{ kind: 'curse', strength: 1 }]);
    hit(10);
    target.haltTicks = 1000;
    for (let i = 0; i < (quietConfig.effects.curseTicks ?? 0); i++) tickAilments(run, quietConfig);
    expect(target.hp).toBe(990);
  });
});

describe('blast family: quake and push (ADR-047)', () => {
  it('a quake climbs the column: it hits the enemies above in the same lane, not below or beside', () => {
    const target = makeEnemy({ id: 1, x: 240, y: 300 });
    const above = makeEnemy({ id: 2, x: 250, y: 100 });
    const beside = makeEnemy({ id: 3, x: 300, y: 100 });
    const below = makeEnemy({ id: 4, x: 240, y: 500 });
    const { hit } = setup(
      [{ kind: 'quake', strength: 0.5, radius: 28 }],
      [target, above, beside, below],
    );
    hit(10);
    expect(above.hp).toBeLessThan(1000);
    expect(beside.hp).toBe(1000);
    expect(below.hp).toBe(1000);
    expect(target.hp).toBe(1000); // the target takes the hit itself, not the wave
  });

  it('push sends the target back up, never past the top, and a boss does not move', () => {
    const target = makeEnemy({ id: 1, y: 100 });
    const { run, hit } = setup([{ kind: 'push', strength: 30 }], [target]);
    hit();
    expect(target.y).toBe(70);
    target.y = 10;
    hit();
    expect(target.y).toBe(-target.radius);
    const boss = makeEnemy({ id: 2, y: 100 });
    run.enemies = [boss];
    run.boss.id = 2;
    applyHitEffects(
      run,
      quietConfig,
      makeBall({ effects: [{ kind: 'push', strength: 30 }] }),
      boss,
      10,
    );
    expect(boss.y).toBe(100);
  });
});

describe('drain family: fairy guard (ADR-047)', () => {
  it('a hit starts the guard, which lowers a leak for a while and then ends', () => {
    const { run, hit } = setup([{ kind: 'guard', strength: 1 }]);
    expect(run.guardTicks).toBe(0);
    hit();
    expect(run.guardTicks).toBe(quietConfig.effects.guardTicks);
    const plain = leakDamage(quietConfig, run.team, 10);
    const guarded = leakDamage(quietConfig, run.team, 10, quietConfig.effects.guardBonus);
    expect(guarded).toBeLessThan(plain);
    expect(guarded).toBeGreaterThanOrEqual(1);
    // The guard never goes over three quarters, whatever is added.
    expect(leakDamage(quietConfig, run.team, 100, 5)).toBe(25);
  });

  it('is part of the run state: it is hashed and cloned', () => {
    const { run, hit } = setup([{ kind: 'guard', strength: 1 }]);
    const before = hashRun(run);
    hit();
    expect(hashRun(run)).not.toBe(before);
    expect(cloneRun(run).guardTicks).toBe(run.guardTicks);
  });
});

describe('control family: freeze, stun and mark (ADR-047)', () => {
  it('ice stops an enemy on every third hit, for a moment, and it moves again after', () => {
    const target = makeEnemy({ speed: 1, y: 100 });
    const { run, hit } = setup([{ kind: 'freeze', strength: 1 }], [target]);
    hit();
    hit();
    expect(target.haltTicks ?? 0).toBe(0);
    hit();
    expect(target.haltTicks).toBe(quietConfig.effects.freezeTicks);
    const y = target.y;
    tick(run, { moveX: 0 }, quietConfig);
    expect(target.y).toBe(y); // stopped
    run.enemies = [target];
    target.haltTicks = 0;
    tick(run, { moveX: 0 }, quietConfig);
    expect(target.y).toBeGreaterThan(y);
  });

  it('a stun cannot be chained: it is followed by an immunity twice as long', () => {
    const target = makeEnemy();
    const { run, hit } = setup([{ kind: 'stun', strength: 1 }], [target]);
    hit();
    const ticks = quietConfig.effects.stunTicks ?? 0;
    expect(target.haltTicks).toBe(ticks);
    target.haltTicks = 0; // the stop is over
    hit();
    expect(target.haltTicks).toBe(0); // immune
    for (let i = 0; i < 2 * ticks; i++) tickAilments(run, quietConfig);
    hit();
    expect(target.haltTicks).toBe(ticks);
  });

  it('a boss is not stopped by ice or by a stun', () => {
    const boss = makeEnemy({ id: 7 });
    const { run } = setup([{ kind: 'freeze', strength: 1 }], [boss]);
    run.boss.id = 7;
    for (const kind of ['freeze', 'stun'] as const) {
      const ball = makeBall({ effects: [{ kind, strength: 1 }] });
      for (let i = 0; i < 5; i++) applyHitEffects(run, quietConfig, ball, boss, 10);
    }
    expect(boss.haltTicks ?? 0).toBe(0);
  });

  it('a mark makes the enemy take more from every hit, up to a cap, and it wears off', () => {
    const target = makeEnemy();
    const { run, hit } = setup([{ kind: 'mark', strength: 0.2 }], [target]);
    for (let i = 0; i < 6; i++) hit(0);
    expect(target.markBonus).toBe(quietConfig.effects.markMax); // capped at +50 %
    const before = target.hp;
    // Hits that go through `damageEnemy` are multiplied by the mark.
    run.enemies = [target];
    tickAilments(run, quietConfig); // no poison: nothing happens to hp
    expect(target.hp).toBe(before);
    for (let i = 0; i < (quietConfig.effects.markTicks ?? 0); i++) tickAilments(run, quietConfig);
    expect(target.markBonus).toBe(0);
    expect(target.markTicks).toBe(0);
  });

  it('the new enemy state is hashed, so two runs that differ in it differ in hash', () => {
    const { run, target } = setup([{ kind: 'poison', strength: 1 }]);
    const base = hashRun(run);
    for (const field of [
      'poisonStacks',
      'poisonTicks',
      'poisonDps',
      'curseTicks',
      'curseDamage',
      'haltTicks',
      'chill',
      'markTicks',
      'markBonus',
    ] as const) {
      const copy = cloneRun(run);
      const clone = copy.enemies[0];
      if (clone === undefined) throw new Error('no enemy');
      clone[field] = 3;
      expect(hashRun(copy), field).not.toBe(base);
    }
    const copy = cloneRun(run);
    const second = copy.enemies[0];
    if (second === undefined) throw new Error('no enemy');
    second.type2 = 'bug';
    expect(hashRun(copy)).not.toBe(base);
    expect(target.type2).toBeUndefined();
  });
});
