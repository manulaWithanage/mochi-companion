/**
 * The magician entrance: Mochi vanishes, reappears centre-screen in a puff of
 * smoke, delivers a reminder, then vanishes again.
 *
 * **Why vanish-and-reappear rather than glide.** The first version slid the
 * window to the centre with `setPosition` in a loop. That cannot be made
 * smooth: each call is a synchronous OS window move, it is not vsync-aligned,
 * and crossing a 1920px screen in 14 steps means ~100px per jump. It read as
 * teleporting badly rather than gliding.
 *
 * Hiding the mascot *first* fixes it at the root — the window still has to
 * move, but nothing is on screen while it does, so there is no jank to see.
 * It is also the more magical read: a magician does not walk over, they
 * disappear here and appear there.
 *
 * **Why the timings live in core.** Main owns the window move and the renderer
 * owns the smoke and the scale. They must agree on when each phase starts or
 * the puff happens mid-flight instead of on arrival — which is exactly what
 * went wrong when each side kept its own timers.
 *
 * Pure data and pure functions: no window, no canvas, no clock.
 */

export type MagicianPhase =
  /** Not running. The mascot sits docked and behaves normally. */
  | 'none'
  /** Shrinking away at the docked position, with a small puff. */
  | 'vanish'
  /** Billowing in at centre screen. */
  | 'appear'
  /** Centre screen, alert face, bubble showing. */
  | 'hold'
  /** Smoke gathering back in, shrinking away. */
  | 'depart'
  /** Fading back in at the docked position. */
  | 'restore';

export interface MagicianTiming {
  readonly vanishMs: number;
  readonly appearMs: number;
  readonly departMs: number;
  readonly restoreMs: number;
  /**
   * Grace period after a fade completes before the window is moved.
   *
   * Main cannot observe the renderer's transition finishing, so it waits a
   * little longer than the animation it asked for. Without this the window can
   * be repositioned on the frame before the mascot reaches zero opacity, and
   * the user sees it flick across the screen — the ghost-mascot artefact that
   * RULE 3 exists to avoid.
   */
  readonly settleMs: number;
}

/**
 * Deliberately unhurried. The first version ran the whole entrance in ~300ms,
 * which is too fast to read as a performance — the smoke was gone before the
 * eye found the mascot.
 */
export const MAGICIAN: MagicianTiming = {
  vanishMs: 320,
  appearMs: 760,
  departMs: 620,
  restoreMs: 320,
  settleMs: 70,
};

/** How the mascot should be drawn during a phase. */
export interface MagicianPose {
  /** CSS scale. Above 1 during the overshoot, so the arrival has some snap. */
  readonly scale: number;
  readonly opacity: number;
  /** Milliseconds for the transition *into* this pose. */
  readonly durationMs: number;
  /**
   * CSS easing for the transition into this pose.
   *
   * `appear` overshoots on purpose — a linear or ease-out arrival looks
   * mechanical, and the small bounce is most of what makes it feel alive.
   */
  readonly easing: string;
}

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASE_IN = 'cubic-bezier(0.55, 0, 0.55, 0.2)';
const OVERSHOOT = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

/**
 * The pose for each phase.
 *
 * Scale rather than position, and opacity rather than visibility, because both
 * are compositor-only properties — the browser animates them on the GPU
 * without touching layout, which is what makes this smooth where moving the
 * window is not.
 */
export function magicianPose(phase: MagicianPhase): MagicianPose {
  switch (phase) {
    case 'vanish':
      // Shrink *into* the puff rather than just fading, so the smoke reads as
      // the cause of the disappearance and not as decoration beside it.
      return { scale: 0.28, opacity: 0, durationMs: MAGICIAN.vanishMs, easing: EASE_IN };
    case 'appear':
      return { scale: 1, opacity: 1, durationMs: MAGICIAN.appearMs, easing: OVERSHOOT };
    case 'hold':
      return { scale: 1, opacity: 1, durationMs: 220, easing: EASE_OUT };
    case 'depart':
      return { scale: 0.32, opacity: 0, durationMs: MAGICIAN.departMs, easing: EASE_IN };
    case 'restore':
      return { scale: 1, opacity: 1, durationMs: MAGICIAN.restoreMs, easing: EASE_OUT };
    case 'none':
      return { scale: 1, opacity: 1, durationMs: 160, easing: EASE_OUT };
  }
}

