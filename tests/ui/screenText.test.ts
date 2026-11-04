import { describe, expect, it } from 'vitest';
import type { GameEvent, RunSummary } from '../../src/domain';
import {
  describeBest,
  describeEvent,
  describeResults,
  formatTime,
  starterBlurb,
} from '../../src/ui/screenText';

const summary: RunSummary = {
  seed: 4242,
  starter: 'squirtle',
  result: 'lost',
  wavesCleared: 5,
  wavesTotal: 7,
  bossReached: false,
  kills: 130,
  level: 9,
  ticks: 60 * 60 * 6 + 60 * 5,
  balls: [
    { species: 'squirtle', level: 2, hybrid: false },
    { species: 'charmander', level: 2, hybrid: true },
  ],
  bossesDefeated: 0,
  captured: [],
  score: 0,
};

describe('results and title text', () => {
  it('formats time as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(59 * 60 + 59)).toBe('0:59');
    expect(formatTime(60 * 60 * 7 + 60 * 5)).toBe('7:05');
  });

  it('describes a defeat with its numbers, seed and team', () => {
    const text = describeResults(summary, null, false);
    expect(text.title).toBe('Derrota');
    const all = text.lines.join('\n');
    expect(all).toContain('Oleadas superadas: 5/7');
    expect(all).toContain('Bajas: 130');
    expect(all).toContain('Nivel 9');
    expect(all).toContain('Tiempo 6:05');
    expect(all).toContain('Squirtle Nv2, Charmander Nv2 (híbrida)');
    expect(all).toContain('Semilla: 4242');
    expect(all).toContain('Aún no hay');
  });

  it('describes reaching the boss and winning differently', () => {
    expect(describeResults({ ...summary, bossReached: true }, null, false).lines[0]).toContain(
      'Llegaste al jefe',
    );
    const won = describeResults({ ...summary, result: 'won', bossReached: true }, null, true);
    expect(won.title).toBe('¡Victoria!');
    expect(won.lines[0]).toBe('Derrotaste al jefe.');
    expect(won.lines.join('\n')).toContain('Nueva mejor partida');
  });

  it('shows the best run, for a win and for a defeat', () => {
    const base = {
      wavesCleared: 4,
      wavesTotal: 7,
      kills: 99,
      ticks: 3600,
      seed: 5,
      starter: 'pikachu',
    };
    expect(describeBest({ ...base, result: 'lost' })).toBe(
      'Mejor partida: 4/7 oleadas, 99 bajas · Pikachu · semilla 5',
    );
    expect(describeBest({ ...base, result: 'won' })).toContain('Victoria en 1:00');
    expect(describeBest(null)).toContain('Aún no');
  });

  it('describes each starter type by its effect', () => {
    expect(starterBlurb('fire')).toContain('Quema');
    expect(starterBlurb('water')).toContain('Atraviesa');
    expect(starterBlurb('grass')).toContain('Drena');
    expect(starterBlurb('electric')).toContain('Encadena');
  });

  it('turns the events that matter into messages and ignores the rest', () => {
    const events: GameEvent[] = [
      { type: 'waveStart', index: 2, theme: '' },
      { type: 'bossSpawn', enemyId: 9 },
      { type: 'bossSummon', count: 4 },
      { type: 'evolve', ballId: 1, species: 'charmander', level: 2 },
      { type: 'hybrid', ballId: 1, species: 'charmander', withSpecies: 'squirtle', level: 2 },
      { type: 'captureDrop', level: 1, species: 'growlithe', x: 1, y: 2 },
      { type: 'launch', ballId: 1 },
      { type: 'won' },
      { type: 'capture', level: 1, ballId: 5, species: 'psyduck', x: 1, late: false },
      { type: 'capture', level: 1, ballId: 0, species: 'psyduck', x: 1, late: false },
      { type: 'collect', ballId: 1, x: 1, late: false },
    ];
    const formName = (species: string, level: number) =>
      level >= 2 ? 'Charmeleon' : species.charAt(0).toUpperCase() + species.slice(1);
    const texts = events.map((event) => describeEvent(event, formName));
    expect(texts[0]).toBe('Oleada 3');
    expect(texts[1]).toContain('jefe');
    expect(texts[2]).toContain('4');
    expect(texts[3]).toBe('¡Charmander evoluciona a Charmeleon!');
    expect(texts[4]).toBe('¡Híbrida! Charmander + Squirtle');
    expect(texts[5]).toBe('¡Growlithe soltó una bola! Recógela');
    expect(texts[6]).toBeNull();
    expect(texts[7]).toBeNull();
    expect(texts[8]).toContain('Capturado');
    expect(texts[8]).toContain('Psyduck');
    expect(texts[9]).toContain('daño');
    expect(texts[10]).toBeNull(); // picking a ball up is silent text: it happens all the time
  });

  it('names the form of a dropped or captured evolved enemy, and the boss that fell', () => {
    const formName = (species: string, level: number) => `${species}@${level}`;
    expect(
      describeEvent({ type: 'captureDrop', level: 2, species: 'growlithe', x: 1, y: 2 }, formName),
    ).toBe('¡growlithe@2 soltó una bola! Recógela');
    expect(
      describeEvent(
        { type: 'capture', level: 3, ballId: 4, species: 'growlithe', x: 1, late: false },
        formName,
      ),
    ).toBe('¡Capturado: growlithe@3!');
    expect(describeEvent({ type: 'bossDefeated', species: 'rapidash', index: 1 })).toBe(
      '¡Jefe derrotado: Rapidash!',
    );
  });

  it('adds the theme to the wave announcement when there is one', () => {
    const label = (id: string) => (id === 'pack' ? 'Manada (Fuego)' : null);
    expect(describeEvent({ type: 'waveStart', index: 0, theme: 'pack' }, undefined, label)).toBe(
      'Oleada 1: Manada (Fuego)',
    );
    expect(describeEvent({ type: 'waveStart', index: 0, theme: 'nope' }, undefined, label)).toBe(
      'Oleada 1',
    );
    expect(describeEvent({ type: 'waveStart', index: 0, theme: '' }, undefined, label)).toBe(
      'Oleada 1',
    );
  });
});
