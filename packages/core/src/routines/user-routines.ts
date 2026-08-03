/**
 * User Lifestyle Routines
 *
 * Custom user-defined daily/weekly routines with multiple times per day,
 * custom icons/emojis, repeating days, category badges, and optional Mochi reminder prompts.
 */

export type RoutineCategory = 'health' | 'focus' | 'mindfulness' | 'custom';
export type RoutineDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface UserRoutine {
  readonly id: string;
  readonly title: string;
  readonly icon?: string; // e.g. 💧, 🏃, 🧘, 📝, ☕, 🍏, 🎯
  readonly time: string; // Primary HH:MM (for backwards compatibility)
  readonly times?: readonly string[]; // Array of HH:MM times (e.g. ['10:00', '14:00', '16:00'])
  readonly days: readonly RoutineDay[];
  readonly category: RoutineCategory;
  readonly enabled: boolean;
  readonly mochiReminder: boolean;
  readonly reminderMessage?: string;
  readonly createdAt: number;
}

/**
 * What a form submits, which is not the same shape as what gets stored.
 *
 * The optional fields are `| undefined` on purpose. `UserRoutine` above keeps
 * them strictly optional so a stored routine either has an icon or has no such
 * key — but a form always produces a value for every control it renders, and
 * that value is `undefined` when the field is blank. Under
 * `exactOptionalPropertyTypes` those two are different types, and forcing the
 * renderer to strip its own empty fields just moves the same conditional
 * spread into every call site.
 *
 * UserRoutinesVault.editableFields normalises the difference in one place.
 */
export interface UserRoutineInput {
  readonly title: string;
  readonly icon?: string | undefined;
  readonly time: string;
  readonly times?: readonly string[] | undefined;
  readonly days: readonly RoutineDay[];
  readonly category: RoutineCategory;
  readonly mochiReminder: boolean;
  readonly reminderMessage?: string | undefined;
}

export const EMOJI_OPTIONS: readonly string[] = [
  '💧',
  '🏃',
  '🧘',
  '📝',
  '☕',
  '🍏',
  '🎯',
  '⚡',
  '🚶',
  '🍎',
  '🏋️',
  '📚',
  '👁️',
  '🧘‍♂️',
  '🍵',
];

export const ROUTINE_PRESETS: readonly Omit<UserRoutine, 'id' | 'createdAt'>[] = [
  {
    title: 'Hydration Break',
    icon: '💧',
    time: '10:00',
    times: ['10:00', '12:30', '15:00', '17:00'],
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    category: 'health',
    enabled: true,
    mochiReminder: true,
    reminderMessage: 'Time for a glass of water! Staying hydrated keeps your energy steady.',
  },
  {
    title: 'Stand & Stretch',
    icon: '🏃',
    time: '14:30',
    times: ['11:30', '14:30', '16:30'],
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    category: 'health',
    enabled: true,
    mochiReminder: true,
    reminderMessage:
      "You've been focused a while — stand up, stretch your back and relax your eyes.",
  },
  {
    title: 'Mindful Reset',
    icon: '🧘',
    time: '16:00',
    times: ['16:00'],
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    category: 'mindfulness',
    enabled: true,
    mochiReminder: true,
    reminderMessage: 'Take 3 deep breath cycles. Clear your mind before finishing the day.',
  },
  {
    title: 'Evening Shutdown & Review',
    icon: '📝',
    time: '17:30',
    times: ['17:30'],
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    category: 'focus',
    enabled: true,
    mochiReminder: true,
    reminderMessage: "Wrap up today's work, review completed tasks, and clear your desk.",
  },
];

// ---------------------------------------------------------------------------
// When does this next happen?
// ---------------------------------------------------------------------------

/** Sunday-first, matching Date.getDay(). */
const DAY_ORDER: readonly RoutineDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Every time a routine is set for, tolerating the legacy single `time`. */
export function routineTimes(routine: UserRoutine): readonly string[] {
  const times =
    routine.times !== undefined && routine.times.length > 0 ? routine.times : [routine.time];
  return [...times].filter((t) => /^\d{1,2}:\d{2}$/.test(t)).sort();
}

/**
 * The next moment this routine fires, or null.
 *
 * Null means it is disabled, has no valid times, or has no days selected — all
 * of which are states a form can produce and none of which should be shown as
 * "next up in 6 days" by accident.
 *
 * Searches eight days rather than seven so a routine due later *today* is found
 * before the same weekday next week.
 */
export function nextOccurrence(routine: UserRoutine, now: Date): number | null {
  if (!routine.enabled) return null;
  const times = routineTimes(routine);
  if (times.length === 0 || routine.days.length === 0) return null;

  for (let offset = 0; offset < 8; offset += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const weekday = DAY_ORDER[day.getDay()]!;
    if (!routine.days.includes(weekday)) continue;

    for (const time of times) {
      const [hours, minutes] = time.split(':');
      const at = new Date(day);
      at.setHours(Number(hours), Number(minutes), 0, 0);
      if (at.getTime() > now.getTime()) return at.getTime();
    }
  }
  return null;
}

/** True when the routine is scheduled on the given day at all. */
export function runsOnDay(routine: UserRoutine, day: Date): boolean {
  return routine.days.includes(DAY_ORDER[day.getDay()]!);
}

/**
 * Routines in the order the day will actually reach them.
 *
 * Disabled ones sink to the bottom rather than disappearing: they are still
 * yours, and hiding them makes the toggle feel like a delete.
 */
export function sortByNext(routines: readonly UserRoutine[], now: Date): readonly UserRoutine[] {
  return [...routines].sort((a, b) => {
    const nextA = nextOccurrence(a, now);
    const nextB = nextOccurrence(b, now);
    if (nextA === null && nextB === null) return a.createdAt - b.createdAt;
    if (nextA === null) return 1;
    if (nextB === null) return -1;
    return nextA - nextB;
  });
}

/** `in 20 min`, `in 3 hours`, `tomorrow`, `Friday`. */
export function describeNext(at: number | null, now: Date): string {
  if (at === null) return 'paused';

  const ms = at - now.getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `in ${minutes} min`;

  const sameDay = new Date(at).toDateString() === now.toDateString();
  if (sameDay) {
    const hours = Math.round(minutes / 60);
    return hours === 1 ? 'in 1 hour' : `in ${hours} hours`;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (new Date(at).toDateString() === tomorrow.toDateString()) return 'tomorrow';

  return new Date(at).toLocaleDateString(undefined, { weekday: 'long' });
}
