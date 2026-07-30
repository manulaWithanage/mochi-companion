/**
 * Overlay placement maths.
 *
 * Lives in core rather than the main process so the awkward cases — monitor
 * unplugged, saved position off-screen, work area smaller than the window —
 * are covered by tests instead of discovered by users (RULE 2/3).
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Point, Size {}

export interface DisplayInfo {
  readonly id: number;
  /** Screen area excluding taskbars and docks. */
  readonly workArea: Rect;
}

/** Margin from the screen edge for the mascot's default resting spot. */
export const DEFAULT_EDGE_MARGIN = 24;

/**
 * Overlay window size — fixed, never resized.
 *
 * It is larger than the mascot to leave room for a speech bubble up and to
 * the left. An earlier version grew the window when Mochi spoke and shrank
 * it afterwards, which made Chromium composite the old surface into the new
 * frame for a frame or two — a ghost mascot flashing at the wrong offset
 * every time a bubble cleared.
 *
 * Staying one fixed size removes that entirely. The extra area is fully
 * transparent and click-through is alpha-tested, so it is inert: still far
 * from the fullscreen-surface-plus-hit-testing approach RULE 3 rules out.
 */
export const OVERLAY_SIZE: Size = { width: 340, height: 300 };

/** The mascot occupies this box, anchored to the window's bottom-right. */
export const MASCOT_BOX: Size = { width: 200, height: 200 };

/**
 * Keep a window fully inside a work area.
 *
 * If the window is larger than the work area, the top-left corner wins — a
 * partially visible mascot beats one positioned entirely off-screen.
 */
export function clampPosition(position: Point, size: Size, workArea: Rect): Point {
  const maxX = workArea.x + workArea.width - size.width;
  const maxY = workArea.y + workArea.height - size.height;
  return {
    x: Math.round(Math.min(Math.max(position.x, workArea.x), Math.max(workArea.x, maxX))),
    y: Math.round(Math.min(Math.max(position.y, workArea.y), Math.max(workArea.y, maxY))),
  };
}

/** Bottom-right of the work area, inset by `margin`. */
export function defaultPosition(
  size: Size,
  workArea: Rect,
  margin: number = DEFAULT_EDGE_MARGIN,
): Point {
  return clampPosition(
    {
      x: workArea.x + workArea.width - size.width - margin,
      y: workArea.y + workArea.height - size.height - margin,
    },
    size,
    workArea,
  );
}

export interface SavedPlacement {
  readonly x: number;
  readonly y: number;
  readonly displayId: number;
}

export interface ResolvedPlacement {
  readonly position: Point;
  readonly displayId: number;
  /** True when the saved placement could not be honoured as-is. */
  readonly relocated: boolean;
}

/**
 * Work out where the overlay should sit, given what we saved last time and
 * which displays exist now.
 *
 * Handles the monitor-unplug case: if the saved display is gone, or the saved
 * point is no longer inside any display, the mascot moves to its default spot
 * on the primary display rather than being stranded off-screen.
 */
export function resolvePlacement(
  saved: SavedPlacement | null,
  size: Size,
  displays: readonly DisplayInfo[],
  primaryDisplayId: number,
): ResolvedPlacement {
  const primary = displays.find((d) => d.id === primaryDisplayId) ?? displays[0] ?? null;

  if (primary === null) {
    // No displays reported at all — nothing sensible to compute.
    return { position: { x: 0, y: 0 }, displayId: primaryDisplayId, relocated: true };
  }

  if (saved === null) {
    return {
      position: defaultPosition(size, primary.workArea),
      displayId: primary.id,
      relocated: false,
    };
  }

  const savedDisplay = displays.find((d) => d.id === saved.displayId);
  if (savedDisplay === undefined) {
    return {
      position: defaultPosition(size, primary.workArea),
      displayId: primary.id,
      relocated: true,
    };
  }

  const clamped = clampPosition(saved, size, savedDisplay.workArea);
  return {
    position: clamped,
    displayId: savedDisplay.id,
    relocated: clamped.x !== saved.x || clamped.y !== saved.y,
  };
}

