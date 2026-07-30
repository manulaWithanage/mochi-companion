/**
 * MNMA Law 2 — one evidence model.
 *
 * This replaces three separate mechanisms from the first design, which
 * contradicted each other:
 *
 *   - "unreinforced edges decay after 7 days"
 *   - "core habits never decay"
 *   - "5 confirmations to cross a 0.50 usability floor"
 *
 * Those cannot all hold. A weekly habit gets one confirmation per week, so it
 * decayed before the second arrived — meaning **anything with a cadence slower
 * than about five times a week could never be learned at all**. And "never
 * decay" made a genuine change of job permanently unlearnable, which the drift
 * detection elsewhere was then supposed to work around.
 *
 * A Beta posterior over time-decayed evidence does all of it with one formula:
 *
 *     w(t)       = exp(-Δt / τ)
 *     confidence = (α + Σ w·confirms) / (α + β + Σ w·confirms + Σ w·contradicts)
 *
 *   - reinforcement   — many recent confirmations push confidence up
 *   - decay           — a one-off observation's weight fades; confidence
 *                       returns toward the prior with no pruning rule
 *   - regime shift    — recent contradictions outweigh stale confirmations
 *   - quarantine      — a weak prior means one observation cannot cross a floor
 *
 * Pure: the caller supplies `now`, so none of this needs a clock.
 */

import type { BrainEdge, Provenance } from './graph.js';

/**
 * Beta prior. Deliberately pessimistic: with α=1, β=4 a single confirmation
 * lands near 0.33, well below the usability floor, so one lucky guess by a
 * small model cannot become a stated fact about the user.
 */
export const PRIOR_ALPHA = 1;
export const PRIOR_BETA = 4;

/**
 * Minimum confidence for an inferred belief to reach the Executive Brain.
 *
 * Below this an edge is still stored — and still visible in the Memory tab —
 * but never enters a context package. Quarantined, not discarded.
 */
export const USABILITY_FLOOR = 0.5;

export const DAY_MS = 86_400_000;

/**
 * Recency half-lives, in days, by how often the pattern is expected to recur.
 *
 * This is the fix for the contradiction above: τ scales with the pattern's own
 * period, so a Friday-only habit is not judged on a daily clock.
 */
export const TAU_DAYS = {
  /**
   * Several times a day: app usage, focus blocks. ~21-day half-life.
   *
   * Tuned up from 10 after a test showed a habit confirmed eight times could
   * fall below the usability floor after ten quiet days — meaning a fortnight's
   * holiday would erase the profile. Habits should survive a break; only
   * contradicting evidence should overturn them.
   */
  daily: 30,
  /** Roughly weekly: a Friday retro, a Monday planning session. */
  weekly: 90,
  /** Rare but meaningful: monthly reviews. */
  monthly: 240,
} as const;

export type Cadence = keyof typeof TAU_DAYS;

/**
 * Total weight of a set of observations, each decayed by its age.
 *
 * Future timestamps are clamped to weight 1 rather than allowed to exceed it —
 * a clock change or a hand-edited file should not be able to manufacture
 * arbitrary confidence.
 */
export function weightedCount(
  stamps: readonly number[],
  now: number,
  cadence: Cadence = 'daily',
): number {
  const tau = TAU_DAYS[cadence] * DAY_MS;
  let total = 0;
  for (const at of stamps) {
    const age = Math.max(0, now - at);
    total += Math.exp(-age / tau);
  }
  return total;
}

export interface ConfidenceOptions {
  readonly cadence?: Cadence;
  readonly now: number;
}

/**
 * Confidence in an edge, in [0, 1].
 *
 * `declared` and `computed` edges return 1: the user stated it, or arithmetic
 * produced it. Neither is a guess, so neither is subject to a model's error
 * budget. This is what makes the onboarding questionnaire actually work —
 * previously its answers were given a low confidence and then filtered out by
 * the floor, so the entire cold-start fix was silently discarded.
 */
export function confidenceOf(edge: BrainEdge, options: ConfidenceOptions): number {
  if (edge.suppressed === true) return 0;
  if (edge.provenance === 'declared' || edge.provenance === 'computed') {
    // A contradicted declaration is stale rather than wrong: the user said this
    // once and has since behaved otherwise. Fall through to the evidence model.
    if (edge.contradicts.length === 0) return 1;
  }

  const cadence = options.cadence ?? 'daily';
  const good = weightedCount(edge.confirms, options.now, cadence);
  const bad = weightedCount(edge.contradicts, options.now, cadence);

  return (PRIOR_ALPHA + good) / (PRIOR_ALPHA + PRIOR_BETA + good + bad);
}

/** Whether an edge may be shown to the Executive Brain. */
export function isUsable(edge: BrainEdge, options: ConfidenceOptions): boolean {
  return confidenceOf(edge, options) >= USABILITY_FLOOR;
}

/**
 * Whether an edge has decayed to the point of carrying no information, and can
 * be dropped by compaction.
 *
 * Being near the prior is the test, not being old. An edge confirmed a hundred
 * times last year still says something; an edge with one observation from last
 * week does not.
 */
export function isSpent(edge: BrainEdge, options: ConfidenceOptions): boolean {
  if (edge.suppressed === true) return false;
  if (edge.provenance !== 'inferred') return false;
  const cadence = options.cadence ?? 'daily';
  const total =
    weightedCount(edge.confirms, options.now, cadence) +
    weightedCount(edge.contradicts, options.now, cadence);
  return total < 0.05;
}

/**
 * A belief whose evidence has recently turned against it.
 *
 * Not a separate state machine — just a reading of the same counts. Useful for
 * telling the user "you seem to have changed how you work" rather than silently
 * revising the profile under them.
 */
export function isDrifting(edge: BrainEdge, options: ConfidenceOptions): boolean {
  const cadence = options.cadence ?? 'daily';
  const recent = weightedCount(edge.contradicts, options.now, cadence);
  const support = weightedCount(edge.confirms, options.now, cadence);
  return recent > 0.5 && recent >= support * 0.5 && support > 0;
}

/** For the Memory tab: a plain-language strength, never a bare decimal. */
export function describeConfidence(value: number): string {
  if (value >= 0.85) return 'certain';
  if (value >= 0.65) return 'confident';
  if (value >= USABILITY_FLOOR) return 'fairly sure';
  if (value >= 0.3) return 'guessing';
  return 'just noticed';
}

/** Provenance in words, for the same reason. */
export function describeProvenance(p: Provenance): string {
  switch (p) {
    case 'declared':
      return 'you told me';
    case 'computed':
      return 'measured from your sessions';
    case 'inferred':
      return 'guessed from your activity';
  }
}
