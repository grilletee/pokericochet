import { describe, expect, it } from 'vitest';
import { bossLineTicks, createRun, createSnapshot, tick, writeSnapshot } from '../../src/domain';
import { LINE_ALARMS, LineAlarm, lineMessage, lineSeconds, lineUrgency } from '../../src/ui';
import { makeEnemy, quietConfig } from './fixtures';

/** 4G-I, block 3 (16th playtest: "no sé qué pasa si un jefe llega al final"). */
const cfg = quietConfig;
const line = cfg.arena.defenseLineY;

function withBoss(y: number, speed: number) {
  const run = createRun(cfg, 1, 'charmander');
  const boss = makeEnemy({ id: 9, hp: 1e9, x: 240, y, speed, radius: 40 });
  run.enemies = [boss];
  run.boss.id = 9;
  run.boss.maxHp = 1e9;
  return { run, boss };
}

describe('how long the boss needs to reach the defence line', () => {
  it('is the distance over its speed, and slowed bosses take longer', () => {
    const { run, boss } = withBoss(line - 120, 0.1);
    expect(bossLineTicks(run, cfg)).toBe(1200);
    boss.slowTicks = 10;
    boss.slow = 0.5;
    expect(bossLineTicks(run, cfg)).toBe(2400);
  });

  it('rounds up: a boss 10 px away at 3 px/tick gets there on the 4th tick, not the 3rd', () => {
    const { run } = withBoss(line - 10, 3);
    expect(bossLineTicks(run, cfg)).toBe(4);
  });

  it('is -1 without a live boss, or for a boss that does not come down', () => {
    const { run, boss } = withBoss(line - 120, 0);
    expect(bossLineTicks(run, cfg)).toBe(-1);
    boss.speed = 0.1;
    boss.hp = 0;
    expect(bossLineTicks(run, cfg)).toBe(-1);
    run.boss.id = 0;
    expect(bossLineTicks(run, cfg)).toBe(-1);
  });

  it('the count is in the snapshot, and it is what really happens: at 0 the run is lost', () => {
    const { run } = withBoss(line - 3, 1);
    const snap = createSnapshot();
    writeSnapshot(run, snap, undefined, cfg);
    expect(snap.bossLineTicks).toBe(3);
    for (let i = 0; i < 3; i++) tick(run, { moveX: 0 }, cfg);
    expect(run.phase).toBe('lost');
  });
});

describe('the warnings of the interface', () => {
  it('shows the distance from 40 s, red from 15 s, flashing from 5 s', () => {
    expect(lineUrgency(-1)).toBe('none');
    expect(lineUrgency(41 * 60)).toBe('none');
    expect(lineUrgency(40 * 60)).toBe('far');
    expect(lineUrgency(15 * 60)).toBe('near');
    expect(lineUrgency(5 * 60)).toBe('critical');
    expect(lineSeconds(61)).toBe(2);
    expect(lineSeconds(1)).toBe(1);
  });

  it('sounds at 30, 15 and 5 s once each per boss; the first of the run explains the rule', () => {
    expect([...LINE_ALARMS]).toEqual([30, 15, 5]);
    const alarm = new LineAlarm();
    expect(alarm.check(9, 31 * 60)).toBeNull();
    expect(alarm.check(9, 30 * 60)).toEqual({ seconds: 30, first: true });
    expect(alarm.check(9, 29 * 60)).toBeNull();
    // A jump (a frame that skipped) still sounds once, for the nearest crossed.
    expect(alarm.check(9, 4 * 60)).toEqual({ seconds: 5, first: false });
    expect(alarm.check(9, 60)).toBeNull();
    // A new boss: its own alarms, the rule is not explained again.
    expect(alarm.check(12, 14 * 60)).toEqual({ seconds: 15, first: false });
    alarm.reset();
    expect(alarm.check(12, 14 * 60)).toEqual({ seconds: 15, first: true });
    expect(lineMessage(15, true)).toContain('pierdes la partida');
    expect(lineMessage(5, false)).not.toContain('pierdes');
  });
});
