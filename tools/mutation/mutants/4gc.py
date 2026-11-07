"""Mutants of the 4G-C (bosses: no repeats, two phases with a fury, the core, the verbs of the attacks,
the states of the enemies in the snapshot). Paths are relative to the project root;
`tools/mutation/run.py` applies them to an isolated copy."""

BF = "src/domain/bossFight.ts"
WV = "src/domain/waves.ts"
PL = "src/domain/pool.ts"
PK = "src/domain/pickups.ts"
SN = "src/domain/snapshot.ts"
EF = "src/domain/effects.ts"
TK = "src/domain/tick.ts"
MV = "src/domain/moves.ts"
RN = "src/domain/run.ts"

M = [
    # ---- no boss repeats in a run
    ("repeat: used lines are not skipped", [(PL, "if (used.includes(base)) continue;", "")]),
    ("repeat: the line is not recorded", [(WV, "run.boss.used.push(baseOf(config, champion).base);", "")]),
    ("repeat: the fallback ignores the used ones", [(WV, "championOf(config, run.pool, ended, run.boss.used) ??", "championOf(config, run.pool, ended) ??")]),
    ("repeat: used is not hashed", [(RN, "for (const id of run.boss.used) h.str(id);", "")]),
    # ---- the fury
    ("fury: starts a tick late", [(BF, "boss.hp <= fight.rageAt * run.boss.maxHp + 1e-9", "boss.hp < fight.rageAt * run.boss.maxHp - 1e-9")]),
    ("fury: never starts", [(BF, "if (run.boss.phase === 0 && boss.hp <= fight.rageAt * run.boss.maxHp + 1e-9) {", "if (false) {")]),
    ("fury: no message", [(BF, "run.events.push({ type: 'bossPhase', phase: 1 });", "")]),
    ("fury: no calm moment", [(BF, "    run.boss.attackIn = fight.calmTicks;\n    run.events.push({ type: 'bossPhase', phase: 1 });", "    run.events.push({ type: 'bossPhase', phase: 1 });")]),
    ("fury: the core keeps its window", [(BF, "    run.boss.coreOpen = 0;\n    run.boss.coreIn = pattern.phases[1].coreEvery;", "    run.boss.coreIn = pattern.phases[1].coreEvery;")]),
    ("fury: damage crosses half health", [(BF, "const floor = run.boss.phase === 0 ? fight.rageAt * run.boss.maxHp : 0;", "const floor = 0;")]),
    ("fury: the line holds in the fury too", [(BF, "const floor = run.boss.phase === 0 ? fight.rageAt * run.boss.maxHp : 0;", "const floor = fight.rageAt * run.boss.maxHp;")]),
    # ---- the core
    ("core: closed does the same as open", [(BF, "amount * (run.boss.coreOpen > 0 ? fight.openMult : fight.closedMult)", "amount * fight.openMult")]),
    ("core: open does the same as closed", [(BF, "amount * (run.boss.coreOpen > 0 ? fight.openMult : fight.closedMult)", "amount * fight.closedMult")]),
    ("core: a ball off the core gets the bonus", [(BF, "return dx * dx + dy * dy <= reach * reach ? fight.coreHitMult : 1;", "return fight.coreHitMult;")]),
    ("core: the edge of the core is out", [(BF, "return dx * dx + dy * dy <= reach * reach ? fight.coreHitMult : 1;", "return dx * dx + dy * dy < reach * reach ? fight.coreHitMult : 1;")]),
    ("core: the ball radius does not count", [(BF, "const reach = core.radius + radius;", "const reach = core.radius;")]),
    ("core: a closed core takes the bonus", [(BF, "if (fight === undefined || run.boss.coreOpen <= 0) return 1;", "if (fight === undefined) return 1;")]),
    ("core: the core is not where the boss says", [(BF, "return { x: boss.x + run.boss.weakX, y: boss.y, radius: boss.radius * 0.45 };", "return { x: boss.x, y: boss.y, radius: boss.radius * 0.45 };")]),
    ("core: the Ultimate gets no bonus", [(BF, "return run.boss.coreOpen > 0 ? fight.ultimateOpenBonus : 1;", "return 1;")]),
    ("core: the Ultimate gets it always", [(BF, "return run.boss.coreOpen > 0 ? fight.ultimateOpenBonus : 1;", "return fight.ultimateOpenBonus;")]),
    ("core: is not announced", [(BF, "if (run.boss.coreIn === fight.coreWarnTicks) {", "if (run.boss.coreIn === -1) {")]),
    ("core: never opens", [(BF, "    if (run.boss.coreIn <= 0) {", "    if (run.boss.coreIn <= -999999) {")]),
    ("core: never closes", [(BF, "    run.boss.coreOpen -= 1;", "    run.boss.coreOpen -= 0;")]),
    ("core: opens at the centre always", [(BF, "run.boss.weakX = (nextFloat(run.rng.boss) * 2 - 1) * reach;", "run.boss.weakX = 0;")]),
    ("core: opens outside the body", [(BF, "const reach = boss.radius * 0.55;", "const reach = boss.radius * 1.5;")]),
    ("core: the hit is not routed through the tick", [(TK, "? damage * coreHitMult(run, config, target, body.x, body.y, radius)", "? damage")]),
    ("core: the damage is not routed through the boss rule", [(EF, "enemy.id === run.boss.id ? bossDamage(run, config, enemy, marked) : marked", "marked")]),
    ("core: the move ignores the open core", [(MV, "const onBoss = enemy.id === run.boss.id ? ultimateOnBoss(run, config) : 1;", "const onBoss = 1;")]),
    # ---- the verbs
    ("shot: not aimed at the player", [(BF, "const x = Math.max(half, Math.min(width - half, run.player.x + jitter));", "const x = width / 2;")]),
    ("shot: falls at once", [(BF, "telegraph: telegraph + i * 24,", "telegraph: 0,")]),
    ("shot: never lands", [(BF, "if (hazard.y >= floorY - 8) {", "if (hazard.y >= floorY + 99999) {")]),
    ("shot: hits whoever is anywhere", [(BF, "      if (hazard.y >= floorY - 8) {\n        const hit = covers(run, hazard);", "      if (hazard.y >= floorY - 8) {\n        const hit = true;")]),
    ("zone: does not block the balls", [(BF, "if (h.kind === 'zone' && h.telegraph <= 0 && Math.abs(x - h.x) <= h.width / 2) return true;", "if (false) return true;")]),
    ("zone: blocks from the warning", [(BF, "if (h.kind === 'zone' && h.telegraph <= 0 &&", "if (h.kind === 'zone' &&")]),
    ("zone: the pickups do not ask", [(PK, "&& !zoneCovers(run, p.x)) {", ") {")]),
    ("gust: does not push", [(BF, "run.player.x + hazard.speed),\n      );", "run.player.x),\n      );")]),
    ("gust: pushes out of the floor", [(BF, "Math.min(config.arena.width - config.player.margin, run.player.x + hazard.speed),", "run.player.x + hazard.speed,")]),
    ("summon: asks for nothing", [(BF, "run.boss.summonDebt += count;", "")]),
    ("summon: never spawned", [(WV, "run.boss.summonDebt = 0;", "")]),
    ("summon: spawns one too many", [(WV, "for (let i = 0; i < run.boss.summonDebt; i++) spawnEnemy(run, config, asked);", "for (let i = 0; i <= run.boss.summonDebt; i++) spawnEnemy(run, config, asked);")]),
    ("attack: no minimum warning", [(BF, "const telegraph = Math.max(MIN_TELEGRAPH_TICKS, attack.telegraphTicks);", "const telegraph = attack.telegraphTicks;")]),
    ("attack: the fury does not hit harder", [(BF, "const damage = attack.damage * phase.damageMult;", "const damage = attack.damage;")]),
    ("attack: a round is one attack", [(BF, "for (let i = 0; i < phase.perRound; i++) {", "for (let i = 0; i < 1; i++) {")]),
    ("attack: no cap on the hazards", [(BF, "if (run.hazards.length >= (config.bossFight?.maxHazards ?? 12)) return;", "")]),
    ("attack: a column hurts every tick", [(BF, "if (!hazard.struck && covers(run, hazard)) strike(run, config, hazard);", "if (covers(run, hazard)) strike(run, config, hazard);")]),
    ("attack: the guard does not count", [(BF, "const cost = leakDamage(config, run.team, hazard.damage);", "const cost = hazard.damage;")]),
    # ---- the states in the snapshot
    ("status: ice reads as a stun", [(SN, "bits |= (e.chill ?? 0) < 0 ? STATUS_PARALYSED : STATUS_FROZEN;", "bits |= STATUS_PARALYSED;")]),
    ("status: a stun reads as ice", [(SN, "bits |= (e.chill ?? 0) < 0 ? STATUS_PARALYSED : STATUS_FROZEN;", "bits |= STATUS_FROZEN;")]),
    ("status: burning is not read", [(SN, "if (e.burnTicks > 0) bits |= STATUS_BURN;", "")]),
    ("status: poison is not read", [(SN, "if ((e.poisonTicks ?? 0) > 0) bits |= STATUS_POISON;", "")]),
    ("status: a push has no trail", [(EF, "target.pushTicks = 14;", "")]),
    ("status: the trail never ends", [(EF, "enemy.pushTicks = (enemy.pushTicks ?? 0) - 1;", "enemy.pushTicks = (enemy.pushTicks ?? 0);")]),
    ("status: the hazard kind is not written", [(SN, "snap.hazardKind[i] = HAZARD_KINDS.indexOf(h.kind);", "")]),
]
