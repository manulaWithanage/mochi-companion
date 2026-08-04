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

/** Where the watermark is kept, so it survives a restart. */
const WATERMARK_KEY = 'task_reminders_delivered_through';

export class TaskReminderScheduler {
  private timer: NodeJS.Timeout | null = null;
  /**
   * Everything at or before this has been said. Null until loaded from storage.
   *
   * It has to be persisted. Starting it at `now - CATCH_UP_MS` on every launch
   * re-armed a four-hour window each time, so an open task whose reminder had
   * already been delivered fired again on the next start — and again on the one
   * after that. Anyone restarting the app a few times in an afternoon got the
   * same reminder repeatedly, which is exactly the behaviour that teaches
   * people to switch reminders off.
   */
  private deliveredThrough: number | null = null;
  private checking = false;

  constructor(
    private readonly bus: EventBus,
    private readonly storage: StorageAdapter,
    private readonly settings: SettingsStore,
    private readonly overlay: OverlayWindow,
  ) {}

  /**
   * The stored watermark, floored at the catch-up window.
   *
   * The floor matters for the opposite failure: a watermark from last week
   * would make the first check deliver every reminder since, all at once.
   */
  private async loadWatermark(): Promise<number> {
    const floor = Date.now() - CATCH_UP_MS;
    try {
      const raw = await this.storage.getAppState(WATERMARK_KEY);
      const saved = raw === null ? Number.NaN : Number(raw);
      return Number.isFinite(saved) ? Math.max(saved, floor) : floor;
    } catch (error) {
      console.error('[task-reminder] could not read the watermark:', error);
      return floor;
    }
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
      if (this.deliveredThrough === null) {
        this.deliveredThrough = await this.loadWatermark();
      }

      const now = new Date();
      const tasks = await this.storage.listTasks();
      const due = remindersDue(tasks, now, this.deliveredThrough);

      // Advance in memory even when nothing fired, so the window does not keep
      // rescanning the same stretch.
      this.deliveredThrough = now.getTime();
      if (due.length === 0) return;

      for (const task of due) this.announce(task);

      // Persisted only after something was actually delivered. Writing on every
      // tick would be a database round-trip every 20 seconds for no gain: if
      // nothing fired, there is nothing a restart could repeat.
      await this.storage.setAppState(WATERMARK_KEY, String(this.deliveredThrough));
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
