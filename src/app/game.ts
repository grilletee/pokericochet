import pixelFontUrl from '../assets/fonts/PixelifySans.ttf?url';
import { ART_SPECIES_IDS, gameConfig, MOVE_NAMES, POKEMON_NAMES, STARTER_SPECIES } from '../data';
import {
  addMember,
  attackTypeOf,
  ballsFor,
  type Command,
  captureForm,
  captureLevel,
  chargeNeed,
  createRun,
  createSnapshot,
  dropCapture,
  formAt,
  formOfMember,
  type GameConfig,
  type GameEvent,
  type GameType,
  guardAfterReplace,
  moveIdOf,
  nextStep,
  PHASE_LEVELUP,
  previewHybrid,
  type Run,
  type Snapshot,
  signatureOf,
  signatureReady,
  stageForLevel,
  statsOf,
  statsOfMember,
  summarizeRun,
  syncMember,
  teamGuard,
  themeTypes,
  tick,
  typeAdvice,
  typesOfSpecies,
  waveAdvice,
  writeSnapshot,
} from '../domain';
import { Renderer } from '../render';
import {
  AttackNamer,
  BOSS_DEFEAT_MS,
  BOSS_ENTRY_MS,
  BOSS_FINAL_MS,
  BossMoment,
  type BossMomentView,
  bossCartel,
  bossLabel,
  type CardTextContext,
  CreditsScreen,
  creditLines,
  describeEvent,
  disclaimerShort,
  EvolutionBanner,
  EvolutionMoment,
  GamePause,
  installPixelStyle,
  isRealEvolution,
  labelPriority,
  MemberSheet,
  MoveLabelPolicy,
  MoveLabels,
  moveName,
  Overlay,
  pauseMs,
  pokemonName,
  ReplaceScreen,
  type ReplaceView,
  ResultsScreen,
  SettingsScreen,
  SoundFx,
  SoundToggle,
  STEP_COLOR,
  type StarterOption,
  StartScreen,
  setNames,
  signatureLine,
  spriteTile,
  strongerText,
  TeamBar,
  type TileGlow,
  TunePanel,
  typeName,
  WaveBanner,
  waveCartel,
} from '../ui';
import { BENCH_LOADS, type BenchLoad, benchScenario } from './benchScenario';
import { type BestRun, browserStore, loadBestRun, saveIfBest } from './bestRun';
import { GAME_TITLE } from './config';
import { playCry } from './cries';
import { FixedStepper } from './fixedStepper';
import { Input, RELEASE_PICK } from './input';
import { commandFromInput } from './inputLogic';
import { FrameMetrics, type Stats, summarize } from './metrics';
import { loadAutoAim, loadMuted, saveAutoAim, saveMuted } from './settings';
import { loadSpeciesTextures, spriteUrls } from './sprites';
import {
  applyTune,
  changedKnobs,
  neutral,
  sanitizeTune,
  TUNE_DEFS,
  TUNE_KEY,
  type TuneValues,
  tuneToPatch,
} from './tune';

const MAX_SLOTS = 64;
const MAX_ENEMIES = 512;
const POINTER_DEAD_ZONE = 3;
/** Share of its charge from which a Pokémon's portrait glows: its move is about to go off (4F-D). */
const NEAR_CHARGE = 0.75;
const BENCH_WARMUP_FRAMES = 120;
const BENCH_MEASURED_FRAMES = 600;

export interface BrowserBenchResult {
  readonly scenario: string;
  readonly frames: number;
  readonly fps: number;
  readonly frameMs: Stats;
  readonly ticksPerFrame: number;
  /** Domain cost of one tick, averaged over frames that ran at least one tick. */
  readonly tickMsPerTick: Stats;
  readonly tickMsPerFrame: Stats;
  readonly snapshotMsPerFrame: Stats;
  readonly renderMsPerFrame: Stats;
  /** tick + snapshot + render CPU time per frame: what has to fit in the frame budget. */
  readonly cpuMsPerFrame: Stats;
  readonly heapBytesPerFrameLowerBound: number;
  readonly garbageCollections: number;
  readonly preciseHeap: boolean;
  readonly userAgent: string;
  readonly devicePixelRatio: number;
  readonly viewport: string;
}

declare global {
  interface Window {
    __benchResult?: BrowserBenchResult;
    /** Read-only view of the run for browser smoke tests; only present with ?debug or ?bench. */
    __debug?: () => {
      tick: number;
      playerX: number;
      hp: number;
      balls: number;
      enemies: number;
      phase: string;
      level: number;
      offers: number;
      loadout: number;
      team: number;
      pendingCapture: string;
      wave: number;
      screen: string;
      kills: number;
      bossHp: number;
      bossMaxHp: number;
      starter: string;
      pickups: number;
      autoAim: boolean;
      aimX: number;
      aimY: number;
      /** Biome of each wave, the lines in the pool of the run and the tint of the field now. */
      waveThemes: readonly string[];
      poolSize: number;
      biomeColor: number;
      /** The fight of a boss: things on the floor, the phase (1 = fury) and the ticks the core is open. */
      hazards: number;
      bossPhase: number;
      bossCoreOpen: number;
      /** Kinds of the things on the floor now, for the smoke test. */
      hazardKinds: readonly string[];
      /** Moves cast so far, and the labels that were shown / left out (ADR-039). */
      moveCasts: number;
      labelsShown: number;
      labelsDropped: number;
      sheetOpen: boolean;
    };
  }
}

