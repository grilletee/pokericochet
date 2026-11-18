import { gameConfig } from '../../src/data';
import { createRun, type GameConfig, tick } from '../../src/domain';
import { legacyCapture } from '../domain/legacyCapture';
import { activePolicy, commandFor } from './bots';

/**
 * 4X: how the team grows until each boss, with the old capture (drops) and the new one (join
 * encounters and the capture of bosses), for the same seeds and bot. A diagnosis, not a test.
 */
export interface Growth {
  readonly members: number;
  readonly levels: number;
  readonly playerLevel: number;
  readonly reached: boolean;
}

export function growthAtBosses(
  config: GameConfig,
  seed: number,
  starter: string,
  bosses = 3,
): Growth[] {
  const run = createRun(config, seed, starter);
  const out: Growth[] = [];
  for (let i = 0; i < 60 * 60 * 25 && run.phase !== 'lost' && run.phase !== 'won'; i++) {
    for (const e of tick(run, commandFor(activePolicy, run, config), config).events) {
      if (e.type === 'bossSpawn' && !e.final && out.length < bosses) {
        out.push({
          members: run.team.length,
          levels: run.team.reduce((a, m) => a + m.level, 0),
          playerLevel: run.player.level,
          reached: true,
        });
      }
    }
  }
  return out;
}

export const OLD_RULES = legacyCapture(gameConfig);
