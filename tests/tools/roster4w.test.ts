import { describe, expect, it } from 'vitest';
import { generationOf } from '../../src/data/config/gacha';
import { parsePokemon, regionalName, validateRoster } from '../../tools/fetch-data/parse';
import {
  buildRoster,
  type ChainNode,
  type RosterRules,
  type SpeciesInfo,
  speciesNameOf,
} from '../../tools/fetch-data/rosterRules';

/** 4W, block 7 (18th playtest: "más Pokémon"): branches and regional forms in the roster tool. */
const RULES: RosterRules = {
  maxPokedexId: 1025,
  excludeLegendary: true,
  excludeMythical: true,
  excludeBabies: true,
};

function info(name: string, id: number): SpeciesInfo {
  return { id, name, pokemon: name, legendary: false, mythical: false, baby: false, chainId: id };
}
const node = (name: string, ...children: ChainNode[]): ChainNode => ({ name, children });
const world = (...list: SpeciesInfo[]): Map<string, SpeciesInfo> =>
  new Map(list.map((s) => [s.name, s]));

describe('the branches of a split line are kept', () => {
  it('Eevee: the line of always plus the others, each with its forms from the split on', () => {
    const species = world(
      info('eevee', 133),
      info('vaporeon', 134),
      info('jolteon', 135),
      info('flareon', 136),
    );
    const built = buildRoster(
      RULES,
      [node('eevee', node('vaporeon'), node('jolteon'), node('flareon'))],
      species,
      (n) => (n === 'vaporeon' ? 525 : 500),
    );
    expect(built.lines.eevee).toEqual(['vaporeon']);
    expect(built.branches.eevee).toEqual({ at: 2, options: [['jolteon'], ['flareon']] });
  });

  it('Ralts splits at stage 3; Applin goes on after the split (Dipplin -> Hydrapple)', () => {
    const species = world(
      info('ralts', 280),
      info('kirlia', 281),
      info('gardevoir', 282),
      info('gallade', 475),
      info('applin', 840),
      info('flapple', 841),
      info('dipplin', 1011),
      info('hydrapple', 1019),
    );
    const built = buildRoster(
      RULES,
      [
        node('ralts', node('kirlia', node('gardevoir'), node('gallade'))),
        node('applin', node('flapple'), node('dipplin', node('hydrapple'))),
      ],
      species,
      (n) => (n === 'gardevoir' || n === 'flapple' ? 600 : 500),
    );
    expect(built.branches.ralts).toEqual({ at: 3, options: [['gallade']] });
    expect(built.branches.applin).toEqual({ at: 2, options: [['dipplin', 'hydrapple']] });
  });
});

describe('regional lines', () => {
  it('come in as lines of their own, with the pace of the species they are a form of', () => {
    const vulpix = node('vulpix', {
      name: 'ninetales',
      children: [],
      via: { level: null, trigger: 'use-item' },
    });
    const built = buildRoster(
      { ...RULES, regional: { 'vulpix-alola': ['ninetales-alola'] } },
      [vulpix],
      world(info('vulpix', 37), info('ninetales', 38)),
      () => 0,
    );
    expect(built.lines['vulpix-alola']).toEqual(['ninetales-alola']);
    expect(built.evolution['vulpix-alola']).toEqual([{ level: null, trigger: 'use-item' }]);
    // Right after the line of its species.
    expect(Object.keys(built.lines)).toEqual(['vulpix', 'vulpix-alola']);
  });

  it('a regional id names its species; the name says its region', () => {
    expect(speciesNameOf('ninetales-alola')).toBe('ninetales');
    expect(speciesNameOf('darmanitan-galar-standard')).toBe('darmanitan');
    expect(speciesNameOf('obstagoon')).toBe('obstagoon');
    expect(speciesNameOf('deoxys-normal')).toBe('deoxys-normal');
    expect(regionalName('vulpix-alola', 'Vulpix')).toBe('Vulpix de Alola');
    expect(regionalName('growlithe-hisui', 'Growlithe')).toBe('Growlithe de Hisui');
    expect(regionalName('mr-mime', 'Mr. Mime')).toBe('Mr. Mime');
  });

  it('counts in the region of its form in the Pokédex', () => {
    expect(generationOf(37, 'vulpix-alola')).toBe(7);
    expect(generationOf(77, 'ponyta-galar')).toBe(8);
    expect(generationOf(58, 'growlithe-hisui')).toBe(8);
    expect(generationOf(194, 'wooper-paldea')).toBe(9);
    expect(generationOf(37, 'vulpix')).toBe(1);
    expect(generationOf(37)).toBe(1);
  });

  it('its national number is the one of its species, not its own id', () => {
    const raw = {
      id: 10103,
      species: { name: 'vulpix', url: 'https://pokeapi.co/api/v2/pokemon-species/37/' },
      types: [{ slot: 1, type: { name: 'ice' } }],
      stats: ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'].map(
        (name) => ({ base_stat: 50, stat: { name } }),
      ),
      sprites: { front_default: 'https://example.invalid/10103.png' },
      moves: [],
    };
    expect(parsePokemon('vulpix-alola', raw).species.pokedexId).toBe(37);
  });
});

describe('the roster checks the branches', () => {
  const roster = {
    balls: ['eevee'],
    enemies: ['eevee'],
    boss: 'lugia',
    legendaries: [],
    starters: [],
    lines: { eevee: ['vaporeon'] },
  };

  it('accepts a good branch and refuses a bad one', () => {
    expect(() =>
      validateRoster({ ...roster, branches: { eevee: { at: 2, options: [['flareon']] } } }),
    ).not.toThrow();
    expect(() =>
      validateRoster({ ...roster, branches: { eevee: { at: 4, options: [['flareon']] } } }),
    ).toThrow();
    expect(() =>
      validateRoster({ ...roster, branches: { eevee: { at: 2, options: [['vaporeon']] } } }),
    ).toThrow();
    expect(() =>
      validateRoster({ ...roster, branches: { pikachu: { at: 2, options: [['raichu']] } } }),
    ).toThrow();
  });
});
