import { describe, expect, it } from 'vitest';
import {
  InMemoryStorageAdapter,
  InterruptionGovernor,
  createTask,
  isOpen,
  makeEvent,
  type MochiEvent,
} from '@mochi/core';
import { BubbleActions, SNOOZE_MS, actionsForEvent } from './bubble-actions.js';

const TASK_ID = 'task-1';
const SUBJECT = `task-reminder:${TASK_ID}`;

function reminderEvent(subject = SUBJECT): MochiEvent {
  return makeEvent({
    source: 'routine',
    kind: 'break',
    at: Date.now(),
    subject,
    priority: 'high',
    text: '⏰ Call the dentist',
    userInitiated: true,
  });
}

async function setup(): Promise<{
  storage: InMemoryStorageAdapter;
  governor: InterruptionGovernor;
  registry: BubbleActions;
  press(label: string, event?: MochiEvent): Promise<void>;
}> {
  const storage = new InMemoryStorageAdapter();
  const governor = new InterruptionGovernor();
  const registry = new BubbleActions();

  const created = createTask({
    id: TASK_ID,
    title: 'Call the dentist',
    now: new Date(),
    remindAt: Date.now() - 1000,
  });
  if (!created.ok) throw new Error(created.error);
  await storage.saveTask(created.task);

  const press = async (label: string, event = reminderEvent()): Promise<void> => {
    const offered = actionsForEvent(event, {
      storage,
      undismiss: (subject) => governor.undismiss(subject),
      notifyTasks: async () => undefined,
    });
    const ids = registry.offer(offered);
    const target = ids.find((a) => a.label === label);
    if (target === undefined) throw new Error(`no action labelled ${label}`);
    await registry.run(target.id);
  };

  return { storage, governor, registry, press };
}

describe('what a reminder offers', () => {
  it('offers done and a snooze', async () => {
    const { storage, governor } = await setup();
    const labels = actionsForEvent(reminderEvent(), {
      storage,
      undismiss: (s) => governor.undismiss(s),
      notifyTasks: async () => undefined,
    }).map((a) => a.label);

    expect(labels).toEqual(['Done', '10 min']);
  });

  it('offers nothing for events that are only information', async () => {
    const { storage, governor } = await setup();
    const deps = {
      storage,
      undismiss: (s: string) => governor.undismiss(s),
      notifyTasks: async () => undefined,
    };

    // A briefing or a nudge has nothing to act on; a bubble with no buttons is
    // still dismissible by clicking it.
    expect(actionsForEvent(reminderEvent('greeting'), deps)).toEqual([]);
    expect(actionsForEvent(reminderEvent('task-reminder:'), deps)).toEqual([]);
  });
});

describe('Done', () => {
  it('completes the task', async () => {
    const { storage, press } = await setup();
    await press('Done');

    const task = (await storage.listTasks()).find((t) => t.id === TASK_ID);
    expect(task).toBeDefined();
    expect(isOpen(task!)).toBe(false);
  });
});

describe('snooze', () => {
  it('moves the reminder into the future rather than clearing it', async () => {
    const { storage, press } = await setup();
    const before = Date.now();
    await press('10 min');

    const task = (await storage.listTasks()).find((t) => t.id === TASK_ID);
    expect(task!.remindAt).not.toBeNull();
    expect(task!.remindAt!).toBeGreaterThanOrEqual(before + SNOOZE_MS);
    // Still open: snoozing is not finishing.
    expect(isOpen(task!)).toBe(true);
  });

  it('re-arms a subject the user had dismissed earlier', async () => {
    // The trap this exists for: the governor keeps dismissals for the whole
    // session, so without undismiss() a snooze would set a new time and then be
    // dropped on arrival — the user asked for it and nothing would report that
    // it had been discarded.
    const { governor, press } = await setup();
    governor.dismiss(SUBJECT);
    expect(governor.isDismissed(SUBJECT)).toBe(true);

    await press('10 min');

    expect(governor.isDismissed(SUBJECT)).toBe(false);
  });

  it('does not silently un-dismiss when the user only presses Done', async () => {
    // Done means finished, not "raise this again".
    const { governor, press } = await setup();
    governor.dismiss(SUBJECT);

    await press('Done');

    expect(governor.isDismissed(SUBJECT)).toBe(true);
  });
});

describe('the action registry', () => {
  it('only honours ids it issued', async () => {
    const { registry, storage } = await setup();
    // The renderer is untrusted: a fabricated id must do nothing at all.
    await registry.run('act-9999');
    await registry.run('../../etc/passwd');

    const task = (await storage.listTasks()).find((t) => t.id === TASK_ID);
    expect(isOpen(task!)).toBe(true);
  });

  it('runs a button once, so a double click cannot undo itself', async () => {
    const { storage, governor, registry } = await setup();
    const ids = registry.offer(
      actionsForEvent(reminderEvent(), {
        storage,
        undismiss: (s) => governor.undismiss(s),
        notifyTasks: async () => undefined,
      }),
    );
    const done = ids.find((a) => a.label === 'Done')!;

    await registry.run(done.id);
    await registry.run(done.id); // toggleDone would flip it back open

    const task = (await storage.listTasks()).find((t) => t.id === TASK_ID);
    expect(isOpen(task!)).toBe(false);
  });

  it('retires the previous bubble’s buttons when a new one is shown', async () => {
    const { storage, governor, registry } = await setup();
    const deps = {
      storage,
      undismiss: (s: string) => governor.undismiss(s),
      notifyTasks: async () => undefined,
    };

    const stale = registry.offer(actionsForEvent(reminderEvent(), deps));
    registry.offer(actionsForEvent(reminderEvent(), deps)); // a new bubble arrives

    // The old button is gone from the screen, so its id must stop working.
    await registry.run(stale.find((a) => a.label === 'Done')!.id);

    const task = (await storage.listTasks()).find((t) => t.id === TASK_ID);
    expect(isOpen(task!)).toBe(true);
  });

  it('survives an action that throws', async () => {
    const registry = new BubbleActions();
    const [action] = registry.offer([
      {
        label: 'Boom',
        run: () => {
          throw new Error('storage exploded');
        },
      },
    ]);

    await expect(registry.run(action!.id)).resolves.toBeUndefined();
  });
});
