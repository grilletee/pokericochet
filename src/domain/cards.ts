import { matchup, themeTypes } from './advice';
import type { GameConfig } from './config';
import { applyHybrid, previewHybrid } from './evolution';
import { nextFloat, nextInt } from './rng';
import type { Run } from './run';
import { addMember, memberIndexOf, trainMember } from './team';
import type { Card, GameType } from './types';

const MAX_ATTEMPTS = 40;

/** Flat list of loadout slot pairs `a` < `b` that can be hybridised: a0, b0, a1, b1, ... */
function hybridPairs(run: Run, config: GameConfig): number[] {
  const pairs: number[] = [];
  if (!config.hybrid.enabled) return pairs;
  for (let a = 0; a < run.loadout.length; a++) {
    for (let b = a + 1; b < run.loadout.length; b++) {
      if (previewHybrid(run, a, b) !== null) pairs.push(a, b);
    }
  }
  return pairs;
}

/** Two offers with the same key are the same card (a Pokémon can have one card of each kind). */
function cardKey(card: Card): string {
  switch (card.kind) {
    case 'newBall':
      return `newBall:${card.species}`;
    case 'train':
    case 'power':
    case 'cadence':
      return `${card.kind}:${card.member}`;
    case 'hybrid':
      return 'hybrid';
    default:
      return card.kind;
  }
}

/** The Pokémon a card is about, or -1 for a card that is not about one. */
function memberOf(card: Card): number {
  return card.kind === 'train' || card.kind === 'power' || card.kind === 'cadence'
    ? card.member
    : -1;
}

/** Indices of the team that satisfy `ok`. */
function membersWhere(run: Run, ok: (index: number) => boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < run.team.length; i++) if (ok(i)) out.push(i);
  return out;
}

/** One random card, drawing only from the `cards` stream. */
function drawCard(
  run: Run,
  config: GameConfig,
  pairs: readonly number[],
  answers: readonly string[] | null,
): Card {
  const { weights, upgradeCap } = config.cards;
  const trainable = membersWhere(run, (i) => (run.team[i]?.level ?? 0) < config.team.maxLevel);
  const powerable = membersWhere(run, (i) => (run.team[i]?.damageUps ?? 0) < upgradeCap);
  const cadenceable = membersWhere(run, (i) => (run.team[i]?.cadenceUps ?? 0) < upgradeCap);
  const recruit =
    run.team.length < config.team.maxMembers && config.ballSpecies.length > 0 ? weights.newBall : 0;
  const odds = [
    recruit,
    trainable.length > 0 ? weights.train : 0,
    powerable.length > 0 ? weights.power : 0,
    cadenceable.length > 0 ? weights.cadence : 0,
    weights.vitality,
    weights.team,
    pairs.length > 0 ? weights.hybrid : 0,
  ];
  let total = 0;
  for (const w of odds) total += w;
  let roll = nextFloat(run.rng.cards) * total;
  let kind = 0;
  while (kind < odds.length - 1 && roll >= (odds[kind] ?? 0)) {
    roll -= odds[kind] ?? 0;
    kind += 1;
  }
  const pickMember = (list: readonly number[]): number =>
    list[nextInt(run.rng.cards, list.length)] ?? 0;
  switch (kind) {
    case 0: {
      // A species the team already has is not recruited again: a copy is a level, not a place.
      const pool = (answers ?? recruitable(run, config)).filter((id) => memberIndexOf(run, id) < 0);
      const species = pool[nextInt(run.rng.cards, pool.length)];
      if (species !== undefined) return { kind: 'newBall', species };
      break;
    }
    case 1:
      if (trainable.length > 0) return { kind: 'train', member: pickMember(trainable) };
      break;
    case 2:
      if (powerable.length > 0) return { kind: 'power', member: pickMember(powerable) };
      break;
    case 3:
      if (cadenceable.length > 0) return { kind: 'cadence', member: pickMember(cadenceable) };
      break;
    case 5:
      return { kind: 'team' };
    case 6: {
      if (pairs.length === 0) break;
      const pair = nextInt(run.rng.cards, pairs.length / 2) * 2;
      const swap = nextInt(run.rng.cards, 2) === 1;
      const first = pairs[pair] ?? 0;
      const second = pairs[pair + 1] ?? 0;
      return swap
        ? { kind: 'hybrid', a: second, b: first }
        : { kind: 'hybrid', a: first, b: second };
    }
  }
  return { kind: 'vitality' };
}

