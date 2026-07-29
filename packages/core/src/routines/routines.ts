/**
 * Routines — Mochi's first unprompted behaviour.
 *
 * Everything here is derived from the work hours the user already set during
 * the 3-step setup. **No OAuth, no API key, no network, no LLM.** That is the
 * point: it exercises the interruption governor against real unprompted
 * messages before any integration exists, which is the cheapest possible way
 * to find out whether the interruption model is right.
 *
 * Pure planning. This computes *what should happen today* and hands it to the
 * scheduler; it never fires anything itself.
 */

import { makeEvent, type MochiEvent } from '../events/events.js';
import { parseHhMm, type WorkHours } from '../mascot/state.js';
import type { ScheduledItem } from '../scheduler/scheduler.js';

export type RoutineKind =
  'day-start' | 'day-end' | 'break' | 'long-session' | 'tasks-open' | 'tasks-overdue';

export interface RoutineConfig {
  readonly dayStart: boolean;
  readonly dayEnd: boolean;
  /** Periodic nudge to look away from the screen. */
  readonly breaks: boolean;
  readonly breakEveryMs: number;
  /** Nudge when a single tracked session has run unusually long. */
  readonly longSession: boolean;
  readonly longSessionAfterMs: number;
}

export const DEFAULT_ROUTINES: RoutineConfig = {
  dayStart: true,
  dayEnd: true,
  breaks: true,
  // Long enough not to nag, short enough to matter. A guess until measured.
  breakEveryMs: 90 * 60_000,
  longSession: true,
  longSessionAfterMs: 100 * 60_000,
};

/** Namespace owned by this source, so it can re-declare its whole set. */
export const ROUTINE_PREFIX = 'routine:';

const TEXT: Record<RoutineKind, readonly string[]> = {
  'day-start': [
    'Morning! Ready when you are.',
    "Here we go — let's make it a good one.",
    'Good morning. Shall we start something?',
  ],
  'day-end': [
    "That's the day done. Time to stop?",
    'Work hours are over — go and be a person.',
    "You're past your hours. I'll be here tomorrow.",
  ],
  break: [
    'Look at something far away for a bit?',
    'Been a while — stretch?',
    'Worth a break. I’ll keep your place.',
  ],
  'long-session': [
    "You've been at this a long while. Still with me?",
    "That's a long stretch — remember to move.",
  ],
  // Filled in by taskNudgeText — the count is the whole message.
  'tasks-open': [],
  'tasks-overdue': [],
};

/**
 * Task nudges name a number, so the template list cannot carry them.
 *
 * Phrased as a question rather than a scold. The list is the user's, and a
 * companion that tuts at an unfinished day gets muted.
 */
export function taskNudgeText(kind: 'tasks-open' | 'tasks-overdue', count: number): string {
  const things = count === 1 ? '1 thing' : `${count} things`;
  return kind === 'tasks-overdue'
    ? `${things} slipped past their day. Move them to today?`
    : `${things} still on today's list. Carry them over?`;
}

function pick(options: readonly string[], random: () => number): string {
  const i = Math.min(options.length - 1, Math.max(0, Math.floor(random() * options.length)));
  return options[i]!;
}

/** Local timestamp for `HH:mm` on the same day as `now`. */
function todayAt(now: Date, hhmm: string): number | null {
  const minutes = parseHhMm(hhmm);
  if (minutes === null) return null;
  const d = new Date(now);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.getTime();
}

export interface PlanInput {
  readonly now: Date;
  readonly workHours: WorkHours;
  readonly config: RoutineConfig;
  readonly random?: () => number;
}

function routineEvent(
  kind: RoutineKind,
  at: number,
  random: () => number,
  overrideText?: string,
): MochiEvent {
  const day = new Date(at).toISOString().slice(0, 10);
  return makeEvent({
    // Subject is stable per kind per day, so dismissing "today's break nudge"
    // suppresses that one without silencing the routine forever.
    id: `${ROUTINE_PREFIX}${kind}:${at}`,
    source: 'routine',
    kind,
    at,
    subject: `${ROUTINE_PREFIX}${kind}:${day}`,
    text: overrideText ?? pick(TEXT[kind], random),
    priority: 'low',
    // A day-start nudge is meaningless by lunchtime. Let it expire rather
    // than surface late.
    expiresAt: at + 30 * 60_000,
  });
}

/**
 * Plan today's routines.
 *
 * Only future moments are returned — anything already past today is simply
 * omitted rather than scheduled and immediately dropped.
 */
export function planDailyRoutines(input: PlanInput): readonly ScheduledItem[] {
  const { now, workHours, config } = input;
  const random = input.random ?? Math.random;
  const nowMs = now.getTime();
  const items: ScheduledItem[] = [];

  const start = todayAt(now, workHours.start);
  const end = todayAt(now, workHours.end);

  const add = (kind: RoutineKind, at: number, keySuffix = ''): void => {
    if (at <= nowMs) return;
    items.push({
      key: `${ROUTINE_PREFIX}${kind}${keySuffix}`,
      at,
      event: routineEvent(kind, at, random),
    });
  };

  if (config.dayStart && start !== null) add('day-start', start);
  if (config.dayEnd && end !== null) add('day-end', end);

  // Break nudges spread across the working day. Skipped entirely for an
  // overnight shift — the arithmetic stops meaning anything when the end is
  // before the start, and guessing is worse than staying quiet.
  if (config.breaks && start !== null && end !== null && end > start) {
    let at = start + config.breakEveryMs;
    let n = 0;
    while (at < end) {
      add('break', at, `:${n}`);
      at += config.breakEveryMs;
      n += 1;
    }
  }

  return items;
}

/**
 * A nudge for a session that has been running a long time.
 *
 * Scheduled from the session's own start rather than from wall-clock time, so
 * it lands relative to when the user actually began.
 */
export function planLongSession(
  sessionStartedAt: number,
  config: RoutineConfig,
  now: Date,
  random: () => number = Math.random,
): ScheduledItem | null {
  if (!config.longSession) return null;
  const at = sessionStartedAt + config.longSessionAfterMs;
  if (at <= now.getTime()) return null;
  return {
    key: `${ROUTINE_PREFIX}long-session`,
    at,
    event: routineEvent('long-session', at, random),
  };
}

/**
 * A nudge about unfinished tasks, scheduled just before the working day ends.
 *
 * Deliberately one nudge, once, at a moment when acting on it is still
 * possible — not a running count that pesters all afternoon.
 */
export function planTaskNudge(
  openCount: number,
  overdueCount: number,
  workHours: WorkHours,
  now: Date,
  random: () => number = Math.random,
): ScheduledItem | null {
  if (openCount === 0 && overdueCount === 0) return null;

  const end = todayAt(now, workHours.end);
  if (end === null) return null;

  // Fifteen minutes before the end, so there is time to actually do something.
  const at = end - 15 * 60_000;
  if (at <= now.getTime()) return null;

  const kind: RoutineKind = overdueCount > 0 ? 'tasks-overdue' : 'tasks-open';
  const count = overdueCount > 0 ? overdueCount : openCount;

  return {
    key: `${ROUTINE_PREFIX}${kind}`,
    at,
    event: routineEvent(kind, at, random, taskNudgeText(kind, count)),
  };
}
