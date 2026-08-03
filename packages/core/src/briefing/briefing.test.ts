import { describe, expect, it } from 'vitest';
import {
  briefingPrompt,
  briefingText,
  briefingTimeToday,
  composeBriefing,
  type BriefingInput,
} from './briefing.js';
import type { CalendarEvent } from '../calendar/calendar.js';
import type { Task } from '../tasks/tasks.js';
import {
  buildDayRecords,
  describeImpact,
  meetingImpact,
  summarise,
  HEAVY_MEETING_DAY,
} from '../calendar/retrospective.js';
import type { WorkSession } from '../timer/session.js';

const DAY = new Date('2026-08-03T08:00:00');
const WORK = { start: '09:00', end: '17:00' };

const at = (hour: number, minute = 0, dayOffset = 0): number => {
  const d = new Date(DAY);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
};

const ev = (
  id: string,
  fromHour: number,
  hours: number,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id,
  title: id,
  startsAt: at(fromHour),
  endsAt: at(fromHour) + hours * 3_600_000,
  allDay: false,
  cancelled: false,
  attendance: 'accepted',
  ...extra,
});

const task = (id: string, dueOn: string | null, doneAt: number | null = null): Task => ({
  id,
  title: id,
  projectId: null,
  dueOn,
  doneAt,
  createdAt: at(8),
  priority: 0,
});

const base = (over: Partial<BriefingInput> = {}): BriefingInput => ({
  events: [],
  tasks: [],
  workHours: WORK,
  now: DAY,
  hasCalendar: true,
  ...over,
});

// ---------------------------------------------------------------------------

describe('composeBriefing', () => {
  it('leads with the first meeting', () => {
    const b = composeBriefing(base({ events: [ev('Design review', 10, 1)] }));
    expect(b.headline).toContain('Design review');
    expect(b.headline).toContain('10am');
  });

  it('counts meetings rather than listing them all', () => {
    const b = composeBriefing(
      base({ events: [ev('Standup', 10, 0.5), ev('Review', 13, 1), ev('1:1', 15, 0.5)] }),
    );
    expect(b.lines.some((l) => l.text.includes('3 meetings'))).toBe(true);
  });

  it('says nothing about meetings when no calendar is connected', () => {
    // Reporting "no meetings today" would be a claim it cannot support, and it
    // reads as reassuring right up until the user misses something.
    const b = composeBriefing(base({ hasCalendar: false, events: [ev('Ghost', 10, 1)] }));
    expect(b.lines.some((l) => l.kind === 'meetings')).toBe(false);
    expect(b.lines.some((l) => l.text.toLowerCase().includes('meeting'))).toBe(false);
  });

  it('raises a double-booking above the meeting list', () => {
    // The one thing that has to be resolved before the day starts.
    const b = composeBriefing(base({ events: [ev('Review', 10, 2), ev('Interview', 11, 1)] }));
    expect(b.lines[0]?.kind).toBe('conflict');
    expect(b.headline).toContain('overlap');
  });

  it('reports the longest clear stretch with when it starts', () => {
    const b = composeBriefing(base({ events: [ev('Standup', 9, 0.5)] }));
    const focus = b.lines.find((l) => l.kind === 'focus');
    expect(focus?.text).toMatch(/longest clear stretch/i);
    expect(focus?.text).toContain('from');
  });

  it('says the day is clear when nothing is booked', () => {
    const b = composeBriefing(base());
    expect(b.lines.some((l) => l.text.includes('day is yours'))).toBe(true);
  });

  it('warns when no stretch is long enough for real work', () => {
    const packed = [ev('a', 9, 1), ev('b', 10, 1), ev('c', 11, 5), ev('d', 16, 1)];
    const b = composeBriefing(base({ events: packed }));
    expect(b.lines.some((l) => l.text.includes('No clear stretch'))).toBe(true);
  });

  it('mentions carried-over tasks ahead of today’s', () => {
    const b = composeBriefing(
      base({ tasks: [task('old', '2026-08-01'), task('new', '2026-08-03')] }),
    );
    const line = b.lines.find((l) => l.kind === 'tasks');
    expect(line?.text).toContain('carried over');
  });

  it('counts today’s tasks when nothing is overdue', () => {
    const b = composeBriefing(base({ tasks: [task('a', '2026-08-03'), task('b', '2026-08-03')] }));
    expect(b.lines.find((l) => l.kind === 'tasks')?.text).toContain('2 tasks');
  });

  it('ignores finished tasks', () => {
    const b = composeBriefing(base({ tasks: [task('done', '2026-08-03', at(9))] }));
    expect(b.openTasks).toBe(0);
  });

  it('has something to say even on an empty day', () => {
    const b = composeBriefing(base());
    expect(b.quiet).toBe(false);
    expect(b.headline.length).toBeGreaterThan(0);
  });

  it('reports a genuinely empty day as quiet', () => {
    const b = composeBriefing(base({ hasCalendar: false }));
    expect(b.quiet).toBe(true);
  });

  it('excludes declined and cancelled meetings from the count', () => {
    const b = composeBriefing(
      base({
        events: [
          ev('Nope', 10, 1, { attendance: 'declined' }),
          ev('Gone', 11, 1, { cancelled: true }),
        ],
      }),
    );
    expect(b.meetingCount).toBe(0);
  });

  it('does not count meetings that already finished as upcoming', () => {
    const later = new Date(DAY);
    later.setHours(16, 0, 0, 0);
    const b = composeBriefing(base({ events: [ev('Morning sync', 10, 1)], now: later }));
    expect(b.firstMeetingAt).toBeNull();
  });
});

