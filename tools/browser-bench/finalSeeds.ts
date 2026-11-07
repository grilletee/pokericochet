// Read-only helper: which seeds bring which legendary as the final boss (for captures and playtests).
//   pnpm exec vite-node tools/browser-bench/finalSeeds.ts [from] [to]
import { gameConfig } from '../../src/data';
import { createRun, tick } from '../../src/domain';

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 150);
const strong = {
  ...gameConfig,
  player: { ...gameConfig.player, maxHp: 1e9 },
  interludes: [],
  waves: gameConfig.waves.map((w) => ({ ...w, durationTicks: 20 })),
};
const out: Record<string, number[]> = {};
for (let seed = from; seed <= to; seed++) {
  const run = createRun(strong, seed, 'pikachu');
  for (let t = 0; t < 200 && !run.boss.spawned; t++) tick(run, { moveX: 0 }, strong);
  const boss = run.enemies.find((e) => e.id === run.boss.id);
  const id = boss?.species ?? '?';
  const list = out[id] ?? [];
  list.push(seed);
  out[id] = list;
}
for (const [id, seeds] of Object.entries(out))
  console.log(id.padEnd(18), seeds.slice(0, 5).join(','));
