import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  type BossAttackDef,
  createRun,
  type GameConfig,
  startFight,
} from '../../src/domain';
import { makeEnemy, quietConfig } from './fixtures';

const fight = gameConfig.bossFight;
if (fight === undefined) throw new Error('the game has no boss fight table');

function configWith(attack: BossAttackDef): GameConfig {
  const phase = {
    attacks: [attack],
    intervalTicks: 40,
    perRound: 1,
    damageMult: 1,
    coreEvery: 100000,
    coreOpen: 10,
    strong: attack,
  };
  const table = { phases: [phase, phase] as const };
  return {
    ...quietConfig,
    bossFight: { ...fight, bySpecies: {}, byType: {}, default: table, calmTicks: 1 },
  } as GameConfig;
}

describe('4G-H: the attacks of a boss carry its type, so each type has its own look', () => {
  for (const kind of ['column', 'sweep', 'rain', 'shot', 'comb'] as const) {
    it(`a ${kind} of a fire boss is a fire attack`, () => {
      const cfg = configWith({
        kind,
        width: 60,
        count: 3,
        telegraphTicks: 80,
        activeTicks: 20,
        damage: 2,
        speed: 4,
      });
      const run = createRun(cfg, 3, 'charmander');
      const boss = makeEnemy({ id: 9, species: 'magmar', type: 'fire', hp: 1000, x: 240, y: 120 });
      run.enemies = [boss];
      run.boss.id = 9;
      run.boss.maxHp = 1000;
      startFight(run, cfg, boss);
      for (let i = 0; i < 60 && run.hazards.length === 0; i++) advanceBossFight(run, cfg);
      expect(run.hazards.length).toBeGreaterThan(0);
      for (const h of run.hazards) expect(h.type).toBe('fire');
    });
  }
});

describe('4G-H: the health of the bosses, fixed and measured in seconds of fight', () => {
  it('each boss between waves is much tougher than the last, and the final one the toughest', () => {
    const mids = (gameConfig.interludes ?? []).map((b) => b.hpScale);
    expect(mids).toHaveLength(3);
    // The first as it was; the second and third clearly up (the team grows ~5x and ~10x).
    expect(mids[0]).toBe(7.5);
    expect((mids[1] ?? 0) / (mids[0] ?? 1)).toBeGreaterThan(5);
    expect((mids[2] ?? 0) / (mids[1] ?? 1)).toBeGreaterThan(2.5);
    expect(gameConfig.boss?.hpScale ?? 0).toBeGreaterThan(mids[2] ?? 0);
    expect(gameConfig.boss?.hpScale).toBe(230);
  });
});
