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
  /**
   * Epoch ms at which Mochi should say something, or null for a silent task.
   *
   * Separate from `dueOn` on purpose. A due *day* is how the list is grouped
   * and is what most tasks have; a reminder is an exact moment and is opt-in.
   * Collapsing the two would either force a time on every task or make
   * "sometime Thursday" impossible to express.
   */
  readonly remindAt: number | null;
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
  /** Epoch ms for a spoken reminder. Omit or null for none. */
  readonly remindAt?: number | null;
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
      remindAt: input.remindAt ?? null,
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

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

/**
 * Reminders that have come due and have not been spoken yet.
 *
 * `firedBefore` is the moment the caller last delivered reminders. Anything set
 * for on or before that has already been said, so a scheduler that restarts —
 * or one that misses a tick because the machine slept — neither repeats itself
 * nor silently swallows a reminder while the laptop lid was shut.
 *
 * Done tasks never fire. Being reminded to do the thing you have just done is
 * the fastest way to make someone turn reminders off.
 */
export function remindersDue(
  tasks: readonly Task[],
  now: Date,
  firedBefore: number,
): readonly Task[] {
  const at = now.getTime();
  return tasks
    .filter((t) => isOpen(t) && t.remindAt !== null && t.remindAt > firedBefore && t.remindAt <= at)
    .sort((a, b) => (a.remindAt ?? 0) - (b.remindAt ?? 0));
}

/** Open tasks with a reminder still ahead of them, soonest first. */
export function upcomingReminders(tasks: readonly Task[], now: Date): readonly Task[] {
  const at = now.getTime();
  return tasks
    .filter((t) => isOpen(t) && t.remindAt !== null && t.remindAt > at)
    .sort((a, b) => (a.remindAt ?? 0) - (b.remindAt ?? 0));
}

/**
 * When a task is due, in the words a person would use.
 *
 * Reads the reminder time when there is one and the day when there is not, so
 * "Friday" and "Friday 09:00" are both sayable and neither is invented.
 */
export function describeDue(task: Task, now: Date): string {
  if (task.remindAt !== null) return describeMoment(task.remindAt, now);
  if (task.dueOn === null) return 'someday';

  const today = taskDay(now);
  if (task.dueOn === today) return 'today';
  if (task.dueOn < today) return `overdue since ${task.dueOn}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (task.dueOn === taskDay(tomorrow)) return 'tomorrow';

  const within = new Date(now);
  within.setDate(within.getDate() + 7);
  if (task.dueOn <= taskDay(within)) {
    // A bare date string, parsed as local rather than UTC.
    const parts = task.dueOn.split('-');
    const when = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return when.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return task.dueOn;
}

/** Spelled out to nine, then numerals — how prose normally handles counts. */
const WORDS: readonly string[] = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
];

const count = (n: number): string => WORDS[n] ?? String(n);

/**
 * The shape of the day in one line, for the top of the Tasks page.
 *
 * Every version of this is derived from the actual list. It is tempting to
 * write something encouraging — "a lighter plan for today" — but a headline
 * that does not change when the list does is decoration, and one that claims
 * the day is light when four things are overdue is worse than decoration. So
 * the sentence only ever says what is really there.
 */
export function planHeadline(tasks: readonly Task[], now: Date): string {
  const open = tasks.filter(isOpen);
  if (open.length === 0) return 'Nothing on the list.';

  const today = taskDay(now);
  const late = open.filter((t) => t.dueOn !== null && t.dueOn < today).length;
  const dueNow = open.filter((t) => t.dueOn === today).length;

  if (late > 0) {
    const overduePart = `${count(late)} overdue`;
    return dueNow > 0
      ? `${overduePart}, ${dueNow} due today.`
      : `${overduePart}${late === 1 ? ' task.' : ' tasks.'}`;
  }

  if (dueNow === 0) {
    return open.length === 1 ? 'Nothing due today, one waiting.' : 'Nothing due today.';
  }

  return dueNow === 1 ? 'One thing due today.' : `${count(dueNow)} things due today.`;
}

/** `in 20 min`, `in 3 hours`, `tomorrow 09:00`, `Fri 09:00`, `2 days ago`. */
function describeMoment(at: number, now: Date): string {
  const diff = at - now.getTime();
  const clock = new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (diff < 0) {
    const lateMin = Math.round(-diff / 60_000);
    if (lateMin < 60) return `${lateMin} min ago`;
    const lateHours = Math.round(lateMin / 60);
    if (lateHours < 24) return `${lateHours} hour${lateHours === 1 ? '' : 's'} ago`;
    const lateDays = Math.round(lateHours / 24);
    return `${lateDays} day${lateDays === 1 ? '' : 's'} ago`;
  }

  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `in ${minutes} min`;

  const sameDay = new Date(at).toDateString() === now.toDateString();
  if (sameDay) return clock;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (new Date(at).toDateString() === tomorrow.toDateString()) return `tomorrow ${clock}`;

  const weekday = new Date(at).toLocaleDateString(undefined, { weekday: 'short' });
  return `${weekday} ${clock}`;
}
