import { describe, expect, it } from 'vitest';
import {
  type BossDef,
  cloneRun,
  createRun,
  createSnapshot,
  deriveRng,
  type GameConfig,
  hashRun,
  isBossAlive,
  nextU32,
  type Run,
  tick,
  type WaveDef,
  writeSnapshot,
} from '../../src/domain';
import { autoCommand, makeEnemy, quietConfig, withConfig } from './fixtures';

const wave: WaveDef = {
  durationTicks: 100,
  spawnIntervalTicks: 1000, // no regular spawns: only the boss and its summons
  speedScale: 1,
  hpScale: 1,
  types: ['fire', 'water', 'grass', 'electric'],
};

const boss: BossDef = {
  species: 'gyarados',
  hpScale: 10,
  speed: 0.1,
  radius: 40,
  summonIntervalTicks: 50,
  summonCount: 4,
  summonSpeedScale: 1,
  summonHpScale: 1,
};

const bossConfig: GameConfig = withConfig({ waves: [wave], boss });

/** Plays until the boss has just spawned. */
function runWithBoss(cfg: GameConfig = bossConfig): Run {
  const run = createRun(cfg, 7, 'charmander');
  for (let i = 0; i < 1000 && !run.boss.spawned; i++) tick(run, autoCommand(run), cfg);
  return run;
}

function bossOf(run: Run) {
  const b = run.enemies.find((e) => e.id === run.boss.id);
  if (!b) throw new Error('boss missing');
  return b;
}

describe('boss: appearance', () => {
  it('does not appear before the last wave ends, and appears exactly once after it', () => {
    const run = createRun(bossConfig, 7, 'charmander');
    for (let i = 0; i < 99; i++) tick(run, autoCommand(run), bossConfig);
    expect(run.boss.spawned).toBe(false);
    expect(run.enemies).toHaveLength(0);

    const events: string[] = [];
    for (let i = 0; i < 300; i++) {
      for (const e of tick(run, autoCommand(run), bossConfig).events) events.push(e.type);
    }
    expect(events.filter((t) => t === 'bossSpawn')).toHaveLength(1);
    expect(run.enemies.filter((e) => e.species === 'gyarados')).toHaveLength(1);
  });

  it('is big, in the middle lane, and as tough as the config says', () => {
    const run = runWithBoss();
    const b = bossOf(run);
    expect(b.radius).toBe(40);
    expect(b.x).toBe(bossConfig.arena.width / 2);
    expect(b.speed).toBe(0.1);
    const expectedHp = 95 * bossConfig.enemy.hpScale * 10;
    expect(b.hp).toBeCloseTo(expectedHp, 9);
    expect(run.boss.maxHp).toBeCloseTo(expectedHp, 9);
    expect(isBossAlive(run)).toBe(true);
  });

  it('a config without boss keeps the old rule: won when the last wave is gone and nothing lives', () => {
    const cfg = withConfig({ waves: [wave] });
    const run = createRun(cfg, 7, 'charmander');
    for (let i = 0; i < 120; i++) tick(run, autoCommand(run), cfg);
    expect(run.phase).toBe('won');
    expect(run.boss.spawned).toBe(false);
  });
});

describe('boss: summons', () => {
  it('summons summonCount enemies every summonIntervalTicks and says so', () => {
    const run = runWithBoss();
    const summons: number[] = [];
    for (let i = 0; i < 150; i++) {
      for (const e of tick(run, autoCommand(run), bossConfig).events) {
        if (e.type === 'bossSummon') summons.push(run.tickCount);
      }
    }
    expect(summons).toHaveLength(3); // boss clock 50, 100, 150
    expect(summons[1]).toBe((summons[0] ?? 0) + 50);
  });

  it('each summoned enemy draws exactly four numbers from the spawn stream', () => {
    const run = runWithBoss();
    const reference = deriveRng(7, 'spawn');
    let summoned = 0;
    for (let i = 0; i < 200; i++) {
      for (const e of tick(run, autoCommand(run), bossConfig).events) {
        if (e.type === 'spawn') summoned += 1;
      }
    }
    expect(summoned).toBe(16);
    for (let i = 0; i < 16 * 4; i++) nextU32(reference);
    expect(nextU32(run.rng.spawn)).toBe(nextU32(reference));
  });

  it('summons are of every type and as tough and fast as summonHpScale and summonSpeedScale say', () => {
    const tough: GameConfig = withConfig({
      waves: [wave],
      boss: { ...boss, summonHpScale: 2, summonSpeedScale: 3 },
    });
    const run = runWithBoss(tough);
    const types = new Set<string>();
    const small: Run['enemies'] = [];
    for (let i = 0; i < 700; i++) {
      for (const e of tick(run, autoCommand(run), tough).events) {
        if (e.type !== 'spawn') continue;
        const spawned = run.enemies.find((x) => x.id === e.enemyId);
        if (spawned) {
          types.add(spawned.type);
          small.push({ ...spawned });
        }
      }
    }
    expect(small.length).toBeGreaterThan(30);
    expect(types.size).toBeGreaterThanOrEqual(3);
    for (const e of small) {
      const species = tough.species[e.species];
      expect(species).toBeDefined();
      expect(e.hp).toBeCloseTo((species?.baseStats.hp ?? 0) * tough.enemy.hpScale * 2, 9);
      // speed = mapped species speed * 3 * variation in [0.85, 1.15]
      expect(e.speed).toBeGreaterThan(tough.enemy.speedMin * 3 * 0.85 - 1e-9);
      expect(e.speed).toBeLessThan(tough.enemy.speedMax * 3 * 1.15 + 1e-9);
    }
  });

  it('what is summoned does not depend on the fight: same enemies even if the others are killed', () => {
    const a = runWithBoss();
    const b = runWithBoss();
    for (let i = 0; i < 49; i++) {
      tick(a, autoCommand(a), bossConfig);
      tick(b, autoCommand(b), bossConfig);
    }
    for (const e of b.enemies) if (e.id !== b.boss.id) e.hp = 0;
    tick(a, autoCommand(a), bossConfig);
    tick(b, autoCommand(b), bossConfig);
    const fresh = (r: Run) =>
      r.enemies.filter((e) => e.id !== r.boss.id && e.y < 10).map((e) => [e.species, e.x]);
    expect(fresh(a).length).toBe(4);
    expect(fresh(a)).toEqual(fresh(b));
  });
});

