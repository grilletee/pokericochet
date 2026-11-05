import { describe, expect, it } from 'vitest';
import {
  baseOf,
  type Card,
  captureLevel,
  cloneRun,
  createRun,
  createSnapshot,
  damageEnemy,
  deriveRng,
  drawOffers,
  dropBall,
  dropCapture,
  type Enemy,
  formAt,
  type GameConfig,
  type GameEvent,
  hashRun,
  isBossAlive,
  nextU32,
  type SpeciesDef,
  summarizeRun,
  tick,
  type WaveDef,
  writeSnapshot,
} from '../../src/domain';
import { makeBall, makeEnemy, quietConfig } from './fixtures';

const sp = (id: string, type: SpeciesDef['type'], hp = 40): SpeciesDef => ({
  id,
  type,
  baseStats: { hp, attack: 50, defense: 50, specialAttack: 45, specialDefense: 50, speed: 60 },
});

const species: Record<string, SpeciesDef> = {
  ...quietConfig.species,
  growlithe: sp('growlithe', 'fire', 40),
  arcanine: sp('arcanine', 'fire', 90),
  poliwag: sp('poliwag', 'water', 40),
  starmie: sp('starmie', 'water', 60),
  rapidash: sp('rapidash', 'fire', 65),
  moltres: sp('moltres', 'fire', 90),
  kyogre: sp('kyogre', 'water', 100),
};

const wave = (o: Partial<WaveDef> = {}): WaveDef => ({
  durationTicks: 100,
  spawnIntervalTicks: 10,
  speedScale: 1,
  hpScale: 1,
  types: ['fire', 'water'],
  ...o,
});

const themed: GameConfig = {
  ...quietConfig,
  species,
  enemySpecies: ['growlithe', 'poliwag'],
  lines: { growlithe: ['arcanine'], poliwag: ['starmie'] },
  forms: { arcanine: { base: 'growlithe', level: 2 }, starmie: { base: 'poliwag', level: 2 } },
  themes: {
    pack: { id: 'pack', name: 'Pack', type: 'fire', species: ['growlithe'], purity: 1 },
    sea: { id: 'sea', name: 'Sea', type: 'water', species: ['poliwag'], purity: 1 },
  },
  waves: [wave({ themes: ['pack', 'sea'] }), wave({ themes: ['pack'], tier: 2 })],
};

function spawned(run: ReturnType<typeof createRun>, cfg: GameConfig, ticks: number): Enemy[] {
  const out: Enemy[] = [];
  for (let i = 0; i < ticks; i++) {
    for (const e of tick(run, { moveX: 0 }, cfg).events) {
      if (e.type !== 'spawn') continue;
      const enemy = run.enemies.find((x) => x.id === e.enemyId);
      if (enemy) out.push({ ...enemy });
    }
  }
  return out;
}

describe('evolution forms of enemies and balls', () => {
  it('formAt gives the base at level 1, the forms after it and the last form beyond the line', () => {
    expect(formAt(themed, 'growlithe', 1)).toBe('growlithe');
    expect(formAt(themed, 'growlithe', 2)).toBe('arcanine');
    expect(formAt(themed, 'growlithe', 3)).toBe('arcanine');
    expect(formAt(themed, 'missingno', 2)).toBe('missingno');
    expect(formAt(quietConfig, 'growlithe', 2)).toBe('growlithe'); // no lines in the config
    const unknownForm = { ...themed, lines: { growlithe: ['unknown-form'] } };
    expect(formAt(unknownForm, 'growlithe', 2)).toBe('growlithe');
  });

  it('baseOf maps a form back to its line and level, and a base to itself', () => {
    expect(baseOf(themed, 'arcanine')).toEqual({ base: 'growlithe', level: 2 });
    expect(baseOf(themed, 'growlithe')).toEqual({ base: 'growlithe', level: 1 });
    expect(baseOf(quietConfig, 'arcanine')).toEqual({ base: 'arcanine', level: 1 });
  });
});

