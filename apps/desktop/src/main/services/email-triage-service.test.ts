import { describe, expect, it, vi } from 'vitest';
import type {
  CachedInboxItem,
  EmailStore,
  StoredEmailPriority,
  LlmPriorityDecision,
} from '@mochi/core';
import { EMAIL_SCORER_VERSION } from '@mochi/core';
import { EmailTriageService } from './email-triage-service.js';
import type { SettingsStore } from '../storage/settings-store.js';
import type { GmailImapService } from './gmail-imap.js';
import type { LlmClient } from './llm-client.js';
import type { GmailCredentials } from '../storage/gmail-vault.js';

/**
 * The bug: escalation candidates were drawn from `pending` — emails with no
 * priority or an outdated one — and the rules pass had just given all of them a
 * current-version priority. Anything past `slice(0, 10)` therefore fell out of
 * `pending` for ever and was never escalated. Silently.
 *
 * And the bug the naive fix creates: a model answer below the confidence bar is
 * discarded, so the record stays `source: 'rules'` and a candidate list built on
 * "ambiguous and not yet blended" asks about the same undecidable email on every
 * single sync.
 *
 * Both directions are covered here, because fixing one by causing the other is
 * not a fix.
 */

const ACCOUNT = 'me@example.com';

/**
 * An email the rules scorer will find ambiguous.
 *
 * `shouldEscalatePriority` fires on confidence < 0.75, and a plain subject with
 * no signals scores low-confidence — so these escalate without needing to fake a
 * stored priority.
 */
function email(emailId: string, subject = 'Quick one'): CachedInboxItem {
  return {
    account: ACCOUNT,
    emailId,
    threadId: `t-${emailId}`,
    uid: Number(emailId.replace(/\D/g, '')) || 1,
    messageId: `m-${emailId}`,
    fromName: 'Sarah',
    fromAddress: 'sarah@example.com',
    replyToAddress: 'sarah@example.com',
    toAddresses: [],
    ccAddresses: [],
    subject,
    receivedAt: Date.now() - 3_600_000,
    category: 'primary',
    labels: [],
    snippet: 'hello',
    unread: true,
    inInbox: true,
    syncedAt: Date.now(),
    priority: null,
    draft: null,
    reminder: null,
  } as CachedInboxItem;
}

/** Records saved priorities and feeds them back, the way the real store does. */
class FakeStore implements Partial<EmailStore> {
  readonly saved: StoredEmailPriority[] = [];
  constructor(private inbox: readonly CachedInboxItem[]) {}

  listCachedEmails = async (): Promise<readonly CachedInboxItem[]> => this.inbox;

  saveEmailPriority = async (priority: StoredEmailPriority): Promise<void> => {
    this.saved.push(priority);
    this.inbox = this.inbox.map((e) => (e.emailId === priority.emailId ? { ...e, priority } : e));
  };

  /** What a later pass would read. */
  get current(): readonly CachedInboxItem[] {
    return this.inbox;
  }

  latestFor(emailId: string): StoredEmailPriority | undefined {
    return [...this.saved].reverse().find((p) => p.emailId === emailId);
  }
}

const settingsStub = {
  get: () => ({ gmailAi: { priorityEnabled: true, vipSenders: [] } }),
} as unknown as SettingsStore;

const imapStub = {
  fetchMessage: async () => ({ bodyText: 'body text' }),
} as unknown as GmailImapService;

const CREDENTIALS = { user: ACCOUNT, pass: 'x' } as unknown as GmailCredentials;

interface LlmCall {
  readonly prompt: string;
}

