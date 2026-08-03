import { describe, expect, it } from 'vitest';
import {
  CALENDAR_SUBJECT_PREFIX,
  clockLabel,
  conflicts,
  dayShape,
  describeLead,
  eventsOnDay,
  extractConferenceUrl,
  freeBlocks,
  inProgress,
  isBusy,
  mergeBusy,
  MIN_FREE_BLOCK_MS,
  nextEvent,
  planMeetingAlerts,
  sortByStart,
  upcoming,
  workWindow,
  type CalendarEvent,
} from './calendar.js';

const DAY = new Date('2026-08-03T00:00:00');

/** An event on the reference day, from `fromHour` for `hours`. */
const ev = (
  id: string,
  fromHour: number,
  hours: number,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => {
  const start = new Date(DAY);
  start.setHours(fromHour, 0, 0, 0);
  return {
    id,
    title: id,
    startsAt: start.getTime(),
    endsAt: start.getTime() + hours * 3_600_000,
    allDay: false,
    cancelled: false,
    attendance: 'accepted',
    ...extra,
  };
};

const at = (hour: number, minute = 0, second = 0): number => {
  const d = new Date(DAY);
  d.setHours(hour, minute, second, 0);
  return d.getTime();
};

const WORK = { start: '09:00', end: '17:00' };

// ---------------------------------------------------------------------------

describe('isBusy', () => {
  it('counts an ordinary accepted meeting', () => {
    expect(isBusy(ev('standup', 10, 0.5))).toBe(true);
  });

  it('ignores a meeting you declined', () => {
    // It still arrives in the feed. Counting it tells someone their day is full
    // of meetings they already said no to.
    expect(isBusy(ev('optional', 10, 1, { attendance: 'declined' }))).toBe(false);
  });

  it('ignores a cancelled meeting', () => {
    expect(isBusy(ev('scrapped', 10, 1, { cancelled: true }))).toBe(false);
  });

  it('ignores all-day entries', () => {
    // The classic bug: treating a birthday as a 24-hour meeting makes every day
    // look fully booked and leaves no free block anywhere.
    expect(isBusy(ev('birthday', 0, 24, { allDay: true }))).toBe(false);
  });

  it('ignores a zero-length event', () => {
    expect(isBusy(ev('marker', 10, 0))).toBe(false);
  });

  it('still counts a tentative meeting', () => {
    // "Maybe" occupies the slot until it does not.
    expect(isBusy(ev('maybe', 10, 1, { attendance: 'tentative' }))).toBe(true);
  });
});

describe('upcoming / inProgress / nextEvent', () => {
  const events = [ev('now', 10, 1), ev('later', 14, 1), ev('early', 8, 1)];

  it('excludes what is already running', () => {
    // "Coming up" means something the user has not been interrupted by yet.
    expect(upcoming(events, at(10, 30)).map((e) => e.id)).toEqual(['later']);
  });

  it('reports what is running separately', () => {
    expect(inProgress(events, at(10, 30)).map((e) => e.id)).toEqual(['now']);
  });

  it('orders by start time', () => {
    expect(upcoming(events, at(7)).map((e) => e.id)).toEqual(['early', 'now', 'later']);
  });

  it('honours the horizon', () => {
    expect(upcoming(events, at(7), 2 * 3_600_000).map((e) => e.id)).toEqual(['early']);
  });

  it('returns null when nothing is left', () => {
    expect(nextEvent(events, at(20))).toBeNull();
  });
});

describe('eventsOnDay', () => {
  it('includes an all-day entry, unlike the busy calculation', () => {
    // Excluded from occupied time, but a briefing should still mention it.
    const events = [ev('pto', 0, 24, { allDay: true }), ev('standup', 10, 0.5)];
    expect(eventsOnDay(events, DAY).map((e) => e.id)).toEqual(['pto', 'standup']);
  });

  it('includes a meeting that began yesterday and runs into today', () => {
    const overnight: CalendarEvent = { ...ev('oncall', 0, 3), startsAt: at(0) - 2 * 3_600_000 };
    expect(eventsOnDay([overnight], DAY).map((e) => e.id)).toEqual(['oncall']);
  });

  it('excludes cancelled entries', () => {
    expect(eventsOnDay([ev('scrapped', 10, 1, { cancelled: true })], DAY)).toHaveLength(0);
  });
});

describe('mergeBusy', () => {
  it('merges overlapping meetings', () => {
    // Double-booking is normal. Without merging, two overlapping meetings leave
    // a phantom gap between their start times and the user is told they have
    // time they do not have.
    const merged = mergeBusy([ev('a', 10, 2), ev('b', 11, 2)]);
    expect(merged).toEqual([{ start: at(10), end: at(13) }]);
  });

  it('merges back-to-back meetings into one block', () => {
    expect(mergeBusy([ev('a', 10, 1), ev('b', 11, 1)])).toEqual([{ start: at(10), end: at(12) }]);
  });

  it('keeps separated meetings apart', () => {
    expect(mergeBusy([ev('a', 10, 1), ev('b', 14, 1)])).toHaveLength(2);
  });

  it('handles a meeting fully inside another', () => {
    expect(mergeBusy([ev('long', 9, 4), ev('short', 10, 1)])).toEqual([
      { start: at(9), end: at(13) },
    ]);
  });
});

describe('workWindow', () => {
  it('builds the window from HH:MM work hours', () => {
    expect(workWindow(DAY, WORK)).toEqual({ start: at(9), end: at(17) });
  });

  it('carries an overnight shift into the next day', () => {
    const window = workWindow(DAY, { start: '22:00', end: '06:00' })!;
    expect(window.end).toBeGreaterThan(window.start);
    expect(window.end - window.start).toBe(8 * 3_600_000);
  });

  it('returns null for malformed hours rather than a broken window', () => {
    expect(workWindow(DAY, { start: 'lunchtime', end: '17:00' })).toBeNull();
  });
});

describe('freeBlocks', () => {
  const window = { start: at(9), end: at(17) };

  it('finds the gaps around meetings', () => {
    const blocks = freeBlocks([ev('a', 10, 1), ev('b', 14, 1)], window);
    expect(blocks).toEqual([
      { start: at(9), end: at(10) },
      { start: at(11), end: at(14) },
      { start: at(15), end: at(17) },
    ]);
  });

  it('drops gaps too short to use', () => {
    // A 10-minute hole between meetings is not focus time.
    const blocks = freeBlocks(
      [ev('a', 10, 1), { ...ev('b', 11, 1), startsAt: at(11, 10) }],
      window,
    );
    expect(blocks.some((b) => b.end - b.start < MIN_FREE_BLOCK_MS)).toBe(false);
  });

  it('does not offer time that has already passed', () => {
    // A briefing at 2pm must not suggest a block that ended at 10.
    const blocks = freeBlocks([ev('a', 10, 1)], window, { notBefore: at(14) });
    expect(blocks).toEqual([{ start: at(14), end: at(17) }]);
  });

  it('returns the whole window when nothing is booked', () => {
    expect(freeBlocks([], window)).toEqual([{ start: at(9), end: at(17) }]);
  });

  it('returns nothing when the window is fully booked', () => {
    expect(freeBlocks([ev('all', 9, 8)], window)).toEqual([]);
  });

  it('ignores meetings outside the working window', () => {
    expect(freeBlocks([ev('evening', 19, 1)], window)).toEqual([{ start: at(9), end: at(17) }]);
  });

  it('is empty once the window has ended', () => {
    expect(freeBlocks([], window, { notBefore: at(18) })).toEqual([]);
  });
});

describe('dayShape', () => {
  const window = { start: at(9), end: at(17) };

  it('reports an empty day as unfragmented', () => {
    const shape = dayShape([], window);
    expect(shape.meetingCount).toBe(0);
    expect(shape.occupancy).toBe(0);
    expect(shape.fragmented).toBe(false);
    expect(shape.longestFreeMs).toBe(8 * 3_600_000);
  });

  it('does not count meeting time twice when meetings overlap', () => {
    const shape = dayShape([ev('a', 10, 2), ev('b', 11, 2)], window);
    expect(shape.meetingMs).toBe(3 * 3_600_000);
  });

  it('separates having meetings from being fragmented', () => {
    // Same total meeting time, very different days. This distinction is the
    // whole reason the metric exists.
    const oneBlock = dayShape([ev('workshop', 9, 4)], window);
    const scattered = dayShape(
      [ev('a', 9, 1), ev('b', 11, 1), ev('c', 13, 1), ev('d', 15, 1)],
      window,
    );
    expect(oneBlock.meetingMs).toBe(scattered.meetingMs);
    expect(oneBlock.fragmented).toBe(false);
    expect(oneBlock.longestFreeMs).toBeGreaterThan(scattered.longestFreeMs);
  });

  it('marks a day with no usable gap as fragmented', () => {
    const events = [
      ev('a', 9, 1),
      { ...ev('b', 10, 1), startsAt: at(10, 10), endsAt: at(11, 10) },
      { ...ev('c', 11, 1), startsAt: at(11, 20), endsAt: at(17) },
    ];
    expect(dayShape(events, window).fragmented).toBe(true);
  });

  it('caps occupancy at 1 when meetings overrun the window', () => {
    expect(dayShape([ev('marathon', 6, 14)], window).occupancy).toBeLessThanOrEqual(1);
  });
});

describe('conflicts', () => {
  it('finds a double-booking', () => {
    const found = conflicts([ev('a', 10, 2), ev('b', 11, 1)]);
    expect(found).toHaveLength(1);
    expect(found[0]!.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('does not flag back-to-back meetings', () => {
    expect(conflicts([ev('a', 10, 1), ev('b', 11, 1)])).toHaveLength(0);
  });

  it('ignores a declined meeting that would otherwise clash', () => {
    expect(conflicts([ev('a', 10, 2), ev('b', 11, 1, { attendance: 'declined' })])).toHaveLength(0);
  });
});

describe('extractConferenceUrl', () => {
  it('finds a Google Meet link', () => {
    expect(extractConferenceUrl('https://meet.google.com/abc-defg-hij')).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
  });

  it('finds Zoom and Teams links', () => {
    expect(extractConferenceUrl('join https://acme.zoom.us/j/123')).toContain('zoom.us');
    expect(extractConferenceUrl('https://teams.microsoft.com/l/meetup-join/x')).toContain(
      'teams.microsoft.com',
    );
  });

  it('rejects an arbitrary link from invite text', () => {
    // The security boundary: anyone can send an invite, so this text is
    // attacker-controlled. A one-click join that opened whatever it found would
    // be a click-to-open primitive driven by strangers.
    expect(extractConferenceUrl('Agenda: https://evil.example.com/pwn')).toBeNull();
  });

  it('rejects a lookalike host', () => {
    expect(extractConferenceUrl('https://meet.google.com.evil.example/x')).toBeNull();
    expect(extractConferenceUrl('https://notzoom.us/j/1')).toBeNull();
  });

  it('rejects non-https', () => {
    expect(extractConferenceUrl('http://meet.google.com/abc')).toBeNull();
  });

  it('strips trailing prose punctuation', () => {
    expect(extractConferenceUrl('Join at https://meet.google.com/abc-defg-hij.')).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
  });

  it('searches several fields and returns the first valid one', () => {
    expect(extractConferenceUrl(undefined, 'no link here', 'https://whereby.com/team')).toBe(
      'https://whereby.com/team',
    );
  });

  it('returns null rather than guessing', () => {
    // Offering the wrong link is worse than none: the user finds out during
    // the meeting they missed.
    expect(extractConferenceUrl('Room 4B, second floor')).toBeNull();
    expect(extractConferenceUrl(undefined)).toBeNull();
  });
});

describe('planMeetingAlerts', () => {
  it('schedules one alert five minutes before', () => {
    const alerts = planMeetingAlerts([ev('standup', 10, 0.5)], at(9));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.at).toBe(at(9, 55));
    expect(alerts[0]!.text).toContain('in 5 min');
  });

  it('keys the governor subject to the meeting, not to calendars generally', () => {
    // Dismissing one reminder must not silence every future meeting.
    const alerts = planMeetingAlerts([ev('standup', 10, 0.5), ev('review', 14, 1)], at(9));
    expect(new Set(alerts.map((a) => a.subject)).size).toBe(2);
    expect(alerts[0]!.subject.startsWith(CALENDAR_SUBJECT_PREFIX)).toBe(true);
  });

  it('does not fire for a meeting that already started', () => {
    // The scheduler replays missed items after a laptop wakes; without this the
    // user is told about meetings that finished while the lid was shut.
    expect(planMeetingAlerts([ev('standup', 10, 1)], at(10, 30))).toHaveLength(0);
  });

  it('skips a reminder too close to be actionable', () => {
    // 30 seconds' notice cannot be acted on, and it still costs an interruption
    // from the governor's hourly budget.
    expect(planMeetingAlerts([ev('standup', 10, 1)], at(9, 59, 30))).toHaveLength(0);
  });

  it('still fires at exactly the minimum notice', () => {
    // The boundary is inclusive: "at least a minute" means a minute counts.
    expect(planMeetingAlerts([ev('standup', 10, 1)], at(9, 59, 0))).toHaveLength(1);
  });

  it('fires immediately when the lead time has already passed but notice remains', () => {
    const alerts = planMeetingAlerts([ev('standup', 10, 1)], at(9, 58));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.at).toBe(at(9, 58));
    expect(alerts[0]!.text).toContain('2 min');
  });

  it('ignores declined and cancelled meetings', () => {
    const events = [
      ev('nope', 10, 1, { attendance: 'declined' }),
      ev('gone', 11, 1, { cancelled: true }),
    ];
    expect(planMeetingAlerts(events, at(9))).toHaveLength(0);
  });

  it('ignores markers too short to be meetings', () => {
    expect(planMeetingAlerts([ev('blip', 10, 1 / 60)], at(9))).toHaveLength(0);
  });
});

describe('describeLead / clockLabel', () => {
  it('reads as a human would say it', () => {
    expect(describeLead(30_000)).toBe('now');
    expect(describeLead(5 * 60_000)).toBe('in 5 min');
    expect(describeLead(60 * 60_000)).toBe('in 1 hour');
    expect(describeLead(120 * 60_000)).toBe('in 2 hours');
  });

  it('formats a compact clock time', () => {
    expect(clockLabel(at(14))).toBe('2pm');
    expect(clockLabel(at(14, 30))).toBe('2:30pm');
    expect(clockLabel(at(9))).toBe('9am');
    expect(clockLabel(at(12))).toBe('12pm');
    expect(clockLabel(at(0))).toBe('12am');
  });
});

describe('sortByStart', () => {
  it('does not mutate its input', () => {
    const events = [ev('b', 14, 1), ev('a', 9, 1)];
    const before = events.map((e) => e.id);
    sortByStart(events);
    expect(events.map((e) => e.id)).toEqual(before);
  });
});
