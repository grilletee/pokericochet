import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  ballSpeed,
  bulkOf,
  createBall,
  createRun,
  formOfMember,
  formPower,
  guardAfterReplace,
  hitDamage,
  leakDamage,
  type Member,
  mapStat,
  type SpeciesDef,
  stageBoost,
  statsOf,
  teamGuard,
  tick,
} from '../../src/domain';
import { makeEnemy, quietConfig, withConfig } from './fixtures';

/** A config where the mapping is easy to read: power 0..200 -> x0..x2, guard 0..100 -> 0..0.4. */
const stat = (hp: number, atk: number, spa: number, def: number, spd: number, speed: number) => ({
  hp,
  attack: atk,
  defense: def,
  specialAttack: spa,
  specialDefense: spd,
  speed,
});
const species = (id: string, baseStats: SpeciesDef['baseStats']): SpeciesDef => ({
  id,
  type: 'fire',
  baseStats,
});
const cfg = withConfig({
  species: {
    ...quietConfig.species,
    physical: species('physical', stat(50, 100, 40, 50, 50, 60)),
    special: species('special', stat(50, 40, 100, 50, 50, 60)),
    weak: species('weak', stat(50, 50, 50, 50, 50, 60)),
    tank: species('tank', stat(100, 50, 50, 100, 100, 60)),
    soft: species('soft', stat(25, 50, 50, 25, 25, 60)),
    slow: species('slow', stat(50, 50, 50, 50, 50, 20)),
    fast: species('fast', stat(50, 50, 50, 50, 50, 130)),
  },
  stats: {
    ...quietConfig.stats,
    powerRef: 100,
    powerStatMin: 0,
    powerStatMax: 200,
    powerMultMin: 0,
    powerMultMax: 2,
    guardStatMin: 0,
    guardStatMax: 100,
    guardMax: 0.4,
  },
});

const member = (species: string, level = 1): Member => ({
  species,
  type: 'fire',
  level,
  starter: false,
  damageUps: 0,
  cadenceUps: 0,
  charge: 0,
});

