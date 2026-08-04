/**
 * One bubble on screen at a time, and a decision is never overwritten.
 *
 * A bubble carrying buttons is a question. Before this, a second alert arriving
 * while one was unanswered simply replaced it — and because `BubbleActions.offer`
 * retires the previous bubble's ids, the buttons stopped working the instant the
 * new bubble appeared. The reminder was gone and nothing said so, which is the
 * same failure the buttons were added to prevent, arriving by another route.
 *
 * So a pending question holds the floor:
 *
 * - **Another question** waits its turn, in a bounded queue.
 * - **Anything informational** is dropped rather than queued. A greeting or a
 *   nudge is only worth saying while it is true; delivering it ten minutes late
 *   behind a reminder is worse than not delivering it at all.
 *
 * The floor is released when the user answers or dismisses — never on a timer,
 * because timing out a decision is the one outcome the user never chose.
 *
 * This lives in main rather than the renderer because main owns the action
 * registry. A queue in the renderer would still be holding buttons that main
 * had already thrown away.
 *
 * Action ids are minted at presentation, not on arrival: a queued bubble holds
 * its actions unregistered, so the registry only ever describes what is
 * genuinely on screen.
 *
 * Presenting can fail — the overlay window is created late in bootstrap, so a
 * reminder caught up at launch can arrive before there is anything to show it
 * on. A bubble that did not get there does not hold the floor, because no answer
 * to it can ever arrive; it is reported as dropped so the caller can hold onto
 * it and try again.
 */

import type { BubbleAction } from '@mochi/core';
import type { OfferedAction } from './bubble-actions.js';

/**
 * How many unanswered questions may stack up.
 *
 * The governor already rations interruptions — three an hour, with a ninety
 * second floor between them — so two waiting is unusual and three means
 * something upstream is wrong. The cap exists so that walking away mid-decision
 * does not produce a queue of stale alerts on return.
 */
export const MAX_WAITING = 3;

export interface QueuedBubble {
  readonly subject: string;
  /** Unregistered. Ids are minted when this reaches the screen. */
  readonly actions: readonly OfferedAction[];
  /**
   * Put it on screen, with the ids minted for it.
   *
   * Returns false if it did not get there — there is no overlay window yet, or
   * it has been destroyed. A question that never appeared must not hold the
   * floor, because no answer to it can ever arrive.
   */
  present(actions: readonly BubbleAction[]): boolean;
}

export type PresentOutcome = 'shown' | 'queued' | 'dropped';

export class BubbleQueue {
  private pending: string | null = null;
  private waiting: QueuedBubble[] = [];

  constructor(private readonly offer: (actions: readonly OfferedAction[]) => BubbleAction[]) {}

  /** The subject awaiting an answer, or null when the floor is free. */
  get pendingSubject(): string | null {
    return this.pending;
  }

  get waitingCount(): number {
    return this.waiting.length;
  }

  /**
   * Offer a bubble for display.
   *
   * Returns what actually happened, so the caller can log it rather than assume:
   * a dropped alert must never be indistinguishable from a delivered one.
   */
  present(bubble: QueuedBubble): PresentOutcome {
    if (this.pending === null) {
      return this.show(bubble) ? 'shown' : 'dropped';
    }

    // The same subject arriving again is a re-poll, not a second question.
    // Queueing it would make the user answer the same thing twice.
    if (bubble.subject === this.pending) return 'dropped';
    if (this.waiting.some((q) => q.subject === bubble.subject)) return 'dropped';

    // Only questions are worth making someone wait for.
    if (bubble.actions.length === 0) return 'dropped';
    if (this.waiting.length >= MAX_WAITING) return 'dropped';

    this.waiting.push(bubble);
    return 'queued';
  }

  /**
   * The user answered or dismissed. Release the floor, then show what is next.
   *
   * A subject that is not the pending one is ignored: a stale dismissal from a
   * bubble that has already gone must not release a question the user is
   * currently looking at.
   */
  resolve(subject: string): void {
    if (this.pending !== subject) return;
    this.pending = null;

    // Keep going past anything that cannot reach the screen, or one failure
    // would strand everything behind it.
    let next = this.waiting.shift();
    while (next !== undefined && !this.show(next)) {
      next = this.waiting.shift();
    }
  }

  /**
   * Release whatever is on screen.
   *
   * Used when the renderer reports an action press, which carries only an opaque
   * action id and no subject. Exactly one bubble is ever on screen, so the
   * pending subject *is* the one that was acted on — and resolving it this way
   * means the renderer never gets to name which subject to release.
   */
  resolvePending(): void {
    if (this.pending !== null) this.resolve(this.pending);
  }

  /** Nothing is on screen any more — the overlay went away. */
  clear(): void {
    this.pending = null;
    this.waiting = [];
  }

  /** Returns whether it reached the screen. */
  private show(bubble: QueuedBubble): boolean {
    const reached = bubble.present(this.offer(bubble.actions));
    if (!reached) {
      // Nothing is on screen, so nothing can be pressed. Retire the ids that
      // were just minted rather than leaving them live for a bubble nobody saw.
      this.offer([]);
      return false;
    }

    // Only a question holds the floor. Informational bubbles expire on their own
    // in the renderer and main is never told, so treating one as pending would
    // block the queue for ever.
    this.pending = bubble.actions.length > 0 ? bubble.subject : null;
    return true;
  }
}
