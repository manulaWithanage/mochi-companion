import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildReplyQueue,
  dueToday,
  type CachedInboxItem,
  type ReplyQueue,
  type Task,
} from '@mochi/core';

/**
 * How much is waiting on you — counted once, for everyone who shows it.
 *
 * The nav badge said 5 while the Overview page showed 4, because the badge and
 * the "Needs a reply" card each did their own fetch and their own filtering:
 * different `limit` (100 against 25), and the card omitted the replied/dismissed
 * check that `buildReplyQueue` applies. Worse, the card's own "N WAITING" label
 * was read from an array it had already truncated to three, so it could never
 * report more than three no matter how many were waiting.
 *
 * So this returns the whole breakdown rather than a number, and the page renders
 * from the same object the badge counts. Two independent counts of the same thing
 * will drift; there is no version of that which stays right.
 *
 * Owned by the Dashboard, because the badge has to be correct while you are
 * looking at a different tab — a count that only becomes true once you visit the
 * page it describes is worse than no count.
 */

export interface NeedsYou {
  /** Badge number: finishable work, tasks plus replies. */
  readonly total: number;
  readonly dueTasks: number;
  readonly replies: ReplyQueue;
  /** `null` until asked — not the same as "not connected". */
  readonly gmailConnected: boolean | null;
}

export function useNeedsYou(): NeedsYou {
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [emails, setEmails] = useState<readonly CachedInboxItem[]>([]);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  // Ages and the day boundary both move on their own.
  const [tick, setTick] = useState(() => Date.now());

  const reloadEmails = useCallback(() => {
    void window.mochi.gmail
      .listCached({ sort: 'priority', limit: 100 })
      .then(setEmails)
      .catch(() => setEmails([]));
  }, []);

  useEffect(() => {
    void window.mochi.tasks.list().then(setTasks);
    const offTasks = window.mochi.tasks.onChange(setTasks);

    void window.mochi.gmail.status().then((s) => {
      setGmailConnected(s.connected);
      if (s.connected) reloadEmails();
    });
    const offInbox = window.mochi.gmail.onInboxChanged(() => reloadEmails());

    const clock = setInterval(() => setTick(Date.now()), 60_000);
    return () => {
      offTasks();
      offInbox();
      clearInterval(clock);
    };
  }, [reloadEmails]);

  return useMemo(() => {
    const now = new Date(tick);
    const replies = buildReplyQueue(emails, tick);
    const dueTasks = dueToday(tasks, now).length;
    return {
      // Meetings are excluded on purpose: you cannot finish one, so counting them
      // would give a badge that never reaches zero.
      total: dueTasks + replies.total,
      dueTasks,
      replies,
      gmailConnected,
    };
  }, [tasks, emails, tick, gmailConnected]);
}
