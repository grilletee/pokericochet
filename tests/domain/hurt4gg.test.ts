import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  createRun,
  createSnapshot,
  type GameConfig,
  type Hazard,
  hashRun,
  type Run,
  startFight,
  tick,
  writeSnapshot,
} from '../../src/domain';
import { makeEnemy, quietConfig } from './fixtures';

/** 4G-G, block 2: every hit is told (one event) and followed by a blink of invulnerability. */

const found = gameConfig.bossFight;
if (found === undefined) throw new Error('no boss fight table');
const cfg: GameConfig = {
  ...quietConfig,
  bossFight: { ...found, maxHazards: 40 },
  player: { ...quietConfig.player, hitInvulnTicks: 50 },
};

function withBoss(): Run {
  const run = createRun(cfg, 3, 'bulbasaur');
  const boss = makeEnemy({ id: 9, species: 'blaziken', hp: 1e6, x: 240, y: 120, radius: 40 });
  run.enemies = [boss];
  run.boss.id = 9;
  run.boss.maxHp = 1e6;
  startFight(run, cfg, boss);
  run.boss.attackIn = 1e9;
  run.boss.coreIn = 1e9;
  run.boss.mechIn = 1e9;
  run.events.length = 0;
  return run;
}

/** A column on the player that strikes after `telegraph` more ticks. */
const underPlayer = (run: Run, telegraph: number): Hazard => ({
  kind: 'column',
  x: run.player.x,
  y: 0,
  link: 0,
  width: 60,
  telegraph,
  active: 4,
  damage: 2,
  speed: 0,
  struck: false,
});

describe('a hit is felt (4G-G)', () => {
  it('a strike hurts, tells it with one event and gives the blink', () => {
    const run = withBoss();
    run.hazards.push(underPlayer(run, 1));
    const before = run.player.hp;
    advanceBossFight(run, cfg);
    expect(run.player.hp).toBeLessThan(before);
    expect(run.player.invuln).toBe(cfg.player.hitInvulnTicks);
    const hurt = run.events.filter((e) => e.type === 'playerHurt');
    expect(hurt.length).toBe(1);
    expect(hurt[0]).toMatchObject({ source: 'boss', x: run.player.x });
  });

  it('while the blink lasts, a second attack does not hurt, and it is used up (not saved)', () => {
    const run = withBoss();
    run.hazards.push(underPlayer(run, 1));
    advanceBossFight(run, cfg);
    const hp = run.player.hp;
    const second = underPlayer(run, 1);
    run.hazards.push(second);
    advanceBossFight(run, cfg);
    expect(run.player.hp).toBe(hp);
    expect(second.struck).toBe(true);
    // Once the blink ends, standing where it fell hurts no more: the hit is gone.
    run.player.invuln = 0;
    for (let i = 0; i < 6; i++) advanceBossFight(run, cfg);
    expect(run.player.hp).toBe(hp);
  });

  it('after the blink, the next attack hurts again', () => {
    const run = withBoss();
    run.hazards.push(underPlayer(run, 1));
    advanceBossFight(run, cfg);
    const hp = run.player.hp;
    run.player.invuln = 0;
    run.hazards.push(underPlayer(run, 1));
    advanceBossFight(run, cfg);
    expect(run.player.hp).toBeLessThan(hp);
  });

  it('the blink counts down one per tick and is part of the hash and the snapshot', () => {
    const run = createRun(cfg, 3, 'bulbasaur');
    run.player.invuln = 5;
    const a = hashRun(run);
    run.player.invuln = 4;
    expect(hashRun(run)).not.toBe(a);
    run.player.invuln = 5;
    tick(run, { moveX: 0 }, cfg);
    expect(run.player.invuln).toBe(4);
    const snap = createSnapshot();
    writeSnapshot(run, snap);
    expect(snap.playerInvuln).toBe(4);
  });

  it('a leak at the line is told too, but gives and respects no blink', () => {
    const run = createRun(cfg, 3, 'bulbasaur');
    run.enemies = [makeEnemy({ id: 4, y: cfg.arena.defenseLineY - 0.5, threat: 3, speed: 5 })];
    run.player.invuln = 30; // a blink from a boss attack does not stop a leak
    const before = run.player.hp;
    const out = tick(run, { moveX: 0 }, cfg);
    expect(run.player.hp).toBeLessThan(before);
    expect(out.events.filter((e) => e.type === 'playerHurt')).toHaveLength(1);
    expect(out.events.find((e) => e.type === 'playerHurt')).toMatchObject({ source: 'leak' });
    expect(run.player.invuln).toBe(29);
  });

  it('the shipped invulnerability is short, under a second', () => {
    expect(gameConfig.player.hitInvulnTicks).toBeGreaterThanOrEqual(30);
    expect(gameConfig.player.hitInvulnTicks).toBeLessThanOrEqual(60);
  });
});
