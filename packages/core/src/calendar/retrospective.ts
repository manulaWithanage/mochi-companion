/**
 * How the last month actually went — meetings and tracked time, together.
 *
 * Neither source answers the interesting question alone. The calendar knows
 * you had four meetings; the timer knows you tracked ninety minutes. Only the
 * two side by side say whether one explains the other.
 *
 * Everything here is arithmetic over data the user already has. No model is
 * involved, and the language is deliberately observational — this can show
 * that heavy-meeting days coincide with less tracked work, which is not the
 * same as proving meetings caused it.
 */

import type { WorkHours } from '../mascot/state.js';
import type { WorkSession } from '../timer/session.js';
import { dayShape, workWindow, type CalendarEvent } from './calendar.js';

/** Local `YYYY-MM-DD`, matching how tasks and the budget bucket days. */
export function dayId(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface DayRecord {
  readonly day: string;
  /** Midnight local, so the caller can format without re-parsing. */
  readonly at: number;
  readonly trackedMs: number;
  readonly meetingMs: number;
  readonly meetingCount: number;
  readonly longestFreeMs: number;
  readonly fragmented: boolean;
  /** False for weekends and days with neither meetings nor tracked time. */
  readonly active: boolean;
}

/**
 * Tracked milliseconds per day.
 *
 * A session that runs past midnight is credited to the day it started. Splitting
 * it would be more accurate and much harder to reason about, and the case is
 * rare enough that the simpler rule is the better trade.
 */
function trackedByDay(sessions: readonly WorkSession[]): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    if (session.endedAt === null) continue;
    const duration = session.endedAt - session.startedAt;
    if (duration <= 0) continue;
    const key = dayId(new Date(session.startedAt));
    totals.set(key, (totals.get(key) ?? 0) + duration);
  }
  return totals;
}

export interface RetrospectiveInput {
  readonly sessions: readonly WorkSession[];
  readonly events: readonly CalendarEvent[];
  readonly workHours: WorkHours;
  /** Most recent day to include, usually today. */
  readonly endingOn: Date;
  readonly days: number;
}

/** One row per day, oldest first, including days with nothing on them. */
export function buildDayRecords(input: RetrospectiveInput): readonly DayRecord[] {
  const tracked = trackedByDay(input.sessions);
  const records: DayRecord[] = [];

  for (let offset = input.days - 1; offset >= 0; offset -= 1) {
    const date = new Date(input.endingOn);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);

    const window = workWindow(date, input.workHours);
    const trackedMs = tracked.get(dayId(date)) ?? 0;

    // Gaps are only meaningful inside a working window; without one there is
    // no "free block" to speak of, just unscheduled time.
    const shape =
      window === null
        ? { meetingCount: 0, meetingMs: 0, longestFreeMs: 0, fragmented: false }
        : dayShape(input.events, window);

    records.push({
      day: dayId(date),
      at: date.getTime(),
      trackedMs,
      meetingMs: shape.meetingMs,
      meetingCount: shape.meetingCount,
      longestFreeMs: shape.longestFreeMs,
      fragmented: shape.fragmented,
      // Empty days are kept in the series so a chart does not silently compress
      // a fortnight off into nothing, but they are excluded from averages.
      active: trackedMs > 0 || shape.meetingCount > 0,
    });
  }

  return records;
}

/** Days with at least this many meetings count as a heavy day. */
export const HEAVY_MEETING_DAY = 3;

/** Below this many days on either side, the comparison is noise. */
export const MIN_DAYS_PER_GROUP = 3;

