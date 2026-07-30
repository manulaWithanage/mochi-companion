import type { CachedInboxItem, EmailReminderState } from './email-state.js';

export const EMAIL_REMINDER_PREFIX = 'email:reply:';
export const URGENT_FIRST_REMINDER_MS = 10 * 60_000;
export const URGENT_FOLLOW_UP_MS = 90 * 60_000;
export const REVIEW_FIRST_REMINDER_MS = 4 * 60 * 60_000;
export const EMAIL_REMINDER_STALE_MS = 3 * 24 * 60 * 60_000;
const REPLAN_GRACE_MS = 60_000;

export interface EmailReminderTiming {
  readonly urgentFirstReminderMs: number;
  readonly reviewFirstReminderMs: number;
  readonly replanGraceMs: number;
}

export const DEFAULT_EMAIL_REMINDER_TIMING: EmailReminderTiming = {
  urgentFirstReminderMs: URGENT_FIRST_REMINDER_MS,
  reviewFirstReminderMs: REVIEW_FIRST_REMINDER_MS,
  replanGraceMs: REPLAN_GRACE_MS,
};

export interface PlannedEmailReminder {
  readonly at: number;
  readonly state: EmailReminderState;
}

export function needsReplyReminder(email: CachedInboxItem): boolean {
  return (
    email.priority !== null &&
    email.priority.replyLikely &&
    email.priority.confidence >= 0.75 &&
    (email.priority.tier === 'urgent' || email.priority.tier === 'review') &&
    email.inInbox
  );
}

export function planEmailReminder(
  email: CachedInboxItem,
  existing: EmailReminderState | null,
  now: number,
  timing: EmailReminderTiming = DEFAULT_EMAIL_REMINDER_TIMING,
): PlannedEmailReminder | null {
  if (!needsReplyReminder(email)) return null;
  if (existing?.state === 'dismissed' || existing?.state === 'replied') return null;
  if (now - email.receivedAt > EMAIL_REMINDER_STALE_MS) return null;

  const maxReminders = email.priority?.tier === 'urgent' ? 2 : 1;
  const reminderCount = existing?.reminderCount ?? 0;
  if (reminderCount >= maxReminders) return null;

  const initialDelay =
    email.priority?.tier === 'urgent' ? timing.urgentFirstReminderMs : timing.reviewFirstReminderMs;
  let at = email.receivedAt + initialDelay;
  if (existing?.nextReminderAt !== null && existing?.nextReminderAt !== undefined) {
    at = existing.nextReminderAt;
  }
  if (existing?.snoozedUntil !== null && existing?.snoozedUntil !== undefined) {
    at = Math.max(at, existing.snoozedUntil);
  }
  // A reminder missed during sleep is re-planned gently instead of firing in
  // a burst the moment the machine wakes.
  if (at <= now) at = now + timing.replanGraceMs;

  return {
    at,
    state: {
      account: email.account,
      emailId: email.emailId,
      threadId: email.threadId,
      state: existing?.state === 'draft-ready' ? 'draft-ready' : 'pending',
      nextReminderAt: at,
      lastRemindedAt: existing?.lastRemindedAt ?? null,
      reminderCount,
      snoozedUntil: existing?.snoozedUntil ?? null,
      dismissedAt: null,
      repliedAt: null,
    },
  };
}

export function afterEmailReminderFired(
  state: EmailReminderState,
  tier: 'urgent' | 'review' | 'low',
  now: number,
): EmailReminderState {
  const reminderCount = state.reminderCount + 1;
  const hasFollowUp = tier === 'urgent' && reminderCount < 2;
  return {
    ...state,
    lastRemindedAt: now,
    reminderCount,
    nextReminderAt: hasFollowUp ? now + URGENT_FOLLOW_UP_MS : null,
    snoozedUntil: null,
  };
}
