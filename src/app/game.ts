import { gameConfig } from '../data';
import {
  type Command,
  createRun,
  createSnapshot,
  type GameConfig,
  type GameEvent,
  type Run,
  tick,
  writeSnapshot,
} from '../domain';
import { Renderer } from '../render';
import { Overlay } from '../ui';
import { BENCH_BALLS, BENCH_ENEMIES, benchScenario } from './benchScenario';
import { FixedStepper } from './fixedStepper';
import { Input } from './input';
import { commandFromInput } from './inputLogic';
import { FrameMetrics, type Stats, summarize } from './metrics';

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
    __debug?: () => { tick: number; playerX: number; hp: number; balls: number; enemies: number };
  }
}

function heapBytes(): number {
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
  return perf.memory?.usedJSHeapSize ?? 0;
}

function benchCommand(tickCount: number): Command {
  return { moveX: tickCount % 240 < 120 ? 1 : -1 };
}

function finishBench(metrics: FrameMetrics, balls: number, enemies: number): BrowserBenchResult {
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
    scenario: `${balls} balls, ${enemies} enemies`,
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

/**
 * Composition root of the game: wires the domain, the renderer, the input and the overlay, and
 * owns the clock. The domain never sees time; it only receives one command per tick.
 */
export async function startGame(host: HTMLElement): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const bench = params.has('bench');
  const showDebug = bench || params.has('debug');
  // Measurement aid: run tick + snapshot but skip drawing, to separate the costs.
  const skipRender = params.has('norender');

  let config: GameConfig = gameConfig;
  const newSeed = (): number => Number(params.get('seed')) || Date.now() >>> 0;
  let run: Run;
  if (bench) {
    const scenario = benchScenario(gameConfig, 1);
    run = scenario.run;
    config = scenario.config;
  } else {
    run = createRun(config, newSeed(), 'charmander');
  }

  let prev = createSnapshot(MAX_SLOTS, MAX_ENEMIES);
  let curr = createSnapshot(MAX_SLOTS, MAX_ENEMIES);
  writeSnapshot(run, prev);
  writeSnapshot(run, curr);

  const renderer = await Renderer.create(host, config, MAX_SLOTS, MAX_ENEMIES);
  const overlay = new Overlay(host);
  const input = new Input(host, () => renderer.view);
  const stepper = new FixedStepper();
  const metrics = bench ? new FrameMetrics(BENCH_MEASURED_FRAMES) : null;
  const pending: GameEvent[] = [];

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
    });
  }

  const restart = (): void => {
    run = createRun(config, newSeed(), 'charmander');
    writeSnapshot(run, prev);
    writeSnapshot(run, curr);
    stepper.reset();
    pending.length = 0;
  };

  const frame = (now: number): void => {
    const elapsed = now - last;
    last = now;

    if (input.restartRequested) {
      input.restartRequested = false;
      if (!bench && run.phase === 'lost') restart();
    }

    const steps = stepper.advance(elapsed);
    let tickMs = 0;
    let snapshotMs = 0;
    for (let s = 0; s < steps; s++) {
      const cmd = bench
        ? benchCommand(run.tickCount)
        : commandFromInput(input.state, run.player.x, POINTER_DEAD_ZONE);
      const t0 = performance.now();
      const output = tick(run, cmd, config);
      const t1 = performance.now();
      for (const event of output.events) pending.push(event);
      const swap = prev;
      prev = curr;
      curr = swap;
      writeSnapshot(run, curr);
      const t2 = performance.now();
      tickMs += t1 - t0;
      snapshotMs += t2 - t1;
    }

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
      window.__benchResult = finishBench(metrics, BENCH_BALLS, BENCH_ENEMIES);
    }

    overlay.setHud(`PV ${Math.max(0, Math.round(curr.playerHp))}`);
    overlay.setMessage(
      curr.phase === 0 ? null : 'Derrota\nPulsa R o toca la pantalla para reiniciar',
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
