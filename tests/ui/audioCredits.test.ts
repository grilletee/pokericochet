import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/domain';
import { soundFor, Throttle } from '../../src/ui/audio';
import { creditLines, disclaimerShort, POKEAPI_URL, SPRITES_URL } from '../../src/ui/creditsText';

describe('sound: which event makes which sound', () => {
  const events: Array<[GameEvent, string | null]> = [
    [{ type: 'hit', ballId: 1, enemyId: 1, damage: 1, effectiveness: 1, x: 0, y: 0 }, 'bounce'],
    [{ type: 'kill', enemyId: 1, x: 0, y: 0 }, 'kill'],
    [{ type: 'bossCore', open: true, warning: false }, 'vulnerable'],
    [{ type: 'bossCore', open: false, warning: true }, null],
    [
      { type: 'bossSpawn', enemyId: 1, species: 'kyogre', number: 4, interludes: 3, final: true },
      'tension',
    ],
    [
      { type: 'bossSpawn', enemyId: 1, species: 'abra', number: 1, interludes: 3, final: false },
      null,
    ],
    [{ type: 'evolve', ballId: 1, species: 'charmander', level: 2 }, 'evolve'],
    [
      {
        type: 'stage',
        ballId: 1,
        member: 0,
        species: 'charmander',
        kind: 'evolve',
        stage: 2,
        from: 'charmander',
        to: 'charmeleon',
      },
      'evolve',
    ],
    [
      {
        type: 'move',
        member: 0,
        species: 'charmander',
        starter: true,
        manual: false,
        signature: false,
        move: 'ember',
        tier: 1,
        element: 'fire',
        shape: 'burst',
        size: 56,
        x: 10,
        y: 20,
        hits: 2,
        damage: 12,
      },
      'move',
    ],
    [
      {
        type: 'move',
        member: 0,
        species: 'charmander',
        starter: true,
        manual: true,
        signature: true,
        move: 'flamethrower',
        tier: 2,
        element: 'fire',
        shape: 'cross',
        size: 36,
        x: 10,
        y: 20,
        hits: 3,
        damage: 40,
      },
      'signature',
    ],
    [
      { type: 'hybrid', ballId: 1, species: 'charmander', withSpecies: 'squirtle', level: 2 },
      'hybrid',
    ],
    [
      { type: 'captureDrop', level: 1, species: 'psyduck', form: 'psyduck', x: 10, y: 50 },
      'captureDrop',
    ],
    [{ type: 'leak', enemyId: 1, damage: 1 }, 'damage'],
    [{ type: 'won' }, 'win'],
    [{ type: 'lost' }, 'lose'],
    [{ type: 'collect', ballId: 1, x: 10, late: false }, 'collect'],
    [
      {
        type: 'capture',
        level: 1,
        ballId: 2,
        species: 'psyduck',
        form: 'psyduck',
        x: 10,
        late: false,
      },
      'capture',
    ],
    [{ type: 'drop', ballId: 1, x: 10 }, null],
    [{ type: 'launch', ballId: 1 }, null],
    [{ type: 'spawn', enemyId: 1 }, null],
    [{ type: 'waveStart', index: 1, theme: '' }, null],
  ];
  it.each(events)('%j -> %s', (event, expected) => {
    expect(soundFor(event)).toBe(expected);
  });
});

describe('sound: throttle', () => {
  it('lets the first sound through and spaces the same kind', () => {
    const t = new Throttle();
    expect(t.allow('bounce', 1000)).toBe(true);
    expect(t.allow('bounce', 1020)).toBe(false);
    expect(t.allow('bounce', 1044)).toBe(false);
    expect(t.allow('bounce', 1045)).toBe(true);
  });

  it('a rejected sound does not push the window forward', () => {
    const t = new Throttle();
    t.allow('kill', 0);
    t.allow('kill', 60); // rejected (gap 70)
    expect(t.allow('kill', 70)).toBe(true);
  });

  it('keeps each kind apart, and never limits the rare ones', () => {
    const t = new Throttle();
    expect(t.allow('bounce', 0)).toBe(true);
    expect(t.allow('kill', 1)).toBe(true);
    expect(t.allow('evolve', 2)).toBe(true);
    expect(t.allow('evolve', 2)).toBe(true);
    expect(t.allow('lose', 3)).toBe(true);
    expect(t.allow('capture', 4)).toBe(true);
    expect(t.allow('capture', 4)).toBe(true);
  });

  it('spaces the pickup pop, which can come in bursts', () => {
    const t = new Throttle();
    expect(t.allow('collect', 0)).toBe(true);
    expect(t.allow('collect', 59)).toBe(false);
    expect(t.allow('collect', 60)).toBe(true);
  });
});

describe('credits and affiliation notice', () => {
  const lines = creditLines('Title');
  const all = lines.map((l) => l.text).join('\n');

  it('says it is a free, non-profit fan project not affiliated with the rights holders', () => {
    expect(all).toContain('Title es un juego de fans, gratuito');
    expect(all).toContain('sin ánimo de lucro');
    for (const owner of ['Nintendo', 'Game Freak', 'Creatures', 'The Pokémon Company']) {
      expect(all).toContain(owner);
    }
    expect(all).toContain('marcas de sus respectivos propietarios');
  });

  it('credits PokéAPI for the data and PokeAPI/sprites for the images, with links', () => {
    const urls = lines.flatMap((l) => (l.url === undefined ? [] : [l.url]));
    expect(urls).toContain(POKEAPI_URL);
    expect(urls).toContain(SPRITES_URL);
    expect(all).toMatch(/PokéAPI/);
    expect(all).toMatch(/PokeAPI\/sprites/);
    expect(all).toMatch(/PixiJS/);
  });

  it('has a short notice for the title screen that names the title and the disclaimer', () => {
    const short = disclaimerShort('Title');
    expect(short).toContain('Title');
    expect(short).toContain('No está afiliado');
    expect(short).toContain('The Pokémon Company');
  });
});
