"""Mutants of the 4H-B1 (skippable evolution pause, wave advice and cartel, Ultimates of equal value,
concurrent fetcher, roster rule and type chart).
Paths are relative to the project root; `tools/mutation/run.py` applies them to an isolated copy."""

EM = "src/ui/evolutionMoment.ts"
AD = "src/domain/advice.ts"
ST = "src/ui/screenText.ts"
WB = "src/ui/waveBanner.ts"
CF = "src/data/config/index.ts"
CA = "tools/fetch-data/cache.ts"
RR = "tools/fetch-data/rosterRules.ts"
TC = "tools/fetch-data/typechart.ts"

M = [
    # ---- the evolution pause: two seconds, skippable after a grace
    ("pause: stage 3 not longer", [(EM, "return stage >= 3 ? 2400 : 2000;", "return stage > 3 ? 2400 : 2000;")]),
    ("pause: stage 2 as long as 3", [(EM, "return stage >= 3 ? 2400 : 2000;", "return stage >= 2 ? 2400 : 2000;")]),
    ("skip: no grace", [(EM, "if (!this.active(now) || now - this.since < SKIP_GRACE_MS) return false;", "if (!this.active(now)) return false;")]),
    ("skip: grace boundary", [(EM, "now - this.since < SKIP_GRACE_MS", "now - this.since <= SKIP_GRACE_MS")]),
    ("skip: does not end the pause", [(EM, "    this.until = Number.NEGATIVE_INFINITY;\n    return true;", "    return true;")]),
    ("skip: says no after skipping", [(EM, "    return true;\n  }\n\n  reset", "    return false;\n  }\n\n  reset")]),
    ("skip: works with no pause on", [(EM, "if (!this.active(now) || now - this.since < SKIP_GRACE_MS) return false;", "if (now - this.since < SKIP_GRACE_MS) return false;")]),
    ("skip: grace from the last step", [(EM, "if (now >= this.until) this.since = now;", "this.since = now;")]),
    ("skip: grace of zero", [(EM, "export const SKIP_GRACE_MS = 300;", "export const SKIP_GRACE_MS = 0;")]),
    ("skip: grace of a second", [(EM, "export const SKIP_GRACE_MS = 300;", "export const SKIP_GRACE_MS = 1000;")]),
    # ---- the advice of the wave and the next boss
    ("matchup: empty list is not neutral", [(AD, "if (defenders.length === 0) return 1;", "if (defenders.length === 0) return 0;")]),
    ("matchup: sum, not mean", [(AD, "return sum / defenders.length;", "return sum;")]),
    ("advice: neutral counts as effective", [(AD, ".filter((s) => s.value > 1)", ".filter((s) => s.value >= 1)")]),
    ("advice: neutral counts as resisted", [(AD, ".filter((s) => s.value < 1)", ".filter((s) => s.value <= 1)")]),
    ("advice: effective weakest first", [(AD, ".sort((a, b) => b.value - a.value)", ".sort((a, b) => a.value - b.value)")]),
    ("advice: resisted mildest first", [(AD, ".sort((a, b) => a.value - b.value)\n      .map((s) => s.type),\n  };", ".sort((a, b) => b.value - a.value)\n      .map((s) => s.type),\n  };")]),
    ("advice: ticks do not subtract the clock", [(AD, "return Math.max(0, ticks - run.wave.tick);", "return Math.max(0, ticks);")]),
    ("advice: ticks skip the wave in progress", [(AD, "for (let i = run.wave.index; i <= last; i++)", "for (let i = run.wave.index + 1; i <= last; i++)")]),
    ("advice: ticks stop one wave early", [(AD, "for (let i = run.wave.index; i <= last; i++)", "for (let i = run.wave.index; i < last; i++)")]),
    ("advice: boss counts one wave too many", [(AD, "ticksThrough(run, config, next.after - 1)", "ticksThrough(run, config, next.after)")]),
    ("advice: boss number from 0", [(AD, "number: run.boss.next + 1,", "number: run.boss.next,")]),
    ("advice: final boss number is the last interlude", [(AD, "number: interludes.length + 1,", "number: interludes.length,")]),
    ("advice: a boss on the field still has a next", [(AD, "if (!isBossAlive(run) && !run.boss.spawned) {", "if (!run.boss.spawned) {")]),
    ("advice: the final boss still has a next", [(AD, "if (!isBossAlive(run) && !run.boss.spawned) {", "if (!isBossAlive(run)) {")]),
    ("advice: index not clamped", [(AD, "const index = Math.min(run.wave.index, Math.max(0, total - 1));", "const index = run.wave.index;")]),
    ("advice: time left after the last wave", [(AD, "ticksLeft: finished || wave === undefined ? 0 :", "ticksLeft: wave === undefined ? 0 :")]),
    ("advice: no total for the bar", [(AD, "ticksTotal: wave?.durationTicks ?? 0,", "ticksTotal: 0,")]),
    # ---- the texts of the strip and the cartel
    ("text: the clock rounds down", [(ST, "const total = Math.ceil(Math.max(0, ticks) / 60);", "const total = Math.floor(Math.max(0, ticks) / 60);")]),
    ("text: the wave counts from 0", [(ST, "return `Oleada ${index + 1}/${total}`;", "return `Oleada ${index}/${total}`;")]),
    ("text: 'ya viene' too late", [(ST, "return boss.ticks <= 0 ?", "return boss.ticks < 0 ?")]),
    ("text: the cartel counts from 0", [(ST, "title: `OLEADA ${advice.index + 1}/${advice.total}${name}`,", "title: `OLEADA ${advice.index}/${advice.total}${name}`,")]),
    ("text: the cartel shows two effective types", [(ST, "const effective = advice.effective.slice(0, 3);", "const effective = advice.effective.slice(0, 2);")]),
    ("text: the cartel announces a boss that is not next", [(ST, "advice.boss.ticks <= advice.ticksLeft;", "advice.boss.ticks <= advice.ticksLeft + 99999;")]),
    ("text: the cartel announces the boss one tick late", [(ST, "advice.boss.ticks <= advice.ticksLeft;", "advice.boss.ticks < advice.ticksLeft;")]),
    ("text: the boss cartel is not upper case", [(ST, "title: `${label.toUpperCase()} · ${pokemonName(species)}`,", "title: `${label} · ${pokemonName(species)}`,")]),
    ("text: the boss cartel shows two types", [(ST, "const shown = effective.slice(0, 3);", "const shown = effective.slice(0, 2);")]),
    # ---- one sign at a time
    ("signs: replaced instead of waiting", [(WB, "if (this.shown === null) this.advance(now);", "this.advance(now);")]),
    ("signs: taken down a tick late", [(WB, "now >= this.until", "now > this.until")]),
    ("signs: never taken down", [(WB, "if (this.shown !== null && now >= this.until) {", "if (false) {")]),
    ("signs: the time is absolute", [(WB, "this.until = now + next.ms;", "this.until = next.ms;")]),
    ("signs: clear keeps the sign", [(WB, "    this.items.length = 0;\n    this.shown = null;", "    this.items.length = 0;")]),
    ("signs: clear keeps the line", [(WB, "    this.items.length = 0;\n    this.shown = null;", "    this.shown = null;")]),
    ("signs: a wave sign too short", [(WB, "export const CARTEL_MS = 2000;", "export const CARTEL_MS = 1000;")]),
    ("signs: a boss sign shorter than a wave one", [(WB, "export const BOSS_CARTEL_MS = 2500;", "export const BOSS_CARTEL_MS = 1500;")]),
    # ---- the Ultimates are worth the same (U1)
    ("U1: the cross as in 4F-E", [(CF, "{ kind: 'cross', width: 48, power: 1.85 },", "{ kind: 'cross', width: 48, power: 2.8 },")]),
    ("U1: the wave too weak", [(CF, "{ kind: 'wave', width: 72, power: 3.9 },", "{ kind: 'wave', width: 72, power: 2.4 },")]),
    ("U1: the chain short", [(CF, "{ kind: 'chain', count: 5, power: 3.7 },", "{ kind: 'chain', count: 5, power: 2.4 },")]),
    ("U1: the stage 2 beam too strong", [(CF, "{ kind: 'beam', width: 56, power: 1.65 },", "{ kind: 'beam', width: 56, power: 2.6 },")]),
    # ---- the concurrent fetcher
    ("fetch: sequential when asked for four", [(CA, "Math.max(1, Math.floor(options.concurrency ?? 1))", "1")]),
    ("fetch: four by default", [(CA, "Math.max(1, Math.floor(options.concurrency ?? 1))", "Math.max(1, Math.floor(options.concurrency ?? 4))")]),
    ("fetch: no pause between a worker's requests", [(CA, "if (this.used[slot] || attempt > 0) {", "if (attempt > 0) {")]),
    ("fetch: workers never remember they worked", [(CA, "        this.used[slot] = true;\n", "")]),
    ("fetch: 429 waits as long as any error", [(CA, "String(lastError).includes('429') ? 4 : 1", "String(lastError).includes('429') ? 1 : 1")]),
    ("fetch: everything waits as after a 429", [(CA, "const tooMany = attempt > 0 && String(lastError).includes('429') ? 4 : 1;", "const tooMany = 4;")]),
    ("fetch: two callers download twice", [(CA, "    if (running !== undefined) return running;\n", "")]),
    ("fetch: a failure is remembered forever", [(CA, ".finally(() => this.inflight.delete(cachePath))", ".finally(() => {})")]),
    ("fetch: a finished worker is lost", [(CA, "    else this.free.push(slot);", "")]),
    ("fetch: waiting jobs are dropped", [(CA, "if (next !== undefined) next(slot);", "if (next !== undefined) next(slot + 99);")]),
    # ---- the roster rule
    ("roster: keeps the weaker branch", [(RR, "return tb > ta || (tb === ta", "return tb < ta || (tb === ta")]),
    ("roster: a tie goes to the higher number", [(RR, "(tb === ta && dexOf(b.name) < dexOf(a.name))", "(tb === ta && dexOf(b.name) > dexOf(a.name))")]),
    ("roster: lines of four forms", [(RR, "while (path.length < 3 &&", "while (path.length < 4 &&")]),
    ("roster: lines of two forms", [(RR, "while (path.length < 3 &&", "while (path.length < 2 &&")]),
    ("roster: babies are bases", [(RR, "if (isBaby(node.name)) {", "if (false) {")]),
    ("roster: a baby's children are lost", [(RR, "      for (const child of node.children) start(child);", "")]),
    ("roster: the range excludes its last species", [(RR, "info.id <= rules.maxPokedexId", "info.id < rules.maxPokedexId")]),
    ("roster: legendaries allowed", [(RR, "if (isLegend(node.name)) {", "if (false) {")]),
    ("roster: mythicals allowed", [(RR, "(rules.excludeMythical && info.mythical)", "(false && info.mythical)")]),
    ("roster: legendary and mythical both needed", [(RR, "((rules.excludeLegendary && info.legendary) || (rules.excludeMythical && info.mythical))", "((rules.excludeLegendary && info.legendary) && (rules.excludeMythical && info.mythical))")]),
    ("roster: a non-split is a dropped branch", [(RR, "if (options.length > 1) {", "if (options.length > 0) {")]),
    ("roster: forms out of range not counted", [(RR, "outOfRange += node.children.length - options.length;", "outOfRange += 0;")]),
    ("roster: the species name instead of the form", [(RR, "species.get(name)?.pokemon ?? name", "name")]),
    # ---- the type chart
    ("types: a half is a quarter", [(TC, "['half_damage_to', 0.5],", "['half_damage_to', 0.25],")]),
    ("types: a double is 1.5", [(TC, "['double_damage_to', 2],", "['double_damage_to', 1.5],")]),
    ("types: an immunity is neutral", [(TC, "['no_damage_to', 0],", "['no_damage_to', 1],")]),
    ("types: a type in two lists is accepted", [(TC, "      if (seen.has(defender)) throw new Error(`type \"${type}\": \"${defender}\" is in two lists`);\n", "")]),
    ("types: a type outside the 18 is accepted", [(TC, "if (!ALL_TYPES.includes(defender as TypeId)) {", "if (false) {")]),
]
