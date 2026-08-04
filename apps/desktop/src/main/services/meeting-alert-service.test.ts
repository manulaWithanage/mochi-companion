import { describe, expect, it, vi } from 'vitest';
import { EventBus, type CalendarEvent, type MochiEvent, type Timers } from '@mochi/core';
import { MeetingAlertService } from './meeting-alert-service.js';

/**
 * The gap this closes: Mochi could see the calendar and never mentioned it.
 * `planMeetingAlerts` and `Scheduler` both existed and were tested; nothing wired
 * them to the bus, so no meeting was ever spoken about.
 *
 * The rules worth pinning are about *not* speaking: an alert must never arrive
 * after the meeting has started, and "leave me alone" has to reach it.
 */

const T = new Date(2026, 7, 5, 9, 0, 0).getTime();
const at = (h: number, m = 0): number => new Date(2026, 7, 5, h, m, 0).getTime();

/**
 * A clock the test drives by hand, with the two cases kept separate.
 *
 * `advanceTo` walks forward through each deadline in order, so a timer observes
 * `now()` equal to its own deadline — an awake process. `sleepUntil` jumps the
 * clock first and *then* fires, so an overdue timer observes the wake time — a
 * closed laptop. Collapsing the two made "fired five hours late" look identical
 * to "fired on time", which is exactly the distinction under test.
 */
function fakeTimers(start: number): Timers & {
  advanceTo(t: number): void;
  sleepUntil(t: number): void;
} {
  let current = start;
  interface Armed {
    fireAt: number;
    handler: () => void;
    cancelled: boolean;
  }
  const armed: Armed[] = [];

  const dueBy = (t: number): Armed[] =>
    armed.filter((e) => !e.cancelled && e.fireAt <= t).sort((a, b) => a.fireAt - b.fireAt);

  return {
    now: () => current,
    setTimeout: (handler, ms) => {
      const entry: Armed = { fireAt: current + ms, handler, cancelled: false };
      armed.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },

    advanceTo(t: number): void {
      // Re-scanned each pass, because the scheduler chains long waits and firing
      // one timer can arm the next hop.
      for (;;) {
        const next = dueBy(t)[0];
        if (next === undefined) break;
        next.cancelled = true;
        current = next.fireAt;
        next.handler();
      }
      current = t;
    },

    sleepUntil(t: number): void {
      current = t;
      for (;;) {
        const next = dueBy(t)[0];
        if (next === undefined) break;
        next.cancelled = true;
        next.handler();
      }
    },
  };
}

function meeting(over: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    title: 'Standup',
    startsAt: at(10),
    endsAt: at(10, 30),
    allDay: false,
    cancelled: false,
    attendance: 'accepted',
    ...over,
  } as CalendarEvent;
}

function harness(events: readonly CalendarEvent[], now = T) {
  const bus = new EventBus();
  const emitted: MochiEvent[] = [];
  bus.subscribe((e) => emitted.push(e));

  const timers = fakeTimers(now);
  const openExternal = vi.fn();
  let current = events;
  const service = new MeetingAlertService(bus, () => current, openExternal, timers);

  return {
    service,
    emitted,
    timers,
    openExternal,
    setEvents(next: readonly CalendarEvent[]): void {
      current = next;
    },
  };
}

describe('a meeting finally gets mentioned', () => {
  it('emits five minutes before it starts', () => {
    const h = harness([meeting({ id: 'm1', title: 'Standup' })]);
    h.service.reconcile(T);

    expect(h.emitted).toHaveLength(0);
    h.timers.advanceTo(at(9, 55));

    expect(h.emitted).toHaveLength(1);
    expect(h.emitted[0]?.text).toContain('Standup');
    expect(h.emitted[0]?.subject).toBe('calendar:m1');
  });

  it('says nothing before the lead time', () => {
    const h = harness([meeting({ id: 'm1' })]);
    h.service.reconcile(T);

    h.timers.advanceTo(at(9, 50));
    expect(h.emitted).toHaveLength(0);
  });

  it('plans one alert per meeting', () => {
    const h = harness([
      meeting({ id: 'a', startsAt: at(10), endsAt: at(10, 30) }),
      meeting({ id: 'b', startsAt: at(11), endsAt: at(11, 30) }),
    ]);
    h.service.reconcile(T);

    expect(h.service.plannedCount).toBe(2);
    h.timers.advanceTo(at(11, 30));
    expect(h.emitted.map((e) => e.subject)).toEqual(['calendar:a', 'calendar:b']);
  });
});