describe('briefingText', () => {
  it('keeps it to two facts, because a bubble is not a report', () => {
    const b = composeBriefing(
      base({
        events: [ev('Review', 10, 2), ev('Interview', 11, 1)],
        tasks: [task('old', '2026-08-01')],
      }),
    );
    expect(
      briefingText(b)
        .split('.')
        .filter((s) => s.trim().length > 0),
    ).toHaveLength(2);
  });

  it('works with no model configured', () => {
    // The briefing is the first thing a new user sees it do; it must not need
    // an API key.
    expect(briefingText(composeBriefing(base())).length).toBeGreaterThan(0);
  });
});

describe('briefingPrompt', () => {
  it('hands over computed facts and forbids adding any', () => {
    const prompt = briefingPrompt(composeBriefing(base({ events: [ev('Standup', 10, 0.5)] })));
    expect(prompt).toContain('Standup');
    expect(prompt).toMatch(/do not add any fact/i);
    expect(prompt).toMatch(/do not invent/i);
  });

  it('includes the user’s name when there is one', () => {
    expect(briefingPrompt(composeBriefing(base()), 'Manula')).toContain('Manula');
  });
});

describe('briefingTimeToday', () => {
  it('fires at the start of the working day', () => {
    const early = new Date(DAY);
    early.setHours(7, 0, 0, 0);
    expect(briefingTimeToday(early, WORK)).toBe(at(9));
  });

  it('returns null once the moment has passed', () => {
    // A "morning" briefing at 3pm is worse than none.
    const late = new Date(DAY);
    late.setHours(15, 0, 0, 0);
    expect(briefingTimeToday(late, WORK)).toBeNull();
  });

  it('follows the user’s hours rather than a fixed clock time', () => {
    const early = new Date(DAY);
    early.setHours(5, 0, 0, 0);
    expect(briefingTimeToday(early, { start: '06:00', end: '14:00' })).toBe(at(6));
  });
});

// ---------------------------------------------------------------------------

describe('buildDayRecords', () => {
  const session = (dayOffset: number, minutes: number): WorkSession => ({
    id: `s${dayOffset}-${minutes}`,
    projectId: 'p',
    startedAt: at(10, 0, dayOffset),
    endedAt: at(10, 0, dayOffset) + minutes * 60_000,
  });

  it('produces one row per day, oldest first', () => {
    const records = buildDayRecords({
      sessions: [],
      events: [],
      workHours: WORK,
      endingOn: DAY,
      days: 7,
    });
    expect(records).toHaveLength(7);
    expect(records[0]!.at).toBeLessThan(records[6]!.at);
  });

  it('keeps empty days in the series', () => {
    // A chart that drops them silently compresses a fortnight off into nothing.
    const records = buildDayRecords({
      sessions: [session(0, 60)],
      events: [],
      workHours: WORK,
      endingOn: DAY,
      days: 5,
    });
    expect(records).toHaveLength(5);
    expect(records.filter((r) => r.active)).toHaveLength(1);
  });

  it('credits tracked time to the day the session started', () => {
    const records = buildDayRecords({
      sessions: [session(0, 90)],
      events: [],
      workHours: WORK,
      endingOn: DAY,
      days: 3,
    });
    expect(records[2]!.trackedMs).toBe(90 * 60_000);
  });

  it('ignores sessions still running', () => {
    const open: WorkSession = { id: 'x', projectId: 'p', startedAt: at(10), endedAt: null };
    const records = buildDayRecords({
      sessions: [open],
      events: [],
      workHours: WORK,
      endingOn: DAY,
      days: 1,
    });
    expect(records[0]!.trackedMs).toBe(0);
  });
});

