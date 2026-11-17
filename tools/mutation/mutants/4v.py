"""Mutants of the 4V: the payback of a lost 50/50 (meta), the hit-stop (app), the rules of the feel
of a hit and the scenes of the biomes (render), the pity panel and the rhythm of the reveal of the
gacha, the HUD and the sounds of the interface (ui).
Run with: python tools/mutation/run.py tools/mutation/mutants/4v.py"""

GA = "src/meta/gacha.ts"
PR = "src/meta/profile.ts"
HS = "src/app/hitStop.ts"
FR = "src/render/feelRules.ts"
SI = "src/render/sceneIds.ts"
GT = "src/ui/gachaText.ts"
HU = "src/ui/hud.ts"
AU = "src/ui/audio.ts"

M = [
    # --- block 3: the payback of a lost 50/50 ---
    ("50/50: the debt is never paid", [(GA, "    featured = limited && (forceFeatured || owed || rollShare < rules.featuredShare);", "    featured = limited && (forceFeatured || rollShare < rules.featuredShare);")]),
    ("50/50: the rule of the data is ignored", [(GA, "  const owed = limited && rules.lostHalfPaysBack && progress.owed === true;", "  const owed = limited && progress.owed === true;")]),
    ("50/50: a lost one opens no debt", [(GA, "    const owes = stars === 5 ? !featured : progress.owed === true;", "    const owes = progress.owed === true;")]),
    ("50/50: a ★4 or ★3 settles the debt", [(GA, "    const owes = stars === 5 ? !featured : progress.owed === true;", "    const owes = stars === 5 ? !featured : false;")]),
    ("50/50: the screen never says it", [(GA, "    featuredOwed: limited && rules.lostHalfPaysBack && progress?.owed === true,", "    featuredOwed: false,")]),
    ("50/50: a save forgets the debt", [(PR, "      ...(value.owed === true ? { owed: true } : {}),", "      ...{},")]),
    # --- block 1: the hit-stop ---
    ("hit-stop: no gap between two stops", [(HS, "    if (ms <= 0 || now - this.lastStart < HIT_STOP_GAP_MS) return false;", "    if (ms <= 0) return false;")]),
    ("hit-stop: it never ends", [(HS, "    return now < this.until;", "    return now >= this.lastStart;")]),
    ("hit-stop: every move stops the game", [(HS, "      return event.manual ? HIT_STOP_MS.ultimate : 0;", "      return HIT_STOP_MS.ultimate;")]),
    # --- block 1: the feel of a hit ---
    ("numbers: no cap", [(FR, "  if (alive >= NUMBER_CAP) return false;", "")]),
    ("numbers: a busy field shows every hit", [(FR, "  if (alive >= NUMBER_CAP * NUMBER_BUSY && effectiveness <= 1) return false;", "")]),
    ("numbers: a hit of nothing shows", [(FR, "  if (Math.round(damage) < 1) return false;", "")]),
    ("numbers: very effective is not gold", [(FR, "  if (effectiveness > 1) return STRONG;", "")]),
    ("flash: an enemy flashes on every hit", [(FR, "  return now - lastStart >= FLASH_GAP_MS;", "  return true;")]),
    # --- block 1: the scenes ---
    ("scenes: the swamp is the coast", [(SI, "  if (main === WATER && (second === POISON || second === BUG)) return 'swamp';", "")]),
    ("scenes: the power plant is the storm", [(SI, "  if (main === ELECTRIC && (second === NORMAL || second === FIGHTING || second === STEEL)) {", "  if (false) {")]),
    # --- block 3: the pity panel and the reveal ---
    ("pity panel: the soft pity does not show", [(GT, "      hot: pity.soft,", "      hot: false,")]),
    ("pity panel: a lost 50/50 does not show", [(GT, "      value: owed ? 'Seguro' : got ? '¡Ya!' : String(pity.toFeatured ?? 0),", "      value: got ? '¡Ya!' : String(pity.toFeatured ?? 0),")]),
    ("reveal: in the order drawn, the ★5 not last", [(GT, "  const order = stars.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s || a.i - b.i);", "  const order = stars.map((s, i) => ({ s, i }));")]),
    ("reveal: no beat before a ★5", [(GT, "    if (s === 5) at += FIVE_BEAT;", "")]),
    # --- block 4: the HUD and the sounds ---
    ("hud: the waves are never done", [(HU, "    i < index ? 'done' : i === index ? 'now' : 'next',", "    i === index ? 'now' : 'next',")]),
    ("hud: health shows empty while alive", [(HU, "  const lit = hp <= 0 ? 0 : Math.max(1, Math.round((hp / Math.max(1, maxHp)) * total));", "  const lit = Math.round((hp / Math.max(1, maxHp)) * total);")]),
    ("sounds: the draws sound twice", [(AU, "  if (isDraw) return null;", "")]),
    ("sounds: back sounds like accept", [(AU, "  if (action === 'back' || action === 'menu') return 'uiBack';", "")]),
]
