import { describe, expect, it } from 'vitest';
import { makeEvent, type MochiEvent } from '../events/events.js';
import {
  DEFAULT_GOVERNOR_CONFIG,
  InterruptionGovernor,
  isWithinWindow,
  windowEndsAt,
  type GovernorConfig,
  type GovernorContext,
} from './governor.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** 2026-01-15 10:00 local — inside default work hours, outside quiet hours. */
const T = new Date(2026, 0, 15, 10, 0, 0).getTime();
const at = (h: number, m = 0): number => new Date(2026, 0, 15, h, m, 0).getTime();

const ev = (over: Partial<MochiEvent> = {}): MochiEvent =>
  makeEvent({
    source: 'calendar',
    kind: 'meeting-soon',
    at: T,
    subject: 'meeting-1',
    text: 'Standup in 5 minutes',
    ...over,
  });

const ctx = (over: Partial<GovernorContext> = {}): GovernorContext => ({
  now: T,
  fullscreenActive: false,
  ...over,
});

const gov = (over: Partial<GovernorConfig> = {}): InterruptionGovernor =>
  new InterruptionGovernor({ ...DEFAULT_GOVERNOR_CONFIG, ...over });

describe('isWithinWindow', () => {
  it('handles a window spanning midnight', () => {
    const quiet = { start: '20:00', end: '08:00' };
    expect(isWithinWindow(at(22), quiet)).toBe(true);
    expect(isWithinWindow(at(3), quiet)).toBe(true);
    expect(isWithinWindow(at(12), quiet)).toBe(false);
  });

  it('handles a normal daytime window', () => {
    const w = { start: '09:00', end: '17:00' };
    expect(isWithinWindow(at(12), w)).toBe(true);
    expect(isWithinWindow(at(8), w)).toBe(false);
  });

  it('is false for a malformed or zero-length window', () => {
    expect(isWithinWindow(at(12), { start: 'noon', end: '17:00' })).toBe(false);
    expect(isWithinWindow(at(12), { start: '09:00', end: '09:00' })).toBe(false);
  });
});

describe('windowEndsAt', () => {
  it('returns tomorrow morning for overnight quiet hours', () => {
    const end = windowEndsAt(at(22), { start: '20:00', end: '08:00' });
    const d = new Date(end);
    expect(d.getHours()).toBe(8);
    expect(d.getDate()).toBe(16);
  });

  it('returns today for a window ending later the same day', () => {
    const end = windowEndsAt(at(21), { start: '20:00', end: '23:00' });
    const d = new Date(end);
    expect(d.getHours()).toBe(23);
    expect(d.getDate()).toBe(15);
  });
});

describe('interactive events', () => {
  it('always pass, whatever else is true', () => {
    // The user just clicked. Their own action is the rate limit.
    const g = gov({ doNotDisturb: true, maxPerHour: 0 });
    const d = g.admit(ev({ origin: 'interactive' }), ctx({ fullscreenActive: true, now: at(3) }));
    expect(d).toEqual({ kind: 'allow', reason: 'user-initiated' });
  });

  it('do not consume the interruption budget', () => {
    const g = gov({ maxPerHour: 1 });
    g.admit(ev({ id: 'a', origin: 'interactive' }), ctx());
    g.admit(ev({ id: 'b', origin: 'interactive' }), ctx());
    expect(g.countInLastHour(T)).toBe(0);
    // The budget is still fully available for a real interruption.
    expect(g.admit(ev({ id: 'c' }), ctx()).kind).toBe('allow');
  });

  it('are not spaced against each other', () => {
    // Two clicks deserve two answers, immediately.
    const g = gov({ minGapMs: 10 * MIN });
    g.admit(ev({ id: 'a', origin: 'interactive' }), ctx());
    expect(g.admit(ev({ id: 'b', origin: 'interactive' }), ctx({ now: T + 1000 })).kind).toBe(
      'allow',
    );
  });
});

describe('do not disturb', () => {
  it('drops everything unprompted', () => {
    const g = gov({ doNotDisturb: true });
    expect(g.admit(ev(), ctx())).toEqual({ kind: 'drop', reason: 'do-not-disturb' });
  });

  it('is not overridable by urgency', () => {
    // If urgency could override it, "do not disturb" would mean nothing.
    const g = gov({ doNotDisturb: true });
    expect(g.admit(ev({ priority: 'urgent' }), ctx()).kind).toBe('drop');
  });
});

