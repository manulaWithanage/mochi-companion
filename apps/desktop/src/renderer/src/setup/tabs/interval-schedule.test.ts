import { describe, expect, it } from 'vitest';
import {
  deriveIntervalMinutes,
  describeIntervalSchedule,
  generateIntervalTimes,
  parseMins,
} from './interval-schedule.js';

/**
 * The bug: `openEditForm` restored a routine's times, start and end, but left the
 * interval selector at its default of 30 minutes. A routine genuinely running
 * every 15 minutes opened showing "Every 30m", above a summary reading "37 times
 * every 30 minutes between 9:00 AM and 6:00 PM" — impossible, since 37 half-hour
 * steps span eighteen and a half hours.
 *
 * The display was the lesser harm. Editing the start or end regenerates the list
 * from whatever the selector says, so touching the window by one character
 * silently rewrote the routine to a cadence the user never picked.
 */

describe('generating an interval', () => {
  it('covers the window inclusively', () => {
    expect(generateIntervalTimes(30, '09:00', '11:00')).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
    ]);
  });

  it('produces 37 entries for 15 minutes across 9 to 6 — the real stored routine', () => {
    expect(generateIntervalTimes(15, '09:00', '18:00')).toHaveLength(37);
  });

  it('produces 19 for 30 minutes across the same window', () => {
    // The number the form claimed was 37. Both cannot be true of one routine.
    expect(generateIntervalTimes(30, '09:00', '18:00')).toHaveLength(19);
  });

  it('handles a window running past midnight', () => {
    const times = generateIntervalTimes(60, '23:00', '01:00');
    expect(times).toContain('23:00');
    expect(times).toContain('00:00');
    expect(times).toContain('01:00');
  });

  it('never loops forever on a zero or negative interval', () => {
    expect(generateIntervalTimes(0, '09:00', '10:00')).toHaveLength(61);
  });
});

describe('reading an interval back out', () => {
  it('recovers the interval a routine was built from', () => {
    expect(deriveIntervalMinutes(generateIntervalTimes(15, '09:00', '18:00'))).toBe(15);
    expect(deriveIntervalMinutes(generateIntervalTimes(30, '09:00', '18:00'))).toBe(30);
    expect(deriveIntervalMinutes(generateIntervalTimes(120, '09:00', '17:00'))).toBe(120);
  });

  it('returns null for times that are not evenly spaced', () => {
    // 09:00, 12:30, 17:00 was not built from an interval. Answering "every 210
    // minutes" would put a number on screen that nobody chose.
    expect(deriveIntervalMinutes(['09:00', '12:30', '17:00'])).toBeNull();
  });

  it('returns null when there is nothing to infer from', () => {
    expect(deriveIntervalMinutes([])).toBeNull();
    expect(deriveIntervalMinutes(['10:00'])).toBeNull();
  });

  it('returns null for duplicate times rather than reporting a zero interval', () => {
    expect(deriveIntervalMinutes(['10:00', '10:00'])).toBeNull();
  });

  it('does not depend on the input being sorted', () => {
    expect(deriveIntervalMinutes(['10:00', '09:00', '11:00'])).toBe(60);
  });
});

describe('describing the schedule', () => {
  it('reports the schedule that is actually stored', () => {
    const times = generateIntervalTimes(15, '09:00', '18:00');

    expect(describeIntervalSchedule(times)).toBe(
      '37 reminders a day, every 15m between 09:00 and 18:00.',
    );
  });

  it('cannot contradict itself, because it reads one source', () => {
    // The old summary took its count from the times and its interval from the
    // selector, so the two halves could describe different schedules.
    const times = generateIntervalTimes(30, '09:00', '18:00');
    const text = describeIntervalSchedule(times);

    expect(text).toContain('19 reminders');
    expect(text).toContain('every 30m');
  });

  it('uses hours where that reads better', () => {
    expect(describeIntervalSchedule(generateIntervalTimes(60, '09:00', '12:00'))).toContain(
      'every 1h',
    );
    expect(describeIntervalSchedule(generateIntervalTimes(120, '09:00', '17:00'))).toContain(
      'every 2h',
    );
  });

  it('states the count without inventing an interval when there is none', () => {
    const text = describeIntervalSchedule(['09:00', '12:30', '17:00']);

    expect(text).toContain('3 reminders');
    expect(text).not.toContain('every');
  });

  it('handles one time and none', () => {
    expect(describeIntervalSchedule(['10:00'])).toBe('Once a day, at 10:00.');
    expect(describeIntervalSchedule([])).toBe('No times set yet.');
  });
});

describe('parseMins', () => {
  it('reads HH:MM', () => {
    expect(parseMins('00:00')).toBe(0);
    expect(parseMins('09:30')).toBe(570);
    expect(parseMins('23:59')).toBe(1439);
  });

  it('returns 0 for empty rather than NaN', () => {
    expect(parseMins('')).toBe(0);
  });
});
