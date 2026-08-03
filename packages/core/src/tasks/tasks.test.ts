import { describe, expect, it } from 'vitest';
import {
  completedToday,
  createTask,
  describeDue,
  dueToday,
  isOpen,
  MAX_TASK_TITLE,
  overdue,
  planHeadline,
  remindersDue,
  progressForToday,
  rollForward,
  someday,
  sortForDisplay,
  upcomingReminders,
  taskDay,
  toggleDone,
  type Task,
} from './tasks.js';

const now = new Date(2026, 0, 15, 10, 0, 0);
const TODAY = '2026-01-15';

const task = (over: Partial<Task> = {}): Task => ({
  id: 'a',
  title: 'Do the thing',
  projectId: null,
  dueOn: TODAY,
  doneAt: null,
  createdAt: now.getTime(),
  priority: 0,
  remindAt: null,
  ...over,
});

describe('taskDay', () => {
  it('uses local dates', () => {
    expect(taskDay(now)).toBe(TODAY);
    // Late evening must still be today, not tomorrow in UTC.
    expect(taskDay(new Date(2026, 0, 15, 23, 45))).toBe(TODAY);
  });
});

describe('createTask', () => {
  it('defaults to today when no date is given', () => {
    const r = createTask({ id: 'x', title: 'Write tests', now });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.task.dueOn).toBe(TODAY);
    expect(r.task.doneAt).toBeNull();
  });

  it('treats an explicit null as someday, not today', () => {
    // The distinction the API exists to preserve.
    const r = createTask({ id: 'x', title: 'Someday', now, dueOn: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.task.dueOn).toBeNull();
  });

  it('trims the title', () => {
    const r = createTask({ id: 'x', title: '   spaced   ', now });
    if (!r.ok) return;
    expect(r.task.title).toBe('spaced');
  });

  it('rejects an empty or whitespace-only title', () => {
    expect(createTask({ id: 'x', title: '', now }).ok).toBe(false);
    expect(createTask({ id: 'x', title: '    ', now }).ok).toBe(false);
  });

  it('rejects an overlong title with a usable message', () => {
    const r = createTask({ id: 'x', title: 'y'.repeat(MAX_TASK_TITLE + 1), now });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain(String(MAX_TASK_TITLE));
  });
});

describe('bucketing', () => {
  const tasks: Task[] = [
    task({ id: 'today', dueOn: TODAY }),
    task({ id: 'late', dueOn: '2026-01-13' }),
    task({ id: 'future', dueOn: '2026-01-20' }),
    task({ id: 'someday', dueOn: null }),
    task({ id: 'done', dueOn: TODAY, doneAt: now.getTime() }),
  ];

  it('includes overdue tasks in today rather than hiding them', () => {
    // A to-do that silently vanishes is worse than one that nags.
    const ids = dueToday(tasks, now).map((t) => t.id);
    expect(ids).toContain('today');
    expect(ids).toContain('late');
  });

  it('excludes future and done tasks from today', () => {
    const ids = dueToday(tasks, now).map((t) => t.id);
    expect(ids).not.toContain('future');
    expect(ids).not.toContain('done');
  });

  it('separates overdue and someday', () => {
    expect(overdue(tasks, now).map((t) => t.id)).toEqual(['late']);
    expect(someday(tasks).map((t) => t.id)).toEqual(['someday']);
  });

  it('counts only what was ticked today', () => {
    const yesterday = new Date(2026, 0, 14, 12).getTime();
    const list = [task({ id: 'a', doneAt: now.getTime() }), task({ id: 'b', doneAt: yesterday })];
    expect(completedToday(list, now).map((t) => t.id)).toEqual(['a']);
  });
});

describe('progressForToday', () => {
  it('is zero with nothing due', () => {
    expect(progressForToday([], now)).toEqual({ done: 0, total: 0, overdue: 0, pct: 0 });
  });

  it('does not let the bar jump backwards when a task is ticked', () => {
    // total counts open + completed, so the denominator never shrinks.
    const before = [task({ id: 'a' }), task({ id: 'b' })];
    const after = [task({ id: 'a', doneAt: now.getTime() }), task({ id: 'b' })];
    expect(progressForToday(before, now).total).toBe(2);
    expect(progressForToday(after, now).total).toBe(2);
    expect(progressForToday(after, now).pct).toBe(50);
  });

  it('reports overdue separately', () => {
    const list = [task({ id: 'late', dueOn: '2026-01-01' })];
    expect(progressForToday(list, now).overdue).toBe(1);
  });
});

describe('sortForDisplay', () => {
  it('puts overdue first, then priority, then oldest', () => {
    const list: Task[] = [
      task({ id: 'low', priority: 0, createdAt: 300 }),
      task({ id: 'high', priority: 5, createdAt: 200 }),
      task({ id: 'late', dueOn: '2026-01-10', priority: 0, createdAt: 400 }),
    ];
    expect(sortForDisplay(list, now).map((t) => t.id)).toEqual(['late', 'high', 'low']);
  });

  it('does not mutate the input', () => {
    const list = [task({ id: 'a' }), task({ id: 'b', priority: 9 })];
    const copy = [...list];
    sortForDisplay(list, now);
    expect(list).toEqual(copy);
  });
});

describe('toggleDone', () => {
  it('ticks and unticks with the same call', () => {
    const open = task();
    const done = toggleDone(open, now);
    expect(isOpen(done)).toBe(false);
    expect(isOpen(toggleDone(done, now))).toBe(true);
  });
});

