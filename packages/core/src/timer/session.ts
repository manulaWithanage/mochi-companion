/**
 * Pure timer/session logic for the 1-Click Project Stopwatch.
 *
 * No I/O, no Electron, no clock access — `now` is always injected so every
 * branch is reachable from a test (RULE 2).
 */

export type SessionId = string;

export interface WorkSession {
  readonly id: SessionId;
  readonly projectId: string;
  /** Epoch milliseconds. */
  readonly startedAt: number;
  /** Epoch milliseconds, or null while the session is still running. */
  readonly endedAt: number | null;
}

export interface TimerState {
  readonly active: WorkSession | null;
}

export type TimerError =
  | { readonly kind: 'already-running'; readonly projectId: string }
  | { readonly kind: 'not-running' };

export type TimerResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: TimerError };

export const emptyTimerState: TimerState = { active: null };

interface StartInput {
  readonly projectId: string;
  readonly now: number;
  readonly id: SessionId;
}

/**
 * Start a session. Fails if one is already running — callers that want
 * "switch project" semantics should use {@link switchProject}.
 */
export function startSession(state: TimerState, input: StartInput): TimerResult<TimerState> {
  if (state.active !== null) {
    return { ok: false, error: { kind: 'already-running', projectId: state.active.projectId } };
  }
  return {
    ok: true,
    value: {
      active: {
        id: input.id,
        projectId: input.projectId,
        startedAt: input.now,
        endedAt: null,
      },
    },
  };
}

export interface StopOutcome {
  readonly state: TimerState;
  /** The session that was just closed, ready to persist. */
  readonly completed: WorkSession;
}

/**
 * Stop the running session.
 *
 * If the clock has moved backwards since the session started (NTP correction,
 * user changing the system clock, DST), `endedAt` is clamped to `startedAt` so
 * a session can never record negative duration.
 */
export function stopSession(state: TimerState, now: number): TimerResult<StopOutcome> {
  const active = state.active;
  if (active === null) {
    return { ok: false, error: { kind: 'not-running' } };
  }
  const endedAt = Math.max(now, active.startedAt);
  return {
    ok: true,
    value: {
      state: emptyTimerState,
      completed: { ...active, endedAt },
    },
  };
}

/**
 * Stop whatever is running (if anything) and start a new session.
 * This is what clicking a different project does.
 */
export function switchProject(
  state: TimerState,
  input: StartInput,
): { readonly state: TimerState; readonly completed: WorkSession | null } {
  let completed: WorkSession | null = null;
  let next = state;

  if (state.active !== null) {
    const stopped = stopSession(state, input.now);
    if (stopped.ok) {
      completed = stopped.value.completed;
      next = stopped.value.state;
    }
  }

  const started = startSession(next, input);
  // startSession cannot fail here: `next` is always idle at this point.
  return { state: started.ok ? started.value : next, completed };
}

/**
 * One click on the mascot: start if idle, stop if running.
 */
export function toggle(
  state: TimerState,
  input: StartInput,
): { readonly state: TimerState; readonly completed: WorkSession | null } {
  if (state.active === null) {
    const started = startSession(state, input);
    return { state: started.ok ? started.value : state, completed: null };
  }
  const stopped = stopSession(state, input.now);
  return stopped.ok
    ? { state: stopped.value.state, completed: stopped.value.completed }
    : { state, completed: null };
}

/**
 * Duration of a session in milliseconds. Uses `endedAt` for completed
 * sessions and `now` for running ones. Never returns a negative number.
 */
export function elapsedMs(session: WorkSession, now: number): number {
  const end = session.endedAt ?? now;
  return Math.max(0, end - session.startedAt);
}

/** Total tracked time across a set of sessions. */
export function totalMs(sessions: readonly WorkSession[], now: number): number {
  return sessions.reduce((sum, s) => sum + elapsedMs(s, now), 0);
}

/** `2h 15m` / `15m 03s` / `03s` — for the tray tooltip and dashboard. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${String(seconds).padStart(2, '0')}s`;
}
