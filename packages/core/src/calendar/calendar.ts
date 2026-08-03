/**
 * Calendar — the pure half.
 *
 * Deliberately source-agnostic. A secret ICS URL and a Google OAuth token
 * produce the same `CalendarEvent[]`, so the decision between them changes only
 * the adapter in apps/desktop and nothing here. Fetching, ICS parsing and
 * recurrence expansion all live outside this file (RULE 2).
 *
 * Times are epoch milliseconds throughout. Timezone handling belongs in the
 * adapter, because an ICS feed carries its own VTIMEZONE definitions and
 * resolving those is parsing work, not scheduling logic.
 */

import type { WorkHours } from '../mascot/state.js';
import { parseHhMm } from '../mascot/state.js';

/**
 * Whether *you* are going.
 *
 * A declined meeting still appears in the feed. Counting it would tell someone
 * their day is full of meetings they already said no to.
 */
export type Attendance = 'accepted' | 'declined' | 'tentative' | 'unknown';

export interface CalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly startsAt: number;
  readonly endsAt: number;
  /**
   * Birthdays, PTO, "release week". Shown in a briefing, but never counted as
   * occupied time — treating an all-day event as a 24-hour meeting makes every
   * day look fully booked and leaves no free block anywhere.
   */
  readonly allDay: boolean;
  readonly cancelled: boolean;
  readonly attendance: Attendance;
  readonly location?: string;
  /** Validated join link, if the invite carried a recognised one. */
  readonly conferenceUrl?: string;
  readonly organizer?: string;
}

export const CALENDAR_SUBJECT_PREFIX = 'calendar:';

/** Anything shorter is a marker, not a meeting. */
export const MIN_MEETING_MS = 5 * 60_000;

/** A free gap shorter than this is not usable for focused work. */
export const MIN_FREE_BLOCK_MS = 20 * 60_000;

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Does this event actually occupy the user's time?
 *
 * The three exclusions each correspond to a way a naive implementation reports
 * a day as busier than it is.
 */
export function isBusy(event: CalendarEvent): boolean {
  if (event.cancelled) return false;
  if (event.attendance === 'declined') return false;
  if (event.allDay) return false;
  return event.endsAt > event.startsAt;
}

export function sortByStart(events: readonly CalendarEvent[]): readonly CalendarEvent[] {
  return [...events].sort((a, b) => a.startsAt - b.startsAt || a.endsAt - b.endsAt);
}

/** Happening right now. */
export function inProgress(
  events: readonly CalendarEvent[],
  now: number,
): readonly CalendarEvent[] {
  return sortByStart(events.filter((e) => isBusy(e) && e.startsAt <= now && e.endsAt > now));
}

/**
 * The next thing starting, within a horizon.
 *
 * Excludes anything already running: "coming up" means something the user has
 * not yet been interrupted by.
 */
export function upcoming(
  events: readonly CalendarEvent[],
  now: number,
  withinMs = 12 * 60 * 60_000,
): readonly CalendarEvent[] {
  const horizon = now + withinMs;
  return sortByStart(events.filter((e) => isBusy(e) && e.startsAt > now && e.startsAt <= horizon));
}

export function nextEvent(events: readonly CalendarEvent[], now: number): CalendarEvent | null {
  return upcoming(events, now)[0] ?? null;
}

/** Everything on a calendar day, all-day entries included, for a briefing. */
export function eventsOnDay(events: readonly CalendarEvent[], day: Date): readonly CalendarEvent[] {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const from = start.getTime();
  const to = end.getTime();

  // Overlap, not containment: a meeting that started yesterday and runs into
  // this morning is still part of today.
  return sortByStart(events.filter((e) => !e.cancelled && e.startsAt < to && e.endsAt > from));
}

// ---------------------------------------------------------------------------
// Shape of the day
// ---------------------------------------------------------------------------

export interface Interval {
  readonly start: number;
  readonly end: number;
}

/**
 * Merge overlapping busy intervals.
 *
 * Double-booking is normal in a real calendar. Without merging, two overlapping
 * meetings produce a phantom "free block" between the first one's start and the
 * second one's start, and the user is told they have time they do not have.
 */
