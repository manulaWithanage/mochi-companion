import { describe, expect, it } from 'vitest';
import type { CachedInboxItem, EmailPriorityTier, EmailReminderState } from './email-state.js';
import {
  afterEmailReminderFired,
  DEFAULT_EMAIL_REMINDER_TIMING,
  emailReminderEventPriority,
  planEmailReminder,
  REVIEW_FIRST_REMINDER_MS,
  URGENT_FIRST_REMINDER_MS,
} from './email-reminders.js';

function email(tier: EmailPriorityTier = 'urgent', replyLikely = true): CachedInboxItem {
  return {
    account: 'me@example.com',
    emailId: 'message-1',
    threadId: 'thread-1',
    uid: 1,
    messageId: '<message-1@example.com>',
    fromName: 'Alice',
    fromAddress: 'alice@example.com',
    replyToAddress: 'alice@example.com',
    toAddresses: ['me@example.com'],
    ccAddresses: [],
    subject: 'Can you review this?',
    receivedAt: 1_000,
    category: 'primary',
    labels: [],
    snippet: '',
    unread: true,
    inInbox: true,
    syncedAt: 1_000,
    priority: {
      account: 'me@example.com',
      emailId: 'message-1',
      score: tier === 'urgent' ? 0.8 : tier === 'review' ? 0.5 : 0.2,
      tier,
      confidence: 0.9,
      source: 'rules',
      signals: [],
      reason: 'Action requested',
      replyLikely,
      scorerVersion: 1,
      classifiedAt: 1_000,
    },
    draft: null,
    reminder: null,
  };
}

function reminder(overrides: Partial<EmailReminderState> = {}): EmailReminderState {
  return {
    account: 'me@example.com',
    emailId: 'message-1',
    threadId: 'thread-1',
    state: 'pending',
    nextReminderAt: null,
    lastRemindedAt: null,
    reminderCount: 0,
    snoozedUntil: null,
    dismissedAt: null,
    repliedAt: null,
    ...overrides,
  };
}

describe('planEmailReminder', () => {
  it('plans urgent and review emails at different delays', () => {
    expect(planEmailReminder(email('urgent'), null, 1_000)?.at).toBe(
      1_000 + URGENT_FIRST_REMINDER_MS,
    );
    expect(planEmailReminder(email('review'), null, 1_000)?.at).toBe(
      1_000 + REVIEW_FIRST_REMINDER_MS,
    );
  });

  it('supports a short urgent delay for development testing', () => {
    const timing = {
      ...DEFAULT_EMAIL_REMINDER_TIMING,
      urgentFirstReminderMs: 10_000,
      replanGraceMs: 1_000,
    };
    expect(planEmailReminder(email('urgent'), null, 1_000, timing)?.at).toBe(11_000);
    expect(planEmailReminder(email('review'), null, 1_000, timing)?.at).toBe(
      1_000 + REVIEW_FIRST_REMINDER_MS,
    );
  });

  it('does not remind for low-confidence, low-priority, or no-reply mail', () => {
    expect(planEmailReminder(email('low'), null, 1_000)).toBeNull();
    expect(planEmailReminder(email('urgent', false), null, 1_000)).toBeNull();
    const uncertain = email('urgent');
    expect(
      planEmailReminder(
        { ...uncertain, priority: { ...uncertain.priority!, confidence: 0.5 } },
        null,
        1_000,
      ),
    ).toBeNull();
  });

  it('preserves snoozes and never resurrects dismissed or replied messages', () => {
    expect(
      planEmailReminder(
        email(),
        reminder({ snoozedUntil: 999_000, nextReminderAt: 500_000 }),
        2_000,
      )?.at,
    ).toBe(999_000);
    expect(planEmailReminder(email(), reminder({ state: 'dismissed' }), 2_000)).toBeNull();
    expect(planEmailReminder(email(), reminder({ state: 'replied' }), 2_000)).toBeNull();
  });

  it('re-plans pending reminders when the user changes timing', () => {
    const timing = {
      ...DEFAULT_EMAIL_REMINDER_TIMING,
      urgentFirstReminderMs: 30_000,
    };
    expect(
      planEmailReminder(email(), reminder({ nextReminderAt: 500_000 }), 2_000, timing)?.at,
    ).toBe(31_000);
  });

  it('stops after the conservative reminder cap', () => {
    expect(planEmailReminder(email('urgent'), reminder({ reminderCount: 2 }), 2_000)).toBeNull();
    expect(planEmailReminder(email('review'), reminder({ reminderCount: 1 }), 2_000)).toBeNull();
  });
});

describe('emailReminderEventPriority', () => {
  it('lets truly urgent mail pass quiet-hours policy while review mail remains governed', () => {
    expect(emailReminderEventPriority('urgent')).toBe('urgent');
    expect(emailReminderEventPriority('review')).toBe('high');
  });
});

describe('afterEmailReminderFired', () => {
  it('schedules one urgent follow-up and no review follow-up', () => {
    const urgent = afterEmailReminderFired(reminder(), 'urgent', 10_000);
    expect(urgent.reminderCount).toBe(1);
    expect(urgent.nextReminderAt).not.toBeNull();

    const review = afterEmailReminderFired(reminder(), 'review', 10_000);
    expect(review.reminderCount).toBe(1);
    expect(review.nextReminderAt).toBeNull();
  });

  it('supports a custom follow-up delay and disabling follow-ups', () => {
    const custom = {
      ...DEFAULT_EMAIL_REMINDER_TIMING,
      urgentFollowUpMs: 30_000,
    };
    expect(afterEmailReminderFired(reminder(), 'urgent', 10_000, custom).nextReminderAt).toBe(
      40_000,
    );

    const disabled = { ...custom, urgentFollowUpMs: 0 };
    expect(
      afterEmailReminderFired(reminder(), 'urgent', 10_000, disabled).nextReminderAt,
    ).toBeNull();
    expect(
      planEmailReminder(email('urgent'), reminder({ reminderCount: 1 }), 2_000, disabled),
    ).toBeNull();
  });
});
