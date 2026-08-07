/**
 * ICS → CalendarEvent.
 *
 * The adapter half of the calendar. Everything source-specific lives here;
 * `@mochi/core/calendar` never learns whether events came from an ICS feed or
 * an API.
 *
 * **No electron import, on purpose.** That keeps this file testable, and this
 * is the riskiest code in the feature: it parses a text format produced by
 * someone else's server, containing events created by other people, with a
 * recurrence grammar that can describe an infinite series.
 */

import ICAL from 'ical.js';
import { extractConferenceUrl, type Attendance, type CalendarEvent } from '@mochi/core';

export interface IcsParseOptions {
  /** Only events overlapping this window are returned. */
  readonly from: number;
  readonly to: number;
  /**
   * The calendar owner's address, used to find *your* RSVP among the
   * attendees. Without it attendance stays 'unknown', which counts as busy —
   * showing a meeting you declined is a smaller failure than hiding one you
   * are expected at.
   */
  readonly selfEmail?: string;
}

/**
 * Hard ceiling on occurrences expanded from one rule.
 *
 * `RRULE:FREQ=MINUTELY` with no COUNT or UNTIL is valid iCalendar and would
 * otherwise spin until the process dies. The window bounds the useful range;
 * this bounds the pathological one.
 *
 * Counts only occurrences that land inside the window. Counting every iterated
 * occurrence spent the whole cap on skipped history: a daily standup created
 * more than 400 days ago burned through the limit before reaching today, and
 * the meeting silently vanished from the calendar.
 */
const MAX_OCCURRENCES_PER_RULE = 400;

/**
 * Hard ceiling on iterator steps per rule, in-window or not.
 *
 * This is what actually stops a pathological rule now that skipped occurrences
 * no longer count against `MAX_OCCURRENCES_PER_RULE`. Big enough that decades
 * of a daily series still reach the window; small enough that an unbounded
 * MINUTELY rule terminates in well under a second.
 */
const MAX_ITERATIONS_PER_RULE = 100_000;

/** Total events returned, so one feed cannot exhaust memory. */
const MAX_EVENTS = 2000;

function attendanceOf(vevent: ICAL.Component, selfEmail?: string): Attendance {
  if (selfEmail === undefined) return 'unknown';
  const wanted = selfEmail.trim().toLowerCase();

  for (const attendee of vevent.getAllProperties('attendee')) {
    const value = String(attendee.getFirstValue() ?? '')
      .replace(/^mailto:/i, '')
      .toLowerCase();
    if (value !== wanted) continue;

    const partstat = String(attendee.getParameter('partstat') ?? '').toUpperCase();
    if (partstat === 'DECLINED') return 'declined';
    if (partstat === 'TENTATIVE') return 'tentative';
    if (partstat === 'ACCEPTED') return 'accepted';
    return 'unknown';
  }
  return 'unknown';
}