describe('damage from the real stats of the form (ADR-038)', () => {
  it('uses the larger of Attack and Special Attack', () => {
    const physical = hitDamage(cfg, createBall(cfg, 'physical', 1), 'electric');
    const special = hitDamage(cfg, createBall(cfg, 'special', 1), 'electric');
    expect(special).toBeCloseTo(physical, 12); // 100 either way
    // powerRef / divisor x (100 / 200 x 2) = 10 x 1 = 10, typeDamage fire 1, neutral type
    expect(physical).toBeCloseTo(10, 12);
    expect(hitDamage(cfg, createBall(cfg, 'weak', 1), 'electric')).toBeCloseTo(5, 12);
  });

  it('compresses the range: the real mapping gives x0.75 to x1.75 (the config of the game)', () => {
    const power = (id: string) => formPower(gameConfig, gameConfig.species[id] as SpeciesDef);
    expect(power('charmander')).toBeCloseTo(0.75 + 20 / 95, 12); // max(52, 60) = 60
    expect(power('charizard')).toBeCloseTo(0.75 + 69 / 95, 12); // special attack 109 beats attack 84
    expect(power('exeggutor')).toBeCloseTo(0.75 + 85 / 95, 12);
    expect(power('charizard') / power('charmander')).toBeGreaterThan(1.4);
    // Out of range stats clamp, so no species is unplayable or unbeatable.
    expect(mapStat(10, 40, 135, 0.75, 1.75)).toBe(0.75);
    expect(mapStat(300, 40, 135, 0.75, 1.75)).toBe(1.75);
  });

  it('a ball hits with the stats of the form of its stage, not of its base (Charizard is not Charmander)', () => {
    const base = createBall(gameConfig, 'charmander', 1, 0, 1);
    const evolved = createBall(gameConfig, 'charmander', 1, 0, 6); // stage 3: Charizard
    const sameLevelEvolved = { ...evolved, level: 1 };
    const ratio =
      hitDamage(gameConfig, sameLevelEvolved, 'electric') / hitDamage(gameConfig, base, 'electric');
    expect(ratio).toBeCloseTo(
      formPower(gameConfig, gameConfig.species.charizard as SpeciesDef) /
        formPower(gameConfig, gameConfig.species.charmander as SpeciesDef),
      12,
    );
    expect(ratio).toBeGreaterThan(1.4);
  });

  it('a stage makes up what the form does not give of the minimum growth (ADR-037)', () => {
    const power = (id: string) => formPower(gameConfig, gameConfig.species[id] as SpeciesDef);
    const [, two, three] = gameConfig.team.stageGrowth;
    // Stage 1 never has a boost.
    expect(stageBoost(gameConfig, 'exeggcute', 1)).toBe(1);
    // Exeggcute evolves into a much stronger Exeggutor: its stats already give more than x1.2, so
    // stage 2 adds nothing; the minimum for stage 3 is x1.45 and the form alone gives less than that.
    const formGrowth = power('exeggutor') / power('exeggcute');
    expect(formGrowth).toBeGreaterThan(two as number);
    expect(stageBoost(gameConfig, 'exeggcute', 2)).toBe(1);
    expect(stageBoost(gameConfig, 'exeggcute', 3)).toBeCloseTo(
      Math.max(1, (three as number) / formGrowth),
      12,
    );
    // Together with the stats of the form, every line reaches at least the minimum growth.
    for (const base of Object.keys(gameConfig.lines ?? {})) {
      for (const stage of [2, 3]) {
        const form =
          gameConfig.lines?.[base]?.[
            Math.min(stage - 2, (gameConfig.lines[base]?.length ?? 1) - 1)
          ] ?? base;
        const total = (power(form) / power(base)) * stageBoost(gameConfig, base, stage);
        expect(total, `${base} stage ${stage}`).toBeGreaterThanOrEqual(
          (gameConfig.team.stageGrowth[stage - 1] as number) - 1e-9,
        );
      }
    }
  });

  it('a line that does not change form gets the whole growth: awakening, then maximum power', () => {
    const none = withConfig({
      species: quietConfig.species,
      team: { ...quietConfig.team, stageGrowth: [1, 1.2, 1.5] },
    });
    // No line at all: the form never changes, so the boost is exactly the minimum growth.
    expect(stageBoost(none, 'charmander', 2)).toBeCloseTo(1.2, 12);
    expect(stageBoost(none, 'charmander', 3)).toBeCloseTo(1.5, 12);
    const level1 = createBall(none, 'charmander', 1, 0, 1);
    const stage2 = { ...createBall(none, 'charmander', 1, 0, 3), level: 1 };
    const stage3 = { ...createBall(none, 'charmander', 1, 0, 6), level: 1 };
    const damage = (ball: typeof level1) => hitDamage(none, ball, 'electric');
    expect(damage(stage2) / damage(level1)).toBeCloseTo(1.2, 12);
    expect(damage(stage3) / damage(level1)).toBeCloseTo(1.5, 12);
  });

  it('stage 1 never has a boost, whatever the first entry of the growth table says', () => {
    const odd = withConfig({
      species: quietConfig.species,
      team: { ...quietConfig.team, stageGrowth: [1.5, 1.5, 1.5] },
    });
    expect(stageBoost(odd, 'charmander', 1)).toBe(1);
    expect(stageBoost(odd, 'charmander', 2)).toBeCloseTo(1.5, 12);
  });

  it('never lowers the damage: a form stronger than the minimum keeps all of it', () => {
    const strong = withConfig({
      species: quietConfig.species,
      team: { ...quietConfig.team, stageGrowth: [1, 0.5, 0.5] },
    });
    expect(stageBoost(strong, 'charmander', 2)).toBe(1);
    expect(stageBoost(strong, 'charmander', 3)).toBe(1);
  });
});

