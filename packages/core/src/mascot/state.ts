/**
 * Mascot visual state.
 *
 * V1 ships `idle`, `working`, `resting`. The V2 states are declared here so
 * the priority table and skin manifest contract are settled before the
 * interruption governor exists — but nothing in V1 emits them.
 */

export const V1_STATES = ['idle', 'working', 'resting'] as const;
export const V2_STATES = ['thinking', 'speaking', 'happy', 'celebrating', 'alert'] as const;

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
  /**
   * `happy` sits below `thinking` on purpose. It is a reaction to being
   * stroked, and it should not hold the face while a model call the user is
   * waiting on is running underneath it.
   */
  happy: 2,
  thinking: 3,
  speaking: 4,
  /**
   * Above `speaking`, because a celebration is a thing Mochi does *while*
   * telling you about it, and below `alert`, because nothing outranks an
   * alert.
   */
  celebrating: 4,
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
  /**
   * A model call the user is waiting on is in flight.
   *
   * Only calls somebody asked for. Background work — the email triage pass,
   * speculative draft generation — deliberately does not set this: a mascot
   * that looks busy while nobody is waiting is noise, and it would be on
   * screen for most of the working day.
   */
  readonly llmThinking?: boolean;
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
  /*
   * Thinking outranks everything derivable here, including an active timer.
   *
   * It is the only state in this function that answers "is something
   * happening right now that you are waiting for", and a user who asked a
   * question four seconds ago needs that answer more than they need to be
   * reminded the stopwatch is running. It is also brief by construction: it
   * lasts exactly as long as the call.
   */
  if (ctx.llmThinking === true) return 'thinking';

  // An active timer always wins: the user is demonstrably at the desk.
  if (ctx.timerRunning) return 'working';
  if (!isWithinWorkHours(ctx.now, ctx.workHours)) return 'resting';
  if (ctx.userIdleMs >= REST_AFTER_IDLE_MS) return 'resting';
  return 'idle';
}
