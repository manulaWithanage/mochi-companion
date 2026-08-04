/**
 * The day as one finishable list.
 *
 * The problem this solves is not that any single screen was too busy. It is that
 * "what do I need to do today" lived in three places — tasks on the Tasks tab,
 * replies on the Gmail tab, meetings on the Calendar tab — so the only way to
 * answer it was to visit all three and hold the result in your head. Each list
 * was individually reasonable and the sum was overwhelming.
 *
 * **Two groups, and the split is the whole point.**
 *
 * `needsYou` is work: it can be finished, it is counted, and the count reaches
 * zero. `schedule` is what merely happens: meetings occur whether or not you do
 * anything, so they carry no checkbox and are never counted.
 *
 * Putting a meeting in the checklist was tempting — it makes the list look
 * fuller and the day look busier — but a tick box next to something you cannot
 * complete is a lie that makes the count meaningless. A number that can reach
 * zero is the one thing an inbox never gives you, and it only works if
 * everything in it is genuinely finishable.
 */

import { needsReplyReminder } from '../google/email-reminders.js';
import type { CachedInboxItem } from '../google/email-state.js';
import { isBusy, type CalendarEvent } from '../calendar/calendar.js';
import { isOpen, taskDay, type Task } from '../tasks/tasks.js';

export type AgendaKind = 'email' | 'task' | 'event';

export interface AgendaItem {
  /** Stable within a kind. Prefixed, so ids from different sources cannot collide. */
  readonly id: string;
  readonly kind: AgendaKind;
  readonly title: string;
  /** Where it came from and when, in a few words: `Sarah · 2 hours ago`. */
  readonly detail: string;
  /** What it is anchored to, for ordering. Null when it has no time at all. */
  readonly at: number | null;
  /** Past its moment. Drives emphasis rather than a separate overdue list. */
  readonly late: boolean;
}

export interface Agenda {
  /** Finishable work. The count that reaches zero. */
  readonly needsYou: readonly AgendaItem[];
  /** Things that happen to you. Never checkable, never counted. */
  readonly schedule: readonly AgendaItem[];
}

export interface AgendaInput {
  readonly tasks: readonly Task[];
  readonly emails: readonly CachedInboxItem[];
  readonly events: readonly CalendarEvent[];
  readonly now: Date;
}

/**
 * How long ago, in words a person would use.
 *
 * Rounded deliberately coarsely. "2 hours ago" is what you need to judge whether
 * a reply is late; "2 hours 14 minutes ago" is noise dressed as precision.
 */
export function describeAge(from: number, now: number): string {
  const ms = now - from;
  if (ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Local `HH:mm`, 24-hour, for anchoring a row to a moment. */
function hhmm(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * A reply the user still owes.
 *
 * `needsReplyReminder` decides whether the classifier thinks a reply is wanted,
 * but it says nothing about whether the user has since dealt with it — so
 * replied and dismissed have to be filtered here or answered mail would sit in
 * the list for ever, which is precisely the pile it exists to prevent.
 */
function awaitingReply(email: CachedInboxItem): boolean {
  if (!needsReplyReminder(email)) return false;
  const state = email.reminder?.state;
  return state !== 'replied' && state !== 'dismissed';
}

function emailItem(email: CachedInboxItem, now: number): AgendaItem {
  const who = email.fromName.trim().length > 0 ? email.fromName.trim() : email.fromAddress;
  return {
    id: `email:${email.emailId}`,
    kind: 'email',
    title: email.subject.trim().length > 0 ? email.subject : '(no subject)',
    detail: `${who} · ${describeAge(email.receivedAt, now)}`,
    at: email.receivedAt,
    // An unanswered reply is late once it is a day old. Before that it is simply
    // recent, and shouting about a mail from an hour ago trains people to ignore
    // the emphasis.
    late: now - email.receivedAt > 24 * 60 * 60_000,
  };
}

function taskItem(task: Task, now: Date): AgendaItem {
  const today = taskDay(now);
  const isLate = task.dueOn !== null && task.dueOn < today;
  const detail =
    task.remindAt !== null
      ? isLate
        ? `was due ${hhmm(task.remindAt)}`
        : `at ${hhmm(task.remindAt)}`
      : isLate
        ? 'overdue'
        : 'due today';

  return {
    id: `task:${task.id}`,
    kind: 'task',
    title: task.title,
    detail,
    at: task.remindAt,
    late: isLate,
  };
}

function eventItem(event: CalendarEvent, now: number): AgendaItem {
  const running = event.startsAt <= now && event.endsAt > now;
  return {
    id: `event:${event.id}`,
    kind: 'event',
    title: event.title,
    detail: running ? 'on now' : hhmm(event.startsAt),
    at: event.startsAt,
    // Not "late" — a meeting you missed is not a task you owe. Marking it late
    // would put a red row in the day that no action can ever clear.
    late: false,
  };
}

/**
 * Order for a list someone reads top to bottom.
 *
 * Late first, because it is the only group where the order is also the urgency.
 * Then by time. Anything with no time sits at the bottom rather than being
 * sprinkled through the timed items, where it reads as though it had a slot.
 */
function byUrgency(a: AgendaItem, b: AgendaItem): number {
  if (a.late !== b.late) return a.late ? -1 : 1;
  if (a.at === null && b.at === null) return a.title.localeCompare(b.title);
  if (a.at === null) return 1;
  if (b.at === null) return -1;
  if (a.at !== b.at) return a.at - b.at;
  return a.title.localeCompare(b.title);
}

/**
 * Events that overlap today, so a meeting already running still shows.
 *
 * `isBusy` rather than a local filter: it already drops cancelled, declined and
 * all-day entries, and each of those exclusions exists because including it made
 * a day look busier than it was. A birthday is not a commitment.
 */
function todaysEvents(events: readonly CalendarEvent[], now: Date): readonly CalendarEvent[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const from = start.getTime();
  const to = end.getTime();
  return events.filter((e) => isBusy(e) && e.startsAt < to && e.endsAt > from);
}

export function buildAgenda({ tasks, emails, events, now }: AgendaInput): Agenda {
  const at = now.getTime();
  const today = taskDay(now);

  // Overdue included on purpose. A task that was due yesterday is still work you
  // owe today, and hiding it until you visit the Tasks tab is how it stays
  // undone.
  const dueOrLate = tasks.filter((t) => isOpen(t) && t.dueOn !== null && t.dueOn <= today);

  const needsYou = [
    ...emails.filter(awaitingReply).map((e) => emailItem(e, at)),
    ...dueOrLate.map((t) => taskItem(t, now)),
  ].sort(byUrgency);

  const schedule = todaysEvents(events, now)
    .map((e) => eventItem(e, at))
    .sort(byUrgency);

  return { needsYou, schedule };
}
