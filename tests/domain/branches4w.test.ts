import { describe, expect, it } from 'vitest';
import {
  addMember,
  attackTypeOf,
  chooseBranch,
  createRun,
  formAt,
  formOfMember,
  type GameConfig,
  type GameType,
  joinTeam,
  moveIdOf,
  nextStep,
  placeTypes,
  type SpeciesDef,
  stageForLevel,
  type ThemeDef,
  trainMember,
} from '../../src/domain';
import { quietConfig } from './fixtures';

/**
 * 4W, block 7 (18th playtest: "más Pokémon: Eevee y sus evoluciones, Gardevoir/Gallade..."): a line
 * that splits takes its branch from the place where it reaches the stage of the split.
 */
const stats = { hp: 55, attack: 55, defense: 50, specialAttack: 45, specialDefense: 65, speed: 55 };
const sp = (id: string, type: SpeciesDef['type'], type2?: SpeciesDef['type']): SpeciesDef => ({
  id,
  type,
  ...(type2 === undefined ? {} : { type2 }),
  baseStats: stats,
});

/** Eevee goes to Vaporeon by default, to Flareon or Glaceon by place; Ralts splits at stage 3. */
function branchConfig(): GameConfig {
  return {
    ...quietConfig,
    species: {
      ...quietConfig.species,
      eevee: sp('eevee', 'normal'),
      vaporeon: sp('vaporeon', 'water'),
      flareon: sp('flareon', 'fire'),
      glaceon: sp('glaceon', 'ice'),
      ralts: sp('ralts', 'psychic', 'fairy'),
      kirlia: sp('kirlia', 'psychic', 'fairy'),
      gardevoir: sp('gardevoir', 'psychic', 'fairy'),
      gallade: sp('gallade', 'psychic', 'fighting'),
    },
    lines: { eevee: ['vaporeon'], ralts: ['kirlia', 'gardevoir'] },
    branches: {
      eevee: {
        at: 2,
        options: [
          { forms: ['flareon'], types: ['fire'] },
          { forms: ['glaceon'], types: ['ice'] },
        ],
      },
      ralts: { at: 3, options: [{ forms: ['gallade'], types: ['psychic', 'fighting'] }] },
    },
    moves: {
      ...quietConfig.moves,
      byBase: {
        eevee: ['tackle', 'water-gun', 'hydro-pump'],
        flareon: ['tackle', 'ember', 'flamethrower'],
      },
      types: {
        tackle: 'normal',
        'water-gun': 'water',
        'hydro-pump': 'water',
        ember: 'fire',
        flamethrower: 'fire',
      },
    },
    themes: {
      volcano: theme('volcano', ['fire', 2], ['ground', 1]),
      sea: theme('sea', ['water', 2], ['ice', 1]),
      dojo: theme('dojo', ['fighting', 3]),
      meadow: theme('meadow', ['grass', 2], ['bug', 1]),
    },
  };
}

/** A biome of the test: its types with their weights (the rest of a theme does not matter here). */
function theme(id: string, ...types: [GameType, number][]): ThemeDef {
  return {
    id,
    name: id,
    type: types[0]?.[0] ?? 'normal',
    types: types.map(([type, weight]) => ({ type, weight })),
    purity: 1,
  };
}

describe('the branch is chosen by the place', () => {
  const c = branchConfig();

  it('the type of the place picks the branch; the line of always when none fits', () => {
    expect(chooseBranch(c, 'eevee', ['fire', 'ground'])).toBe('flareon');
    expect(chooseBranch(c, 'eevee', ['ice'])).toBe('glaceon');
    expect(chooseBranch(c, 'eevee', ['grass', 'bug'])).toBe('vaporeon');
    expect(chooseBranch(c, 'eevee', [])).toBe('vaporeon');
    // The main type wins: water (the line of always) before ice.
    expect(chooseBranch(c, 'eevee', ['water', 'ice'])).toBe('vaporeon');
    // A line that does not split has no branch.
    expect(chooseBranch(c, 'charmander', ['fire'])).toBeUndefined();
  });

  it('a split at stage 3 (Ralts): Gallade in a dojo, Gardevoir elsewhere', () => {
    expect(chooseBranch(c, 'ralts', ['fighting'])).toBe('gallade');
    expect(chooseBranch(c, 'ralts', ['fairy'])).toBe('gardevoir');
    expect(formAt(c, 'ralts', 2, 'gallade')).toBe('kirlia'); // before the split, the shared form
    expect(formAt(c, 'ralts', 3, 'gallade')).toBe('gallade');
    expect(formAt(c, 'ralts', 3)).toBe('gardevoir');
  });

  it('the forms of a branch, and the line of always without one', () => {
    expect(formAt(c, 'eevee', 1, 'flareon')).toBe('eevee');
    expect(formAt(c, 'eevee', 2, 'flareon')).toBe('flareon');
    expect(formAt(c, 'eevee', 3, 'flareon')).toBe('flareon');
    expect(formAt(c, 'eevee', 2)).toBe('vaporeon');
    expect(formAt(c, 'eevee', 2, 'nobody')).toBe('vaporeon');
  });
});