/** An LLM that answers with the given decisions, and records what it was asked. */
function fakeLlm(
  replies: (asked: readonly string[]) => readonly LlmPriorityDecision[] | { fail: string },
): { client: LlmClient; calls: LlmCall[] } {
  const calls: LlmCall[] = [];
  const client = {
    generate: async (req: { prompt: string }) => {
      calls.push({ prompt: req.prompt });
      // The prompt carries the ids it is asking about.
      const asked = [...req.prompt.matchAll(/e\d+/g)].map((m) => m[0]);
      const answer = replies([...new Set(asked)]);
      if ('fail' in answer) return { ok: false as const, reason: answer.fail };
      // The parser requires {"results":[...]} — a bare array is ignored.
      return { ok: true as const, text: JSON.stringify({ results: answer }) };
    },
  } as unknown as LlmClient;
  return { client, calls };
}

function service(store: FakeStore, llm: LlmClient, credentials = CREDENTIALS): EmailTriageService {
  return new EmailTriageService(
    llm,
    imapStub,
    store as unknown as EmailStore,
    settingsStub,
    () => credentials,
  );
}

const decision = (id: string, over: Partial<LlmPriorityDecision> = {}): LlmPriorityDecision =>
  ({
    id,
    priority: 'high',
    replyLikely: true,
    confidence: 0.9,
    reason: 'asks a direct question',
    ...over,
  }) as LlmPriorityDecision;

describe('the escalation cap is a throttle, not a cliff', () => {
  it('escalates the overflow on the next pass', async () => {
    // 14 ambiguous emails, batch limit 10. Before the fix the last 4 were never
    // escalated again, because the rules pass had already made them non-pending.
    const ids = Array.from({ length: 14 }, (_, i) => `e${i + 1}`);
    const store = new FakeStore(ids.map((id) => email(id)));
    const { client, calls } = fakeLlm((asked) => asked.map((id) => decision(id)));
    const svc = service(store, client);

    await svc.classifyInbox(ACCOUNT);
    const firstPass = [...new Set([...calls[0]!.prompt.matchAll(/e\d+/g)].map((m) => m[0]))];
    expect(firstPass).toHaveLength(10);

    await svc.classifyInbox(ACCOUNT);
    expect(calls).toHaveLength(2);
    const secondPass = [...new Set([...calls[1]!.prompt.matchAll(/e\d+/g)].map((m) => m[0]))];
    expect(secondPass).toHaveLength(4);

    // Every one of the 14 has now been seen by the model exactly once.
    expect(new Set([...firstPass, ...secondPass]).size).toBe(14);
  });

  it('stops once everything has been asked about', async () => {
    const store = new FakeStore([email('e1'), email('e2')]);
    const { client, calls } = fakeLlm((asked) => asked.map((id) => decision(id)));
    const svc = service(store, client);

    await svc.classifyInbox(ACCOUNT);
    await svc.classifyInbox(ACCOUNT);
    await svc.classifyInbox(ACCOUNT);

    expect(calls).toHaveLength(1);
  });

  it('asks about the highest-scoring ambiguous ones first', async () => {
    // When the batch is full the second opinion should go to the emails most
    // likely to matter, not to whatever order the inbox happened to arrive in.
    //
    // Scores are seeded rather than inferred from subject text: an email with a
    // current-version priority is not rescored, so these survive the rules pass
    // and the ordering is tested against known inputs instead of a guess about
    // what the scorer would produce.
    const seeded = (id: string, score: number): CachedInboxItem => ({
      ...email(id),
      priority: {
        account: ACCOUNT,
        emailId: id,
        score,
        tier: 'review',
        // Under 0.75, so shouldEscalatePriority fires on every one of them.
        confidence: 0.5,
        source: 'rules',
        signals: [],
        reason: 'seeded',
        replyLikely: true,
        scorerVersion: EMAIL_SCORER_VERSION,
        classifiedAt: Date.now(),
      },
    });

    // Eleven candidates for ten slots; the weakest must be the one left over.
    const store = new FakeStore([
      seeded('e1', 0.1),
      ...Array.from({ length: 10 }, (_, i) => seeded(`e${i + 20}`, 0.5 + i * 0.01)),
    ]);
    const { client, calls } = fakeLlm((asked) => asked.map((id) => decision(id)));

    await service(store, client).classifyInbox(ACCOUNT);

    const asked = [...new Set([...calls[0]!.prompt.matchAll(/e\d+/g)].map((m) => m[0]))];
    expect(asked).toHaveLength(10);
    expect(asked).not.toContain('e1');
  });
});

