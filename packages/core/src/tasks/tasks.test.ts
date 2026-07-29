import { describe, expect, it } from 'vitest';
import {
  completedToday,
  createTask,
  dueToday,
  isOpen,
  MAX_TASK_TITLE,
  overdue,
  progressForToday,
  rollForward,
  someday,
  sortForDisplay,
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
