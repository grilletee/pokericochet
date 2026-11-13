import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  createRun,
  type GameConfig,
  type GameType,
  isDodgeable,
  MIN_GAP,
  nextFloat,
  type Run,
  startFight,
} from '../../src/domain';
import { makeEnemy, quietConfig } from './fixtures';

/**
 * 4G-G, block 1: "siempre un hueco". The player (the author, in the 14th playtest) died to a boss
 * that put an area attack in the only gap of another area attack. The property: whenever an attack
 * is placed, a player that moves at its own speed can get through everything on the field with no
 * damage. The oracle below does NOT use `isDodgeable`: it plays the hazards forward on a copy of the
 * run, for a dozen places to go to, and needs one of them to cost nothing.
 */

const found = gameConfig.bossFight;
if (found === undefined) throw new Error('no boss fight table');
const fight: NonNullable<GameConfig['bossFight']> = found;
const cfg = { ...quietConfig, bossFight: fight } as GameConfig;

/** A cheap copy of what matters for the hazards: the field, the player and the boss state. */
function branch(run: Run): Run {
  return {
    ...run,
    hazards: run.hazards.map((h) => ({ ...h })),
    // Strict: a blink that has just been given must not hide a hit that would land.
    player: { ...run.player, invuln: 0 },
    boss: { ...run.boss, attackIn: 1e9, coreIn: 1e9, mechIn: 1e9 },
    events: [],
  };
}

const EPOCH = 10;
/**
 * Is there a way to play the next ticks with no damage? A search over what a person does: every
 * EPOCH ticks go left, stand or go right at full speed. States are merged by place (24 px).
 * It touches the hazards through the real `advanceBossFight`, not through `isDodgeable`.
 */
function someWayThrough(run: Run): boolean {
  const start = branch(run);
  const hp = start.player.hp;
  let frontier: Run[] = [start];
  for (let epoch = 0; epoch < 60; epoch++) {
    if (frontier.every((r) => r.hazards.length === 0)) return true;
    const seen = new Map<number, Run>();
    for (const node of frontier) {
      for (const dir of [-1, 0, 1]) {
        const next = branch(node);
        next.hazards = node.hazards.map((h) => ({ ...h }));
        let alive = true;
        for (let i = 0; i < EPOCH && alive; i++) {
          next.player.x = Math.max(
            cfg.player.margin,
            Math.min(cfg.arena.width - cfg.player.margin, next.player.x + dir * cfg.player.speed),
          );
          advanceBossFight(next, cfg);
          if (next.player.hp < hp) alive = false;
        }
        if (!alive) continue;
        const key = (next.player.x / 24) | 0;
        if (!seen.has(key)) seen.set(key, next);
      }
    }
    if (seen.size === 0) return false;
    frontier = [...seen.values()];
  }
  return true;
}

interface Table {
  readonly species: string;
  readonly type: GameType;
}
function tables(): Table[] {
  const out: Table[] = [];
  for (const species of Object.keys(fight.bySpecies)) out.push({ species, type: 'normal' });
  for (const type of Object.keys(fight.byType))
    out.push({ species: `plain-${type}`, type: type as GameType });
  out.push({ species: 'plain-default', type: 'normal' });
  return out;
}

/** A fight of `ticks` ticks against `table` where the player wanders; checks every placement. */
function fightAndCheck(table: Table, seed: number, ticks: number, hpLeft: number): number {
  const run = createRun(cfg, seed, 'bulbasaur');
  const boss = makeEnemy({
    id: 9,
    species: table.species,
    type: table.type,
    hp: 1e6,
    x: 240,
    y: 120,
    radius: 40,
  });
  run.enemies = [boss];
  run.boss.id = 9;
  run.boss.maxHp = 1e6;
  startFight(run, cfg, boss);
  run.player.hp = 1e9; // damage does not end the test: the oracle looks at the future
  let goal = run.player.x;
  let placements = 0;
  for (let t = 0; t < ticks; t++) {
    if (t % 45 === 0) goal = cfg.player.margin + nextFloat(run.rng.loot) * (cfg.arena.width - 40);
    run.player.x += Math.max(-cfg.player.speed, Math.min(cfg.player.speed, goal - run.player.x));
    // The fury is part of the fight: halve the boss now and then.
    if (t === Math.floor(ticks / 2)) boss.hp = 0.4 * run.boss.maxHp;
    run.events.length = 0;
    advanceBossFight(run, cfg);
    if (run.events.some((e) => e.type === 'bossTelegraph')) {
      placements += 1;
      const ok = someWayThrough(run);
      if (!ok) {
        throw new Error(
          `no way through: ${table.species} seed ${seed} tick ${t} hp ${hpLeft} ` +
            JSON.stringify(run.hazards.map((h) => [h.kind, Math.round(h.x), h.width, h.telegraph])),
        );
      }
    }
  }
  return placements;
}

