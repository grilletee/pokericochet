// Read-only helper: for every biome, a (seed, wave) in which it is the theme of the wave.
//   pnpm exec tsx tools/browser-bench/biomeSeeds.ts   -> JSON {"biomeId": [seed, wave]}
import { gameConfig } from '../../src/data';
import { createRun } from '../../src/domain';

const found: Record<string, [number, number]> = {};
const ids = Object.keys(gameConfig.themes ?? {});
for (let seed = 1; seed <= 400 && Object.keys(found).length < ids.length; seed++) {
  const run = createRun(gameConfig, seed, 'pikachu');
  run.waveThemes.forEach((id, wave) => {
    if (found[id] === undefined) found[id] = [seed, wave];
  });
}
console.log(JSON.stringify(found));
