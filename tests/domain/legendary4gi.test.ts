import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  bossLineTicks,
  cloneRun,
  createRun,
  type GameConfig,
  type GameEvent,
  hashRun,
  isDodgeable,
  LEGEND_LINK,
  legendMoveName,
  type Run,
  tick,
} from '../../src/domain';

/**
 * 4G-I, block 4 (16th playtest: "el jefe final se sigue sintiendo como otro jefe intermedio más"):
 * the legendary holds its arena, sways, and throws a named legendary move over the whole floor.
 */
const legendary = gameConfig.boss?.legendary;
if (legendary === undefined) throw new Error('no legendary table');
const config: GameConfig = {
  ...gameConfig,
  player: { ...gameConfig.player, maxHp: 1e9 },
  interludes: [],
  waves: gameConfig.waves.map((w) => ({ ...w, durationTicks: 20 })),
};

/** A run on the final boss, just placed. */
function atFinal(seed = 6): Run {
  const run = createRun(config, seed, 'charmander');
  run.player.hp = 1e9;
  for (let t = 0; t < 400 && !run.boss.spawned; t++) tick(run, { moveX: 0 }, config);
  run.enemies = run.enemies.filter((e) => e.id === run.boss.id);
  return run;
}

function fight(run: Run, ticks: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    run.player.hp = 1e9;
    tick(run, { moveX: 0 }, config);
    events.push(...run.events);
  }
  return events;
}

describe('the final legendary is another kind of fight', () => {
  it('it does not come down to the line: no countdown, and it never reaches it', () => {
    expect(config.boss?.speed).toBe(0);
    const run = atFinal();
    fight(run, 600);
    expect(bossLineTicks(run, config)).toBe(-1);
    const boss = run.enemies.find((e) => e.id === run.boss.id);
    expect(boss?.y ?? 999).toBeLessThan(250);
  });

  it('it sways from side to side over its arena, within its width', () => {
    const run = atFinal();
    const xs: number[] = [];
    for (let t = 0; t < legendary.swayTicks; t += 30) {
      fight(run, 30);
      xs.push(run.enemies.find((e) => e.id === run.boss.id)?.x ?? 0);
    }
    const centre = config.arena.width / 2;
    expect(Math.max(...xs)).toBeGreaterThan(centre + legendary.swayWidth * 0.8);
    expect(Math.min(...xs)).toBeLessThan(centre - legendary.swayWidth * 0.8);
    for (const x of xs)
      expect(Math.abs(x - centre)).toBeLessThanOrEqual(legendary.swayWidth + 1e-9);
  });

  it('it throws its legendary move with its name, over the whole floor but one free gap', () => {
    const run = atFinal();
    const events = fight(run, (config.bossFight?.calmTicks ?? 0) + legendary.moveEveryTicks + 200);
    const move = events.find((e) => e.type === 'legendMove');
    expect(move).toBeDefined();
    if (move?.type !== 'legendMove') return;
    const species = run.enemies.find((e) => e.id === run.boss.id)?.species ?? '';
    expect(move.name).toBe(legendMoveName(config, species, config.species[species]?.type ?? ''));
    expect(move.name.length).toBeGreaterThan(3);
    expect(move.ticks).toBeGreaterThanOrEqual(legendary.moveWarnTicks);
  });

  it('the move leaves exactly one slot free and is always fair (isDodgeable)', () => {
    for (const seed of [6, 7, 8, 9, 10]) {
      const run = atFinal(seed);
      run.boss.legendIn = 1;
      const before = run.hazards.length;
      advanceBossFight(run, config);
      const placed = run.hazards.length - before;
      if (placed === 0) continue; // waited for a fair moment
      expect(placed).toBe(legendary.moveSlots - 1);
      // Marked so its whole (longer) announcement is shown.
      for (const h of run.hazards.slice(before)) expect(h.link).toBe(LEGEND_LINK);
      expect(isDodgeable(run, config, [])).toBe(true);
    }
  });

  it('a move that finds no fair moment waits a second and tries again, it is never lost', () => {
    const run = atFinal();
    // A field so full that the whole move does not fit in (it goes in whole or not at all).
    const max = config.bossFight?.maxHazards ?? 12;
    const fill = max - (legendary.moveSlots - 1) + 1;
    for (let i = 0; i < fill; i++) {
      run.hazards.push({
        kind: 'column',
        x: 20 + i * 4,
        y: 0,
        link: 0,
        width: 40,
        telegraph: 300,
        active: 20,
        damage: 1,
        speed: 0,
        struck: false,
      });
    }
    run.boss.legendIn = 1;
    const before = run.hazards.length;
    advanceBossFight(run, config);
    expect(run.hazards.length).toBe(before);
    expect(run.boss.legendIn).toBeGreaterThan(0);
    expect(run.boss.legendIn).toBeLessThanOrEqual(60);
  });

  it('its fury starts with its legendary move', () => {
    const run = atFinal();
    fight(run, 200);
    const boss = run.enemies.find((e) => e.id === run.boss.id);
    if (boss === undefined) throw new Error('no boss');
    boss.hp = run.boss.maxHp * 0.49;
    const events = fight(run, (config.bossFight?.calmTicks ?? 0) + 120);
    const phase = events.findIndex((e) => e.type === 'bossPhase');
    const move = events.findIndex((e) => e.type === 'legendMove');
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(move).toBeGreaterThan(phase);
    const thrown = events[move];
    expect(thrown?.type === 'legendMove' && thrown.fury).toBe(true);
  });

  it('a boss between waves has none of it, and the clock is part of the hash', () => {
    expect(legendMoveName(config, 'mewtwo', 'psychic')).toBe('Onda Mental');
    expect(legendMoveName(config, 'entei', 'fire')).toBe('Llamarada');
    const run = atFinal();
    const a = cloneRun(run);
    const b = cloneRun(run);
    b.boss.legendIn += 1;
    expect(hashRun(a)).not.toBe(hashRun(b));
  });
});