export function mergeBusy(events: readonly CalendarEvent[]): readonly Interval[] {
  const busy = sortByStart(events.filter(isBusy));
  const merged: Interval[] = [];

  for (const event of busy) {
    const last = merged[merged.length - 1];
    if (last !== undefined && event.startsAt <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, event.endsAt) };
    } else {
      merged.push({ start: event.startsAt, end: event.endsAt });
    }
  }
  return merged;
}

/** The working window for a given day, in epoch ms. */
export function workWindow(day: Date, hours: WorkHours): Interval | null {
  const start = parseHhMm(hours.start);
  const end = parseHhMm(hours.end);
  if (start === null || end === null) return null;

  // parseHhMm returns minutes since midnight, not an {hour, minute} pair.
  const from = new Date(day);
  from.setHours(0, start, 0, 0);
  const to = new Date(day);
  to.setHours(0, end, 0, 0);

  // An overnight shift ends the following day rather than lasting minus-hours.
  if (to.getTime() <= from.getTime()) to.setDate(to.getDate() + 1);

  return { start: from.getTime(), end: to.getTime() };
}

/**
 * Usable gaps inside a window.
 *
 * `notBefore` lets the caller ask for what is left of *today* rather than the
 * whole day, so a briefing at 2pm does not offer a free block that ended at 10.
 */
export function freeBlocks(
  events: readonly CalendarEvent[],
  window: Interval,
  options: { readonly minMs?: number; readonly notBefore?: number } = {},
): readonly Interval[] {
  const minMs = options.minMs ?? MIN_FREE_BLOCK_MS;
  const from = Math.max(window.start, options.notBefore ?? window.start);
  if (from >= window.end) return [];

  const blocks: Interval[] = [];
  let cursor = from;

  for (const busy of mergeBusy(events)) {
    if (busy.end <= cursor) continue;
    if (busy.start >= window.end) break;
    if (busy.start > cursor) {
      blocks.push({ start: cursor, end: Math.min(busy.start, window.end) });
    }
    cursor = Math.max(cursor, busy.end);
    if (cursor >= window.end) break;
  }

  if (cursor < window.end) blocks.push({ start: cursor, end: window.end });

  return blocks.filter((b) => b.end - b.start >= minMs);
}

export interface DayShape {
  readonly meetingCount: number;
  readonly meetingMs: number;
  /** Longest uninterrupted stretch left. The number that decides "can I focus". */
  readonly longestFreeMs: number;
  readonly freeMs: number;
  /**
   * Share of the working window occupied, 0–1.
   *
   * This is the signal the brain wants: it is what explains why a day with the
   * same total meeting time can feel fine or feel destroyed depending on how
   * the meetings were spaced.
   */
  readonly occupancy: number;
  /** True when no gap is long enough to do anything real in. */
  readonly fragmented: boolean;
}

export function dayShape(
  events: readonly CalendarEvent[],
  window: Interval,
  options: { readonly notBefore?: number } = {},
): DayShape {
  const relevant = events.filter(
    (e) => isBusy(e) && e.endsAt > window.start && e.startsAt < window.end,
  );
  const meetingMs = mergeBusy(relevant).reduce(
    (total, b) => total + (Math.min(b.end, window.end) - Math.max(b.start, window.start)),
    0,
  );

  const blocks = freeBlocks(events, window, {
    minMs: 0,
    ...(options.notBefore !== undefined ? { notBefore: options.notBefore } : {}),
  });
  const freeMs = blocks.reduce((total, b) => total + (b.end - b.start), 0);
  const longestFreeMs = blocks.reduce((max, b) => Math.max(max, b.end - b.start), 0);
  const windowMs = Math.max(1, window.end - window.start);

  return {
    meetingCount: relevant.length,
    meetingMs,
    longestFreeMs,
    freeMs,
    occupancy: Math.min(1, meetingMs / windowMs),
    // Having meetings is not the same as being fragmented. One long block is
    // fine; four scattered ones with nothing usable between them is not.
    fragmented: relevant.length > 0 && longestFreeMs < MIN_FREE_BLOCK_MS,
  };
}