describe('wave themes (ADR-027)', () => {
  it('are drawn when the run starts, one per wave, from their own stream only', () => {
    const run = createRun(themed, 5, 'charmander');
    expect(run.waveThemes).toHaveLength(2);
    expect(['pack', 'sea']).toContain(run.waveThemes[0]);
    expect(run.waveThemes[1]).toBe('pack');
    // The spawn stream is untouched by the draw, and the themes stream is the one that moved.
    expect(run.rng.spawn).toEqual(deriveRng(5, 'spawn'));
    const reference = deriveRng(5, 'themes');
    nextU32(reference);
    nextU32(reference);
    expect(run.rng.themes).toEqual(reference);
  });

  it('differ between seeds and repeat for the same seed', () => {
    const first = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      first.add(createRun(themed, seed, 'charmander').waveThemes[0] ?? '');
      expect(createRun(themed, seed, 'charmander').waveThemes).toEqual(
        createRun(themed, seed, 'charmander').waveThemes,
      );
    }
    expect([...first].sort()).toEqual(['pack', 'sea']);
  });

  it('a wave without themes has none', () => {
    const plain = { ...themed, waves: [wave()] };
    expect(createRun(plain, 1, 'charmander').waveThemes).toEqual(['']);
  });

  it('a pure theme spawns only its species; a purity of 0 falls back to the general pool', () => {
    const run = createRun(themed, 3, 'charmander');
    const theme = run.waveThemes[0] === 'pack' ? 'growlithe' : 'poliwag';
    const all = spawned(run, themed, 99).map((e) => e.species);
    expect(all.length).toBeGreaterThan(5);
    expect(new Set(all)).toEqual(new Set([theme]));

    const open = {
      ...themed,
      themes: {
        pack: { ...(themed.themes?.pack as NonNullable<GameConfig['themes']>[string]), purity: 0 },
        sea: { ...(themed.themes?.sea as NonNullable<GameConfig['themes']>[string]), purity: 0 },
      },
    };
    const mixed = spawned(createRun(open, 3, 'charmander'), open, 99).map((e) => e.species);
    expect(new Set(mixed)).toEqual(new Set(['growlithe', 'poliwag']));
  });

  it('theme species that the config does not know are ignored', () => {
    const odd = {
      ...themed,
      themes: {
        pack: { id: 'pack', name: 'P', type: 'fire' as const, species: ['nope'], purity: 1 },
      },
      waves: [wave({ themes: ['pack'] })],
    };
    const run = createRun(odd, 1, 'charmander');
    const all = spawned(run, odd, 99);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((e) => ['growlithe', 'poliwag'].includes(e.species))).toBe(true);
  });

  it('the tier of the wave picks the evolution form, whose health is the form’s own', () => {
    const run = createRun(themed, 3, 'charmander');
    run.wave.index = 1;
    const all = spawned(run, themed, 50);
    expect(all.length).toBeGreaterThan(2);
    for (const e of all) {
      expect(e.species).toBe('arcanine');
      expect(e.hp).toBeCloseTo(90 * themed.enemy.hpScale * 1, 6);
    }
  });

  it('announces each wave with its theme, the first one on the first tick', () => {
    const run = createRun(themed, 3, 'charmander');
    const first = [...tick(run, { moveX: 0 }, themed).events]; // the array is reused by `tick`
    expect(first).toContainEqual({ type: 'waveStart', index: 0, theme: run.waveThemes[0] });
    const later: string[] = [];
    for (let i = 0; i < 120; i++) {
      for (const e of tick(run, { moveX: 0 }, themed).events) {
        if (e.type === 'waveStart') later.push(`${e.index}:${e.theme}`);
      }
    }
    expect(later).toEqual(['1:pack']);
    // And not again on the first tick after a pause.
    expect(first.filter((e) => e.type === 'waveStart')).toHaveLength(1);
  });

  it('hashRun and cloneRun cover the themes and the captures', () => {
    const run = createRun(themed, 3, 'charmander');
    const copy = cloneRun(run);
    expect(copy.waveThemes).toEqual(run.waveThemes);
    expect(hashRun(copy)).toBe(hashRun(run));
    copy.waveThemes = [...run.waveThemes.slice(0, 1), 'other'];
    expect(hashRun(copy)).not.toBe(hashRun(run));
    const other = cloneRun(run);
    other.captured.push({ species: 'growlithe', level: 2 });
    expect(hashRun(other)).not.toBe(hashRun(run));
    expect(other.captured).not.toBe(run.captured);
    const third = cloneRun(run);
    third.waveThemes[0] = 'changed in place';
    expect(run.waveThemes[0]).not.toBe('changed in place');
    third.rng.themes.a += 1;
    expect(hashRun(third)).not.toBe(hashRun(run));
  });
});