describe('fullscreen suppression', () => {
  it('defers rather than dropping — they will come out of it', () => {
    const g = gov();
    const d = g.admit(ev(), ctx({ fullscreenActive: true }));
    expect(d.kind).toBe('defer');
    if (d.kind !== 'defer') return;
    expect(d.reason).toBe('fullscreen');
    expect(d.until).toBeGreaterThan(T);
  });

  it('suppresses even urgent events — nothing lands on a presentation', () => {
    const g = gov();
    expect(g.admit(ev({ priority: 'urgent' }), ctx({ fullscreenActive: true })).kind).toBe('defer');
  });
});

describe('quiet hours', () => {
  it('defers until the window ends when the wait is short enough', () => {
    // 07:00 is inside quiet hours, and 08:00 is one hour away — under the cap.
    const g = gov();
    const d = g.admit(ev(), ctx({ now: at(7) }));
    expect(d.kind).toBe('defer');
    if (d.kind !== 'defer') return;
    expect(d.reason).toBe('quiet-hours');
    expect(new Date(d.until).getHours()).toBe(8);
  });

  it('drops instead of deferring when the wait exceeds maxDeferMs', () => {
    // 22:00 to 08:00 is ten hours against a two-hour cap. Deferring that far
    // would surface something the user has long since moved past.
    const g = gov();
    expect(g.admit(ev(), ctx({ now: at(22) }))).toEqual({
      kind: 'drop',
      reason: 'quiet-hours',
    });
  });

  it('lets urgent events through', () => {
    // A 08:00 meeting is worth hearing about at 07:55.
    const g = gov();
    const d = g.admit(ev({ priority: 'urgent' }), ctx({ now: at(7, 55) }));
    expect(d.kind).toBe('allow');
  });

  it('does nothing when disabled', () => {
    const g = gov({ quietHours: null });
    expect(g.admit(ev(), ctx({ now: at(3) })).kind).toBe('allow');
  });
});

describe('hourly budget', () => {
  it('allows up to the ceiling then defers', () => {
    const g = gov({ maxPerHour: 3, minGapMs: 0 });
    for (let i = 0; i < 3; i += 1) {
      expect(g.admit(ev({ id: `e${i}`, subject: `s${i}` }), ctx({ now: T + i })).kind).toBe(
        'allow',
      );
    }
    const fourth = g.admit(ev({ id: 'e3', subject: 's3' }), ctx({ now: T + 3 }));
    expect(fourth.kind).toBe('defer');
    if (fourth.kind !== 'defer') return;
    expect(fourth.reason).toBe('budget-exhausted');
  });

  it('recovers as interruptions age out of the rolling hour', () => {
    const g = gov({ maxPerHour: 1, minGapMs: 0 });
    expect(g.admit(ev({ id: 'a', subject: 'a' }), ctx()).kind).toBe('allow');
    expect(g.admit(ev({ id: 'b', subject: 'b' }), ctx({ now: T + MIN })).kind).toBe('defer');
    expect(g.admit(ev({ id: 'c', subject: 'c' }), ctx({ now: T + HOUR + MIN })).kind).toBe('allow');
  });

  it('is bypassed by urgent events', () => {
    const g = gov({ maxPerHour: 1, minGapMs: 0 });
    g.admit(ev({ id: 'a', subject: 'a' }), ctx());
    const urgent = g.admit(ev({ id: 'b', subject: 'b', priority: 'urgent' }), ctx());
    expect(urgent.kind).toBe('allow');
  });

  it('counts only what was actually shown', () => {
    const g = gov({ maxPerHour: 3 });
    g.admit(ev({ id: 'a', subject: 'a' }), ctx({ fullscreenActive: true })); // deferred
    expect(g.countInLastHour(T)).toBe(0);
  });
});

describe('minimum gap', () => {
  it('spaces interruptions so deferred ones cannot arrive as a burst', () => {
    const g = gov({ maxPerHour: 10, minGapMs: 90_000 });
    expect(g.admit(ev({ id: 'a', subject: 'a' }), ctx()).kind).toBe('allow');

    const soon = g.admit(ev({ id: 'b', subject: 'b' }), ctx({ now: T + 1000 }));
    expect(soon.kind).toBe('defer');
    if (soon.kind !== 'defer') return;
    expect(soon.reason).toBe('too-soon');
    expect(soon.until).toBe(T + 90_000);

    expect(g.admit(ev({ id: 'c', subject: 'c' }), ctx({ now: T + 91_000 })).kind).toBe('allow');
  });
});

