import { describe, expect, it } from 'vitest';
import {
  canTransition,
  DEFAULT_WORK_HOURS,
  deriveMascotState,
  isMascotState,
  isWithinWorkHours,
  parseHhMm,
  REST_AFTER_IDLE_MS,
  type MascotContext,
} from './state.js';

const at = (hh: number, mm = 0): Date => new Date(2026, 0, 15, hh, mm, 0);

const ctx = (over: Partial<MascotContext> = {}): MascotContext => ({
  timerRunning: false,
  now: at(11),
  workHours: DEFAULT_WORK_HOURS,
  userIdleMs: 0,
  ...over,
});

describe('isMascotState', () => {
  it('accepts V1 and V2 states', () => {
    expect(isMascotState('idle')).toBe(true);
    expect(isMascotState('alert')).toBe(true);
  });

  it('rejects retired names from earlier drafts', () => {
    expect(isMascotState('sleeping')).toBe(false);
    expect(isMascotState('focused')).toBe(false);
    expect(isMascotState(42)).toBe(false);
  });
});

describe('canTransition', () => {
  it('allows moving up in priority', () => {
    expect(canTransition('idle', 'working')).toBe(true);
    expect(canTransition('working', 'alert')).toBe(true);
  });

  it('blocks a lower-priority state from preempting a higher one', () => {
    expect(canTransition('alert', 'idle')).toBe(false);
    expect(canTransition('speaking', 'working')).toBe(false);
  });

  it('allows re-entering the same state', () => {
    expect(canTransition('working', 'working')).toBe(true);
  });
});

describe('parseHhMm', () => {
  it.each([
    ['09:00', 540],
    ['00:00', 0],
    ['23:59', 1439],
    ['9:30', 570],
  ])('parses %s', (input, expected) => {
    expect(parseHhMm(input)).toBe(expected);
  });

  it.each(['24:00', '12:60', 'noon', '', '9', '09:0'])('rejects %s', (input) => {
    expect(parseHhMm(input)).toBeNull();
  });
});

describe('isWithinWorkHours', () => {
  it('is true inside a normal range and false outside', () => {
    expect(isWithinWorkHours(at(11), DEFAULT_WORK_HOURS)).toBe(true);
    expect(isWithinWorkHours(at(7), DEFAULT_WORK_HOURS)).toBe(false);
    expect(isWithinWorkHours(at(21), DEFAULT_WORK_HOURS)).toBe(false);
  });

  it('includes the start minute and excludes the end minute', () => {
    expect(isWithinWorkHours(at(9, 0), DEFAULT_WORK_HOURS)).toBe(true);
    expect(isWithinWorkHours(at(17, 0), DEFAULT_WORK_HOURS)).toBe(false);
    expect(isWithinWorkHours(at(16, 59), DEFAULT_WORK_HOURS)).toBe(true);
  });

  it('handles a range spanning midnight', () => {
    const nightShift = { start: '22:00', end: '06:00' };
    expect(isWithinWorkHours(at(23), nightShift)).toBe(true);
    expect(isWithinWorkHours(at(2), nightShift)).toBe(true);
    expect(isWithinWorkHours(at(12), nightShift)).toBe(false);
  });

  it('returns false for a malformed or zero-length range', () => {
    expect(isWithinWorkHours(at(11), { start: 'lunch', end: '17:00' })).toBe(false);
    expect(isWithinWorkHours(at(11), { start: '09:00', end: '09:00' })).toBe(false);
  });
});

describe('deriveMascotState', () => {
  it('works whenever the timer runs, even at 3am', () => {
    expect(deriveMascotState(ctx({ timerRunning: true }))).toBe('working');
    expect(deriveMascotState(ctx({ timerRunning: true, now: at(3) }))).toBe('working');
  });

  it('a running timer beats a long idle period', () => {
    // The user is reading, not away. Do not demote to resting mid-session.
    const state = deriveMascotState(
      ctx({ timerRunning: true, userIdleMs: REST_AFTER_IDLE_MS * 10 }),
    );
    expect(state).toBe('working');
  });

  it('rests outside work hours', () => {
    expect(deriveMascotState(ctx({ now: at(22) }))).toBe('resting');
  });

  it('rests after the idle threshold during work hours', () => {
    expect(deriveMascotState(ctx({ userIdleMs: REST_AFTER_IDLE_MS }))).toBe('resting');
  });

  it('idles during work hours while the user is present', () => {
    expect(deriveMascotState(ctx({ userIdleMs: REST_AFTER_IDLE_MS - 1 }))).toBe('idle');
  });
});
