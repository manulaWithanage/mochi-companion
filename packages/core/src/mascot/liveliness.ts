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
    return { tiltDeg, liftPx: -HOVER_LIFT_PX, scale: HOVER_SCALE };
  }
  return { tiltDeg, liftPx: 0, scale: 1 };
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