describe('boss: the end of the run', () => {
  it('killing the boss wins the run at once, whatever else is alive', () => {
    const run = runWithBoss();
    run.enemies.push(makeEnemy({ id: run.nextEnemyId, y: 100, speed: 0 }));
    bossOf(run).hp = 0;
    const out = tick(run, autoCommand(run), bossConfig);
    expect(run.phase).toBe('won');
    expect(out.events.some((e) => e.type === 'won')).toBe(true);
  });

  it('4G-H: nothing of the fight stays on the floor once it is won (its death is played clean)', () => {
    const run = runWithBoss();
    run.hazards.push({
      kind: 'column',
      x: 100,
      y: 0,
      link: 0,
      width: 60,
      telegraph: 50,
      active: 20,
      damage: 1,
      speed: 0,
      struck: false,
    });
    bossOf(run).hp = 0;
    tick(run, autoCommand(run), bossConfig);
    expect(run.phase).toBe('won');
    expect(run.hazards).toHaveLength(0);
  });

  // Accepted surviving mutant (3C, ADR-016): the win rule `spawned && !isBossAlive` without the
  // `spawned` half is equivalent in practice, because the boss spawns in the very tick in which
  // the wave index reaches the end of the table, before the win check. `spawned` stays as a guard.
  it('while the boss lives the run is not won, even with nothing else alive', () => {
    const run = runWithBoss();
    for (let i = 0; i < 20; i++) tick(run, autoCommand(run), bossConfig);
    expect(run.phase).toBe('playing');
  });

  it('the boss reaching the defence line loses the run even with plenty of health', () => {
    const run = runWithBoss();
    run.player.maxHp = 1000;
    run.player.hp = 1000;
    bossOf(run).y = bossConfig.arena.defenseLineY - 0.01;
    tick(run, autoCommand(run), bossConfig);
    expect(run.phase).toBe('lost');
    expect(run.player.hp).toBe(0);
  });

  it('a small enemy leaking still only costs its threat', () => {
    const run = runWithBoss();
    run.enemies.push(
      makeEnemy({ id: run.nextEnemyId, y: bossConfig.arena.defenseLineY - 0.01, speed: 1 }),
    );
    const hp = run.player.hp;
    tick(run, autoCommand(run), bossConfig);
    expect(run.player.hp).toBe(hp - 1);
    expect(run.phase).toBe('playing');
  });
});

describe('boss: state, clone, hash and snapshot', () => {
  it('boss state is part of the hash and of clones', () => {
    const run = runWithBoss();
    const copy = cloneRun(run);
    expect(hashRun(copy)).toBe(hashRun(run));
    run.boss.tick += 1;
    expect(hashRun(copy)).not.toBe(hashRun(run));
    run.boss.tick -= 1;
    run.boss.maxHp += 1;
    expect(hashRun(copy)).not.toBe(hashRun(run));
    expect(copy.boss).not.toBe(run.boss);
  });

  it('every field of the boss state is hashed on its own', () => {
    const run = runWithBoss();
    const base = hashRun(run);
    const variants: Array<(r: Run) => void> = [
      (r) => {
        r.boss.id += 1;
      },
      (r) => {
        r.boss.spawned = false;
      },
      (r) => {
        r.boss.maxHp += 1;
      },
      (r) => {
        r.boss.tick += 1;
      },
    ];
    for (const change of variants) {
      const copy = cloneRun(run);
      change(copy);
      expect(hashRun(copy)).not.toBe(base);
    }
  });

  it('the snapshot exposes the boss hp while it lives, and zero otherwise', () => {
    const run = createRun(bossConfig, 7, 'charmander');
    const snap = createSnapshot(8, 32);
    writeSnapshot(run, snap);
    expect(snap.bossMaxHp).toBe(0);
    expect(snap.bossHp).toBe(0);
    for (let i = 0; i < 200; i++) tick(run, autoCommand(run), bossConfig);
    bossOf(run).hp = 12.5;
    writeSnapshot(run, snap);
    expect(snap.bossHp).toBe(12.5);
    expect(snap.bossMaxHp).toBe(run.boss.maxHp);
    run.enemies = run.enemies.filter((e) => e.id !== run.boss.id);
    writeSnapshot(run, snap);
    expect(snap.bossHp).toBe(0);
    expect(snap.bossMaxHp).toBe(0);
  });

  it('the spatial grid reaches a boss bigger than any normal enemy', () => {
    const run = createRun(withConfig({ boss }), 1, 'charmander');
    // The biggest ball (a last-stage one) plus the biggest body: nothing is missed by the grid.
    expect(run.grid.pad).toBe(Math.max(...quietConfig.team.ballRadiusByStage) + 40);
  });
});
