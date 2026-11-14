import { describe, expect, it } from 'vitest';
import { gameConfig, STARTER_SPECIES } from '../../src/data';
import {
  addMember,
  baseOf,
  createRun,
  GAME_TYPES,
  moveShape,
  signatureOf,
  signatureReady,
  starterSignatureOf,
} from '../../src/domain';
import { canStartWith, chooseFirstStarter, emptyProfile, starterChoices } from '../../src/meta';

/** 4G-I, block 8 (Phase 5): the first starter, then only the collection; an Ultimate for all. */
const classics = STARTER_SPECIES;

describe('who can start a run', () => {
  it('the first time, the four classics; once chosen, only the collection', () => {
    const fresh = emptyProfile(1);
    expect(starterChoices(fresh, classics)).toEqual(classics);
    expect(canStartWith(fresh, classics, 'zubat')).toBe(false);
    const chosen = chooseFirstStarter(fresh, classics, 'squirtle');
    expect(chosen.firstStarterChosen).toBe(true);
    expect(chosen.owned).toEqual({ squirtle: { level: 1 } });
    expect(starterChoices(chosen, classics)).toEqual(['squirtle']);
    expect(canStartWith(chosen, classics, 'charmander')).toBe(false);
    // A second "first choice" changes nothing; nor does a species that is not a classic.
    expect(chooseFirstStarter(chosen, classics, 'pikachu')).toBe(chosen);
    expect(chooseFirstStarter(fresh, classics, 'zubat')).toBe(fresh);
    // The collection, sorted.
    const more = { ...chosen, owned: { ...chosen.owned, abra: { level: 2 } } };
    expect(starterChoices(more, classics)).toEqual(['abra', 'squirtle']);
  });
});

describe('every Pokémon of the collection has an Ultimate as starter (data, by type)', () => {
  it('the four classics keep their own signature', () => {
    for (const id of classics) {
      for (const stage of [1, 2, 3]) {
        expect(starterSignatureOf(gameConfig, id, stage)).toEqual(
          signatureOf(gameConfig, id, stage),
        );
      }
    }
  });

  it('every type has its generic Ultimate from stage 2, and every line of the roster gets one', () => {
    for (const type of GAME_TYPES) {
      expect(gameConfig.moves.genericSignatures?.[type]?.[1], type).toBeTruthy();
    }
    const bases = Object.keys(gameConfig.species).filter(
      (id) => baseOf(gameConfig, id).base === id,
    );
    for (const base of bases) {
      expect(starterSignatureOf(gameConfig, base, 2), base).not.toBeNull();
    }
  });

  it('a non-classic starter can throw it; the other Pokémon keep the move of their tier', () => {
    const run = createRun(gameConfig, 3, 'zubat');
    const starter = run.team[0];
    if (starter === undefined) throw new Error('no starter');
    starter.level = gameConfig.team.stageLevels[0] ?? 3;
    starter.charge = 999;
    expect(signatureReady(run, gameConfig, 0)).toBe(true);
    // As starter the shape is the Ultimate of its type; as an ordinary member, the tier's.
    expect(moveShape(gameConfig, 'zubat', 2, true)).toMatchObject(
      gameConfig.moves.genericSignatures?.poison?.[1] ?? {},
    );
    expect(moveShape(gameConfig, 'zubat', 2, false).kind).toBe(gameConfig.moves.tiers[1]?.kind);
    addMember(run, gameConfig, 'geodude', 3);
    expect(signatureReady(run, gameConfig, 1)).toBe(false);
  });
});
