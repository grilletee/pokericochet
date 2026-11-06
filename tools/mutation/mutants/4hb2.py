"""Mutants of the 4H-B2 and the 4G-B (18 types and double types, the seven families of effects, the
pool and the biomes, the champion of a biome, and the boss fight: columns, phases, shield, stun).
Paths are relative to the project root; `tools/mutation/run.py` applies them to an isolated copy."""

CB = "src/domain/combat.ts"
FM = "src/domain/forms.ts"
EF = "src/domain/effects.ts"
TK = "src/domain/tick.ts"
PL = "src/domain/pool.ts"
RN = "src/domain/run.ts"
WV = "src/domain/waves.ts"
BF = "src/domain/bossFight.ts"
MV = "src/domain/moves.ts"
PA = "tools/fetch-data/parse.ts"

M = [
    # ---- the 18 x 18 chart read with double types
    ("types: an immunity is not softened", [(CB, "return raw === 0 ? scale.immune : raw;", "return raw;")]),
    ("types: no floor", [(CB, "return Math.max(scale.min, Math.min(scale.max, product));", "return Math.min(scale.max, product);")]),
    ("types: no ceiling", [(CB, "return Math.max(scale.min, Math.min(scale.max, product));", "return Math.max(scale.min, product);")]),
    ("types: the second type is ignored", [(CB, "second === undefined ? cell(defender) : cell(defender) * cell(second)", "cell(defender)")]),
    ("types: the two cells do not multiply", [(CB, "cell(defender) * cell(second)", "Math.max(cell(defender), cell(second))")]),
    ("types: softer default immunity", [(CB, "{ immune: 0.25, min: 0.25, max: 3 } as const", "{ immune: 0.5, min: 0.25, max: 3 } as const")]),
    ("types: the chart row is not read", [(CB, "const raw = row?.[type] ?? 1;", "const raw = 1;")]),
    ("types: the guard of the fairy has no cap", [(CB, "Math.min(0.75, teamGuard(config, team) + extraGuard)", "teamGuard(config, team) + extraGuard")]),
    ("types: a leak can cost nothing", [(CB, "return Math.max(1, Math.floor(threat * (1 - guard) + 0.5));", "return Math.max(0, Math.floor(threat * (1 - guard) + 0.5));")]),
    ("types: the attack type ignores the move", [(FM, "return own.includes(type as GameType) ? (type as GameType) : fallback;", "return fallback;")]),
    ("types: the attack type is any move type", [(FM, "return own.includes(type as GameType) ? (type as GameType) : fallback;", "return type as GameType;")]),
    ("types: a hit on an enemy ignores its second type", [(TK, "hitDamage(config, ball, target.type, target.type2)", "hitDamage(config, ball, target.type)")]),
    ("types: a move ignores the second type", [(MV, "hitDamage(config, ball, enemy.type, enemy.type2)", "hitDamage(config, ball, enemy.type)")]),
    # ---- the families of effects
    ("poison: no cap on the layers", [(EF, "Math.min(\n          config.effects.poisonMaxStacks ?? 5,\n          (target.poisonStacks ?? 0) + 1,\n        )", "(target.poisonStacks ?? 0) + 1")]),
    ("poison: the clock does not restart", [(EF, "target.poisonTicks = config.effects.poisonTicks ?? 360;", "target.poisonTicks = target.poisonTicks ?? config.effects.poisonTicks ?? 360;")]),
    ("poison: the layers do not clear", [(EF, "if (poison === 1) {", "if (poison === 0) {")]),
    ("poison: one layer's worth of damage", [(EF, "((enemy.poisonStacks ?? 0) * (enemy.poisonDps ?? 0)) / 60", "(enemy.poisonDps ?? 0) / 60")]),
    ("curse: no cap on the hits it carries", [(EF, "Math.min(cap, (target.curseDamage ?? 0) + damage * effect.strength)", "(target.curseDamage ?? 0) + damage * effect.strength")]),
    ("curse: lands a tick late", [(EF, "if (curse === 1) {", "if (curse === 2) {")]),
    ("curse: the clock restarts on every hit", [(EF, "if ((target.curseTicks ?? 0) <= 0) target.curseTicks", "target.curseTicks")]),
    ("quake: hits what is below", [(EF, "if (other === target || other.hp <= 0 || other.y > target.y) continue;", "if (other === target || other.hp <= 0 || other.y < target.y) continue;")]),
    ("quake: the whole row, not the column", [(EF, "if (Math.abs(other.x - target.x) > half) continue;", "if (false) continue;")]),
    ("quake: just outside the column counts", [(EF, "if (Math.abs(other.x - target.x) > half) continue;", "if (Math.abs(other.x - target.x) >= half) continue;")]),
    ("push: can leave the arena", [(EF, "target.y = Math.max(-target.radius, target.y - effect.strength);", "target.y -= effect.strength;")]),
    ("push: moves a boss", [(EF, "if (target.hp <= 0 || target.id === run.boss.id) break;\n        target.y", "if (target.hp <= 0) break;\n        target.y")]),
    ("guard: never starts", [(EF, "run.guardTicks = config.effects.guardTicks ?? 180;", "run.guardTicks = 0;")]),
    ("ice: every hit freezes", [(EF, "if (hits >= (config.effects.freezeEvery ?? 3)) {", "if (hits >= 1) {")]),
    ("ice: the third hit does not", [(EF, "if (hits >= (config.effects.freezeEvery ?? 3)) {", "if (hits > (config.effects.freezeEvery ?? 3)) {")]),
    ("ice: stops a boss", [(EF, "if (target.hp <= 0 || target.id === run.boss.id) break;\n        const hits", "if (target.hp <= 0) break;\n        const hits")]),
    ("stun: can be chained", [(EF, "target.chill = -2 * ticks;", "target.chill = 0;")]),
    ("stun: stops a boss", [(EF, "if (target.hp <= 0 || target.id === run.boss.id) break;\n        if ((target.chill", "if (target.hp <= 0) break;\n        if ((target.chill")]),
    ("stun: extends a stop in progress", [(EF, "if ((target.chill ?? 0) < 0 || (target.haltTicks ?? 0) > 0) break;", "if ((target.chill ?? 0) < 0) break;")]),
    ("mark: no cap", [(EF, "Math.min(\n          config.effects.markMax ?? 0.5,\n          (target.markBonus ?? 0) + effect.strength,\n        )", "(target.markBonus ?? 0) + effect.strength")]),
    ("mark: does not add to the damage", [(EF, "amount * (1 + (enemy.markBonus ?? 0))", "amount")]),
    ("mark: never wears off", [(EF, "if (mark === 1) enemy.markBonus = 0;", "if (mark === -1) enemy.markBonus = 0;")]),
    ("ice or stun: the enemy keeps moving", [(TK, "if (halt > 0) {\n      e.haltTicks = halt - 1;", "if (halt > 100000) {\n      e.haltTicks = halt - 1;")]),
    ("guard: does not lower a leak", [(TK, "run.guardTicks > 0 ? guardBonus : 0", "0")]),
    ("guard: never runs out", [(TK, "if (run.guardTicks > 0) run.guardTicks -= 1;", "")]),
    # ---- the pool, the biomes and the champion
    ("pool: the starters are not always in", [(PL, "for (const id of config.pool.always) if (roster.includes(id)) chosen.add(id);", "")]),
    ("pool: the draw count depends on the roster", [(PL, "const at = nextInt(rng, Math.max(1, left.length));", "const at = left.length === 0 ? 0 : nextInt(rng, left.length);")]),
    ("pool: a line can be drawn twice", [(PL, "      left.splice(at, 1);\n", "")]),
    ("pool: the types of a line are only its base form", [(PL, "? [1, 2, 3].map((t) => formAt(config, base, t))", "? [formAt(config, base, 1)]")]),
    ("biome: a lighter type weighs more", [(PL, "weight = Math.max(weight, entry.weight);", "weight = Math.min(weight || 99, entry.weight);")]),
    ("champion: the base form, not the last", [(PL, "const id = formAt(config, base, 3);", "const id = formAt(config, base, 1);")]),
    ("champion: ties go to the higher id", [(PL, "(total === best.total && id < best.id)", "(total === best.total && id > best.id)")]),
    ("champion: the weakest wins", [(PL, "total > best.total ||", "total < best.total ||")]),
    ("fair lines: neutral is not fair", [(PL, ">= 1\n    );", "> 1\n    );")]),
    ("biomes: they can repeat", [(RN, "const fresh = candidates.filter((id) => !used.has(id));", "const fresh = candidates;")]),
    ("biomes: wave 2 is the fair one", [(WV, "fair: run.wave.index === 0 && config.pool !== undefined,", "fair: run.wave.index === 1 && config.pool !== undefined,")]),
    ("biomes: nothing is fair", [(WV, "if (wave.fair) {", "if (false) {")]),
    ("boss: its health stat is not clamped", [(WV, "Math.max(60, Math.min(110, species.baseStats.hp))", "species.baseStats.hp")]),
    ("boss: the champion is not used", [(WV, "if (champion !== undefined) {", "if (false) {")]),
    # ---- the boss fight
    ("fight: no minimum warning", [(BF, "Math.max(MIN_TELEGRAPH_TICKS, attack.telegraphTicks)", "attack.telegraphTicks")]),
    ("fight: a comb has no safe slot", [(BF, "if (i === safe) continue;", "if (false) continue;")]),
    ("fight: rain all at once", [(BF, "telegraph: telegraph + i * 18,", "telegraph: telegraph + i * 0,")]),
    ("fight: no cap on the columns", [(BF, "if (run.hazards.length >= (config.bossFight?.maxHazards ?? 12)) return;", "")]),
    ("fight: phase one tick late", [(BF, "boss.hp <= next.fromHp * run.boss.maxHp + 1e-9", "boss.hp < next.fromHp * run.boss.maxHp - 1e-9")]),
    ("fight: the columns survive a phase", [(BF, "    run.hazards.length = 0;\n    enterPhase(run, config, boss, run.boss.phase + 1);", "    enterPhase(run, config, boss, run.boss.phase + 1);")]),
    ("fight: damage crosses the phase line", [(BF, "return next === undefined ? 0 : next.fromHp * run.boss.maxHp;", "return 0;")]),
    ("fight: the shield stops nothing", [(BF, "if (run.boss.shieldHp > 0) hurt *= fight.shieldMult;", "if (run.boss.shieldHp > 0) hurt *= 1;")]),
    ("fight: the stun adds nothing", [(BF, "else if (run.boss.stunTicks > 0) hurt *= fight.stunMult;", "")]),
    ("fight: the weak point is anywhere", [(BF, "if (dx * dx + dy * dy > reach * reach) return;", "if (false) return;")]),
    ("fight: the weak point edge counts out", [(BF, "if (dx * dx + dy * dy > reach * reach) return;", "if (dx * dx + dy * dy >= reach * reach) return;")]),
    ("fight: a broken shield does not stun", [(BF, "run.boss.stunTicks = fight.stunTicks;\n  boss.haltTicks", "boss.haltTicks")]),
    ("fight: a stun does not stop the boss", [(BF, "boss.haltTicks = fight.stunTicks;", "")]),
    ("fight: a column covers less than its width", [(BF, "Math.abs(run.player.x - hazard.x) <= hazard.width / 2", "Math.abs(run.player.x - hazard.x) <= hazard.width / 4")]),
    ("fight: the edge of a column is safe", [(BF, "Math.abs(run.player.x - hazard.x) <= hazard.width / 2", "Math.abs(run.player.x - hazard.x) < hazard.width / 2")]),
    ("fight: a column hurts every tick", [(BF, "if (!hazard.struck && covers(run, hazard)) strike(run, config, hazard);", "if (covers(run, hazard)) strike(run, config, hazard);")]),
    ("fight: the guard does not count", [(BF, "const cost = leakDamage(config, run.team, hazard.damage);", "const cost = hazard.damage;")]),
    ("fight: a column hurts the first tick of its warning", [(BF, "if (hazard.telegraph === 0) {\n        const hit = covers(run, hazard);", "if (hazard.telegraph === 59) {\n        const hit = covers(run, hazard);")]),
    ("fight: the weak point never turns back", [(BF, "run.boss.weakDir = -1;", "run.boss.weakDir = 1;")]),
    ("fight: the weak point never turns again", [(BF, "run.boss.weakDir = 1;\n      }\n    }", "run.boss.weakDir = -1;\n      }\n    }")]),
    ("fight: the Ultimate takes nothing from the shield", [(BF, "run.boss.shieldHp -= run.boss.shieldMax * fight.ultimateShieldShare;", "")]),
    ("fight: the Ultimate gets no stun bonus", [(BF, "return run.boss.stunTicks > 0 ? fight.ultimateStunBonus : 1;", "return 1;")]),
    ("fight: the stun never ends", [(BF, "run.boss.stunTicks -= 1;\n    if (run.boss.stunTicks === 0) {", "run.boss.stunTicks -= 0;\n    if (run.boss.stunTicks === 0) {")]),
    ("fight: no new shield after the stun", [(BF, "run.boss.shieldHp = (phase.shield?.share ?? 0) * run.boss.maxHp;\n      run.boss.shieldMax", "run.boss.shieldMax")]),
    ("fight: attacks during the stun", [(BF, "if (run.boss.stunTicks > 0) {\n    run.boss.stunTicks -= 1;", "if (run.boss.stunTicks > 99999) {\n    run.boss.stunTicks -= 1;")]),
    ("fight: the boss never attacks", [(BF, "run.boss.attackIn -= 1;", "run.boss.attackIn -= 0;")]),
    ("fight: columns stay when the boss dies", [(BF, "  if (boss === undefined) {\n    run.hazards.length = 0;\n    return;\n  }", "  if (boss === undefined) {\n    return;\n  }")]),
    ("fight: the damage is not routed through it", [("src/domain/effects.ts", "enemy.id === run.boss.id ? bossDamage(run, config, enemy, marked) : marked", "marked")]),
    ("fight: the weak point is never checked", [(TK, "if (target.id === run.boss.id) {\n        hitWeakPoint(", "if (false) {\n        hitWeakPoint(")]),
    ("fight: not advanced", [(TK, "  advanceBossFight(run, config);", "")]),
    ("fight: the Ultimate ignores the boss", [(MV, "const onBoss = enemy.id === run.boss.id ? ultimateOnBoss(run, config, enemy) : 1;", "const onBoss = 1;")]),
    # ---- the data pipeline
    ("data: only the first type is read", [(PA, "const gameTypes = listed.slice(0, 2) as GameType[];", "const gameTypes = listed.slice(0, 1) as GameType[];")]),
    ("data: a third type is kept", [(PA, "const gameTypes = listed.slice(0, 2) as GameType[];", "const gameTypes = listed.slice(0, 3) as GameType[];")]),
    ("data: moves of the first type only", [(PA, "!types.includes(info.type as GameType)", "info.type !== types[0]")]),
]