describe('dismissal', () => {
  it('never re-fires a dismissed subject', () => {
    const g = gov();
    g.dismiss('meeting-1');
    expect(g.admit(ev(), ctx())).toEqual({ kind: 'drop', reason: 'dismissed' });
  });

  it('keys on subject, so a re-poll with a fresh id cannot resurrect it', () => {
    const g = gov();
    g.dismiss('meeting-1');
    const repolled = ev({ id: 'totally-different-id', at: T + 5 * MIN });
    expect(g.admit(repolled, ctx({ now: T + 5 * MIN })).kind).toBe('drop');
  });

  it('does not affect other subjects', () => {
    const g = gov();
    g.dismiss('meeting-1');
    expect(g.admit(ev({ id: 'x', subject: 'meeting-2' }), ctx()).kind).toBe('allow');
  });
});

describe('deduplication', () => {
  it('drops an event id that has already been shown', () => {
    const g = gov({ minGapMs: 0 });
    expect(g.admit(ev({ id: 'same' }), ctx()).kind).toBe('allow');
    expect(g.admit(ev({ id: 'same' }), ctx({ now: T + MIN }))).toEqual({
      kind: 'drop',
      reason: 'duplicate',
    });
  });
});

describe('expiry', () => {
  it('drops an event past its expiry', () => {
    const g = gov();
    const stale = ev({ expiresAt: T - 1 });
    expect(g.admit(stale, ctx())).toEqual({ kind: 'drop', reason: 'expired' });
  });

  it('allows an event still within its window', () => {
    const g = gov();
    expect(g.admit(ev({ expiresAt: T + MIN }), ctx()).kind).toBe('allow');
  });
});

describe('the scenarios the spec calls out by name', () => {
  it('stays silent during a meeting', () => {
    // A screen share puts a fullscreen window in front.
    const g = gov();
    const d = g.admit(ev({ text: 'You have new mail' }), ctx({ fullscreenActive: true }));
    expect(d.kind).not.toBe('allow');
  });

  it('respects the hourly budget', () => {
    const g = gov({ maxPerHour: 3, minGapMs: 0 });
    let allowed = 0;
    for (let i = 0; i < 20; i += 1) {
      const d = g.admit(ev({ id: `e${i}`, subject: `s${i}` }), ctx({ now: T + i * 1000 }));
      if (d.kind === 'allow') allowed += 1;
    }
    expect(allowed).toBe(3);
  });

  it('never re-fires a dismissal', () => {
    const g = gov({ minGapMs: 0 });
    expect(g.admit(ev({ id: 'first' }), ctx()).kind).toBe('allow');
    g.dismiss('meeting-1');
    for (let i = 0; i < 5; i += 1) {
      const d = g.admit(ev({ id: `retry-${i}` }), ctx({ now: T + i * MIN }));
      expect(d.kind).toBe('drop');
    }
  });

  it('runs with no API key and no Electron process', () => {
    // Trivially true by construction — the point is that it stays true.
    expect(gov().admit(ev(), ctx()).kind).toBe('allow');
  });
});

describe('configure', () => {
  it('applies a partial patch without clobbering the rest', () => {
    const g = gov();
    g.configure({ doNotDisturb: true });
    expect(g.settings.doNotDisturb).toBe(true);
    expect(g.settings.maxPerHour).toBe(DEFAULT_GOVERNOR_CONFIG.maxPerHour);
  });
});

describe('undismiss', () => {
  it('lets a subject speak again when the user re-arms it', () => {
    // "Never again" is right for something waved away, and wrong the moment the
    // user snoozes it or gives it a new time.
    const governor = new InterruptionGovernor();
    governor.dismiss('task-reminder:1');
    expect(governor.isDismissed('task-reminder:1')).toBe(true);

    governor.undismiss('task-reminder:1');
    expect(governor.isDismissed('task-reminder:1')).toBe(false);
  });

  it('leaves other dismissals alone', () => {
    const governor = new InterruptionGovernor();
    governor.dismiss('a');
    governor.dismiss('b');

    governor.undismiss('a');

    expect(governor.isDismissed('a')).toBe(false);
    expect(governor.isDismissed('b')).toBe(true);
  });

  it('is harmless for a subject that was never dismissed', () => {
    const governor = new InterruptionGovernor();
    expect(() => governor.undismiss('never-seen')).not.toThrow();
    expect(governor.isDismissed('never-seen')).toBe(false);
  });
});