describe('meetingImpact', () => {
  const day = (offset: number, meetings: number, trackedMinutes: number) => ({
    day: `d${offset}`,
    at: at(0, 0, -offset),
    trackedMs: trackedMinutes * 60_000,
    meetingMs: meetings * 3_600_000,
    meetingCount: meetings,
    longestFreeMs: 0,
    fragmented: false,
    active: true,
  });

  it('refuses to compare when either group is too small', () => {
    // A comparison drawn from two days is a coincidence with a number on it.
    const records = [day(1, 0, 200), day(2, 0, 210), day(3, 0, 190), day(4, 5, 60)];
    expect(meetingImpact(records)).toBeNull();
  });

  it('compares light and heavy days once there is enough data', () => {
    const records = [
      day(1, 0, 240),
      day(2, 1, 230),
      day(3, 0, 250),
      day(4, 4, 90),
      day(5, 5, 80),
      day(6, 3, 100),
    ];
    const impact = meetingImpact(records)!;
    expect(impact.lightDays).toBe(3);
    expect(impact.heavyDays).toBe(3);
    expect(impact.differenceMs).toBeLessThan(0);
  });

  it('uses medians, so one outlier cannot decide it', () => {
    const records = [
      day(1, 0, 100),
      day(2, 0, 100),
      day(3, 0, 1000),
      day(4, 4, 100),
      day(5, 4, 100),
      day(6, 4, 100),
    ];
    expect(meetingImpact(records)!.lightDayMs).toBe(100 * 60_000);
  });

  it('ignores inactive days', () => {
    const records = [
      day(1, 0, 240),
      day(2, 0, 230),
      day(3, 0, 250),
      { ...day(4, 0, 0), active: false },
      day(5, 4, 90),
      day(6, 5, 80),
      day(7, 3, 100),
    ];
    expect(meetingImpact(records)!.lightDays).toBe(3);
  });
});

describe('describeImpact', () => {
  const impact = (lightMin: number, heavyMin: number) => ({
    lightDayMs: lightMin * 60_000,
    heavyDayMs: heavyMin * 60_000,
    lightDays: 5,
    heavyDays: 5,
    differenceMs: (heavyMin - lightMin) * 60_000,
  });

  it('stays silent when the difference is inside the noise', () => {
    // Under half an hour is within how reliably people remember to start a timer.
    expect(describeImpact(impact(200, 185))).toBeNull();
  });

  it('describes a real difference without claiming a cause', () => {
    const text = describeImpact(impact(240, 90))!;
    expect(text).toContain('150 min less');
    expect(text).toContain(String(HEAVY_MEETING_DAY));
    // Observation, not explanation.
    expect(text.toLowerCase()).not.toMatch(/because|caused|destroy/);
  });

  it('reports the sample it is based on', () => {
    expect(describeImpact(impact(240, 90))).toContain('5 busy days');
  });

  it('handles the other direction', () => {
    expect(describeImpact(impact(90, 240))).toContain('more');
  });

  it('is null when there is no comparison', () => {
    expect(describeImpact(null)).toBeNull();
  });
});

describe('summarise', () => {
  it('averages over active days, so time off does not read as a slump', () => {
    const records = buildDayRecords({
      sessions: [
        { id: 'a', projectId: 'p', startedAt: at(10, 0, 0), endedAt: at(12, 0, 0) },
        { id: 'b', projectId: 'p', startedAt: at(10, 0, -1), endedAt: at(12, 0, -1) },
      ],
      events: [],
      workHours: WORK,
      endingOn: DAY,
      days: 30,
    });
    const summary = summarise(records);
    expect(summary.activeDays).toBe(2);
    expect(summary.avgTrackedMs).toBe(2 * 3_600_000);
  });

  it('reports nulls rather than zeroes when there is nothing', () => {
    const summary = summarise(
      buildDayRecords({ sessions: [], events: [], workHours: WORK, endingOn: DAY, days: 10 }),
    );
    expect(summary.bestDay).toBeNull();
    expect(summary.busiestDay).toBeNull();
    expect(summary.impact).toBeNull();
  });
});