/** Overlapping pairs, so the briefing can point out a double-booking. */
export function conflicts(
  events: readonly CalendarEvent[],
): readonly (readonly [CalendarEvent, CalendarEvent])[] {
  const busy = sortByStart(events.filter(isBusy));
  const found: (readonly [CalendarEvent, CalendarEvent])[] = [];

  for (let i = 0; i < busy.length; i++) {
    for (let j = i + 1; j < busy.length; j++) {
      const a = busy[i]!;
      const b = busy[j]!;
      // Sorted by start, so once b begins after a ends nothing later can clash.
      if (b.startsAt >= a.endsAt) break;
      found.push([a, b]);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Join links
// ---------------------------------------------------------------------------

/**
 * Conferencing hosts a join link may point at.
 *
 * **This is a security boundary, not a convenience.** Anyone can send a
 * calendar invite, so location and description are attacker-controlled text. A
 * "one-click join" that opened whatever URL it found there would be a
 * click-to-open primitive driven by strangers. Only https, only these hosts.
 */
const CONFERENCE_HOSTS: readonly RegExp[] = [
  /^meet\.google\.com$/i,
  /^([a-z0-9-]+\.)?zoom\.us$/i,
  /^teams\.microsoft\.com$/i,
  /^teams\.live\.com$/i,
  /^([a-z0-9-]+\.)?webex\.com$/i,
  /^whereby\.com$/i,
  /^meet\.jit\.si$/i,
];

/**
 * Pull a join link out of invite text, or null.
 *
 * Returns null rather than a best guess: offering the wrong link is worse than
 * offering none, because the user finds out during the meeting they missed.
 */
export function extractConferenceUrl(...texts: readonly (string | undefined)[]): string | null {
  for (const text of texts) {
    if (text === undefined || text.length === 0) continue;
    const candidates = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];

    for (const raw of candidates) {
      // Trailing punctuation from prose: "join at https://x/y." or "(...)".
      const cleaned = raw.replace(/[.,;:]+$/, '');
      let url: URL;
      try {
        url = new URL(cleaned);
      } catch {
        continue;
      }
      if (url.protocol !== 'https:') continue;
      if (!CONFERENCE_HOSTS.some((host) => host.test(url.hostname))) continue;
      return url.toString();
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface MeetingAlertTiming {
  /** How long before the start to speak up. */
  readonly leadMs: number;
  /**
   * Skip an alert this close to the start.
   *
   * A reminder that arrives thirty seconds before, or after the meeting has
   * already begun, is worse than silence: the user cannot act on it and it
   * still costs an interruption from the governor's budget.
   */
  readonly minNoticeMs: number;
}

export const DEFAULT_MEETING_ALERT: MeetingAlertTiming = {
  leadMs: 5 * 60_000,
  minNoticeMs: 60_000,
};

export interface PlannedMeetingAlert {
  /** Scheduler key. Unique per event and lead time. */
  readonly key: string;
  /** Governor subject. Dismissing it silences this meeting, not all meetings. */
  readonly subject: string;
  readonly at: number;
  readonly event: CalendarEvent;
  readonly text: string;
}

/** `in 5 minutes`, `now`, `in 1 hour`. */
export function describeLead(ms: number): string {
  if (ms < 60_000) return 'now';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'in 1 hour' : `in ${hours} hours`;
}

/**
 * One alert per upcoming meeting.
 *
 * Meetings already started are skipped rather than fired late — the scheduler
 * replays missed items after a laptop wakes, and without this the user would
 * get told about three meetings that finished while the lid was shut.
 */
export function planMeetingAlerts(
  events: readonly CalendarEvent[],
  now: number,
  timing: MeetingAlertTiming = DEFAULT_MEETING_ALERT,
): readonly PlannedMeetingAlert[] {
  return upcoming(events, now)
    .filter((event) => event.endsAt - event.startsAt >= MIN_MEETING_MS)
    .flatMap((event) => {
      const at = event.startsAt - timing.leadMs;
      // Too late to be useful, or already past.
      if (event.startsAt - now < timing.minNoticeMs) return [];
      const fireAt = Math.max(at, now);
      const lead = event.startsAt - fireAt;

      return [
        {
          key: `${CALENDAR_SUBJECT_PREFIX}alert:${event.id}:${timing.leadMs}`,
          subject: `${CALENDAR_SUBJECT_PREFIX}${event.id}`,
          at: fireAt,
          event,
          text: `${event.title} starts ${describeLead(lead)}`,
        },
      ];
    });
}

/** `2pm`, `2:30pm`. Compact, because it goes in a speech bubble. */
export function clockLabel(at: number): string {
  const d = new Date(at);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const suffix = hours < 12 ? 'am' : 'pm';
  const h = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${h}${suffix}` : `${h}:${String(minutes).padStart(2, '0')}${suffix}`;
}
