import { describe, expect, it } from 'vitest';
import { EventBus, InMemoryStorageAdapter, createTask, type Task } from '@mochi/core';
import { TaskReminderScheduler } from './task-reminder-scheduler.js';
import type { SettingsStore } from '../storage/settings-store.js';
import type { OverlayWindow } from '../windows/overlay.js';

/**
 * Two bugs these exist for.
 *
 * The watermark was initialised to `now - 4h` in the constructor and never
 * persisted, so every launch re-armed a four-hour window and re-delivered
 * anything inside it. Restart the app twice in an afternoon and the same
 * reminder arrived twice.
 *
 * Then, once it was persisted, the opposite: the watermark advanced when the
 * event went on the bus, which is not the same as the user seeing anything. The
 * overlay window is created late in bootstrap, after this starts ticking, so a
 * reminder caught up at launch could be emitted into a window that did not exist
 * — and the watermark had already moved past it.
 */

/** Enough of a settings store for the scheduler; it reads two flags. */
const settingsStub = {
  get: () => ({ centerScreenAlerts: false, doNotDisturb: false }),
} as unknown as SettingsStore;

/** Do Not Disturb on. */
const silencedStub = {
  get: () => ({ centerScreenAlerts: false, doNotDisturb: true }),
} as unknown as SettingsStore;

/** The overlay is never touched because centerScreenAlerts is off. */
const overlayStub = {} as unknown as OverlayWindow;

const WATERMARK_KEY = 'task_reminders_delivered_through';
const OUTSTANDING_KEY = 'task_reminders_outstanding';

function taskDueAt(id: string, remindAt: number): Task {
  const result = createTask({ id, title: `Task ${id}`, now: new Date(remindAt), remindAt });
  if (!result.ok) throw new Error(result.error);
  return result.task;
}

interface RunResult {
  /** Subjects that reached the bus. */
  readonly emitted: readonly string[];
  readonly outstanding: number;
}

/**
 * One launch of the app over the given storage.
 *
 * `confirm` decides whether the listener reports the bubble as displayed, which
 * is what the real dispatch does only when the overlay actually took it.
 */
async function launch(
  storage: InMemoryStorageAdapter,
  { confirm = true, silenced = false }: { confirm?: boolean; silenced?: boolean } = {},
): Promise<RunResult> {
  const bus = new EventBus();
  const emitted: string[] = [];
  let scheduler: TaskReminderScheduler | null = null;

  bus.subscribe((event) => {
    emitted.push(event.subject);
    if (confirm) scheduler?.confirmDelivered(event.subject);
  });

  scheduler = new TaskReminderScheduler(
    bus,
    storage,
    silenced ? silencedStub : settingsStub,
    overlayStub,
  );
  scheduler.start();
  // start() kicks off the first check without awaiting it.
  await new Promise((resolve) => setTimeout(resolve, 30));
  scheduler.stop();
  return { emitted, outstanding: scheduler.outstandingCount };
}

describe('task reminders across a restart', () => {
  it('does not deliver the same reminder again on the next launch', async () => {
    const storage = new InMemoryStorageAdapter();
    // Due an hour ago: inside the catch-up window, so a fresh install fires it.
    await storage.saveTask(taskDueAt('a', Date.now() - 60 * 60_000));

    const first = await launch(storage);
    expect(first.emitted).toEqual(['task-reminder:a']);

    // A brand new scheduler over the same storage — i.e. the app restarting.
    const second = await launch(storage);
    expect(second.emitted).toEqual([]);
  });

  it('still delivers one that fell due while the app was closed', async () => {
    // The watermark is set explicitly rather than by running once first: a
    // real "app was closed" gap is hours, and a test that tries to squeeze one
    // into the milliseconds between two runs is only testing its own timing.
    const storage = new InMemoryStorageAdapter();
    const twoHoursAgo = Date.now() - 2 * 60 * 60_000;
    await storage.setAppState(WATERMARK_KEY, String(twoHoursAgo));

    // Due after the app last delivered anything, but before now — exactly the
    // reminder that would be lost if a missed one were simply dropped.
    await storage.saveTask(taskDueAt('missed', Date.now() - 60 * 60_000));

    expect((await launch(storage)).emitted).toEqual(['task-reminder:missed']);
  });

  it('ignores a reminder already ticked off', async () => {
    const storage = new InMemoryStorageAdapter();
    const task = taskDueAt('a', Date.now() - 60 * 60_000);
    await storage.saveTask({ ...task, doneAt: Date.now() });

    expect((await launch(storage)).emitted).toEqual([]);
  });

  it('does not dump a backlog when the stored watermark is ancient', async () => {
    // A week-old watermark must not make the first check deliver everything
    // since; the catch-up window is the floor.
    const storage = new InMemoryStorageAdapter();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60_000;
    await storage.setAppState(WATERMARK_KEY, String(weekAgo));
    await storage.saveTask(taskDueAt('old', Date.now() - 6 * 24 * 60 * 60_000));

    expect((await launch(storage)).emitted).toEqual([]);
  });
});