/**
 * Scheduled events: asked for in general, not asked for *now*.
 *
 * These tests replace a block that pinned the opposite behaviour, deliberately.
 * It asserted that a reminder "is never rationed away" and got through Do Not
 * Disturb, quiet hours and the budget — which was true, and was the bug. Every
 * scheduler set `userInitiated`, the governor allowed it before checking
 * anything, and so the tray's Do Not Disturb toggle silenced nothing that
 * actually interrupts: a recurring water reminder fired at 3am with it on.
 *
 * The corrected contract distinguishes what the user asked for from when they
 * asked to be told:
 *
 * - "Leave me alone" applies. It is the one control that has to mean what it says.
 * - The hourly budget does not, because rationing something specifically
 *   requested is how a reminder silently fails to arrive.
 * - Quiet hours defers a recurring event and lets a one-shot one through, because
 *   a routine comes round tomorrow and "take the pills at 23:30" does not.
 */
describe('scheduled events respect being left alone', () => {
  const routine = (over: Partial<MochiEvent> = {}): MochiEvent =>
    ev({ subject: 'user-routine:water', origin: 'scheduled', recurring: true, ...over });

  const reminder = (over: Partial<MochiEvent> = {}): MochiEvent =>
    ev({ subject: 'task-reminder:t1', origin: 'scheduled', priority: 'high', ...over });

  it('do-not-disturb silences a recurring routine', () => {
    // The bug in one line: this used to be 'allow'.
    const d = gov({ doNotDisturb: true }).admit(routine(), ctx());
    expect(d).toEqual({ kind: 'drop', reason: 'do-not-disturb' });
  });

  it('do-not-disturb silences a one-shot reminder too', () => {
    // Absolute means absolute. The scheduler holds it rather than losing it.
    expect(gov({ doNotDisturb: true }).admit(reminder(), ctx()).kind).toBe('drop');
  });

  it('quiet hours drops a recurring routine that is hours from the end', () => {
    // 23:00 to 08:00 is nine hours, past maxDeferMs, so the defer becomes a
    // drop — which is the right answer for something that repeats. A stretch
    // reminder delivered at breakfast is not a late reminder, it is a wrong one.
    const g = gov({ quietHours: { start: '20:00', end: '08:00' } });
    const d = g.admit(routine(), ctx({ now: at(23) }));

    expect(d).toEqual({ kind: 'drop', reason: 'quiet-hours' });
  });

  it('quiet hours defers a recurring routine when the window is nearly over', () => {
    // Within maxDeferMs, so it waits and then arrives rather than being lost.
    const g = gov({ quietHours: { start: '20:00', end: '08:00' } });
    const d = g.admit(routine(), ctx({ now: at(7) }));

    expect(d.kind).toBe('defer');
    expect(d).toMatchObject({ reason: 'quiet-hours', until: at(8) });
  });

  it('quiet hours lets a one-shot reminder through', () => {
    // Deferring "take the pills" from 23:30 to 08:00 destroys it rather than
    // delaying it, and an explicit time outranks a default window.
    const g = gov({ quietHours: { start: '20:00', end: '08:00' } });
    expect(g.admit(reminder(), ctx({ now: at(23) })).kind).toBe('allow');
  });

  it('are not rationed by the hourly budget', () => {
    const g = gov({ maxPerHour: 1 });
    g.admit(ev({ id: 'filler' }), ctx()); // spends the budget
    expect(g.admit(reminder(), ctx({ now: T + 10 * MIN })).kind).toBe('allow');
  });

  it('do not spend the budget themselves', () => {
    // Otherwise a busy morning of reminders would silence everything else.
    const g = gov();
    g.admit(reminder(), ctx());
    g.admit(reminder({ id: 'r2', subject: 'task-reminder:t2' }), ctx());
    expect(g.countInLastHour(T)).toBe(0);
  });

  it('are still spaced, so two at once do not stack', () => {
    // Two routines set for the same minute would otherwise land together.
    const g = gov({ minGapMs: 10 * MIN });
    g.admit(routine(), ctx());
    const d = g.admit(
      routine({ id: 'r2', subject: 'user-routine:stretch' }),
      ctx({ now: T + 1000 }),
    );

    expect(d.kind).toBe('defer');
    expect(d).toMatchObject({ reason: 'too-soon' });
  });

  it('are deferred behind a fullscreen app', () => {
    const d = gov().admit(routine(), ctx({ fullscreenActive: true }));
    expect(d.kind).toBe('defer');
  });

  it('still get through after the same subject was dismissed and re-armed', () => {
    // A snooze re-arms the subject; without undismiss the new time never arrives.
    const g = gov();
    g.dismiss('task-reminder:t1');
    expect(g.admit(reminder(), ctx()).kind).toBe('drop');
    g.undismiss('task-reminder:t1');
    expect(g.admit(reminder({ id: 'again' }), ctx()).kind).toBe('allow');
  });
});
