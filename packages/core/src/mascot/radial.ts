/**
 * Where the items of the radial menu sit around the mascot.
 *
 * **The arc does not follow the screen edge, and it looked at first like it
 * should.** The mascot is anchored to the bottom-right of a fixed 340×300
 * window (`MASCOT_BOX`), the spare room exists up and to the left for the
 * speech bubble, and `clampPosition` keeps the whole window inside the work
 * area. So the constraint is the window, not the display: there is one free
 * pocket, it is always in the same place, and an item placed inside it is on
 * screen wherever Mochi happens to be docked. Rotating the arc per screen edge
 * would have been elegant, unnecessary, and one more thing to get wrong on a
 * multi-monitor setup.
 *
 * The consequence worth knowing: the ring and the speech bubble want the same
 * pocket, because it is the only one there is. They cannot both be shown.
 *
 * Pure geometry. No DOM, no window, no clock — same reasoning as `magician.ts`.
 */

/** Straight up is 90°, straight left is 180°. Both ends overshoot slightly. */
export const ARC_START_DEG = 80;
export const ARC_END_DEG = 190;

/** Gap between the mascot's edge and the centre of an item. */
export const ITEM_GAP_PX = 34;

/** Diameter of one item button. */
export const ITEM_SIZE_PX = 40;

/**
 * Beyond this the angular spacing gets tighter than a flick can reliably hit,
 * which defeats the point of a radial menu over a list.
 */
export const MAX_ITEMS = 5;

export interface RadialPlacement {
  /** Offset from the mascot's centre, in CSS pixels. Y grows downward. */
  readonly x: number;
  readonly y: number;
  readonly angleDeg: number;
}

/** Distance from the mascot's centre to the centre of each item. */
export function radialRadius(mascotSizePx: number): number {
  return Math.round(mascotSizePx / 2) + ITEM_GAP_PX;
}

/**
 * Evenly space `count` items along the arc.
 *
 * A single item is centred rather than parked at the start angle, which is
 * where an off-by-one in the `count - 1` divisor would otherwise put it.
 */
export function radialPlacements(count: number, mascotSizePx: number): readonly RadialPlacement[] {
  const items = Math.max(0, Math.min(count, MAX_ITEMS));
  if (items === 0) return [];

  const radius = radialRadius(mascotSizePx);
  const placements: RadialPlacement[] = [];

  for (let i = 0; i < items; i += 1) {
    const t = items === 1 ? 0.5 : i / (items - 1);
    const angleDeg = ARC_START_DEG + (ARC_END_DEG - ARC_START_DEG) * t;
    const rad = (angleDeg * Math.PI) / 180;
    placements.push({
      x: round(Math.cos(rad) * radius),
      // Screen coordinates grow downward; the arc is described in the
      // ordinary maths convention where they grow up.
      y: round(-Math.sin(rad) * radius),
      angleDeg: round(angleDeg),
    });
  }

  return placements;
}

/**
 * Whether every item of a menu stays inside the overlay window.
 *
 * Exists to be asserted rather than eyeballed: the window cannot grow (RULE 3),
 * so an item that does not fit is an item drawn half outside its own window,
 * and the largest mascot is where that would first happen.
 */
export function radialFitsWindow(
  count: number,
  mascotSizePx: number,
  centre: { readonly x: number; readonly y: number },
  window: { readonly width: number; readonly height: number },
): boolean {
  const half = ITEM_SIZE_PX / 2;
  return radialPlacements(count, mascotSizePx).every((p) => {
    const cx = centre.x + p.x;
    const cy = centre.y + p.y;
    return (
      cx - half >= 0 && cy - half >= 0 && cx + half <= window.width && cy + half <= window.height
    );
  });
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
