import { describe, expect, it } from 'vitest';
import {
  buildRoster,
  type ChainNode,
  namesNeedingStats,
  parseChain,
  parseSpeciesInfo,
  parseVia,
  type RosterRules,
  type SpeciesInfo,
} from '../../tools/fetch-data/rosterRules';
import {
  ALL_TYPES,
  buildTypeChart,
  parseTypeRow,
  type TypeId,
} from '../../tools/fetch-data/typechart';

const RULES: RosterRules = {
  maxPokedexId: 493,
  excludeLegendary: true,
  excludeMythical: true,
  excludeBabies: true,
};

function info(over: Partial<SpeciesInfo> & { name: string; id: number }): SpeciesInfo {
  return {
    pokemon: over.name,
    legendary: false,
    mythical: false,
    baby: false,
    chainId: over.id,
    ...over,
  };
}
const node = (name: string, ...children: ChainNode[]): ChainNode => ({ name, children });
const world = (...list: SpeciesInfo[]): Map<string, SpeciesInfo> =>
  new Map(list.map((s) => [s.name, s]));

describe('the roster rule (ADR-048)', () => {
  it('turns a chain into a line: the base and the forms after it', () => {
    const species = world(
      info({ name: 'charmander', id: 4 }),
      info({ name: 'charmeleon', id: 5 }),
      info({ name: 'charizard', id: 6 }),
    );
    const built = buildRoster(
      RULES,
      [node('charmander', node('charmeleon', node('charizard')))],
      species,
      () => 0,
    );
    expect(built.lines).toEqual({ charmander: ['charmeleon', 'charizard'] });
    expect(built.counts).toMatchObject({ lines: 1, forms: 3 });
  });

  it('keeps the branch with the higher stat total and lists the ones it left', () => {
    const species = world(
      info({ name: 'eevee', id: 133 }),
      info({ name: 'vaporeon', id: 134 }),
      info({ name: 'jolteon', id: 135 }),
      info({ name: 'flareon', id: 136 }),
    );
    const totals: Record<string, number> = { vaporeon: 525, jolteon: 525, flareon: 525 };
    const tree = node('eevee', node('vaporeon'), node('jolteon'), node('flareon'));
    const built = buildRoster(RULES, [tree], species, (n) => totals[n] ?? 0);
    // A three-way tie goes to the lower Pokédex number.
    expect(built.lines).toEqual({ eevee: ['vaporeon'] });
    expect(built.discardedBranches).toEqual([
      { from: 'eevee', kept: 'vaporeon', dropped: ['jolteon', 'flareon'] },
    ]);
    const stronger = buildRoster(RULES, [tree], species, (n) => (n === 'flareon' ? 600 : 500));
    expect(stronger.lines).toEqual({ eevee: ['flareon'] });
  });

  it('asks for stats only where the evolution splits', () => {
    const tree = node('eevee', node('vaporeon'), node('jolteon', node('x')));
    expect(namesNeedingStats(tree).sort()).toEqual(['jolteon', 'vaporeon']);
    expect(namesNeedingStats(node('a', node('b', node('c'))))).toEqual([]);
  });

  it('leaves out legendaries and mythicals (they are for the bosses), counting them', () => {
    const species = world(
      info({ name: 'moltres', id: 146, legendary: true }),
      info({ name: 'mew', id: 151, mythical: true }),
      info({ name: 'rattata', id: 19 }),
    );
    const built = buildRoster(
      RULES,
      [node('moltres'), node('mew'), node('rattata')],
      species,
      () => 0,
    );
    expect(Object.keys(built.lines)).toEqual(['rattata']);
    expect(built.counts.legendary).toBe(2);
  });

  it('leaves out the curated exclusions with what comes after them (4G-J: Ultra Beasts, regional-only forms)', () => {
    const species = world(
      info({ name: 'poipole', id: 803 }),
      info({ name: 'naganadel', id: 804 }),
      info({ name: 'meowth', id: 52 }),
      info({ name: 'persian', id: 53 }),
      info({ name: 'perrserker', id: 863 }),
      info({ name: 'farfetchd', id: 83 }),
      info({ name: 'sirfetchd', id: 865 }),
    );
    const rules: RosterRules = {
      ...RULES,
      maxPokedexId: 1025,
      exclude: ['poipole', 'perrserker', 'sirfetchd'],
    };
    const built = buildRoster(
      rules,
      [
        node('poipole', node('naganadel')),
        node('meowth', node('persian'), node('perrserker')),
        node('farfetchd', node('sirfetchd')),
      ],
      species,
      () => 400,
    );
    expect(built.lines).toEqual({ meowth: ['persian'], farfetchd: [] });
    // Excluded children are not a split: nothing is listed as a dropped branch.
    expect(built.discardedBranches).toEqual([]);
    expect(built.counts.excluded).toBe(3);
  });

  it('starts a line after a baby form (Pichu is not a base; Pikachu is)', () => {
    const species = world(
      info({ name: 'pichu', id: 172, baby: true }),
      info({ name: 'pikachu', id: 25 }),
      info({ name: 'raichu', id: 26 }),
    );
    const built = buildRoster(
      RULES,
      [node('pichu', node('pikachu', node('raichu')))],
      species,
      () => 0,
    );
    expect(built.lines).toEqual({ pikachu: ['raichu'] });
    expect(built.counts.babies).toBe(1);
  });

  it('makes a line of each child of a baby that splits (Tyrogue)', () => {
    const species = world(
      info({ name: 'tyrogue', id: 236, baby: true }),
      info({ name: 'hitmonlee', id: 106 }),
      info({ name: 'hitmonchan', id: 107 }),
      info({ name: 'hitmontop', id: 237 }),
    );
    const built = buildRoster(
      RULES,
      [node('tyrogue', node('hitmonlee'), node('hitmonchan'), node('hitmontop'))],
      species,
      () => 0,
    );
    expect(Object.keys(built.lines)).toEqual(['hitmonlee', 'hitmonchan', 'hitmontop']);
    expect(built.discardedBranches).toEqual([]);
  });

  it('cuts the line where the next form is beyond the generations of the roster', () => {
    const species = world(
      info({ name: 'eevee', id: 133 }),
      info({ name: 'umbreon', id: 197 }),
      info({ name: 'sylveon', id: 700 }),
      info({ name: 'scyther', id: 123 }),
      info({ name: 'scizor', id: 212 }),
      info({ name: 'kleavor', id: 900 }),
    );
    const eevee = buildRoster(
      RULES,
      [node('eevee', node('umbreon'), node('sylveon'))],
      species,
      (n) => (n === 'sylveon' ? 900 : 500),
    );
    expect(eevee.lines).toEqual({ eevee: ['umbreon'] }); // Sylveon is out of range, so no split
    expect(eevee.discardedBranches).toEqual([]);
    expect(eevee.counts.outOfRange).toBe(1);
    const scyther = buildRoster(
      RULES,
      [node('scyther', node('scizor', node('kleavor')))],
      species,
      () => 0,
    );
    expect(scyther.lines).toEqual({ scyther: ['scizor'] });
  });

  it('includes the last species of the range and leaves out the next one', () => {
    const species = world(info({ name: 'last', id: 493 }), info({ name: 'past', id: 494 }));
    const built = buildRoster(RULES, [node('last'), node('past')], species, () => 0);
    expect(Object.keys(built.lines)).toEqual(['last']);
  });

  it('uses the id of the default form (Wormadam is "wormadam-plant" for PokéAPI)', () => {
    const species = world(
      info({ name: 'burmy', id: 412 }),
      info({ name: 'wormadam', id: 413, pokemon: 'wormadam-plant' }),
    );
    const built = buildRoster(RULES, [node('burmy', node('wormadam'))], species, () => 0);
    expect(built.lines).toEqual({ burmy: ['wormadam-plant'] });
  });

  it('never makes a line longer than three forms and lists lines in Pokédex order', () => {
    const species = world(
      info({ name: 'b', id: 20 }),
      info({ name: 'a', id: 10 }),
      info({ name: 'a2', id: 11 }),
      info({ name: 'a3', id: 12 }),
      info({ name: 'a4', id: 13 }),
    );
    const built = buildRoster(
      RULES,
      [node('b'), node('a', node('a2', node('a3', node('a4'))))],
      species,
      () => 0,
    );
    expect(Object.keys(built.lines)).toEqual(['a', 'b']);
    expect(built.lines.a).toEqual(['a2', 'a3']);
  });

  it('reads a species and a chain out of the PokéAPI responses', () => {
    const species = parseSpeciesInfo({
      id: 413,
      name: 'wormadam',
      is_legendary: false,
      is_mythical: false,
      is_baby: false,
      evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/213/' },
      varieties: [
        { is_default: true, pokemon: { name: 'wormadam-plant' } },
        { is_default: false, pokemon: { name: 'wormadam-sandy' } },
      ],
    });
    expect(species).toMatchObject({ id: 413, pokemon: 'wormadam-plant', chainId: 213 });
    const chain = parseChain({
      id: 213,
      chain: {
        species: { name: 'burmy' },
        evolves_to: [{ species: { name: 'wormadam' }, evolves_to: [] }],
      },
    });
    expect(chain.id).toBe(213);
    expect(chain.root).toEqual({ name: 'burmy', children: [{ name: 'wormadam', children: [] }] });
    expect(() => parseSpeciesInfo({ id: 1 })).toThrow(/no id or name/);
    expect(() => parseChain({ id: 1, chain: {} })).toThrow(/without a species/);
  });

  it('reads how each form is reached: its level, a stone, a trade, friendship (4W)', () => {
    const detail = (extra: Record<string, unknown>) => ({
      trigger: { name: 'level-up' },
      min_level: null,
      ...extra,
    });
    const chain = parseChain({
      id: 9,
      chain: {
        species: { name: 'zubat' },
        evolution_details: [],
        evolves_to: [
          {
            species: { name: 'golbat' },
            // Several version groups: the one that names a level wins.
            evolution_details: [detail({ min_level: null }), detail({ min_level: 22 })],
            evolves_to: [
              {
                species: { name: 'crobat' },
                evolution_details: [detail({ min_happiness: 160 })],
                evolves_to: [],
              },
            ],
          },
        ],
      },
    });
    const golbat = chain.root.children[0];
    expect(chain.root.via).toBeUndefined();
    expect(golbat?.via).toEqual({ level: 22, trigger: 'level-up' });
    expect(golbat?.children[0]?.via).toEqual({ level: null, trigger: 'friendship' });
    expect(
      parseVia({ evolution_details: [{ trigger: { name: 'use-item' }, min_level: null }] }),
    ).toEqual({ level: null, trigger: 'use-item' });
    expect(parseVia({ evolution_details: [{ min_level: 30 }] })).toEqual({
      level: 30,
      trigger: 'other',
    });
  });

  it('the roster keeps how each form of a line is reached, in the order of the line (4W)', () => {
    const lvl = (n: number) => ({ level: n, trigger: 'level-up' });
    const tree: ChainNode = {
      name: 'bagon',
      children: [
        {
          name: 'shelgon',
          via: lvl(30),
          children: [{ name: 'salamence', via: lvl(50), children: [] }],
        },
      ],
    };
    const info = (id: number, name: string) => ({
      id,
      name,
      pokemon: name,
      legendary: false,
      mythical: false,
      baby: false,
      chainId: 1,
    });
    const species = new Map(
      [info(371, 'bagon'), info(372, 'shelgon'), info(373, 'salamence')].map((s) => [s.name, s]),
    );
    const rules: RosterRules = {
      maxPokedexId: 1025,
      excludeLegendary: true,
      excludeMythical: true,
      excludeBabies: true,
    };
    const built = buildRoster(rules, [tree], species, () => 0);
    expect(built.lines.bagon).toEqual(['shelgon', 'salamence']);
    expect(built.evolution.bagon).toEqual([lvl(30), lvl(50)]);
  });
});

