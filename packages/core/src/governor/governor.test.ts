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

describe('user-initiated events', () => {
  it('always pass, whatever else is true', () => {
    const g = gov({ doNotDisturb: true, maxPerHour: 0 });
    const d = g.admit(ev({ userInitiated: true }), ctx({ fullscreenActive: true, now: at(3) }));
    expect(d).toEqual({ kind: 'allow', reason: 'user-initiated' });
  });

  it('do not consume the interruption budget', () => {
    const g = gov({ maxPerHour: 1 });
    g.admit(ev({ id: 'a', userInitiated: true }), ctx());
    g.admit(ev({ id: 'b', userInitiated: true }), ctx());
    expect(g.countInLastHour(T)).toBe(0);
    // The budget is still fully available for a real interruption.
    expect(g.admit(ev({ id: 'c' }), ctx()).kind).toBe('allow');
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