describe('an email the model could not decide is not asked again', () => {
  it('marks a low-confidence answer as asked', async () => {
    const store = new FakeStore([email('e1')]);
    const { client, calls } = fakeLlm((asked) =>
      asked.map((id) => decision(id, { confidence: 0.4 })),
    );
    const svc = service(store, client);

    await svc.classifyInbox(ACCOUNT);
    await svc.classifyInbox(ACCOUNT);

    expect(calls).toHaveLength(1);
    expect(store.latestFor('e1')?.signals).toContain('llm_declined');
  });

  it('leaves the rules verdict standing when the answer is discarded', async () => {
    const store = new FakeStore([email('e1')]);
    const { client } = fakeLlm((asked) => asked.map((id) => decision(id, { confidence: 0.4 })));

    await service(store, client).classifyInbox(ACCOUNT);

    // Marked as asked, but never blended — the model did not earn a say.
    expect(store.latestFor('e1')?.source).toBe('rules');
  });

  it('marks one the model simply omitted', async () => {
    // A model that returns fewer items than it was given answers nothing about
    // the rest; without a marker those would be re-asked for ever.
    const store = new FakeStore([email('e1'), email('e2')]);
    const { client, calls } = fakeLlm(() => [decision('e1')]);
    const svc = service(store, client);

    await svc.classifyInbox(ACCOUNT);
    await svc.classifyInbox(ACCOUNT);

    expect(calls).toHaveLength(1);
    expect(store.latestFor('e2')?.signals).toContain('llm_declined');
  });

  it('applies a confident answer as blended', async () => {
    const store = new FakeStore([email('e1')]);
    const { client } = fakeLlm((asked) => asked.map((id) => decision(id)));

    await service(store, client).classifyInbox(ACCOUNT);

    const saved = store.latestFor('e1');
    expect(saved?.source).toBe('blended');
    expect(saved?.signals).toContain('llm_refined');
    expect(saved?.signals).not.toContain('llm_declined');
  });
});

describe('a failed call is not an answer', () => {
  it('retries next pass rather than writing the batch off', async () => {
    // Marking a network blip as "asked" would silently exclude those emails
    // permanently — the exact failure this whole change exists to fix.
    const store = new FakeStore([email('e1')]);
    let attempt = 0;
    const { client, calls } = fakeLlm((asked) => {
      attempt += 1;
      if (attempt === 1) return { fail: 'no route available' };
      return asked.map((id) => decision(id));
    });
    const svc = service(store, client);

    await svc.classifyInbox(ACCOUNT);
    expect(store.latestFor('e1')?.signals).not.toContain('llm_declined');

    await svc.classifyInbox(ACCOUNT);
    expect(calls).toHaveLength(2);
    expect(store.latestFor('e1')?.source).toBe('blended');
  });
});

describe('without a model', () => {
  it('still scores everything by rules', async () => {
    const store = new FakeStore([email('e1'), email('e2')]);
    const llm = { generate: vi.fn() } as unknown as LlmClient;

    await new EmailTriageService(
      llm,
      imapStub,
      store as unknown as EmailStore,
      settingsStub,
      () => null,
    ).classifyInbox(ACCOUNT);

    expect(store.saved).toHaveLength(2);
    expect(store.saved.every((p) => p.source === 'rules')).toBe(true);
    expect(llm.generate).not.toHaveBeenCalled();
  });
});

describe('force', () => {
  it('re-asks even about emails already marked', async () => {
    const store = new FakeStore([email('e1')]);
    const { client, calls } = fakeLlm((asked) =>
      asked.map((id) => decision(id, { confidence: 0.4 })),
    );
    const svc = service(store, client);

    await svc.classifyInbox(ACCOUNT);
    await svc.classifyInbox(ACCOUNT, true);

    expect(calls).toHaveLength(2);
  });
});