/** Which display contains a point, if any. */
export function displayContaining(
  point: Point,
  displays: readonly DisplayInfo[],
): DisplayInfo | null {
  return (
    displays.find(
      (d) =>
        point.x >= d.workArea.x &&
        point.x < d.workArea.x + d.workArea.width &&
        point.y >= d.workArea.y &&
        point.y < d.workArea.y + d.workArea.height,
    ) ?? null
  );
}

/**
 * Clamps a proposed target position across all available displays.
 *
 * Allows smooth, flexible cross-boundary movement across multi-monitor setups
 * while preventing the mascot from being dragged entirely off-screen.
 */
export function clampToDisplays(
  position: Point,
  size: Size,
  displays: readonly DisplayInfo[],
  primaryDisplayId: number,
): { position: Point; displayId: number } {
  if (displays.length === 0) {
    return { position: { x: 0, y: 0 }, displayId: primaryDisplayId };
  }

  // 1. Find the display that has the maximum overlap with the proposed rect
  const rect = { ...position, ...size };
  let bestDisplay: DisplayInfo | null = null;
  let maxOverlap = -1;

  for (const d of displays) {
    const overlapW = Math.max(
      0,
      Math.min(rect.x + rect.width, d.workArea.x + d.workArea.width) -
        Math.max(rect.x, d.workArea.x),
    );
    const overlapH = Math.max(
      0,
      Math.min(rect.y + rect.height, d.workArea.y + d.workArea.height) -
        Math.max(rect.y, d.workArea.y),
    );
    const area = overlapW * overlapH;
    if (area > maxOverlap) {
      maxOverlap = area;
      bestDisplay = d;
    }
  }

  // If no overlap (e.g. dragged outside all displays), find display closest to rect center
  if (bestDisplay === null || maxOverlap <= 0) {
    const rectCenterX = position.x + size.width / 2;
    const rectCenterY = position.y + size.height / 2;
    let minDist = Infinity;

    for (const d of displays) {
      const dCenterX = d.workArea.x + d.workArea.width / 2;
      const dCenterY = d.workArea.y + d.workArea.height / 2;
      const dist = Math.hypot(rectCenterX - dCenterX, rectCenterY - dCenterY);
      if (dist < minDist) {
        minDist = dist;
        bestDisplay = d;
      }
    }
  }

  const host = bestDisplay ?? displays[0];

  // 2. Allow cross-display movement to adjacent displays:
  // Calculate allowable bounds based on displays that neighbor host
  let minX = host.workArea.x;
  let maxX = host.workArea.x + host.workArea.width - size.width;
  let minY = host.workArea.y;
  let maxY = host.workArea.y + host.workArea.height - size.height;

  for (const d of displays) {
    // If display d is adjacent or overlapping in Y, expand X range
    const yOverlap = Math.max(
      0,
      Math.min(host.workArea.y + host.workArea.height, d.workArea.y + d.workArea.height) -
        Math.max(host.workArea.y, d.workArea.y),
    );
    if (yOverlap > 0) {
      minX = Math.min(minX, d.workArea.x);
      maxX = Math.max(maxX, d.workArea.x + d.workArea.width - size.width);
    }
    // If display d is adjacent or overlapping in X, expand Y range
    const xOverlap = Math.max(
      0,
      Math.min(host.workArea.x + host.workArea.width, d.workArea.x + d.workArea.width) -
        Math.max(host.workArea.x, d.workArea.x),
    );
    if (xOverlap > 0) {
      minY = Math.min(minY, d.workArea.y);
      maxY = Math.max(maxY, d.workArea.y + d.workArea.height - size.height);
    }
  }

  const clampedX = Math.round(Math.min(Math.max(position.x, minX), maxX));
  const clampedY = Math.round(Math.min(Math.max(position.y, minY), maxY));

  return {
    position: { x: clampedX, y: clampedY },
    displayId: host.id,
  };
}

