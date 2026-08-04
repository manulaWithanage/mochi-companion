import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildAgenda,
  type Agenda,
  type CachedInboxItem,
  type CalendarEvent,
  type Task,
} from '@mochi/core';

/**
 * The day's work, assembled once.
 *
 * Owned by the Dashboard rather than by the Today tab, because the nav badge has
 * to be right while you are looking at some other tab. A hook called from both
 * places would open two sets of subscriptions and, worse, the badge would only
 * become correct after visiting Today — a count that is wrong until you look at
 * it is worse than no count.
 */

export interface AgendaSources {
  readonly agenda: Agenda;
  readonly tasks: readonly Task[];
  /** `null` means "not asked yet", which is not the same as "not connected". */
  readonly gmailConnected: boolean | null;
  readonly calendarConnected: boolean | null;
  /** Refetch mail after acting on a reminder, which the inbox event does not cover. */
  reloadEmails(): void;
}

export function useAgenda(): AgendaSources {
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [emails, setEmails] = useState<readonly CachedInboxItem[]>([]);
  const [events, setEvents] = useState<readonly CalendarEvent[]>([]);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  // "2 hours ago" and "on now" go stale silently without something to re-render.
  const [tick, setTick] = useState(() => Date.now());

  const reloadEmails = useCallback(() => {
    void window.mochi.gmail
      .listCached({ sort: 'priority', limit: 50 })
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

    void window.mochi.calendar.status().then((s) => setCalendarConnected(s.connected));
    void window.mochi.calendar.events().then(setEvents);
    const offCalendar = window.mochi.calendar.onChange((next) => {
      setCalendarConnected(next.connected);
      void window.mochi.calendar.events().then(setEvents);
    });

    const clock = setInterval(() => setTick(Date.now()), 60_000);

    return () => {
      offTasks();
      offInbox();
      offCalendar();
      clearInterval(clock);
    };
  }, [reloadEmails]);

  const agenda = useMemo(
    () => buildAgenda({ tasks, emails, events, now: new Date(tick) }),
    [tasks, emails, events, tick],
  );

  return { agenda, tasks, gmailConnected, calendarConnected, reloadEmails };
}
