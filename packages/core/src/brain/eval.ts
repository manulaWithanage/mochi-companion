/**
 * Instrumentation for the MNMA research protocol (MNMA_RESEARCH.md).
 *
 * Two jobs:
 *
 * 1. **Study 1** — assign each drafting trial to an arm, blinded, and measure
 *    how much the user edited the draft.
 * 2. **Study 2** — replay an edge's observation history and score the evidence
 *    model as a probabilistic forecast, which can refute Law 2 outright.
 *
 * **What this deliberately does not record: any message text.** Only the
 * derived distance. A research log containing every message the user sent would
 * be a worse privacy exposure than anything else in this architecture, and the
 * metric does not need it.
 *
 * Pure functions. No clock, no I/O, no randomness of their own — arm assignment
 * is derived from the message id so a trial is reproducible and cannot be
 * quietly re-rolled.
 */

import { confidenceOf, type Cadence } from './confidence.js';
import type { BrainEdge } from './graph.js';

// ---------------------------------------------------------------------------
// Study 1 — trial assignment and edit distance
// ---------------------------------------------------------------------------

/**
 * The four arms. `static` is the baseline that decides whether MNMA is worth
 * existing: a hand-written persona is what a competent developer ships without
 * any of this machinery.
 */
export type TrialArm =
  /** No user context at all. The floor. */
  | 'none'
  /** A fixed hand-written persona of the same token budget. */
  | 'static'
  /** The assembled MNMA package. */
  | 'mnma'
  /** Uncapped recent activity, to separate "structure helps" from "data helps". */
  | 'dump';

export const TRIAL_ARMS: readonly TrialArm[] = ['none', 'static', 'mnma', 'dump'];

/** FNV-1a. Small, deterministic, and adequate for bucketing. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Assign a trial to an arm.
 *
 * Derived from the message id rather than drawn from a random source, so the
 * same message always lands in the same arm. That removes the possibility —
 * conscious or not — of re-rolling an assignment, which is the easiest way to
 * bias an n=1 study.
 *
 * `salt` lets a later study re-randomise cleanly without reusing the first
 * study's assignment.
 */
export function assignArm(messageId: string, salt = 'mnma-study-1'): TrialArm {
  const index = hash(`${salt}:${messageId}`) % TRIAL_ARMS.length;
  return TRIAL_ARMS[index]!;
}

/**
 * Levenshtein distance, iterative with two rows.
 *
 * Capped because the full matrix is O(n·m) and an accidental novel-length
 * comparison should not stall the main process. Beyond the cap the exact number
 * carries no extra meaning — the draft was rewritten either way.
 */
export const MAX_COMPARE_CHARS = 4000;