describe('there is always a way through (4G-G)', () => {
  it('every boss table of the game, with random walks of the player: thousands of placements', () => {
    let placements = 0;
    for (const table of tables()) {
      for (const seed of [1, 7, 42, 3481362438 % 100000]) {
        placements += fightAndCheck(table, seed, 2400, 0);
      }
    }
    expect(placements).toBeGreaterThan(1000);
  }, 120_000);

  it('the Blaziken of the 14th playtest (seed 3481362438, Bulbasaur, wave 3)', () => {
    const blaziken: Table = { species: 'blaziken', type: 'fire' };
    for (let k = 0; k < 6; k++) fightAndCheck(blaziken, 3481362438 + k, 4000, 0);
  });

  it('a column in the only gap of a comb is moved or dropped, never stacked on it', () => {
    const run = createRun(cfg, 1, 'bulbasaur');
    run.player.x = 240;
    // A comb whose single gap is slot 2 of 5 (x 192..288) already strikes soon.
    for (let i = 0; i < 5; i++) {
      if (i === 2) continue;
      run.hazards.push({
        kind: 'comb',
        x: (i + 0.5) * (cfg.arena.width / 5),
        y: 0,
        link: 0,
        width: cfg.arena.width / 5,
        telegraph: 70,
        active: 20,
        damage: 2,
        speed: 0,
        struck: false,
      });
    }
    expect(isDodgeable(run, cfg)).toBe(true);
    const column = {
      kind: 'column' as const,
      x: 240,
      y: 0,
      link: 0,
      width: 120,
      telegraph: 70,
      active: 20,
      damage: 2,
      speed: 0,
      struck: false,
    };
    // At the same moment the column fills the gap: nowhere to go.
    expect(isDodgeable(run, cfg, [column])).toBe(false);
    // One that leaves at least the body plus the margin free beside it (here: against the left
    // comb, 96 - 40 = 56 >= MIN_GAP) is fine.
    expect(MIN_GAP).toBeLessThanOrEqual(56);
    expect(isDodgeable(run, cfg, [{ ...column, x: 192 + 20, width: 40 }])).toBe(true);
    // Later, when the comb has struck and gone, the same column is fine.
    expect(isDodgeable(run, cfg, [{ ...column, telegraph: 70 + 60 }])).toBe(true);
  });

  it('a harmless zone, a gust or a portal never closes a gap', () => {
    const run = createRun(cfg, 1, 'bulbasaur');
    const base = { y: 0, link: 0, telegraph: 60, active: 60, speed: 0, struck: false };
    const wall = { ...base, kind: 'zone' as const, x: 240, width: 480, damage: 0 };
    expect(isDodgeable(run, cfg, [wall])).toBe(true);
    expect(isDodgeable(run, cfg, [{ ...wall, kind: 'column', damage: 2 }])).toBe(false);
  });

  it('a column that already struck does not block anything', () => {
    const run = createRun(cfg, 1, 'bulbasaur');
    const wall = {
      kind: 'column' as const,
      x: 240,
      y: 0,
      link: 0,
      width: 600,
      telegraph: 0,
      active: 30,
      damage: 2,
      speed: 0,
      struck: false,
    };
    expect(isDodgeable(run, cfg, [wall])).toBe(false);
    // Used up (it hurt, or the blink absorbed it): it is only a drawing now.
    expect(isDodgeable(run, cfg, [{ ...wall, struck: true }])).toBe(true);
  });

  it('it must be reachable in time: a gap on the other side of the field is not a gap', () => {
    const run = createRun(cfg, 1, 'bulbasaur');
    run.player.x = 30;
    const base = { y: 0, link: 0, active: 20, damage: 2, speed: 0, struck: false };
    // Everything but the far right is covered, and it strikes in 20 ticks: 100 px at speed 5.
    const near = { ...base, kind: 'column' as const, x: 200, width: 360, telegraph: 20 };
    expect(isDodgeable(run, cfg, [near])).toBe(false);
    expect(isDodgeable(run, cfg, [{ ...near, telegraph: 120 }])).toBe(true);
  });

  it('a new attack that would break it is delayed, and the field stays passable', () => {
    const run = createRun(cfg, 5, 'bulbasaur');
    const boss = makeEnemy({
      id: 9,
      species: 'blaziken',
      type: 'fire',
      hp: 1e6,
      x: 240,
      y: 120,
      radius: 40,
    });
    run.enemies = [boss];
    run.boss.id = 9;
    run.boss.maxHp = 1e6;
    startFight(run, cfg, boss);
    run.player.hp = 1e9;
    for (let t = 0; t < 6000; t++) {
      advanceBossFight(run, cfg);
      if (run.events.some((e) => e.type === 'bossTelegraph')) {
        expect(isDodgeable(run, cfg)).toBe(true);
      }
      run.events.length = 0;
    }
  });
});
