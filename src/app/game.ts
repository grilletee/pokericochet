import { ART_SPECIES_IDS, formOf, gameConfig, STARTER_SPECIES } from '../data';
import {
  type Command,
  createBall,
  createRun,
  createSnapshot,
  dropCapture,
  type GameConfig,
  type GameEvent,
  PHASE_LEVELUP,
  previewHybrid,
  type Run,
  type Snapshot,
  summarizeRun,
  tick,
  writeSnapshot,
} from '../domain';
import { Renderer } from '../render';
import {
  AimToggle,
  type CardTextContext,
  CreditsScreen,
  creditLines,
  describeEvent,
  disclaimerShort,
  EvolutionBanner,
  Overlay,
  ResultsScreen,
  SoundFx,
  SoundToggle,
  type StarterOption,
  StartScreen,
  speciesName,
  spriteTile,
  TeamBar,
  TunePanel,
} from '../ui';
import { BENCH_LOADS, type BenchLoad, benchScenario } from './benchScenario';
import { type BestRun, browserStore, loadBestRun, saveIfBest } from './bestRun';
import { GAME_TITLE } from './config';
import { FixedStepper } from './fixedStepper';
import { Input } from './input';
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
  input.takePick(); // a number key pressed outside a level-up is not a choice
  return commandFromInput(input.state, run.player.x, deadZone, autoAim);
}

