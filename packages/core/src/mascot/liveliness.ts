/**
 * The small movements that make the mascot feel inhabited rather than pasted on.
 *
 * Mochi had exactly three reactions to a person: a press that shrank it, a
 * release that bounced it, and a drag that moved the window. Between those it
 * was a looping sprite that did not know the cursor existed — you could hold
 * your pointer over it for a minute and get nothing back.
 *
 * **No new art.** Every expression here is a transform over the frames the skin
 * already ships, which is why it costs nothing to draw and applies to every
 * skin including ones written later. It also stays clear of the frame budget:
 * these are compositor transforms, not sprite frames, so the animation runs at
 * display rate while the sprite keeps its 8–12 FPS.
 *
 * Pure and clocked from the outside, in the same spirit as `magician.ts`: the
 * renderer owns the pointer events and the canvas, and this owns what they mean.
 */

/**
 * Furthest the mascot leans while being carried.
 *
 * Deliberately small. The overlay window is fixed (RULE 3) and cannot grow to
 * fit a rotated child, so a big angle would clip against the window edge at the
 * large mascot size. It also reads better: this is the sway of something being
 * carried, not a cartwheel.
 */
export const MAX_CARRY_TILT_DEG = 10;

/** How much bigger the mascot gets when the pointer is over it. */
export const HOVER_SCALE = 1.05;

/** How far it rises to meet the pointer, in CSS pixels. */
export const HOVER_LIFT_PX = 3;

/**
 * Furthest the mascot leans toward the cursor while hovered.
 *
 * Smaller than the carry tilt: this is attention, not motion. At 4 degrees the
 * lean reads as "looking at your hand" without the sprite visibly rotating out
 * of its frame.
 */
export const HOVER_LEAN_DEG = 4;

export interface Liveliness {
  /** Pointer is over the mascot and no performance is running. */
  readonly hovered: boolean;
  /** Left button is down on the mascot. */
  readonly pressed: boolean;
  /**
   * Horizontal pointer movement since the previous drag step, in pixels.
   *
   * Zero when not being dragged, which is what returns the tilt to upright.
   */
  readonly carryVelocityX: number;
  /**
   * Where the pointer sits over the mascot, -1 (left edge) to 1 (right edge).
   *
   * Only meaningful while hovered; the pose ignores it otherwise, so callers
   * need not zero it on leave.
   */
  readonly hoverLeanX?: number;
}

export interface LivelyPose {
  readonly tiltDeg: number;
  readonly liftPx: number;
  readonly scale: number;
}

/**
 * Lean into the direction of travel, like something held at the top.
 *
 * Square-rooted rather than linear so the tilt suggests weight: a slow drag
 * leans noticeably, and a fast flick leans only a little more instead of
 * spinning. Linear mapping was the obvious version and made the mascot feel
 * like a needle on a gauge.
 */
export function carryTilt(velocityX: number): number {
  const magnitude = Math.sqrt(Math.abs(velocityX)) * 2.4;
  return clamp(Math.sign(velocityX) * magnitude, -MAX_CARRY_TILT_DEG, MAX_CARRY_TILT_DEG);
}

export function livelyPose(input: Liveliness): LivelyPose {
  const tiltDeg = carryTilt(input.carryVelocityX);

  // Press wins over hover: the pointer is necessarily over the mascot while
  // pressing it, and growing and shrinking at the same time cancels out to
  // roughly nothing, which is how the press feedback got lost.
  if (input.pressed) {
    return { tiltDeg, liftPx: 0, scale: 1 };
  }
  if (input.hovered) {
    // Lean toward the cursor. Added to the carry tilt rather than replacing it
    // (a drag mid-hover still owns the lean), clamped so the two together can
    // never exceed what the fixed window can contain without clipping.
    const lean = clamp(input.hoverLeanX ?? 0, -1, 1) * HOVER_LEAN_DEG;
    return {
      tiltDeg: clamp(tiltDeg + lean, -MAX_CARRY_TILT_DEG, MAX_CARRY_TILT_DEG),
      liftPx: -HOVER_LIFT_PX,
      scale: HOVER_SCALE,
    };
  }
  return { tiltDeg, liftPx: 0, scale: 1 };
}

// ---- petting -------------------------------------------------------------

/** A stroke must travel at least this far before a reversal counts. */
export const PET_MIN_STROKE_PX = 12;
/** Direction reversals needed within the window to count as petting. */
export const PET_REVERSALS = 3;
/** How recent the reversals must be, in milliseconds. */
export const PET_WINDOW_MS = 1600;
/** Refractory period after a detection, so one long stroke session fires once. */
export const PET_COOLDOWN_MS = 4000;

/**
 * Detects the mascot being petted: the cursor stroking back and forth over it.
 *
 * A pet is not a hover and not a drag — it is horizontal direction reversals,
 * each after real travel, close together in time. Requiring travel filters the
 * jitter of a pointer at rest (which reverses direction constantly by a pixel),
 * and the time window filters slow incidental passes.
 *
 * Pure in the same sense as the rest of this file: the caller owns the clock
 * and the pointer events; this owns what they mean.
 */
export class PettingDetector {
  private lastX: number | null = null;
  private direction = 0;
  private travel = 0;
  private reversals: number[] = [];
  private cooldownUntil = 0;

  /** Feed a hover sample. Returns true exactly when a pet is detected. */
  sample(timeMs: number, x: number): boolean {
    if (this.lastX === null) {
      this.lastX = x;
      return false;
    }
    const dx = x - this.lastX;
    this.lastX = x;
    if (dx === 0) return false;

    const dir = Math.sign(dx);
    if (dir === this.direction) {
      this.travel += Math.abs(dx);
    } else {
      // A reversal only counts if the stroke before it went somewhere.
      if (this.direction !== 0 && this.travel >= PET_MIN_STROKE_PX) {
        this.reversals.push(timeMs);
      }
      this.direction = dir;
      this.travel = Math.abs(dx);
    }

    this.reversals = this.reversals.filter((at) => timeMs - at <= PET_WINDOW_MS);
    if (timeMs < this.cooldownUntil) return false;

    if (this.reversals.length >= PET_REVERSALS) {
      this.cooldownUntil = timeMs + PET_COOLDOWN_MS;
      this.reversals = [];
      this.travel = 0;
      return true;
    }
    return false;
  }

  /** The pointer left the mascot; a stroke cannot continue across an absence. */
  reset(): void {
    this.lastX = null;
    this.direction = 0;
    this.travel = 0;
    this.reversals = [];
  }
}

/** The CSS `transform` value for a pose, in the order the properties compose. */
export function livelyTransform(pose: LivelyPose, pressScale: number): string {
  // translate before scale, so the lift is a constant number of screen pixels
  // rather than one that grows with the mascot.
  return `translateY(${pose.liftPx}px) scale(${round(pose.scale * pressScale)}) rotate(${round(pose.tiltDeg)}deg)`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Keeps the generated string stable and short; sub-pixel precision is noise. */
function round(value: number): number {
  return Number(value.toFixed(3));
}
