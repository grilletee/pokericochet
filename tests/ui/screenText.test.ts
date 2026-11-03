import { describe, expect, it } from 'vitest';
import type { Ball, FuseFailure, GameEvent, RunSummary } from '../../src/domain';
import { fuse } from '../../src/domain';
import { describePreview } from '../../src/ui/fusionText';
import {
  describeBest,
  describeEvent,
  describeResults,
  formatTime,
  starterBlurb,
} from '../../src/ui/screenText';

const ball = (overrides: Partial<Ball>): Ball => ({
  id: 1,
  species: 'charmander',
  type: 'fire',
  level: 1,
  hybrid: false,
  effects: [{ kind: 'burn', strength: 2 }],
  ...overrides,
});

const water = (overrides: Partial<Ball> = {}): Ball =>
  ball({
    id: 2,
    species: 'squirtle',
    type: 'water',
    effects: [{ kind: 'pierce', strength: 1 }],
    ...overrides,
  });

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
  score: 0,
};

describe('fusion preview text', () => {
  it('says what an F1 gives', () => {
    const p = fuse(ball({ id: 1 }), ball({ id: 2 }));
    expect(describePreview(p)).toEqual({
      ok: true,
      text: 'Resultado: Charmander sube a nivel 2.',
    });
  });

  it('says what an F2 gives: type of the first, effects of both, level of the lower', () => {
    const p = fuse(ball({ level: 3 }), water({ level: 2 }));
    const text = describePreview(p);
    expect(text.ok).toBe(true);
    expect(text.text).toContain('Charmander híbrida, tipo Fuego, nivel 2');
    expect(text.text).toContain('Quemar 2 · Atravesar 0,5');
  });

  it('gives a reason in Spanish for every way a fusion can fail', () => {
    const errors: FuseFailure[] = [
      'same-ball',
      'hybrid-input',
      'max-level',
      'level-mismatch',
      'same-type-different-species',
      'level-too-low',
      'no-token',
      'bad-slot',
    ];
    const texts = errors.map((error) => describePreview({ ok: false, error }).text);
    for (const text of texts) expect(text.length).toBeGreaterThan(10);
    expect(new Set(texts).size).toBe(errors.length);
  });

  it('with no token it still shows the result and then the reason', () => {
    const p = describePreview({ ok: false, error: 'no-token', ball: ball({ level: 2 }) });
    expect(p.ok).toBe(false);
    expect(p.text.split('\n')).toHaveLength(2);
    expect(p.text).toContain('sube a nivel 2');
    expect(p.text).toContain('ficha');
  });
});

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
      { type: 'waveStart', index: 2 },
      { type: 'bossSpawn', enemyId: 9 },
      { type: 'bossSummon', count: 4 },
      { type: 'fuse', ballId: 1, level: 2, hybrid: false },
      { type: 'fuse', ballId: 1, level: 2, hybrid: true },
      { type: 'fuseFailed', error: 'no-token' },
      { type: 'launch', ballId: 1 },
      { type: 'won' },
    ];
    const texts = events.map(describeEvent);
    expect(texts[0]).toBe('Oleada 3');
    expect(texts[1]).toContain('jefe');
    expect(texts[2]).toContain('4');
    expect(texts[3]).toContain('nivel 2');
    expect(texts[4]).toContain('híbrida');
    expect(texts[5]).toContain('ficha');
    expect(texts[6]).toBeNull();
    expect(texts[7]).toBeNull();
  });
});
