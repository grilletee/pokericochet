"""Mutants of the 4G-F: the one warning time and the staggering of the warnings, the shots that come out
of an enemy, the final boss alone on its own field, the first-time attack names and the volumes.
Run with: python tools/mutation/run.py tools/mutation/mutants/4gf.py"""

BF = "src/domain/bossFight.ts"
WV = "src/domain/waves.ts"
BS = "src/data/config/bosses.ts"
AN = "src/ui/attackNames.ts"
ST = "src/app/settings.ts"

M = [
    ("danger: no staggering at all", [(BF, "if (!together && hazard.kind !== 'portal') {", "if (false) {")]),
    ("danger: a comb is staggered too", [(BF, "if (!together && hazard.kind !== 'portal') {", "if (hazard.kind !== 'portal') {")]),
    ("danger: a fourth warning is allowed", [(BF, "if (times.length < MAX_WARNINGS) break;", "if (times.length < MAX_WARNINGS + 2) break;")]),
    ("danger: the first warning is always enough", [(BF, "if (times.length < MAX_WARNINGS) break;", "break;")]),
    ("danger: the window ignores far warnings wrongly", [(BF, "Math.abs(h.telegraph - t) >= WARN_TICKS", "false")]),
    ("danger: a stagger step of zero", [(BF, "t += 20;", "t += 0;")]),
    ("danger: the warning time of the data is not shared", [(BS, "a.kind === 'summon' ? a : { ...a, telegraphTicks: WARN_TICKS };", "a;")]),
    ("danger: the extra verbs of the intermediates are lost", [(BS, "[...family.normal, ...EXTRA[name].normal],", "family.normal,")]),
    ("danger: the event does not say whose shot it is", [(BF, "fromEnemy: isEnemyShot(hazard),", "fromEnemy: false,")]),
    ("fire: the shot does not come from the enemy", [(BF, "x: e.x,\n      link: -e.id,", "x: run.player.x,\n      link: -e.id,")]),
    ("fire: nobody knows who fired it", [(BF, "link: -e.id,", "link: -1,")]),
    ("fire: an enemy shoots again while its shot lives", [(BF, "    if (run.hazards.some((h) => h.link === -e.id)) continue;\n", "")]),
    ("fire: a boss hazard counts as an enemy shot", [(BF, "return hazard.link < 0;", "return hazard.link <= 0;")]),
    ("fire: the warning of the shot is not the common one", [(BF, "telegraph: WARN_TICKS,\n      active: 0,\n      damage: fire.damage,", "telegraph: 30,\n      active: 0,\n      damage: fire.damage,")]),
    ("final: the enemies stay when the final boss comes", [(WV, "    run.enemies = [];\n    run.pickups = [];", "    run.pickups = [];")]),
    ("final: the balls on the floor stay", [(WV, "    run.enemies = [];\n    run.pickups = [];", "    run.enemies = [];")]),
    ("names: an attack is named every time", [(AN, "if (this.seen.has(key)) return null;", "")]),
    ("names: nothing is remembered", [(AN, "this.seen.add(key);", "")]),
    ("volumes: no upper limit", [(ST, "Math.max(0, Math.min(1, value))", "Math.max(0, value)")]),
    ("volumes: no lower limit", [(ST, "Math.max(0, Math.min(1, value))", "Math.min(1, value)")]),
    ("volumes: the cries start loud", [(ST, "cries: 0.4 }", "cries: 1 }")]),
]
