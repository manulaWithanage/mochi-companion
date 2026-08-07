import { describe, expect, it } from 'vitest';
import { looksLikeIcsUrl, normaliseIcsUrl, parseIcs, redactIcsUrl } from './ics.js';

/** Build an ICS document from VEVENT bodies. */
const ics = (...events: readonly string[][]): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    ...events.flatMap((lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']),
    'END:VCALENDAR',
  ].join('\r\n');

const AUG = (day: number, hour = 0, minute = 0): number => Date.UTC(2026, 7, day, hour, minute, 0);

const WINDOW = { from: AUG(1), to: AUG(14) };

describe('parseIcs', () => {
  it('reads a plain event', () => {
    const events = parseIcs(
      ics(['UID:a', 'SUMMARY:Design review', 'DTSTART:20260803T090000Z', 'DTEND:20260803T100000Z']),
      WINDOW,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'a',
      title: 'Design review',
      startsAt: AUG(3, 9),
      endsAt: AUG(3, 10),
      allDay: false,
      cancelled: false,
    });
  });

  it('marks an all-day event', () => {
    // DTSTART;VALUE=DATE has no time. Core excludes these from busy time, so
    // getting the flag wrong makes every day look fully booked.
    const events = parseIcs(
      ics([
        'UID:b',
        'SUMMARY:Public holiday',
        'DTSTART;VALUE=DATE:20260805',
        'DTEND;VALUE=DATE:20260806',
      ]),
      WINDOW,
    );
    expect(events[0]?.allDay).toBe(true);
  });

  it('marks a cancelled event', () => {
    const events = parseIcs(
      ics([
        'UID:c',
        'SUMMARY:Scrapped',
        'STATUS:CANCELLED',
        'DTSTART:20260803T140000Z',
        'DTEND:20260803T150000Z',
      ]),
      WINDOW,
    );
    expect(events[0]?.cancelled).toBe(true);
  });

  it('expands a recurring event into instances', () => {
    const events = parseIcs(
      ics([
        'UID:d',
        'SUMMARY:Standup',
        'DTSTART:20260803T090000Z',
        'DTEND:20260803T091500Z',
        'RRULE:FREQ=DAILY;COUNT=5',
      ]),
      WINDOW,
    );
    expect(events).toHaveLength(5);
    expect(events.map((e) => e.startsAt)).toEqual([
      AUG(3, 9),
      AUG(4, 9),
      AUG(5, 9),
      AUG(6, 9),
      AUG(7, 9),
    ]);
  });

  it('gives each occurrence a distinct id', () => {
    // Occurrences share a UID. Without the start time in the id they collide in
    // the scheduler and only one alert per series ever fires.
    const events = parseIcs(
      ics([
        'UID:d',
        'SUMMARY:Standup',
        'DTSTART:20260803T090000Z',
        'DTEND:20260803T091500Z',
        'RRULE:FREQ=DAILY;COUNT=3',
      ]),
      WINDOW,
    );
    expect(new Set(events.map((e) => e.id)).size).toBe(3);
  });

  it('clips a recurring series to the window', () => {
    const events = parseIcs(
      ics([
        'UID:e',
        'SUMMARY:Daily',
        'DTSTART:20260801T090000Z',
        'DTEND:20260801T093000Z',
        'RRULE:FREQ=DAILY;COUNT=100',
      ]),
      { from: AUG(3), to: AUG(6) },
    );
    expect(events).toHaveLength(3);
    expect(events[0]?.startsAt).toBe(AUG(3, 9));
  });

  it('terminates on an unbounded high-frequency rule', () => {
    // FREQ=MINUTELY with no COUNT or UNTIL is valid iCalendar and would
    // otherwise spin until the process dies.
    const started = Date.now();
    const events = parseIcs(
      ics([
        'UID:f',
        'SUMMARY:Tick',
        'DTSTART:20260801T000000Z',
        'DTEND:20260801T000100Z',
        'RRULE:FREQ=MINUTELY',
      ]),
      WINDOW,
    );
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(400);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('still yields in-window occurrences from a series started long ago', () => {
    // The occurrence cap used to count every iterated occurrence, including the
    // ones before the window. A daily event created more than 400 days ago
    // exhausted the cap on skipped history and silently vanished from today.
    const events = parseIcs(
      ics([
        'UID:old-daily',
        'SUMMARY:Long-running standup',
        // ~500 days before the query window.
        'DTSTART:20250320T090000Z',
        'DTEND:20250320T091500Z',
        'RRULE:FREQ=DAILY',
      ]),
      WINDOW,
    );
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.startsAt).toBe(AUG(1, 9));
  });

  it('terminates on a runaway rule whose occurrences never reach the window', () => {
    // Unbounded, and starting so far back that every stepped occurrence is
    // pre-window — the occurrence cap never engages, so only the iteration
    // ceiling stops this one. It must return, and return quickly.
    const started = Date.now();
    const events = parseIcs(
      ics([
        'UID:runaway-history',
        'SUMMARY:Tick',
        'DTSTART:20260401T000000Z',
        'DTEND:20260401T000100Z',
        'RRULE:FREQ=MINUTELY',
      ]),
      WINDOW,
    );
    expect(events).toEqual([]);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('honours EXDATE, so a skipped occurrence does not appear', () => {
    const events = parseIcs(
      ics([
        'UID:g',
        'SUMMARY:Standup',
        'DTSTART:20260803T090000Z',
        'DTEND:20260803T091500Z',
        'RRULE:FREQ=DAILY;COUNT=4',
        'EXDATE:20260804T090000Z',
      ]),
      WINDOW,
    );
    expect(events.map((e) => e.startsAt)).not.toContain(AUG(4, 9));
    expect(events).toHaveLength(3);
  });

  it('does not show a moved occurrence twice', () => {
    // A RECURRENCE-ID override must replace its instance, not sit beside it.
    const events = parseIcs(
      ics(
        [
          'UID:h',
          'SUMMARY:Standup',
          'DTSTART:20260803T090000Z',
          'DTEND:20260803T091500Z',
          'RRULE:FREQ=DAILY;COUNT=3',
        ],
        [
          'UID:h',
          'SUMMARY:Standup (moved)',
          'RECURRENCE-ID:20260804T090000Z',
          'DTSTART:20260804T140000Z',
          'DTEND:20260804T141500Z',
        ],
      ),
      WINDOW,
    );
    expect(events).toHaveLength(3);
    const onTheFourth = events.filter((e) => e.startsAt >= AUG(4) && e.startsAt < AUG(5));
    expect(onTheFourth).toHaveLength(1);
    expect(onTheFourth[0]?.startsAt).toBe(AUG(4, 14));
  });

  it('reads your own RSVP when it knows your address', () => {
    const body = [
      'UID:i',
      'SUMMARY:Optional sync',
      'DTSTART:20260803T090000Z',
      'DTEND:20260803T100000Z',
      'ATTENDEE;PARTSTAT=DECLINED:mailto:me@example.com',
      'ATTENDEE;PARTSTAT=ACCEPTED:mailto:someone@example.com',
    ];
    expect(parseIcs(ics(body), { ...WINDOW, selfEmail: 'me@example.com' })[0]?.attendance).toBe(
      'declined',
    );
  });

  it('does not mistake another attendee’s RSVP for yours', () => {
    const body = [
      'UID:j',
      'SUMMARY:Sync',
      'DTSTART:20260803T090000Z',
      'DTEND:20260803T100000Z',
      'ATTENDEE;PARTSTAT=DECLINED:mailto:someone@example.com',
    ];
    expect(parseIcs(ics(body), { ...WINDOW, selfEmail: 'me@example.com' })[0]?.attendance).toBe(
      'unknown',
    );
  });

  it('stays unknown when it does not know your address', () => {
    // Unknown counts as busy: showing a meeting you declined is a smaller
    // failure than hiding one you are expected at.
    const body = [
      'UID:k',
      'SUMMARY:Sync',
      'DTSTART:20260803T090000Z',
      'DTEND:20260803T100000Z',
      'ATTENDEE;PARTSTAT=DECLINED:mailto:me@example.com',
    ];
    expect(parseIcs(ics(body), WINDOW)[0]?.attendance).toBe('unknown');
  });

  it('picks up a valid conference link from the location', () => {
    const events = parseIcs(
      ics([
        'UID:l',
        'SUMMARY:Call',
        'DTSTART:20260803T090000Z',
        'DTEND:20260803T100000Z',
        'LOCATION:https://meet.google.com/abc-defg-hij',
      ]),
      WINDOW,
    );
    expect(events[0]?.conferenceUrl).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('refuses an arbitrary link in invite text', () => {
    // Invites come from other people, so this text is attacker-controlled.
    const events = parseIcs(
      ics([
        'UID:m',
        'SUMMARY:Call',
        'DTSTART:20260803T090000Z',
        'DTEND:20260803T100000Z',
        'DESCRIPTION:Agenda at https://evil.example.com/pwn',
      ]),
      WINDOW,
    );
    expect(events[0]?.conferenceUrl).toBeUndefined();
  });

  it('excludes events entirely outside the window', () => {
    const events = parseIcs(
      ics(['UID:n', 'SUMMARY:Old', 'DTSTART:20250101T090000Z', 'DTEND:20250101T100000Z']),
      WINDOW,
    );
    expect(events).toHaveLength(0);
  });

  it('includes an event straddling the window start', () => {
    const events = parseIcs(
      ics(['UID:o', 'SUMMARY:Overnight', 'DTSTART:20260731T220000Z', 'DTEND:20260801T060000Z']),
      WINDOW,
    );
    expect(events).toHaveLength(1);
  });

  it('returns an empty list for junk rather than throwing', () => {
    // A feed that cannot be read must not take the app down. The connection
    // status reports the failure instead.
    for (const junk of ['', 'not an ics', '<html>404</html>', 'BEGIN:VCALENDAR']) {
      expect(() => parseIcs(junk, WINDOW)).not.toThrow();
      expect(parseIcs(junk, WINDOW)).toEqual([]);
    }
  });

  it('keeps the rest of the calendar when one event is malformed', () => {
    const events = parseIcs(
      ics(
        ['UID:bad', 'SUMMARY:Broken'],
        ['UID:good', 'SUMMARY:Fine', 'DTSTART:20260803T090000Z', 'DTEND:20260803T100000Z'],
      ),
      WINDOW,
    );
    expect(events.map((e) => e.title)).toContain('Fine');
  });

  it('falls back to a placeholder title', () => {
    const events = parseIcs(
      ics(['UID:p', 'DTSTART:20260803T090000Z', 'DTEND:20260803T100000Z']),
      WINDOW,
    );
    expect(events[0]?.title).toBe('(no title)');
  });
});

describe('looksLikeIcsUrl', () => {
  it('accepts an https feed', () => {
    expect(
      looksLikeIcsUrl('https://calendar.google.com/calendar/ical/x/private-abc/basic.ics'),
    ).toBe(true);
  });

  it('accepts webcal, which is the same feed', () => {
    expect(looksLikeIcsUrl('webcal://example.com/feed.ics')).toBe(true);
  });

  it('rejects http, because the URL is a bearer credential', () => {
    expect(looksLikeIcsUrl('http://example.com/feed.ics')).toBe(false);
  });

  it('rejects nonsense and empty input', () => {
    expect(looksLikeIcsUrl('')).toBe(false);
    expect(looksLikeIcsUrl('   ')).toBe(false);
    expect(looksLikeIcsUrl('my calendar')).toBe(false);
    expect(looksLikeIcsUrl('file:///etc/passwd')).toBe(false);
  });

  it('does not insist on a Google-shaped path', () => {
    expect(looksLikeIcsUrl('https://outlook.office365.com/owa/calendar/x/reachcalendar.ics')).toBe(
      true,
    );
  });
});

describe('normaliseIcsUrl', () => {
  it('rewrites webcal to https', () => {
    expect(normaliseIcsUrl('webcal://example.com/f.ics')).toBe('https://example.com/f.ics');
  });

  it('trims surrounding whitespace from a paste', () => {
    expect(normaliseIcsUrl('  https://example.com/f.ics  ')).toBe('https://example.com/f.ics');
  });
});

describe('redactIcsUrl', () => {
  it('never reveals the secret token', () => {
    // The token in a secret address grants read access to the whole calendar,
    // so it must not reach a log line or the renderer.
    const secret = 'https://calendar.google.com/calendar/ical/me/private-SECRETTOKEN/basic.ics';
    const shown = redactIcsUrl(secret);
    expect(shown).not.toContain('SECRETTOKEN');
    expect(shown).not.toContain('private');
    expect(shown).toContain('calendar.google.com');
  });

  it('degrades safely on junk', () => {
    expect(redactIcsUrl('nonsense')).not.toContain('nonsense');
  });
});
