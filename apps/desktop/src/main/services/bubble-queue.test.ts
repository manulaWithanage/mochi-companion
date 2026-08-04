import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BubbleAction } from '@mochi/core';
import { BubbleQueue, MAX_WAITING, type QueuedBubble } from './bubble-queue.js';
import type { OfferedAction } from './bubble-actions.js';

/**
 * The hole these close: a second alert arriving while a reminder was unanswered
 * replaced it, and `BubbleActions.offer` had already retired the first bubble's
 * button ids — so the reminder was gone and nothing said so.
 */

/** Mints ids the way BubbleActions does, so ordering can be asserted. */
function makeOffer(): (actions: readonly OfferedAction[]) => BubbleAction[] {
  let n = 0;
  return (actions) =>
    actions.map((a) => {
      n += 1;
      return { id: `act-${n}`, label: a.label };
    });
}

const ACTION: OfferedAction = { label: 'Done', run: () => undefined };

function question(subject: string, onPresent = vi.fn()): QueuedBubble {
  return { subject, actions: [ACTION], present: onPresent };
}

function notice(subject: string, onPresent = vi.fn()): QueuedBubble {
  return { subject, actions: [], present: onPresent };
}

describe('a question holds the floor', () => {
  it('shows the first one immediately', () => {
    const queue = new BubbleQueue(makeOffer());
    const shown = vi.fn();

    expect(queue.present(question('task-reminder:a', shown))).toBe('shown');
    expect(shown).toHaveBeenCalledOnce();
    expect(queue.pendingSubject).toBe('task-reminder:a');
  });

  it('queues a second question instead of replacing the first', () => {
    const queue = new BubbleQueue(makeOffer());
    const second = vi.fn();

    queue.present(question('task-reminder:a'));
    expect(queue.present(question('task-reminder:b', second))).toBe('queued');

    // Not on screen yet, and the first is still the one being asked.
    expect(second).not.toHaveBeenCalled();
    expect(queue.pendingSubject).toBe('task-reminder:a');
    expect(queue.waitingCount).toBe(1);
  });

  it('shows the queued one once the first is answered', () => {
    const queue = new BubbleQueue(makeOffer());
    const second = vi.fn();

    queue.present(question('task-reminder:a'));
    queue.present(question('task-reminder:b', second));

    queue.resolvePending();

    expect(second).toHaveBeenCalledOnce();
    expect(queue.pendingSubject).toBe('task-reminder:b');
    expect(queue.waitingCount).toBe(0);
  });

  it('releases on a dismissal too — waved away is still resolved', () => {
    const queue = new BubbleQueue(makeOffer());
    const second = vi.fn();

    queue.present(question('task-reminder:a'));
    queue.present(question('task-reminder:b', second));

    queue.resolve('task-reminder:a');

    expect(second).toHaveBeenCalledOnce();
  });

  it('serves them in the order they arrived', () => {
    const queue = new BubbleQueue(makeOffer());
    const order: string[] = [];
    const track = (s: string) => () => order.push(s);

    queue.present({ subject: 'a', actions: [ACTION], present: track('a') });
    queue.present({ subject: 'b', actions: [ACTION], present: track('b') });
    queue.present({ subject: 'c', actions: [ACTION], present: track('c') });

    queue.resolvePending();
    queue.resolvePending();

    expect(order).toEqual(['a', 'b', 'c']);
  });
});

