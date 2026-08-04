import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildReplyQueue, dueToday, type CachedInboxItem, type Task } from '@mochi/core';

/**
 * How much is waiting on you, for the Overview badge.
 *
 * Owned by the Dashboard rather than by a tab, because the badge has to be right
 * while you are looking at somewhere else. A count that only becomes correct once
 * you visit the page it describes is worse than no count.
 *
 * Tasks due plus replies owed — both things you can finish. Meetings are
 * deliberately excluded: you cannot complete one, so counting them would give a
 * number that never reaches zero, and a badge that never clears is trained
 * wallpaper within a week.
 */
export function useNeedsYou(): number {
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [emails, setEmails] = useState<readonly CachedInboxItem[]>([]);
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
    return dueToday(tasks, now).length + buildReplyQueue(emails, tick).total;
  }, [tasks, emails, tick]);
}
