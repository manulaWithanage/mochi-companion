import { describe, expect, it } from 'vitest';
import {
  elapsedMs,
  emptyTimerState,
  formatDuration,
  startSession,
  stopSession,
  switchProject,
  toggle,
  totalMs,
  type TimerState,
  type WorkSession,
} from './session.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

const running = (over: Partial<WorkSession> = {}): TimerState => ({
  active: { id: 's1', projectId: 'mochi', startedAt: T0, endedAt: null, ...over },
});

describe('startSession', () => {
  it('starts from idle', () => {
    const r = startSession(emptyTimerState, { projectId: 'mochi', now: T0, id: 's1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.active).toEqual({
      id: 's1',
      projectId: 'mochi',
      startedAt: T0,
      endedAt: null,
    });
  });

  it('refuses to start when one is already running', () => {
    const r = startSession(running(), { projectId: 'other', now: T0 + MIN, id: 's2' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ kind: 'already-running', projectId: 'mochi' });
  });
});

describe('stopSession', () => {
  it('closes the running session', () => {
    const r = stopSession(running(), T0 + 90 * MIN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.state.active).toBeNull();
    expect(r.value.completed.endedAt).toBe(T0 + 90 * MIN);
  });

  it('errors when nothing is running', () => {
    const r = stopSession(emptyTimerState, T0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ kind: 'not-running' });
  });

  it('clamps endedAt when the system clock moves backwards', () => {
    // NTP correction or the user changing the clock mid-session.
    const r = stopSession(running(), T0 - 60 * MIN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.completed.endedAt).toBe(T0);
    expect(elapsedMs(r.value.completed, T0)).toBe(0);
  });
});

describe('toggle', () => {
  it('starts when idle', () => {
    const r = toggle(emptyTimerState, { projectId: 'mochi', now: T0, id: 's1' });
    expect(r.state.active?.projectId).toBe('mochi');
    expect(r.completed).toBeNull();
  });

  it('stops when running and returns the session to persist', () => {
    const r = toggle(running(), { projectId: 'ignored', now: T0 + 25 * MIN, id: 'ignored' });
    expect(r.state.active).toBeNull();
    expect(r.completed?.id).toBe('s1');
    expect(elapsedMs(r.completed!, T0 + 25 * MIN)).toBe(25 * MIN);
  });

  it('round-trips back to idle', () => {
    const a = toggle(emptyTimerState, { projectId: 'mochi', now: T0, id: 's1' });
    const b = toggle(a.state, { projectId: 'mochi', now: T0 + MIN, id: 's2' });
    expect(b.state).toEqual(emptyTimerState);
  });
});

describe('switchProject', () => {
  it('closes the old session and opens a new one', () => {
    const r = switchProject(running(), { projectId: 'docs', now: T0 + 10 * MIN, id: 's2' });
    expect(r.completed?.projectId).toBe('mochi');
    expect(r.completed?.endedAt).toBe(T0 + 10 * MIN);
    expect(r.state.active?.projectId).toBe('docs');
    expect(r.state.active?.startedAt).toBe(T0 + 10 * MIN);
  });

  it('just starts when nothing was running', () => {
    const r = switchProject(emptyTimerState, { projectId: 'docs', now: T0, id: 's1' });
    expect(r.completed).toBeNull();
    expect(r.state.active?.projectId).toBe('docs');
  });

  it('loses no time between the two sessions', () => {
    const r = switchProject(running(), { projectId: 'docs', now: T0 + 10 * MIN, id: 's2' });
    expect(r.completed!.endedAt).toBe(r.state.active!.startedAt);
  });
});

describe('elapsedMs', () => {
  it('uses now for a running session', () => {
    expect(elapsedMs(running().active!, T0 + 5 * MIN)).toBe(5 * MIN);
  });

  it('uses endedAt for a completed session, ignoring now', () => {
    const done: WorkSession = { ...running().active!, endedAt: T0 + 3 * MIN };
    expect(elapsedMs(done, T0 + 999 * MIN)).toBe(3 * MIN);
  });

  it('never goes negative', () => {
    expect(elapsedMs(running().active!, T0 - 5 * MIN)).toBe(0);
  });
});

describe('totalMs', () => {
  it('sums sessions', () => {
    const sessions: WorkSession[] = [
      { id: 'a', projectId: 'p', startedAt: T0, endedAt: T0 + 10 * MIN },
      { id: 'b', projectId: 'p', startedAt: T0, endedAt: T0 + 5 * MIN },
    ];
    expect(totalMs(sessions, T0)).toBe(15 * MIN);
  });

  it('is zero for no sessions', () => {
    expect(totalMs([], T0)).toBe(0);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '00s'],
    [5_000, '05s'],
    [65_000, '1m 05s'],
    [59 * MIN, '59m 00s'],
    [60 * MIN, '1h 00m'],
    [135 * MIN, '2h 15m'],
    [-5000, '00s'],
  ])('formats %ims as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});
