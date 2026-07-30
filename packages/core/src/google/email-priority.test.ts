import { describe, expect, it } from 'vitest';
import type { CachedEmail } from './email-state.js';
import { scoreEmailPriority, shouldEscalatePriority } from './email-priority.js';
import { buildEmailPriorityPrompt, parseEmailPriorityResponse } from './email-priority-prompt.js';

function email(overrides: Partial<CachedEmail> = {}): CachedEmail {
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
    subject: 'Hello',
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

describe('scoreEmailPriority', () => {
  it('promotes direct, important, time-sensitive requests', () => {
    const result = scoreEmailPriority(
      email({
        subject: 'Urgent: can you approve this before Friday?',
        labels: ['\\Inbox', '\\Important'],
      }),
    );
    expect(result.tier).toBe('urgent');
    expect(result.replyLikely).toBe(true);
    expect(result.signals).toContain('deadline');
    expect(result.signals).toContain('action_requested');
  });

  it('does not draft or prioritise automated promotions', () => {
    const result = scoreEmailPriority(
      email({
        fromAddress: 'no-reply@shop.example',
        category: 'promotions',
        subject: 'Urgent sale ends today',
      }),
    );
    expect(result.tier).toBe('low');
    expect(result.replyLikely).toBe(false);
  });

  it('supports user-defined VIP senders without making reply intent automatic', () => {
    const result = scoreEmailPriority(email(), ['alice@example.com']);
    expect(result.tier).toBe('review');
    expect(result.signals).toContain('vip_sender');
    expect(result.replyLikely).toBe(false);
  });

  it('escalates boundary and conflicting results', () => {
    const boundary = scoreEmailPriority(email({ subject: 'Are you available?' }));
    expect(shouldEscalatePriority(boundary)).toBe(true);

    const conflict = scoreEmailPriority(
      email({
        fromAddress: 'no-reply@example.com',
        labels: ['\\Important'],
        subject: 'Action required',
      }),
    );
    expect(shouldEscalatePriority(conflict)).toBe(true);
  });
});

describe('email priority prompt', () => {
  it('limits snippets and labels email content as data', () => {
    const { system, prompt } = buildEmailPriorityPrompt([
      { email: email(), snippet: 'x'.repeat(300) },
    ]);
    expect(system).toContain('untrusted data');
    expect(prompt).toContain('ID: message-1');
    expect(prompt).not.toContain('x'.repeat(151));
  });

  it('parses valid decisions and rejects malformed entries', () => {
    const raw = JSON.stringify({
      results: [
        {
          id: 'message-1',
          priority: 'high',
          replyLikely: true,
          confidence: 0.9,
          reason: 'Direct deadline request',
        },
        {
          id: 'bad',
          priority: 'extreme',
          replyLikely: true,
          confidence: 2,
          reason: 'Bad',
        },
      ],
    });
    expect(parseEmailPriorityResponse(raw)).toEqual([
      {
        id: 'message-1',
        priority: 'high',
        replyLikely: true,
        confidence: 0.9,
        reason: 'Direct deadline request',
      },
    ]);
  });
});