describe('what it refuses to say', () => {
  it('expires the event when the meeting starts', () => {
    // The load-bearing one. A deferral for a fullscreen app or the minimum gap
    // must never turn a warning into "this already began", and the governor drops
    // anything past expiresAt.
    const h = harness([meeting({ id: 'm1', startsAt: at(10) })]);
    h.service.reconcile(T);
    h.timers.advanceTo(at(9, 55));

    expect(h.emitted[0]?.expiresAt).toBe(at(10));
  });

  it('does not alert about a meeting that already started', () => {
    const h = harness([meeting({ id: 'past', startsAt: at(8), endsAt: at(8, 30) })]);
    h.service.reconcile(T);

    expect(h.service.plannedCount).toBe(0);
    h.timers.advanceTo(at(12));
    expect(h.emitted).toHaveLength(0);
  });

  it('skips an alert that fires long after it was due', () => {
    // The laptop was asleep through it. Telling someone at 14:00 about a 09:00
    // meeting is worse than silence.
    const h = harness([meeting({ id: 'm1', startsAt: at(10) })]);
    h.service.reconcile(T);

    h.timers.sleepUntil(at(13));
    expect(h.emitted).toHaveLength(0);
  });

  it('stops alerting about a meeting removed from the calendar', () => {
    // replaceNamespace cancels what is no longer planned, so this service never
    // has to track deletions.
    const h = harness([meeting({ id: 'm1' })]);
    h.service.reconcile(T);
    expect(h.service.plannedCount).toBe(1);

    h.setEvents([]);
    h.service.reconcile(T);

    expect(h.service.plannedCount).toBe(0);
    h.timers.advanceTo(at(9, 56));
    expect(h.emitted).toHaveLength(0);
  });

  it('does not stack duplicate timers when re-planned', () => {
    const h = harness([meeting({ id: 'm1' })]);
    h.service.reconcile(T);
    h.service.reconcile(T);
    h.service.reconcile(T);

    h.timers.advanceTo(at(9, 56));
    expect(h.emitted).toHaveLength(1);
  });

  it('ignores cancelled, declined and all-day entries', () => {
    const h = harness([
      meeting({ id: 'cancelled', cancelled: true }),
      meeting({ id: 'declined', attendance: 'declined' }),
      meeting({ id: 'birthday', allDay: true }),
    ]);
    h.service.reconcile(T);

    expect(h.service.plannedCount).toBe(0);
  });
});

describe('how much restraint applies', () => {
  it('is scheduled, so do not disturb silences it', () => {
    const h = harness([meeting({ id: 'm1' })]);
    h.service.reconcile(T);
    h.timers.advanceTo(at(9, 55));

    expect(h.emitted[0]?.origin).toBe('scheduled');
  });

  it('is not recurring, so quiet hours lets it through', () => {
    // A 07:30 meeting is worth hearing about at 07:25 even inside the default
    // quiet window; that instance never comes round again.
    const h = harness([meeting({ id: 'm1' })]);
    h.service.reconcile(T);
    h.timers.advanceTo(at(9, 55));

    expect(h.emitted[0]?.recurring).toBeUndefined();
  });
});

describe('joining', () => {
  it('opens the validated link from the invite', () => {
    const h = harness([
      meeting({ id: 'm1', conferenceUrl: 'https://meet.google.com/abc-defg-hij' }),
    ]);
    h.service.reconcile(T);

    h.service.join('calendar:m1');
    expect(h.openExternal).toHaveBeenCalledWith('https://meet.google.com/abc-defg-hij');
  });

  it('does nothing for a meeting with no link', () => {
    const h = harness([meeting({ id: 'm1' })]);
    h.service.reconcile(T);

    expect(h.service.conferenceUrlFor('calendar:m1')).toBeNull();
    h.service.join('calendar:m1');
    expect(h.openExternal).not.toHaveBeenCalled();
  });

  it('refuses a non-https link even if one reached the cache', () => {
    // The parser validates scheme and host, but a calendar invite is
    // attacker-controlled and this is the moment it becomes an action.
    const h = harness([
      meeting({
        id: 'm1',
        conferenceUrl: 'http://meet.google.com/abc',
      } as Partial<CalendarEvent> & {
        id: string;
      }),
    ]);
    h.service.reconcile(T);

    h.service.join('calendar:m1');
    expect(h.openExternal).not.toHaveBeenCalled();
  });

  it('does nothing for a subject it never planned', () => {
    const h = harness([meeting({ id: 'm1' })]);
    h.service.reconcile(T);

    h.service.join('calendar:never-heard-of-it');
    expect(h.openExternal).not.toHaveBeenCalled();
  });
});
