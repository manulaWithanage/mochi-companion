/**
 * Tier 0 — the deterministic extractor.
 *
 * Every statistic about how the user works is computed here, in TypeScript,
 * exactly. No model is involved and none can be.
 *
 * **Why this tier exists.** The first design handed each deduction to a small
 * local model, including things like "peak energy window confirmed: 2–4 PM".
 * That is a histogram. A 0.5B model is a slower, less reliable route to a
 * number that `Math` already knows, and it introduces an error class that
 * cannot otherwise exist. Narrowing the model to genuinely fuzzy work —
 * writing style, what an app means — means most users get a working brain with
 * no local model installed at all.
 *
 * Everything here is a pure function of a session list and a clock.
 */

import type { WorkSession } from '../timer/session.js';

/** A completed session with a known duration. */
interface Span {
  readonly startHour: number;
  readonly durationMs: number;
  readonly day: string;
  readonly projectId: string;
}

const MINUTE = 60_000;

/**
 * Sessions shorter than this are misclicks, not work.
 *
 * Left in, they drag the median down and invent a "typical session" of four
 * minutes that the user would not recognise.
 */
export const MIN_MEANINGFUL_MS = 3 * MINUTE;

/** Below this many sessions, any statistic is noise dressed as insight. */
export const MIN_SAMPLE = 5;

function toSpans(sessions: readonly WorkSession[]): readonly Span[] {
  const spans: Span[] = [];
  for (const s of sessions) {
    if (s.endedAt === null) continue;
    const durationMs = s.endedAt - s.startedAt;
    if (durationMs < MIN_MEANINGFUL_MS) continue;
    const started = new Date(s.startedAt);
    spans.push({
      startHour: started.getHours(),
      durationMs,
      day: `${started.getFullYear()}-${started.getMonth() + 1}-${started.getDate()}`,
      projectId: s.projectId,
    });
  }
  return spans;
}

/** Median, not mean: one four-hour session should not move "typical". */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export interface PeakWindow {
  /** Inclusive start hour, 0–23. */
  readonly startHour: number;
  /** Exclusive end hour. */
  readonly endHour: number;
  /** Share of total focused time inside the window, 0–1. */
  readonly share: number;
}

/**
 * The contiguous block of hours holding the most focused time.
 *
 * A fixed-width sliding window rather than "the top N hours", because the
 * useful answer is a stretch of the day the user can recognise and protect.
 * Scattered hours would produce "your peak is 9am, 2pm and 7pm", which is not
 * something anyone can act on.
 */
export function peakWindow(
  sessions: readonly WorkSession[],
  windowHours = 3,
): PeakWindow | null {
  const spans = toSpans(sessions);
  if (spans.length < MIN_SAMPLE) return null;

  const byHour = new Array<number>(24).fill(0);
  for (const s of spans) byHour[s.startHour] = (byHour[s.startHour] ?? 0) + s.durationMs;

  const total = byHour.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  let bestStart = 0;
  let bestSum = -1;
  let bestOpening = -1;

  // Wraps midnight, so a night owl's 22:00-01:00 block is found rather than
  // being split across the ends of the array and missed.
  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let i = 0; i < windowHours; i++) sum += byHour[(start + i) % 24] ?? 0;
    const opening = byHour[start] ?? 0;

    // Ties are the common case, not an edge case: someone who only ever starts
    // at 2pm makes every window containing 2pm score identically, and taking
    // the first would report "peaks 12pm-3pm" for a person who has never once
    // started before 2. Breaking on the busiest opening hour puts the window
    // where the work actually is.
    if (sum > bestSum || (sum === bestSum && opening > bestOpening)) {
      bestSum = sum;
      bestOpening = opening;
      bestStart = start;
    }
  }

  return {
    startHour: bestStart,
    endHour: (bestStart + windowHours) % 24,
    share: bestSum / total,
  };
}

/**
 * The duration past which sessions stop happening — an observed ceiling, not a
 * physiological claim.
 *
 * The 90th percentile of session length. Beyond it the user has historically
 * stopped, which is the actionable fact; calling it "fatigue" is interpretation
 * layered on top.
 */
export function sustainedCeilingMs(sessions: readonly WorkSession[]): number | null {
  const spans = toSpans(sessions);
  if (spans.length < MIN_SAMPLE) return null;
  const sorted = [...spans.map((s) => s.durationMs)].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9));
  return sorted[index] ?? null;
}

/** Consecutive days ending today (or yesterday) with at least one session. */
export function currentStreak(sessions: readonly WorkSession[], now: Date): number {
  const days = new Set(toSpans(sessions).map((s) => s.day));
  if (days.size === 0) return 0;

  const key = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const cursor = new Date(now);

  // A streak should not break at midnight before the user has started work, so
  // if today is empty we begin counting from yesterday.
  if (!days.has(key(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(key(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Share of focused time spent in sessions of 25 minutes or more. */
export function deepWorkRatio(sessions: readonly WorkSession[]): number | null {
  const spans = toSpans(sessions);
  if (spans.length < MIN_SAMPLE) return null;
  const total = spans.reduce((a, s) => a + s.durationMs, 0);
  if (total === 0) return null;
  const deep = spans
    .filter((s) => s.durationMs >= 25 * MINUTE)
    .reduce((a, s) => a + s.durationMs, 0);
  return deep / total;
}

export interface WorkProfile {
  readonly typicalSessionMs: number | null;
  readonly peak: PeakWindow | null;
  readonly sustainedCeilingMs: number | null;
  readonly streakDays: number;
  readonly deepWorkRatio: number | null;
  readonly sampleSize: number;
  /**
   * False until there is enough data to say anything. The caller must not
   * present a profile built on three sessions as though it were learned.
   */
  readonly ready: boolean;
}

/** Everything Tier 0 knows, from one pass over the sessions. */
export function buildWorkProfile(sessions: readonly WorkSession[], now: Date): WorkProfile {
  const spans = toSpans(sessions);
  const durations = spans.map((s) => s.durationMs);
  return {
    typicalSessionMs: spans.length >= MIN_SAMPLE ? median(durations) : null,
    peak: peakWindow(sessions),
    sustainedCeilingMs: sustainedCeilingMs(sessions),
    streakDays: currentStreak(sessions, now),
    deepWorkRatio: deepWorkRatio(sessions),
    sampleSize: spans.length,
    ready: spans.length >= MIN_SAMPLE,
  };
}

/** `14` → `2pm`. Used in context packages, where every token counts. */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}
