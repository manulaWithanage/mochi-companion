/**
 * Buttons on a speech bubble, and what they actually do.
 *
 * The renderer never learns what an action means. Main registers a callback,
 * hands out an opaque id, and the renderer can only echo that id back — so the
 * bubble surface cannot be used to say "mark task X done" or "delete thread Y".
 * It can only press a button that was genuinely offered on the bubble currently
 * on screen (RULE 1: the renderer is untrusted).
 *
 * Only one bubble is ever on screen, so only one set of actions is live. A new
 * bubble replaces the previous set, which means a stale button from a bubble
 * that has already gone cannot fire.
 */

import { toggleDone, type BubbleAction, type MochiEvent, type StorageAdapter } from '@mochi/core';

/** How long "later" means. Long enough to finish a thought, short enough to matter. */
export const SNOOZE_MS = 10 * 60_000;

/** Prefix the task reminder scheduler uses for its subjects. */
const TASK_SUBJECT = 'task-reminder:';

export interface OfferedAction {
  readonly label: string;
  run(): Promise<void> | void;
}

export class BubbleActions {
  private live = new Map<string, () => Promise<void> | void>();
  private counter = 0;

  /**
   * Register a set of actions for the bubble about to be shown.
   *
   * Clears whatever the previous bubble offered: those buttons are gone from
   * the screen, so their ids must stop working.
   */
  offer(actions: readonly OfferedAction[]): BubbleAction[] {
    this.live.clear();
    return actions.map((action) => {
      this.counter += 1;
      const id = `act-${this.counter}`;
      this.live.set(id, action.run);
      return { id, label: action.label };
    });
  }

  async run(id: string): Promise<void> {
    const action = this.live.get(id);
    // An unknown id is not an error worth surfacing: it means the bubble moved
    // on before the click landed.
    if (action === undefined) return;
    // One press per button. Double-clicking "Done" must not toggle it back.
    this.live.delete(id);
    try {
      await action();
    } catch (error) {
      console.error('[bubble-action] failed:', error);
    }
  }

  clear(): void {
    this.live.clear();
  }
}

export interface ActionDeps {
  readonly storage: StorageAdapter;
  /** Re-arms a subject the user may have dismissed earlier in the session. */
  undismiss(subject: string): void;
  /** Push the updated list to open windows. */
  notifyTasks(): Promise<unknown>;
}

/**
 * What can be done about this event, without opening the dashboard.
 *
 * Returning nothing is normal and correct: most of what Mochi says is just
 * information, and a bubble with no buttons is still dismissible by clicking it.
 *
 * The interesting case is a task reminder. Before this, the only possible reply
 * to "⏰ Call the dentist" was to wave it away — which is why a reminder could
 * nag but never be satisfied, and why the honest answer to most reminders
 * ("yes, but in ten minutes") was unexpressible.
 */
export function actionsForEvent(event: MochiEvent, deps: ActionDeps): OfferedAction[] {
  if (!event.subject.startsWith(TASK_SUBJECT)) return [];
  const taskId = event.subject.slice(TASK_SUBJECT.length);
  if (taskId.length === 0) return [];

  return [
    {
      label: 'Done',
      run: async () => {
        const task = (await deps.storage.listTasks()).find((t) => t.id === taskId);
        if (task === undefined) return;
        await deps.storage.saveTask(toggleDone(task, new Date()));
        await deps.notifyTasks();
      },
    },
    {
      label: '10 min',
      run: async () => {
        const task = (await deps.storage.listTasks()).find((t) => t.id === taskId);
        if (task === undefined) return;
        await deps.storage.saveTask({ ...task, remindAt: Date.now() + SNOOZE_MS });
        // The governor keeps dismissals for the whole session. If this subject
        // was waved away earlier, the snoozed reminder would be dropped on
        // arrival and never seen — so re-arm it, because the user just asked
        // for it back.
        deps.undismiss(event.subject);
        await deps.notifyTasks();
      },
    },
  ];
}