function heapBytes(): number {
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
  return perf.memory?.usedJSHeapSize ?? 0;
}

function benchCommand(tickCount: number): Command {
  // The assisted aim keeps the benchmark scene fighting without an aim input.
  return { moveX: tickCount % 240 < 120 ? 1 : -1, autoAim: true };
}

function finishBench(metrics: FrameMetrics, load: BenchLoad): BrowserBenchResult {
  const n = metrics.count;
  const cpu = new Float64Array(n);
  const perTick: number[] = [];
  let totalFrameMs = 0;
  let totalTicks = 0;
  for (let i = 0; i < n; i++) {
    cpu[i] = (metrics.tickMs[i] ?? 0) + (metrics.snapshotMs[i] ?? 0) + (metrics.renderMs[i] ?? 0);
    totalFrameMs += metrics.frameMs[i] ?? 0;
    totalTicks += metrics.ticks[i] ?? 0;
    const ticks = metrics.ticks[i] ?? 0;
    if (ticks > 0) perTick.push((metrics.tickMs[i] ?? 0) / ticks);
  }
  const allocation = metrics.allocation();
  return {
    scenario: `${load.balls} balls, ${load.enemies} enemies`,
    frames: n,
    fps: n / (totalFrameMs / 1000),
    frameMs: summarize(metrics.frameMs, n),
    ticksPerFrame: totalTicks / n,
    tickMsPerTick: summarize(perTick, perTick.length),
    tickMsPerFrame: summarize(metrics.tickMs, n),
    snapshotMsPerFrame: summarize(metrics.snapshotMs, n),
    renderMsPerFrame: summarize(metrics.renderMs, n),
    cpuMsPerFrame: summarize(cpu, n),
    heapBytesPerFrameLowerBound: allocation.bytesPerFrame,
    garbageCollections: allocation.collections,
    preciseHeap: (metrics.heapBytes[0] ?? 0) > 0,
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

/** One command for the next tick: a card choice while a level-up is pending, otherwise movement. */
function nextCommand(run: Run, input: Input, deadZone: number, autoAim: boolean): Command {
  if (run.phase === 'levelup') {
    const index = input.takePick();
    return index === null
      ? { moveX: 0, autoAim }
      : { moveX: 0, autoAim, action: { type: 'pick', index } };
  }
  if (run.phase === 'replace') {
    const pick = input.takePick();
    if (pick === null) return { moveX: 0, autoAim };
    return {
      moveX: 0,
      autoAim,
      action: pick === RELEASE_PICK ? { type: 'release' } : { type: 'replace', slot: pick },
    };
  }
  // Outside a card or replace choice a number key (or a tap on a Pokémon's tile) throws the
  // signature of that place of the team; the domain ignores it if it is not ready (4F-D).
  const cast = input.takePick();
  const command = commandFromInput(input.state, run.player.x, deadZone, autoAim);
  return cast !== null && cast >= 0 ? { ...command, cast } : command;
}

/** `boss` is "Jefe 2/3" or "Jefe final" while a boss lives; it replaces the wave in the HUD (4F-E). */
function hudText(snap: Snapshot, waveCount: number, seed: number, boss: string | null): string {
  const wave =
    boss ??
    (waveCount > 0 && snap.waveIndex >= waveCount
      ? 'Jefe final'
      : `Oleada ${Math.min(snap.waveIndex + 1, Math.max(1, waveCount))}/${waveCount}`);
  const first = [
    `PV ${Math.max(0, Math.round(snap.playerHp))}/${snap.playerMaxHp}`,
    `Nv ${snap.playerLevel} (${Math.floor(snap.playerXp)}/${snap.playerXpNext} XP)`,
    waveCount > 0 ? wave : '',
  ]
    .filter((part) => part !== '')
    .join('   ');
  return `${first}\nSemilla ${seed}`;
}

/** The arrow (or plus sign) between the pictures of the evolution banner. */
function arrow(symbol = '→'): HTMLElement {
  const node = document.createElement('div');
  node.textContent = symbol;
  node.style.cssText = 'font-size:28px;font-weight:800;opacity:0.9;';
  return node;
}

type Screen = 'menu' | 'credits' | 'settings' | 'playing' | 'results';

/** Debug aids (?debug&…): start from a prepared state to reach a scene quickly. */
function applyDebugParams(run: Run, config: GameConfig, params: URLSearchParams): void {
  const number = (name: string): number | null => {
    const raw = params.get(name);
    return raw === null || raw === '' || Number.isNaN(Number(raw)) ? null : Number(raw);
  };
  const xp = number('xp');
  if (xp !== null) run.player.xp = xp;
  const hp = number('hp');
  if (hp !== null) run.player.hp = hp;
  const wave = number('wave');
  if (wave !== null) {
    run.wave.index = wave; // wave=7 jumps straight to the final boss
    // The bosses between waves that this jump skips must not appear all at once.
    run.boss.next = (config.interludes ?? []).filter((boss) => boss.after <= wave).length;
  }
  // bossNo=1..3 brings the intermediate boss of that number right away (use it with wave=its `after`).
  const bossNo = number('bossNo');
  if (bossNo !== null) run.boss.next = Math.max(0, bossNo - 1);
  // team=a,b,c replaces the team with these Pokémon (up to six; the first is the starter).
  const team = params.get('team') ?? params.get('loadout');
  if (team !== null) {
    const species = team
      .split(',')
      .filter((id) => config.species[id] !== undefined)
      .slice(0, config.team.maxMembers);
    run.team = [];
    run.loadout = [];
    run.cooldowns = [];
    run.bodies = [];
    for (const id of species) addMember(run, config, id, 1);
  }
  // ballLevel=N sets the level of every Pokémon of the team (to see a stage or a full set of balls).
  const level = number('ballLevel');
  if (level !== null) {
    run.team.forEach((member, index) => {
      member.level = Math.max(1, Math.min(config.team.maxLevel, level));
      syncMember(run, config, index);
    });
  }
  // charge=N gives every Pokémon N hits of charge, so a move is one hit away (ADR-039).
  const charge = number('charge');
  if (charge !== null) for (const member of run.team) member.charge = Math.max(0, charge);
  // offers=growth opens a level-up with a Pokémon card of each kind for the first Pokémon.
  if (params.get('offers') === 'growth') {
    run.offers = [
      { kind: 'train', member: 0 },
      { kind: 'power', member: 0 },
      { kind: 'cadence', member: 0 },
    ];
    run.phase = 'levelup';
  }
  // capture=<species> lets a captured Pokémon of that species fall in front of the launcher;
  // captureStage=2 or 3 makes it the ball of an evolved enemy (a Rapidash boss is stage 2).
  const captured = params.get('capture');
  const def = captured === null ? undefined : config.species[captured];
  if (captured !== null && def !== undefined) {
    const stage = Math.max(1, Math.min(3, number('captureStage') ?? 1));
    dropCapture(run, config, captured, def.type, run.player.x, 200, stage);
  }
}

/**
 * Composition root of the game: wires the domain, the renderer, the input, the overlay and the
 * three screens (title, play, results), and owns the clock. The domain never sees time; it only
 * receives one command per tick.
 */
export async function startGame(host: HTMLElement): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const bench = params.has('bench');
  // ?bench = stress scene (40 balls, 150 enemies); ?bench=real = the measured real peak load.
  const benchLoad = params.get('bench') === 'real' ? BENCH_LOADS.real : BENCH_LOADS.stress;
  const showDebug = bench || params.has('debug');
  // Measurement aid: run tick + snapshot but skip drawing, to separate the costs.
  const skipRender = params.has('norender');
  // ?starter=<species> skips the title screen (used by the browser tests and benchmarks).
  const starterParam = params.get('starter');
  const skipTitle = bench || (starterParam !== null && STARTER_SPECIES.includes(starterParam));

  let config: GameConfig = gameConfig;
  const newSeed = (): number => Number(params.get('seed')) || Date.now() >>> 0;
  let starter = skipTitle && starterParam !== null ? starterParam : (STARTER_SPECIES[0] ?? '');
  let run: Run;
  if (bench) {
    const scenario = benchScenario(gameConfig, 1, benchLoad);
    run = scenario.run;
    config = scenario.config;
  } else {
    run = createRun(config, newSeed(), starter);
  }
  if (showDebug && !bench) applyDebugParams(run, config, params);

  // The names the screens show come from the data layer once (ADR-036): Pokémon and moves in Spanish.
  setNames(POKEMON_NAMES, MOVE_NAMES);
  // Species -> small code the render uses to pick art; the domain never sees art.
  // The art table also holds every evolution form; `forms[code][stage - 1]` is the code to draw.
  const speciesIds = [...new Set([...Object.keys(config.species), ...ART_SPECIES_IDS])];
  const speciesCodes = new Map(speciesIds.map((id, code) => [id, code]));
  const forms = speciesIds.map((id) =>
    [1, 2, 3].map(
      (stage) => speciesCodes.get(formAt(config, id, stage)) ?? speciesCodes.get(id) ?? 0,
    ),
  );
  const urls = spriteUrls();
  const art = { spriteUrl: (form: string): string | undefined => urls.get(form) };
  let prev = createSnapshot(MAX_SLOTS, MAX_ENEMIES);
  let curr = createSnapshot(MAX_SLOTS, MAX_ENEMIES);
  writeSnapshot(run, prev, speciesCodes, config);
  writeSnapshot(run, curr, speciesCodes, config);

  const renderer = await Renderer.create(
    host,
    config,
    MAX_SLOTS,
    MAX_ENEMIES,
    await loadSpeciesTextures(speciesIds),
    forms,
  );
  installPixelStyle(host, pixelFontUrl);
  const overlay = new Overlay(host);
  const teamBar = new TeamBar(
    host,
    art,
    (species) => config.species[species]?.type,
    (member) => formOfMember(config, member),
    (member, index): TileGlow => {
      if (signatureReady(run, config, index)) return 'ready';
      const need = chargeNeed(config, stageForLevel(config, member.level));
      return member.charge >= need * NEAR_CHARGE ? 'near' : 'idle';
    },
  );
  const cartel = new WaveBanner(host);
  const replaceScreen = new ReplaceScreen(host);
  const sheet = new MemberSheet(host);
  const moveLabels = new MoveLabels(host);
  // At most three move names at once; the starter's move always shows (ADR-039, M11).
  const labelPolicy = new MoveLabelPolicy(3, 900);
  const banner = new EvolutionBanner(host);
  const moment = new EvolutionMoment(host);
  const bossMoment = new BossMoment(host);
  const pause = new GamePause();
  // Only Space or the visible button skip the evolution pause (4H-B2: a stray key or tap used to
  // skip it); the grace time lives in `GamePause.skip`.
  const skipEvolution = (): void => {
    if (pause.skip(performance.now())) {
      moment.hide();
      bossMoment.hide();
    }
  };
  moment.setOnSkip(skipEvolution);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') skipEvolution();
  });
  const startScreen = new StartScreen(host);
  const creditsScreen = new CreditsScreen(host);
  const resultsScreen = new ResultsScreen(host);
  const input = new Input(host, () => renderer.view);
  const store = browserStore();
  // Sound: starts muted only if the player chose so; the audio context wakes on the first gesture.
  const sound = new SoundFx(loadMuted(store));
  new SoundToggle(host, sound.muted, (muted) => {
    sound.muted = muted;
    saveMuted(store, muted);
  });
  for (const gesture of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(gesture, () => sound.unlock());
  }
  // The assisted aim is an accessibility option of the settings screen, off by default (4H-B2).
  let autoAim = loadAutoAim(store);
  const settingsScreen = new SettingsScreen(host);
  // ?tune: live tuning panel. The knobs rebuild the config from the shipped one on every change.
  if (params.has('tune') && !bench) {
    let tuneValues: TuneValues;
    try {
      tuneValues = sanitizeTune(gameConfig, JSON.parse(store?.getItem(TUNE_KEY) ?? 'null'));
    } catch {
      tuneValues = sanitizeTune(gameConfig, null);
    }
    config = applyTune(gameConfig, tuneValues);
    new TunePanel(
      host,
      TUNE_DEFS.map((d) => ({ ...d, neutral: neutral(d, gameConfig) })),
      tuneValues,
      (values) => {
        tuneValues = values;
        config = applyTune(gameConfig, values);
        try {
          store?.setItem(TUNE_KEY, JSON.stringify(values));
        } catch {
          // ignore: the tuning just is not remembered
        }
      },
      () =>
        JSON.stringify(
          {
            knobs: changedKnobs(gameConfig, tuneValues),
            configPatch: tuneToPatch(gameConfig, tuneValues),
          },
          null,
          2,
        ),
    );
  }
  const stepper = new FixedStepper();
  const metrics = bench ? new FrameMetrics(BENCH_MEASURED_FRAMES) : null;
  const pending: GameEvent[] = [];

  let screen: Screen = 'playing';
  let best: BestRun | null = loadBestRun(store);
  let moveCasts = 0;
  /** The notices that happen once per run: the signature is ready / was thrown for the first time. */
  let signatureAnnounced = false;
  let vulnerableHinted = false;
  const namer = new AttackNamer();
  let signatureWasReady = false;
  let readyAnnounced = false;

  let last = performance.now();
  let frameCount = 0;
  let benchDone = false;
  // Smoothed readings for the debug panel.
  let emaFrame = 16.7;
  let emaTick = 0;
  let emaSnapshot = 0;
  let emaRender = 0;

  if (showDebug) {
    window.__debug = () => ({
      tick: run.tickCount,
      playerX: run.player.x,
      hp: run.player.hp,
      balls: run.bodies.length,
      enemies: run.enemies.length,
      phase: run.phase,
      level: run.player.level,
      offers: run.offers.length,
      loadout: run.loadout.length,
      team: run.team.length,
      pendingCapture: run.pendingCapture?.species ?? '',
      wave: run.wave.index,
      screen,
      kills: run.kills,
      bossHp: curr.bossHp,
      bossMaxHp: curr.bossMaxHp,
      starter: run.starter,
      pickups: run.pickups.length,
      autoAim: run.autoAim,
      aimX: run.aimX,
      aimY: run.aimY,
      waveThemes: run.waveThemes,
      poolSize: run.pool.length,
      biomeColor: renderer.biomeColor,
      hazards: run.hazards.length,
      bossPhase: run.boss.phase,
      bossCoreOpen: run.boss.coreOpen,
      hazardKinds: run.hazards.map((h) => h.kind),
      moveCasts,
      labelsShown: labelPolicy.shown,
      labelsDropped: labelPolicy.dropped,
      sheetOpen: sheet.open,
    });
  }

  const cardContext: CardTextContext & typeof art = {
    ...art,
    typeOf: (species) => config.species[species]?.type,
    ballAt: (slot) => run.loadout[slot],
    previewHybrid: (a, b) => previewHybrid(run, a, b),
    memberAt: (index) => run.team[index],
    formOf: (member) => formOfMember(config, member),
    nextStep: (member) => nextStep(config, member),
    ballsAt: (level) => ballsFor(config, level),
    powerStep: config.cards.powerStep,
    damageStep: config.cards.damageStep,
    cadenceFactor: config.cards.cadenceFactor,
    vitalityHp: config.cards.vitalityHp,
  };
  // The title screen names the signature of each starter and the form it starts with (4F-D).
  const signatureText = (id: string): string => {
    for (let stage = 1; stage <= config.team.stageLevels.length + 1; stage++) {
      const shape = signatureOf(config, id, stage);
      const move = moveIdOf(config, id, stage);
      if (shape === null || move === undefined) continue;
      return signatureLine(moveName(move), shape.kind, pokemonName(formAt(config, id, stage)));
    }
    return '';
  };
  const starters: StarterOption[] = STARTER_SPECIES.flatMap((id) => {
    const type = config.species[id]?.type;
    return type === undefined ? [] : [{ id, type, signature: signatureText(id) }];
  });
  /** Wave announcement: the theme, its type and the types that beat it (ADR-027). */
  const themeLabel = (id: string): string | null => {
    const theme = config.themes?.[id];
    if (theme === undefined) return null;
    const types = themeTypes(config, id);
    const counters = typeAdvice(config, types).effective.slice(0, 3);
    const hint = counters.length > 0 ? ` · le gana ${counters.map(typeName).join(' / ')}` : '';
    return `${theme.name} (${types.map(typeName).join(' / ')})${hint}`;
  };

  const startRun = (species: string): void => {
    starter = species;
    run = createRun(config, newSeed(), starter);
    writeSnapshot(run, prev, speciesCodes, config);
    writeSnapshot(run, curr, speciesCodes, config);
    stepper.reset();
    pending.length = 0;
    startScreen.hide();
    creditsScreen.hide();
    resultsScreen.hide();
    banner.hide();
    moment.hide();
    bossMoment.hide();
    cartel.hide();
    pause.reset();
    signatureAnnounced = false;
    vulnerableHinted = false;
    namer.reset();
    signatureWasReady = false;
    readyAnnounced = false;
    sheet.hide();
    screen = 'playing';
  };
  const showMenu = (): void => {
    screen = 'menu';
    resultsScreen.hide();
    banner.hide();
    creditsScreen.hide();
    settingsScreen.hide();
    startScreen.show(
      GAME_TITLE,
      starters,
      best,
      disclaimerShort(GAME_TITLE),
      (index) => input.requestPick(index),
      showCredits,
      showSettings,
    );
  };
  function showSettings(): void {
    screen = 'settings';
    startScreen.hide();
    settingsScreen.show(
      autoAim,
      (auto) => {
        autoAim = auto;
        saveAutoAim(store, auto);
      },
      showMenu,
    );
  }
  function showCredits(): void {
    screen = 'credits';
    startScreen.hide();
    creditsScreen.show(GAME_TITLE, creditLines(GAME_TITLE), showMenu);
  }
  const finishRun = (): void => {
    const summary = summarizeRun(run, config);
    const saved = saveIfBest(store, summary);
    best = saved.best;
    screen = 'results';
    resultsScreen.show(
      summary,
      saved.best,
      saved.isNewBest,
      () => input.requestRestart(),
      () => input.requestMenu(),
    );
  };

  /** Arena point to host pixels, for the DOM effects that start on the field. */
  const toScreen = (x: number, y: number): { x: number; y: number } => {
    const view = renderer.view;
    return { x: view.offsetX + x * view.scale, y: view.offsetY + y * view.scale };
  };
  /** Place in the team of the Pokémon that fires a ball (the last place if it is gone). */
  const memberOfBall = (ballId: number): number =>
    run.loadout.find((ball) => ball.id === ballId)?.owner ?? Math.max(0, run.team.length - 1);
  /** What the replace screen shows for a pending capture: real stats and the guard of each choice. */
  const replaceView = (pending: { species: string; stage: number }): ReplaceView => ({
    guard: teamGuard(config, run.team),
    capture: {
      form: captureForm(config, pending.species, pending.stage),
      type: config.species[pending.species]?.type,
      level: captureLevel(config, pending.stage),
      stats: statsOf(config, pending.species, captureLevel(config, pending.stage)),
    },
    team: run.team.map((member, slot) => ({
      form: formOfMember(config, member),
      type: member.type,
      level: member.level,
      damageUps: member.damageUps,
      cadenceUps: member.cadenceUps,
      stats: statsOfMember(config, member),
      guardIfReplaced: guardAfterReplace(config, run.team, slot, pending),
      starter: member.starter,
    })),
  });
  /** The sheet of one Pokémon of the team: its real stats and its move (ADR-038, ADR-039). */
  const openSheet = (index: number): void => {
    const member = run.team[index];
    if (member === undefined) return;
    const stats = statsOfMember(config, member);
    const formSpecies = config.species[stats.form];
    sheet.show(
      {
        form: stats.form,
        type: member.type,
        types: formSpecies === undefined ? [member.type] : typesOfSpecies(formSpecies),
        attackType: attackTypeOf(config, member.species, stats.stage, member.type),
        level: member.level,
        stage: stats.stage,
        stats,
        damageUps: member.damageUps,
        cadenceUps: member.cadenceUps,
        move: moveIdOf(config, member.species, stats.stage),
        charge: member.charge,
        chargeNeed: chargeNeed(config, stats.stage),
        signature: member.starter && signatureOf(config, member.species, stats.stage) !== null,
      },
      art,
      () => {},
    );
  };
  teamBar.setOnInspect(openSheet);
  // A tap on a portrait throws the signature if it is ready; otherwise it opens the sheet (4F-D).
  teamBar.setOnTap((index) => {
    if (signatureReady(run, config, index)) input.requestPick(index);
    else openSheet(index);
  });
  /** The full-screen moment a boss event brings, with how long the game stops for it. */
  const bossMomentOf = (event: GameEvent): { view: BossMomentView; ms: number } | null => {
    const name = (species: string): string => pokemonName(species);
    const typeOf = (species: string): GameType | undefined => config.species[species]?.type;
    if (event.type === 'bossSpawn') {
      // The final boss is an event of its own: dark screen, silhouette, shaking, a huge name (4G-E).
      return {
        ms: event.final ? BOSS_FINAL_MS : BOSS_ENTRY_MS,
        view: {
          style: event.final ? 'final' : 'entry',
          kicker: event.final
            ? '¡POKÉMON LEGENDARIO!'
            : bossLabel(event.number, event.interludes, event.final).toUpperCase(),
          title: event.final ? name(event.species).toUpperCase() : name(event.species),
          type: typeOf(event.species),
          spriteUrl: art.spriteUrl(event.species),
        },
      };
    }
    // Only two pauses per boss (10th playtest): a big one on entry and a shorter one on defeat. The
    // change of phase never stops the game.
    if (event.type === 'bossDefeated') {
      return {
        ms: BOSS_DEFEAT_MS,
        view: {
          style: 'defeat',
          kicker: '¡JEFE DERROTADO!',
          title: name(event.species),
          type: typeOf(event.species),
          spriteUrl: art.spriteUrl(event.species),
        },
      };
    }
    return null;
  };
  /** The DOM feedback of the events of this frame: captures fly to the team bar, evolutions show. */
  const showEventFeedback = (events: readonly GameEvent[], now: number): void => {
    for (const event of events) {
      if (event.type === 'waveStart') {
        // The sign of the wave (ADR-050): its own element, one at a time, never a toast.
        const current = waveAdvice(run, config);
        cartel.push(waveCartel(current, config.themes?.[event.theme]?.name ?? ''), now);
      } else if (event.type === 'bossSpawn') {
        const type = config.species[event.species]?.type;
        const types = type === undefined ? [] : [type];
        // The cry (PokeAPI/cries) when the boss lands / lights up; louder for the final one.
        const cryAt = (event.final ? BOSS_FINAL_MS : BOSS_ENTRY_MS) * (event.final ? 0.6 : 0.55);
        window.setTimeout(() => playCry(event.species, event.final ? 1 : 0.7, sound.muted), cryAt);
        // The final boss has its own entrance (dark screen, name); no cartel over it.
        if (!event.final) {
          cartel.push(
            bossCartel(
              bossLabel(event.number, event.interludes, event.final),
              event.species,
              types,
              typeAdvice(config, types).effective,
            ),
            now,
            true,
          );
        }
      } else if (event.type === 'bossTelegraph') {
        // The first time each attack appears in a run, its name and how to dodge it (4G-F).
        const text = namer.first(event.fromEnemy ? 'enemyShot' : event.kind);
        if (text !== null) overlay.showToast(text, now);
      } else if (event.type === 'bossBarrier' && event.up) {
        const text = namer.first('barrier');
        if (text !== null) overlay.showToast(text, now);
      } else if (event.type === 'bossTimeSlow') {
        const text = namer.first('timeSlow');
        if (text !== null) overlay.showToast(text, now);
      } else if (event.type === 'bossCore' && event.open && !vulnerableHinted) {
        // The first time in a run: say what the glow means (12th playtest: "no se entiende").
        vulnerableHinted = true;
        overlay.showToast(
          '¡Está cargando su ataque y queda EXPUESTO! Golpéalo ahora y lanza tu Ultimate',
          now,
        );
      } else if (event.type === 'capture') {
        const from = toScreen(event.x, config.player.y);
        teamBar.flyCapture(
          memberOfBall(event.ballId),
          event.form,
          art.spriteUrl(event.form),
          from.x,
          from.y,
        );
      } else if (event.type === 'train') {
        teamBar.pulse(event.member);
      } else if (event.type === 'stage') {
        // An evolution, an awakening or the maximum power (ADR-037): the game stops for about a
        // second (the pause starts in the tick loop) and the silhouette, the flash and the big name
        // fill the screen (4F-E). Several at once merge into one.
        teamBar.pulse(event.member);
        if (isRealEvolution(event.kind, event.from, event.to)) {
          moment.show(
            {
              kind: event.kind,
              stage: event.stage,
              type: config.species[event.species]?.type,
              from: event.from,
              to: event.to,
              fromUrl: art.spriteUrl(event.from),
              toUrl: art.spriteUrl(event.to),
            },
            pauseMs(event.stage),
          );
        } else {
          // No evolution (the form does not change): a notice, no animation and no pause (11th playtest).
          banner.show(
            [
              spriteTile(
                art.spriteUrl(event.to),
                event.to,
                config.species[event.species]?.type,
                64,
              ),
            ],
            strongerText(event.to),
            STEP_COLOR,
          );
        }
      } else if (event.type === 'move') {
        if (event.manual && !signatureAnnounced) {
          // The first time the signature goes off in a run: a big notice (4F-D).
          signatureAnnounced = true;
          const caster = run.team[event.member];
          const form = caster === undefined ? event.species : formOfMember(config, caster);
          banner.show(
            [spriteTile(art.spriteUrl(form), form, event.element, 72)],
            `¡ULTIMATE! ${moveName(event.move)}`,
            STEP_COLOR,
          );
        }
        const at = toScreen(event.x, event.y);
        labelPolicy.offer(
          event.member,
          event.move,
          labelPriority(event.starter, event.tier),
          at.x,
          at.y,
          now,
        );
      } else if (event.type === 'hybrid') {
        teamBar.pulse(memberOfBall(event.ballId));
        banner.show(
          [
            spriteTile(
              art.spriteUrl(event.species),
              event.species,
              config.species[event.species]?.type,
              60,
            ),
            arrow('+'),
            spriteTile(
              art.spriteUrl(event.withSpecies),
              event.withSpecies,
              config.species[event.withSpecies]?.type,
              60,
            ),
          ],
          describeEvent(event) ?? '',
          '#c792ea',
        );
      }
    }
  };

  if (!skipTitle) showMenu();

  const frame = (now: number): void => {
    const elapsed = now - last;
    last = now;

    if (screen === 'menu') {
      const index = input.takePick();
      const id = index === null ? undefined : STARTER_SPECIES[index];
      if (id !== undefined && config.species[id] !== undefined) startRun(id);
      input.restartRequested = false;
      input.menuRequested = false;
    } else if (screen === 'credits' || screen === 'settings') {
      input.takePick();
      if (input.menuRequested) showMenu();
      input.restartRequested = false;
      input.menuRequested = false;
    } else if (screen === 'results') {
      input.takePick();
      if (input.restartRequested) startRun(starter);
      else if (input.menuRequested) showMenu();
      input.restartRequested = false;
      input.menuRequested = false;
    } else {
      input.restartRequested = false;
      input.menuRequested = false;
    }

    // The Pokémon sheet pauses the game here, in the app: the run takes no command, so it is the same run.
    // An evolution pauses the game for about a second in the same way (4F-E).
    const steps =
      screen === 'playing' && !sheet.open && !pause.active(now) ? stepper.advance(elapsed) : 0;
    let tickMs = 0;
    let snapshotMs = 0;
    let stopped = false; // a stage step pauses the game: no more ticks in this frame
    for (let s = 0; s < steps && !stopped; s++) {
      const cmd = bench
        ? benchCommand(run.tickCount)
        : nextCommand(run, input, POINTER_DEAD_ZONE, autoAim);
      const t0 = performance.now();
      const output = tick(run, cmd, config);
      const t1 = performance.now();
      for (const event of output.events) {
        pending.push(event);
        if (event.type === 'move') moveCasts += 1;
        const furious = run.enemies.find((e) => e.id === run.boss.id)?.species ?? '';
        const text =
          event.type === 'bossPhase'
            ? `¡${pokemonName(furious)} se ha enfurecido!`
            : describeEvent(event, themeLabel);
        // Stage steps and hybrids have their own banner with the sprites, and waves and bosses have
        // the cartel (ADR-050): no second message, a toast would cover them.
        if (
          text !== null &&
          event.type !== 'stage' &&
          event.type !== 'hybrid' &&
          event.type !== 'waveStart' &&
          event.type !== 'bossSpawn'
        ) {
          overlay.showToast(text, now);
        }
        sound.playEvent(event, now);
        if (event.type === 'stage' && isRealEvolution(event.kind, event.from, event.to)) {
          pause.add(now, pauseMs(event.stage));
          stopped = true;
        }
        // The entry, the phases and the defeat of a boss stop the game for a moment (4G-B, ADR-046).
        const bossPause = bossMomentOf(event);
        if (bossPause !== null) {
          bossMoment.show(bossPause.view, bossPause.ms);
          pause.start(now, bossPause.ms);
          stopped = true;
        }
      }
      const swap = prev;
      prev = curr;
      curr = swap;
      writeSnapshot(run, curr, speciesCodes, config);
      const t2 = performance.now();
      tickMs += t1 - t0;
      snapshotMs += t2 - t1;
      if (!bench && (run.phase === 'lost' || run.phase === 'won')) {
        finishRun();
        break;
      }
    }

    cartel.update(now);
    teamBar.update(!bench && screen === 'playing' ? run.team : null);
    if (!bench && screen === 'playing') {
      const index = run.team.findIndex((member) => member.starter);
      const ready = index >= 0 && signatureReady(run, config, index);
      if (ready && !signatureWasReady) {
        sound.play('ready', now);
        if (!readyAnnounced) {
          // The first time in a run: say what it is and how to throw it (4F-D).
          readyAnnounced = true;
          const member = run.team[index];
          const form = member === undefined ? starter : formOfMember(config, member);
          banner.show(
            [spriteTile(art.spriteUrl(form), form, member?.type, 64)],
            `Ultimate lista: toca a ${pokemonName(form)} o pulsa ${index + 1}`,
            STEP_COLOR,
          );
        }
      }
      signatureWasReady = ready;
    }
    replaceScreen.update(
      screen === 'playing' && run.phase === 'replace' && run.pendingCapture !== null
        ? replaceView(run.pendingCapture)
        : null,
      art,
      (slot) => input.requestPick(slot),
      () => input.requestPick(RELEASE_PICK),
    );
    showEventFeedback(pending, now);
    moveLabels.update(screen === 'playing' ? labelPolicy.visible(now) : [], toScreen);
    const r0 = performance.now();
    if (!skipRender) renderer.render(prev, curr, stepper.alpha, pending, elapsed);
    const renderMs = performance.now() - r0;
    pending.length = 0;

    frameCount += 1;
    emaFrame = emaFrame * 0.95 + elapsed * 0.05;
    emaTick = emaTick * 0.95 + tickMs * 0.05;
    emaSnapshot = emaSnapshot * 0.95 + snapshotMs * 0.05;
    emaRender = emaRender * 0.95 + renderMs * 0.05;

    if (metrics && frameCount > BENCH_WARMUP_FRAMES && !metrics.full) {
      metrics.record(elapsed, tickMs, snapshotMs, renderMs, steps, heapBytes());
    }
    if (metrics?.full && !benchDone) {
      benchDone = true;
      window.__benchResult = finishBench(metrics, benchLoad);
    }

    overlay.setHud(
      screen === 'menu' || screen === 'credits' || screen === 'settings'
        ? ''
        : hudText(
            curr,
            config.waves.length,
            run.seed,
            curr.bossHp > 0
              ? bossLabel(run.boss.next, (config.interludes ?? []).length, run.boss.spawned)
              : null,
          ),
    );
    overlay.updateToast(now);
    if (!bench && curr.bossSqueeze > 0.03) {
      const tide = namer.first('tide');
      if (tide !== null) overlay.showToast(tide, now);
    }
    // While the boss is exposed the alarm repeats, so it cannot be missed (4G-F).
    if (!bench && curr.bossCoreOpen > 0 && screen === 'playing' && curr.tick % 45 === 0) {
      sound.play('vulnerable', now);
    }
    overlay.setBoss(
      pokemonName(speciesIds[curr.bossSpecies] ?? ''),
      screen === 'playing' ? curr.bossHp : 0,
      curr.bossMaxHp,
      curr.bossCoreOpen > 0,
      curr.bossCoreWarning,
      curr.bossPhase === 1,
    );
    overlay.setCards(
      screen === 'playing' && curr.phase === PHASE_LEVELUP ? run.offers : null,
      cardContext,
      (index) => input.requestPick(index),
    );
    if (showDebug && frameCount % 15 === 0) {
      overlay.setDebug(
        [
          `${(1000 / emaFrame).toFixed(0)} fps (${emaFrame.toFixed(1)} ms)`,
          `tick ${emaTick.toFixed(3)} ms/frame`,
          `snapshot ${emaSnapshot.toFixed(3)} ms`,
          `render ${emaRender.toFixed(3)} ms`,
          `balls ${run.bodies.length}  enemies ${run.enemies.length}`,
          `seed ${run.seed}  tick ${run.tickCount}`,
          benchDone ? 'bench: done' : bench ? 'bench: measuring…' : '',
        ].join('\n'),
      );
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
}
