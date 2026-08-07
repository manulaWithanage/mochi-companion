/**
 * The replies you owe, as a list that can reach zero.
 *
 * The inbox and the replies you owe are different jobs. An inbox is everything
 * that arrived and is never finished; this is work, and it empties. Keeping them
 * in one list is what put seven controls on every row and made six emails feel
 * like sixty.
 *
 * **Grouped by what the mail wants from you, not by how loud it is.**
 * `urgent` and `review` tell you a volume; `deadline`, `action_requested` and
 * `question` tell you what kind of work it is, which is how people actually batch
 * replies. Those come from the rules scorer, so the grouping works with no model
 * configured at all.
 *
 * **Rules are the baseline, the model is a second opinion.** Every email is
 * scored by the heuristics and saved. Only the ambiguous minority is escalated,
 * and a model verdict below 0.75 confidence is discarded. So this is never
 * "degraded mode" — it is the normal path, and `modelChecked` says how much of it
 * the model touched rather than leaving the user to guess.
 */

import { describeSignal } from './email-priority.js';
import { needsReplyReminder } from './email-reminders.js';
import type { CachedInboxItem, EmailPriorityTier } from './email-state.js';

/** Below this the classifier is guessing, and the UI should ask rather than assert. */
const CONFIDENT = 0.75;

/** Unanswered for longer than this reads as late. */
const LATE_AFTER_MS = 24 * 60 * 60_000;

export interface ReplyItem {
  readonly emailId: string;
  /** Gmail's X-GM-THRID, so a row can open the conversation it belongs to. */
  readonly threadId: string;
  readonly subject: string;
  /** Display name where there is one, address otherwise. */
  readonly who: string;
  readonly receivedAt: number;
  /** `2 hours ago`. */
  readonly age: string;
  readonly late: boolean;
  readonly tier: EmailPriorityTier;
  /** Human-readable signal labels, ready to render as chips. */
  readonly signals: readonly string[];
  /** The classifier's prose. Often a restatement of the subject, so shown small. */
  readonly reason: string;
  readonly modelChecked: boolean;
}

export type ReplyGroupId = 'deadline' | 'action' | 'question' | 'thread' | 'other';

export interface ReplyGroup {
  readonly id: ReplyGroupId;
  readonly label: string;
  readonly items: readonly ReplyItem[];
}

export interface ReplyQueue {
  /** Confident enough to state. Empty groups are dropped. */
  readonly groups: readonly ReplyGroup[];
  /** Everything across the groups. The number that reaches zero. */
  readonly total: number;
  /**
   * Suspected but not confidently. Shown apart, as a question.
   *
   * These are invisible today: `needsReplyReminder` requires 0.75, so an email
   * the classifier half-suspected needed an answer appears nowhere at all.
   */
  readonly unsure: readonly ReplyItem[];
  /** How many of `groups` a model actually looked at. */
  readonly modelChecked: number;
}

/**
 * Order matters and is not arbitrary.
 *
 * An email carries several signals at once, so it joins the first group it
 * matches and appears exactly once. A deadline outranks a request because the
 * clock is the part you cannot negotiate; a question comes last of the three
 * because `question` is a bare `/\?/` on the subject and therefore the noisiest
 * of them.
 */
const GROUP_ORDER: readonly { id: ReplyGroupId; label: string; signal: string | null }[] = [
  { id: 'deadline', label: 'Time-sensitive', signal: 'deadline' },
  { id: 'action', label: 'Needs a decision', signal: 'action_requested' },
  { id: 'question', label: 'Waiting on your answer', signal: 'question' },
  { id: 'thread', label: 'Ongoing threads', signal: 'active_conversation' },
  { id: 'other', label: 'Other replies', signal: null },
];