describe('capture of an evolved enemy (ADR-027)', () => {
  const greedy: GameConfig = {
    ...themed,
    capture: { ...themed.capture, chance: 1 },
    waves: [],
  };

  it('drops the ball of its line at the level of its form, and the ball joins at that level', () => {
    const run = createRun(greedy, 1, 'charmander');
    const enemy = makeEnemy({ id: 9, species: 'arcanine', type: 'fire', hp: 1, x: 200, y: 300 });
    run.enemies = [enemy];
    run.nextEnemyId = 10;
    damageEnemy(run, greedy, enemy, 5);
    expect(run.pickups[0]).toMatchObject({ slot: -1, species: 'growlithe', level: 2 });
    expect(run.events).toContainEqual(
      expect.objectContaining({ type: 'captureDrop', species: 'growlithe', level: 2 }),
    );
    run.player.x = run.pickups[0]?.x ?? 0;
    for (let i = 0; i < 400 && run.pickups.length > 0; i++) tick(run, { moveX: 0 }, greedy);
    // A stage 2 enemy joins at the level the rules give it, firing that level's balls.
    const level = captureLevel(greedy, 2);
    expect(run.team.at(-1)).toMatchObject({ species: 'growlithe', level });
    expect(run.loadout.filter((b) => b.owner === run.team.length - 1)).toHaveLength(
      greedy.team.ballsByLevel[level - 1] ?? 1,
    );
    expect(run.loadout.at(-1)).toMatchObject({ species: 'growlithe', level });
    expect(run.captured).toEqual([{ species: 'growlithe', level: 2 }]);
  });
});

