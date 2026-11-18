import type { BossCatchRules, GameConfig, JoinRules } from './config';
import { baseOf } from './forms';
import { biomeLines } from './pool';
import { nextFloat } from './rng';
import type { CatchState, Run } from './run';
import { captureForm, joinTeam, teamIsFull } from './team';
import type { Card, Command, Enemy } from './types';

/**
 * 4X (19th playtest, "LO MÁS IMPORTANTE: hay que rehacer la captura"): how Pokémon reach the team.
 *
 * - An ordinary enemy no longer drops its ball (`capture.wildDrops`).
 * - Join encounters: at some level-ups, instead of the cards, `options` wild Pokémon of the biome ask
 *   to join. Never a starter or a pseudo-legendary (`excluded`): those come only from bosses in a run
 *   and from the gacha for good. The player takes one, or lets them go and gets the usual cards.
 * - The capture of a boss: a defeated boss between waves stays weakened for a few seconds; one throw
 *   of the sphere at it, inside a ring that shrinks and grows back; the fight sets the base chance and
 *   the ring multiplies it. A miss, a failed roll or no throw in time: it flees.
 *
 * Everything is a function of the run and the commands: the rolls come from the run's `capture`
 * stream, the throw is a command like any other (ADR-004).
 */

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// ------------------------------------------------------------------------------ join encounters

/** The stage the enemies of the current wave have: what a wild Pokémon that joins now is. */
export function joinStage(run: Run, config: GameConfig): number {
  const waves = config.waves;
  const wave = waves[Math.min(run.wave.index, waves.length - 1)];
  return Math.max(1, Math.min(3, wave?.tier ?? 1));
}

/**
 * Who may ask to join now, with its weight: the lines of the run's pool that live in the biome of
 * the wave (a line of two of its types counts as much as its heaviest one), rare lines at
 * `rareWeight`; never an excluded line or one the team already has. With fewer than `options` in
 * the biome, the rest of the pool fills in at the lowest weight, so an encounter always offers a
 * choice while the pool allows it. Sorted by id, so the draw does not depend on any order.
 */
export function joinCandidates(
  run: Run,
  config: GameConfig,
  rules: JoinRules,
): readonly { readonly species: string; readonly weight: number }[] {
  const inTeam = new Set(run.team.map((m) => m.species));
  const allowed = (id: string): boolean =>
    !rules.excluded.includes(id) && !inTeam.has(id) && config.species[id] !== undefined;
  const weights = new Map<string, number>();
  const theme =
    config.themes?.[run.waveThemes[Math.min(run.wave.index, run.waveThemes.length - 1)] ?? ''];
  if (theme !== undefined) {
    for (const id of biomeLines(config, run.pool, theme)) {
      if (allowed(id)) weights.set(id, (weights.get(id) ?? 0) + 1);
    }
  }
  if (weights.size < rules.options) {
    // The biome is short of candidates: the rest of the pool, each counted once.
    for (const id of run.pool) if (allowed(id) && !weights.has(id)) weights.set(id, 0.5);
  }
  return [...weights.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([species, w]) => ({
      species,
      weight: w * (rules.rare.includes(species) ? rules.rareWeight : 1),
    }));
}

/** `rules.options` different Pokémon drawn by weight from the `capture` stream (one number each). */
export function drawJoinOffers(run: Run, config: GameConfig, rules: JoinRules): Card[] {
  const left = joinCandidates(run, config, rules).slice();
  const stage = joinStage(run, config);
  const offers: Card[] = [];
  while (offers.length < rules.options && left.length > 0) {
    let total = 0;
    for (const c of left) total += c.weight;
    let roll = nextFloat(run.rng.capture) * total;
    let index = 0;
    while (index < left.length - 1 && roll >= (left[index]?.weight ?? 0)) {
      roll -= left[index]?.weight ?? 0;
      index += 1;
    }
    const [picked] = left.splice(index, 1);
    if (picked !== undefined) offers.push({ kind: 'join', species: picked.species, stage });
  }
  return offers;
}

/**
 * Called at a level-up: makes it a join encounter if the rules say so. The first one comes at
 * `firstAt`; later ones by chance, with bad-luck protection; rarer with the team full (a join is
 * then a replace). One number of the `capture` stream per level-up, whatever happens. Returns true
 * when the offers are now the wild Pokémon.
 */
export function openJoinEncounter(run: Run, config: GameConfig): boolean {
  const rules = config.capture.join;
  if (rules === undefined) return false;
  const roll = nextFloat(run.rng.capture);
  const full = teamIsFull(run, config);
  const chance =
    run.player.level === rules.firstAt
      ? 1
      : (rules.chance + run.joinMisses * rules.pityStep) * (full ? rules.fullTeamMult : 1);
  if (roll < chance) {
    const offers = drawJoinOffers(run, config, rules);
    if (offers.length > 0) {
      run.joinMisses = 0;
      run.offers = offers;
      run.events.push({
        type: 'joinOffer',
        forms: offers.map((card) =>
          card.kind === 'join' ? captureForm(config, card.species, card.stage) : '',
        ),
      });
      return true;
    }
  }
  run.joinMisses += 1;
  return false;
}

/** True while the offers of the level-up are wild Pokémon asking to join. */
export function isJoinEncounter(run: Run): boolean {
  return run.phase === 'levelup' && run.offers[0]?.kind === 'join';
}

