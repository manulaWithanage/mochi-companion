/**
 * Tasks — the checklist half of "handle my day".
 *
 * Pure logic and types. Storage lives behind StorageAdapter like everything
 * else, so this is testable with no database.
 *
 * Deliberately small. A task has a title, an optional day, an optional
 * project and a done flag. No subtasks, no tags, no recurrence — those are
 * what turn a companion's to-do list into a project management tool nobody
 * asked for.
 */

export interface Task {
  readonly id: string;
  readonly title: string;
  /** Null when the task belongs to no particular project. */
  readonly projectId: string | null;
  /** Local `YYYY-MM-DD`. Null means someday, not today. */
  readonly dueOn: string | null;
  /** Epoch ms when ticked, or null while open. */
  readonly doneAt: number | null;
  readonly createdAt: number;
  /** Higher sorts first within a day. */
  readonly priority: number;
}

export const MAX_TASK_TITLE = 140;

/** Local `YYYY-MM-DD`, matching how the budget and routines bucket days. */
export function taskDay(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const isOpen = (t: Task): boolean => t.doneAt === null;
export const isDone = (t: Task): boolean => t.doneAt !== null;

/**
 * Everything that should be on today's list.
 *
 * Overdue tasks are included rather than hidden on the day they were missed —
 * a to-do that silently disappears is worse than one that nags.
 */
export function dueToday(tasks: readonly Task[], now: Date): readonly Task[] {
  const today = taskDay(now);
  return tasks.filter((t) => isOpen(t) && t.dueOn !== null && t.dueOn <= today);
}

/** Open, dated, and already past. */
export function overdue(tasks: readonly Task[], now: Date): readonly Task[] {
  const today = taskDay(now);
  return tasks.filter((t) => isOpen(t) && t.dueOn !== null && t.dueOn < today);
}

/** Open with no date — the backlog. */
export function someday(tasks: readonly Task[]): readonly Task[] {
  return tasks.filter((t) => isOpen(t) && t.dueOn === null);
}

/** Ticked today, so the day's progress reflects what was actually finished. */
export function completedToday(tasks: readonly Task[], now: Date): readonly Task[] {
  const today = taskDay(now);
  return tasks.filter((t) => t.doneAt !== null && taskDay(new Date(t.doneAt)) === today);
}

export interface DayProgress {
  readonly done: number;
  readonly total: number;
  readonly overdue: number;
  readonly pct: number;
}

/**
 * Today at a glance.
 *
 * `total` counts what was due plus what was finished, so ticking a task never
 * makes the denominator shrink and the bar jump backwards.
 */
export function progressForToday(tasks: readonly Task[], now: Date): DayProgress {
  const open = dueToday(tasks, now);
  const done = completedToday(tasks, now);
  const total = open.length + done.length;
  return {
    done: done.length,
    total,
    overdue: overdue(tasks, now).length,
    pct: total === 0 ? 0 : Math.round((done.length / total) * 100),
  };
}

/**
 * Display order: overdue first, then by priority, then oldest first.
 *
 * Stable and boring on purpose — a list that reshuffles as you tick things is
 * hard to work through.
 */
export function sortForDisplay(tasks: readonly Task[], now: Date): readonly Task[] {
  const today = taskDay(now);
  return [...tasks].sort((a, b) => {
    const aLate = a.dueOn !== null && a.dueOn < today ? 0 : 1;
    const bLate = b.dueOn !== null && b.dueOn < today ? 0 : 1;
    if (aLate !== bLate) return aLate - bLate;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.createdAt - b.createdAt;
  });
}

export interface NewTaskInput {
  readonly id: string;
  readonly title: string;
  readonly now: Date;
  readonly projectId?: string | null;
  /** Omit for today; pass null explicitly for someday. */
  readonly dueOn?: string | null;
  readonly priority?: number;
}

export type TaskResult =
  { readonly ok: true; readonly task: Task } | { readonly ok: false; readonly error: string };

/** Build a task, rejecting the cases a text field will actually produce. */
export function createTask(input: NewTaskInput): TaskResult {
  const title = input.title.trim();
  if (title.length === 0) return { ok: false, error: 'A task needs a title.' };
  if (title.length > MAX_TASK_TITLE) {
    return { ok: false, error: `Keep it under ${MAX_TASK_TITLE} characters.` };
  }

  return {
    ok: true,
    task: {
      id: input.id,
      title,
      projectId: input.projectId ?? null,
      // Undefined means "today"; an explicit null means someday.
      dueOn: input.dueOn === undefined ? taskDay(input.now) : input.dueOn,
      doneAt: null,
      createdAt: input.now.getTime(),
      priority: input.priority ?? 0,
    },
  };
}

/** Tick or untick, so the same control does both. */
export function toggleDone(task: Task, now: Date): Task {
  return { ...task, doneAt: task.doneAt === null ? now.getTime() : null };
}

/** Move an unfinished task to today — the "carry it over" action. */
export function rollForward(task: Task, now: Date): Task {
  if (isDone(task)) return task;
  return { ...task, dueOn: taskDay(now) };
}