describe('a Pokémon of the team takes its branch once, where it evolves', () => {
  function runAt(theme: string): ReturnType<typeof createRun> {
    const c = branchConfig();
    const run = createRun(c, 1, 'charmander');
    run.waveThemes = [theme];
    run.wave.index = 0;
    return run;
  }

  it('Eevee evolving in a volcano becomes Flareon: it shows, hits and casts as Flareon', () => {
    const c = branchConfig();
    const run = runAt('volcano');
    expect(placeTypes(run, c)).toEqual(['fire', 'ground']);
    const index = addMember(run, c, 'eevee', 1);
    const member = run.team[index];
    if (member === undefined) throw new Error('no member');
    expect(member.branch).toBeUndefined();
    // The card that levels it tells the truth before it happens.
    while (stageForLevel(c, member.level + 1, 'eevee') < 2) trainMember(run, c, index, 'card');
    expect(nextStep(c, member, placeTypes(run, c))?.to).toBe('flareon');
    trainMember(run, c, index, 'card');
    expect(member.branch).toBe('flareon');
    expect(formOfMember(c, member)).toBe('flareon');
    const balls = run.loadout.filter((b) => b.owner === index);
    expect(balls.every((b) => b.branch === 'flareon' && b.type === 'fire')).toBe(true);
    expect(attackTypeOf(c, 'eevee', 2, 'normal', 'flareon')).toBe('fire');
    expect(moveIdOf(c, 'eevee', 2, 'flareon')).toBe('ember');
    const stageEvent = run.events.find((e) => e.type === 'stage');
    expect(stageEvent?.type === 'stage' ? stageEvent.to : '').toBe('flareon');
  });

  it('once taken, the branch stays when the place changes', () => {
    const c = branchConfig();
    const run = runAt('volcano');
    const index = addMember(run, c, 'eevee', 1);
    const member = run.team[index];
    if (member === undefined) throw new Error('no member');
    while (member.branch === undefined) trainMember(run, c, index, 'card');
    run.waveThemes = ['sea'];
    trainMember(run, c, index, 'card');
    expect(member.branch).toBe('flareon');
    expect(formOfMember(c, member)).toBe('flareon');
  });

  it('elsewhere it keeps the line of always (and its moves)', () => {
    const c = branchConfig();
    const run = runAt('meadow');
    const index = addMember(run, c, 'eevee', 1);
    const member = run.team[index];
    if (member === undefined) throw new Error('no member');
    while (member.branch === undefined) trainMember(run, c, index, 'card');
    expect(formOfMember(c, member)).toBe('vaporeon');
    expect(moveIdOf(c, 'eevee', 2, member.branch)).toBe('water-gun');
  });

  it('you capture what you beat: a Vaporeon caught in a volcano joins as Vaporeon', () => {
    const c = branchConfig();
    const run = runAt('volcano');
    joinTeam(run, c, 'eevee', 2, 240, false);
    const member = run.team.find((m) => m.species === 'eevee');
    expect(member?.branch).toBe('vaporeon');
    expect(member === undefined ? '' : formOfMember(c, member)).toBe('vaporeon');
    // An Eevee caught as an Eevee will still choose by place when it evolves.
    const other = runAt('volcano');
    joinTeam(other, c, 'eevee', 1, 240, false);
    expect(other.team.find((m) => m.species === 'eevee')?.branch).toBeUndefined();
  });

  it('the same place always gives the same branch (deterministic)', () => {
    const forms = [1, 2, 3].map(() => {
      const c = branchConfig();
      const run = runAt('dojo');
      const index = addMember(run, c, 'ralts', 1);
      const member = run.team[index];
      if (member === undefined) throw new Error('no member');
      for (let k = 0; k < 10; k++) trainMember(run, c, index, 'card');
      return formOfMember(c, member);
    });
    expect(forms).toEqual(['gallade', 'gallade', 'gallade']);
  });
});
