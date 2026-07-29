import { describe, expect, it } from 'vitest';
import {
  planTaskNudge,
  taskNudgeText,
  DEFAULT_ROUTINES,
  planDailyRoutines,
  planLongSession,
  ROUTINE_PREFIX,
  type RoutineConfig,
} from './routines.js';

const MIN = 60_000;
const at = (h: number, m = 0): Date => new Date(2026, 0, 15, h, m, 0);
const HOURS = { start: '09:00', end: '17:00' };

const cfg = (over: Partial<RoutineConfig> = {}): RoutineConfig => ({
  ...DEFAULT_ROUTINES,
  ...over,
});

const plan = (now: Date, over: Partial<RoutineConfig> = {}) =>
  planDailyRoutines({ now, workHours: HOURS, config: cfg(over), random: () => 0 });

const kinds = (items: readonly { event: { kind: string } }[]) => items.map((i) => i.event.kind);

describe('planDailyRoutines', () => {
  it('plans the whole day when asked before work starts', () => {
    const items = plan(at(7));
    expect(kinds(items)).toContain('day-start');
    expect(kinds(items)).toContain('day-end');
    expect(kinds(items).filter((k) => k === 'break').length).toBeGreaterThan(0);
  });

  it('omits moments that have already passed', () => {
    // Asked at 16:00, the morning greeting is long gone.
    const items = plan(at(16));
    expect(kinds(items)).not.toContain('day-start');
    expect(kinds(items)).toContain('day-end');
  });

  it('returns nothing after the working day is over', () => {
    expect(plan(at(23))).toHaveLength(0);
  });

  it('honours each toggle independently', () => {
    expect(kinds(plan(at(7), { dayStart: false }))).not.toContain('day-start');
    expect(kinds(plan(at(7), { dayEnd: false }))).not.toContain('day-end');
    expect(kinds(plan(at(7), { breaks: false }))).not.toContain('break');
  });

  it('spaces breaks by the configured interval', () => {
    const items = plan(at(7), { breakEveryMs: 2 * 60 * MIN }).filter(
      (i) => i.event.kind === 'break',
    );
    // 09:00–17:00 at two-hour spacing: 11, 13, 15.
    expect(items.map((i) => new Date(i.at).getHours())).toEqual([11, 13, 15]);
  });

  it('never schedules a break past the end of the day', () => {
    const items = plan(at(7), { breakEveryMs: 90 * MIN });
    const end = new Date(2026, 0, 15, 17, 0, 0).getTime();
    for (const i of items.filter((x) => x.event.kind === 'break')) {
      expect(i.at).toBeLessThan(end);
    }
  });

  it('skips breaks for an overnight shift rather than guessing', () => {
    // 22:00–06:00: the interval arithmetic stops meaning anything, and a bad
    // guess is worse than silence.
    const items = planDailyRoutines({
      now: at(21),
      workHours: { start: '22:00', end: '06:00' },
      config: cfg(),
      random: () => 0,
    });
    expect(kinds(items)).not.toContain('break');
    expect(kinds(items)).toContain('day-start');
  });

  it('survives malformed work hours without throwing', () => {
    const items = planDailyRoutines({
      now: at(7),
      workHours: { start: 'lunchtime', end: '17:00' },
      config: cfg(),
      random: () => 0,
    });
    expect(kinds(items)).not.toContain('day-start');
    expect(kinds(items)).toContain('day-end');
  });
});

