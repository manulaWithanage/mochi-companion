import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEvent, type MochiEvent } from '../events/events.js';
import {
  MAX_TIMER_MS,
  MISSED_THRESHOLD_MS,
  Scheduler,
  type FireReason,
  type Timers,
} from './scheduler.js';

const MIN = 60_000;
const T0 = new Date(2026, 0, 15, 9, 0, 0).getTime();

/**
 * Fake clock and timer queue. Nothing here waits — `advance` moves virtual
 * time and runs whatever became due, so a test can cover a 30-day schedule
 * instantly.
 */
class FakeTimers implements Timers {
  private current = T0;
  private seq = 0;
  private queue = new Map<number, { at: number; handler: () => void }>();

  now(): number {
    return this.current;
  }

  setTimeout(handler: () => void, ms: number): () => void {
    const id = this.seq++;
    this.queue.set(id, { at: this.current + ms, handler });
    return () => this.queue.delete(id);
  }

  /** Move time forward, firing due handlers in chronological order. */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = [...this.queue.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at);
      const next = due[0];
      if (next === undefined) break;
      const [id, timer] = next;
      this.queue.delete(id);
      this.current = timer.at;
      timer.handler();
    }
    this.current = target;
  }

  /** Simulate suspend: time jumps without any timer firing. */
  jump(ms: number): void {
    this.current += ms;
  }

  get armed(): number {
    return this.queue.size;
  }
}

const ev = (over: Partial<MochiEvent> = {}): MochiEvent =>
  makeEvent({
    source: 'calendar',
    kind: 'meeting-soon',
    at: T0,
    subject: 'standup',
    text: 'Standup in 5 minutes',
    ...over,
  });

