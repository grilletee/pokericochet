"""Mutants of the 4G-H: the boss takes the same damage always, its attacks carry its type, the final
victory clears the field, the shots of the enemies are aimed and come in bursts (always with a way
through), the balls on the floor have their flight size, the launcher follows the finger, the two
thumbs, the side panels, the hidden portrait schemes, the looks of the attacks and the arenas.
Run with: python tools/mutation/run.py tools/mutation/mutants/4gh.py"""

BF = "src/domain/bossFight.ts"
TK = "src/domain/tick.ts"
SN = "src/domain/snapshot.ts"
RN = "src/domain/run.ts"
SA = "src/domain/smartAim.ts"
TL = "src/app/touchLogic.ts"
SL = "src/ui/sideLayout.ts"
TB = "src/ui/teamBar.ts"
CS = "src/ui/controlSchemes.ts"
ST = "src/app/settings.ts"
BA = "src/render/bossArt.ts"
LA = "src/render/legendArena.ts"

M = [
    # --- block 1: bosses ---
    ("boss: the fury can be skipped", [(BF, "return Math.max(0, Math.min(amount, boss.hp - floor));", "return Math.max(0, amount);")]),
    ("boss: hits it for half (an old multiplier left)", [(BF, "return Math.max(0, Math.min(amount, boss.hp - floor));", "return Math.max(0, Math.min(amount * 0.5, boss.hp - floor));")]),
    ("boss: its attacks have no type", [(BF, "    type: boss.type as GameType,\n", "")]),
    ("victory: what the boss left stays on the floor", [(TK, "    run.hazards.length = 0;\n    run.events.push({ type: 'won' });", "    run.events.push({ type: 'won' });")]),
    ("smart: the boss is not preferred", [(SA, "  if (boss !== undefined) return { x: boss.x, y: boss.y, id: boss.id };", "  if (false) return { x: 0, y: 0, id: 0 };")]),
    # --- block 2: enemies that shoot ---
    ("fire: the shot is not aimed (falls from the enemy)", [(BF, "const centre = aimed ? run.player.x : e.x;", "const centre = e.x;")]),
    ("fire: a burst is always one shot", [(BF, "const count = Math.max(1, Math.min(rule.burst ?? 1, fire.maxAtOnce - shots));", "const count = 1;")]),
    ("fire: a burst goes over maxAtOnce", [(BF, "const count = Math.max(1, Math.min(rule.burst ?? 1, fire.maxAtOnce - shots));", "const count = Math.max(1, rule.burst ?? 1);")]),
    ("fire: the burst lands all in one place", [(BF, "const offset = (k - (count - 1) / 2) * spread;", "const offset = 0;")]),
    ("fire: the burst lands all at once", [(BF, "telegraph: WARN_TICKS + k * (fire.burstGapTicks ?? 0),", "telegraph: WARN_TICKS,")]),
    ("fire: the shot does not say where it flies from", [(BF, "...(aimed ? { fromX: e.x, fromY: e.y } : {}),", "")]),
    ("fire: the shots of a burst are not counted", [(BF, "if (addHazards(run, config, group, true, true)) shots += group.length;", "addHazards(run, config, group, true, true);")]),
    ("fire: an enemy fires again over its own shot", [(BF, "    if (run.hazards.some((h) => h.link === -e.id)) continue;\n", "")]),
    ("fire: a burst ignores the three-warnings limit", [(BF, "const calm = !calmCheck || first.kind === 'portal' || warningsFit(run, first.telegraph);", "const calm = true;")]),
    ("hash: where a shot flies from is not hashed", [(RN, "    h.num(hz.fromX ?? -1);\n", "")]),
    ("snapshot: where a shot flies from is not written", [(SN, "    snap.hazardFromX[i] = h.fromX ?? -1;\n", "")]),
    # --- block 3: the balls ---
    ("pickup: a ball of the team is drawn at stage 1", [(SN, "          ? ballRadius(config, ball)\n", "          ? config.ball.radius\n")]),
    ("pickup: a capture is drawn one stage up", [(SN, "stageForLevel(config, p.level) - 1]", "stageForLevel(config, p.level)]")]),
    ("blink: every hit blinks", [(TB, "return last === undefined || now - last >= HIT_BLINK_GAP_MS;", "return true;")]),
    ("blink: only the first hit blinks", [(TB, "return last === undefined || now - last >= HIT_BLINK_GAP_MS;", "return last === undefined;")]),
    # --- block 4: the finger and the two thumbs ---
    ("moveTo: the finger is ignored", [(TK, "    cmd.moveTo === undefined", "    true")]),
    ("moveTo: the launcher teleports", [(TK, "          -(config.player.touchStep ?? config.player.speed) * slow,\n          (config.player.touchStep ?? config.player.speed) * slow,", "          -1e9,\n          1e9,")]),
    ("moveTo: the finger moves at the speed of the keys", [(TK, "          -(config.player.touchStep ?? config.player.speed) * slow,\n          (config.player.touchStep ?? config.player.speed) * slow,", "          -config.player.speed * slow,\n          config.player.speed * slow,")]),
    ("moveTo: not rounded (two recordings of one move differ)", [(TK, "Math.floor(cmd.moveTo + 0.5) - run.player.x,", "cmd.moveTo - run.player.x,")]),
    ("slide: the launcher follows where the finger is", [(TL, "this.value = Math.max(min, Math.min(max, this.value + (screenX - this.lastX) * perPixel));", "this.value = Math.max(min, Math.min(max, screenX * perPixel));")]),
    ("slide: no walls", [(TL, "this.value = Math.max(min, Math.min(max, this.value + (screenX - this.lastX) * perPixel));", "this.value = this.value + (screenX - this.lastX) * perPixel;")]),
    ("slide: dead travel at the walls", [(TL, "    this.value = Math.max(min, Math.min(max, this.value + (screenX - this.lastX) * perPixel));\n    this.lastX = screenX;", "    const free = this.value + (screenX - this.lastX) * perPixel;\n    this.value = Math.max(min, Math.min(max, free));\n    if (free === this.value) this.lastX = screenX;")]),
    ("slide: a narrow panel cannot cross the field", [(TL, "const reach = Math.max(1, fieldScreenW / Math.max(1, panelW));", "const reach = 1;")]),
    ("slide: a wide panel is slower than the finger", [(TL, "const reach = Math.max(1, fieldScreenW / Math.max(1, panelW));", "const reach = fieldScreenW / Math.max(1, panelW);")]),
    ("aim: the aim can go below the launcher", [(TL, "y: Math.max(0, Math.min(playerY - AIM_FLOOR, anchor.y + dyScreen * k)),", "y: Math.max(0, anchor.y + dyScreen * k),")]),
    ("aim: the drag is not scaled to the arena", [(TL, "const k = AIM_GAIN / Math.max(1e-6, scale);", "const k = AIM_GAIN;")]),
    ("twin: the left thumb does not move", [(TL, "        ...(pad.steerX === null ? {} : { moveTo: pad.steerX }),\n", "")]),
    ("panels: also in portrait", [(SL, "  if (screenW <= screenH) return null;\n", "")]),
    ("panels: even with no room", [(SL, "  if (left.w < MIN_PANEL || right.w < MIN_PANEL) return null;\n", "")]),
    ("rotate: a computer is asked to turn", [(SL, "return touch && screenH > screenW;", "return screenH > screenW;")]),
    ("rotate: never asked", [(SL, "return touch && screenH > screenW;", "return false;")]),
    ("schemes: a touch screen starts in portrait", [(CS, "return coarsePointer ? 'twin' : 'classic';", "return coarsePointer ? 'smart' : 'classic';")]),
    ("schemes: Settings shows the hidden ones", [(CS, "CONTROL_SCHEMES.filter((s) => !s.hidden);", "CONTROL_SCHEMES.filter(() => true);")]),
    ("settings: a hidden prototype is remembered", [(ST, "CONTROL_SCHEMES.find((s) => s.id === raw)?.hidden !== true", "true")]),
    # --- the looks (pure parts) ---
    ("look: fire looks like anything else", [(BA, "  fire: { motif: 'flame', scroll: -7 },\n", "")]),
    ("look: an unknown type has no look", [(BA, "return MOTIF_OF[typeName] ?? { motif: 'shock', scroll: 6 };", "return MOTIF_OF[typeName] ?? { motif: 'flame', scroll: -7 };")]),
    ("arena: every legendary gets the same arena", [(LA, "    LEGEND_ARENAS[species] ??", "    LEGEND_ARENAS.kyogre ??")]),
]
