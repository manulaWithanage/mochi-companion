import { describe, expect, it } from 'vitest';
import { EventBus, InMemoryStorageAdapter, createTask, type Task } from '@mochi/core';
import { TaskReminderScheduler } from './task-reminder-scheduler.js';
import type { SettingsStore } from '../storage/settings-store.js';
import type { OverlayWindow } from '../windows/overlay.js';

/**
 * The bug these exist for: the watermark was initialised to `now - 4h` in the
 * constructor and never persisted, so every launch re-armed a four-hour window
 * and re-delivered anything inside it. Restart the app twice in an afternoon
 * and the same reminder arrived twice.
 */

/** Enough of a settings store for the scheduler; it only reads one flag. */
const settingsStub = {
  get: () => ({ centerScreenAlerts: false }),
} as unknown as SettingsStore;

/** The overlay is never touched because centerScreenAlerts is off. */
const overlayStub = {} as unknown as OverlayWindow;

function taskDueAt(id: string, remindAt: number): Task {
  const result = createTask({ id, title: `Task ${id}`, now: new Date(remindAt), remindAt });
  if (!result.ok) throw new Error(result.error);
  return result.task;
}

/** Count the reminders a scheduler delivers in one pass over the bus. */
async function deliveredBy(storage: InMemoryStorageAdapter): Promise<number> {
  const bus = new EventBus();
  let count = 0;
  bus.subscribe(() => {
    count += 1;
  });

  const scheduler = new TaskReminderScheduler(bus, storage, settingsStub, overlayStub);
  scheduler.start();
  // start() kicks off the first check without awaiting it.
  await new Promise((resolve) => setTimeout(resolve, 30));
  scheduler.stop();
  return count;
}

describe('task reminders across a restart', () => {
  it('does not deliver the same reminder again on the next launch', async () => {
    const storage = new InMemoryStorageAdapter();
    // Due an hour ago: inside the catch-up window, so a fresh install fires it.
    await storage.saveTask(taskDueAt('a', Date.now() - 60 * 60_000));

    const first = await deliveredBy(storage);
    expect(first).toBe(1);

    // A brand new scheduler over the same storage — i.e. the app restarting.
    const second = await deliveredBy(storage);
    expect(second).toBe(0);
  });

  it('still delivers one that fell due while the app was closed', async () => {
    // The watermark is set explicitly rather than by running once first: a
    // real "app was closed" gap is hours, and a test that tries to squeeze one
    // into the milliseconds between two runs is only testing its own timing.
    const storage = new InMemoryStorageAdapter();
    const twoHoursAgo = Date.now() - 2 * 60 * 60_000;
    await storage.setAppState('task_reminders_delivered_through', String(twoHoursAgo));

    // Due after the app last delivered anything, but before now — exactly the
    // reminder that would be lost if a missed one were simply dropped.
    await storage.saveTask(taskDueAt('missed', Date.now() - 60 * 60_000));

    expect(await deliveredBy(storage)).toBe(1);
  });

  it('ignores a reminder already ticked off', async () => {
    const storage = new InMemoryStorageAdapter();
    const task = taskDueAt('a', Date.now() - 60 * 60_000);
    await storage.saveTask({ ...task, doneAt: Date.now() });

    expect(await deliveredBy(storage)).toBe(0);
  });

  it('does not dump a backlog when the stored watermark is ancient', async () => {
    // A week-old watermark must not make the first check deliver everything
    // since; the catch-up window is the floor.
    const storage = new InMemoryStorageAdapter();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60_000;
    await storage.setAppState('task_reminders_delivered_through', String(weekAgo));
    await storage.saveTask(taskDueAt('old', Date.now() - 6 * 24 * 60 * 60_000));

    expect(await deliveredBy(storage)).toBe(0);
  });
});