describe('Scheduler', () => {
  let timers: FakeTimers;
  let fired: { event: MochiEvent; reason: FireReason }[];
  let scheduler: Scheduler;

  beforeEach(() => {
    timers = new FakeTimers();
    fired = [];
    scheduler = new Scheduler({ onFire: (event, reason) => fired.push({ event, reason }) }, timers);
  });

  describe('basic firing', () => {
    it('fires at the scheduled moment, not before', () => {
      scheduler.schedule({ key: 'a', at: T0 + 10 * MIN, event: ev() });

      timers.advance(9 * MIN);
      expect(fired).toHaveLength(0);

      timers.advance(1 * MIN);
      expect(fired).toHaveLength(1);
      expect(fired[0]?.reason).toBe('due');
    });

    it('drops the item once fired', () => {
      scheduler.schedule({ key: 'a', at: T0 + MIN, event: ev() });
      timers.advance(MIN);
      expect(scheduler.pendingCount).toBe(0);
    });

    it('fires immediately for a time that has just passed', () => {
      scheduler.schedule({ key: 'a', at: T0 - 1000, event: ev() });
      expect(fired).toHaveLength(1);
      expect(fired[0]?.reason).toBe('due');
    });
  });

  describe('missed items', () => {
    it('marks a badly overdue item as missed rather than firing it as due', () => {
      // A 09:00 reminder surfacing at 14:00 is worse than silence.
      scheduler.schedule({ key: 'a', at: T0 - 5 * 60 * MIN, event: ev() });
      expect(fired[0]?.reason).toBe('missed');
    });

    it('treats an item inside the threshold as still on time', () => {
      scheduler.schedule({ key: 'a', at: T0 - (MISSED_THRESHOLD_MS - 1000), event: ev() });
      expect(fired[0]?.reason).toBe('due');
    });
  });

  describe('replacement', () => {
    it('replaces a timer scheduled under the same key', () => {
      scheduler.schedule({ key: 'a', at: T0 + 10 * MIN, event: ev({ text: 'old' }) });
      scheduler.schedule({ key: 'a', at: T0 + 20 * MIN, event: ev({ text: 'new' }) });

      timers.advance(15 * MIN);
      expect(fired).toHaveLength(0); // the old timer must not survive

      timers.advance(5 * MIN);
      expect(fired).toHaveLength(1);
      expect(fired[0]?.event.text).toBe('new');
    });

    it('does not accumulate timers when a source re-polls', () => {
      for (let i = 0; i < 10; i += 1) {
        scheduler.schedule({ key: 'calendar:m1', at: T0 + 30 * MIN, event: ev() });
      }
      expect(scheduler.pendingCount).toBe(1);
      timers.advance(30 * MIN);
      expect(fired).toHaveLength(1);
    });
  });

  describe('replaceNamespace', () => {
    it('cancels items no longer present, so a deleted meeting stops alerting', () => {
      scheduler.replaceNamespace('calendar:', [
        { key: 'calendar:m1', at: T0 + 10 * MIN, event: ev({ subject: 'm1' }) },
        { key: 'calendar:m2', at: T0 + 20 * MIN, event: ev({ subject: 'm2' }) },
      ]);
      expect(scheduler.pendingCount).toBe(2);

      // m2 was cancelled in the calendar; the next sync simply omits it.
      scheduler.replaceNamespace('calendar:', [
        { key: 'calendar:m1', at: T0 + 10 * MIN, event: ev({ subject: 'm1' }) },
      ]);
      expect(scheduler.pendingCount).toBe(1);

      timers.advance(60 * MIN);
      expect(fired.map((f) => f.event.subject)).toEqual(['m1']);
    });

    it('leaves other namespaces untouched', () => {
      scheduler.schedule({ key: 'routine:lunch', at: T0 + 3 * 60 * MIN, event: ev() });
      scheduler.replaceNamespace('calendar:', [
        { key: 'calendar:m1', at: T0 + 10 * MIN, event: ev() },
      ]);
      expect(scheduler.keys).toContain('routine:lunch');
    });

    it('clears a namespace when given an empty set', () => {
      scheduler.schedule({ key: 'calendar:m1', at: T0 + 10 * MIN, event: ev() });
      scheduler.replaceNamespace('calendar:', []);
      expect(scheduler.pendingCount).toBe(0);
    });
  });

  describe('long delays', () => {
    it('chains rather than overflowing setTimeout', () => {
      // Beyond ~24.8 days a raw setTimeout overflows its 32-bit delay and
      // fires immediately — a meeting next month would announce itself now.
      const thirtyDays = 30 * 24 * 60 * MIN;
      scheduler.schedule({ key: 'far', at: T0 + thirtyDays, event: ev() });

      timers.advance(MAX_TIMER_MS);
      expect(fired).toHaveLength(0);
      expect(scheduler.pendingCount).toBe(1);

      timers.advance(thirtyDays - MAX_TIMER_MS);
      expect(fired).toHaveLength(1);
      expect(fired[0]?.reason).toBe('due');
    });

    it('stays pending across many hops', () => {
      scheduler.schedule({ key: 'far', at: T0 + 3 * MAX_TIMER_MS, event: ev() });
      timers.advance(MAX_TIMER_MS);
      expect(scheduler.pendingCount).toBe(1);
      timers.advance(MAX_TIMER_MS);
      expect(scheduler.pendingCount).toBe(1);
      timers.advance(MAX_TIMER_MS);
      expect(fired).toHaveLength(1);
    });
  });

  describe('reconcile after sleep', () => {
    it('fires an item the machine slept through', () => {
      scheduler.schedule({ key: 'a', at: T0 + 10 * MIN, event: ev() });

      // Suspend: wall clock moves, timers do not.
      timers.jump(20 * MIN);
      expect(fired).toHaveLength(0);

      scheduler.reconcile();
      expect(fired).toHaveLength(1);
      expect(fired[0]?.reason).toBe('missed');
    });

    it('marks it due, not missed, for a short nap', () => {
      scheduler.schedule({ key: 'a', at: T0 + MIN, event: ev() });
      timers.jump(2 * MIN);
      scheduler.reconcile();
      expect(fired[0]?.reason).toBe('due');
    });

    it('leaves future items alone', () => {
      scheduler.schedule({ key: 'a', at: T0 + 60 * MIN, event: ev() });
      timers.jump(10 * MIN);
      scheduler.reconcile();
      expect(fired).toHaveLength(0);
      expect(scheduler.pendingCount).toBe(1);
    });
  });

  describe('cancellation', () => {
    it('cancels a pending item', () => {
      scheduler.schedule({ key: 'a', at: T0 + 10 * MIN, event: ev() });
      scheduler.cancel('a');
      timers.advance(20 * MIN);
      expect(fired).toHaveLength(0);
    });

    it('ignores an unknown key', () => {
      expect(() => scheduler.cancel('nope')).not.toThrow();
    });

    it('cancelAll leaves nothing armed', () => {
      scheduler.schedule({ key: 'a', at: T0 + 10 * MIN, event: ev() });
      scheduler.schedule({ key: 'b', at: T0 + 20 * MIN, event: ev() });
      scheduler.cancelAll();
      expect(scheduler.pendingCount).toBe(0);
      expect(timers.armed).toBe(0);
      timers.advance(60 * MIN);
      expect(fired).toHaveLength(0);
    });
  });

  describe('nextDueAt', () => {
    it('returns the earliest pending moment', () => {
      scheduler.schedule({ key: 'late', at: T0 + 60 * MIN, event: ev() });
      scheduler.schedule({ key: 'soon', at: T0 + 5 * MIN, event: ev() });
      expect(scheduler.nextDueAt()).toBe(T0 + 5 * MIN);
    });

    it('is null when nothing is scheduled', () => {
      expect(scheduler.nextDueAt()).toBeNull();
    });
  });

  describe('ordering', () => {
    it('fires in chronological order regardless of insertion order', () => {
      scheduler.schedule({ key: 'c', at: T0 + 30 * MIN, event: ev({ subject: 'c' }) });
      scheduler.schedule({ key: 'a', at: T0 + 10 * MIN, event: ev({ subject: 'a' }) });
      scheduler.schedule({ key: 'b', at: T0 + 20 * MIN, event: ev({ subject: 'b' }) });

      timers.advance(60 * MIN);
      expect(fired.map((f) => f.event.subject)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('systemTimers', () => {
    it('actually schedules and cancels real timers', () => {
      vi.useFakeTimers();
      const real = new Scheduler({ onFire: (e) => fired.push({ event: e, reason: 'due' }) });
      real.schedule({ key: 'a', at: Date.now() + 1000, event: ev() });
      vi.advanceTimersByTime(1100);
      expect(fired).toHaveLength(1);
      vi.useRealTimers();
    });
  });
});
