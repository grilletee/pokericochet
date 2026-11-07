import { beforeAll, describe, expect, it } from 'vitest';
import { gameConfig, MOVE_NAMES, POKEMON_NAMES } from '../../src/data';
import {
  addMember,
  createRun,
  type GameEvent,
  type RunSummary,
  summarizeRun,
  trainMember,
} from '../../src/domain';
import { setNames } from '../../src/ui';
import {
  bossLabel,
  describeBest,
  describeEvent,
  describeResults,
  formatTime,
  stageText,
  starterBlurb,
} from '../../src/ui/screenText';

beforeAll(() => setNames(POKEMON_NAMES, MOVE_NAMES));

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
  team: [
    { species: 'squirtle', form: 'squirtle', level: 2, stage: 1 },
    { species: 'charmander', form: 'charizard', level: 7, stage: 3 },
  ],
  bossesDefeated: 3,
  bossesTotal: 4,
  waveReached: 7,
  captured: [],
  score: 0,
};

describe('results and title text', () => {
  it('formats time as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(59 * 60 + 59)).toBe('0:59');
    expect(formatTime(60 * 60 * 7 + 60 * 5)).toBe('7:05');
  });

  it('describes a defeat with its numbers, seed and the team by its CURRENT forms', () => {
    const text = describeResults(summary, null, false);
    expect(text.title).toBe('Derrota');
    const all = text.lines.join('\n');
    // 6th playtest: the HUD said "Oleada 7/7", the final screen "superadas 6/7". Now both say 7.
    expect(all).toContain('Llegaste a la oleada 7/7');
    expect(all).toContain('Derrotaste a 3 de 4 jefes');
    expect(all).not.toContain('superadas');
    expect(all).toContain('Bajas: 130');
    expect(all).toContain('Nivel 9');
    expect(all).toContain('Tiempo 6:05');
    // The final screen showed "Charmander Nv8" for a Charizard (5th playtest): now the form.
    expect(all).toContain('Squirtle Nv2, Charizard Nv7');
    expect(all).not.toContain('Charmander');
    expect(all).toContain('Semilla: 4242');
    expect(all).toContain('Aún no hay');
  });

  it('the summary of a real run names the form of every Pokémon of the team at the end', () => {
    const run = createRun(gameConfig, 3, 'charmander');
    addMember(run, gameConfig, 'exeggcute', 1);
    for (let i = 0; i < 7; i++) trainMember(run, gameConfig, 0, 'card');
    for (let i = 0; i < 7; i++) trainMember(run, gameConfig, 1, 'card');
    const lines = describeResults(summarizeRun(run, gameConfig), null, false).lines.join('\n');
    expect(lines).toContain('Charizard Nv8, Exeggutor Nv8');
  });

  it('describes a defeat and a win differently, and counts the bosses', () => {
    expect(
      describeResults({ ...summary, waveReached: 2, bossesDefeated: 0 }, null, false).lines,
    ).toEqual(expect.arrayContaining(['Llegaste a la oleada 2/7.', 'Derrotaste a 0 de 4 jefes.']));
    const won = describeResults(
      { ...summary, result: 'won', bossReached: true, bossesDefeated: 4 },
      null,
      true,
    );
    expect(won.title).toBe('¡Victoria!');
    expect(won.lines[0]).toBe('¡Derrotaste al jefe final!');
    expect(won.lines[1]).toBe('Derrotaste a 4 de 4 jefes.');
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
      { type: 'bossSpawn', enemyId: 9, species: 'kingdra', number: 3, interludes: 3, final: false },
      { type: 'bossSummon', count: 4 },
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
      { type: 'hybrid', ballId: 1, species: 'charmander', withSpecies: 'squirtle', level: 2 },
      { type: 'captureDrop', level: 1, species: 'growlithe', form: 'growlithe', x: 1, y: 2 },
      { type: 'launch', ballId: 1 },
      { type: 'won' },
      {
        type: 'capture',
        level: 1,
        ballId: 5,
        species: 'psyduck',
        form: 'psyduck',
        x: 1,
        late: false,
      },
      {
        type: 'train',
        member: 1,
        species: 'squirtle',
        level: 6,
        form: 'blastoise',
        source: 'card',
      },
      {
        type: 'replaced',
        slot: 2,
        out: 'vulpix',
        species: 'psyduck',
        outForm: 'ninetales',
        form: 'psyduck',
      },
      { type: 'release', species: 'psyduck', form: 'psyduck' },
      { type: 'replaceOpen', species: 'psyduck', stage: 1, form: 'psyduck' },
      { type: 'collect', ballId: 1, x: 1, late: false },
    ];
    const texts = events.map((event) => describeEvent(event));
    expect(texts[0]).toBe('Oleada 3');
    expect(texts[1]).toBe('¡Jefe 3/3: Kingdra!');
    expect([1, 2, 3].map((n) => bossLabel(n, 3, false))).toEqual([
      'Jefe 1/3',
      'Jefe 2/3',
      'Jefe 3/3',
    ]);
    expect(bossLabel(4, 3, true)).toBe('Jefe final');
    expect(
      describeEvent({
        type: 'bossSpawn',
        enemyId: 9,
        species: 'virizion',
        number: 4,
        interludes: 3,
        final: true,
      }),
    ).toBe('¡Jefe final: Virizion!');
    expect(texts[2]).toContain('4');
    expect(texts[3]).toBe('¡Charmander evoluciona a Charmeleon!');
    expect(texts[4]).toBe('¡Híbrida! Charmander + Squirtle');
    expect(texts[5]).toBe('¡Growlithe soltó una bola! Recógela');
    expect(texts[6]).toBeNull();
    expect(texts[7]).toBeNull();
    expect(texts[8]).toContain('Capturado');
    expect(texts[8]).toContain('Psyduck');
    expect(texts[9]).toBe('¡Blastoise sube a Nv6!'); // the form it shows, not "Squirtle"
    expect(texts[10]).toBe('Psyduck reemplaza a Ninetales');
    expect(texts[11]).toBe('Soltaste a Psyduck');
    expect(texts[12]).toBeNull(); // the replace screen speaks for itself
    expect(texts[13]).toBeNull(); // picking a ball up is silent text: it happens all the time
  });

  it('says what each step is: an evolution, an awakening or the maximum power (ADR-037)', () => {
    expect(stageText('evolve', 'exeggcute', 'exeggutor')).toBe(
      '¡Exeggcute evoluciona a Exeggutor!',
    );
    expect(stageText('peak', 'exeggutor', 'exeggutor')).toBe('¡Exeggutor alcanza su máximo poder!');
    expect(stageText('awaken', 'tangela', 'tangela')).toBe('¡Tangela despierta su poder!');
  });

  it('never says a Pokémon evolves into itself, for any line and any stage of the roster', () => {
    for (const base of Object.keys(gameConfig.lines ?? {})) {
      const run = createRun(
        gameConfig,
        1,
        base in gameConfig.species ? 'charmander' : 'charmander',
      );
      run.team = [];
      run.loadout = [];
      run.cooldowns = [];
      addMember(run, gameConfig, base, 1);
      run.events.length = 0;
      for (let i = 0; i < 7; i++) trainMember(run, gameConfig, 0, 'card');
      const steps = run.events.filter((e) => e.type === 'stage');
      expect(steps.length, base).toBe(2);
      for (const step of steps) {
        const text = describeEvent(step) ?? '';
        if (step.type === 'stage' && step.kind === 'evolve') {
          expect(step.from, base).not.toBe(step.to);
          expect(text).toMatch(/evoluciona a/);
        } else {
          expect(text, base).not.toMatch(/evoluciona/);
        }
      }
    }
  }, 30_000);

  it('names the form of a dropped or captured evolved enemy, and the boss that fell', () => {
    expect(
      describeEvent({
        type: 'captureDrop',
        level: 2,
        species: 'growlithe',
        form: 'arcanine',
        x: 1,
        y: 2,
      }),
    ).toBe('¡Arcanine soltó una bola! Recógela');
    expect(
      describeEvent({
        type: 'capture',
        level: 3,
        ballId: 4,
        species: 'growlithe',
        form: 'arcanine',
        x: 1,
        late: false,
      }),
    ).toBe('¡Capturado: Arcanine!');
    expect(describeEvent({ type: 'bossDefeated', species: 'rapidash', index: 1 })).toBe(
      '¡Jefe derrotado: Rapidash!',
    );
  });

  it('adds the theme to the wave announcement when there is one', () => {
    const label = (id: string) => (id === 'pack' ? 'Manada (Fuego)' : null);
    expect(describeEvent({ type: 'waveStart', index: 0, theme: 'pack' }, label)).toBe(
      'Oleada 1: Manada (Fuego)',
    );
    expect(describeEvent({ type: 'waveStart', index: 0, theme: 'nope' }, label)).toBe('Oleada 1');
    expect(describeEvent({ type: 'waveStart', index: 0, theme: '' }, label)).toBe('Oleada 1');
  });
});