function toEvent(
  event: ICAL.Event,
  vevent: ICAL.Component,
  startsAt: number,
  endsAt: number,
  options: IcsParseOptions,
  suffix: string,
): CalendarEvent {
  const location = event.location ?? undefined;
  const description = String(vevent.getFirstPropertyValue('description') ?? '') || undefined;
  const conferenceUrl = extractConferenceUrl(location, description, event.summary ?? undefined);
  const organizer =
    String(vevent.getFirstPropertyValue('organizer') ?? '').replace(/^mailto:/i, '') || undefined;

  return {
    // Recurring events share a UID, so the occurrence start is what makes an
    // instance addressable. Without it, every occurrence of a daily standup
    // would collide in the scheduler and only one alert would ever fire.
    id: `${event.uid}${suffix}`,
    title: event.summary?.trim() || '(no title)',
    startsAt,
    endsAt,
    allDay: event.startDate.isDate,
    cancelled: String(vevent.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED',
    attendance: attendanceOf(vevent, options.selfEmail),
    ...(location !== undefined ? { location } : {}),
    ...(conferenceUrl !== null ? { conferenceUrl } : {}),
    ...(organizer !== undefined ? { organizer } : {}),
  };
}

/**
 * Parse an ICS document into concrete event instances.
 *
 * Never throws. A malformed feed returns an empty list — a calendar that
 * cannot be read must not take the app down with it, and the caller reports
 * the failure through the connection status rather than a crash.
 */
export function parseIcs(text: string, options: IcsParseOptions): readonly CalendarEvent[] {
  // The traversal is inside the guard as well as the parse. A truncated feed —
  // `BEGIN:VCALENDAR` with nothing after it — parses successfully and then
  // throws on the first walk, which is precisely the response a flaky server
  // returns and precisely the case that must not crash the app.
  let vevents: ICAL.Component[];
  try {
    vevents = new ICAL.Component(ICAL.parse(text)).getAllSubcomponents('vevent');
  } catch {
    return [];
  }

  const events: CalendarEvent[] = [];

  // Modified single occurrences carry RECURRENCE-ID and must be attached to
  // their series, or a moved meeting appears twice: once at the old time from
  // the rule, and once at the new time from the override.
  const masters: ICAL.Event[] = [];
  const exceptions: ICAL.Component[] = [];

  for (const vevent of vevents) {
    if (vevent.getFirstPropertyValue('recurrence-id') !== null) exceptions.push(vevent);
  }

  for (const vevent of vevents) {
    if (vevent.getFirstPropertyValue('recurrence-id') !== null) continue;
    let event: ICAL.Event;
    try {
      event = new ICAL.Event(vevent);
    } catch {
      continue;
    }
    for (const exception of exceptions) {
      try {
        if (String(exception.getFirstPropertyValue('uid') ?? '') === event.uid) {
          event.relateException(exception);
        }
      } catch {
        // An override we cannot attach is skipped rather than dropping the
        // whole series.
      }
    }
    masters.push(event);
  }

  for (const event of masters) {
    if (events.length >= MAX_EVENTS) break;
    const vevent = event.component;

    try {
      if (!event.isRecurring()) {
        const startsAt = event.startDate.toJSDate().getTime();
        const endsAt = event.endDate.toJSDate().getTime();
        if (endsAt > options.from && startsAt < options.to) {
          events.push(toEvent(event, vevent, startsAt, endsAt, options, ''));
        }
        continue;
      }

      const iterator = event.iterator();
      let produced = 0;
      let iterations = 0;
      for (let next = iterator.next(); next !== null; next = iterator.next()) {
        if (produced >= MAX_OCCURRENCES_PER_RULE) break;
        if (iterations >= MAX_ITERATIONS_PER_RULE) break;
        iterations += 1;

        const details = event.getOccurrenceDetails(next);
        const startsAt = details.startDate.toJSDate().getTime();
        const endsAt = details.endDate.toJSDate().getTime();

        // The series is ordered, so nothing after this can be in range either.
        if (startsAt >= options.to) break;
        if (endsAt <= options.from) continue;

        produced += 1;
        events.push(
          toEvent(details.item, details.item.component, startsAt, endsAt, options, `@${startsAt}`),
        );
        if (events.length >= MAX_EVENTS) break;
      }
    } catch {
      // One unparseable series must not discard the rest of the calendar.
      continue;
    }
  }

  return events;
}

/**
 * Is this plausibly a calendar feed URL?
 *
 * Checked before storing, so a mistyped paste fails at the point the user can
 * still see what they typed rather than as an empty calendar hours later.
 * Deliberately loose about the path: providers other than Google use quite
 * different shapes, and rejecting them would make this Google-only.
 */
export function looksLikeIcsUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return false;

  let url: URL;
  try {
    url = new URL(trimmed.replace(/^webcal:\/\//i, 'https://'));
  } catch {
    return false;
  }
  // https only: the URL is a bearer credential, and this one is fetched by the
  // main process on a timer.
  return url.protocol === 'https:';
}

/** `webcal://` is the same feed; browsers use it to trigger a calendar app. */
export function normaliseIcsUrl(raw: string): string {
  return raw.trim().replace(/^webcal:\/\//i, 'https://');
}

/**
 * A calendar URL with its secret removed, for display and logs.
 *
 * Google's secret address contains a private token that grants read access to
 * the whole calendar. It must never appear in a log line or cross the bridge.
 */
export function redactIcsUrl(raw: string): string {
  try {
    const url = new URL(normaliseIcsUrl(raw));
    return `${url.hostname}/…`;
  } catch {
    return '…';
  }
}