describe('bosses between waves (ADR-028)', () => {
  const ladder: GameConfig = {
    ...themed,
    waves: [
      wave({ themes: ['pack'], durationTicks: 50 }),
      wave({ themes: ['sea'], durationTicks: 50 }),
    ],
    interludes: [
      {
        after: 1,
        byType: { fire: 'rapidash', water: 'starmie', grass: 'rapidash', electric: 'rapidash' },
        hpScale: 3,
        speed: 0.1,
        radius: 28,
        summonIntervalTicks: 30,
        summonCount: 2,
        summonSpeedScale: 1,
        summonHpScale: 1,
        healHp: 2,
      },
    ],
    boss: {
      species: 'gyarados',
      byType: { fire: 'moltres', water: 'kyogre' },
      hpScale: 5,
      speed: 0.1,
      radius: 40,
      summonIntervalTicks: 30,
      summonCount: 2,
      summonSpeedScale: 1,
      summonHpScale: 1,
    },
  };

  function toInterlude() {
    const run = createRun(ladder, 4, 'charmander');
    const events: string[] = [];
    for (let i = 0; i < 60 && !isBossAlive(run); i++) {
      for (const e of tick(run, { moveX: 0 }, ladder).events) events.push(e.type);
    }
    return { run, events };
  }

  it('waits for the first boss to fall before a second one due at the same wave', () => {
    const [first] = ladder.interludes ?? [];
    if (first === undefined) throw new Error('fixture without interlude');
    const twice: GameConfig = { ...ladder, interludes: [first, { ...first, hpScale: 4 }] };
    const run = createRun(twice, 4, 'charmander');
    for (let i = 0; i < 60 && !isBossAlive(run); i++) tick(run, { moveX: 0 }, twice);
    const bossId = run.boss.id;
    for (let i = 0; i < 20; i++) tick(run, { moveX: 0 }, twice);
    expect(run.boss.next).toBe(1);
    expect(run.boss.id).toBe(bossId);
    const boss = run.enemies.find((e) => e.id === bossId) as Enemy;
    damageEnemy(run, twice, boss, 1e9);
    run.enemies = run.enemies.filter((e) => e.hp > 0);
    tick(run, { moveX: 0 }, twice);
    expect(run.boss.next).toBe(2);
    expect(run.boss.id).not.toBe(bossId);
  });

  it('says which boss it is: "number of total" for those between waves, then the final one (4F-E)', () => {
    const [first] = ladder.interludes ?? [];
    if (first === undefined) throw new Error('fixture without interlude');
    const twice: GameConfig = { ...ladder, interludes: [first, { ...first, hpScale: 4 }] };
    const run = createRun(twice, 4, 'charmander');
    const spawns: GameEvent[] = [];
    for (let i = 0; i < 2000 && !(run.boss.spawned && isBossAlive(run)); i++) {
      for (const e of tick(run, { moveX: 0 }, twice).events) {
        if (e.type === 'bossSpawn') spawns.push(e);
      }
      const alive = run.enemies.find((e) => e.id === run.boss.id && e.hp > 0);
      if (alive !== undefined) damageEnemy(run, twice, alive, 1e9);
      run.enemies = run.enemies.filter((e) => e.hp > 0);
    }
    expect(
      spawns.map((e) => (e.type === 'bossSpawn' ? [e.number, e.interludes, e.final] : [])),
    ).toEqual([
      [1, 2, false],
      [2, 2, false],
      [3, 2, true],
    ]);
    // Each event names the species it placed, which is the one on the field.
    const names = spawns.map((e) => (e.type === 'bossSpawn' ? e.species : ''));
    expect(names.slice(0, 2)).toEqual(['rapidash', 'rapidash']);
    expect(['moltres', 'kyogre', 'gyarados']).toContain(names[2]);
  });

  it('appears when its waves are over, of the type of the wave that just ended', () => {
    const { run, events } = toInterlude();
    expect(events).toContain('bossSpawn');
    expect(isBossAlive(run)).toBe(true);
    const boss = run.enemies.find((e) => e.id === run.boss.id);
    expect(boss?.species).toBe('rapidash'); // wave 1 theme is "pack", fire
    expect(boss?.hp).toBeCloseTo(65 * ladder.enemy.hpScale * 3, 6);
    expect(run.boss).toMatchObject({ next: 1, spawned: false, type: 'fire' });
    expect(run.wave.index).toBe(1); // not a wave early
  });

  it('stops the wave clock while it lives, but its summons keep coming (of its type)', () => {
    const { run } = toInterlude();
    const waveTick = run.wave.tick;
    const waveIndex = run.wave.index;
    const summons: Enemy[] = spawned(run, ladder, 100);
    expect(run.wave).toEqual({ index: waveIndex, tick: waveTick });
    expect(summons.length).toBeGreaterThanOrEqual(4);
    expect(summons.every((e) => e.type === 'fire')).toBe(true);
  });

  it('when it dies it is counted, heals the player and drops a capture of its line at its level', () => {
    const { run } = toInterlude();
    run.player.hp = 5;
    const boss = run.enemies.find((e) => e.id === run.boss.id) as Enemy;
    run.events.length = 0;
    damageEnemy(run, { ...ladder, capture: { ...ladder.capture, chance: 0 } }, boss, 1e9);
    expect(run.boss.defeated).toBe(1);
    expect(run.player.hp).toBe(7);
    expect(run.events).toContainEqual({ type: 'heal', amount: 2 });
    expect(run.events).toContainEqual({ type: 'bossDefeated', species: 'rapidash', index: 1 });
    // Rapidash is not part of a line in this config: it drops as itself at level 1.
    expect(run.pickups.at(-1)).toMatchObject({ slot: -1, species: 'rapidash', level: 1 });
    expect(run.captureMisses).toBe(createRun(ladder, 4, 'charmander').captureMisses);
  });

  it('the healing never goes over the maximum, and nothing is healed at full health', () => {
    const { run } = toInterlude();
    run.player.hp = run.player.maxHp - 1;
    const boss = run.enemies.find((e) => e.id === run.boss.id) as Enemy;
    run.events.length = 0;
    damageEnemy(run, ladder, boss, 1e9);
    expect(run.player.hp).toBe(run.player.maxHp);
    expect(run.events).toContainEqual({ type: 'heal', amount: 1 });

    const full = toInterlude().run;
    const other = full.enemies.find((e) => e.id === full.boss.id) as Enemy;
    full.events.length = 0;
    damageEnemy(full, ladder, other, 1e9);
    expect(full.events.some((e) => e.type === 'heal')).toBe(false);
  });

  it('takes its species from the theme of the wave that ended: a water wave brings a water boss', () => {
    const run = createRun(ladder, 4, 'charmander');
    run.waveThemes = ['sea', 'sea'];
    for (let i = 0; i < 60 && !isBossAlive(run); i++) tick(run, { moveX: 0 }, ladder);
    expect(run.enemies.find((e) => e.id === run.boss.id)?.species).toBe('starmie');
    expect(run.boss.type).toBe('water');
  });

  it('drops the line of a boss that has forms, at the level of its form', () => {
    const run = createRun(ladder, 4, 'charmander');
    run.waveThemes = ['sea', 'sea'];
    for (let i = 0; i < 60 && !isBossAlive(run); i++) tick(run, { moveX: 0 }, ladder);
    const boss = run.enemies.find((e) => e.id === run.boss.id) as Enemy;
    damageEnemy(run, ladder, boss, 1e9);
    expect(run.pickups.at(-1)).toMatchObject({ species: 'poliwag', level: 2 });
  });

  it('stops summoning once it is dead', () => {
    const { run } = toInterlude();
    const boss = run.enemies.find((e) => e.id === run.boss.id) as Enemy;
    damageEnemy(run, ladder, boss, 1e9);
    run.enemies = run.enemies.filter((e) => e.hp > 0);
    const before = run.boss.tick;
    let summons = 0;
    // Short enough that the wave after it has not ended: the final boss is not on the field yet.
    for (let i = 0; i < 40; i++) {
      for (const e of tick(run, { moveX: 0 }, ladder).events) {
        if (e.type === 'bossSummon') summons += 1;
      }
    }
    expect(summons).toBe(0);
    expect(run.boss.tick).toBe(before);
  });

  it('the final boss neither heals nor drops anything when it dies: the run is won', () => {
    const run = createRun(ladder, 4, 'charmander');
    run.wave.index = 2;
    run.boss.next = 1;
    run.player.hp = 3;
    tick(run, { moveX: 0 }, ladder);
    const boss = run.enemies.find((e) => e.id === run.boss.id) as Enemy;
    run.events.length = 0;
    const pickups = run.pickups.length;
    damageEnemy(run, ladder, boss, 1e9);
    expect(run.player.hp).toBe(3);
    expect(run.pickups).toHaveLength(pickups);
    expect(run.events).toContainEqual(expect.objectContaining({ type: 'bossDefeated' }));
    expect(run.boss.defeated).toBe(1);
  });

  it('the waves go on after it, and the final boss is a legendary drawn by type', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 30; seed++) {
      const run = createRun(ladder, seed, 'charmander');
      let finalSpecies = '';
      for (let i = 0; i < 4000 && run.phase === 'playing'; i++) {
        // Kill every boss at once so the run goes through the whole ladder.
        for (const e of tick(
          run,
          { moveX: 0 },
          { ...ladder, capture: { ...ladder.capture, chance: 0 } },
        ).events) {
          if (e.type === 'bossSpawn') {
            const boss = run.enemies.find((x) => x.id === e.enemyId) as Enemy;
            if (run.boss.spawned) finalSpecies = boss.species;
            damageEnemy(run, ladder, boss, 1e9);
          }
        }
        run.enemies = run.enemies.filter((x) => x.hp > 0);
      }
      expect(run.boss.defeated).toBe(2);
      expect(run.phase).toBe('won');
      seen.add(finalSpecies);
    }
    expect([...seen].sort()).toEqual(['kyogre', 'moltres']);
  });

  it('the final legendary summons enemies of its own type', () => {
    const run = createRun(ladder, 4, 'charmander');
    run.wave.index = 2;
    run.boss.next = 1;
    tick(run, { moveX: 0 }, ladder);
    expect(run.boss.spawned).toBe(true);
    const type = run.enemies.find((e) => e.id === run.boss.id)?.type;
    const summons = spawned(run, ladder, 100);
    expect(summons.length).toBeGreaterThan(0);
    expect(summons.every((e) => e.type === type)).toBe(true);
  });

  it('the snapshot says which boss is on the field, and the summary counts them', () => {
    const { run } = toInterlude();
    const snap = createSnapshot();
    const codes = new Map([['rapidash', 7]]);
    writeSnapshot(run, snap, codes);
    expect(snap.bossSpecies).toBe(7);
    expect(snap.bossMaxHp).toBeGreaterThan(0);
    run.boss.defeated = 2;
    run.captured.push({ species: 'growlithe', level: 2 });
    const summary = summarizeRun(run, ladder);
    expect(summary.bossesDefeated).toBe(2);
    expect(summary.captured).toEqual([{ species: 'growlithe', level: 2 }]);
  });

  it('a config without bosses between waves behaves as before', () => {
    const run = createRun({ ...ladder, interludes: [] }, 4, 'charmander');
    for (let i = 0; i < 120; i++) tick(run, { moveX: 0 }, { ...ladder, interludes: [] });
    expect(run.boss.next).toBe(0);
    expect(run.wave.index).toBe(2);
  });
});

