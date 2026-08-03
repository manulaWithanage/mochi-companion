import { describe, expect, it } from 'vitest';
import {
  describeNext,
  nextOccurrence,
  routineTimes,
  runsOnDay,
  sortByNext,
  type UserRoutine,
} from './user-routines.js';

// A Monday.
const MON_10AM = new Date('2026-08-03T10:00:00');

const routine = (over: Partial<UserRoutine> = {}): UserRoutine => ({
  id: 'r',
  title: 'Water',
  time: '11:00',
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  category: 'health',
  enabled: true,
  mochiReminder: true,
  createdAt: 0,
  ...over,
});

const hhmm = (at: number | null): string =>
  at === null ? 'null' : new Date(at).toTimeString().slice(0, 5);

describe('routineTimes', () => {
  it('prefers the times array', () => {
    expect(routineTimes(routine({ times: ['09:00', '15:00'] }))).toEqual(['09:00', '15:00']);
  });

  it('falls back to the legacy single time', () => {
    expect(routineTimes(routine({ time: '11:00' }))).toEqual(['11:00']);
  });

  it('sorts, so "next" means next rather than first-entered', () => {
    expect(routineTimes(routine({ times: ['15:00', '09:00'] }))).toEqual(['09:00', '15:00']);
  });

  it('drops malformed entries a form can produce', () => {
    expect(routineTimes(routine({ times: ['09:00', 'later', ''] }))).toEqual(['09:00']);
  });
});

describe('nextOccurrence', () => {
  it('finds a later time today before the same weekday next week', () => {
    // The reason the search runs eight days rather than seven.
    expect(hhmm(nextOccurrence(routine({ times: ['15:00'] }), MON_10AM))).toBe('15:00');
  });

  it('rolls to the next scheduled day once today has passed', () => {
    const next = nextOccurrence(routine({ times: ['09:00'] }), MON_10AM);
    expect(new Date(next!).getDay()).toBe(2);
  });

  it('skips days it is not scheduled on', () => {
    const next = nextOccurrence(routine({ days: ['fri'], times: ['09:00'] }), MON_10AM);
    expect(new Date(next!).getDay()).toBe(5);
  });

  it('is null when disabled', () => {
    // Otherwise a paused routine reads as "next up in 6 days".
    expect(nextOccurrence(routine({ enabled: false }), MON_10AM)).toBeNull();
  });

  it('is null with no days selected', () => {
    expect(nextOccurrence(routine({ days: [] }), MON_10AM)).toBeNull();
  });

  it('is null when every time is malformed', () => {
    expect(nextOccurrence(routine({ time: 'noon', times: [] }), MON_10AM)).toBeNull();
  });

  it('picks the earliest upcoming of several times', () => {
    const next = routine({ times: ['08:00', '11:00', '16:00'] });
    expect(hhmm(nextOccurrence(next, MON_10AM))).toBe('11:00');
  });
});

describe('runsOnDay', () => {
  it('knows which weekdays it covers', () => {
    expect(runsOnDay(routine(), MON_10AM)).toBe(true);
    expect(runsOnDay(routine({ days: ['sat', 'sun'] }), MON_10AM)).toBe(false);
  });
});

describe('sortByNext', () => {
  it('orders by when the day will reach them', () => {
    const list = [
      routine({ id: 'late', times: ['16:00'] }),
      routine({ id: 'soon', times: ['11:00'] }),
      routine({ id: 'mid', times: ['14:00'] }),
    ];
    expect(sortByNext(list, MON_10AM).map((r) => r.id)).toEqual(['soon', 'mid', 'late']);
  });

  it('sinks disabled routines rather than hiding them', () => {
    // Hiding them makes the toggle feel like a delete.
    const list = [routine({ id: 'off', enabled: false }), routine({ id: 'on', times: ['16:00'] })];
    expect(sortByNext(list, MON_10AM).map((r) => r.id)).toEqual(['on', 'off']);
  });

  it('does not mutate its input', () => {
    const list = [routine({ id: 'b', times: ['16:00'] }), routine({ id: 'a', times: ['11:00'] })];
    sortByNext(list, MON_10AM);
    expect(list.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('describeNext', () => {
  it('reads the way a person would say it', () => {
    const at = (h: number, m = 0, dayOffset = 0): number => {
      const d = new Date(MON_10AM);
      d.setDate(d.getDate() + dayOffset);
      d.setHours(h, m, 0, 0);
      return d.getTime();
    };
    expect(describeNext(at(10, 20), MON_10AM)).toBe('in 20 min');
    expect(describeNext(at(13), MON_10AM)).toBe('in 3 hours');
    expect(describeNext(at(9, 0, 1), MON_10AM)).toBe('tomorrow');
    expect(describeNext(at(9, 0, 4), MON_10AM)).toBe('Friday');
  });

  it('says paused rather than inventing a time', () => {
    expect(describeNext(null, MON_10AM)).toBe('paused');
  });
});
