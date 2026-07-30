import type { EmailCategory } from './categories.js';

export type EmailPriorityTier = 'urgent' | 'review' | 'low';
export type EmailPrioritySource = 'rules' | 'llm' | 'blended';
export type EmailReplyState = 'not-required' | 'pending' | 'draft-ready' | 'replied' | 'dismissed';
export type EmailDraftStatus = 'none' | 'queued' | 'generating' | 'ready' | 'failed';

export interface CachedEmail {
  readonly account: string;
  /** Stable Gmail X-GM-MSGID. Never use the mailbox-scoped UID as a database key. */
  readonly emailId: string;
  /** Stable Gmail X-GM-THRID, shared by messages in the same conversation. */
  readonly threadId: string;
  /** Mailbox-scoped UID, retained only so the current IMAP session can fetch the message. */
  readonly uid: number;
  readonly messageId: string;
  readonly fromName: string;
  readonly fromAddress: string;
  readonly replyToAddress: string;
  readonly toAddresses: readonly string[];
  readonly ccAddresses: readonly string[];
  readonly subject: string;
  readonly receivedAt: number;
  readonly category: EmailCategory;
  readonly labels: readonly string[];
  /** A small, sanitised preview. Complete incoming bodies are not persisted. */
  readonly snippet: string;
  readonly unread: boolean;
  readonly inInbox: boolean;
  readonly syncedAt: number;
}

export interface EmailPriorityResult {
  readonly score: number;
  readonly tier: EmailPriorityTier;
  readonly confidence: number;
  readonly source: EmailPrioritySource;
  readonly signals: readonly string[];
  readonly reason: string;
  readonly replyLikely: boolean;
}

export interface StoredEmailPriority extends EmailPriorityResult {
  readonly account: string;
  readonly emailId: string;
  readonly scorerVersion: number;
  readonly classifiedAt: number;
}

export interface StoredEmailDraft {
  readonly account: string;
  readonly emailId: string;
  readonly status: EmailDraftStatus;
  readonly subject: string | null;
  readonly body: string | null;
  readonly error: string | null;
}

export interface EmailReminderState {
  readonly account: string;
  readonly emailId: string;
  readonly threadId: string;
  readonly state: EmailReplyState;
  readonly nextReminderAt: number | null;
  readonly lastRemindedAt: number | null;
  readonly reminderCount: number;
  readonly snoozedUntil: number | null;
  readonly dismissedAt: number | null;
  readonly repliedAt: number | null;
}

export interface GmailSyncState {
  readonly account: string;
  readonly uidValidity: string | null;
  readonly lastSyncedAt: number;
  readonly lastError: string | null;
}

export interface GmailSyncStatus {
  readonly running: boolean;
  readonly syncing: boolean;
  readonly watching: boolean;
  readonly lastSyncedAt: number | null;
  readonly lastError: string | null;
}

export interface GmailInboxChanged {
  readonly account: string;
  readonly newEmailCount: number;
  readonly status: GmailSyncStatus;
}

export interface CachedEmailQuery {
  readonly category?: EmailCategory;
  readonly sort?: 'priority' | 'recent';
  readonly limit?: number;
  readonly offset?: number;
}

export interface CachedInboxItem extends CachedEmail {
  readonly priority: StoredEmailPriority | null;
  readonly draft: StoredEmailDraft | null;
  readonly reminder: EmailReminderState | null;
}

/**
 * Persistence contract for Gmail metadata and its derived local intelligence.
 *
 * Complete incoming bodies deliberately do not appear in this interface.
 */
export interface EmailStore {
  replaceInboxSnapshot(
    account: string,
    emails: readonly CachedEmail[],
    syncedAt: number,
  ): Promise<void>;
  listCachedEmails(account: string, query?: CachedEmailQuery): Promise<readonly CachedInboxItem[]>;
  getCachedEmail(account: string, emailId: string): Promise<CachedInboxItem | null>;
  saveEmailPriority(priority: StoredEmailPriority): Promise<void>;
  saveEmailDraft(draft: StoredEmailDraft): Promise<void>;
  saveEmailReminder(reminder: EmailReminderState): Promise<void>;
  listPendingEmailReminders(account: string): Promise<readonly EmailReminderState[]>;
  getGmailSyncState(account: string): Promise<GmailSyncState | null>;
  saveGmailSyncState(state: GmailSyncState): Promise<void>;
}