describe('cards that answer the next wave (ADR-027)', () => {
  const answerConfig: GameConfig = {
    ...themed,
    ballSpecies: ['charmander', 'squirtle', 'bulbasaur', 'pikachu'],
    // Wave 1 is the current one, wave 2 the next: a fire theme; water and grass... see typeChart.
    themes: {
      ...themed.themes,
      pack: { id: 'pack', name: 'Pack', type: 'water', species: ['poliwag'], purity: 1 },
    },
    waves: [wave({ themes: ['pack'] }), wave({ themes: ['pack'] })],
    cards: {
      ...themed.cards,
      weights: { newBall: 1, train: 0, power: 0, cadence: 0, vitality: 0, team: 0, hybrid: 0 },
    },
  };

  const newBalls = (cards: Card[]): string[] =>
    cards.flatMap((c) => (c.kind === 'newBall' ? [c.species] : []));

  it('the first new ball is one that beats the type of the next wave, if the team has none', () => {
    // Water is beaten by grass and electric; the starter is fire, which does not beat water.
    for (let seed = 1; seed < 30; seed++) {
      const run = createRun(answerConfig, seed, 'charmander');
      const species = newBalls(drawOffers(run, answerConfig));
      expect(species.length).toBeGreaterThan(0);
      expect(['bulbasaur', 'pikachu']).toContain(species[0]);
    }
  });

  it('nothing changes when the team already beats it', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const run = createRun(answerConfig, seed, 'charmander');
      run.team = [
        {
          species: 'bulbasaur',
          type: 'grass',
          level: 1,
          starter: false,
          damageUps: 0,
          cadenceUps: 0,
          charge: 0,
        },
      ];
      for (const s of newBalls(drawOffers(run, answerConfig))) seen.add(s);
    }
    expect(seen.has('charmander')).toBe(true);
    expect(seen.has('squirtle')).toBe(true);
  });

  it('does not restrict the first new ball when the team already beats the next wave', () => {
    const first = new Set<string>();
    for (let seed = 1; seed < 80; seed++) {
      const run = createRun(answerConfig, seed, 'charmander');
      run.team = [
        {
          species: 'bulbasaur',
          type: 'grass',
          level: 1,
          starter: false,
          damageUps: 0,
          cadenceUps: 0,
          charge: 0,
        },
      ];
      const species = newBalls(drawOffers(run, answerConfig))[0];
      if (species !== undefined) first.add(species);
    }
    expect(first.has('charmander') || first.has('squirtle')).toBe(true);
  });

  it('a neutral matchup is not an answer: only a type that beats it is', () => {
    // Fire is the target; electric is neutral against fire, water beats it.
    const fireWave: GameConfig = {
      ...answerConfig,
      themes: { pack: { id: 'pack', name: 'F', type: 'fire', species: ['growlithe'], purity: 1 } },
    };
    for (let seed = 1; seed < 30; seed++) {
      const run = createRun(fireWave, seed, 'pikachu');
      run.team = [
        {
          species: 'pikachu',
          type: 'electric',
          level: 1,
          starter: false,
          damageUps: 0,
          cadenceUps: 0,
          charge: 0,
        },
      ];
      expect(newBalls(drawOffers(run, fireWave))[0]).toBe('squirtle');
    }
  });

  it('uses the next wave when there is one, and the current one on the last wave', () => {
    const asymmetric = {
      ...answerConfig,
      themes: {
        ...answerConfig.themes,
        pack: { id: 'pack', name: 'Pack', type: 'water' as const, species: ['poliwag'], purity: 1 },
        sea: { id: 'sea', name: 'Sea', type: 'fire' as const, species: ['growlithe'], purity: 1 },
      },
      waves: [wave({ themes: ['sea'] }), wave({ themes: ['pack'] })],
    };
    const first = createRun(asymmetric, 1, 'squirtle'); // water ball: no answer to... water
    first.wave.index = 0; // next wave is water: the team (water) does not beat water
    expect(['bulbasaur', 'pikachu']).toContain(newBalls(drawOffers(first, asymmetric))[0]);
    const last = createRun(asymmetric, 1, 'squirtle');
    last.wave.index = 1; // last wave: its own theme (water) is the target
    expect(['bulbasaur', 'pikachu']).toContain(newBalls(drawOffers(last, asymmetric))[0]);
  });

  it('draws the same number of cards from the stream either way', () => {
    const a = createRun(answerConfig, 9, 'charmander');
    const b = createRun(answerConfig, 9, 'charmander');
    b.loadout = [makeBall({ id: 1, species: 'bulbasaur', type: 'grass' })];
    drawOffers(a, answerConfig);
    drawOffers(b, answerConfig);
    expect(nextU32(a.rng.cards)).toBe(nextU32(b.rng.cards));
  });

  it('no guarantee when no species can answer (electric is beaten by nobody)', () => {
    const electric = {
      ...answerConfig,
      themes: {
        pack: { id: 'pack', name: 'E', type: 'electric' as const, species: [], purity: 1 },
      },
    };
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      for (const s of newBalls(drawOffers(createRun(electric, seed, 'charmander'), electric))) {
        seen.add(s);
      }
    }
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('pickup levels', () => {
  it('a returning ball keeps the level of the ball, and the level is part of the hash', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.loadout = [makeBall({ id: 1, level: 3 })];
    run.cooldowns = [-1];
    dropBall(run, quietConfig, 0, 100);
    expect(run.pickups[0]?.level).toBe(3);
    const copy = cloneRun(run);
    expect(hashRun(copy)).toBe(hashRun(run));
    (copy.pickups[0] as NonNullable<(typeof copy.pickups)[number]>).level = 2;
    expect(hashRun(copy)).not.toBe(hashRun(run));
  });

  it('a captured pickup shows its own level in the snapshot', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    dropCapture(run, quietConfig, 'psyduck', 'water', 100, 200, 2);
    const snap = createSnapshot();
    writeSnapshot(run, snap);
    expect(snap.pickupLevel[0]).toBe(2);
  });
});

describe('hybrid memory in the hash (ADR-026)', () => {
  it('two hybrids that differ only in their second ingredient hash differently', () => {
    const make = (second: string, type: 'water' | 'grass') => {
      const run = createRun(quietConfig, 1, 'charmander');
      run.loadout[0] = {
        ...makeBall({ id: 1, level: 2, hybrid: true }),
        secondSpecies: second,
        secondType: type,
      };
      return hashRun(run);
    };
    expect(make('squirtle', 'water')).not.toBe(make('bulbasaur', 'water'));
    expect(make('squirtle', 'water')).not.toBe(make('squirtle', 'grass'));
    expect(make('squirtle', 'water')).toBe(make('squirtle', 'water'));
  });
});
