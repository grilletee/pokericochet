"""Mutants of the 4F-D (the starter's signature thrown by the player, the evolution moment, cards that
announce an evolution, "you capture what you beat"). Paths are relative to the project root;
`tools/mutation/run.py` applies them to an isolated copy."""

MV = "src/domain/moves.ts"
K = "src/domain/tick.ts"
T = "src/domain/team.ts"
CT = "src/ui/cardText.ts"
EM = "src/ui/evolutionMoment.ts"
AU = "src/ui/audio.ts"
ST = "src/ui/screenText.ts"
CF = "src/data/config/index.ts"

M = [
    # ---- the signature (moves.ts)
    ("sig: list index off by one", [(MV, "const own = stage - 1 < list.length ? list[stage - 1] : list[list.length - 1];", "const own = stage - 1 < list.length ? list[stage] : list[list.length - 1];")]),
    ("sig: past the list is nothing", [(MV, "const own = stage - 1 < list.length ? list[stage - 1] : list[list.length - 1];", "const own = stage - 1 < list.length ? list[stage - 1] : null;")]),
    ("sig: any Pokémon waits for the player", [(MV, "if (member === undefined || !member.starter) return false;\n  const stage", "if (member === undefined) return false;\n  const stage")]),
    ("sig: ready one hit early", [(MV, "member.charge >= chargeNeed(config, stage)\n  );", "member.charge >= chargeNeed(config, stage) - 1\n  );")]),
    ("sig: ready needs one extra hit", [(MV, "member.charge >= chargeNeed(config, stage)\n  );", "member.charge > chargeNeed(config, stage)\n  );")]),
    ("sig: ready without the move in the data", [(MV, "    moveIdOf(config, member.species, stage) !== undefined &&\n", "")]),
    ("sig: goes off by itself", [(MV, "if (member.starter && signatureOf(config, member.species, ball.stage) !== null) {", "if (false && member.starter && signatureOf(config, member.species, ball.stage) !== null) {")]),
    ("sig: any Pokémon holds its signature", [(MV, "if (member.starter && signatureOf(config, member.species, ball.stage) !== null) {", "if (signatureOf(config, member.species, ball.stage) !== null) {")]),
    ("sig: charge piles up past the need", [(MV, "    member.charge = need;\n    return;", "    return;")]),
    ("sig: charge is lost while waiting", [(MV, "    member.charge = need;\n    return;", "    member.charge = 0;\n    return;")]),
    ("sig: cast without being ready", [(MV, "  if (!signatureReady(run, config, index)) return false;\n", "")]),
    ("sig: charge stays after the cast", [(MV, "  member.charge = 0;\n  castMove(run, config, ball, move, x, y, at, true);", "  castMove(run, config, ball, move, x, y, at, true);")]),
    ("sig: aim mode swapped", [(MV, "const at = run.autoAim\n    ? enemyNear", "const at = !run.autoAim\n    ? enemyNear")]),
    ("sig: lands on the enemy, not the aim", [(MV, "const x = run.autoAim ? at.x : run.aimX;", "const x = at.x;")]),
    ("sig: lands on the enemy row, not the aim", [(MV, "const y = run.autoAim ? at.y : run.aimY;", "const y = at.y;")]),
    ("sig: casts with nobody alive", [(MV, "  if (at === null) return false;\n", "  if (at === null) return true;\n")]),
    ("sig: event says it went off by itself", [(MV, "castMove(run, config, ball, move, x, y, at, true);", "castMove(run, config, ball, move, x, y, at, false);")]),
    ("sig: automatic move says it was thrown", [(MV, "castMove(run, config, ball, move, target.x, target.y, target, false);", "castMove(run, config, ball, move, target.x, target.y, target, true);")]),
    ("sig: event never says signature", [(MV, "signature: signatureOf(config, member.species, ball.stage) !== null,", "signature: false,")]),
    ("sig: nearest enemy is the farthest", [(MV, "    if (d2 < bestD2) {", "    if (d2 > bestD2) {")]),
    ("sig: nearest counts the dead", [(MV, "  let bestD2 = Number.POSITIVE_INFINITY;\n  for (const enemy of run.enemies) {\n    if (enemy.hp <= 0) continue;", "  let bestD2 = Number.POSITIVE_INFINITY;\n  for (const enemy of run.enemies) {")]),
    ("sig: stage read from the member's level", [(MV, "  const stage = stageForLevel(config, member.level);\n  return (", "  const stage = 1;\n  return (")]),
    # ---- the command (tick.ts)
    ("tick: cast command ignored", [(K, "  if (cmd.cast !== undefined) castSignature(run, config, cmd.cast);\n", "")]),
    # ---- you capture what you beat (team.ts)
    ("capture: duplicate ignores the form's level", [(T, "member.level = Math.min(config.team.maxLevel, Math.max(member.level + 1, floor));", "member.level = Math.min(config.team.maxLevel, member.level + 1);")]),
    ("capture: duplicate drops to the form's level", [(T, "member.level = Math.min(config.team.maxLevel, Math.max(member.level + 1, floor));", "member.level = Math.min(config.team.maxLevel, floor === 0 ? member.level + 1 : floor);")]),
    ("capture: duplicate skips past the maximum", [(T, "member.level = Math.min(config.team.maxLevel, Math.max(member.level + 1, floor));", "member.level = Math.max(member.level + 1, floor);")]),
    ("capture: duplicate never gets a floor", [(T, "trainMember(run, config, owned, 'capture', captureLevel(config, stage));", "trainMember(run, config, owned, 'capture');")]),
    # ---- cards that announce the evolution (cardText.ts)
    ("card: any card carries a step", [(CT, "  if (card.kind !== 'train') return null;\n", "")]),
    ("card: a missing member has a step", [(CT, "return member === undefined ? null : context.nextStep(member);", "return member === undefined ? { kind: 'evolve', to: '' } : context.nextStep(member);")]),
    ("card: the title never announces", [(CT, "title: step === null ? `Entrenar a ${pokemonName(from)}` : stepTitle(from, step),", "title: `Entrenar a ${pokemonName(from)}`,")]),
    ("card: title names the same form twice", [(CT, "`¡${name} evolucionará a ${pokemonName(step.to)}!`", "`¡${name} evolucionará a ${name}!`")]),
    ("card: awaken says evolve", [(CT, "`¡${name} despertará su poder!`", "`¡${name} evolucionará!`")]),
    ("card: peak says awaken", [(CT, "`¡${name} alcanzará su máximo poder!`", "`¡${name} despertará su poder!`")]),
    # ---- the evolution moment (evolutionMoment.ts)
    ("moment: stage 3 as short as stage 2", [(EM, "return stage >= 3 ? 1300 : 800;", "return stage > 3 ? 1300 : 800;")]),
    ("moment: stage 2 as long as stage 3", [(EM, "return stage >= 3 ? 1300 : 800;", "return stage >= 2 ? 1300 : 800;")]),
    ("moment: a new step shortens the old one", [(EM, "this.until = Math.max(this.until, now + ms);", "this.until = now + ms;")]),
    ("moment: a new step never extends", [(EM, "this.until = Math.max(this.until, now + ms);", "this.until = Math.min(this.until, now + ms);")]),
    ("moment: still slow at the end", [(EM, "return now < this.until ? SLOW_SCALE : 1;", "return now <= this.until ? SLOW_SCALE : 1;")]),
    ("moment: never slow", [(EM, "return now < this.until ? SLOW_SCALE : 1;", "return 1;")]),
    ("moment: reset keeps the slow", [(EM, "  reset(): void {\n    this.until = Number.NEGATIVE_INFINITY;", "  reset(): void {\n    this.until = this.until;")]),
    ("moment: seconds ignore the slow clock", [(EM, "((until - wall) * SLOW_SCALE) / tickMs", "(until - wall) / tickMs")]),
    ("moment: overlapped part counted twice", [(EM, "total += end - Math.max(until, wall);", "total += end - wall;")]),
    ("moment: ticks in the slow part take as long", [(EM, "wall += (slowTicks * tickMs) / SLOW_SCALE + (ticks - slowTicks) * tickMs;", "wall += ticks * tickMs;")]),
    ("moment: seconds in ms", [(EM, "  return total / 1000;", "  return total;")]),
    # ---- sound and text
    ("audio: the signature sounds like any move", [(AU, "return event.manual ? 'signature' : 'move';", "return 'move';")]),
    ("audio: every move sounds like the signature", [(AU, "return event.manual ? 'signature' : 'move';", "return 'signature';")]),
    ("title: the signature is not yours", [(ST, "· desde ${fromForm} · la lanzas tú`", "· desde ${fromForm}`")]),
    ("title: cross called wave", [(ST, "  cross: 'cruz',", "  cross: 'ola',")]),
    ("title: no form it starts with", [(ST, "· desde ${fromForm} ·", "·")]),
    # ---- the data (config)
    ("data: Charmander has no stage 2 signature", [(CF, "      charmander: [\n        null,\n        { kind: 'cross', width: 36, power: 1.8 },", "      charmander: [\n        null,\n        null,")]),
    ("data: Bulbasaur has no stage 2 signature", [(CF, "      bulbasaur: [\n        null,\n        { kind: 'beam', width: 56, power: 1.6 },", "      bulbasaur: [\n        null,\n        null,")]),
    ("data: enemies back to 1.72 hp",[(CF, "    hpScale: 1.55,\n  },\n  // The final boss", "    hpScale: 1.72,\n  },\n  // The final boss")]),
]

# 4F-E replaced the slow motion by a pause: those mutants live in 4fe.py now (no anchor left here).
M = [mutant for mutant in M if not mutant[0].startswith("moment:") or "shortens" in mutant[0] or "never extends" in mutant[0] or "reset keeps" in mutant[0]]
