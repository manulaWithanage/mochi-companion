import { describe, expect, it } from 'vitest';
import {
  BRIEF_SESSION_MS,
  BUBBLE_TTL_LONG_MS,
  BUBBLE_TTL_MS,
  composeMessage,
  timeOfDay,
  ttlFor,
} from './messages.js';

const at = (h: number): Date => new Date(2026, 0, 15, h, 0, 0);
const ctx = (over: Partial<Parameters<typeof composeMessage>[1]> = {}) => ({
  assistantName: 'Mochi',
  now: at(10),
  random: () => 0, // always first option, so assertions are stable
  ...over,
});

describe('timeOfDay', () => {
  it.each([
    [3, 'night'],
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [21, 'evening'],
    [22, 'night'],
  ] as const)('%i:00 is %s', (hour, expected) => {
    expect(timeOfDay(at(hour))).toBe(expected);
  });
});

describe('composeMessage', () => {
  it('uses the custom assistant name in the welcome', () => {
    expect(composeMessage('welcome', ctx({ assistantName: 'Navi' }))).toContain('Navi');
  });

  it('greets according to the hour', () => {
    expect(composeMessage('greeting', ctx({ now: at(9) }))).toBe('Good morning!');
    expect(composeMessage('greeting', ctx({ now: at(14) }))).toBe('Afternoon!');
    expect(composeMessage('greeting', ctx({ now: at(19) }))).toBe('Evening!');
    expect(composeMessage('greeting', ctx({ now: at(23) }))).toBe('Still up?');
  });

  it('includes the formatted duration when a session stops', () => {
    const msg = composeMessage('timer-stopped', ctx({ durationMs: 25 * 60_000 + 3000 }));
    expect(msg).toContain('25m 03s');
  });

  it('does not congratulate a misclick', () => {
    expect(composeMessage('timer-stopped-brief', ctx())).toBe('Stopped.');
  });

  it('handles a missing duration without producing NaN', () => {
    const msg = composeMessage('timer-stopped', ctx());
    expect(msg).toContain('00s');
    expect(msg).not.toContain('NaN');
  });

  it('never returns an empty string for any kind', () => {
    const kinds = [
      'welcome',
      'greeting',
      'timer-started',
      'timer-stopped',
      'timer-stopped-brief',
    ] as const;
    for (const kind of kinds) {
      expect(composeMessage(kind, ctx({ durationMs: 1000 })).length).toBeGreaterThan(0);
    }
  });

  it('varies phrasing across the random range', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      seen.add(composeMessage('timer-started', ctx({ random: () => i / 10 })));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('clamps an out-of-range random without throwing', () => {
    expect(composeMessage('timer-started', ctx({ random: () => 1 }))).toBeTruthy();
    expect(composeMessage('timer-started', ctx({ random: () => -1 }))).toBeTruthy();
  });
});

describe('ttlFor', () => {
  it('gives duration and welcome messages longer on screen', () => {
    expect(ttlFor('timer-stopped')).toBe(BUBBLE_TTL_LONG_MS);
    expect(ttlFor('welcome')).toBe(BUBBLE_TTL_LONG_MS);
    expect(ttlFor('greeting')).toBe(BUBBLE_TTL_MS);
  });
});

describe('BRIEF_SESSION_MS', () => {
  it('is short enough to only catch misclicks', () => {
    expect(BRIEF_SESSION_MS).toBeLessThanOrEqual(15_000);
  });
});
