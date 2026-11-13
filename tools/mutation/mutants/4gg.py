"""Mutants of the 4G-G: the guarantee of a way through, the blink after a hit, the enemy marked as a
threat, the smart / motion / sling aims and the touch gestures.
Run with: python tools/mutation/run.py tools/mutation/mutants/4gg.py"""

DG = "src/domain/dodge.ts"
BF = "src/domain/bossFight.ts"
SA = "src/domain/smartAim.ts"
TK = "src/domain/tick.ts"
TH = "src/domain/threats.ts"
TL = "src/app/touchLogic.ts"
PK = "src/domain/pickups.ts"
AN = "src/ui/attackNames.ts"
ST = "src/app/settings.ts"

M = [
    # --- the guarantee of a way through ---
    ("dodge: the player is a point (no gap needed)", [(DG, "export const MIN_GAP = PLAYER_WIDTH + SAFE_MARGIN;", "export const MIN_GAP = 0;")]),
    ("dodge: the player is trusted to be a robot", [(DG, "const SPEED_TRUST = 0.85;", "const SPEED_TRUST = 3;")]),
    ("dodge: nobody can move at all", [(DG, "const SPEED_TRUST = 0.85;", "const SPEED_TRUST = 0;")]),
    ("dodge: reachability is not required", [(DG, "      for (const s of free) {\n        const from = Math.max(a, s.from);", "      for (const s of free) {\n        const from = Math.max(s.from, s.from);")]),
    # ("dodge: a full field is fine") was an EQUIVALENT mutant: without that early return the next
    # intersection is empty and returns false just the same, so no test can tell them apart.
    ("dodge: an empty reach is fine", [(DG, "    if (next.length === 0) return false;", "")]),
    ("dodge: the open portals are not walls", [(DG, "  if (hazard.kind === 'portal') {", "  if (false) {")]),
    ("dodge: the gusts do not push", [(DG, "drift += g.push * STEP;", "drift += 0;")]),
    ("dodge: a struck column still counts", [(DG, "      if (hazard.struck && wait <= 0) return undefined;\n      return {\n        from: wait,\n        to: wait + Math.max(STEP + 1, hazard.active),\n        x: hazard.x,\n        speed: 0,", "      return {\n        from: wait,\n        to: wait + Math.max(STEP + 1, hazard.active),\n        x: hazard.x,\n        speed: 0,")]),
    ("dodge: an attack that breaks it is placed anyway", [(BF, "if (calm && isDodgeable(run, config, group)) {", "if (calm) {")]),
    ("dodge: an attack is never delayed", [(BF, "const MAX_DELAYS = 14;", "const MAX_DELAYS = 0;")]),
    ("dodge: the delay does not move the attack", [(BF, "(originals[i] as number) + delay * 20;", "(originals[i] as number);")]),
    # --- the blink after a hit ---
    ("hurt: no blink after a hit", [(BF, "  run.player.invuln = config.player.hitInvulnTicks;\n", "")]),
    ("hurt: the blink does not protect", [(BF, "  if (run.player.invuln > 0) return;\n", "")]),
    ("hurt: the blink never ends", [(BF, "  if (run.player.invuln > 0) run.player.invuln -= 1;\n", "")]),
    ("hurt: a hit is not told", [(BF, "  run.events.push({\n    type: 'playerHurt',", "  if (false) run.events.push({\n    type: 'playerHurt',")]),
    ("hurt: a leak is not told", [(TK, "      if (cost > 0) {\n        run.events.push({ type: 'playerHurt', damage: cost, x: run.player.x, source: 'leak' });\n      }", "")]),
    # 4G-H: the enemy marked as a threat, its blast and the open core of a boss are gone from the game,
    # and their mutants with them (they would only be "not found").
    # --- the touch aims ---
    ("smart: the tap is ignored", [(SA, "  if (run.lockId > 0) {", "  if (false) {")]),
    ("smart: a dead locked enemy still counts", [(SA, "e.id === run.lockId && e.hp > 0", "e.id === run.lockId")]),
    ("smart: the enemy nearest the line is the farthest", [(SA, "e.y > best.y ||", "e.y < best.y ||")]),
    ("motion: leans the wrong way", [(SA, "const sx = lean * maxSlope;", "const sx = -lean * maxSlope;")]),
    ("motion: leans without a limit", [(SA, "Math.max(-1, Math.min(1, vel / Math.max(1e-9, maxSpeed)))", "vel / Math.max(1e-9, maxSpeed)")]),
    ("motion: the speed is never measured", [(TK, "run.player.vel = run.player.vel * 0.8 + (run.player.x - fromX) * 0.2;", "run.player.vel = 0;")]),
    ("sling: fires without the release", [(TK, "else if (run.aimMode === 'sling') canAim = run.fireNow;", "else if (run.aimMode === 'sling') canAim = true;")]),
    ("smart: shoots with nothing to aim at", [(TK, "if (run.aimMode === 'smart') canAim = smartTarget(run, config) !== null;", "if (run.aimMode === 'smart') canAim = true;")]),
    ("controls: the schemes reload like the hand", [(PK, "      : (config.controls?.[run.aimMode]?.reloadMult ?? 1);", "      : 1;")]),
    # --- the touch gestures ---
    ("touch: the launcher follows where the thumb is, not how far it drags", [(TL, "return this.anchorPlayerX + (this.x - this.anchorX) * PAD_GAIN;", "return this.x;")]),
    ("touch: a long press is a tap", [(TL, "if (t - this.downT <= TAP_MS && this.travelled <= TAP_MOVE)", "if (this.travelled <= TAP_MOVE)")]),
    ("touch: a drag is a tap", [(TL, "if (t - this.downT <= TAP_MS && this.travelled <= TAP_MOVE)", "if (t - this.downT <= TAP_MS)")]),
    ("touch: a tap on nothing does not free the target", [(TL, "const lock = pad.tap === null ? undefined : enemyAtTap(run.enemies, pad.tap.x, pad.tap.y);", "const lock = pad.tap === null ? undefined : (enemyAtTap(run.enemies, pad.tap.x, pad.tap.y) || undefined);")]),
    ("touch: a flick can be thrown downwards", [(TL, "const up = -Math.max(Math.abs(flick.dy), Math.abs(flick.dx) * 0.35, 1);", "const up = flick.dy;")]),
    ("touch: the release does not fire", [(TL, "return { moveX, autoAim: false, aimMode: 'sling', aimX: aim.x, aimY: aim.y, fire: true };", "return { moveX, autoAim: false, aimMode: 'sling', aimX: aim.x, aimY: aim.y };")]),
    ("settings: a bad stored scheme is accepted", [(ST, "if (isControlScheme(raw) && CONTROL_SCHEMES", "if (raw && CONTROL_SCHEMES")]),
]
