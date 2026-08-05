import { describe, expect, it } from 'vitest';
import { buildReplyQueue, describeAge, describeTriage, matchesSearch } from './reply-queue.js';
import type { CachedInboxItem } from './email-state.js';

/**
 * The rules here: the list empties, an email appears in exactly one group, and
 * nothing claims a model was involved when none was.
 */

const NOW = new Date(2026, 7, 5, 14, 0, 0).getTime();
const at = (h: number, m = 0): number => new Date(2026, 7, 5, h, m, 0).getTime();

function email(
  emailId: string,
  over: {
    signals?: readonly string[];
    confidence?: number;
    tier?: 'urgent' | 'review' | 'low';
    replyLikely?: boolean;
    receivedAt?: number;
    state?: 'replied' | 'dismissed' | 'pending';
    fromName?: string;
    subject?: string;
    inInbox?: boolean;
  } = {},
): CachedInboxItem {
  return {
    account: 'a@b.com',
    emailId,
    threadId: `t-${emailId}`,
    uid: 1,
    messageId: `m-${emailId}`,
    fromName: over.fromName ?? 'Sarah',
    fromAddress: 'sarah@example.com',
    replyToAddress: 'sarah@example.com',
    toAddresses: [],
    ccAddresses: [],
    subject: over.subject ?? `Subject ${emailId}`,
    receivedAt: over.receivedAt ?? at(12),
    category: 'primary',
    labels: [],
    snippet: '',
    unread: true,
    inInbox: over.inInbox ?? true,
    syncedAt: NOW,
    priority: {
      account: 'a@b.com',
      emailId,
      score: 0.8,
      tier: over.tier ?? 'urgent',
      confidence: over.confidence ?? 0.9,
      source: 'rules',
      signals: over.signals ?? ['direct_recipient'],
      reason: 'asks for confirmation',
      replyLikely: over.replyLikely ?? true,
      scorerVersion: 1,
      classifiedAt: at(12),
    },
    draft: null,
    reminder:
      over.state === undefined
        ? null
        : ({
            account: 'a@b.com',
            emailId,
            threadId: `t-${emailId}`,
            state: over.state,
            nextReminderAt: null,
            lastRemindedAt: null,
            reminderCount: 0,
            snoozedUntil: null,
            dismissedAt: null,
            repliedAt: null,
          } as CachedInboxItem['reminder']),
  } as CachedInboxItem;
}

const groupIds = (q: ReturnType<typeof buildReplyQueue>): string[] => q.groups.map((g) => g.id);

describe('grouping by what the mail wants', () => {
  it('sorts each signal into its own group', () => {
    const queue = buildReplyQueue(
      [
        email('d', { signals: ['deadline'] }),
        email('a', { signals: ['action_requested'] }),
        email('q', { signals: ['question'] }),
        email('t', { signals: ['active_conversation'] }),
      ],
      NOW,
    );

    expect(groupIds(queue)).toEqual(['deadline', 'action', 'question', 'thread']);
    expect(queue.total).toBe(4);
  });

  it('puts an email in exactly one group, highest precedence wins', () => {
    // A mail with a deadline AND a question must not be answered twice.
    const queue = buildReplyQueue(
      [email('both', { signals: ['question', 'deadline', 'action_requested'] })],
      NOW,
    );

    expect(groupIds(queue)).toEqual(['deadline']);
    expect(queue.total).toBe(1);
  });

  it('falls back to Other when no shaping signal is present', () => {
    const queue = buildReplyQueue([email('x', { signals: ['vip_sender'] })], NOW);

    expect(groupIds(queue)).toEqual(['other']);
  });

  it('drops empty groups rather than printing bare headings', () => {
    const queue = buildReplyQueue([email('d', { signals: ['deadline'] })], NOW);

    expect(queue.groups).toHaveLength(1);
  });

  it('puts the longest-waiting first inside a group', () => {
    const queue = buildReplyQueue(
      [
        email('recent', { signals: ['deadline'], receivedAt: at(13) }),
        email('old', { signals: ['deadline'], receivedAt: at(9) }),
      ],
      NOW,
    );

    expect(queue.groups[0]?.items.map((i) => i.emailId)).toEqual(['old', 'recent']);
  });
});

describe('what leaves the list', () => {
  it('drops a thread already replied to', () => {
    const queue = buildReplyQueue([email('done', { state: 'replied' })], NOW);
    expect(queue.total).toBe(0);
    expect(queue.groups).toEqual([]);
  });

  it('drops one the user waved away', () => {
    const queue = buildReplyQueue([email('gone', { state: 'dismissed' })], NOW);
    expect(queue.total).toBe(0);
  });

  it('reaches zero, which is the whole point', () => {
    const queue = buildReplyQueue([], NOW);
    expect(queue.total).toBe(0);
    expect(queue.unsure).toEqual([]);
  });
});

describe('the unsure group', () => {
  it('collects ones the classifier suspected but was not sure about', () => {
    // Invisible before this: needsReplyReminder requires 0.75, so a half-suspected
    // email appeared nowhere at all.
    const queue = buildReplyQueue([email('maybe', { confidence: 0.5, tier: 'review' })], NOW);

    expect(queue.total).toBe(0);
    expect(queue.unsure.map((i) => i.emailId)).toEqual(['maybe']);
  });

  it('never lists the same email as both confident and unsure', () => {
    const queue = buildReplyQueue([email('sure', { confidence: 0.95 })], NOW);

    expect(queue.total).toBe(1);
    expect(queue.unsure).toEqual([]);
  });

  it('leaves out low-tier guesses', () => {
    // A low-confidence guess about a low-priority mail is not worth asking about.
    const queue = buildReplyQueue([email('meh', { confidence: 0.5, tier: 'low' })], NOW);

    expect(queue.unsure).toEqual([]);
  });

  it('leaves out ones the classifier thinks need no reply', () => {
    const queue = buildReplyQueue(
      [email('fyi', { confidence: 0.5, tier: 'review', replyLikely: false })],
      NOW,
    );

    expect(queue.unsure).toEqual([]);
  });

  it('leaves out archived mail', () => {
    const queue = buildReplyQueue(
      [email('archived', { confidence: 0.5, tier: 'review', inInbox: false })],
      NOW,
    );

    expect(queue.unsure).toEqual([]);
  });
});

