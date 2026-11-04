"""Mutants of the 4F-C (names from the form, phases per line, real stats and guard, named moves).
Paths are relative to the project root; `tools/mutation/run.py` applies them to an isolated copy."""

F = "src/domain/forms.ts"
CB = "src/domain/combat.ts"
K = "src/domain/tick.ts"
MV = "src/domain/moves.ts"
IN = "src/domain/inspect.ts"
T = "src/domain/team.ts"
P = "src/domain/pickups.ts"
SU = "src/domain/summary.ts"
PA = "tools/fetch-data/parse.ts"
ML = "src/ui/moveLabels.ts"
SB = "src/ui/statBars.ts"
RS = "src/ui/replaceScreen.ts"
AB = "src/render/artBox.ts"
CT = "src/ui/cardText.ts"
ST = "src/ui/screenText.ts"
NM = "src/ui/names.ts"

M = [
    # ---- forms and phases (ADR-036, ADR-037)
    ("forms: stage 1 is already a form", [(F, "if (line === undefined || stage <= 1) return base;", "if (line === undefined || stage < 1) return base;")]),
    ("forms: form index off by one", [(F, "line[Math.min(stage - 2, line.length - 1)]", "line[Math.min(stage - 1, line.length - 1)]")]),
    ("forms: stage kind of stage 1", [(F, "  if (stage <= 1) return null;\n  if (formAt", "  if (stage < 1) return null;\n  if (formAt")]),
    ("forms: same form counts as evolution", [(F, "!== formAt(config, base, stage - 1)) return 'evolve'", "=== formAt(config, base, stage - 1)) return 'evolve'")]),
    ("forms: awaken and peak swapped", [(F, "return stage === 2 ? 'awaken' : 'peak';", "return stage === 2 ? 'peak' : 'awaken';")]),
    ("forms: next step at the same stage", [(F, "if (next <= now) return null;", "if (next < now) return null;")]),
    ("forms: stage threshold is strict", [(F, "if (level >= from) stage += 1;", "if (level > from) stage += 1;")]),
    ("forms: a member shows its base", [(F, "return formAt(config, member.species, stageForLevel(config, member.level));", "return member.species;")]),
    # ---- real stats, speed and guard (ADR-038)
    ("stats: attack only", [(CB, "Math.max(baseStats.attack, baseStats.specialAttack)", "baseStats.attack")]),
    ("stats: the lower attack", [(CB, "Math.max(baseStats.attack, baseStats.specialAttack)", "Math.min(baseStats.attack, baseStats.specialAttack)")]),
    ("stats: damage reads the base species", [(CB, "formPower(config, ballForm(config, ball)) *", "formPower(config, getSpecies(config, ball.species)) *")]),
    ("stats: no stage boost in damage", [(CB, "    stageBoost(config, ball.species, ball.stage) *\n", "")]),
    ("stats: boost can lower damage", [(CB, "return Math.max(1, wanted / (now / first));", "return wanted / (now / first);")]),
    ("stats: stage 1 has a boost", [(CB, "  if (stage <= 1) return 1;\n  const first", "  if (stage < 1) return 1;\n  const first")]),
    ("stats: growth index off by one", [(CB, "const wanted = growth[stage - 1] ?? growth[growth.length - 1] ?? 1;", "const wanted = growth[stage] ?? growth[growth.length - 1] ?? 1;")]),
    ("stats: speed has no cap", [(CB, "return Math.min(\n    ballConfig.speedCap,", "return Math.max(\n    ballConfig.speedCap,")]),
    ("stats: speed of the base species", [(CB, "ballForm(config, ball).baseStats.speed,", "getSpecies(config, ball.species).baseStats.speed,")]),
    ("stats: bulk without special defense", [(CB, "return (hp + defense + specialDefense) / 3;", "return (hp + defense) / 3;")]),
    ("stats: bulk mean of two", [(CB, "return (hp + defense + specialDefense) / 3;", "return (hp + defense + specialDefense) / 2;")]),
    ("stats: empty team has guard", [(CB, "  if (team.length === 0) return 0;\n", "")]),
    ("stats: guard is the sum, not the mean", [(CB, "mapStat(total / team.length,", "mapStat(total,")]),
    ("stats: guard maps to 1", [(CB, "stats.guardStatMax, 0, stats.guardMax);", "stats.guardStatMax, 0, 1);")]),
    ("stats: guard reads the base species", [(CB, "bulkOf(getSpecies(config, formOfMember(config, member)))", "bulkOf(getSpecies(config, member.species))")]),
    ("stats: a leak of 0 costs", [(CB, "if (threat <= 0) return 0;", "if (threat < 0) return 0;")]),
    ("stats: a leak can cost 0", [(CB, "Math.max(1, Math.floor(threat * (1 - teamGuard", "Math.max(0, Math.floor(threat * (1 - teamGuard")]),
    ("stats: leak rounds down", [(CB, "(1 - teamGuard(config, team)) + 0.5)", "(1 - teamGuard(config, team)) + 0)")]),
    ("stats: guard raises the leak", [(CB, "threat * (1 - teamGuard", "threat * (1 + teamGuard")]),
    ("tick: leak ignores the guard", [(K, "leakDamage(config, run.team, e.threat)", "e.threat")]),
    ("tick: hits never charge", [(K, "      landHit(run, config, ball, target);\n", "")]),
    # ---- what the player sees
    ("inspect: ties give the damage to attack", [(IN, "specialAttack > attack ? 'specialAttack' : 'attack'", "specialAttack >= attack ? 'specialAttack' : 'attack'")]),
    ("inspect: replaced slot is the wrong one", [(IN, "index === slot ? joined : member", "index !== slot ? joined : member")]),
    ("inspect: capture joins at level 1", [(IN, "level: captureLevel(config, capture.stage),", "level: 1,")]),
    ("inspect: damage without the boost", [(IN, "damage: formPower(config, def) * stageBoost(config, species, stage),", "damage: formPower(config, def),")]),
    # ---- events carry forms (ADR-036)
    ("team: stage event on the same stage", [(T, "const kind = after > before ? stageKind", "const kind = after >= before ? stageKind")]),
    ("team: stage event keeps the old form", [(T, "      to: formAt(config, member.species, after),", "      to: formAt(config, member.species, before),")]),
    ("team: train event names the base", [(T, "    form: formAt(config, member.species, after),\n    source,", "    form: member.species,\n    source,")]),
    ("team: capture form from the enemy stage", [(T, "return formAt(config, species, stageOf(config, captureLevel(config, stage)));", "return formAt(config, species, stage);")]),
    ("team: replaced names the base", [(T, "      outForm: formOfMember(config, out),", "      outForm: out.species,")]),
    ("pickups: drop names the base", [(P, "    form: formAt(config, species, level),", "    form: species,")]),
    ("summary: team names the base", [(SU, "      form: formOfMember(config, m),", "      form: m.species,")]),
    # ---- moves (ADR-039)
    ("moves: charge fallback is 0", [(MV, "table[table.length - 1] ?? 1;", "table[table.length - 1] ?? 0;")]),
    ("moves: casts one hit early", [(MV, "if (member.charge < chargeNeed(config, ball.stage)) return;", "if (member.charge < chargeNeed(config, ball.stage) - 1) return;")]),
    ("moves: casts one hit late", [(MV, "if (member.charge < chargeNeed(config, ball.stage)) return;", "if (member.charge <= chargeNeed(config, ball.stage)) return;")]),
    ("moves: charge never resets", [(MV, "  member.charge = 0;\n", "")]),
    ("moves: a hit charges twice", [(MV, "member.charge += 1;", "member.charge += 2;")]),
    ("moves: no move data, still charges", [(MV, "  if (move === undefined) return;\n", "")]),
    ("moves: tier strength ignored", [(MV, "ballPower(run, config, ball) * shape.power;", "ballPower(run, config, ball);")]),
    ("moves: power cards ignored", [(MV, "const power = ballPower(run, config, ball) * shape.power;", "const power = shape.power;")]),
    ("moves: the beam goes down", [(MV, "Math.abs(dx) <= half && dy <= 0;", "Math.abs(dx) <= half && dy >= 0;")]),
    ("moves: the beam is narrower", [(MV, "Math.abs(dx) <= half && dy <= 0;", "Math.abs(dx) < half && dy <= 0;")]),
    ("moves: cross needs both", [(MV, "Math.abs(dx) <= half || Math.abs(dy) <= half;", "Math.abs(dx) <= half && Math.abs(dy) <= half;")]),
    ("moves: the wave is a column", [(MV, "case 'wave':\n      return Math.abs(dy) <= half;", "case 'wave':\n      return Math.abs(dx) <= half;")]),
    ("moves: burst excludes its edge", [(MV, "return dx * dx + dy * dy <= radius * radius;", "return dx * dx + dy * dy < radius * radius;")]),
    ("moves: burn is never applied", [(MV, "if (status.burn !== undefined) {", "if (status.burn === undefined) {")]),
    ("moves: slow is never applied", [(MV, "if (status.slow !== undefined) {", "if (status.slow === undefined) {")]),
    ("moves: slow can weaken", [(MV, "enemy.slow = Math.max(status.slow, enemy.slowTicks > 0 ? enemy.slow : 0);", "enemy.slow = status.slow;")]),
    ("moves: chain skips the target", [(MV, "  if (target.hp > 0) strike(run, config, ball, target, power);\n", "")]),
    ("moves: chain one jump too many", [(MV, "jump < (shape.count ?? 1)", "jump <= (shape.count ?? 1)")]),
    ("moves: chain default is 0 jumps", [(MV, "jump < (shape.count ?? 1)", "jump < (shape.count ?? 0)")]),
    ("moves: damage is not tallied", [(MV, "  tally.damage += damage;", "  tally.damage += 0;")]),
    ("moves: hits are not tallied", [(MV, "  tally.hits += 1;", "  tally.hits += 0;")]),
    ("moves: tally not reset", [(MV, "  tally.hits = 0;\n  tally.damage = 0;\n", "")]),
    ("moves: signature keeps the tier size", [(MV, "return { ...own, power: own.power ?? tier.power };", "return { ...tier, ...own, power: own.power ?? tier.power };")]),
    ("moves: signature ignores its own power", [(MV, "return { ...own, power: own.power ?? tier.power };", "return { ...own, power: tier.power };")]),
    ("moves: an explicit null takes the last signature", [(MV, "      : stage - 1 < list.length\n        ? list[stage - 1]\n        : list[list.length - 1];", "      : (list[stage - 1] ?? list[list.length - 1]);")]),
    ("moves: move of the wrong stage", [(MV, "list?.[Math.min(stage, list.length) - 1]", "list?.[Math.min(stage, list.length)]")]),
    ("moves: the event size of a burst is the width", [(MV, "(shape.kind === 'burst' || shape.kind === 'nova' ? shape.radius : shape.width) ?? 0", "shape.width ?? 0")]),
    ("moves: the starter flag is lost", [(MV, "    starter: member.starter,\n", "    starter: false,\n")]),
    # ---- tools/fetch-data (ADR-036, ADR-039)
    ("parse: stage 2 form of a short line", [(PA, "const second = forms[0] ?? base;", "const second = base;")]),
    ("parse: third form of a one-form line", [(PA, "const third = forms[1] ?? forms[0] ?? base;", "const third = forms[1] ?? base;")]),
    ("parse: three forms accepted", [(PA, "if (line.length > 2)", "if (line.length > 3)")]),
    ("parse: any learn method", [(PA, "if (method !== 'level-up' || typeof level !== 'number') continue;", "if (typeof level !== 'number') continue;")]),
    ("parse: the highest level wins", [(PA, "if (known === undefined || level < known) lowest.set(move, level);", "if (known === undefined || level > known) lowest.set(move, level);")]),
    ("parse: Spanish by the English name", [(PA, "if (lang === language && typeof entry.name === 'string'", "if (lang === 'en' && typeof entry.name === 'string'")]),
    ("parse: the Spanish fallback is not flagged", [(PA, "return { name: localName(names, 'en') ?? id, fallback: true };", "return { name: localName(names, 'en') ?? id, fallback: false };")]),
    ("parse: no damage counts as power", [(PA, "const power = typeof raw.power === 'number' ? raw.power : null;", "const power = typeof raw.power === 'number' ? raw.power : 0;")]),
    ("parse: tier 1 band", [(PA, "  [30, 60],\n  [61, 95],", "  [30, 70],\n  [61, 95],")]),
    ("parse: tier 3 band", [(PA, "  [96, Number.POSITIVE_INFINITY],", "  [100, Number.POSITIVE_INFINITY],")]),
    ("parse: the weakest move wins", [(PA, "info.power > (best.power ?? 0) ||", "info.power < (best.power ?? 0) ||")]),
    ("parse: ties by the higher id", [(PA, "(info.power === best.power && info.id < best.id);", "(info.power === best.power && info.id > best.id);")]),
    ("parse: any type of move", [(PA, "if (info === undefined || info.type !== type || info.power === null) continue;", "if (info === undefined || info.power === null) continue;")]),
    ("parse: a move may repeat the tier before", [(PA, "|| info.power <= previousPower) continue;", "|| info.power < previousPower) continue;")]),
    ("parse: null signature takes the default", [(PA, "if (signature !== undefined && signature !== null) {", "if (signature !== undefined) {")]),
    ("parse: the default is the wrong tier", [(PA, "const fallback = overrides.defaults[type][tier] as string;", "const fallback = overrides.defaults[type][0] as string;")]),
    ("parse: the report loses the source", [(PA, "${row.chosen.sources[index]} |`,", "auto |`,")]),
    # ---- the interface (ADR-036, ADR-037, ADR-039)
    ("labels: room for one more", [(ML, "if (this.labels.length < this.max) {", "if (this.labels.length <= this.max) {")]),
    ("labels: a merge counts twice", [(ML, "same.count += 1;", "same.count += 2;")]),
    ("labels: a merge does not extend", [(ML, "      same.until = now + this.lifeMs;\n", "")]),
    ("labels: an expired label stays", [(ML, "if (label.until > now) {", "if (label.until >= now) {")]),
    ("labels: the equal pushes out", [(ML, "if ((this.labels[weakest] as MoveLabel).priority < priority) {", "if ((this.labels[weakest] as MoveLabel).priority <= priority) {")]),
    ("labels: the strongest is replaced", [(ML, "if (a.priority < b.priority || (a.priority === b.priority && a.until < b.until)) weakest = i;", "if (a.priority > b.priority || (a.priority === b.priority && a.until < b.until)) weakest = i;")]),
    ("labels: the newest of equals goes", [(ML, "(a.priority === b.priority && a.until < b.until)", "(a.priority === b.priority && a.until > b.until)")]),
    ("labels: the starter has no priority", [(ML, "return starter ? 3 : tier >= 3 ? 2 : 1;", "return tier >= 3 ? 2 : 1;")]),
    ("labels: stage 3 has no priority", [(ML, "return starter ? 3 : tier >= 3 ? 2 : 1;", "return starter ? 3 : 1;")]),
    ("labels: a single cast shows a count", [(ML, "label.count > 1 ?", "label.count >= 1 ?")]),
    ("labels: the key ignores the Pokemon", [(ML, "const key = `${member}:${move}`;", "const key = move;")]),
    ("stat bars: overflow", [(SB, "Math.max(0, Math.min(100, (value / STAT_BAR_MAX) * 100))", "Math.max(0, (value / STAT_BAR_MAX) * 100)")]),
    ("stat bars: bar maximum", [(SB, "export const STAT_BAR_MAX = 150;", "export const STAT_BAR_MAX = 100;")]),
    ("stat bars: wrong effect of defense", [(SB, "{ key: 'defense', label: 'Defensa', effect: 'guardia' }", "{ key: 'defense', label: 'Defensa', effect: 'daño' }")]),
    ("stat bars: decimal point", [(SB, ".replace('.', ',')", "")]),
    ("replace: a change shows an arrow always", [(RS, "return percent(before) === percent(after)", "return percent(before) !== percent(after)")]),
    ("replace: percent truncates", [(RS, "Math.round(fraction * 100)", "Math.floor(fraction * 100)")]),
    ("art box: faint pixels count", [(AB, "if (alpha(x, y) <= threshold) continue;", "if (alpha(x, y) < threshold) continue;")]),
    ("art box: the box is one pixel short", [(AB, "return Math.max(maxX - minX + 1, maxY - minY + 1);", "return Math.max(maxX - minX, maxY - minY);")]),
    ("art box: empty picture is 0", [(AB, "if (maxX < 0) return Math.max(width, height);", "if (maxX < 0) return 0;")]),
    ("art box: the radius instead of the diameter", [(AB, "return (2 * radius * BALL_CONTENT_SCALE) / Math.max(1, extent);", "return (radius * BALL_CONTENT_SCALE) / Math.max(1, extent);")]),
    ("art box: size without the content scale", [(AB, "export function ballVisualSize(radius: number): number {\n  return 2 * radius * BALL_CONTENT_SCALE;", "export function ballVisualSize(radius: number): number {\n  return 2 * radius;")]),
    ("cards: the step is never told", [(CT, "      if (step !== null) parts.push(stepText(step));", "")]),
    ("cards: awakening reads as evolution", [(CT, "    case 'awaken':\n      return '¡despierta su poder!';", "    case 'awaken':\n      return `¡evoluciona a ${pokemonName(step.to)}!`;")]),
    ("cards: peak reads as evolution", [(CT, "      return '¡alcanza su máximo poder!';", "      return `¡evoluciona a ${pokemonName(step.to)}!`;")]),
    ("cards: power card names the base", [(CT, "title: `Potencia de ${name}`,", "title: `Potencia de ${pokemonName(member?.species ?? '')}`,")]),
    ("cards: train card names the base", [(CT, "title: `Entrenar a ${pokemonName(context.formOf(member))}`", "title: `Entrenar a ${pokemonName(member.species)}`")]),
    ("text: results name the base", [(ST, "summary.team.map((m) => `${pokemonName(m.form)} Nv${m.level}`)", "summary.team.map((m) => `${pokemonName(m.species)} Nv${m.level}`)")]),
    ("text: evolution names the target twice", [(ST, "return `¡${pokemonName(from)} evoluciona a ${pokemonName(to)}!`;", "return `¡${pokemonName(to)} evoluciona a ${pokemonName(to)}!`;")]),
    ("text: peak announces an evolution", [(ST, "return `¡${pokemonName(to)} alcanza su máximo poder!`;", "return `¡${pokemonName(from)} evoluciona a ${pokemonName(to)}!`;")]),
    ("text: replaced names the base", [(ST, "`${pokemonName(event.form)} reemplaza a ${pokemonName(event.outForm)}`", "`${pokemonName(event.species)} reemplaza a ${pokemonName(event.out)}`")]),
    ("names: unknown id is empty", [(NM, "return pokemonNames[form] ?? capitalized(form);", "return pokemonNames[form] ?? '';")]),
    ("names: moves keep dashes", [(NM, "capitalized(move.replaceAll('-', ' '))", "capitalized(move)")]),
]
