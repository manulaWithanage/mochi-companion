import { describe, expect, it } from 'vitest';
import type { CachedEmail } from '../google/email-state.js';
import { InMemoryStorageAdapter } from './adapter.js';

function email(overrides: Partial<CachedEmail> = {}): CachedEmail {
  return {
    account: 'me@example.com',
    emailId: 'message-1',
    threadId: 'thread-1',
    uid: 10,
    messageId: '<message-1@example.com>',
    fromName: 'Alice',
    fromAddress: 'alice@example.com',
    replyToAddress: 'alice@example.com',
    toAddresses: ['me@example.com'],
    ccAddresses: [],
    subject: 'Please review this',
    receivedAt: 100,
    category: 'primary',
    labels: ['\\Inbox'],
    snippet: '',
    unread: true,
    inInbox: true,
    syncedAt: 100,
    ...overrides,
  };
}

describe('InMemoryStorageAdapter email cache', () => {
  it('replaces the active inbox without deleting derived state', async () => {
    const store = new InMemoryStorageAdapter();
    const first = email();
    await store.replaceInboxSnapshot(first.account, [first], 100);
    await store.saveEmailPriority({
      account: first.account,
      emailId: first.emailId,
      score: 0.9,
      tier: 'urgent',
      confidence: 0.9,
      source: 'rules',
      signals: ['action_requested'],
      reason: 'Action requested',
      replyLikely: true,
      scorerVersion: 1,
      classifiedAt: 100,
    });

    await store.replaceInboxSnapshot(first.account, [], 200);
    expect(await store.listCachedEmails(first.account)).toEqual([]);
    expect((await store.getCachedEmail(first.account, first.emailId))?.priority?.tier).toBe(
      'urgent',
    );
  });

  it('sorts by priority and then by received time', async () => {
    const store = new InMemoryStorageAdapter();
    const low = email({ emailId: 'low', receivedAt: 200 });
    const urgent = email({ emailId: 'urgent', receivedAt: 100 });
    await store.replaceInboxSnapshot(low.account, [low, urgent], 300);
    await store.saveEmailPriority({
      account: urgent.account,
      emailId: urgent.emailId,
      score: 0.85,
      tier: 'urgent',
      confidence: 0.9,
      source: 'rules',
      signals: [],
      reason: 'Important',
      replyLikely: true,
      scorerVersion: 1,
      classifiedAt: 300,
    });

    const rows = await store.listCachedEmails(low.account, { sort: 'priority' });
    expect(rows.map((row) => row.emailId)).toEqual(['urgent', 'low']);
  });
});