// ---------------------------------------------------------------------------- capture of a boss

/** What the fight earned: the base, plus a fast fight, plus a fight without damage (0..1). */
export function catchPerformance(run: Run, rules: BossCatchRules): number {
  const fast = clamp01(1 - run.boss.tick / (2 * rules.parTicks));
  const hurt = Math.max(0, run.boss.hpAtSpawn - run.player.hp);
  const unhurt = clamp01(1 - (2 * hurt) / Math.max(1, run.player.maxHp));
  return clamp01(rules.baseChance + rules.fastBonus * fast + rules.unhurtBonus * unhurt);
}

/** How narrow the ring is now: 0 at its widest, 1 at its narrowest (then it grows back at once). */
export function ringTightness(rules: BossCatchRules, state: Pick<CatchState, 'ticks'>): number {
  const cycle = Math.max(1, rules.ringCycleTicks);
  return (state.ticks % cycle) / cycle;
}

/** The radius of the ring now (arena pixels). */
export function catchRing(
  rules: BossCatchRules,
  state: Pick<CatchState, 'ticks' | 'radius'>,
): number {
  const scale = rules.ringMax - (rules.ringMax - rules.ringMin) * ringTightness(rules, state);
  return state.radius * scale;
}

/** The chance a throw that lands now captures it: the fight's base times what the ring adds. */
export function catchChance(
  rules: BossCatchRules,
  state: Pick<CatchState, 'ticks' | 'performance'>,
): number {
  const mult = rules.ringLow + (rules.ringHigh - rules.ringLow) * ringTightness(rules, state);
  return Math.max(rules.minChance, Math.min(rules.maxChance, state.performance * mult));
}

/** The sideways sway of the weakened boss: a triangle wave of `sway` pixels each way, from 0. */
export function catchSway(rules: BossCatchRules, ticks: number): number {
  const period = Math.max(1, rules.swayTicks);
  const p = ((ticks % period) / period + 0.25) % 1;
  const tri = p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
  return rules.sway * tri;
}

/**
 * A boss between waves was defeated: if the rules allow, it stays weakened and the `catch` phase
 * starts. Must run before the defeat heals the player (the damage of the fight counts). Returns true
 * when the capture opened.
 */
export function openBossCatch(run: Run, config: GameConfig, boss: Enemy): boolean {
  const rules = config.capture.boss;
  if (rules === undefined) return false;
  const { base, level } = baseOf(config, boss.species);
  const margin = rules.sway + boss.radius * rules.ringMin;
  const x0 = Math.max(margin, Math.min(config.arena.width - margin, boss.x));
  const top = boss.radius * rules.ringMax;
  const y = Math.max(top, Math.min(config.arena.defenseLineY - top, boss.y));
  const state: CatchState = {
    species: base,
    stage: level,
    form: captureForm(config, base, level),
    x0,
    x: x0 + catchSway(rules, 0),
    y,
    radius: boss.radius,
    ticks: 0,
    performance: catchPerformance(run, rules),
  };
  run.catch = state;
  run.phase = 'catch';
  run.events.push({
    type: 'catchOpen',
    species: base,
    form: state.form,
    performance: state.performance,
    x: state.x,
    y: state.y,
  });
  return true;
}

function close(run: Run): void {
  run.catch = null;
  run.phase = 'playing';
}

/**
 * One tick of the `catch` phase: the aim of the command counts, the boss sways and the ring turns;
 * a `throw` decides it (one number of the `capture` stream: drawn on every throw, hit or miss); no
 * throw by the end of the window and it flees. The rest of the field stands still meanwhile.
 */
export function advanceCatch(run: Run, cmd: Command, config: GameConfig): void {
  const state = run.catch;
  const rules = config.capture.boss;
  if (state === null || rules === undefined) {
    close(run);
    return;
  }
  const { width, height } = config.arena;
  if (cmd.aimX !== undefined) run.aimX = Math.max(0, Math.min(width, Math.floor(cmd.aimX + 0.5)));
  if (cmd.aimY !== undefined) run.aimY = Math.max(0, Math.min(height, Math.floor(cmd.aimY + 0.5)));
  if (cmd.autoAim !== undefined) run.autoAim = cmd.autoAim;
  if (cmd.throw === true) {
    // The assisted aim (an accessibility option) aims at the boss; the timing of the ring is still
    // the player's.
    const aimX = run.autoAim ? state.x : run.aimX;
    const aimY = run.autoAim ? state.y : run.aimY;
    const ring = catchRing(rules, state);
    const dx = aimX - state.x;
    const dy = aimY - state.y;
    const hit = dx * dx + dy * dy <= ring * ring;
    const chance = catchChance(rules, state);
    const roll = nextFloat(run.rng.capture);
    const caught = hit && roll < chance;
    run.events.push({
      type: 'catchThrow',
      species: state.species,
      form: state.form,
      hit,
      chance,
      caught,
      x: aimX,
      y: aimY,
    });
    close(run);
    if (caught) joinTeam(run, config, state.species, state.stage, state.x, false, 'boss');
    else run.events.push({ type: 'catchFled', species: state.species, form: state.form });
    return;
  }
  state.ticks += 1;
  state.x = state.x0 + catchSway(rules, state.ticks);
  if (state.ticks >= rules.windowTicks) {
    run.events.push({ type: 'catchFled', species: state.species, form: state.form });
    close(run);
  }
}