describe('speed of the ball from the form, with a cap (ADR-038)', () => {
  const capped = (cap: number) => withConfig({ ...cfg, ball: { ...cfg.ball, speedCap: cap } });

  it('maps the Speed of the form and never goes above the cap', () => {
    const c = capped(7.5);
    const speed = (id: string) => ballSpeed(c, createBall(c, id, 1));
    expect(speed('slow')).toBeCloseTo(
      mapStat(20, c.stats.speedStatMin, c.stats.speedStatMax, c.ball.speedMin, c.ball.speedMax),
      12,
    );
    expect(speed('slow')).toBeCloseTo(c.ball.speedMin, 12);
    expect(speed('fast')).toBe(7.5); // 130 would be speedMax 9: the cap wins
    expect(speed('weak')).toBeLessThanOrEqual(7.5);
    expect(ballSpeed(capped(99), createBall(capped(99), 'fast', 1))).toBeCloseTo(
      c.ball.speedMax,
      12,
    );
  });

  it('uses the Speed of the form: Charizard is faster than Charmander', () => {
    const base = ballSpeed(gameConfig, createBall(gameConfig, 'charmander', 1, 0, 1));
    const evolved = ballSpeed(gameConfig, createBall(gameConfig, 'charmander', 1, 0, 6));
    expect(evolved).toBeGreaterThan(base);
    expect(evolved).toBeLessThanOrEqual(gameConfig.ball.speedCap);
    expect(gameConfig.ball.speedCap).toBeLessThanOrEqual(gameConfig.ball.speedMax);
  });

  it('launches balls at that speed', () => {
    const c = capped(7.5);
    const run = createRun(c, 1, 'fast');
    run.player.x = 240;
    run.autoAim = false;
    tick(run, { moveX: 0, aimX: 240, aimY: 100 }, c);
    const body = run.bodies[0];
    expect(Math.sqrt((body?.vx ?? 0) ** 2 + (body?.vy ?? 0) ** 2)).toBeCloseTo(7.5, 6);
  });
});

describe('guard of the team (ADR-038)', () => {
  it('is the mean bulk of the team mapped to 0..guardMax, nothing for an empty team', () => {
    expect(bulkOf(cfg.species.tank as SpeciesDef)).toBe(100);
    expect(teamGuard(cfg, [])).toBe(0);
    expect(teamGuard(cfg, [member('tank')])).toBeCloseTo(0.4, 12);
    expect(teamGuard(cfg, [member('soft')])).toBeCloseTo(0.1, 12); // bulk 25
    expect(teamGuard(cfg, [member('tank'), member('soft')])).toBeCloseTo(0.25, 12); // mean 62.5
    expect(teamGuard(cfg, [member('tank'), member('tank'), member('tank')])).toBeCloseTo(0.4, 12);
  });

  it('follows the form the Pokémon shows, so evolving raises it', () => {
    const c = withConfig({ ...gameConfig, species: gameConfig.species });
    const young = teamGuard(c, [member('charmander', 1)]);
    const grown = teamGuard(c, [member('charmander', 6)]);
    expect(formOfMember(c, member('charmander', 6))).toBe('charizard');
    expect(grown).toBeGreaterThan(young);
    expect(grown).toBeLessThanOrEqual(c.stats.guardMax);
    expect(young).toBeGreaterThanOrEqual(0);
  });

  it('cuts a leak in whole points, never below 1 and never touching a leak of 1', () => {
    const tank = [member('tank')]; // guard 0.4
    expect([0, 1, 3, 5].map((threat) => leakDamage(cfg, tank, threat))).toEqual([0, 1, 2, 3]);
    const soft = [member('soft')]; // guard 0.1: 3 -> 3 (2.7 rounds up), 5 -> 5 (4.5 rounds up)
    expect([1, 3, 5].map((threat) => leakDamage(cfg, soft, threat))).toEqual([1, 3, 5]);
    expect(leakDamage(cfg, [], 5)).toBe(5);
    // The thresholds of ADR-038: a leak of 5 drops to 4 above guard 0.1 and to 3 above 0.3.
    const guardMax = (g: number) => withConfig({ ...cfg, stats: { ...cfg.stats, guardMax: g } });
    expect(leakDamage(guardMax(0.11), tank, 5)).toBe(4);
    expect(leakDamage(guardMax(0.31), tank, 5)).toBe(3);
    expect(leakDamage(guardMax(0.17), tank, 3)).toBe(2);
    expect(leakDamage(guardMax(0.16), tank, 3)).toBe(3);
  });

  it('a leak always costs at least 1 point, even with a very high guard', () => {
    const strong = withConfig({ ...cfg, stats: { ...cfg.stats, guardMax: 0.6 } });
    // threat 1, guard 0.6: 1 x 0.4 + 0.5 = 0.9 rounds down to 0, but a leak is never free.
    expect(leakDamage(strong, [member('tank')], 1)).toBe(1);
    expect(leakDamage(strong, [member('tank')], 5)).toBe(2);
  });

  it('costs the player exactly that when an enemy leaks, and the boss still ends the run', () => {
    const run = createRun(cfg, 1, 'tank');
    run.enemies = [makeEnemy({ y: cfg.arena.defenseLineY - 1, speed: 5, threat: 5 })];
    const before = run.player.hp;
    const events = tick(run, { moveX: 0, autoAim: true }, cfg).events;
    expect(events.find((e) => e.type === 'leak')).toMatchObject({ damage: 3 });
    expect(run.player.hp).toBe(before - 3);
  });

  it('is the same for the same team: it creates no state (hash and clone untouched)', () => {
    const a = createRun(cfg, 1, 'tank');
    const b = createRun(cfg, 1, 'tank');
    teamGuard(cfg, a.team);
    leakDamage(cfg, a.team, 5);
    expect(JSON.stringify(a.team)).toBe(JSON.stringify(b.team));
  });
});

