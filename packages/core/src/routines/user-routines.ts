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
  '💧', '🏃', '🧘', '📝', '☕', '🍏', '🎯', '⚡', '🚶', '🍎', '🏋️', '📚', '👁️', '🧘‍♂️', '🍵'
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
    reminderMessage: "You've been focused a while — stand up, stretch your back and relax your eyes.",
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