/** Which phases should be drawing smoke, and which way it moves. */
export type SmokeMode = 'burst' | 'gather' | null;

export function smokeMode(phase: MagicianPhase): SmokeMode {
  switch (phase) {
    // Blowing outward: the mascot is being concealed or revealed on every entrance and exit.
    case 'vanish':
    case 'appear':
    case 'depart':
    case 'restore':
      return 'burst';
    default:
      return null;
  }
}

/** True when the mascot should wear its alert face. */
export const isAlertPhase = (phase: MagicianPhase): boolean =>
  phase === 'appear' || phase === 'hold' || phase === 'depart';

export interface MagicianStep {
  readonly phase: MagicianPhase;
  /** How long to stay in this phase before advancing. */
  readonly durationMs: number;
  /** Move the window at the *start* of this phase, while nothing is visible. */
  readonly moveTo: 'centre' | 'home' | null;
}

/**
 * The whole performance, in order.
 *
 * Returned as data so main can drive it with one loop and tests can assert the
 * shape without a window — in particular that both window moves happen while
 * the mascot is at zero opacity.
 */
export function magicianSequence(holdMs: number): readonly MagicianStep[] {
  return [
    { phase: 'vanish', durationMs: MAGICIAN.vanishMs + MAGICIAN.settleMs, moveTo: null },
    // The mascot is invisible here, so the reposition is free.
    { phase: 'appear', durationMs: MAGICIAN.appearMs, moveTo: 'centre' },
    { phase: 'hold', durationMs: Math.max(0, holdMs), moveTo: null },
    { phase: 'depart', durationMs: MAGICIAN.departMs + MAGICIAN.settleMs, moveTo: null },
    { phase: 'restore', durationMs: MAGICIAN.restoreMs, moveTo: 'home' },
    { phase: 'none', durationMs: 0, moveTo: null },
  ];
}

/** Total wall time for one performance, for callers that need to schedule around it. */
export function magicianDuration(holdMs: number): number {
  return magicianSequence(holdMs).reduce((total, step) => total + step.durationMs, 0);
}

/**
 * The arrival: how Mochi materialises at its docked position.
 *
 * The magician entrance above is reserved for alerts, which left the two
 * appearances a user sees most often — app launch and un-hiding from the
 * tray — as hard cuts: `win.show()` and the mascot simply exists. An arrival
 * is the dock-side half of the same trick, smoke and overshoot included, with
 * no window movement — so unlike the full performance it never needs main's
 * involvement and lives entirely in the renderer.
 */
export type ArrivalStep =
  /** Mounted but not yet revealed: hidden, no transition. */
  | 'pre'
  /** Billowing in at the dock. */
  | 'in'
  /** Finished; the ordinary pose system owns the mascot again. */
  | 'done';

/**
 * How long the arrival holds `in` before declaring `done`.
 *
 * Longer than the pose transition on purpose: the smoke particles live up to a
 * second, and flipping to `done` unmounts the effect canvas mid-puff — the
 * hard cut the smoke system's own header lists as mistake number three.
 */
export const ARRIVAL_TOTAL_MS = 1150;

/**
 * Re-arrivals are reserved for a real return, not a flicker.
 *
 * The renderer replays the arrival when visibility comes back, but visibility
 * also flips on occlusion — maximise a window over Mochi and drag it away and
 * the mascot would puff smoke every time. Only an absence at least this long
 * earns an entrance.
 */
export const ARRIVAL_MIN_HIDDEN_MS = 10_000;

/** The pose for each arrival step, reusing the magician's own vocabulary. */
export function arrivalPose(step: Exclude<ArrivalStep, 'done'>): MagicianPose {
  switch (step) {
    case 'pre':
      // Instant: this is the starting state, not a movement.
      return { scale: 0.28, opacity: 0, durationMs: 0, easing: EASE_OUT };
    case 'in':
      // The same arrival the alert entrance uses, overshoot and all.
      return magicianPose('appear');
  }
}