function hudText(snap: Snapshot, waveCount: number, seed: number): string {
  const wave =
    waveCount > 0 && snap.waveIndex >= waveCount
      ? 'Jefe'
      : `Oleada ${Math.min(snap.waveIndex + 1, Math.max(1, waveCount))}/${waveCount}`;
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

type Screen = 'menu' | 'credits' | 'playing' | 'results';

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
  if (wave !== null) run.wave.index = wave; // wave=7 jumps straight to the boss
  const loadout = params.get('loadout');
  if (loadout !== null) {
    const species = loadout.split(',').filter((id) => config.species[id] !== undefined);
    run.loadout = species.map((id) => {
      const ball = createBall(config, id, run.nextBallId);
      run.nextBallId += 1;
      return ball;
    });
    run.cooldowns = run.loadout.map(() => 0);
  }
  // ballLevel=2 raises every ball of the loadout to that level (to reach a hybrid quickly).
  const ballLevel = number('ballLevel');
  if (ballLevel !== null) {
    run.loadout = run.loadout.map((ball) => ({
      ...ball,
      level: Math.max(1, Math.min(3, ballLevel)),
    }));
  }
  // offers=hybrid opens a level-up with the hybrid of the first two balls, if it is allowed.
  if (params.get('offers') === 'hybrid' && previewHybrid(run, 0, 1) !== null) {
    run.offers = [{ kind: 'hybrid', a: 0, b: 1 }, { kind: 'damage' }];
    run.phase = 'levelup';
  }
  // capture=<species> lets a captured ball of that species fall in front of the launcher.
  const captured = params.get('capture');
  const def = captured === null ? undefined : config.species[captured];
  if (captured !== null && def !== undefined) {
    dropCapture(run, config, captured, def.type, run.player.x, 200);
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

  // Species -> small code the render uses to pick art; the domain never sees art.
  // The art table also holds every evolution form; `forms[code][level - 1]` is the code to draw.
  const speciesIds = [...new Set([...Object.keys(config.species), ...ART_SPECIES_IDS])];
  const speciesCodes = new Map(speciesIds.map((id, code) => [id, code]));
  const forms = speciesIds.map((id) =>
    [1, 2, 3].map((level) => speciesCodes.get(formOf(id, level)) ?? speciesCodes.get(id) ?? 0),
  );
  const urls = spriteUrls();
  const art = {
    spriteUrl: (species: string, level: number): string | undefined =>
      urls.get(formOf(species, level)),
  };
  const formName = (species: string, level: number): string => speciesName(formOf(species, level));
  let prev = createSnapshot(MAX_SLOTS, MAX_ENEMIES);
  let curr = createSnapshot(MAX_SLOTS, MAX_ENEMIES);
  writeSnapshot(run, prev, speciesCodes);
  writeSnapshot(run, curr, speciesCodes);

  const renderer = await Renderer.create(
    host,
    config,
    MAX_SLOTS,
    MAX_ENEMIES,
    await loadSpeciesTextures(speciesIds),
    forms,
  );
  const overlay = new Overlay(host);
  const teamBar = new TeamBar(host, art, (species) => config.species[species]?.type);
  const banner = new EvolutionBanner(host);
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
  let autoAim = loadAutoAim(store);
  const aimToggle = new AimToggle(host, autoAim, (auto) => {
    autoAim = auto;
    saveAutoAim(store, auto);
  });
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
    });
  }

  const cardContext: CardTextContext & typeof art = {
    ...art,
    typeOf: (species) => config.species[species]?.type,
    ballAt: (slot) => run.loadout[slot],
    previewHybrid: (a, b) => previewHybrid(run, a, b),
    evolvesWith: (species) =>
      run.loadout.some((ball) => ball.species === species && ball.level === 1 && !ball.hybrid),
    damageStep: config.cards.damageStep,
    cadenceFactor: config.cards.cadenceFactor,
    vitalityHp: config.cards.vitalityHp,
  };
  const starters: StarterOption[] = STARTER_SPECIES.flatMap((id) => {
    const type = config.species[id]?.type;
    return type === undefined ? [] : [{ id, type }];
  });
  const bossName = config.boss ? speciesName(config.boss.species) : '';

  const startRun = (species: string): void => {
    starter = species;
    run = createRun(config, newSeed(), starter);
    writeSnapshot(run, prev, speciesCodes);
    writeSnapshot(run, curr, speciesCodes);
    stepper.reset();
    pending.length = 0;
    startScreen.hide();
    creditsScreen.hide();
    resultsScreen.hide();
    banner.hide();
    screen = 'playing';
  };
  const showMenu = (): void => {
    screen = 'menu';
    resultsScreen.hide();
    banner.hide();
    creditsScreen.hide();
    startScreen.show(
      GAME_TITLE,
      starters,
      best,
      disclaimerShort(GAME_TITLE),
      (index) => input.requestPick(index),
      showCredits,
    );
  };
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
  /** The DOM feedback of the events of this frame: captures fly to the team bar, evolutions show. */
  const showEventFeedback = (events: readonly GameEvent[]): void => {
    for (const event of events) {
      if (event.type === 'capture') {
        const from = toScreen(event.x, config.player.y);
        teamBar.flyCapture(
          event.ballId,
          event.species,
          art.spriteUrl(event.species, 1),
          from.x,
          from.y,
        );
      } else if (event.type === 'evolve') {
        const type = config.species[event.species]?.type;
        teamBar.pulse(event.ballId);
        banner.show(
          [
            spriteTile(art.spriteUrl(event.species, event.level - 1), event.species, type, 64),
            arrow(),
            spriteTile(art.spriteUrl(event.species, event.level), event.species, type, 72),
          ],
          describeEvent(event, formName) ?? '',
          '#ffd54f',
        );
      } else if (event.type === 'hybrid') {
        teamBar.pulse(event.ballId);
        banner.show(
          [
            spriteTile(
              art.spriteUrl(event.species, event.level),
              event.species,
              config.species[event.species]?.type,
              60,
            ),
            arrow('+'),
            spriteTile(
              art.spriteUrl(event.withSpecies, event.level),
              event.withSpecies,
              config.species[event.withSpecies]?.type,
              60,
            ),
          ],
          describeEvent(event, formName) ?? '',
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
    } else if (screen === 'credits') {
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
      if (input.autoAimToggleRequested) {
        autoAim = !autoAim;
        aimToggle.set(autoAim, false);
        saveAutoAim(store, autoAim);
      }
      input.autoAimToggleRequested = false;
      input.restartRequested = false;
      input.menuRequested = false;
    }

    const steps = screen === 'playing' ? stepper.advance(elapsed) : 0;
    let tickMs = 0;
    let snapshotMs = 0;
    for (let s = 0; s < steps; s++) {
      const cmd = bench
        ? benchCommand(run.tickCount)
        : nextCommand(run, input, POINTER_DEAD_ZONE, autoAim);
      const t0 = performance.now();
      const output = tick(run, cmd, config);
      const t1 = performance.now();
      for (const event of output.events) {
        pending.push(event);
        const text = describeEvent(event, formName);
        // Evolutions and hybrids have their own banner with the sprites: no second message.
        if (text !== null && event.type !== 'evolve' && event.type !== 'hybrid') {
          overlay.showToast(text, now);
        }
        sound.playEvent(event, now);
      }
      const swap = prev;
      prev = curr;
      curr = swap;
      writeSnapshot(run, curr, speciesCodes);
      const t2 = performance.now();
      tickMs += t1 - t0;
      snapshotMs += t2 - t1;
      if (!bench && (run.phase === 'lost' || run.phase === 'won')) {
        finishRun();
        break;
      }
    }

    teamBar.update(!bench && screen === 'playing' ? run.loadout : null);
    showEventFeedback(pending);
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
      screen === 'menu' || screen === 'credits' ? '' : hudText(curr, config.waves.length, run.seed),
    );
    overlay.updateToast(now);
    overlay.setBoss(bossName, screen === 'playing' ? curr.bossHp : 0, curr.bossMaxHp);
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