describe('the type chart as data (ADR-047)', () => {
  const relations = (double: string[], half: string[], none: string[]) => ({
    damage_relations: {
      double_damage_to: double.map((name) => ({ name })),
      half_damage_to: half.map((name) => ({ name })),
      no_damage_to: none.map((name) => ({ name })),
    },
  });

  it('has the 18 types of the games, and none of the others', () => {
    expect(ALL_TYPES).toHaveLength(18);
    expect(new Set(ALL_TYPES).size).toBe(18);
    for (const other of ['stellar', 'unknown', 'shadow']) {
      expect(ALL_TYPES).not.toContain(other as TypeId);
    }
  });

  it('reads a row: 2, 0.5, 0 and neutral for the rest', () => {
    const row = parseTypeRow(
      'electric',
      relations(['water', 'flying'], ['grass', 'electric', 'dragon'], ['ground']),
    );
    expect(row.water).toBe(2);
    expect(row.flying).toBe(2);
    expect(row.grass).toBe(0.5);
    expect(row.ground).toBe(0);
    expect(row.fire).toBe(1);
    expect(Object.keys(row)).toHaveLength(18);
  });

  it('refuses a type outside the 18 and a type in two lists, naming it', () => {
    expect(() => parseTypeRow('fire', relations(['stellar'], [], []))).toThrow(/"stellar"/);
    expect(() => parseTypeRow('fire', relations(['grass'], ['grass'], []))).toThrow(/two lists/);
    expect(() => parseTypeRow('fire', {})).toThrow(/damage_relations/);
  });

  it('builds the whole chart, one response per type, and fails if one is missing', () => {
    const responses = Object.fromEntries(ALL_TYPES.map((t) => [t, relations([], [], [])]));
    const built = buildTypeChart(responses);
    expect(built.types).toEqual(ALL_TYPES);
    expect(built.chart.fire.water).toBe(1);
    const { fairy: _missing, ...partial } = responses;
    expect(() => buildTypeChart(partial)).toThrow(/"fairy"/);
  });
});
