import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBoss,
  baseOf,
  biomeLines,
  championOf,
  createRun,
  deriveRng,
  drawPool,
  effectiveness,
  fairLines,
  type GameConfig,
  statTotal,
  tick,
  typesOfLine,
} from '../../src/domain';

const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'] as const;
const SEEDS = Array.from({ length: 200 }, (_, i) => 1000 + i * 7919);

describe('the pool of a run (ADR-048)', () => {
  it('is drawn with its own stream and is the same for the same seed', () => {
    const a = createRun(gameConfig, 42, 'charmander');
    const b = createRun(gameConfig, 42, 'squirtle');
    expect(a.pool).toEqual(b.pool); // the starter does not change the pool
    expect(createRun(gameConfig, 43, 'charmander').pool).not.toEqual(a.pool);
    expect(drawPool(gameConfig, deriveRng(42, 'pool'))).toEqual(a.pool);
  });

  it('always has the four starters, and about 40 lines of the 214', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const { pool } = createRun(gameConfig, seed, 'charmander');
      for (const starter of STARTERS) expect(pool, `${starter} seed ${seed}`).toContain(starter);
      expect(pool.length).toBeGreaterThanOrEqual(30);
      expect(pool.length).toBeLessThanOrEqual(70);
      expect(new Set(pool).size).toBe(pool.length);
    }
  });

  it('has at least three lines of every type (or all there are), drawn per type', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const { pool } = createRun(gameConfig, seed, 'charmander');
      for (const type of ['normal', 'dragon', 'fairy', 'steel', 'ghost', 'ice'] as const) {
        const lines = pool.filter((id) => typesOfLine(gameConfig, id).includes(type));
        expect(lines.length, `${type} seed ${seed}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('takes a fixed number of draws: a smaller roster consumes the same numbers of the stream', () => {
    const small: GameConfig = {
      ...gameConfig,
      enemySpecies: gameConfig.enemySpecies.slice(0, 60),
    };
    const full = deriveRng(9, 'pool');
    const few = deriveRng(9, 'pool');
    drawPool(gameConfig, full);
    drawPool(small, few);
    expect(few).toEqual(full);
  });

  it('only draws species that exist, and keeps the pool inside the roster', () => {
    const { pool } = createRun(gameConfig, 5, 'pikachu');
    for (const id of pool) {
      expect(gameConfig.enemySpecies, id).toContain(id);
      expect(gameConfig.species[id], id).toBeDefined();
    }
  });

  it('V2: two different seeds share little: the mean overlap of 200 pairs is at most 0.30', () => {
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const a = new Set(createRun(gameConfig, SEEDS[i] ?? 1, 'charmander').pool);
      const b = new Set(createRun(gameConfig, (SEEDS[(i + 1) % 200] ?? 2) + 13, 'charmander').pool);
      let both = 0;
      for (const id of a) if (b.has(id)) both += 1;
      total += both / (a.size + b.size - both);
    }
    expect(total / 200).toBeLessThanOrEqual(0.3);
  }, 30_000);

  it('V3: no biome is left with fewer than four lines in the pool of a run', () => {
    let worst = Number.POSITIVE_INFINITY;
    for (const seed of SEEDS) {
      const { pool } = createRun(gameConfig, seed, 'charmander');
      for (const biome of Object.values(gameConfig.themes ?? {})) {
        const lines = new Set(biomeLines(gameConfig, pool, biome)).size;
        worst = Math.min(worst, lines);
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4);
  }, 30_000);
});

describe('the biomes of a run (ADR-049)', () => {
  it('draw one per wave, none repeated inside a run', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const { waveThemes } = createRun(gameConfig, seed, 'charmander');
      expect(waveThemes).toHaveLength(7);
      expect(new Set(waveThemes).size, `seed ${seed}`).toBe(7);
      for (const id of waveThemes) expect(gameConfig.themes?.[id]).toBeDefined();
    }
  });

  it('use every one of the 14 over enough seeds, and each wave sees many of them', () => {
    const seen = new Set<string>();
    const wave = Array.from({ length: 7 }, () => new Set<string>());
    for (const seed of SEEDS) {
      createRun(gameConfig, seed, 'squirtle').waveThemes.forEach((id, i) => {
        seen.add(id);
        wave[i]?.add(id);
      });
    }
    expect(seen.size).toBe(14);
    for (const ids of wave) expect(ids.size).toBeGreaterThanOrEqual(10);
  });

  it('wave 1 never resists the starter: at least four fair lines, and only those spawn (ADR-033)', () => {
    for (const starter of STARTERS) {
      for (const seed of SEEDS.slice(0, 12)) {
        const run = createRun(gameConfig, seed, starter);
        const biome = gameConfig.themes?.[run.waveThemes[0] ?? ''];
        if (biome === undefined) throw new Error('no biome');
        const lines = [...new Set(biomeLines(gameConfig, run.pool, biome))];
        const fair = fairLines(gameConfig, lines, starter);
        expect(fair.length, `${starter} seed ${seed} ${biome.id}`).toBeGreaterThanOrEqual(
          gameConfig.pool?.minBiomeLines ?? 4,
        );
        // Play the first wave out and look at what came: nothing the starter's attack resists.
        const strong: GameConfig = { ...gameConfig, player: { ...gameConfig.player, maxHp: 1e9 } };
        const live = createRun(strong, seed, starter);
        const attack = gameConfig.species[starter]?.type ?? 'fire';
        for (let t = 0; t < 900; t++) {
          tick(
            live,
            {
              moveX: 0,
              autoAim: true,
              ...(live.phase === 'levelup' ? { action: { type: 'pick', index: 0 } } : {}),
            } as never,
            strong,
          );
          for (const enemy of live.enemies) {
            const value = effectiveness(gameConfig, attack, enemy.type, enemy.type2);
            expect(value, `${starter} seed ${seed} met ${enemy.species}`).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  }, 60_000);
});

describe('the champion of a biome, the boss between waves (ADR-049)', () => {
  it('is the last form with the highest total of base stats among the lines of the pool', () => {
    const run = createRun(gameConfig, 77, 'charmander');
    const biome = gameConfig.themes?.[run.waveThemes[1] ?? ''];
    if (biome === undefined) throw new Error('no biome');
    const champion = championOf(gameConfig, run.pool, biome);
    expect(champion).toBeDefined();
    const best = Math.max(
      ...[...new Set(biomeLines(gameConfig, run.pool, biome, 3))].map((base) => {
        const form = gameConfig.lines?.[base]?.[1] ?? gameConfig.lines?.[base]?.[0] ?? base;
        return statTotal(gameConfig.species[form] ?? (gameConfig.species[base] as never));
      }),
    );
    expect(statTotal(gameConfig.species[champion ?? ''] as never)).toBe(best);
  });

  it('a tie goes to the lower id, and an empty pool has no champion', () => {
    const biome = gameConfig.themes?.volcano;
    if (biome === undefined) throw new Error('no biome');
    expect(championOf(gameConfig, [], biome)).toBeUndefined();
    const charmanderStats = gameConfig.species.charmander?.baseStats;
    if (charmanderStats === undefined) throw new Error('no charmander');
    const twins: GameConfig = {
      ...gameConfig,
      species: {
        ...gameConfig.species,
        zzz: { id: 'zzz', type: 'fire', baseStats: charmanderStats },
        aaa: { id: 'aaa', type: 'fire', baseStats: charmanderStats },
      },
      lines: { ...gameConfig.lines },
    };
    expect(
      championOf(twins, ['zzz', 'aaa'], { ...biome, types: [{ type: 'fire', weight: 1 }] }),
    ).toBe('aaa');
  });

  it("no boss between waves repeats inside a run, over 400 seeds (the author's two included)", () => {
    const seeds = [
      2973913475,
      3059020336,
      ...Array.from({ length: 400 }, (_, i) => 7 + i * 104729),
    ];
    const starters = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];
    for (const [n, seed] of seeds.entries()) {
      const run = createRun(gameConfig, seed, starters[n % 4] ?? 'charmander');
      const lines: string[] = [];
      for (const interlude of gameConfig.interludes ?? []) {
        run.wave.index = interlude.after;
        advanceBoss(run, gameConfig);
        const boss = run.enemies.find((e) => e.id === run.boss.id);
        if (boss === undefined) throw new Error(`seed ${seed}: no boss`);
        lines.push(baseOf(gameConfig, boss.species).base);
        run.enemies = []; // defeated
      }
      expect(lines, `seed ${seed}`).toHaveLength(3);
      expect(new Set(lines).size, `seed ${seed}: ${lines.join(', ')}`).toBe(3);
    }
  }, 60_000);

  it('the first interlude boss of a run is the champion of the biome that just ended', () => {
    for (const seed of [3, 4, 5, 6, 7]) {
      const strong: GameConfig = { ...gameConfig, player: { ...gameConfig.player, maxHp: 1e9 } };
      const run = createRun(strong, seed, 'charmander');
      const biome = strong.themes?.[run.waveThemes[1] ?? ''];
      if (biome === undefined) throw new Error('no biome');
      const expected = championOf(strong, run.pool, biome);
      for (let t = 0; t < 2 * 2700 + 5 && run.boss.next === 0; t++) {
        tick(
          run,
          {
            moveX: 0,
            autoAim: true,
            ...(run.phase === 'levelup' ? { action: { type: 'pick', index: 0 } } : {}),
          } as never,
          strong,
        );
      }
      expect(run.boss.next, `seed ${seed}`).toBe(1);
      const boss = run.enemies.find((e) => e.id === run.boss.id);
      expect(boss?.species, `seed ${seed}`).toBe(expected);
    }
  });
});

describe('the legendaries stay available as final bosses (ADR-048)', () => {
  it('every one in the table is a species of the game, out of every pool and every line', () => {
    const table = gameConfig.boss?.byType ?? {};
    const lines = new Set([
      ...gameConfig.enemySpecies,
      ...Object.values(gameConfig.lines ?? {}).flat(),
    ]);
    for (const id of Object.values(table)) {
      expect(gameConfig.species[id], id).toBeDefined();
      expect(lines.has(id), `${id} must not be a line`).toBe(false);
    }
    for (const seed of SEEDS.slice(0, 50)) {
      const { pool } = createRun(gameConfig, seed, 'charmander');
      for (const id of Object.values(table)) expect(pool, id).not.toContain(id);
    }
  });

  it('the final boss of a run is one of them, drawn by the themes stream, different over seeds', () => {
    const table = gameConfig.boss?.finals ?? [];
    expect(table.length).toBeGreaterThanOrEqual(30);
    const seen = new Set<string>();
    for (const seed of SEEDS.slice(0, 30)) {
      const strong: GameConfig = {
        ...gameConfig,
        player: { ...gameConfig.player, maxHp: 1e9 },
        interludes: [],
        waves: gameConfig.waves.map((w) => ({ ...w, durationTicks: 20 })),
      };
      const run = createRun(strong, seed, 'charmander');
      for (let t = 0; t < 7 * 20 + 5 && !run.boss.spawned; t++) {
        tick(run, { moveX: 0 }, strong);
      }
      expect(run.boss.spawned, `seed ${seed}`).toBe(true);
      const boss = run.enemies.find((e) => e.id === run.boss.id);
      expect(table, `seed ${seed} ${boss?.species}`).toContain(boss?.species);
      seen.add(boss?.species ?? '');
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});