export function levenshtein(a: string, b: string): number {
  const s = a.slice(0, MAX_COMPARE_CHARS);
  const t = b.slice(0, MAX_COMPARE_CHARS);
  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  let previous = Array.from({ length: t.length + 1 }, (_, i) => i);
  let current = new Array<number>(t.length + 1).fill(0);

  for (let i = 1; i <= s.length; i++) {
    current[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (s[i - 1] === t[j - 1] ? 0 : 1);
      const insertion = (current[j - 1] ?? 0) + 1;
      const deletion = (previous[j] ?? 0) + 1;
      current[j] = Math.min(substitution, insertion, deletion);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[t.length] ?? 0;
}

/** Whitespace and case normalised, so reflowing a paragraph is not an edit. */
function normalise(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * How much of the opening survived.
 *
 * Salutation and tone are what a style profile most directly affects, and a
 * whole-message distance can hide a fixed greeting behind a long body the model
 * could never have known. Measured over the first 80 characters.
 */
export function prefixSurvival(draft: string, sent: string, chars = 80): number {
  const d = normalise(draft);
  const s = normalise(sent);
  if (d.length === 0 && s.length === 0) return 1;

  // Equal-length windows. Slicing each to `chars` independently would count the
  // *extra* text in a longer message as a difference, so keeping the salutation
  // and adding a sentence scored as though the opening had been rewritten.
  const window = Math.min(chars, d.length, s.length);
  if (window === 0) return 0;

  return 1 - levenshtein(d.slice(0, window), s.slice(0, window)) / window;
}

export interface TrialOutcome {
  /** 0 = sent verbatim, 1 = completely rewritten. */
  readonly editDistance: number;
  readonly prefixSurvival: number;
  readonly acceptedUnedited: boolean;
  readonly draftLength: number;
  readonly sentLength: number;
}

/** Below this normalised distance a draft counts as accepted as-is. */
export const ACCEPT_THRESHOLD = 0.05;

/**
 * Score one trial.
 *
 * Takes the two texts and returns only numbers, so the caller can log the
 * result without ever persisting the message.
 */
export function scoreTrial(draft: string, sent: string): TrialOutcome {
  const d = normalise(draft);
  const s = normalise(sent);
  const longest = Math.max(d.length, s.length);
  const editDistance = longest === 0 ? 0 : levenshtein(d, s) / longest;

  return {
    editDistance,
    prefixSurvival: prefixSurvival(draft, sent),
    acceptedUnedited: editDistance < ACCEPT_THRESHOLD,
    draftLength: draft.length,
    sentLength: sent.length,
  };
}

export interface Trial {
  readonly arm: TrialArm;
  readonly editDistance: number;
}

/** Minimum trials in an arm before its median is worth reading. */
export const MIN_TRIALS_PER_ARM = 15;

export interface ArmSummary {
  readonly arm: TrialArm;
  readonly n: number;
  readonly medianEditDistance: number | null;
  /** False until the pre-registered per-arm minimum is met. */
  readonly reportable: boolean;
}

export function summariseArms(trials: readonly Trial[]): readonly ArmSummary[] {
  return TRIAL_ARMS.map((arm) => {
    const values = trials.filter((t) => t.arm === arm).map((t) => t.editDistance);
    return {
      arm,
      n: values.length,
      medianEditDistance: values.length === 0 ? null : medianOf(values),
      // Guards against reading a difference off three trials, which is the
      // failure mode a pre-registered minimum exists to prevent.
      reportable: values.length >= MIN_TRIALS_PER_ARM,
    };
  });
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

// ---------------------------------------------------------------------------
// Study 2 — is the evidence model predictive?
// ---------------------------------------------------------------------------

export interface ForecastPoint {
  /** Confidence computed from evidence strictly before this observation. */
  readonly predicted: number;
  /** 1 if the observation confirmed, 0 if it contradicted. */
  readonly actual: 0 | 1;
}

/**
 * Replay one edge's history as a sequence of forecasts.
 *
 * Each step uses only evidence from strictly before the observation being
 * predicted, which is what makes this a genuine held-out test rather than a fit
 * to the data.
 *
 * The first observation is skipped: with no prior evidence the model is
 * predicting from the prior alone, which measures the prior rather than the
 * evidence model.
 */
export function replayEdge(edge: BrainEdge, cadence: Cadence = 'daily'): readonly ForecastPoint[] {
  const events = [
    ...edge.confirms.map((at) => ({ at, agrees: true })),
    ...edge.contradicts.map((at) => ({ at, agrees: false })),
  ].sort((a, b) => a.at - b.at);

  const points: ForecastPoint[] = [];
  const confirms: number[] = [];
  const contradicts: number[] = [];

  for (const [index, event] of events.entries()) {
    if (index > 0) {
      const soFar: BrainEdge = {
        ...edge,
        // Forced to 'inferred': declared and computed short-circuit to 1, which
        // would make the forecast trivially perfect and measure nothing.
        provenance: 'inferred',
        confirms: [...confirms],
        contradicts: [...contradicts],
        ...(edge.suppressed === true ? { suppressed: false as const } : {}),
      };
      points.push({
        predicted: confidenceOf(soFar, { now: event.at, cadence }),
        actual: event.agrees ? 1 : 0,
      });
    }
    if (event.agrees) confirms.push(event.at);
    else contradicts.push(event.at);
  }

  return points;
}

/**
 * Brier score. Lower is better; 0 is perfect.
 *
 * Chosen over accuracy because confidence is a probability, and a model that is
 * right but overconfident should be penalised.
 */
export function brierScore(points: readonly ForecastPoint[]): number | null {
  if (points.length === 0) return null;
  const total = points.reduce((sum, p) => sum + (p.predicted - p.actual) ** 2, 0);
  return total / points.length;
}

/**
 * The score to beat: always predict the base rate.
 *
 * If the evidence model cannot beat a constant, its confidence carries no
 * information however elegant the formula. This is the comparison that can
 * refute Law 2.
 */
export function baselineBrier(points: readonly ForecastPoint[]): number | null {
  if (points.length === 0) return null;
  const rate = points.reduce((sum, p) => sum + p.actual, 0) / points.length;
  const total = points.reduce((sum, p) => sum + (rate - p.actual) ** 2, 0);
  return total / points.length;
}

export interface PredictiveResult {
  readonly points: number;
  readonly brier: number | null;
  readonly baseline: number | null;
  /**
   * Relative improvement over the base rate, in [-∞, 1]. Positive means the
   * evidence model beats a constant. This is the number H3 turns on.
   *
   * Null when skill is undefined — in particular when every observation agreed,
   * because then a constant predictor is already perfect and nothing can improve
   * on it. That is a property of the data, not a failure, and reporting it as
   * zero skill would understate the model just as reporting it as high skill
   * would flatter it.
   */
  readonly skill: number | null;
}

/** Score the whole graph's edges as one forecast set. */
export function evaluatePredictive(
  edges: readonly BrainEdge[],
  cadence: Cadence = 'daily',
): PredictiveResult {
  const points = edges.flatMap((e) => replayEdge(e, cadence));
  const brier = brierScore(points);
  const baseline = baselineBrier(points);
  const skill =
    brier === null || baseline === null || baseline === 0 ? null : 1 - brier / baseline;
  return { points: points.length, brier, baseline, skill };
}
