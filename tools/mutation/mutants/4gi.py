"""Mutants of the 4G-I: the body as hitbox and its guarantee, the drawn form of the balls, the boss near
the line, the final legendary (sway, legendary move, its fury), the music score, the profile and its
migrations, the starters and the generic Ultimate, the coins, the gacha and its guarantee, registering
a capture and the candies.
Run with: python tools/mutation/run.py tools/mutation/mutants/4gi.py"""

BF = "src/domain/bossFight.ts"
DG = "src/domain/dodge.ts"
TM = "src/domain/team.ts"
RN = "src/domain/run.ts"
MV = "src/domain/moves.ts"
PR = "src/meta/profile.ts"
GA = "src/meta/gacha.ts"
RG = "src/meta/register.ts"
CO = "src/meta/collection.ts"
ST = "src/meta/starters.ts"
RW = "src/meta/rewards.ts"
BL = "src/ui/bossLine.ts"
MS = "src/ui/musicScore.ts"

M = [
    # --- block 1: the body is the hitbox ---
    ("hitbox: only the centre counts again", [(BF, "return Math.abs(run.player.x - hazard.x) <= hazard.width / 2 + PLAYER_WIDTH / 2;", "return Math.abs(run.player.x - hazard.x) <= hazard.width / 2;")]),
    ("hitbox: half the body", [(BF, "return Math.abs(run.player.x - hazard.x) <= hazard.width / 2 + PLAYER_WIDTH / 2;", "return Math.abs(run.player.x - hazard.x) <= hazard.width / 2 + PLAYER_WIDTH / 4;")]),
    ("guarantee: the margin counts once", [(DG, "export const MIN_GAP = PLAYER_WIDTH + 2 * SAFE_MARGIN;", "export const MIN_GAP = PLAYER_WIDTH + SAFE_MARGIN;")]),
    # --- block 2: what a ball shows ---
    ("form: a capture shows the stage of the enemy", [(TM, "    stage: stageOf(config, captureLevel(config, stage)),", "    stage,")]),
    ("form: a capture shows its first form", [(TM, "    form: captureForm(config, species, stage),\n    stage: stageOf", "    form: species,\n    stage: stageOf")]),
    # --- block 3: the boss near the line ---
    ("line: counts down for a boss that does not move", [(BF, "  if (speed <= 0) return -1;\n", "")]),
    ("line: one tick short", [(BF, "  return whole < exact ? whole + 1 : whole; // rounded up: the tick on which it gets there", "  return whole;")]),
    ("line: alarms only once per run", [(BL, "    if (bossId !== this.bossId) {\n      this.bossId = bossId;\n      this.next = 0;\n    }", "    this.bossId = bossId;")]),
    ("line: the first alarm does not explain", [(BL, "    const first = !this.told;", "    const first = false;")]),
    # --- block 4: the final legendary ---
    ("legendary: does not sway", [(BF, "  boss.x = width / 2 + legendary.swayWidth * triangle(run.boss.tick / legendary.swayTicks);", "  boss.x = width / 2;")]),
    ("legendary: its move leaves no gap", [(BF, "    if (i === safe) continue;\n    group.push({\n      kind: 'comb',", "    group.push({\n      kind: 'comb',")]),
    ("legendary: its fury does not open with its move", [(BF, "      run.boss.legendIn = fight.calmTicks + 30;", "      run.boss.legendIn = run.boss.legendIn;")]),
    ("legendary: a move that waits never comes back", [(BF, "    run.boss.legendIn = 60;", "    run.boss.legendIn = 1e9;")]),
    # --- block 6: the score ---
    ("music: a stinger loops", [(MS, "  if (!track.loop && index >= total) return [];", "")]),
    ("music: held notes are cut", [(MS, "    while (tokens[(at + length) % tokens.length] === '-' && length < tokens.length) length += 1;", "")]),
    # --- block 7: the profile ---
    ("profile: a newer version is read", [(PR, "  if (version > PROFILE_VERSION) return null;\n", "")]),
    ("profile: a collection without the flag offers the classics again", [(PR, "    firstStarterChosen: raw.firstStarterChosen === true || Object.keys(owned).length > 0,", "    firstStarterChosen: raw.firstStarterChosen === true,")]),
    ("profile: the permanent level gives nothing", [(PR, "  return 1 + Math.floor((level - 1) / 3);", "  return 1;")]),
    ("profile: the run starts at level 1 whatever the profile", [(RN, "addMember(run, config, starterSpecies, Math.max(1, config.team.starterLevel ?? 1), true);", "addMember(run, config, starterSpecies, 1, true);")]),
    # --- block 8: starters ---
    ("starters: the classics are always offered", [(ST, "  if (!profile.firstStarterChosen) return classics;", "  return classics;")]),
    ("starters: the first choice can be repeated", [(ST, "  if (profile.firstStarterChosen || !classics.includes(species)) return profile;", "  if (!classics.includes(species)) return profile;")]),
    ("ultimate: no generic one", [(MV, "  if (config.moves.signatures[base] !== undefined) return signatureOf(config, base, stage);", "  return signatureOf(config, base, stage);")]),
    ("ultimate: every member uses the starter's shape", [(MV, "  const own = starter ? starterSignatureOf(config, base, stage) : signatureOf(config, base, stage);", "  const own = starterSignatureOf(config, base, stage);")]),
    # --- block 9: coins and gacha ---
    ("coins: no prize for winning", [(RW, "    (summary.result === 'won' ? COINS_FOR_WIN : 0) +", "    0 +")]),
    ("gacha: free draws", [(GA, "  if (profile.coins < GACHA_COST) return { ok: false, reason: 'coins' };", "")]),
    ("gacha: no guarantee", [(GA, "  const guaranteed = profile.gacha.sinceNew >= PITY - 1 && unowned.length > 0;", "  const guaranteed = false;")]),
    ("gacha: the guarantee never resets", [(GA, "      sinceNew: isNew ? 0 : profile.gacha.sinceNew + 1,", "      sinceNew: profile.gacha.sinceNew + 1,")]),
    ("gacha: legendaries in the pool", [(GA, "    .filter((id) => baseOf(config, id).base === id && !legendary.has(id))", "    .filter((id) => baseOf(config, id).base === id)")]),
    # --- block 10: registering ---
    ("register: no boss needed", [(RG, "  if (summary.bossesDefeated < REGISTER_MIN_BOSSES) return [];\n", "")]),
    ("register: anything can be registered", [(RG, "  if (!offered.includes(species)) return { profile, isNew: false };\n", "")]),
    # --- block 11: candies ---
    ("candies: a level up without the candies", [(CO, "  if (candies < cost) return profile;\n", "")]),
    ("candies: no top level", [(CO, "  return level >= MAX_PERMANENT_LEVEL ? Number.POSITIVE_INFINITY : 3 * level;", "  return 3 * level;")]),
]
