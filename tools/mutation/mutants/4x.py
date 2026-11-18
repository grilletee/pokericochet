"""Mutants of the 4X: the capture in a run (join encounters, the capture of a boss, no drops), the
collection and the economy (banners by family, the 50/50 debt, the legendary keys, the profile v3 and
its migration, the rewards of a run), the splash and the digits (ui), the key of the Ultimate (app)
and the place of the team bar (ui).
Run with: python tools/mutation/run.py tools/mutation/mutants/4x.py"""

CA = "src/domain/catching.ts"
EF = "src/domain/effects.ts"
WA = "src/domain/waves.ts"
TI = "src/domain/tick.ts"
GA = "src/meta/gacha.ts"
PR = "src/meta/profile.ts"
RE = "src/meta/rewards.ts"
CO = "src/meta/collection.ts"
SE = "src/app/settings.ts"
TB = "src/ui/teamBar.ts"
PN = "src/ui/pixelNumber.ts"

M = [
    # --- block 1: the capture in a run ---
    ("join: the first level-up is not always an encounter", [(CA, "    run.player.level === rules.firstAt", "    false")]),
    ("join: no bad-luck protection", [(CA, "      : (rules.chance + run.joinMisses * rules.pityStep) * (full ? rules.fullTeamMult : 1);", "      : rules.chance * (full ? rules.fullTeamMult : 1);")]),
    ("join: a pseudo-legendary or a starter may ask to join", [(CA, "    !rules.excluded.includes(id) && !inTeam.has(id) && config.species[id] !== undefined;", "    !inTeam.has(id) && config.species[id] !== undefined;")]),
    ("join: one the team has may ask again", [(CA, "    !rules.excluded.includes(id) && !inTeam.has(id) && config.species[id] !== undefined;", "    !rules.excluded.includes(id) && config.species[id] !== undefined;")]),
    ("join: the encounter replaces the cards of the level", [(CA, "      run.pendingCards = true;", "")]),
    ("join: the misses are not counted", [(CA, "  run.joinMisses += 1;", "")]),
    ("catch: a throw outside the ring still lands", [(CA, "    const hit = dx * dx + dy * dy <= ring * ring;", "    const hit = true;")]),
    ("catch: a throw that lands always captures", [(CA, "    const caught = hit && roll < chance;", "    const caught = hit;")]),
    ("catch: the ring does not narrow", [(CA, "  const scale = rules.ringMax - (rules.ringMax - rules.ringMin) * ringTightness(rules, state);", "  const scale = rules.ringMax;")]),
    ("catch: a slow fight is worth as much as a fast one", [(CA, "  const fast = clamp01(1 - run.boss.tick / (2 * rules.parTicks));", "  const fast = 1;")]),
    ("catch: the damage of the fight does not count", [(CA, "  const unhurt = clamp01(1 - (2 * hurt) / Math.max(1, run.player.maxHp));", "  const unhurt = 1;")]),
    ("catch: the chance is not bounded", [(CA, "  return Math.max(rules.minChance, Math.min(rules.maxChance, state.performance * mult));", "  return state.performance * mult;")]),
    ("catch: the boss never flees by time", [(CA, "  if (state.ticks >= rules.windowTicks) {", "  if (false) {")]),
    ("catch: a defeated boss drops its ball again", [(WA, "  const catching = openBossCatch(run, config, boss);", "  const catching = false;")]),
    ("drops: an ordinary enemy drops its ball again", [(EF, "  if (config.capture.wildDrops === false) return true;", "")]),
    ("join: after the replace screen no cards come", [(TI, "  if (run.phase === 'playing') openPendingCards(run, config);", "")]),
    # --- block 2: the collection and the economy ---
    ("gacha: the debt belongs to the week, not the family", [(GA, "  const progressKey = banner.family ?? banner.key;", "  const progressKey = banner.key;")]),
    ("gacha: a lost 50/50 is never paid back", [(GA, "  const owed = limited && rules.lostHalfPaysBack && progress.owed === true;", "  const owed = false;")]),
    ("gacha: the showcase share is ignored", [(GA, "    const share = banner.featured4Share ?? rules.featured4Share;", "    const share = rules.featured4Share;")]),
    ("gacha: the showcase may feature a ★3", [(GA, "  const showcase = input.showcase.filter((id) => entryOf.get(id)?.stars === 4);", "  const showcase = input.showcase.filter((id) => entryOf.get(id) !== undefined);")]),
    ("keys: no hard pity of the legendary", [(GA, "  if (n >= legend.hardAt) return BP;", "")]),
    ("keys: a key is free", [(GA, "      fragments: profile.legend.fragments - cost,", "      fragments: profile.legend.fragments,")]),
    ("keys: the legendary pity never resets", [(GA, "      pity: legendary ? 0 : n,", "      pity: n,")]),
    ("migration: the classics are not added", [(PR, "  for (const id of classics) ownedRaw[id] ??= { level: 1 };", "")]),
    ("migration: the captured bosses are lost", [(PR, "  if (version >= 3 && isRecord(raw.caught)) {", "  if (false) {")]),
    ("import: an old save is refused", [(PR, "    (mark !== SAVE_MARK && !(typeof mark === 'string' && OLD_SAVE_MARKS.includes(mark)))", "    mark !== SAVE_MARK")]),
    ("rewards: no fragment for the legendary", [(RE, "  return summary.result === 'won' ? FRAGMENTS_PER_LEGEND : 0;", "  return 0;")]),
    ("rewards: a captured boss gives no candies", [(RE, "      candies: profile.owned[species] === undefined ? 0 : CAUGHT_CANDIES,", "      candies: 0,")]),
    ("rewards: the captures are not counted", [(RE, "    caught[c.species] = (caught[c.species] ?? 0) + 1;", "    caught[c.species] = 1;")]),
    ("dex: a captured boss shows as only seen", [(CO, "          : caught > 0", "          : false")]),
    # --- blocks 3-5: digits, the Ultimate key, the team bar ---
    ("digits: dark digits keep an ink outline", [(PN, "  return 0.299 * r + 0.587 * g + 0.114 * b < 85 ? LIGHT : INK;", "  return INK;")]),
    ("ultimate: any stored key is taken", [(SE, "    return isUltimateKey(raw) ? raw : DEFAULT_ULTIMATE_KEY;", "    return (raw ?? DEFAULT_ULTIMATE_KEY) as UltimateKey;")]),
    ("team bar: no gap under the HUD", [(TB, "  return Math.max(0, Math.ceil(hudBottom)) + TEAM_GAP;", "  return Math.max(0, Math.ceil(hudBottom));")]),
]