export interface MeetingImpact {
  /** Median tracked ms on days with fewer than HEAVY_MEETING_DAY meetings. */
  readonly lightDayMs: number;
  readonly heavyDayMs: number;
  readonly lightDays: number;
  readonly heavyDays: number;
  /** Negative means less tracked work on heavy days. */
  readonly differenceMs: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Does tracked work differ between light and heavy meeting days?
 *
 * Median rather than mean: one twelve-hour day would otherwise decide the
 * answer. Returns null when either group is too small — a comparison drawn
 * from two days is a coincidence with a number attached.
 */
export function meetingImpact(records: readonly DayRecord[]): MeetingImpact | null {
  const active = records.filter((r) => r.active);
  const light = active.filter((r) => r.meetingCount < HEAVY_MEETING_DAY);
  const heavy = active.filter((r) => r.meetingCount >= HEAVY_MEETING_DAY);

  if (light.length < MIN_DAYS_PER_GROUP || heavy.length < MIN_DAYS_PER_GROUP) return null;

  const lightDayMs = median(light.map((r) => r.trackedMs));
  const heavyDayMs = median(heavy.map((r) => r.trackedMs));

  return {
    lightDayMs,
    heavyDayMs,
    lightDays: light.length,
    heavyDays: heavy.length,
    differenceMs: heavyDayMs - lightDayMs,
  };
}

export interface RetrospectiveSummary {
  readonly records: readonly DayRecord[];
  readonly activeDays: number;
  readonly totalTrackedMs: number;
  readonly totalMeetingMs: number;
  readonly totalMeetings: number;
  /** Averaged over active days only, so time off does not read as a slump. */
  readonly avgTrackedMs: number;
  readonly avgMeetingMs: number;
  readonly fragmentedDays: number;
  /** Most tracked time. Null when nothing has been tracked at all. */
  readonly bestDay: DayRecord | null;
  readonly busiestDay: DayRecord | null;
  readonly impact: MeetingImpact | null;
}

export function summarise(records: readonly DayRecord[]): RetrospectiveSummary {
  const active = records.filter((r) => r.active);
  const totalTrackedMs = records.reduce((sum, r) => sum + r.trackedMs, 0);
  const totalMeetingMs = records.reduce((sum, r) => sum + r.meetingMs, 0);
  const totalMeetings = records.reduce((sum, r) => sum + r.meetingCount, 0);

  const tracked = records.filter((r) => r.trackedMs > 0);
  const withMeetings = records.filter((r) => r.meetingCount > 0);

  return {
    records,
    activeDays: active.length,
    totalTrackedMs,
    totalMeetingMs,
    totalMeetings,
    avgTrackedMs: active.length === 0 ? 0 : Math.round(totalTrackedMs / active.length),
    avgMeetingMs: active.length === 0 ? 0 : Math.round(totalMeetingMs / active.length),
    fragmentedDays: records.filter((r) => r.fragmented).length,
    bestDay:
      tracked.length === 0
        ? null
        : tracked.reduce((best, r) => (r.trackedMs > best.trackedMs ? r : best)),
    busiestDay:
      withMeetings.length === 0
        ? null
        : withMeetings.reduce((worst, r) => (r.meetingMs > worst.meetingMs ? r : worst)),
    impact: meetingImpact(records),
  };
}

/**
 * The impact finding, phrased as an observation.
 *
 * Deliberately not causal. "You track less on heavy days" is what the data
 * says; "meetings destroy your focus" is a story about why, and the arithmetic
 * does not support it. Returns null when the difference is too small to be
 * worth a sentence.
 */
export function describeImpact(impact: MeetingImpact | null): string | null {
  if (impact === null) return null;

  const minutes = Math.round(Math.abs(impact.differenceMs) / 60_000);
  // Under half an hour is inside the noise of how people remember to start a
  // timer, and not worth telling someone about.
  if (minutes < 30) return null;

  const light = Math.round(impact.lightDayMs / 60_000);
  const heavy = Math.round(impact.heavyDayMs / 60_000);
  const direction = impact.differenceMs < 0 ? 'less' : 'more';

  return (
    `On days with ${HEAVY_MEETING_DAY} or more meetings you track about ${minutes} min ${direction} ` +
    `(${heavy} min against ${light} min). Based on ${impact.heavyDays} busy days and ${impact.lightDays} quieter ones.`
  );
}
