// Where does the heap churn of a frame come from? Runs the stress bench with the sampling heap
// profiler of the browser (CDP) on an UNMINIFIED build and prints the biggest allocators.
//
//   pnpm exec node tools/browser-bench/profile.mjs [--query x1] [--cpu]
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const queryIndex = args.indexOf('--query');
const extraQuery = queryIndex >= 0 ? `&${args[queryIndex + 1]}` : '';
const cpu = args.includes('--cpu');
const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
await build({ logLevel: 'error', build: { minify: false, outDir: 'dist-profile' } });
const server = await preview({
  build: { outDir: 'dist-profile' },
  preview: { port: 4177, strictPort: true, host: '127.0.0.1' },
});
const browser = await chromium.launch({ executablePath, headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 760 } });
  const cdp = await page.context().newCDPSession(page);
  // --real: the real peak load (24 balls, 30 enemies), the one the budget is about.
  const load = args.includes('--real') ? 'bench=real' : 'bench';
  await page.goto(`http://127.0.0.1:4177/?${load}${extraQuery}`);
  await page.bringToFront();
  if (cpu) await cdp.send('Profiler.enable');
  if (cpu) await cdp.send('Profiler.start');
  else {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048 });
  }
  await page.waitForFunction(() => window.__benchResult !== undefined, null, {
    timeout: 120_000,
    polling: 500,
  });
  const rows = new Map();
  if (cpu) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map();
    const dt = profile.timeDeltas;
    for (const [i, id] of profile.samples.entries()) {
      self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0));
    }
    for (const node of profile.nodes) {
      const f = node.callFrame;
      const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
      rows.set(key, (rows.get(key) ?? 0) + (self.get(node.id) ?? 0) / 1000);
    }
  } else {
    const { profile } = await cdp.send('HeapProfiler.stopSampling');
    const walk = (node) => {
      const f = node.callFrame;
      const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
      rows.set(key, (rows.get(key) ?? 0) + node.selfSize);
      for (const c of node.children) walk(c);
    };
    walk(profile.head);
  }
  const top = [...rows.entries()].sort((a, b) => b[1] - a[1]).slice(0, 45);
  for (const [k, v] of top)
    console.log(
      `${(cpu ? `${v.toFixed(1)} ms` : `${Math.round(v / 1024)} KB`).padStart(10)}  ${k}`,
    );
} finally {
  await browser.close();
  server.httpServer.close();
}
