"""Mutants of the 4F-E (capture level from the stage, evolution pause, boss and wave texts, curve).
Paths are relative to the project root; `tools/mutation/run.py` applies them to an isolated copy."""

T = "src/domain/team.ts"
W = "src/domain/waves.ts"
SU = "src/domain/summary.ts"
EM = "src/ui/evolutionMoment.ts"
ST = "src/ui/screenText.ts"
CF = "src/data/config/index.ts"

M = [
    # ---- "you capture what you beat": the capture level comes from the stage thresholds
    ("capture: index off by one", [(T, "levels[Math.min(stage - 2, levels.length - 1)] ?? 1", "levels[Math.min(stage - 1, levels.length - 1)] ?? 1")]),
    ("capture: no clamp past the last stage", [(T, "levels[Math.min(stage - 2, levels.length - 1)] ?? 1", "levels[stage - 2] ?? 1")]),
    ("capture: stage 1 starts above 1", [(T, "  if (stage <= 1) return 1;\n  return levels", "  if (stage <= 1) return 2;\n  return levels")]),
    ("capture: no fallback", [(T, "levels[Math.min(stage - 2, levels.length - 1)] ?? 1", "levels[Math.min(stage - 2, levels.length - 1)] ?? 0")]),
    # ---- the pause of the evolution
    ("pause: stage 3 as short as 2", [(EM, "return stage >= 3 ? 1200 : 1000;", "return stage > 3 ? 1200 : 1000;")]),
    ("pause: stage 2 as long as 3", [(EM, "return stage >= 3 ? 1200 : 1000;", "return stage >= 2 ? 1200 : 1000;")]),
    ("pause: a new step shortens it", [(EM, "this.until = Math.max(this.until, now + ms);", "this.until = now + ms;")]),
    ("pause: a new step never extends", [(EM, "this.until = Math.max(this.until, now + ms);", "this.until = Math.min(this.until, now + ms);")]),
    ("pause: still stopped at the end", [(EM, "return now < this.until;", "return now <= this.until;")]),
    ("pause: never stopped", [(EM, "return now < this.until;", "return false;")]),
    ("pause: reset keeps it", [(EM, "  reset(): void {\n    this.until = Number.NEGATIVE_INFINITY;", "  reset(): void {\n    this.until = this.until;")]),
    ("pause: seconds count each step", [(EM, "longest.set(step.tick, Math.max(longest.get(step.tick) ?? 0, pauseMs(step.stage)));", "longest.set(step.tick + longest.size, pauseMs(step.stage));")]),
    ("pause: seconds take the shortest", [(EM, "Math.max(longest.get(step.tick) ?? 0, pauseMs(step.stage))", "Math.min(longest.get(step.tick) ?? 99999, pauseMs(step.stage))")]),
    ("pause: seconds in ms", [(EM, "  return total / 1000;", "  return total;")]),
    # ---- boss and wave texts
    ("text: final boss called by number", [(ST, "return final ? 'Jefe final' : `Jefe ${number}/${interludes}`;", "return final ? `Jefe ${number}/${interludes}` : 'Jefe final';")]),
    ("text: boss number and total swapped", [(ST, "`Jefe ${number}/${interludes}`", "`Jefe ${interludes}/${number}`")]),
    ("text: the spawn message loses the species", [(ST, "${bossLabel(event.number, event.interludes, event.final)}: ${pokemonName(event.species)}!", "${bossLabel(event.number, event.interludes, event.final)}!")]),
    ("text: results count cleared waves", [(ST, "`Llegaste a la oleada ${summary.waveReached}/${summary.wavesTotal}.`", "`Llegaste a la oleada ${summary.wavesCleared}/${summary.wavesTotal}.`")]),
    ("text: results swap bosses", [(ST, "`Derrotaste a ${summary.bossesDefeated} de ${summary.bossesTotal} jefes.`", "`Derrotaste a ${summary.bossesTotal} de ${summary.bossesDefeated} jefes.`")]),
    ("text: a win is not announced", [(ST, "? '¡Derrotaste al jefe final!'", "? 'Llegaste al final.'")]),
    # ---- the summary
    ("summary: wave reached is the cleared one", [(SU, "waveReached: Math.min(run.wave.index + 1, Math.max(1, wavesTotal)),", "waveReached: Math.min(run.wave.index, Math.max(1, wavesTotal)),")]),
    ("summary: wave reached unbounded", [(SU, "waveReached: Math.min(run.wave.index + 1, Math.max(1, wavesTotal)),", "waveReached: run.wave.index + 1,")]),
    ("summary: bosses without the final", [(SU, "(config.interludes ?? []).length + (config.boss === undefined ? 0 : 1)", "(config.interludes ?? []).length")]),
    ("summary: bosses always count the final", [(SU, "(config.interludes ?? []).length + (config.boss === undefined ? 0 : 1)", "(config.interludes ?? []).length + 1")]),
    # ---- the boss event
    ("boss: number counts from 0", [(W, "placeBoss(run, config, next.byType[type], next, run.boss.next + 1, false);", "placeBoss(run, config, next.byType[type], next, run.boss.next, false);")]),
    ("boss: the final has the number of the last interlude", [(W, "      interludes.length + 1,\n      true,", "      interludes.length,\n      true,")]),
    ("boss: the event never says final", [(W, "    final: isFinal,", "    final: false,")]),
    ("boss: the event carries the base species", [(W, "    species: species.id,\n    number,", "    species: speciesId + 'x',\n    number,")]),
    # ---- the curve
    ("curve: wave 7 easier than wave 6", [(CF, "      hpScale: 3.1,", "      hpScale: 2.0,")]),
]
