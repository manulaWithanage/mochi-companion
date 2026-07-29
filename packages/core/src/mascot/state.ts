/**
 * Mascot visual state.
 *
 * V1 ships `idle`, `working`, `resting`. The V2 states are declared here so
 * the priority table and skin manifest contract are settled before the
 * interruption governor exists — but nothing in V1 emits them.
 */

export const V1_STATES = ['idle', 'working', 'resting'] as const;
export const V2_STATES = ['thinking', 'speaking', 'alert'] as const;

export type MascotState = (typeof V1_STATES)[number] | (typeof V2_STATES)[number];

export const ALL_STATES: readonly MascotState[] = [...V1_STATES, ...V2_STATES];

export function isMascotState(value: unknown): value is MascotState {
  return typeof value === 'string' && (ALL_STATES as readonly string[]).includes(value);
}

/**
 * Higher wins. A lower-priority state never preempts a higher one — this is
 * what stops a timer tick from interrupting an alert.
 */
const PRIORITY: Record<MascotState, number> = {
  idle: 0,
  resting: 1,
  working: 2,
  thinking: 3,
  speaking: 4,
  alert: 5,
};

export function priorityOf(state: MascotState): number {
  return PRIORITY[state];
}

/** Whether `next` is allowed to replace `current` right now. */
export function canTransition(current: MascotState, next: MascotState): boolean {
  return PRIORITY[next] >= PRIORITY[current];
}

/**
 * `HH:mm`, 24-hour.
 */
export interface WorkHours {
  readonly start: string;
  readonly end: string;
}

export const DEFAULT_WORK_HOURS: WorkHours = { start: '09:00', end: '17:00' };

/** Minutes since local midnight, or null if the string is malformed. */
export function parseHhMm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Handles overnight ranges (22:00–06:00) as well as normal ones.
 * Returns false rather than throwing if the range is malformed.
 */
export function isWithinWorkHours(now: Date, hours: WorkHours): boolean {
  const start = parseHhMm(hours.start);
  const end = parseHhMm(hours.end);
  if (start === null || end === null) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end; // spans midnight
}

export interface MascotContext {
  readonly timerRunning: boolean;
  readonly now: Date;
  readonly workHours: WorkHours;
  /** How long the user has been away from keyboard/mouse. */
  readonly userIdleMs: number;
}

/** Idle this long outside of an active timer and the mascot settles down. */
export const REST_AFTER_IDLE_MS = 5 * 60_000;

/**
 * Derive the mascot's state from the world.
 *
 * Deliberately a pure function of context rather than a set of imperative
 * transitions — it is the seed of the "day state" model the governor will
 * extend, and it keeps the renderer free of scheduling logic.
 */
export function deriveMascotState(ctx: MascotContext): MascotState {
  // An active timer always wins: the user is demonstrably at the desk.
  if (ctx.timerRunning) return 'working';
  if (!isWithinWorkHours(ctx.now, ctx.workHours)) return 'resting';
  if (ctx.userIdleMs >= REST_AFTER_IDLE_MS) return 'resting';
  return 'idle';
}