describe('what does not get queued', () => {
  it('drops an informational bubble rather than making it wait', () => {
    // A greeting is only worth saying while it is true. Ten minutes late behind
    // a reminder is worse than not at all.
    const queue = new BubbleQueue(makeOffer());
    const greeting = vi.fn();

    queue.present(question('task-reminder:a'));

    expect(queue.present(notice('greeting', greeting))).toBe('dropped');
    expect(greeting).not.toHaveBeenCalled();
    expect(queue.waitingCount).toBe(0);
  });

  it('shows an informational bubble when the floor is free', () => {
    const queue = new BubbleQueue(makeOffer());
    const greeting = vi.fn();

    expect(queue.present(notice('greeting', greeting))).toBe('shown');
    expect(greeting).toHaveBeenCalledOnce();
    // It does not hold the floor: nothing tells main when it expires, so
    // treating it as pending would block the queue for ever.
    expect(queue.pendingSubject).toBeNull();
  });

  it('drops a re-poll of the subject already being asked', () => {
    const queue = new BubbleQueue(makeOffer());
    queue.present(question('task-reminder:a'));

    expect(queue.present(question('task-reminder:a'))).toBe('dropped');
    expect(queue.waitingCount).toBe(0);
  });

  it('drops a duplicate of something already waiting', () => {
    // Otherwise the user answers the same question twice.
    const queue = new BubbleQueue(makeOffer());
    queue.present(question('a'));
    queue.present(question('b'));

    expect(queue.present(question('b'))).toBe('dropped');
    expect(queue.waitingCount).toBe(1);
  });

  it('stops queueing at the cap', () => {
    const queue = new BubbleQueue(makeOffer());
    queue.present(question('on-screen'));
    for (let i = 0; i < MAX_WAITING; i += 1) {
      expect(queue.present(question(`q${i}`))).toBe('queued');
    }

    expect(queue.present(question('overflow'))).toBe('dropped');
    expect(queue.waitingCount).toBe(MAX_WAITING);
  });
});

describe('action ids', () => {
  it('are minted when a bubble reaches the screen, not when it is queued', () => {
    // The registry must only ever describe what is genuinely on screen, because
    // offer() retires whatever it held before.
    const offer = vi.fn(makeOffer());
    const queue = new BubbleQueue(offer);

    queue.present(question('a'));
    expect(offer).toHaveBeenCalledOnce();

    queue.present(question('b'));
    expect(offer).toHaveBeenCalledOnce(); // still one: b is only queued

    queue.resolvePending();
    expect(offer).toHaveBeenCalledTimes(2);
  });

  it('hands the presenter the ids minted for it', () => {
    const queue = new BubbleQueue(makeOffer());
    const present = vi.fn();

    queue.present({ subject: 'a', actions: [ACTION], present });

    expect(present).toHaveBeenCalledWith([{ id: 'act-1', label: 'Done' }]);
  });
});

describe('resolving the wrong thing', () => {
  it('ignores a stale dismissal for a bubble that has already gone', () => {
    // Otherwise a late dismissal from a previous bubble would clear the question
    // the user is currently looking at.
    const queue = new BubbleQueue(makeOffer());
    queue.present(question('a'));
    queue.resolvePending();
    queue.present(question('b'));

    queue.resolve('a');

    expect(queue.pendingSubject).toBe('b');
  });

  it('is harmless when nothing is pending', () => {
    const queue = new BubbleQueue(makeOffer());
    expect(() => queue.resolvePending()).not.toThrow();
    expect(() => queue.resolve('never-shown')).not.toThrow();
  });

  it('forgets everything on clear', () => {
    const queue = new BubbleQueue(makeOffer());
    queue.present(question('a'));
    queue.present(question('b'));

    queue.clear();

    expect(queue.pendingSubject).toBeNull();
    expect(queue.waitingCount).toBe(0);
  });
});

/**
 * A guard, not a unit test.
 *
 * Holding the floor until the user answers introduces a way to deadlock: a
 * renderer reload takes the bubble off screen and sends no dismissal, so the
 * queue would wait forever for an answer to a question nobody can see, and every
 * later reminder would be held behind it. Silent and total — worse than the
 * replaced-bubble bug the queue exists to fix.
 *
 * The wiring lives in BrowserWindow lifecycle code with no seam to test through,
 * so this reads the source instead.
 */
describe('the reload escape hatch is wired', () => {
  const read = (file: string): string => readFileSync(join(import.meta.dirname, file), 'utf8');

  it('overlay tells someone when the renderer (re)loads', () => {
    const code = read('../windows/overlay.ts');
    expect(code).toMatch(/on\(\s*['"]did-finish-load['"]/);
    expect(code).toMatch(/rendererLoaded\?\.\(\)/);
  });

  it('bootstrap clears the queue on that signal', () => {
    const code = read('../index.ts');
    const handler = /onRendererLoad\(\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{2}\}\)/.exec(code);

    expect(handler, 'index.ts must register overlay.onRendererLoad').not.toBeNull();
    // Both: the queue stops waiting, and the ids for the vanished buttons stop
    // being pressable.
    expect(handler![1]).toMatch(/bubbleQueue\.clear\(\)/);
    expect(handler![1]).toMatch(/bubbleActions\.clear\(\)/);
  });
});