describe('rollForward', () => {
  it('moves an overdue task to today', () => {
    const late = task({ dueOn: '2026-01-02' });
    expect(rollForward(late, now).dueOn).toBe(TODAY);
  });

  it('leaves a completed task alone', () => {
    const done = task({ dueOn: '2026-01-02', doneAt: 123 });
    expect(rollForward(done, now).dueOn).toBe('2026-01-02');
  });
});

describe('remindersDue', () => {
  const at = (h: number, m = 0): number => new Date(2026, 0, 15, h, m).getTime();

  it('returns reminders that have come due since the last delivery', () => {
    const tasks = [
      task({ id: 'past', remindAt: at(9) }),
      task({ id: 'now', remindAt: at(10) }),
      task({ id: 'later', remindAt: at(11) }),
    ];
    // Everything up to 09:30 has already been spoken.
    expect(remindersDue(tasks, now, at(9, 30)).map((t) => t.id)).toEqual(['now']);
  });

  it('does not repeat one already delivered', () => {
    const tasks = [task({ id: 'a', remindAt: at(10) })];
    expect(remindersDue(tasks, now, at(10))).toEqual([]);
  });

  it('still fires one missed while the machine was asleep', () => {
    // Two hours of ticks never happened; the reminder must not be swallowed.
    const tasks = [task({ id: 'slept', remindAt: at(9) })];
    expect(remindersDue(tasks, now, at(8)).map((t) => t.id)).toEqual(['slept']);
  });

  it('never reminds about a task already ticked off', () => {
    const tasks = [task({ id: 'done', remindAt: at(9), doneAt: at(9, 30) })];
    expect(remindersDue(tasks, now, at(8))).toEqual([]);
  });

  it('ignores tasks with no reminder set', () => {
    expect(remindersDue([task({ remindAt: null })], now, 0)).toEqual([]);
  });

  it('delivers oldest first', () => {
    const tasks = [task({ id: 'b', remindAt: at(9, 50) }), task({ id: 'a', remindAt: at(9, 10) })];
    expect(remindersDue(tasks, now, at(9)).map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('upcomingReminders', () => {
  it('lists only what is still ahead, soonest first', () => {
    const at = (h: number): number => new Date(2026, 0, 15, h).getTime();
    const tasks = [
      task({ id: 'gone', remindAt: at(9) }),
      task({ id: 'late', remindAt: at(16) }),
      task({ id: 'soon', remindAt: at(11) }),
      task({ id: 'done', remindAt: at(12), doneAt: at(11) }),
    ];
    expect(upcomingReminders(tasks, now).map((t) => t.id)).toEqual(['soon', 'late']);
  });
});

describe('describeDue', () => {
  it('prefers the reminder time when there is one', () => {
    const in20 = new Date(2026, 0, 15, 10, 20).getTime();
    expect(describeDue(task({ remindAt: in20 }), now)).toBe('in 20 min');
  });

  it('says how late a missed reminder is', () => {
    const ago = new Date(2026, 0, 15, 9, 30).getTime();
    expect(describeDue(task({ remindAt: ago }), now)).toBe('30 min ago');
  });

  it('falls back to the day when no time is set', () => {
    expect(describeDue(task({ dueOn: TODAY, remindAt: null }), now)).toBe('today');
    expect(describeDue(task({ dueOn: '2026-01-16', remindAt: null }), now)).toBe('tomorrow');
    expect(describeDue(task({ dueOn: '2026-01-14', remindAt: null }), now)).toBe(
      'overdue since 2026-01-14',
    );
  });

  it('says someday rather than inventing a date', () => {
    expect(describeDue(task({ dueOn: null, remindAt: null }), now)).toBe('someday');
  });

  it('names the weekday for something later this week', () => {
    // 2026-01-18 is a Sunday.
    expect(describeDue(task({ dueOn: '2026-01-18', remindAt: null }), now)).toBe('Sunday');
  });
});

describe('planHeadline', () => {
  it('says what is actually there rather than something encouraging', () => {
    expect(planHeadline([], now)).toBe('Nothing on the list.');
    expect(planHeadline([task({ dueOn: TODAY })], now)).toBe('One thing due today.');
    expect(
      planHeadline([task({ id: 'a', dueOn: TODAY }), task({ id: 'b', dueOn: TODAY })], now),
    ).toBe('Two things due today.');
  });

  it('leads with overdue, because that is the thing worth knowing', () => {
    const tasks = [task({ id: 'late', dueOn: '2026-01-14' }), task({ id: 'now', dueOn: TODAY })];
    expect(planHeadline(tasks, now)).toBe('One overdue, 1 due today.');
  });

  it('does not claim a light day when things are overdue', () => {
    const tasks = [task({ id: 'a', dueOn: '2026-01-10' }), task({ id: 'b', dueOn: '2026-01-11' })];
    expect(planHeadline(tasks, now)).toBe('Two overdue tasks.');
  });

  it('separates an empty day from an empty list', () => {
    // Something exists, just not for today — that is not "nothing on the list".
    expect(planHeadline([task({ dueOn: null })], now)).toBe('Nothing due today, one waiting.');
    expect(planHeadline([task({ doneAt: 1 })], now)).toBe('Nothing on the list.');
  });

  it('switches to numerals past nine', () => {
    const many = Array.from({ length: 11 }, (_, i) => task({ id: `t${i}`, dueOn: TODAY }));
    expect(planHeadline(many, now)).toBe('11 things due today.');
  });
});
