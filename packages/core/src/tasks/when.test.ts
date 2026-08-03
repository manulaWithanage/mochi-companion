import { describe, expect, it } from 'vitest';
import { describeWhen, parseWhen } from './when.js';

// Thursday 15 January 2026, 10:00 local.
const NOW = new Date(2026, 0, 15, 10, 0, 0);

const at = (parsed: { remindAt: number | null }): string =>
  parsed.remindAt === null ? 'none' : new Date(parsed.remindAt).toTimeString().slice(0, 5);

describe('parseWhen — days', () => {
  it('reads the common words', () => {
    expect(parseWhen('Call the dentist today', NOW).dueOn).toBe('2026-01-15');
    expect(parseWhen('Call the dentist tomorrow', NOW).dueOn).toBe('2026-01-16');
    expect(parseWhen('Call the dentist next week', NOW).dueOn).toBe('2026-01-22');
  });

  it('treats someday as no date rather than as today', () => {
    const parsed = parseWhen('Learn the banjo someday', NOW);
    expect(parsed.dueOn).toBeNull();
    expect(parsed.title).toBe('Learn the banjo');
  });

  it('takes the next occurrence of a weekday', () => {
    // Thursday -> Friday is tomorrow.
    expect(parseWhen('Ship it friday', NOW).dueOn).toBe('2026-01-16');
    // Thursday -> Monday is four days out.
    expect(parseWhen('Ship it monday', NOW).dueOn).toBe('2026-01-19');
  });

  it('reads "next friday" as the one after the coming friday', () => {
    expect(parseWhen('Ship it next friday', NOW).dueOn).toBe('2026-01-23');
  });

  it('skips today when the weekday is today', () => {
    // "thursday" on a Thursday means next Thursday, not this morning.
    expect(parseWhen('Ship it thursday', NOW).dueOn).toBe('2026-01-22');
  });

  it('accepts short forms', () => {
    expect(parseWhen('Ship it fri', NOW).dueOn).toBe('2026-01-16');
    expect(parseWhen('Ship it tmr', NOW).dueOn).toBe('2026-01-16');
  });
});

describe('parseWhen — times', () => {
  it('reads 12-hour and 24-hour forms', () => {
    expect(at(parseWhen('Standup tomorrow 9am', NOW))).toBe('09:00');
    expect(at(parseWhen('Standup tomorrow 3pm', NOW))).toBe('15:00');
    expect(at(parseWhen('Standup tomorrow 15:30', NOW))).toBe('15:30');
    expect(at(parseWhen('Standup tomorrow at 9:15am', NOW))).toBe('09:15');
  });

  it('handles noon and midnight correctly', () => {
    expect(at(parseWhen('Lunch tomorrow 12pm', NOW))).toBe('12:00');
    expect(at(parseWhen('Backup tomorrow 12am', NOW))).toBe('00:00');
  });

  it('rolls a bare past time to tomorrow', () => {
    // 09:00 has already gone at 10:00; the user means tomorrow morning.
    const parsed = parseWhen('Standup 9am', NOW);
    expect(parsed.dueOn).toBe('2026-01-16');
    expect(at(parsed)).toBe('09:00');
  });

  it('keeps a bare future time today', () => {
    const parsed = parseWhen('Standup 4pm', NOW);
    expect(parsed.dueOn).toBe('2026-01-15');
    expect(at(parsed)).toBe('16:00');
  });

  it('sets no reminder when only a day was given', () => {
    expect(parseWhen('Ship it tomorrow', NOW).remindAt).toBeNull();
  });
});

describe('parseWhen — relative', () => {
  it('reads "in N units"', () => {
    expect(at(parseWhen('Check the oven in 20 min', NOW))).toBe('10:20');
    expect(at(parseWhen('Check the oven in 2 hours', NOW))).toBe('12:00');
    expect(parseWhen('Review in 3 days', NOW).dueOn).toBe('2026-01-18');
  });

  it('strips the phrase from the title', () => {
    expect(parseWhen('Check the oven in 20 min', NOW).title).toBe('Check the oven');
  });
});

describe('parseWhen — restraint', () => {
  it('only matches at the end, so mid-title words survive', () => {
    // The bug this guards: eating "Tuesday" out of the middle of a title.
    const parsed = parseWhen("Prepare Tuesday's client deck", NOW);
    expect(parsed.matched).toBe('');
    expect(parsed.title).toBe("Prepare Tuesday's client deck");
  });

  it('does not treat a bare number as a time', () => {
    // "buy 2 tickets" must not become a 02:00 reminder.
    expect(parseWhen('Buy 2 tickets', NOW).matched).toBe('');
    expect(parseWhen('Read chapter 4', NOW).matched).toBe('');
  });

  it('leaves ordinary titles completely alone', () => {
    const parsed = parseWhen('Email the landlord', NOW);
    expect(parsed).toEqual({
      title: 'Email the landlord',
      dueOn: null,
      remindAt: null,
      matched: '',
    });
  });

  it('refuses to consume the entire title', () => {
    // "tomorrow" alone is not a task called "" due tomorrow.
    expect(parseWhen('tomorrow', NOW).matched).toBe('');
    expect(parseWhen('in 5 minutes', NOW).matched).toBe('');
  });

  it('rejects impossible clock readings', () => {
    expect(parseWhen('Sync at 99:99', NOW).matched).toBe('');
    expect(parseWhen('Sync at 13pm', NOW).matched).toBe('');
  });

  it('reports what it consumed so the UI can show it', () => {
    expect(parseWhen('Standup tomorrow 9am', NOW).matched).toBe('tomorrow 9am');
    expect(parseWhen('Standup tomorrow 9am', NOW).title).toBe('Standup');
  });
});

describe('describeWhen', () => {
  it('says it the way a person would', () => {
    expect(describeWhen(parseWhen('Ship it tomorrow', NOW), NOW)).toBe('tomorrow');
    expect(describeWhen(parseWhen('Ship it today', NOW), NOW)).toBe('today');
    expect(describeWhen(parseWhen('Learn banjo someday', NOW), NOW)).toBe('someday');
  });

  it('includes the clock when a time was given', () => {
    expect(describeWhen(parseWhen('Standup tomorrow 9am', NOW), NOW)).toMatch(/^tomorrow at 09:00/);
  });

  it('is empty when nothing was recognised', () => {
    expect(describeWhen(parseWhen('Email the landlord', NOW), NOW)).toBe('');
  });
});
