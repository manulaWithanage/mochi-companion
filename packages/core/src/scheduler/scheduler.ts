/**
 * The scheduler.
 *
 * Converts *what we know* into *when to act*. Sources poll to keep a cache
 * fresh; the scheduler fires events off local timers computed from that
 * cache. These are two separate mechanisms on purpose — a 15-minute poll can
 * never deliver a 5-minute meeting warning, and conflating them is the single
 * most common way calendar reminders end up wrong.
 *
 * Pure logic: the clock and the timer mechanism are both injected, so every
 * branch is reachable from a test with no Electron process and no waiting.
 */

import type { MochiEvent } from '../events/events.js';

/** Cancels a pending timer. */
export type CancelFn = () => void;

/**
 * Injected timer mechanism. Real usage passes setTimeout/clearTimeout;
 * tests pass a fake they can advance by hand.
 */
export interface Timers {
  setTimeout(handler: () => void, ms: number): CancelFn;
  now(): number;
}

export const systemTimers: Timers = {
  setTimeout: (handler, ms) => {
    const id = setTimeout(handler, ms);
    // Ambient bookkeeping should never hold the process open.
    (id as { unref?: () => void }).unref?.();
    return () => clearTimeout(id);
  },
  now: () => Date.now(),
};

export interface ScheduledItem {
  /** Stable across reschedules — re-adding the same key replaces the old timer. */
  readonly key: string;
  /** Epoch ms at which the event should fire. */
  readonly at: number;
  readonly event: MochiEvent;
}

/**
 * Anything scheduled further out than this is re-armed later rather than
 * held as a live timer.
 *
 * setTimeout delays are stored as a 32-bit signed int, so anything beyond
 * ~24.8 days overflows and fires *immediately* — a meeting scheduled for next
 * year would announce itself right now. Chaining also re-reads the wall clock
 * on each hop, so long waits survive clock drift and DST.
 */
export const MAX_TIMER_MS = 6 * 60 * 60_000;

/**
 * How late a timer may fire and still be considered on time.
 *
 * A laptop asleep through a meeting alert wakes with the timer overdue. Firing
 * a 09:00 reminder at 14:00 is worse than saying nothing, so anything overdue
 * by more than this is dropped as missed.
 */
export const MISSED_THRESHOLD_MS = 5 * 60_000;

export type FireReason = 'due' | 'missed';

export interface SchedulerCallbacks {
  /** Called when an item comes due. `missed` means it fired late after sleep. */
  onFire(event: MochiEvent, reason: FireReason): void;
}

export class Scheduler {
  private readonly pending = new Map<string, { item: ScheduledItem; cancel: CancelFn }>();

  constructor(
    private readonly callbacks: SchedulerCallbacks,
    private readonly timers: Timers = systemTimers,
  ) {}

  /**
   * Schedule an item, replacing any existing one with the same key.
   *
   * Replacement rather than accumulation is what makes re-polling safe: a
   * calendar sync can re-schedule every known meeting on every pass without
   * stacking duplicate timers.
   */
  schedule(item: ScheduledItem): void {
    this.cancel(item.key);

    const delay = item.at - this.timers.now();

    if (delay <= 0) {
      // Already due. Fire now unless it is so overdue it would be noise.
      const overdue = -delay;
      this.fire(item, overdue > MISSED_THRESHOLD_MS ? 'missed' : 'due');
      return;
    }

    this.arm(item, delay);
  }

  /**
   * Replace everything scheduled under a prefix in one pass.
   *
   * Sources own a namespace (`calendar:`, `routine:`) and re-declare their
   * whole set after each sync. Items no longer present are cancelled, so a
   * deleted meeting stops alerting without the source tracking deletions.
   */
  replaceNamespace(prefix: string, items: readonly ScheduledItem[]): void {
    for (const key of [...this.pending.keys()]) {
      if (key.startsWith(prefix)) this.cancel(key);
    }
    for (const item of items) this.schedule(item);
  }

  private arm(item: ScheduledItem, delay: number): void {
    // Long waits are chained in hops so they cannot overflow setTimeout and
    // so each hop re-reads the clock.
    const hop = Math.min(delay, MAX_TIMER_MS);
    const cancel = this.timers.setTimeout(() => {
      this.pending.delete(item.key);
      const remaining = item.at - this.timers.now();
      if (remaining > 0) {
        this.arm(item, remaining);
        return;
      }
      this.fire(item, -remaining > MISSED_THRESHOLD_MS ? 'missed' : 'due');
    }, hop);

    this.pending.set(item.key, { item, cancel });
  }

  private fire(item: ScheduledItem, reason: FireReason): void {
    this.pending.delete(item.key);
    this.callbacks.onFire(item.event, reason);
  }

  cancel(key: string): void {
    const existing = this.pending.get(key);
    if (existing === undefined) return;
    existing.cancel();
    this.pending.delete(key);
  }

  cancelAll(): void {
    for (const { cancel } of this.pending.values()) cancel();
    this.pending.clear();
  }

  /**
   * Re-evaluate every pending item against the current clock.
   *
   * Call after resume from sleep: timers do not advance while suspended, so a
   * machine asleep past a scheduled moment wakes holding timers that believe
   * they are still in the future.
   */
  reconcile(): void {
    for (const { item } of [...this.pending.values()]) {
      const remaining = item.at - this.timers.now();
      if (remaining > 0) continue;
      this.cancel(item.key);
      this.fire(item, -remaining > MISSED_THRESHOLD_MS ? 'missed' : 'due');
    }
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Keys currently scheduled, for diagnostics and tests. */
  get keys(): readonly string[] {
    return [...this.pending.keys()];
  }

  nextDueAt(): number | null {
    let earliest: number | null = null;
    for (const { item } of this.pending.values()) {
      if (earliest === null || item.at < earliest) earliest = item.at;
    }
    return earliest;
  }
}