/** How long ago, coarsely. Precision here is noise dressed as detail. */
export function describeAge(from: number, now: number): string {
  const ms = now - from;
  // Clock skew between a mail server and this machine is normal, so a future
  // timestamp is "just now" rather than a negative number.
  if (ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Already answered or waved away. Either way it is not owed any more. */
function settled(email: CachedInboxItem): boolean {
  const state = email.reminder?.state;
  return state === 'replied' || state === 'dismissed';
}

function toItem(email: CachedInboxItem, now: number): ReplyItem {
  const name = email.fromName.trim();
  const raw = email.priority?.signals ?? [];
  return {
    emailId: email.emailId,
    threadId: email.threadId,
    subject: email.subject.trim().length > 0 ? email.subject : '(no subject)',
    who: name.length > 0 ? name : email.fromAddress,
    receivedAt: email.receivedAt,
    age: describeAge(email.receivedAt, now),
    // Shouting about a mail from an hour ago trains people to ignore emphasis.
    late: now - email.receivedAt > LATE_AFTER_MS,
    tier: email.priority?.tier ?? 'low',
    // Negative signals describe why something is *not* important, so they say
    // nothing useful on a row that is already in the list.
    signals: raw
      .filter((s) => !['automated_sender', 'bulk_sender', 'low_attention_category'].includes(s))
      .map(describeSignal),
    reason: email.priority?.reason ?? '',
    modelChecked: raw.includes('llm_refined'),
  };
}

/** Longest-waiting first: the reply most overdue is the one to write next. */
function oldestFirst(a: ReplyItem, b: ReplyItem): number {
  return a.receivedAt - b.receivedAt;
}

export function buildReplyQueue(
  emails: readonly CachedInboxItem[],
  now: number = Date.now(),
): ReplyQueue {
  const live = emails.filter((e) => !settled(e));

  const confident = live.filter(needsReplyReminder);
  const unsure = live
    .filter((e) => {
      if (needsReplyReminder(e)) return false;
      const p = e.priority;
      return (
        p !== null && p.replyLikely && p.confidence < CONFIDENT && p.tier !== 'low' && e.inInbox
      );
    })
    .map((e) => toItem(e, now))
    .sort(oldestFirst);

  const assigned = new Set<string>();
  const groups: ReplyGroup[] = [];

  for (const group of GROUP_ORDER) {
    const items = confident
      .filter((email) => {
        if (assigned.has(email.emailId)) return false;
        if (group.signal === null) return true;
        return (email.priority?.signals ?? []).includes(group.signal);
      })
      .map((email) => {
        assigned.add(email.emailId);
        return toItem(email, now);
      })
      .sort(oldestFirst);

    // An empty heading is furniture. Only groups with something in them appear.
    if (items.length > 0) groups.push({ ...group, items });
  }

  const all = groups.flatMap((g) => g.items);
  return {
    groups,
    total: all.length,
    unsure,
    modelChecked: all.filter((i) => i.modelChecked).length,
  };
}

/**
 * What to say about how this list was put together.
 *
 * Never silently degrades: with no model configured the list is still complete
 * and rules-scored, and saying so beats implying something is missing — or worse,
 * implying a model was involved when none was.
 */
export function describeTriage(queue: ReplyQueue, modelConfigured: boolean): string {
  if (queue.total === 0) return '';
  if (!modelConfigured) {
    return 'Sorted by rules. Connect a model in Settings and Mochi will double-check the borderline ones.';
  }
  if (queue.modelChecked === 0) {
    return `${queue.total} sorted by rules. None were borderline enough to ask the model about.`;
  }
  return `${queue.total} sorted by rules, ${queue.modelChecked} double-checked by the model.`;
}

/**
 * Find a message in what is already cached.
 *
 * There was no way to look for a specific email. You could filter by Gmail
 * category and scroll, and that is not the same as finding the one from Priya
 * about the invoice.
 *
 * Local and synchronous, over the hundred messages already in memory — no IMAP
 * round trip, so it filters as fast as you type. That bounds it honestly too:
 * this searches what Mochi has cached, not your whole mailbox, and the UI says so
 * rather than letting an empty result imply the mail does not exist.
 *
 * Subject, sender name and address. Not the snippet: matching a body fragment the
 * user cannot see in the row produces results that look like mistakes.
 */
export function matchesSearch(email: CachedInboxItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;

  // Every word must appear somewhere, so "priya invoice" narrows rather than
  // widening the way an any-word match would.
  const haystack = `${email.subject} ${email.fromName} ${email.fromAddress}`.toLowerCase();
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}
