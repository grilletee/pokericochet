"""Mutants of the 4G-J: the gacha (rarities, soft and hard pity, the ★4 guarantee, the 50/50 and the
featured guarantee, the shared pity, x10, candies of repeats), the profile v2 migration, the coins and
candies of a run, the roster exclusions, the phone layouts, the music layers and the Pokédex filters.
Run with: python tools/mutation/run.py tools/mutation/mutants/4gj.py"""

GA = "src/meta/gacha.ts"
PR = "src/meta/profile.ts"
RW = "src/meta/rewards.ts"
LY = "src/app/layout.ts"
MS = "src/ui/musicScore.ts"
CS = "src/ui/collectionScreen.ts"
RR = "tools/fetch-data/rosterRules.ts"

M = [
    # --- block 1: the gacha ---
    ("gacha: no hard pity", [(GA, "  if (n >= rules.hardAt) return BP;", "  if (n > rules.hardAt) return BP;")]),
    ("gacha: no soft pity", [(GA, "    return Math.min(BP, rules.rate5 + rules.softStep * (n - rules.softFrom + 1));", "    return rules.rate5;")]),
    ("gacha: soft pity one draw late", [(GA, "    return Math.min(BP, rules.rate5 + rules.softStep * (n - rules.softFrom + 1));", "    return Math.min(BP, rules.rate5 + rules.softStep * (n - rules.softFrom));")]),
    ("gacha: no ★4 guarantee", [(GA, "  } else if (n4 >= rules.fourEvery || roll4 < rules.rate4) {", "  } else if (roll4 < rules.rate4) {")]),
    ("gacha: the ★4 guarantee one draw late", [(GA, "  } else if (n4 >= rules.fourEvery || roll4 < rules.rate4) {", "  } else if (n4 > rules.fourEvery || roll4 < rules.rate4) {")]),
    ("gacha: no featured guarantee", [(GA, "  const forceFeatured = limited && !progress.won && bannerDraw >= rules.featuredAt;", "  const forceFeatured = false;")]),
    ("gacha: the featured always wins the 50/50", [(GA, "    featured = limited && (forceFeatured || rollShare < rules.featuredShare);", "    featured = limited;")]),
    ("gacha: the 50/50 never wins", [(GA, "    featured = limited && (forceFeatured || rollShare < rules.featuredShare);", "    featured = limited && forceFeatured;")]),
    ("gacha: the guarantee never spent", [(GA, "won: progress.won || (stars === 5 && featured) };", "won: progress.won };")]),
    ("gacha: the ★5 does not reset the pity", [(GA, "      pity5: stars === 5 ? 0 : n5,", "      pity5: n5,")]),
    ("gacha: a ★5 does not reset the ★4 pity", [(GA, "      pity4: stars >= 4 ? 0 : n4,", "      pity4: stars === 4 ? 0 : n4,")]),
    ("gacha: a repeat gives no candies", [(GA, "  const candies = isNew ? 0 : rules.repeatCandies[stars];", "  const candies = 0;")]),
    ("gacha: x10 costs one", [(GA, "  if (profile.coins < rules.cost * n) return { ok: false, reason: 'coins' };", "  if (profile.coins < rules.cost) return { ok: false, reason: 'coins' };")]),
    ("gacha: no ★4 by strength", [(GA, "        : total(final) >= input.rules.fourStarFinalTotal", "        : total(final) > 9999")]),
    ("gacha: a theme without ★5 opens a banner", [(GA, "    byStars(entries, 5).length > 0 && byStars(entries, 4).length >= want4;", "    byStars(entries, 4).length >= want4;")]),
    # --- the profile v2 ---
    ("profile: v1 keeps garbage pity", [(PR, "      pity5: version < 2 ? 0 : int(gachaRaw.pity5, 0, 1_000_000, 0),", "      pity5: int(gachaRaw.pity5 ?? gachaRaw.sinceNew, 0, 1_000_000, 0),")]),
    # --- block 3: candies by playing ---
    ("candies: quitting at once earns them", [(RW, "  if (summary.wavesCleared < 1) return 0;\n", "")]),
    ("candies: a Pokémon you do not have earns them", [(RW, "  const candies = profile.owned[starter] === undefined ? 0 : candiesFor(summary);", "  const candies = candiesFor(summary);")]),
    # --- block 2: the roster rule ---
    ("roster: excluded children kept", [(RR, "      const options = reachable.filter((c) => !isExcluded(c.name));", "      const options = reachable;")]),
    ("roster: excluded bases kept", [(RR, "    if (isExcluded(node.name)) {", "    if (false) {")]),
    # --- block 4: the phone layouts ---
    ("layout: a tablet is a phone", [(LY, "  return coarse && Math.min(screenW, screenH) < 540;", "  return coarse;")]),
    ("layout: the link does not win", [(LY, "  if (isPhoneLayout(param)) return param;\n", "")]),
    ("layout: the desktop gets a layout", [(LY, "  if (!phone) return null;\n", "")]),
    ("layout: A widens the field too", [(LY, "  if (layout !== 'b') return config;", "  if (layout === null) return config;")]),
    # --- block 5: the music ---
    ("music: every layer always plays", [(MS, "    if ((voice.layer ?? 0) > tension) continue;\n", "")]),
    ("music: the bosses never alternate", [(MS, "    return (view.bossIndex ?? 0) % 2 === 1 ? 'boss2' : 'boss';", "    return 'boss';")]),
    ("music: low health is not tense", [(MS, "  if (view.hpShare <= 0.3 || view.nearLine || view.bossNearLine) return 2;", "  if (view.nearLine || view.bossNearLine) return 2;")]),
    ("music: the fury is not tense", [(MS, "  if (view.fury || view.enemies >= 10) return 1;", "  if (view.enemies >= 10) return 1;")]),
    # --- block 6: the Pokédex ---
    ("pokedex: 'only mine' shows everything", [(CS, "      (!filters.mine || t.state === 'owned'),", "      true,")]),
]
