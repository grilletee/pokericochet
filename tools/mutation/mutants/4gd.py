"""Mutants of the 4G-D: the exposure while the boss charges (ADR-054), the exclusive mechanics of the
legendaries, the entrance of the boss, the notice instead of the evolution animation and the data of
the legendaries. Run with: python tools/mutation/run.py tools/mutation/mutants/4gd.py"""

BF = "src/domain/bossFight.ts"
TK = "src/domain/tick.ts"
SN = "src/domain/snapshot.ts"
BS = "src/data/config/bosses.ts"
ST = "src/ui/screenText.ts"
GM = "src/app/game.ts"

M = [
    # ---- the exposure (charging the strong attack)
    ("charge: exposed takes the guarded damage", [(BF, "run.boss.coreOpen > 0 ? fight.openMult : fight.closedMult", "fight.closedMult")]),
    ("charge: guarded takes the exposed damage", [(BF, "run.boss.coreOpen > 0 ? fight.openMult : fight.closedMult", "fight.openMult")]),
    ("charge: the Ultimate gets no bonus", [(BF, "return run.boss.coreOpen > 0 ? fight.ultimateOpenBonus : 1;", "return 1;")]),
    ("charge: the Ultimate always gets the bonus", [(BF, "return run.boss.coreOpen > 0 ? fight.ultimateOpenBonus : 1;", "return fight.ultimateOpenBonus;")]),
    ("charge: the strong attack is never launched", [(BF, "spawnAttack(run, config, boss, phase, phase.strong);", "")]),
    ("charge: it launches a normal attack instead", [(BF, "spawnAttack(run, config, boss, phase, phase.strong);", "spawnAttack(run, config, boss, phase, phase.attacks[0] ?? phase.strong);")]),
    ("charge: it is not announced", [(BF, "if (run.boss.coreIn === fight.coreWarnTicks) {", "if (run.boss.coreIn === -1) {")]),
    ("charge: the announcement comes late", [(BF, "if (run.boss.coreIn === fight.coreWarnTicks) {", "if (run.boss.coreIn === fight.coreWarnTicks - 20) {")]),
    ("charge: it never opens", [(BF, "run.boss.coreOpen = phase.coreOpen;", "run.boss.coreOpen = 0;")]),
    ("charge: the exposure never closes", [(BF, "run.boss.coreOpen -= 1;\n    if (run.boss.coreOpen === 0) {", "run.boss.coreOpen -= 0;\n    if (run.boss.coreOpen === 0) {")]),
    ("charge: the clock is not reset", [(BF, "run.boss.coreIn = phase.coreEvery;\n      run.events.push({ type: 'bossCore', open: false, warning: false });", "run.events.push({ type: 'bossCore', open: false, warning: false });")]),
    ("fury: the charge clock of the fury is the normal one", [(BF, "run.boss.coreIn = pattern.phases[1].coreEvery;", "run.boss.coreIn = pattern.phases[0].coreEvery;")]),
    ("fury: damage may skip the fury", [(BF, "const floor = run.boss.phase === 0 ? fight.rageAt * run.boss.maxHp : 0;", "const floor = 0;")]),
    # ---- the entrance of the boss
    ("entrance: the boss never comes down fast", [(TK, "e.y += BOSS_ENTRY_SPEED;", "e.y += e.speed;")]),
    ("entrance: it comes down for ever", [(TK, "e.y < e.radius + BOSS_HOVER", "e.y < 100000")]),
    ("entrance: any enemy gets the entrance", [(TK, "} else if (e.id === run.boss.id && run.boss.maxHp > 0 && e.y < e.radius + BOSS_HOVER) {", "} else if (e.y < e.radius + BOSS_HOVER) {")]),
    # ---- tide
    ("tide: the field never narrows", [(BF, "run.boss.squeeze = Math.min(goal, run.boss.squeeze + goal / mechanic.riseTicks);", "run.boss.squeeze = 0;")]),
    ("tide: no limit to the squeeze", [(BF, "run.boss.squeeze = Math.min(goal, run.boss.squeeze + goal / mechanic.riseTicks);", "run.boss.squeeze = run.boss.squeeze + goal / mechanic.riseTicks;")]),
    ("tide: the fury does not squeeze more", [(BF, "const goal = mechanic.maxSqueeze * (fury ? 1 : 0.55);", "const goal = mechanic.maxSqueeze * 0.55;")]),
    ("tide: the player is not pushed in", [(BF, "run.player.x = Math.max(margin, Math.min(width - margin, run.player.x));\n      break;", "break;")]),
    ("tide: the margin ignores the squeeze", [(BF, "return config.player.margin + run.boss.squeeze * (config.arena.width * 0.3);", "return config.player.margin;")]),
    # ---- cracks
    ("cracks: none open", [(BF, "kind: 'crack',", "kind: 'zone',")]),
    ("cracks: they open without warning", [(BF, "telegraph: 80,\n            active: mechanic.lastTicks,", "telegraph: 0,\n            active: mechanic.lastTicks,")]),
    ("cracks: they do not hurt", [(BF, "damage: 1.5,", "damage: 0,")]),
    ("cracks: the fury opens none extra", [(BF, "const count = mechanic.count + (fury ? 1 : 0);", "const count = mechanic.count;")]),
    ("cracks: they hurt only once", [(BF, "strike(run, config, hazard);\n        hazard.struck = false;", "strike(run, config, hazard);")]),
    # ---- barrier
    ("barrier: it never goes up", [(BF, "run.boss.barrier = ticksOf(mechanic.onTicks * (fury ? 1.25 : 1));", "")]),
    ("barrier: it reflects nothing", [(BF, "return run.boss.barrier > 0;", "return false;")]),
    ("barrier: it reflects always", [(BF, "return run.boss.barrier > 0;", "return true;")]),
    ("barrier: it never goes down", [(BF, "run.boss.barrier -= 1;\n        if (run.boss.barrier === 0) {", "run.boss.barrier -= 0;\n        if (run.boss.barrier === 0) {")]),
    ("barrier: the ball hurts through it", [(TK, "const reflected = target.id === run.boss.id && barrierUp(run);", "const reflected = false;")]),
    ("barrier: every enemy reflects", [(TK, "const reflected = target.id === run.boss.id && barrierUp(run);", "const reflected = barrierUp(run);")]),
    # ---- time slow
    ("slow: it never slows", [(BF, "return mechanic?.kind === 'timeSlow' ? mechanic.mult : 1;", "return 1;")]),
    ("slow: it slows for ever", [(BF, "if (run.boss.timeSlow <= 0) return 1;", "")]),
    ("slow: it never starts", [(BF, "run.boss.timeSlow = ticksOf(mechanic.lastTicks * (fury ? 1.3 : 1));", "")]),
    ("slow: the player ignores it", [(TK, "* playerSpeedMult(run, config),", "* 1,")]),
    # ---- portals
    ("portals: they carry nowhere", [(BF, "run.player.x = hazard.link;", "")]),
    ("portals: they carry back at once", [(BF, "run.boss.portalCool = 45;", "run.boss.portalCool = 0;")]),
    ("portals: the cool-down does not count", [(BF, "if (covers(run, hazard) && run.boss.portalCool <= 0) {", "if (covers(run, hazard)) {")]),
    ("portals: the pair does not point back", [(BF, "addHazard(run, config, make(b, a));", "addHazard(run, config, make(b, b));")]),
    ("portals: only one is opened", [(BF, "addHazard(run, config, make(b, a));", "")]),
    # ---- the snapshot for the render
    ("snapshot: the barrier is never shown", [(SN, "snap.bossBarrier = run.boss.barrier > 0;", "snap.bossBarrier = false;")]),
    ("snapshot: the slow is never shown", [(SN, "snap.bossTimeSlow = run.boss.timeSlow > 0;", "snap.bossTimeSlow = false;")]),
    ("snapshot: the squeeze is never shown", [(SN, "snap.bossSqueeze = run.boss.squeeze;", "snap.bossSqueeze = 0;")]),
    # ---- the data
    ("data: a legendary loses its mechanic", [(BS, "    spec.mechanic,\n", "    undefined,\n")]),
    ("data: the legendaries are not slower", [(BS, "ticksOf(spec.interval * 1.5)", "ticksOf(spec.interval * 0.5)")]),
    ("data: the finals list is empty", [(BS, "export const FINAL_BOSSES: readonly string[] = Object.keys(LEGENDS);", "export const FINAL_BOSSES: readonly string[] = [];")]),
    ("data: the strong attack is the normal one", [(BS, "phase(scaled(normal), strongOf(strong[0]), { ...base, interval, damageMult: 1 }),", "phase(scaled(normal), scaled(normal)[0] as BossAttackDef, { ...base, interval, damageMult: 1 }),")]),
    # ---- the evolution animation only for real evolutions
    ("evolution: any stage step animates", [(ST, "return kind === 'evolve' && from !== to;", "return kind === 'evolve';")]),
    ("evolution: nothing animates", [(ST, "return kind === 'evolve' && from !== to;", "return false;")]),
    ("evolution: a notice does not say stronger", [(ST, "se vuelve más fuerte! Este nivel sube mucho sus estadísticas", "evoluciona")]),
    ("evolution: the pause starts without a real evolution", [(GM, "if (event.type === 'stage' && isRealEvolution(event.kind, event.from, event.to)) {", "if (event.type === 'stage') {")]),
]
