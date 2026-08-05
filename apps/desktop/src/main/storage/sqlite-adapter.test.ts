import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import type { CachedEmail } from '@mochi/core';
import { SqliteStorageAdapter } from './sqlite-adapter.js';
import type { SensitiveValueCodec } from './sensitive-value-codec.js';

const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');

class TestCodec implements SensitiveValueCodec {
  private readonly prefix = 'test:protected:';

  isProtected(value: string): boolean {
    return value.startsWith(this.prefix);
  }

  protect(value: string): string {
    return this.isProtected(value)
      ? value
      : `${this.prefix}${Buffer.from(value, 'utf8').toString('base64')}`;
  }

  reveal(value: string): string {
    return this.isProtected(value)
      ? Buffer.from(value.slice(this.prefix.length), 'base64').toString('utf8')
      : value;
  }
}

const createdDirectories: string[] = [];

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mochi-sqlite-security-'));
  createdDirectories.push(directory);
  return join(directory, 'mochi.db');
}

function email(account = 'owner@example.com'): CachedEmail {
  return {
    account,
    emailId: 'gmail-message-42',
    threadId: 'private-thread-id',
    uid: 42,
    messageId: '<private-message@example.com>',
    fromName: 'Sensitive Sender',
    fromAddress: 'sender@example.com',
    replyToAddress: 'reply@example.com',
    toAddresses: [account],
    ccAddresses: ['private-cc@example.com'],
    subject: 'SUPER SECRET SUBJECT',
    receivedAt: 1_000,
    category: 'primary',
    labels: ['INBOX', 'IMPORTANT'],
    snippet: 'CONFIDENTIAL EMAIL PREVIEW',
    unread: true,
    inInbox: true,
    syncedAt: 2_000,
  };
}

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SqliteStorageAdapter sensitive email persistence', () => {
  it('protects message payloads and reveals them only through the adapter', async () => {
    const path = databasePath();
    const codec = new TestCodec();
    const store = new SqliteStorageAdapter(path, codec);
    const incoming = email();

    await store.replaceInboxSnapshot(incoming.account, [incoming], 2_000);
    await store.saveEmailPriority({
      account: incoming.account,
      emailId: incoming.emailId,
      score: 0.91,
      tier: 'urgent',
      confidence: 0.95,
      source: 'rules',
      signals: ['private signal'],
      reason: 'PRIVATE PRIORITY REASON',
      replyLikely: true,
      scorerVersion: 1,
      classifiedAt: 2_100,
    });
    await store.saveEmailDraft({
      account: incoming.account,
      emailId: incoming.emailId,
      status: 'ready',
      subject: 'PRIVATE DRAFT SUBJECT',
      body: 'PRIVATE DRAFT BODY',
      error: null,
    });
    await store.saveEmailReminder({
      account: incoming.account,
      emailId: incoming.emailId,
      threadId: incoming.threadId,
      state: 'draft-ready',
      nextReminderAt: 3_000,
      lastRemindedAt: null,
      reminderCount: 0,
      snoozedUntil: null,
      dismissedAt: null,
      repliedAt: null,
    });
    await store.saveGmailSyncState({
      account: incoming.account,
      uidValidity: 'PRIVATE UID VALIDITY',
      lastSyncedAt: 2_000,
      lastError: 'PRIVATE SYNC ERROR',
    });

    const visible = await store.getCachedEmail(incoming.account, incoming.emailId);
    expect(visible).toMatchObject({
      subject: incoming.subject,
      snippet: incoming.snippet,
      fromAddress: incoming.fromAddress,
      threadId: incoming.threadId,
    });
    expect(visible?.priority?.reason).toBe('PRIVATE PRIORITY REASON');
    expect(visible?.draft?.body).toBe('PRIVATE DRAFT BODY');
    expect((await store.getGmailSyncState(incoming.account))?.lastError).toBe('PRIVATE SYNC ERROR');
    await store.close();

    const raw = new DatabaseSync(path);
    const stored = JSON.stringify({
      email: raw.prepare('SELECT * FROM email_cache').get(),
      ai: raw.prepare('SELECT * FROM email_ai_state').get(),
      reminder: raw.prepare('SELECT * FROM email_reminders').get(),
      sync: raw.prepare('SELECT * FROM gmail_sync_state').get(),
    });
    raw.close();

    for (const secret of [
      incoming.subject,
      incoming.snippet,
      incoming.fromAddress,
      incoming.threadId,
      'PRIVATE PRIORITY REASON',
      'PRIVATE DRAFT BODY',
      'PRIVATE SYNC ERROR',
    ]) {
      expect(stored).not.toContain(secret);
    }
    expect(stored).toContain('test:protected:');
  });

  it('migrates legacy plaintext email fields in place without losing them', async () => {
    const path = databasePath();
    const codec = new TestCodec();
    const initial = new SqliteStorageAdapter(path, codec);
    const incoming = email();
    await initial.replaceInboxSnapshot(incoming.account, [incoming], 2_000);
    await initial.close();

    const legacy = new DatabaseSync(path);
    legacy
      .prepare(
        `UPDATE email_cache
         SET subject = ?, snippet = ?, from_address = ?
         WHERE account = ? AND email_id = ?`,
      )
      .run(
        'LEGACY PRIVATE SUBJECT',
        'LEGACY PRIVATE SNIPPET',
        'legacy@example.com',
        incoming.account,
        incoming.emailId,
      );
    legacy.close();

    const migrated = new SqliteStorageAdapter(path, codec);
    const visible = await migrated.getCachedEmail(incoming.account, incoming.emailId);
    expect(visible).toMatchObject({
      subject: 'LEGACY PRIVATE SUBJECT',
      snippet: 'LEGACY PRIVATE SNIPPET',
      fromAddress: 'legacy@example.com',
    });
    await migrated.close();

    const raw = new DatabaseSync(path);
    const row = raw
      .prepare('SELECT subject, snippet, from_address FROM email_cache')
      .get() as Record<string, string>;
    raw.close();
    expect(row['subject']).toMatch(/^test:protected:/);
    expect(row['snippet']).toMatch(/^test:protected:/);
    expect(row['from_address']).toMatch(/^test:protected:/);
  });

  it('deletes expired and account-scoped email rows with derived state', async () => {
    const path = databasePath();
    const store = new SqliteStorageAdapter(path, new TestCodec());
    const old = { ...email(), receivedAt: 100 };
    const recent = { ...email(), emailId: 'recent', receivedAt: 5_000 };
    await store.replaceInboxSnapshot(old.account, [old, recent], 6_000);
    await store.saveEmailDraft({
      account: old.account,
      emailId: old.emailId,
      status: 'ready',
      subject: 'private',
      body: 'private',
      error: null,
    });
    await store.saveGmailSyncState({
      account: old.account,
      uidValidity: '1',
      lastSyncedAt: 6_000,
      lastError: null,
    });

    expect(
      (await store.listCachedEmails(old.account, { limit: 100 })).map((item) => ({
        id: item.emailId,
        receivedAt: item.receivedAt,
      })),
    ).toEqual([
      { id: 'recent', receivedAt: 5_000 },
      { id: old.emailId, receivedAt: 100 },
    ]);
    expect(await store.deleteExpiredEmailData(old.account, 1_000)).toBe(1);
    expect(await store.getCachedEmail(old.account, old.emailId)).toBeNull();
    expect(await store.getCachedEmail(old.account, recent.emailId)).not.toBeNull();

    expect(await store.deleteEmailData(old.account)).toBe(1);
    expect(await store.getCachedEmail(old.account, recent.emailId)).toBeNull();
    expect(await store.getGmailSyncState(old.account)).toBeNull();
    await store.close();
  });
});
