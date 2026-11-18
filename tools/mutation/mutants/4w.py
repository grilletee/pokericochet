"""Mutants of the 4W: the pace of each line (data), the start level by candies (meta), the boss
curve (domain), the number of the killing blow and the digits (domain, render), the ladder of the
permanent level (meta), the search and filters of the Pokédex (ui), the anticipation and rhythm of
the gacha (ui), the arenas and the strikes at pixel 2 (render), and the branches (domain).
Run with: python tools/mutation/run.py tools/mutation/mutants/4w.py"""

EP = "src/data/evolutionPace.ts"
PR = "src/meta/profile.ts"
CO = "src/meta/collection.ts"
MO = "src/domain/moves.ts"
WA = "src/domain/waves.ts"
EF = "src/domain/effects.ts"
FO = "src/domain/forms.ts"
TE = "src/domain/team.ts"
DQ = "src/ui/dexQuery.ts"
GT = "src/ui/gachaText.ts"
LA = "src/render/legendArena.ts"
BA = "src/render/bossArt.ts"
SE = "src/app/settings.ts"

M = [
    # --- block 1: the pace of each line ---
    ("pace: real levels not scaled", [(EP, "  return 1 + Math.round(real / PACE.divisor);", "  return real;")]),
    ("pace: pseudo-legendaries evolve early", [(EP, "  const firstMin = pseudo ? PACE.pseudoFirstMin : PACE.firstMin;", "  const firstMin = PACE.firstMin;")]),
    ("pace: pseudo-legendaries reach the last form early", [(EP, "  if (pseudo) three = PACE.lastMax;", "  if (pseudo) three = two + 1;")]),
    ("pace: stage 3 may pass the last level", [(EP, "  return [two, clamp(three, two + 1, PACE.lastMax)];", "  return [two, Math.max(three, two + 1)];")]),
    ("candies: a starter may begin in its last form", [(PR, "  return Math.min(startLevelFor(permanentLevel), cap);", "  return startLevelFor(permanentLevel);")]),
    # --- block 2: the boss curve ---
    ("bosses: no cap on a move", [(MO, "    cap !== undefined && enemy.id === run.boss.id ? Math.min(raw, run.boss.maxHp * cap) : raw;", "    raw;")]),
    ("bosses: the species decides the health", [(WA, "  const bossHpStat = config.enemy.bossHpStat ?? Math.max(60, Math.min(110, species.baseStats.hp));", "  const bossHpStat = Math.max(60, Math.min(110, species.baseStats.hp));")]),
    # --- block 3: the number of the killing blow ---
    ("kill: the damage of the last blow is lost", [(EF, "  run.events.push({ type: 'kill', enemyId: enemy.id, x: enemy.x, y: enemy.y, damage: dealt });", "  run.events.push({ type: 'kill', enemyId: enemy.id, x: enemy.x, y: enemy.y });")]),
    # --- block 4: the ladder of the permanent level ---
    ("ladder: every level is a milestone", [(CO, "      milestone: level > 1 && startLevel > before,", "      milestone: level > 1,")]),
    ("ladder: the candies missing are not counted", [(CO, "    missing: Math.max(0, candiesBetween(level, step.level) - candies),", "    missing: 0,")]),
    ("tips: shown every time", [(SE, "  if (seen.has(tip)) return false;", "")]),
    # --- block 5: search and filters ---
    ("search: an unknown one gives away its name", [(DQ, "  if (item.state === 'unknown') return false;", "")]),
    ("filters: the rarity filter does nothing", [(DQ, "      (query.stars === null || item.stars === query.stars) &&", "      true &&")]),
    ("filters: 'puede subir' ignores the candies", [(DQ, "      (!query.canLevel || (item.state === 'owned' && item.candies >= item.nextCost)),", "      (!query.canLevel || item.state === 'owned'),")]),
    # --- block 6: the gacha ---
    ("gacha: the sphere never turns gold", [(GT, "  if (best >= 5) shifts.push({ at: 1450, stars: 5 });", "")]),
    ("gacha: no beat before a 4-star", [(GT, "    if (s === 4) at += FOUR_BEAT;", "")]),
    ("gacha: the 5-star screen is not waited for", [(GT, "    at += s === 5 ? FIVE_SCREEN : step;", "    at += step;")]),
    ("gacha: the commons do not speed up", [(GT, "    step = Math.max(MIN_STEP, step - ACCEL);", "")]),
    # --- block 6: arenas and strikes ---
    ("arenas: lava orange counts as danger", [(LA, "  return hue >= -20 && hue <= 15;", "  return hue >= -20 && hue <= 30;")]),
    ("arenas: no colour is danger", [(LA, "  if (r < 150 || r < g || r < b || spread < 90) return false;", "  return false;")]),
    ("strikes: Scale2x invents the corner", [(BA, "      top += (c === a && c !== d && a !== b ? a : p) + (a === b && a !== c && b !== d ? b : p);", "      top += (c === a ? a : p) + (a === b ? b : p);")]),
    # --- block 7: the branches ---
    ("branches: the main type of the usual line is ignored", [(FO, "    if (usualTypes.includes(type)) return usual;", "")]),
    ("branches: a branch never shows", [(FO, "    if (set !== undefined && stage >= set.at) {", "    if (set !== undefined && stage > 3) {")]),
    ("branches: a branch attacks with its base type", [(FO, "  const back = branch !== undefined && species !== undefined ? species.type : fallback;", "  const back = fallback;")]),
    ("branches: a branch uses the moves of its line", [(FO, "  return branch !== undefined && config.moves.byBase[branch] !== undefined ? branch : base;", "  return base;")]),
    ("branches: the branch is never chosen", [(TE, "  if (split !== undefined && member.branch === undefined && stage >= split.at) {", "  if (false) {")]),
    ("branches: a captured Vaporeon takes a branch by place", [(TE, "  return joinsAt >= set.at ? formAt(config, base, set.at) : undefined;", "  return undefined;")]),
]