/**
 * Species the player may be offered that beat the type of the next wave (ADR-027), when the team
 * has no Pokémon that does; null when the team already answers it or nothing can.
 */
function answersToNextWave(run: Run, config: GameConfig): readonly string[] | null {
  const waves = config.waves;
  const index = run.wave.index + 1 < waves.length ? run.wave.index + 1 : run.wave.index;
  const theme = config.themes?.[run.waveThemes[index] ?? ''];
  if (theme === undefined) return null;
  // A type beats a biome when it hits the types of the biome harder than normal on average.
  const targets = themeTypes(config, theme.id);
  const beats = (type: GameType): boolean => matchup(config, type, targets) > 1;
  if (run.team.some((member) => beats(member.type))) return null;
  const answers = recruitable(run, config).filter((id) => {
    const species = config.species[id];
    return species !== undefined && beats(species.type);
  });
  return answers.length > 0 ? answers : null;
}

/** The species a recruit card may name: the lines of the run's pool (ADR-048). */
function recruitable(run: Run, config: GameConfig): readonly string[] {
  const inPool = config.ballSpecies.filter((id) => run.pool.includes(id));
  return inPool.length > 0 ? inPool : config.ballSpecies;
}

/**
 * The cards offered at a level-up: `offerCount` different ones, drawn from the `cards` stream
 * only (ADR-032). Each card about one Pokémon names a different one while the team has three or
 * more. A new Pokémon is offered only with a free place. If no Pokémon of the team beats the type
 * of the next wave, the first recruit card is drawn among the species that do (ADR-027).
 */
export function drawOffers(run: Run, config: GameConfig): Card[] {
  const offers: Card[] = [];
  const pairs = hybridPairs(run, config);
  let answers = answersToNextWave(run, config);
  const seen = new Set<string>();
  const named = new Set<number>();
  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS && offers.length < config.cards.offerCount;
    attempt++
  ) {
    const card = drawCard(run, config, pairs, answers);
    if (card.kind === 'newBall') answers = null;
    const key = cardKey(card);
    if (seen.has(key)) continue;
    const member = memberOf(card);
    if (member >= 0 && run.team.length >= 3 && named.has(member)) continue;
    seen.add(key);
    if (member >= 0) named.add(member);
    offers.push(card);
  }
  return offers;
}

/** Applies a chosen card to the run. */
export function applyCard(run: Run, config: GameConfig, card: Card): void {
  const { cards } = config;
  switch (card.kind) {
    case 'newBall':
      if (run.team.length < config.team.maxMembers) addMember(run, config, card.species, 1);
      break;
    case 'train':
      trainMember(run, config, card.member, 'card');
      break;
    case 'power': {
      const member = run.team[card.member];
      if (member !== undefined && member.damageUps < cards.upgradeCap) member.damageUps += 1;
      break;
    }
    case 'cadence': {
      const member = run.team[card.member];
      if (member !== undefined && member.cadenceUps < cards.upgradeCap) member.cadenceUps += 1;
      break;
    }
    case 'team':
      run.player.damageMult += cards.damageStep;
      break;
    case 'vitality':
      run.player.maxHp += cards.vitalityHp;
      run.player.hp += cards.vitalityHp;
      break;
    case 'hybrid':
      if (config.hybrid.enabled) applyHybrid(run, card.a, card.b);
      break;
  }
}