describe('event shape', () => {
  it('uses unique scheduler keys so breaks do not overwrite each other', () => {
    const items = plan(at(7));
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });

  it('namespaces every key so the source can re-declare its whole set', () => {
    for (const i of plan(at(7))) expect(i.key.startsWith(ROUTINE_PREFIX)).toBe(true);
  });

  it('scopes the subject per kind per day', () => {
    // Dismissing today's break nudge must not silence breaks forever.
    const items = plan(at(7)).filter((i) => i.event.kind === 'break');
    const subjects = new Set(items.map((i) => i.event.subject));
    expect(subjects.size).toBe(1);
    expect([...subjects][0]).toContain('2026-01-15');
  });

  it('marks routines low priority so they yield to real events', () => {
    for (const i of plan(at(7))) expect(i.event.priority).toBe('low');
  });

  it('expires routines, so a late fire is dropped rather than surfaced', () => {
    // A "good morning" at lunchtime is worse than nothing.
    for (const i of plan(at(7))) {
      expect(i.event.expiresAt).toBeDefined();
      expect(i.event.expiresAt!).toBeGreaterThan(i.at);
    }
  });

  it('gives every routine non-empty text', () => {
    for (const i of plan(at(7))) expect(i.event.text.length).toBeGreaterThan(0);
  });

  it('varies phrasing across the random range', () => {
    const seen = new Set<string>();
    for (let r = 0; r < 10; r += 1) {
      const items = planDailyRoutines({
        now: at(7),
        workHours: HOURS,
        config: cfg(),
        random: () => r / 10,
      });
      const dayStart = items.find((i) => i.event.kind === 'day-start');
      if (dayStart !== undefined) seen.add(dayStart.event.text);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('planLongSession', () => {
  it('schedules relative to when the session started, not to now', () => {
    const startedAt = at(9).getTime();
    const item = planLongSession(startedAt, cfg({ longSessionAfterMs: 100 * MIN }), at(9, 30));
    expect(item).not.toBeNull();
    expect(item!.at).toBe(startedAt + 100 * MIN);
  });

  it('returns null once the threshold has already passed', () => {
    const startedAt = at(9).getTime();
    expect(planLongSession(startedAt, cfg({ longSessionAfterMs: 10 * MIN }), at(11))).toBeNull();
  });

  it('returns null when disabled', () => {
    expect(planLongSession(at(9).getTime(), cfg({ longSession: false }), at(9, 1))).toBeNull();
  });
});

describe('taskNudgeText', () => {
  it('names the count and asks rather than scolds', () => {
    const msg = taskNudgeText('tasks-open', 3);
    expect(msg).toContain('3 things');
    expect(msg).toContain('?');
  });

  it('handles the singular', () => {
    expect(taskNudgeText('tasks-open', 1)).toContain('1 thing');
    expect(taskNudgeText('tasks-open', 1)).not.toContain('1 things');
  });

  it('says something different for overdue', () => {
    expect(taskNudgeText('tasks-overdue', 2)).not.toBe(taskNudgeText('tasks-open', 2));
  });
});

describe('planTaskNudge', () => {
  it('lands 15 minutes before the day ends, with time left to act', () => {
    const item = planTaskNudge(3, 0, HOURS, at(9), () => 0);
    expect(item).not.toBeNull();
    const d = new Date(item!.at);
    expect(d.getHours()).toBe(16);
    expect(d.getMinutes()).toBe(45);
  });

  it('says nothing when the list is clear', () => {
    expect(planTaskNudge(0, 0, HOURS, at(9), () => 0)).toBeNull();
  });

  it('prefers the overdue message when anything has slipped', () => {
    const item = planTaskNudge(5, 2, HOURS, at(9), () => 0);
    expect(item!.event.kind).toBe('tasks-overdue');
    // The count reported is the overdue one, not the total.
    expect(item!.event.text).toContain('2 things');
  });

  it('returns null once the moment has passed', () => {
    // Asked at 16:50, the nudge slot is behind us.
    expect(planTaskNudge(3, 0, HOURS, at(16, 50), () => 0)).toBeNull();
  });

  it('uses one stable key so re-planning replaces rather than stacks', () => {
    const a = planTaskNudge(3, 0, HOURS, at(9), () => 0);
    const b = planTaskNudge(9, 0, HOURS, at(10), () => 0);
    expect(a!.key).toBe(b!.key);
  });

  it('survives malformed work hours', () => {
    expect(planTaskNudge(3, 0, { start: '09:00', end: 'home time' }, at(9), () => 0)).toBeNull();
  });
});