describe('a reminder that never reached the screen', () => {
  it('is held rather than counted as delivered', async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.saveTask(taskDueAt('a', Date.now() - 60 * 60_000));

    const run = await launch(storage, { confirm: false });

    expect(run.emitted).toEqual(['task-reminder:a']);
    expect(run.outstanding).toBe(1);
  });

  it('survives a restart, even though the watermark has moved past it', async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.saveTask(taskDueAt('a', Date.now() - 60 * 60_000));

    await launch(storage, { confirm: false });

    // The watermark is now ~now, so remindersDue() finds nothing. The only way
    // this fires again is the held list — which is the whole point.
    const watermark = Number(await storage.getAppState(WATERMARK_KEY));
    expect(watermark).toBeGreaterThan(Date.now() - 60_000);

    const second = await launch(storage);
    expect(second.emitted).toEqual(['task-reminder:a']);
    expect(second.outstanding).toBe(0);
  });

  it('stops being held once it is confirmed', async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.saveTask(taskDueAt('a', Date.now() - 60 * 60_000));

    await launch(storage, { confirm: false });
    await launch(storage); // confirms this time

    // Third launch: nothing left to say.
    expect((await launch(storage)).emitted).toEqual([]);
  });

  it('is dropped if the task is completed before it lands', async () => {
    // Nagging about something the user has already dealt with is worse than the
    // missed reminder.
    const storage = new InMemoryStorageAdapter();
    const task = taskDueAt('a', Date.now() - 60 * 60_000);
    await storage.saveTask(task);

    await launch(storage, { confirm: false });
    await storage.saveTask({ ...task, doneAt: Date.now() });

    const second = await launch(storage);
    expect(second.emitted).toEqual([]);
    expect(second.outstanding).toBe(0);
  });

  it('is given up on rather than retried for ever', async () => {
    // Retrying an hour later is its own kind of wrong.
    const storage = new InMemoryStorageAdapter();
    const task = taskDueAt('stale', Date.now() - 2 * 60 * 60_000);
    await storage.saveTask(task);
    await storage.setAppState(WATERMARK_KEY, String(Date.now()));
    await storage.setAppState(
      OUTSTANDING_KEY,
      JSON.stringify([{ id: 'stale', firstAnnouncedAt: Date.now() - 30 * 60_000 }]),
    );

    const run = await launch(storage);
    expect(run.emitted).toEqual([]);
    expect(run.outstanding).toBe(0);
  });

  it('shrugs off a corrupt held list instead of failing shut', async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.setAppState(OUTSTANDING_KEY, 'not json at all');
    await storage.saveTask(taskDueAt('a', Date.now() - 60 * 60_000));

    // The due reminder still fires.
    expect((await launch(storage)).emitted).toEqual(['task-reminder:a']);
  });

  it('ignores a confirmation for something that is not a task reminder', async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.saveTask(taskDueAt('a', Date.now() - 60 * 60_000));

    const bus = new EventBus();
    const scheduler = new TaskReminderScheduler(bus, storage, settingsStub, overlayStub);
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 30));

    scheduler.confirmDelivered('greeting');
    scheduler.confirmDelivered('mail-thread:abc');
    scheduler.stop();

    // Still held: nothing confirmed the reminder itself.
    expect(scheduler.outstandingCount).toBe(1);
  });
});

describe('do not disturb', () => {
  it('says nothing while it is on', async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.saveTask(taskDueAt('a', Date.now() - 60 * 60_000));

    expect((await launch(storage, { silenced: true })).emitted).toEqual([]);
  });

  it('delivers it once do not disturb is lifted', async () => {
    // Delays, never eats. Before scheduled events respected DND at all this was
    // moot — everything got through — so this is the guarantee that replaces it.
    const storage = new InMemoryStorageAdapter();
    await storage.saveTask(taskDueAt('a', Date.now() - 60 * 60_000));

    await launch(storage, { silenced: true });
    expect((await launch(storage)).emitted).toEqual(['task-reminder:a']);
  });

  it('does not advance the watermark while silenced', async () => {
    // Advancing it would skip past everything that fell due during the quiet
    // period, which is the silent loss this whole path exists to avoid.
    const storage = new InMemoryStorageAdapter();
    const before = await storage.getAppState(WATERMARK_KEY);

    await storage.saveTask(taskDueAt('a', Date.now() - 60 * 60_000));
    await launch(storage, { silenced: true });

    expect(await storage.getAppState(WATERMARK_KEY)).toBe(before);
  });
});
