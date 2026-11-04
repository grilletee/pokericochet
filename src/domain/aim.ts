export interface AimDirection {
  x: number;
  y: number;
}

/**
 * Unit vector from the launcher towards the aimed point (ADR-021). No trigonometry (the domain
 * only uses `+ - * /` and `sqrt`, so every engine gets the same bits). The shot never leaves
 * flatter than `minVertical` (|y| of the unit vector), which also keeps it clear of the anti-stall
 * rule of the walls; a target at or below the launcher gives the flattest allowed shot.
 * Writes into `out` and returns it, so the per-tick call allocates nothing.
 */
export function aimDirection(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  minVertical: number,
  out: AimDirection,
): AimDirection {
  const dx = targetX - originX;
  const dy = targetY - originY;
  const length = Math.sqrt(dx * dx + dy * dy);
  let ux = 0;
  let uy = -1;
  if (length > 0) {
    ux = dx / length;
    uy = dy / length;
  }
  if (uy > -minVertical) {
    uy = -minVertical;
    const side = Math.sqrt(1 - minVertical * minVertical);
    ux = ux < 0 ? -side : side;
  }
  out.x = ux;
  out.y = uy;
  return out;
}
