/**
 * Fires task reminders.
 *
 * Deliberately built like UserRoutineScheduler — a slow local-clock ticker that
 * emits on the bus — but the matching rule is different, and the difference
 * matters.
 *
 * A routine fires when the wall clock reads its HH:MM. That works because a
 * routine repeats: miss 10:00 today and it comes round again tomorrow. A task
 * reminder happens once. If the machine is asleep, or busy, or the app is
 * starting up at the moment it falls due, an equality check drops it silently
 * and the reminder never happens at all.
 *
 * So this asks "what came due since I last delivered anything" rather than
 * "what is due exactly now". A laptop opened at 14:00 still gets the 09:30
 * reminder, once.
 */

import {
  makeEvent,
  remindersDue,
  type EventBus,
  type StorageAdapter,
  type Task,
} from '@mochi/core';
import type { SettingsStore } from '../storage/settings-store.js';
import type { OverlayWindow } from '../windows/overlay.js';

/** Slow on purpose: a reminder a few seconds late is not a worse reminder. */
const TICK_MS = 20_000;

/**
 * How far back a just-started app will look for missed reminders.
 *
 * Long enough to catch one that fell due over lunch, short enough that opening
 * the app after a fortnight does not produce a pile of alerts for things that
 * stopped being relevant days ago.
 */
const CATCH_UP_MS = 4 * 60 * 60_000;

export class TaskReminderScheduler {
  private timer: NodeJS.Timeout | null = null;
  /** Everything at or before this has been said. */
  private deliveredThrough: number;
  private checking = false;

  constructor(
    private readonly bus: EventBus,
    private readonly storage: StorageAdapter,
    private readonly settings: SettingsStore,
    private readonly overlay: OverlayWindow,
  ) {
    this.deliveredThrough = Date.now() - CATCH_UP_MS;
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.check(), TICK_MS);
    this.timer.unref?.();
    void this.check();
    console.log('[task-reminder] watching for due task reminders');
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async check(): Promise<void> {
    // A slow database read must not overlap itself and deliver twice.
    if (this.checking) return;
    this.checking = true;
    try {
      const now = new Date();
      const tasks = await this.storage.listTasks();
      const due = remindersDue(tasks, now, this.deliveredThrough);

      // Advance the watermark even when nothing fired, so the catch-up window
      // does not keep sliding backwards from the constructor's value.
      this.deliveredThrough = now.getTime();
      if (due.length === 0) return;

      for (const task of due) this.announce(task);
    } catch (error) {
      console.error('[task-reminder] could not read tasks:', error);
    } finally {
      this.checking = false;
    }
  }

  private announce(task: Task): void {
    console.log(`[task-reminder] firing reminder for "${task.title}"`);

    this.bus.emit(
      makeEvent({
        source: 'routine',
        kind: 'break',
        at: Date.now(),
        // Keyed by task, so the governor can tell two reminders apart.
        subject: `task-reminder:${task.id}`,
        priority: 'high',
        text: `⏰ ${task.title}`,
        // The user asked for this, at this exact time. It goes through rather
        // than being rationed as an unprompted interruption.
        userInitiated: true,
      }),
    );

    if (this.settings.get().centerScreenAlerts !== false) {
      void this.overlay.performMagicianAlert(6000);
    }
  }
}
