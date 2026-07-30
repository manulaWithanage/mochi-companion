/**
 * User Lifestyle Routines
 *
 * Custom user-defined daily/weekly routines with time, repeating days,
 * category badges, and optional Mochi reminder prompts.
 */

export type RoutineCategory = 'health' | 'focus' | 'mindfulness' | 'custom';
export type RoutineDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface UserRoutine {
  readonly id: string;
  readonly title: string;
  readonly time: string; // HH:MM format (24-hour)
  readonly days: readonly RoutineDay[];
  readonly category: RoutineCategory;
  readonly enabled: boolean;
  readonly mochiReminder: boolean;
  readonly reminderMessage?: string;
  readonly createdAt: number;
}

export interface UserRoutineInput {
  readonly title: string;
  readonly time: string;
  readonly days: readonly RoutineDay[];
  readonly category: RoutineCategory;
  readonly mochiReminder: boolean;
  readonly reminderMessage?: string;
}

export const ROUTINE_PRESETS: readonly Omit<UserRoutine, 'id' | 'createdAt'>[] = [
  {
    title: 'Hydration Break',
    time: '11:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    category: 'health',
    enabled: true,
    mochiReminder: true,
    reminderMessage: 'Time for a glass of water! Staying hydrated keeps your energy steady.',
  },
  {
    title: 'Stand & Stretch',
    time: '14:30',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    category: 'health',
    enabled: true,
    mochiReminder: true,
    reminderMessage: "You've been focused a while — stand up, stretch your back and relax your eyes.",
  },
  {
    title: 'Mindful Reset',
    time: '16:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    category: 'mindfulness',
    enabled: true,
    mochiReminder: true,
    reminderMessage: 'Take 3 deep breath cycles. Clear your mind before finishing the day.',
  },
  {
    title: 'Evening Shutdown & Review',
    time: '17:30',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    category: 'focus',
    enabled: true,
    mochiReminder: true,
    reminderMessage: "Wrap up today's work, review completed tasks, and clear your desk.",
  },
];
