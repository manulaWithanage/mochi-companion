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
 *
 * And "delivered" means delivered. Putting an event on the bus is not the same
 * as the user seeing a bubble: the overlay window is created late in bootstrap,
 * long after this starts ticking, so a reminder caught up at launch could be
 * emitted into a window that did not exist yet. The watermark had already moved
 * past it, so it never came round again. Anything announced is now held until
 * something confirms it reached the screen, and retried until it does.
 */

import {
  isOpen,
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

/**
 * Announced but not yet confirmed on screen. Persisted, because the watermark
 * has already moved past these — a restart would otherwise be the one thing
 * that loses them for good.
 */
const OUTSTANDING_KEY = 'task_reminders_outstanding';

/**
 * How long to keep retrying an undelivered reminder.
 *
 * The realistic causes clear in seconds: the overlay finishing its first load,
 * or a bubble the user is mid-decision on. Ten minutes is far past either. After
 * that something is wrong in a way retrying will not fix, and a reminder that
 * finally lands an hour late is its own kind of wrong — so it is given up on,
 * loudly, rather than retried for ever.
 */
const DELIVERY_DEADLINE_MS = 10 * 60_000;

/**
 * Cap on held reminders.
 *
 * Reached only if delivery is broken outright, in which case the oldest are the
 * least worth still saying.
 */
const MAX_OUTSTANDING = 20;

/** Prefix that ties an event subject back to the task it came from. */
const SUBJECT_PREFIX = 'task-reminder:';

interface Outstanding {
  /** When it was first announced, so it can eventually be given up on. */
  readonly firstAnnouncedAt: number;
  readonly attempts: number;
}

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
  /** Task id → what we know about trying to deliver its reminder. */
  private outstanding = new Map<string, Outstanding>();
  private outstandingLoaded = false;

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

  /**
   * Something put this reminder in front of the user. Stop holding it.
   *
   * Called at the moment a bubble actually reaches the screen — not when the
   * event is admitted, and not when it is queued, because neither of those is
   * the user seeing it.
   */
  confirmDelivered(subject: string): void {
    if (!subject.startsWith(SUBJECT_PREFIX)) return;
    const taskId = subject.slice(SUBJECT_PREFIX.length);
    if (!this.outstanding.delete(taskId)) return;
    void this.persistOutstanding();
  }

  /** Reminders announced but not yet seen. Diagnostics. */
  get outstandingCount(): number {
    return this.outstanding.size;
  }

  private async loadOutstanding(): Promise<void> {
    if (this.outstandingLoaded) return;
    this.outstandingLoaded = true;
    try {
      const raw = await this.storage.getAppState(OUTSTANDING_KEY);
      if (raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      for (const entry of parsed) {
        if (typeof entry !== 'object' || entry === null) continue;
        const { id, firstAnnouncedAt } = entry as Record<string, unknown>;
        if (typeof id !== 'string' || id.length === 0) continue;
        if (typeof firstAnnouncedAt !== 'number' || !Number.isFinite(firstAnnouncedAt)) continue;
        // Attempts restart at zero: the deadline is measured from the original
        // announcement, so a restart cannot extend it indefinitely.
        this.outstanding.set(id, { firstAnnouncedAt, attempts: 0 });
      }
      if (this.outstanding.size > 0) {
        console.log(`[task-reminder] ${this.outstanding.size} reminder(s) still undelivered`);
      }
    } catch (error) {
      // A corrupt list must not stop reminders working altogether.
      console.error('[task-reminder] could not read undelivered reminders:', error);
    }
  }

  private async persistOutstanding(): Promise<void> {
    try {
      const entries = [...this.outstanding.entries()].map(([id, o]) => ({
        id,
        firstAnnouncedAt: o.firstAnnouncedAt,
      }));
      await this.storage.setAppState(OUTSTANDING_KEY, JSON.stringify(entries));
    } catch (error) {
      console.error('[task-reminder] could not save undelivered reminders:', error);
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

  /**
   * Hold everything while the user has said to leave them alone.
   *
   * A second look at Do Not Disturb outside the governor, and deliberately so.
   * The governor decides whether Mochi *speaks*; this decides whether to bother
   * generating work that would certainly be dropped. Without it, reminders that
   * fall due during Do Not Disturb are announced, dropped, and then aged out by
   * the ten-minute give-up deadline — losing them exactly the way the delivery
   * confirmation was built to prevent.
   *
   * Safe as a duplicate check because it can only ever make Mochi quieter. A
   * second check that can only suppress is harmless; one that can only permit is
   * the kind that turns one bypass into ten.
   */
  private silenced(): boolean {
    return this.settings.get().doNotDisturb === true;
  }

  private async check(): Promise<void> {
    // A slow database read must not overlap itself and deliver twice.
    if (this.checking) return;
    this.checking = true;
    try {
      if (this.silenced()) {
        // Nothing is scanned, the watermark does not move, and the give-up clock
        // is pushed on so it measures time the user was actually available rather
        // than wall time. Do Not Disturb delays reminders; it must not eat them.
        for (const [taskId, held] of this.outstanding) {
          this.outstanding.set(taskId, {
            ...held,
            firstAnnouncedAt: held.firstAnnouncedAt + TICK_MS,
          });
        }
        return;
      }

      if (this.deliveredThrough === null) {
        this.deliveredThrough = await this.loadWatermark();
      }
      await this.loadOutstanding();

      const now = new Date();
      const tasks = await this.storage.listTasks();
      const due = remindersDue(tasks, now, this.deliveredThrough);

      // Advance in memory even when nothing fired, so the window does not keep
      // rescanning the same stretch. Safe to move past a reminder that has not
      // landed yet, because `outstanding` is what keeps hold of it.
      this.deliveredThrough = now.getTime();

      const retried = this.retryUndelivered(tasks, now.getTime());
      for (const task of due) this.announce(task, now.getTime());

      if (due.length === 0 && retried === 0) return;

      // Persisted only after something was actually announced. Writing on every
      // tick would be a database round-trip every 20 seconds for no gain: if
      // nothing fired, there is nothing a restart could repeat.
      await this.storage.setAppState(WATERMARK_KEY, String(this.deliveredThrough));
      await this.persistOutstanding();
    } catch (error) {
      console.error('[task-reminder] could not read tasks:', error);
    } finally {
      this.checking = false;
    }
  }

  /**
   * Say the held reminders again. Returns how many were re-announced.
   *
   * Retried in place rather than by rewinding the watermark, because rewinding
   * would re-deliver every reminder in the same batch — including the ones the
   * user has already seen and dealt with.
   */
  private retryUndelivered(tasks: readonly Task[], now: number): number {
    if (this.outstanding.size === 0) return 0;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    let retried = 0;

    for (const [taskId, held] of [...this.outstanding]) {
      const task = byId.get(taskId);

      // Finished or deleted while we were trying. Nagging about a task the user
      // has already dealt with is worse than the missed reminder.
      if (task === undefined || !isOpen(task)) {
        this.outstanding.delete(taskId);
        continue;
      }

      if (now - held.firstAnnouncedAt > DELIVERY_DEADLINE_MS) {
        this.outstanding.delete(taskId);
        console.error(
          `[task-reminder] giving up on "${task.title}" — never reached the screen after ` +
            `${held.attempts} attempt(s) over ${Math.round((now - held.firstAnnouncedAt) / 60_000)} min`,
        );
        continue;
      }

      console.log(
        `[task-reminder] retrying "${task.title}" (attempt ${held.attempts + 1}, not yet seen)`,
      );
      // Counted before the emit. A listener that presents synchronously confirms
      // during the emit, and writing the attempt afterwards would put the entry
      // straight back — resurrecting a reminder the user had just been shown.
      this.outstanding.set(taskId, { ...held, attempts: held.attempts + 1 });
      this.emitFor(task);
      retried += 1;
    }
    return retried;
  }

  private announce(task: Task, now: number): void {
    console.log(`[task-reminder] firing reminder for "${task.title}"`);

    // Held until something confirms it reached the screen. Recorded before the
    // emit, so a listener that presents synchronously can confirm it straight
    // back out again.
    if (this.outstanding.size < MAX_OUTSTANDING) {
      this.outstanding.set(task.id, { firstAnnouncedAt: now, attempts: 1 });
    } else {
      console.error(
        `[task-reminder] ${this.outstanding.size} reminders already undelivered — ` +
          `"${task.title}" will not be retried if it does not land`,
      );
    }

    this.emitFor(task);
  }

  private emitFor(task: Task): void {
    this.bus.emit(
      makeEvent({
        source: 'routine',
        kind: 'break',
        at: Date.now(),
        // Keyed by task, so the governor can tell two reminders apart.
        subject: `task-reminder:${task.id}`,
        priority: 'high',
        text: `⏰ ${task.title}`,
        // The user asked for this at this exact time, so it is not rationed by
        // the hourly budget — but "leave me alone" still means that. Not
        // recurring: it has one chance, so deferring it out of quiet hours would
        // destroy it rather than delay it.
        origin: 'scheduled',
      }),
    );

    if (this.settings.get().centerScreenAlerts !== false) {
      void this.overlay.performMagicianAlert(6000);
    }
  }
}
