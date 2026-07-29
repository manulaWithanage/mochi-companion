/**
 * Drives Mochi's unprompted behaviour.
 *
 * Owns a Scheduler, plans the day's routines from the user's work hours, and
 * emits fired events onto the bus — where the governor decides whether they
 * actually reach the user. This service never speaks directly.
 *
 * All of it works with no network, no API key and no account.
 */

import { powerMonitor } from 'electron';
import {
  DEFAULT_ROUTINES,
  planDailyRoutines,
  planLongSession,
  ROUTINE_PREFIX,
  Scheduler,
  type EventBus,
  type MochiEvent,
  type RoutineConfig,
  type WorkHours,
} from '@mochi/core';

/** Re-plan this often so the day rolls over without restarting the app. */
const REPLAN_INTERVAL_MS = 30 * 60_000;

export interface RoutineInputs {
  getWorkHours(): WorkHours;
  isPaused(): boolean;
}

export class RoutineService {
  private readonly scheduler: Scheduler;
  private replanTimer: NodeJS.Timeout | null = null;
  private lastPlannedDay: string | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly inputs: RoutineInputs,
    private readonly config: RoutineConfig = DEFAULT_ROUTINES,
  ) {
    this.scheduler = new Scheduler({
      onFire: (event, reason) => {
        // A routine the machine slept through is not worth surfacing late —
        // "good morning" at 3pm is worse than silence.
        if (reason === 'missed') return;
        if (this.inputs.isPaused()) return;
        this.bus.emit(event);
      },
    });
  }

  start(): void {
    this.replan();
    this.replanTimer = setInterval(() => this.replan(), REPLAN_INTERVAL_MS);
    this.replanTimer.unref?.();

    // Timers do not advance while suspended, so on resume the scheduler is
    // holding timers that still believe they are in the future.
    powerMonitor.on('resume', () => this.scheduler.reconcile());
    powerMonitor.on('unlock-screen', () => this.scheduler.reconcile());
  }

  /**
   * Re-declare the whole routine set for today.
   *
   * `replaceNamespace` means this is safe to call repeatedly — changed work
   * hours take effect immediately and stale items are cancelled, without the
   * service tracking what it scheduled last time.
   */
  replan(now: Date = new Date()): void {
    const items = planDailyRoutines({
      now,
      workHours: this.inputs.getWorkHours(),
      config: this.config,
    });
    this.scheduler.replaceNamespace(ROUTINE_PREFIX, items);
    this.lastPlannedDay = now.toISOString().slice(0, 10);
  }

  /** Called when a tracked session starts, to arm the long-session nudge. */
  onSessionStarted(startedAt: number, now: Date = new Date()): void {
    const item = planLongSession(startedAt, this.config, now);
    if (item === null) return;
    this.scheduler.schedule(item);
  }

  onSessionStopped(): void {
    this.scheduler.cancel(`${ROUTINE_PREFIX}long-session`);
  }

  /** Diagnostics. */
  get pending(): readonly string[] {
    return this.scheduler.keys;
  }

  get nextDueAt(): number | null {
    return this.scheduler.nextDueAt();
  }

  get plannedFor(): string | null {
    return this.lastPlannedDay;
  }

  stop(): void {
    if (this.replanTimer !== null) clearInterval(this.replanTimer);
    this.replanTimer = null;
    this.scheduler.cancelAll();
  }
}

export type { MochiEvent };