describe('what the player sees of a Pokémon (statsOf, guardAfterReplace)', () => {
  it('gives the form, its real stats, the stat that decides the damage and what they do', () => {
    const view = statsOf(gameConfig, 'charmander', 6);
    expect(view.form).toBe('charizard');
    expect(view.stage).toBe(3);
    expect(view.stats.specialAttack).toBe(109);
    expect(view.powerStat).toBe('specialAttack');
    expect(view.damage).toBeCloseTo(
      formPower(gameConfig, gameConfig.species.charizard as SpeciesDef),
      12,
    );
    expect(view.bulk).toBeCloseTo((78 + 78 + 85) / 3, 12);
    expect(view.ballSpeed).toBeLessThanOrEqual(gameConfig.ball.speedCap);
    expect(view.move).toBeDefined();
    expect(statsOf(gameConfig, 'charmander', 1).powerStat).toBe('specialAttack'); // 60 > 52
    expect(statsOf(gameConfig, 'squirtle', 1).powerStat).toBe('specialAttack'); // 50 > 48
    expect(statsOf(gameConfig, 'psyduck', 1).form).toBe('psyduck');
  });

  it('shows the damage including the stage boost of a line that does not change form', () => {
    // Pikachu evolves into Raichu at stage 2, whose stats give x1.4: more than the x1.2 minimum of
    // stage 2 but less than the x1.45 of stage 3, so the maximum power makes up the difference.
    const peak = statsOf(gameConfig, 'pikachu', 6);
    const evolved = statsOf(gameConfig, 'pikachu', 3);
    expect(peak.form).toBe('raichu');
    expect(evolved.form).toBe('raichu');
    const power = (id: string) => formPower(gameConfig, gameConfig.species[id] as SpeciesDef);
    const formGrowth = power('raichu') / power('pikachu');
    const [, two, three] = gameConfig.team.stageGrowth as number[];
    expect(formGrowth).toBeGreaterThan(two as number);
    expect(formGrowth).toBeLessThan(three as number);
    expect(peak.damage / evolved.damage).toBeCloseTo((three as number) / formGrowth, 12);
    expect(peak.damage).toBeGreaterThan(evolved.damage);
    // Exeggutor, on the other hand, already grows more than the minimum: nothing is added.
    expect(statsOf(gameConfig, 'exeggcute', 6).damage).toBe(
      statsOf(gameConfig, 'exeggcute', 3).damage,
    );
  });

  it('names Attack when it ties with Special Attack', () => {
    const tie = withConfig({
      species: { ...quietConfig.species, even: species('even', stat(50, 70, 70, 50, 50, 60)) },
    });
    expect(statsOf(tie, 'even', 1).powerStat).toBe('attack');
  });

  it('the guard after a replacement counts the level the capture joins with, not level 1', () => {
    // Pikachu captured from a stage 3 enemy joins at level 4: Raichu, much sturdier than Pikachu.
    const team = [member('charmander'), member('squirtle')];
    const asLevel1 = teamGuard(gameConfig, [member('charmander'), member('pikachu', 1)]);
    const joined = guardAfterReplace(gameConfig, team, 1, { species: 'pikachu', stage: 3 });
    expect(statsOf(gameConfig, 'pikachu', 4).form).toBe('raichu');
    expect(joined).toBeGreaterThan(asLevel1);
  });

  it('says what the guard would be if a Pokémon were replaced by the capture', () => {
    const team = [member('tank'), member('soft')];
    const capture = { species: 'tank', stage: 1 };
    expect(guardAfterReplace(cfg, team, 1, capture)).toBeCloseTo(0.4, 12); // two tanks
    expect(guardAfterReplace(cfg, team, 0, { species: 'soft', stage: 1 })).toBeCloseTo(0.1, 12);
    expect(team[0]?.species).toBe('tank'); // the team itself is not touched
  });
});
