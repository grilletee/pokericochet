"""Mutants of the 4G-E: the form chain of the evolution (Bagon, Shelgon, Salamence), the enemies that
shoot, the final boss alone, the new mechanics, the sounds of the exposure and of the final boss.
Run with: python tools/mutation/run.py tools/mutation/mutants/4ge.py"""

TM = "src/domain/team.ts"
BF = "src/domain/bossFight.ts"
WV = "src/domain/waves.ts"
AU = "src/ui/audio.ts"
EM = "src/ui/evolutionMoment.ts"
SN = "src/domain/snapshot.ts"

M = [
    ("chain: a jump skips the intermediate forms", [(TM, "for (let stage = before + 1; stage <= after; stage++) {", "for (let stage = after; stage <= after; stage++) {")]),
    ("chain: the first step is repeated", [(TM, "for (let stage = before + 1; stage <= after; stage++) {", "for (let stage = before; stage <= after; stage++) {")]),
    ("chain: from is always the old form", [(TM, "from: formAt(config, member.species, stage - 1),", "from: formAt(config, member.species, before),")]),
    ("chain: to is always the last form", [(TM, "to: formAt(config, member.species, stage),", "to: formAt(config, member.species, after),")]),
    ("pause: a chain does not add up", [(EM, "this.until = Math.max(this.until, now) + ms;", "this.until = Math.max(this.until, now + ms);")]),
    ("fire: the boss shoots too", [(BF, "    if (e.id === run.boss.id) continue;\n    const rule", "    const rule")]),
    ("fire: everybody shoots", [(BF, "e.id % fire.shooterOneIn !== 0) continue;", "false) continue;")]),
    ("fire: from the top edge", [(BF, "if (e.y < 30 || e.y > config.arena.defenseLineY - 140) continue;", "if (e.y > config.arena.defenseLineY - 140) continue;")]),
    ("fire: from beside the line", [(BF, "if (e.y < 30 || e.y > config.arena.defenseLineY - 140) continue;", "if (e.y < 30) continue;")]),
    ("fire: no clock", [(BF, "if ((run.tickCount + e.id * 37) % rule.everyTicks !== 0) continue;", "")]),
    ("fire: no limit at once", [(BF, "if (shots >= fire.maxAtOnce) break;", "")]),
    ("fire: aimed at the middle", [(BF, "x: run.player.x,\n      link: ENEMY_SHOT,", "x: 240,\n      link: ENEMY_SHOT,")]),
    ("fire: not announced", [(BF, "telegraph: fire.telegraphTicks,", "telegraph: 0,")]),
    ("fire: shots vanish with no boss", [(BF, "      if (h.link !== ENEMY_SHOT) continue;\n", "      continue;\n")]),
    ("fire: a boss's things stay after it dies", [(BF, "      if (h.link !== ENEMY_SHOT) continue;\n", "")]),
    ("final: it summons like the others", [(WV, "if (def.summonCount > 0 && run.boss.tick", "if (run.boss.tick")]),
    ("mech: the storm is not announced", [(BF, "telegraph: 70 + i * 12,", "telegraph: 0,")]),
    ("mech: meteors do not fall", [(BF, "                  speed: 5,\n", "                  speed: 0,\n")]),
    ("sound: no alarm when exposed", [(AU, "return event.open ? 'vulnerable' : null;", "return null;")]),
    ("sound: alarm when it stops charging", [(AU, "return event.open ? 'vulnerable' : null;", "return 'vulnerable';")]),
    ("sound: no dread for the final", [(AU, "return event.final ? 'tension' : null;", "return null;")]),
    ("sound: dread for every boss", [(AU, "return event.final ? 'tension' : null;", "return 'tension';")]),
    ("snapshot: the final stage is never shown", [(SN, "snap.bossFinal =", "snap.bossFinal = false; void ")]),
]