describe('rows', () => {
  it('renders signals as readable labels', () => {
    const queue = buildReplyQueue([email('x', { signals: ['deadline', 'direct_recipient'] })], NOW);

    expect(queue.groups[0]?.items[0]?.signals).toEqual([
      'time-sensitive language',
      'sent directly to you',
    ]);
  });

  it('hides negative signals, which say nothing on a row already in the list', () => {
    const queue = buildReplyQueue(
      [email('x', { signals: ['deadline', 'bulk_sender', 'automated_sender'] })],
      NOW,
    );

    expect(queue.groups[0]?.items[0]?.signals).toEqual(['time-sensitive language']);
  });

  it('names the model check as a signal of its own', () => {
    const queue = buildReplyQueue([email('x', { signals: ['deadline', 'llm_refined'] })], NOW);
    const item = queue.groups[0]?.items[0];

    expect(item?.signals).toContain('checked by the model');
    expect(item?.modelChecked).toBe(true);
  });

  it('is late only after a day', () => {
    const fresh = buildReplyQueue([email('a', { receivedAt: at(12) })], NOW);
    const stale = buildReplyQueue([email('b', { receivedAt: at(12) - 2 * 86_400_000 })], NOW);

    expect(fresh.groups[0]?.items[0]?.late).toBe(false);
    expect(stale.groups[0]?.items[0]?.late).toBe(true);
  });

  it('falls back to the address when there is no display name', () => {
    const queue = buildReplyQueue([email('x', { fromName: '  ' })], NOW);

    expect(queue.groups[0]?.items[0]?.who).toBe('sarah@example.com');
  });

  it('does not render an empty subject as nothing', () => {
    const queue = buildReplyQueue([email('x', { subject: '   ' })], NOW);

    expect(queue.groups[0]?.items[0]?.subject).toBe('(no subject)');
  });
});

describe('describeTriage', () => {
  it('says nothing when there is nothing to say', () => {
    expect(describeTriage(buildReplyQueue([], NOW), true)).toBe('');
  });

  it('never implies a model was involved when none is configured', () => {
    const queue = buildReplyQueue([email('x')], NOW);

    const text = describeTriage(queue, false);
    expect(text).toContain('Sorted by rules');
    expect(text).not.toContain('double-checked');
  });

  it('says so plainly when the model was configured but not needed', () => {
    // The list is complete either way; silence here reads as something missing.
    const queue = buildReplyQueue([email('x')], NOW);

    expect(describeTriage(queue, true)).toContain('none were borderline');
  });

  it('counts how many the model actually looked at', () => {
    const queue = buildReplyQueue(
      [email('a', { signals: ['deadline', 'llm_refined'] }), email('b', { signals: ['deadline'] })],
      NOW,
    );

    expect(describeTriage(queue, true)).toBe('2 sorted by rules, 1 double-checked by the model.');
  });
});

describe('describeAge', () => {
  it('rounds coarsely', () => {
    expect(describeAge(NOW, NOW)).toBe('just now');
    expect(describeAge(NOW - 5 * 60_000, NOW)).toBe('5 min ago');
    expect(describeAge(NOW - 60 * 60_000, NOW)).toBe('1 hour ago');
    expect(describeAge(NOW - 3 * 60 * 60_000, NOW)).toBe('3 hours ago');
    expect(describeAge(NOW - 26 * 60 * 60_000, NOW)).toBe('1 day ago');
  });

  it('treats a future timestamp as now rather than negative', () => {
    // Clock skew between the mail server and this machine is normal.
    expect(describeAge(NOW + 60_000, NOW)).toBe('just now');
  });
});

describe('searching what is cached', () => {
  const mail = email('e1', { subject: 'Q3 invoice question', fromName: 'Priya Nair' });

  it('matches the subject', () => {
    expect(matchesSearch(mail, 'invoice')).toBe(true);
  });

  it('matches the sender name and address', () => {
    expect(matchesSearch(mail, 'priya')).toBe(true);
    expect(matchesSearch(mail, 'sarah@example.com')).toBe(true);
  });

  it('ignores case and surrounding space', () => {
    expect(matchesSearch(mail, '  INVOICE  ')).toBe(true);
  });

  it('narrows on every word rather than widening', () => {
    // "priya invoice" should mean both, or two words would return more than one.
    expect(matchesSearch(mail, 'priya invoice')).toBe(true);
    expect(matchesSearch(mail, 'priya mortgage')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matchesSearch(mail, '')).toBe(true);
    expect(matchesSearch(mail, '   ')).toBe(true);
  });

  it('does not match the snippet', () => {
    // Matching a body fragment the row does not show produces results that look
    // like mistakes.
    const withBody = email('e2', { subject: 'Hello' });
    expect(matchesSearch({ ...withBody, snippet: 'quarterly numbers' }, 'quarterly')).toBe(false);
  });
});
